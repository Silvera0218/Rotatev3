globalThis.createRotationBackpack=function({rail,config,game,canOpen,pause,resume,changed}){
  const entry=document.createElement('button');entry.id='v3-backpack-open';entry.type='button';entry.className='insertion-button';entry.setAttribute('aria-haspopup','dialog');entry.setAttribute('aria-controls','v3-backpack');
  entry.innerHTML='<span class="insertion-glyph"><img src="./assets/icons/backpack.svg" width="32" height="32" alt=""></span><b class="insertion-price">0</b><span class="insertion-name">背包</span>';
  rail.append(entry);
  const dialog=document.createElement('dialog');dialog.id='v3-backpack';dialog.setAttribute('aria-labelledby','v3-backpack-title');
  dialog.innerHTML='<header class="backpack-header"><img src="./assets/icons/backpack.svg" width="40" height="40" alt=""><h2 id="v3-backpack-title">道具背包</h2><button class="v3-popup-close" type="button" aria-label="关闭背包" title="关闭"></button><svg viewBox="0 0 600 28" preserveAspectRatio="none" aria-hidden="true"><path fill="#c4ff17" d="M0 5Q150 28 300 12T600 7V28H0Z"/><path fill="#4b68ff" d="M0 18Q150 37 300 23T600 18V28H0Z"/></svg></header><p class="backpack-hint">快捷栏最多3种，用完后按暂存顺序补位</p><div class="backpack-lists"><section><h3>快捷栏 <span id="backpack-active-count"></span></h3><div id="backpack-active"></div></section><section><h3>暂存区 <span id="backpack-reserve-count"></span></h3><div id="backpack-reserve"></div></section></div><p class="backpack-status" role="status" aria-live="polite"></p>';
  document.body.append(dialog);const get=s=>dialog.querySelector(s);
  get('.backpack-hint').textContent='拖动道具自由替换 · 快捷栏最多3种';
  const lists=get('.backpack-lists'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let drag=null,dragFrame=0,selectedId=null;
  function render(message=''){
    const g=game(),inv=g.liteInventory();get('#backpack-active-count').textContent=inv.active.length+'/3';get('#backpack-reserve-count').textContent=inv.reserve.length+'种';
    for(const [kind,ids] of [['active',inv.active],['reserve',inv.reserve]]){
      const list=get('#backpack-'+kind);list.replaceChildren();
      list.dataset.zone=kind;
      if(!ids.length){const empty=document.createElement('p');empty.className='backpack-empty';empty.textContent=kind==='active'?'还没有道具':'暂无暂存道具';list.append(empty);continue;}
      ids.forEach(id=>{
        const tool=config.tools.find(t=>t.id===id),row=document.createElement('button');row.type='button';row.className='backpack-row';row.dataset.tool=id;row.dataset.zone=kind;
        if(selectedId===id)row.classList.add('is-selected');
        row.innerHTML='<span class="backpack-art"><img width="32" height="32" alt="" draggable="false"></span><span class="backpack-copy"><strong></strong><small></small></span><span class="backpack-effect-copy"></span><span class="backpack-grip" aria-hidden="true">⠿</span>';
        row.querySelector('img').src='./assets/icons/'+(id==='shovel'?'spread':id)+(id==='shovel'?'.png':'.svg');row.querySelector('strong').textContent=tool.name;row.querySelector('small').textContent='×'+g.lite.tools[id];row.querySelector('.backpack-effect-copy').textContent=tool.description;
        row.setAttribute('aria-label',tool.name+'，数量'+g.lite.tools[id]+'，'+tool.description+'；可拖动替换，或点击选两个道具互换，或按Alt加方向键调整');row.setAttribute('aria-keyshortcuts','Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight');
        row.onclick=()=>{
          if(drag?.active)return;
          if(!selectedId){
            selectedId=id;
            render('已选中「'+tool.name+'」，点击另一个道具直接替换，或拖动替换');
          }else if(selectedId===id){
            selectedId=null;
            render('已取消选择');
          }else{
            const firstId=selectedId;selectedId=null;
            move(firstId,id);
          }
        };
        row.onkeydown=event=>{
          if(!event.altKey||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;
          event.preventDefault();const order=g.liteInventory().order,index=order.indexOf(id),offset=['ArrowUp','ArrowLeft'].includes(event.key)?-1:1;
          const targetIndex=index+offset;
          if(targetIndex>=0&&targetIndex<order.length)move(id,order[targetIndex]);
        };
        list.append(row);
      });
    }
    if(message)get('.backpack-status').textContent=message;
    else if(!selectedId)get('.backpack-status').textContent='拖动道具自由替换 · 快捷栏最多3种';
  }
  function move(id,target){
    const before=new Map([...lists.querySelectorAll('[data-tool]')].map(n=>[n.dataset.tool,n.getBoundingClientRect()]));
    const invBefore=game().liteInventory();
    const targetId=typeof target==='string'?target:invBefore.order[target];
    if(!targetId||targetId===id)return;
    if(!game().liteMoveTool(id,targetId))return;
    changed();
    const srcTool=config.tools.find(t=>t.id===id),dstTool=config.tools.find(t=>t.id===targetId);
    let msg='道具已替换';
    if(srcTool&&dstTool){
      const srcWasActive=invBefore.active.includes(id),dstWasActive=invBefore.active.includes(targetId);
      if(!srcWasActive&&dstWasActive){
        msg=srcTool.name+' 已替换 '+dstTool.name+' 放入快捷栏';
      }else if(srcWasActive&&!dstWasActive){
        msg=srcTool.name+' 已放入暂存区，换上 '+dstTool.name;
      }else if(srcWasActive&&dstWasActive){
        msg=srcTool.name+' 与 '+dstTool.name+' 已互换快捷栏位置';
      }else{
        msg=srcTool.name+' 与 '+dstTool.name+' 已调整暂存顺序';
      }
    }
    render(msg);
    for(const node of lists.querySelectorAll('[data-tool]')){const a=before.get(node.dataset.tool),b=node.getBoundingClientRect();if(a&&!reduced.matches)node.animate([{transform:`translate(${a.left-b.left}px,${a.top-b.top}px)`},{transform:'translate(0,0)'}],{duration:180,easing:'ease-out'});}
    get(`[data-tool="${id}"]`)?.focus({preventScroll:true});
  }
  function targetAt(x,y){
    const hit=document.elementFromPoint(x,y);
    if(!hit||!lists.contains(hit))return null;
    const tile=hit.closest('.backpack-row');
    if(tile&&tile!==drag?.row&&tile.dataset.tool!==drag?.id){
      const inv=game().liteInventory(),index=inv.order.indexOf(tile.dataset.tool);
      if(index>=0)return {node:tile,index,id:tile.dataset.tool};
    }
    const zone=hit.closest('[data-zone]')||hit.closest('section')?.querySelector('[data-zone]');
    if(zone){
      const rows=[...zone.querySelectorAll('.backpack-row')].filter(r=>r!==drag?.row&&r.dataset.tool!==drag?.id);
      if(rows.length){
        let closestRow=rows[0],minDist=Infinity;
        for(const r of rows){
          const rect=r.getBoundingClientRect(),dist=Math.abs(y-(rect.top+rect.bottom)/2);
          if(dist<minDist){minDist=dist;closestRow=r;}
        }
        const inv=game().liteInventory(),index=inv.order.indexOf(closestRow.dataset.tool);
        if(index>=0)return {node:closestRow,index,id:closestRow.dataset.tool};
      }
    }
    return null;
  }
  function updateDrag(){
    if(!drag?.active)return;
    drag.ghost.style.left=drag.x-drag.offsetX+'px';drag.ghost.style.top=drag.y-drag.offsetY+'px';
    const target=targetAt(drag.x,drag.y);dialog.querySelectorAll('.backpack-drop-target').forEach(n=>n.classList.remove('backpack-drop-target'));
    if(target?.node){
      target.node.classList.add('backpack-drop-target');
      drag.target=target;
      const srcTool=config.tools.find(t=>t.id===drag.id),dstTool=config.tools.find(t=>t.id===target.id);
      if(srcTool&&dstTool){
        const inv=game().liteInventory(),srcInActive=inv.active.includes(srcTool.id),dstInActive=inv.active.includes(dstTool.id);
        if(!srcInActive&&dstInActive){
          get('.backpack-status').textContent=`松开将「${srcTool.name}」替换「${dstTool.name}」放入快捷栏`;
        }else if(srcInActive&&!dstInActive){
          get('.backpack-status').textContent=`松开将「${srcTool.name}」放入暂存区，换上「${dstTool.name}」`;
        }else if(srcInActive&&dstInActive){
          get('.backpack-status').textContent=`松开互换「${srcTool.name}」与「${dstTool.name}」的快捷栏位置`;
        }else{
          get('.backpack-status').textContent=`松开互换「${srcTool.name}」与「${dstTool.name}」的暂存顺序`;
        }
      }
    }else{
      drag.target=null;
      get('.backpack-status').textContent='拖动到目标道具上方释放即可替换';
    }
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
    if(!drag.active){
      selectedId=null;dialog.querySelectorAll('.backpack-row.is-selected').forEach(n=>n.classList.remove('is-selected'));
      drag.active=true;drag.row.classList.add('is-dragging');const ghost=drag.row.cloneNode(true);ghost.removeAttribute('data-tool');ghost.removeAttribute('aria-describedby');ghost.className='backpack-row backpack-drag-ghost';ghost.setAttribute('aria-hidden','true');ghost.tabIndex=-1;ghost.style.width=drag.rect.width+'px';ghost.style.height=drag.rect.height+'px';dialog.append(ghost);drag.ghost=ghost;dialog.dataset.dragging='true';autoScroll();
    }
    updateDrag();
  });
  function finishDrag(commit){
    if(!drag)return;const state=drag;drag=null;cancelAnimationFrame(dragFrame);state.ghost?.remove();state.row.classList.remove('is-dragging');delete dialog.dataset.dragging;dialog.querySelectorAll('.backpack-drop-target').forEach(n=>n.classList.remove('backpack-drop-target'));
    if(lists.hasPointerCapture(state.pointer))lists.releasePointerCapture(state.pointer);
    if(state.active&&commit&&state.target)move(state.id,state.target.id||state.target.index);
  }
  lists.addEventListener('pointerup',()=>finishDrag(true));lists.addEventListener('pointercancel',()=>finishDrag(false));lists.addEventListener('lostpointercapture',()=>finishDrag(false));
  window.addEventListener('resize',()=>finishDrag(false));
  dialog.addEventListener('cancel',event=>{if(drag?.active){event.preventDefault();finishDrag(false);}});
  let priorPause=false;
  entry.onclick=()=>{if(!canOpen())return;priorPause=pause();selectedId=null;render();dialog.showModal();get('.v3-popup-close').focus({preventScroll:true});};
  get('.v3-popup-close').onclick=()=>dialog.close();dialog.addEventListener('keydown',event=>event.stopPropagation());
  dialog.addEventListener('close',()=>{selectedId=null;finishDrag(false);resume(priorPause);entry.focus({preventScroll:true});});
  installRotationPopupMotion(dialog);
  return {entry,dialog};
};
