globalThis.createRotationCodex=function({config,makeGame,entry,onResume,onHome}){
  const groups=[{name:'道具',items:config.tools.filter(t=>!t.blockEffect)},{name:'特殊方块',items:config.tools.filter(t=>t.blockEffect)}];
  const icon=id=>'./assets/icons/'+id+'.svg';
  const dialog=document.createElement('dialog');dialog.id='v3-codex';dialog.setAttribute('aria-labelledby','v3-codex-title');
  dialog.innerHTML=`<header class="codex-header"><img src="./assets/ui/shopkeeper.png" alt="" width="84" height="84"><div><small>ROTATION / FIELD GUIDE</small><h2 id="v3-codex-title">能力图鉴</h2></div><button type="button" class="codex-close v3-popup-close" aria-label="关闭图鉴" title="关闭"></button><svg class="codex-wave" viewBox="0 0 1000 32" preserveAspectRatio="none" aria-hidden="true"><path fill="#c5ff12" d="M0 5Q250 30 500 12T1000 10V32H0Z"/><path fill="#3e5aff" d="M0 18Q250 40 500 23T1000 20V32H0Z"/></svg></header><div class="codex-body"><nav class="codex-index" aria-label="能力目录"></nav><section class="codex-detail" aria-labelledby="codex-name"><div class="codex-detail-heading"><span id="codex-kind"></span><h3 id="codex-name"></h3></div><div class="codex-screen"><canvas width="640" height="360" role="img" aria-label="能力效果演示"></canvas><span class="codex-demo-label">效果演示</span></div><div class="codex-playback"><span id="codex-step" aria-live="off"></span><button id="codex-replay" type="button">↻ 重播</button></div><p id="codex-description"></p></section></div><footer class="codex-footer">点击图标，查看效果</footer>`;
  document.body.append(dialog);const get=s=>dialog.querySelector(s),canvas=get('canvas'),ctx=canvas.getContext('2d');
  let selected=null,scenario=null,start=0,frame=0,opener=entry,closeReason='';
  const footer=get('.codex-footer');footer.textContent='';
  const pauseFooter=document.createElement('div');pauseFooter.className='codex-pause-actions';pauseFooter.hidden=true;
  pauseFooter.innerHTML='<button type="button" id="v3-pause-continue">继续游戏 <span aria-hidden="true">→</span></button><button type="button" id="v3-pause-home">返回主页</button>';
  footer.append(pauseFooter);get('#v3-pause-continue').onclick=()=>close();get('#v3-pause-home').onclick=()=>onHome?.();
  const tabs=document.createElement('div');tabs.className='codex-category-tabs';tabs.hidden=true;tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','图鉴分类');get('.codex-index').prepend(tabs);
  groups.forEach((group,index)=>{const button=document.createElement('button');button.type='button';button.textContent=group.name;button.setAttribute('role','tab');button.id='codex-tab-'+index;button.setAttribute('aria-controls','codex-group-'+index);button.onclick=()=>{select(group.items[0],group.name);syncCategory(group.name);};tabs.append(button);});
  function syncCategory(name){groups.forEach((group,index)=>{const active=group.name===name;tabs.children[index].setAttribute('aria-selected',String(active));tabs.children[index].tabIndex=active?0:-1;get('#codex-group-'+index).hidden=dialog.dataset.mode==='pause'&&!active;});}
  tabs.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const buttons=[...tabs.children],index=buttons.indexOf(document.activeElement),next=buttons[(index+(event.key==='ArrowRight'?1:buttons.length-1))%buttons.length];next.click();next.focus();});
  const images=new Map();for(const g of groups)for(const item of g.items){const img=new Image();img.src=icon(item.id);images.set(item.id,img);}
  const clone=cells=>cells.map(c=>({...c}));
  function preview(item){
    const g=makeGame();g.events=[];g.board=[[-1,-1,'T'],[0,-1,'L'],[1,-1,'L'],[-1,0,'S'],[1,0,'L'],[-1,1,'T'],[2,0,'S'],[3,0,'S'],[1,3,'T']].map(([x,y,type])=>({x,y,type,id:g.id++}));
    let before=clone(g.board),after,from=[],to=[],removed=[],note='',mode='board',direction=0;
    if(item.blockEffect==='heavy'){
      g.board=[[1,-2,'T'],[2,-1,'S']].map(([x,y,type])=>({x,y,type,id:g.id++}));
      g.active={type:'L',color:'L',shape:[[0,0],[1,0],[2,0],[3,0]],x:0,y:1,liteEffect:'heavy'};
      g.lock(true);
      const fall=g.events.find(e=>e.kind==='compact'&&e.liteHeavyFall);
      before=clone(fall.before);after=clone(g.board);from=before.filter(c=>c.liteEffect==='heavy');
      removed=fall.fallen;direction=g.settlement?.torque?.dir||0;mode='heavy';note='逐格落稳后，转轴再旋转';
    }else if(item.blockEffect){
      const pos=[[0,1],[0,2]];
      const cells=pos.map(([x,y])=>({x,y,type:'L',id:g.id++,liteEffect:item.blockEffect}));from=clone(cells);g.board.push(...cells);before=clone(g.board);g.checkpointScore=100;g.score=100;g.levelScore=100;
      g.liteAfterAttach(cells);const result=g.resolvePendingSpecial();
      if(result.compact)g.settleRemaining(result.repack===true);
      if(item.blockEffect==='diamond')mode='diamond';
      if(item.blockEffect==='patch'){mode='coin';const score=g.awardCells(g.board,'outline');note='消除 '+g.board.length+' 格 · 金币 +'+score.coinReward;g.board=[];}
      after=clone(g.board);to=after.filter(c=>cells.some(a=>a.id===c.id));removed=before.filter(c=>!after.some(a=>a.id===c.id));
      const notes={column:'整列染成同色',blast:'本关 100 分 → 爆炸得分 +'+(result.scoring?.points||0),trim:'框外清除，框内保留',patch:note,pack:'向转轴中心重排',diamond:'同色 '+g.board.filter(c=>c.type==='L').length+' 格 · 倍率 +'+g.board.filter(c=>c.type==='L').length};note=notes[item.blockEffect];
    }else if(item.id==='shovel'){
      g.lite.lastPlacementIds=g.board.filter(c=>c.x>=2).map(c=>c.id);g.lite.tools.shovel=1;g.liteUseTool('shovel');after=clone(g.board);removed=before.filter(c=>!after.some(a=>a.id===c.id));note='移除上一次投放的方块';
    }else if(item.id==='dye'||item.id==='swap'){
      g.active={type:'T',color:'T',shape:[[0,0],[1,0],[0,1]],x:0,y:3};g.next='L';g.nextColor='L';g.nextShape=[[0,0],[0,1],[0,2],[1,0]];from=clone(g.cells());g.lite.tools[item.id]=1;g.liteUseTool(item.id);g.active.x=0;g.active.y=3;to=clone(g.cells());after=before;mode='piece';note=item.id==='dye'?'落块染成棋盘主色':'当前落块换成下一块';
    }else if(item.id==='supply'||item.id==='repair'){
      mode=item.id;g.lite.tools[item.id]=1;g.lives=2;const previous=item.id==='supply'?g.dropsRemaining:g.lives;g.liteUseTool(item.id);note=previous+' → '+(item.id==='supply'?g.dropsRemaining:g.lives);after=before;
    }
    return{before,after,from,to,removed,note,mode,direction};
  }
  const colors={I:'#65d9f0',O:'#ffe574',T:'#b68bff',S:'#b4ed61',Z:'#ff738e',L:'#ffac63',J:'#6799f6'};
  function tile(x,y,type,alpha=1,effect){ctx.globalAlpha=alpha;const size=25,px=320+x*27,py=214-y*27;const img=images.get('block-'+effect);if(effect&&img?.complete&&img.naturalWidth)ctx.drawImage(img,px-size/2,py-size/2,size,size);else{ctx.fillStyle='#263c70';ctx.fillRect(px-13,py-13,26,26);ctx.fillStyle=colors[type]||colors.L;ctx.fillRect(px-11,py-11,22,22);ctx.fillStyle='#ffffff88';ctx.fillRect(px-10,py-10,19,3);ctx.fillRect(px-10,py-10,3,19);}ctx.globalAlpha=1;}
  const ease=t=>1-(1-Math.max(0,Math.min(1,t)))**3;
  function paint(elapsed){
    if(!scenario)return;const s=scenario,phase=elapsed%5600,t=Math.max(0,Math.min(1,(phase-1700)/900)),u=ease(t);
    ctx.clearRect(0,0,640,360);ctx.fillStyle='#e7f9ff';ctx.fillRect(0,0,640,360);ctx.fillStyle='#c3e5fb';for(let x=20;x<640;x+=27)for(let y=20;y<360;y+=27)ctx.fillRect(x,y,2,2);
    ctx.strokeStyle='#77aad6';ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.strokeRect(277,171,86,86);ctx.setLineDash([]);
    for(const cell of s.before){
      const target=s.after.find(a=>a.id===cell.id),moving=s.from.some(a=>a.id===cell.id);
      if(!target){if(s.mode==='heavy'){const fallen=s.removed.find(c=>c.id===cell.id),fall=phase<1700?(1-ease(phase/1400))*4:0;tile(cell.x,cell.y+((fallen?.toY??-13)-cell.y)*u+fall,cell.type,1,cell.liteEffect);}else tile(cell.x+(t>0?Math.sign(cell.x||1)*u*.8:0),cell.y,cell.type,1-u,cell.liteEffect);continue;}
      const fall=moving&&phase<1700?(1-ease(phase/1400))*4:0;
      let x=cell.x+(target.x-cell.x)*u,y=cell.y+(target.y-cell.y)*u+fall;
      if(s.mode==='heavy'&&phase>=2900){const angle=s.direction*Math.PI/2*ease((phase-2900)/850);x=target.x*Math.cos(angle)-target.y*Math.sin(angle);y=target.x*Math.sin(angle)+target.y*Math.cos(angle);}
      tile(x,y,t>.45?target.type:cell.type,1,phase<1700?cell.liteEffect:null);
    }
    ctx.fillStyle='#d8ff30';ctx.fillRect(310,204,20,20);ctx.strokeStyle='#294780';ctx.lineWidth=3;ctx.strokeRect(310,204,20,20);ctx.beginPath();ctx.arc(320,214,5,0,Math.PI*2);ctx.stroke();
    if(s.mode==='piece')for(const c of t>.5?s.to:s.from)tile(c.x,c.y,c.type);
    if(s.mode==='supply'||s.mode==='repair'){
      ctx.fillStyle='#e7f9ff';ctx.fillRect(210,80,235,205);const img=images.get(selected.id);if(img?.complete)ctx.drawImage(img,286,105,68,68);
      ctx.font='bold 38px sans-serif';ctx.textAlign='center';ctx.fillStyle='#294b7e';ctx.fillText(t>.3?s.note:s.note.split(' → ')[0],320,230);
      ctx.font='16px sans-serif';ctx.fillText(s.mode==='supply'?'可投放次数':'落空容错',320,265);
    }
    if(s.mode==='diamond'&&t>0){
      for(const cell of s.after.filter(c=>c.liteHeavyBonus)){ctx.fillStyle='#263c70';ctx.fillRect(307+cell.x*27,190-cell.y*27,27,13);ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillStyle='#d7ff43';ctx.fillText('×'+(1+cell.liteHeavyBonus),320+cell.x*27,201-cell.y*27);}
    }
    if(t>0&&t<1&&s.removed.length&&s.mode!=='heavy'){for(let i=0;i<24;i++){const a=i*2.399,reach=u*110;ctx.globalAlpha=1-u;ctx.fillStyle=i%2?'#c8ff22':'#6889ff';ctx.fillRect(320+Math.cos(a)*reach,206+Math.sin(a)*reach,5,5);}ctx.globalAlpha=1;}
    get('#codex-step').textContent=phase<1700?'使用前':phase<2600?'效果触发':s.note;
    if(s.mode==='heavy')get('#codex-step').textContent=phase<1700?'使用前':phase<2600?'各格分别下落':phase<2900?'下落结算完成':s.note;
    canvas.dataset.demoPhase=phase<1700?'before':phase<2600?'effect':'after';
  }
  function loop(now){if(!dialog.open)return;paint(now-start);frame=requestAnimationFrame(loop);}
  function select(item,group){selected=item;scenario=preview(item);dialog.dataset.selected=item.id;get('#codex-name').textContent=item.name;get('#codex-kind').textContent=group;get('#codex-description').textContent=item.detail||item.description;canvas.setAttribute('aria-label',item.name+'：'+(item.detail||item.description));for(const b of dialog.querySelectorAll('[data-entry]'))b.setAttribute('aria-pressed',String(b.dataset.entry===item.id));start=performance.now();paint(reduced.matches?3000:0);}
  for(const group of groups){const section=document.createElement('section');section.className='codex-group';const h=document.createElement('h3');h.textContent=group.name;section.append(h);const row=document.createElement('div');row.className='codex-icons';for(const item of group.items){const b=document.createElement('button');b.type='button';b.className='codex-item';b.dataset.entry=item.id;b.setAttribute('aria-label',item.name);b.innerHTML='<span class="codex-medallion"><img src="'+icon(item.id)+'" width="34" height="34" alt=""></span><span class="codex-item-name"></span>';b.querySelector('.codex-item-name').textContent=item.name.replace('方块','');b.onclick=()=>select(item,group.name);row.append(b);}section.append(row);get('.codex-index').append(section);}
  get('.codex-index').querySelectorAll('.codex-group').forEach((section,index)=>{section.id='codex-group-'+index;section.setAttribute('aria-labelledby','codex-tab-'+index);});
  function close(reason=''){if(dialog.dataset.v3Closing==='true')return;closeReason=reason;dialog.close();}
  get('.codex-close').onclick=()=>close();dialog.addEventListener('close',()=>{cancelAnimationFrame(frame);if(dialog.dataset.mode==='pause'&&!closeReason)onResume?.();else if(closeReason!=='home')opener.focus({preventScroll:true});closeReason='';});dialog.addEventListener('keydown',e=>e.stopPropagation());
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');get('#codex-replay').onclick=()=>{start=performance.now();paint(reduced.matches?3000:0);};
  entry.textContent='图鉴';entry.setAttribute('aria-haspopup','dialog');function open(origin=entry,{mode='catalogue'}={}){opener=origin;closeReason='';dialog.dataset.mode=mode;const paused=mode==='pause';tabs.hidden=!paused;pauseFooter.hidden=!paused;get('#v3-codex-title').textContent=paused?'已暂停':'能力图鉴';get('.codex-close').setAttribute('aria-label',paused?'继续游戏':'关闭图鉴');dialog.showModal();const group=selected?groups.find(g=>g.items.includes(selected)).name:'道具';select(selected||groups[0].items[0],group);syncCategory(group);if(!reduced.matches){cancelAnimationFrame(frame);frame=requestAnimationFrame(loop);}(paused?get('#v3-pause-continue'):get('.codex-close')).focus({preventScroll:true});}
  entry.onclick=()=>open(entry);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelAnimationFrame(frame);else if(dialog.open&&!reduced.matches){start=performance.now();frame=requestAnimationFrame(loop);}});
  installRotationPopupMotion(dialog);
  return{dialog,open,close};
};
