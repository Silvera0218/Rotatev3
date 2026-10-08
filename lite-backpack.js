globalThis.createRotationBackpack=function({rail,config,game,canOpen,pause,resume,changed}){
  const entry=document.createElement('button');entry.id='v3-backpack-open';entry.type='button';entry.className='insertion-button';entry.setAttribute('aria-haspopup','dialog');entry.setAttribute('aria-controls','v3-backpack');
  entry.innerHTML='<span class="insertion-glyph"><img src="./assets/icons/backpack.svg" width="32" height="32" alt=""></span><b class="insertion-price">0</b><span class="insertion-name">背包</span>';
  rail.append(entry);
  const dialog=document.createElement('dialog');dialog.id='v3-backpack';dialog.setAttribute('aria-labelledby','v3-backpack-title');
  dialog.innerHTML='<header class="backpack-header"><img src="./assets/icons/backpack.svg" width="40" height="40" alt=""><h2 id="v3-backpack-title">道具背包</h2><button class="v3-popup-close" type="button" aria-label="关闭背包" title="关闭"></button><svg viewBox="0 0 600 28" preserveAspectRatio="none" aria-hidden="true"><path fill="#c4ff17" d="M0 5Q150 28 300 12T600 7V28H0Z"/><path fill="#4b68ff" d="M0 18Q150 37 300 23T600 18V28H0Z"/></svg></header><p class="backpack-hint">快捷栏最多3种，用完后按暂存顺序补位</p><div class="backpack-lists"><section><h3>快捷栏 <span id="backpack-active-count"></span></h3><div id="backpack-active"></div></section><section><h3>暂存区 <span id="backpack-reserve-count"></span></h3><div id="backpack-reserve"></div></section></div><p class="backpack-status" role="status" aria-live="polite"></p>';
  document.body.append(dialog);const get=s=>dialog.querySelector(s);
  get('.backpack-hint').textContent='拖动调整顺序 · 快捷栏最多3种';
  const lists=get('.backpack-lists'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let drag=null,dragFrame=0;
  function render(message=''){
    const g=game(),inv=g.liteInventory();get('#backpack-active-count').textContent=inv.active.length+'/3';get('#backpack-reserve-count').textContent=inv.reserve.length+'种';
    for(const [kind,ids] of [['active',inv.active],['reserve',inv.reserve]]){
      const list=get('#backpack-'+kind);list.replaceChildren();
      list.dataset.zone=kind;
      if(!ids.length){const empty=document.createElement('p');empty.className='backpack-empty';empty.textContent=kind==='active'?'还没有道具':'暂无暂存道具';list.append(empty);continue;}
      ids.forEach(id=>{
        const tool=config.tools.find(t=>t.id===id),row=document.createElement('button');row.type='button';row.className='backpack-row';row.dataset.tool=id;
        row.innerHTML='<span class="backpack-art"><img width="32" height="32" alt="" draggable="false"></span><span class="backpack-copy"><strong></strong><small></small></span><span class="backpack-effect-copy"></span><span class="backpack-grip" aria-hidden="true">⠿</span>';
        row.querySelector('img').src='./assets/icons/'+id+'.svg';row.querySelector('strong').textContent=tool.name;row.querySelector('small').textContent='×'+g.lite.tools[id];row.querySelector('.backpack-effect-copy').textContent=tool.description;
        row.setAttribute('aria-label',tool.name+'，数量'+g.lite.tools[id]+'，'+tool.description+'；拖动排序，或按Alt加方向键调整');row.setAttribute('aria-keyshortcuts','Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight');
        row.onkeydown=event=>{if(!event.altKey||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const order=g.liteInventory().order,index=order.indexOf(id),offset=['ArrowUp','ArrowLeft'].includes(event.key)?-1:1;move(id,index+offset);};
        list.append(row);
      });
    }
    get('.backpack-status').textContent=message;
  }
  function move(id,index){
    const before=new Map([...lists.querySelectorAll('[data-tool]')].map(n=>[n.dataset.tool,n.getBoundingClientRect()]));
    if(!game().liteMoveTool(id,index))return;changed();render();
    const tool=config.tools.find(t=>t.id===id),inv=game().liteInventory();get('.backpack-status').textContent=tool.name+'已移至'+(inv.active.includes(id)?'快捷栏':'暂存区');
    for(const node of lists.querySelectorAll('[data-tool]')){const a=before.get(node.dataset.tool),b=node.getBoundingClientRect();if(a&&!reduced.matches)node.animate([{transform:`translate(${a.left-b.left}px,${a.top-b.top}px)`},{transform:'translate(0,0)'}],{duration:180,easing:'ease-out'});}
    get(`[data-tool="${id}"]`)?.focus({preventScroll:true});
  }
  function targetAt(x,y){
    const hit=document.elementFromPoint(x,y),tile=hit?.closest('.backpack-row'),zone=hit?.closest('[data-zone]');
    if(!hit||!lists.contains(hit))return null;
    if(tile)return {node:tile,index:game().liteInventory().order.indexOf(tile.dataset.tool)};
    if(zone){const inv=game().liteInventory();return {node:zone,index:zone.dataset.zone==='active'?Math.min(2,inv.order.length-1):inv.order.length-1};}
    return null;
  }
  function updateDrag(){
    if(!drag?.active)return;
    drag.ghost.style.left=drag.x-drag.offsetX+'px';drag.ghost.style.top=drag.y-drag.offsetY+'px';
    const target=targetAt(drag.x,drag.y);dialog.querySelectorAll('.backpack-drop-target').forEach(n=>n.classList.remove('backpack-drop-target'));target?.node.classList.add('backpack-drop-target');drag.target=target;
  }
  function autoScroll(){
    if(!drag?.active)return;const r=lists.getBoundingClientRect();
    if(drag.x>=r.left&&drag.x<=r.right){if(drag.y<r.top+32)lists.scrollTop-=7;else if(drag.y>r.bottom-32)lists.scrollTop+=7;}
    updateDrag();dragFrame=requestAnimationFrame(autoScroll);
  }
  lists.addEventListener('pointerdown',event=>{
    const row=event.target.closest('[data-tool]');if(!row||event.button!==0||drag)return;
    const rect=row.getBoundingClientRect();drag={id:row.dataset.tool,row,pointer:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,offsetX:event.clientX-rect.left,offsetY:event.clientY-rect.top,rect,active:false};
    lists.setPointerCapture(event.pointerId);
  });
  lists.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointer)return;drag.x=event.clientX;drag.y=event.clientY;
    if(!drag.active&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)<8)return;
    event.preventDefault();
    if(!drag.active){drag.active=true;drag.row.classList.add('is-dragging');const ghost=drag.row.cloneNode(true);ghost.removeAttribute('data-tool');ghost.removeAttribute('aria-describedby');ghost.className='backpack-row backpack-drag-ghost';ghost.setAttribute('aria-hidden','true');ghost.tabIndex=-1;ghost.style.width=drag.rect.width+'px';ghost.style.height=drag.rect.height+'px';dialog.append(ghost);drag.ghost=ghost;dialog.dataset.dragging='true';autoScroll();}
    updateDrag();
  });
  function finishDrag(commit){
    if(!drag)return;const state=drag;drag=null;cancelAnimationFrame(dragFrame);state.ghost?.remove();state.row.classList.remove('is-dragging');delete dialog.dataset.dragging;dialog.querySelectorAll('.backpack-drop-target').forEach(n=>n.classList.remove('backpack-drop-target'));
    if(lists.hasPointerCapture(state.pointer))lists.releasePointerCapture(state.pointer);
    if(state.active&&commit&&state.target)move(state.id,state.target.index);
  }
  lists.addEventListener('pointerup',()=>finishDrag(true));lists.addEventListener('pointercancel',()=>finishDrag(false));lists.addEventListener('lostpointercapture',()=>finishDrag(false));
  window.addEventListener('resize',()=>finishDrag(false));
  dialog.addEventListener('cancel',event=>{if(drag?.active){event.preventDefault();finishDrag(false);}});
  let priorPause=false;
  entry.onclick=()=>{if(!canOpen())return;priorPause=pause();render();dialog.showModal();get('.v3-popup-close').focus({preventScroll:true});};
  get('.v3-popup-close').onclick=()=>dialog.close();dialog.addEventListener('keydown',event=>event.stopPropagation());
  dialog.addEventListener('close',()=>{finishDrag(false);resume(priorPause);entry.focus({preventScroll:true});});
  installRotationPopupMotion(dialog);
  return {entry,dialog};
};
