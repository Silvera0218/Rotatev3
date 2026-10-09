// Executed inside the original game closure: preserve its renderer and controls.
const liteConfig = globalThis.ROTATION_LITE;
let liteRewardStage = -1, liteRewardAdvance = null;
let liteNaturalFall = true;
let liteRewardPanel = null, liteLastHint = '';
const liteAcquisitionQueue=[];let liteAcquisitionPlaying=false;
let liteShopDialog=null,liteShopSelection=null;
let liteCompletionStage=-1,liteCompletionState=null;
const liteTool = id => liteConfig.tools.find(tool=>tool.id===id);
const liteToolName = id => liteTool(id)?.name||id;
const liteSpecial=id=>liteConfig.specials.find(block=>block.id===id);
const liteBlockIcon=id=>`<img class="lite-block-icon" src="./assets/icons/block-${id}.svg" width="32" height="32" alt="" aria-hidden="true">`;
const liteText=(node,text)=>{text=String(text);if(node.textContent!==text)node.textContent=text;};
const liteIcon = (kind) => {
  if(liteTool(kind)?.blockEffect)return liteBlockIcon(liteTool(kind).blockEffect);
  if(liteTool(kind))return `<img src="./assets/icons/${kind}.svg" width="32" height="32" alt="" aria-hidden="true">`;
  const paths={coin:'M6 2h8v2h2v2h2v8h-2v2h-2v2H6v-2H4v-2H2V6h2V4h2z M9 5v10h2V5z',shovel:'M12 1h5v5h-2v3h-2v3h-2v5H8v2H3v-5h2v-3h5V9h2V6h-2V1z',swap:'M4 3h10V1l5 5-5 5V8H4z M16 17H6v2l-5-5 5-5v3h10z',buff:'M8 1h4v5h5v3h-4v4h-3v5H7v-6H2V9h4V5h2z'};
  return `<svg viewBox="0 0 20 20" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" fill-rule="evenodd" d="${paths[kind]||paths.buff}"/></svg>`;
};
const toolbar = document.createElement('div');toolbar.id='lite-toolbar';
toolbar.innerHTML=`<div class="lite-wallet">${liteIcon('coin')}<b id="lite-coins">0</b><span>金币</span></div><div class="lite-run-score"><small>本局得分</small><b id="lite-score">0</b></div><button id="lite-shovel" type="button">${liteIcon('shovel')}<span>铲子</span><b>1</b></button><button id="lite-swap" type="button">${liteIcon('swap')}<span>换块</span><b>1</b></button>`;
I('game-ui').append(toolbar);
const toolRail=document.createElement('div');toolRail.id='lite-tool-rail';toolRail.setAttribute('role','group');toolRail.setAttribute('aria-label','主动道具');
for(const {id:kind} of liteConfig.tools){let button=I('lite-'+kind);if(!button){button=document.createElement('button');button.id='lite-'+kind;button.type='button';}button.className='insertion-button';button.innerHTML=`<span class="insertion-glyph">${liteIcon(kind)}</span><b class="insertion-price">0</b><span class="insertion-name">${liteToolName(kind)}</span>`;toolRail.append(button);}
I('game-ui').append(toolRail);
const levelLabel=document.createElement('div');levelLabel.id='lite-level-label';toolbar.insertBefore(levelLabel,toolbar.querySelector('.lite-run-score'));
for (const id of ['lite-special-hint']) {const node=document.createElement('div');node.id=id;I('game-ui').append(node);}
const toast=document.createElement('div');toast.id='lite-toast';toast.setAttribute('role','status');I('stage').append(toast);let toastTimer;
function liteToast(text,acquired=false){toast.textContent=text;toast.classList.toggle('lite-acquired-toast',acquired);toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2400);}
function liteCanAct(){return he&&!G0&&!Pt&&!k0&&!Ie.busy&&!pe.particles.length&&!me.active&&L.phase==='play'&&I('overlay').hidden;}
for(const tool of liteConfig.tools)I('lite-'+tool.id).onclick=()=>{
  if(!liteCanAct()||!L.liteUseTool(tool.id))return;
  const supplyAmount=L.events.findLast(e=>e.kind==='lite-tool'&&e.tool==='supply')?.amount;
  _t();if(tool.id==='swap')resetDropVisuals();yt=0;fe.dirty=true;d3();se.play(tool.id==='swap'?'lock':'clear');
  const messages={shovel:'已铲除上一次投放的方块',swap:'已换成下一块',supply:`本关投放机会 +${supplyAmount}`,dye:'当前落块已染成棋盘主色',repair:'落空容错 +1'};liteToast(tool.blockEffect?'当前落块已改造为'+tool.name:messages[tool.id]);liteSaveSafe();
};
// V3 has no passive upgrades or growth rail.
zf.sync=function(){I('buff-hud').hidden=true;};
// Eliminate original card, insertion and rotor-choice entry points in this copy.
ka = startWithoutRotor;
const liteOriginalStart=ka;
ka=function(...args){g5=true;liteResetCompletion();liteRewardStage=-1;liteAcquisitionQueue.length=0;I('stage').querySelectorAll('.lite-clear-burst').forEach(n=>n.remove());liteCloseReward();const result=liteOriginalStart(...args);L.beginStage();S1(`填满轮廓得分 · 本关目标 ${L.goal} 分`);liteSync();return result;};
Ca=function(){L.beginStage();G0=false;I('overlay').hidden=true;};
const liteOriginalWa=wa;
wa=function(){liteOriginalWa();if(L.lite){I('phase-label').textContent='本关得分';I('goal-track').setAttribute('aria-label','本关分数进度');}};
const liteOriginalV3=V3;
V3=function(){liteOriginalV3();liteSync();};
function liteSync(){
  if(!L.lite)return;
  liteSyncSound();
  liteSyncInventory();liteSyncLives();
  liteText(I('round'),L.endless?`无尽 · 第 ${L.stage+1} 关`:`第 ${L.stage+1} / ${liteConfig.levels} 关`);
  liteText(levelLabel,L.endless?`无尽 · 第 ${L.stage+1} 关`:`第 ${L.stage+1} / ${liteConfig.levels} 关`);
  // The model has saved the award; the HUD credits it as each coin reaches the wallet.
  const clearState=liteCompletionState?.stage===L.stage?liteCompletionState:null;
  const pendingClear=L.phase==='checkpoint-complete'&&!L.lite.roll&&L.lite.clearCoinStage===L.stage&&liteCompletionStage!==L.stage;
  const pendingCoins=clearState?clearState.coinTotal-clearState.coinArrived:pendingClear?L.liteClearCoinReward().total:0;
  liteText(I('lite-coins'),Math.max(0,L.lite.coins-pendingCoins));liteText(I('lite-score'),Ne(L.score));
  for(const tool of liteConfig.tools){
    const button=I('lite-'+tool.id),count=L.lite.tools[tool.id]||0;liteText(button.querySelector('b'),count);
    button.hidden=!L.liteInventory().active.includes(tool.id);
    const disabled=!liteCanAct()||!L.liteCanUseTool(tool.id);if(button.disabled!==disabled)button.disabled=disabled;
    let hint=tool.description;if(tool.id==='repair'&&L.lives>=3)hint='容错已满';if(tool.id==='dye'&&!L.liteDyeColor())hint='棋盘上还没有可取色的方块';
    const label=`${tool.name}，剩余 ${count} 次，${hint}`;if(button.getAttribute('aria-label')!==label){button.setAttribute('aria-label',label);button.title=label;}
  }
  zf.sync();
  const special=L.active?.liteEffect;const upcoming=L.lite.nextEffect||L.nextLiteEffect||null;
  const title=liteSpecial(special)?.name||`目标 ${L.goal} 分 · 达标后选补给`;
  if(title!==liteLastHint){liteLastHint=title;I('lite-special-hint').textContent=title;}
  if(upcoming)liteText(I('next-caption'),'下一个 · '+liteSpecial(upcoming).name);
  I('growth-summary').hidden=true;
}
const liteOriginalD3=d3;
d3=function(...args){
  const heavyEvents=L.events.filter(e=>e.kind==='special'&&e.heavyBoost);
  const events=L.events.filter(e=>['lite-drop','lite-buy','lite-special','lite-tool-choice','lite-extra-tool','lite-reward-enter','stage-start','lite-precise','v3-unused-buff-trigger'].includes(e.kind));const result=liteOriginalD3(...args);
  for(const e of events){
    const incoming=[];let stage=e.stage??L.stage+1;
    if(e.kind==='lite-drop'){incoming.push(e.tool);stage=L.stage;}
    else if(e.kind==='lite-buy'&&e.category!=='buff')incoming.push(e.category==='special'?'block-'+e.item:e.item);
    else if(e.kind==='lite-special')incoming.push('block-'+e.id);
    else if(e.kind==='lite-tool-choice')incoming.push(e.id);
    else if(e.kind==='lite-extra-tool')incoming.push(...Array.from({length:e.count||1},()=>e.id));
    else if(e.kind==='lite-reward-enter'&&e.route==='tool')incoming.push(...Object.keys(L.lite.roll.tools).filter(id=>L.lite.roll.tools[id]));
    for(const id of incoming)liteAcquisitionQueue.push({id,stage});
  }
  for(const event of heavyEvents)liteToast(`同色 ${event.heavyBoost.count} 格 · 每格倍率 +${event.heavyBoost.gain}`);
  return result;
};
function litePlayPendingAcquisition(){
  if(liteAcquisitionPlaying||!liteCanAct())return;
  while(liteAcquisitionQueue.length&&(liteAcquisitionQueue[0].stage<L.stage||liteAcquisitionQueue[0].stage===L.stage&&!L.lite.tools[liteAcquisitionQueue[0].id]))liteAcquisitionQueue.shift();
  const entry=liteAcquisitionQueue[0];if(!entry||entry.stage!==L.stage)return;liteAcquisitionQueue.shift();liteSync();
  const stored=L.liteInventory().reserve.includes(entry.id);
  const button=I(stored?'v3-backpack-open':'lite-'+entry.id);if(!button||button.hidden)return;
  const rail=toolRail.getBoundingClientRect(),r=button.getBoundingClientRect();if(r.top<rail.top||r.bottom>rail.bottom)toolRail.scrollTop+=r.top-rail.top-12;
  const project=(x,y,z=0)=>{const rect=I('stage').getBoundingClientRect(),p=new U(x,y,z).project(Bt);return{x:rect.left+I('stage').clientLeft+(p.x+1)*Ge.w/2,y:rect.top+I('stage').clientTop+Ge.top+(1-p.y)*Ge.playHeight/2};};
  const sources=L.board.slice(-12).map(c=>{const p=rotorCellPositions.get(c.id)||c;return project(p.x,p.y,p.z||0);});
  liteAcquisitionPlaying=true;se.play('clear');liteToast(`${liteToolName(entry.id)} +1${stored?' · 已放入背包':''}`,true);
  playLiteAcquisition({button,origin:project(0,0),sources}).finally(()=>{liteAcquisitionPlaying=false;});
}
// Screen-space fragments follow the cleared cells, below the score lettering.
function liteClearBurst(cells,anchor,color,combo){
  if(zt)return;
  const stage=I('stage');
  const project=c=>{const p=new U(c.x,c.y,0).project(Bt);return{x:(p.x+1)*Ge.w/2,y:Ge.top+(1-p.y)*Ge.playHeight/2};};
  const points=(cells.length?cells:[anchor]).map(project);
  const center=points.reduce((p,c)=>({x:p.x+c.x/points.length,y:p.y+c.y/points.length}),{x:0,y:0});
  const layer=document.createElement('div');layer.className='lite-clear-burst';layer.setAttribute('aria-hidden','true');
  layer.style.setProperty('--burst-color',color);
  const add=(className,x,y)=>{const n=document.createElement('i');n.className=className;n.style.left=x+'px';n.style.top=y+'px';layer.append(n);return n;};
  // One short flash and two stepped shock fronts, rather than a screen-wide flash.
  add('lite-clear-flash',center.x,center.y);
  for(let j=0;j<2;j++){const ring=add('lite-clear-ring',center.x,center.y);ring.style.setProperty('--delay',j?'.07s':'0s');ring.style.setProperty('--ring-size',(j?144:208)+'px');}
  const count=Math.min(64,28+cells.length*2+Math.min(combo,3)*4);
  for(let j=0;j<count;j++){
    const source=points[j%points.length],angle=j*2.39996+Math.random()*.32;
    const distance=58+Math.random()*78+Math.min(combo-1,3)*13;
    const n=add('lite-clear-fragment',source.x,source.y);
    const cell=cells[j%Math.max(1,cells.length)];
    n.style.background=j%4===0?'#fff':cell&&!cell.liteEffect?'#'+(i9[cell.color||cell.type]||i9.O).toString(16).padStart(6,'0'):color;
    n.style.setProperty('--dx',Math.cos(angle)*distance+'px');n.style.setProperty('--dy',Math.sin(angle)*distance+'px');
    n.style.setProperty('--fall',(28+Math.random()*34)+'px');n.style.setProperty('--size',(j%5===0?10:4+Math.floor(Math.random()*4))+'px');
    n.style.setProperty('--spin',(j%2?90:-90)+'deg');n.style.setProperty('--life',(.65+Math.random()*.25)+'s');
  }
  for(let j=0;j<10;j++){
    const ray=add('lite-clear-ray',center.x,center.y);ray.style.setProperty('--angle',j*36+'deg');ray.style.setProperty('--reach',(74+j%3*19)+'px');
  }
  stage.append(layer);layer.addEventListener('animationend',e=>{if(e.target===layer)layer.remove();});
}
function liteShowCoinReward(amount,anchor){
  const stage=I('stage'),root=stage.getBoundingClientRect(),target=I('lite-coins').getBoundingClientRect(),p=new U(anchor.x,anchor.y,0).project(Bt);
  const sx=(p.x+1)*Ge.w/2,sy=Ge.top+(1-p.y)*Ge.playHeight/2,tx=target.left+target.width/2-root.left,ty=target.top+target.height/2-root.top;
  const layer=document.createElement('div');layer.className='lite-coin-reward';layer.setAttribute('aria-hidden','true');stage.append(layer);
  const burst=()=>{const node=document.createElement('div');node.className='lite-clear-wallet-burst';node.style.left=tx+20+'px';node.style.top=ty-8+'px';const text=document.createElement('strong');text.textContent='+'+amount;node.append(text);layer.append(node);if(!zt)I('lite-coins').animate([{transform:'scale(1)'},{transform:'scale(1.6)',color:'#ffe24f'},{transform:'scale(1)'}],{duration:260});setTimeout(()=>layer.remove(),1000);};
  if(zt){burst();return;}
  const count=Math.min(8,amount),flights=[];
  for(let i=0;i<count;i++){const coin=document.createElement('div');coin.className='lite-clear-coin-flight';coin.innerHTML=liteIcon('coin');layer.append(coin);const animation=coin.animate([{transform:`translate(${sx-14}px,${sy-14}px)`},{transform:`translate(${sx+40}px,${sy-70}px)`,offset:.4},{transform:`translate(${tx-14}px,${ty-14}px) scale(.64)`}],{duration:650,delay:i*40,easing:'ease-in-out',fill:'both'});flights.push(animation.finished.catch(()=>{}).then(()=>coin.remove()));}
  Promise.all(flights).then(burst);
}
// The final placed cell anchors each score burst; chained clears use their newest cell.
Of=function(scoring,cells=[]){
  const lastIds=new Set(L.lite.lastPlacementIds||[]),placed=cells.filter(c=>lastIds.has(c.id));
  const anchor=(placed.length?placed:cells).reduce((last,c)=>!last||c.id>last.id?c:last,null)||{x:0,y:0,type:'O'};
  const materialColors={column:'#63d9ff',blast:'#ff9658',trim:'#a6ee58',patch:'#ff96bf',pack:'#ae8bff',heavy:'#b6c9de'};
  const color=materialColors[anchor.liteEffect]||'#'+(i9[anchor.color||anchor.type]||i9.O).toString(16).padStart(6,'0');
  const combo=Math.max(scoring.chain||1,scoring.streak||1),words=['','','二','三','四','五','六','七','八','九','十'];
  liteClearBurst(cells,anchor,color,combo);
  const title=combo>1?`${words[combo]||combo}连消除`:({'blast':'爆炸消除','trim':'修枝消除','tool':'方块消除','outside':'界外消除','loose-outline':'缺口消除'}[scoring.source]||'轮廓消除');
  const box=I('score-feedback'),number=I('feedback-points');
  c3={t:0,duration:zt?1.25:1.65,anchor:{x:anchor.x,y:anchor.y},combo};scorePopupPulse=null;
  box.hidden=false;box.dataset.tier=combo>=3?'burst':combo>1?'chain':'normal';box.style.setProperty('--score-color',color);
  I('feedback-title').textContent=title;box.dataset.heavy=String(!!scoring.heavyCellCount);I('feedback-multiplier').textContent=scoring.heavyCellCount?`超重 ${scoring.heavyCellCount} 格 · 最高 ×${scoring.heavyMaxMultiplier}`:'';I('feedback-detail').textContent='';
  if(scoring.coinReward)liteShowCoinReward(scoring.coinReward,anchor);
  number.textContent=`+${Ne(scoring.points)}`;number.style.removeProperty('transform');delete number.dataset.scorePulse;
  number.style.fontSize=(combo>=3?66:combo>1?60:52)+'px';
  box.querySelectorAll('.lite-score-spark').forEach(n=>n.remove());
  // Fit the full number during its largest overshoot, leaving room for the equipment rail.
  const available=Math.min(270,I('stage').clientWidth-112);
  if(number.offsetWidth*1.28>available)number.style.fontSize=Math.max(22,parseFloat(number.style.fontSize)*available/(number.offsetWidth*1.28))+'px';
  if(!zt)for(let j=0;j<8;j++){
    const spark=document.createElement('i'),angle=j*Math.PI/4;
    spark.className='lite-score-spark';spark.style.setProperty('--spark-x',Math.cos(angle)*76+'px');spark.style.setProperty('--spark-y',Math.sin(angle)*46+'px');spark.style.setProperty('--spark-delay',j%2?'.04s':'0s');spark.setAttribute('aria-hidden','true');box.append(spark);
  }
  const face=box.querySelector('.feedback-top');face.style.animation='none';void face.offsetWidth;face.style.removeProperty('animation');
  Ta(0);
};
Ta=function(dt){
  updateScorePulse(dt);if(!c3)return;c3.t+=dt;
  const box=I('score-feedback');if(c3.t>=c3.duration){box.hidden=true;c3=null;return;}
  const p=new U(c3.anchor.x,c3.anchor.y,0).project(Bt),stage=I('stage');
  const x=(p.x+1)*Ge.w/2,y=Ge.top+(1-p.y)*Ge.playHeight/2;
  const half=box.offsetWidth*.64+8,height=box.offsetHeight;
  const railLeft=toolRail.getBoundingClientRect().left-stage.getBoundingClientRect().left-stage.clientLeft;
  const right=Math.min(stage.clientWidth-8,railLeft-8);
  box.style.left=Math.max(half,Math.min(right-half,x))+'px';
  box.style.setProperty('top',Math.max(height+24,Math.min(stage.clientHeight-110,y-12))+'px','important');
  box.style.opacity=String(Math.min(1,(c3.duration-c3.t)/.32));
  box.style.transform=`translate(-50%,calc(-100% - ${zt?0:Math.max(0,c3.t-.22)*24}px))`;
};
function liteCloseReward(){liteRewardAdvance=null;liteCloseShopDetail(false);if(liteRewardPanel){liteRewardPanel.hidden=true;liteRewardPanel.inert=false;liteRewardPanel.removeAttribute('aria-busy');}I('lite-shop-hero')?.setAttribute('hidden','');delete I('overlay').dataset.liteReward;delete I('overlay').dataset.litePage;}
function liteCloseShopDetail(restoreFocus=true){
  const selection=liteShopSelection;liteShopSelection=null;
  const restore=()=>{if(restoreFocus&&selection){
    const card=I('lite-shop-offers')?.querySelector(`[data-slot="${selection.slot}"]`);
    (card&&!card.disabled&&!card.hidden?card:I('lite-next'))?.focus({preventScroll:true});
  }};
  if(liteShopDialog?.open){if(liteShopDialog.dataset.v3Closing==='true')return;liteShopDialog.addEventListener('close',restore,{once:true});liteShopDialog.close();}else restore();
}
function litePositionShopDetail(){
  if(!liteShopDialog?.open||!liteShopSelection)return;
  const {point}=liteShopSelection,view=window.visualViewport;
  const left=view?.offsetLeft||0,top=view?.offsetTop||0,width=view?.width||innerWidth,height=view?.height||innerHeight;
  const rect=liteShopDialog.getBoundingClientRect();
  const x=Math.max(left+12,Math.min(left+width-rect.width-12,point.x-rect.width/2));
  const below=point.y+14,above=point.y-rect.height-14;
  const y=Math.max(top+12,Math.min(top+height-rect.height-12,below+rect.height<=top+height-12?below:above));
  liteShopDialog.style.left=x+'px';liteShopDialog.style.top=y+'px';
}
function liteOpenShopDetail(offer,button,event){
  if(!liteShopDialog){
    liteShopDialog=document.createElement('dialog');liteShopDialog.id='lite-shop-detail';
    liteShopDialog.setAttribute('aria-labelledby','lite-shop-detail-name');liteShopDialog.setAttribute('aria-describedby','lite-shop-detail-effect');
    liteShopDialog.innerHTML='<div class="lite-shop-detail-head"><div id="lite-shop-detail-icon" aria-hidden="true"></div><div><small id="lite-shop-detail-category"></small><h2 id="lite-shop-detail-name"></h2></div></div><p id="lite-shop-detail-effect"></p><div class="lite-shop-detail-cost"><strong id="lite-shop-detail-price"></strong><span id="lite-shop-detail-wallet"></span></div><div class="lite-shop-detail-actions"><button type="button" id="lite-shop-detail-cancel" class="v3-popup-close" aria-label="关闭道具详情" title="关闭"></button><button type="button" id="lite-shop-detail-buy">购买</button></div>';
    document.body.append(liteShopDialog);
    I('lite-shop-detail-cancel').onclick=()=>liteCloseShopDetail();
    liteShopDialog.addEventListener('cancel',e=>{e.preventDefault();liteCloseShopDetail();});
    liteShopDialog.addEventListener('keydown',e=>e.stopPropagation());
    installRotationPopupMotion(liteShopDialog);
    let outsideDown=false;
    const outside=e=>{const r=liteShopDialog.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};
    liteShopDialog.addEventListener('pointerdown',e=>{outsideDown=outside(e);});
    liteShopDialog.addEventListener('click',e=>{if(outsideDown&&outside(e))liteCloseShopDetail();outsideDown=false;});
    I('lite-shop-detail-buy').onclick=()=>{
      const slot=liteShopSelection?.slot;if(slot===undefined)return;
      if(!L.liteBuyOffer(slot)){I('lite-shop-detail-buy').disabled=true;I('lite-shop-detail-buy').textContent='暂时无法购买';return;}
      liteUpdateReward();liteSync();d3();se.play('clear');liteSaveSafe();liteCloseShopDetail();
    };
    const reposition=()=>{if(!liteShopSelection)return;const r=liteShopSelection.button.getBoundingClientRect();liteShopSelection.point={x:r.left+r.width/2,y:r.top+r.height/2};litePositionShopDetail();};
    window.addEventListener('resize',reposition);window.visualViewport?.addEventListener('resize',reposition);
  }
  const rect=button.getBoundingClientRect();liteShopSelection={slot:offer.slot,button,point:event.detail?{x:event.clientX,y:event.clientY}:{x:rect.left+rect.width/2,y:rect.top+rect.height/2}};
  const entry=offer.kind==='special'?liteSpecial(offer.item):liteTool(offer.item);
  I('lite-shop-detail-name').textContent=entry.name+' +1';
  I('lite-shop-detail-category').textContent={tool:'道具',special:'特殊方块'}[offer.kind];
  I('lite-shop-detail-effect').textContent=entry.detail||entry.description;
  const art=I('lite-shop-detail-icon');art.replaceChildren();
  art.innerHTML=offer.kind==='special'?liteBlockIcon(offer.item):liteIcon(offer.item);
  const price=L.liteOfferPrice(offer);
  I('lite-shop-detail-price').textContent=price+' 金币';I('lite-shop-detail-wallet').textContent='持有 '+L.lite.coins+' 金币';
  const buy=I('lite-shop-detail-buy'),poor=L.lite.coins<price;buy.disabled=poor;buy.textContent=poor?'金币不足':'购买';
  liteShopDialog.showModal();litePositionShopDetail();(buy.disabled?I('lite-shop-detail-cancel'):buy).focus({preventScroll:true});
}
function liteCreateReward(){
  if(liteRewardPanel)return;
  liteRewardPanel=document.createElement('section');liteRewardPanel.id='lite-reward-panel';liteRewardPanel.hidden=true;
  liteRewardPanel.innerHTML='<div id="lite-reward-heading"><h2 id="lite-reward-title">补给站</h2><div class="v3-supply-actions"><button id="v3-shop-open" type="button" aria-label="打开道具商店"><img src="./assets/icons/shop-cart.svg" width="26" height="26" alt=""><span>商店</span></button><span id="lite-shop-wallet"></span></div></div><p id="lite-reward-summary">免费补给 · 选择一件</p><div id="v3-reward-choices"></div><div id="lite-choice-refresh"><button id="lite-refresh-reward" type="button"></button><span id="lite-refresh-status" role="status"></span></div><div id="lite-shop" hidden><nav id="lite-shop-categories" aria-label="商品分类"></nav><div id="lite-shop-offers"></div></div><button id="lite-next" type="button" hidden>返回补给</button>';
  const hero=document.createElement('header');hero.id='lite-shop-hero';hero.hidden=true;hero.innerHTML='<div class="lite-shop-hero-inner"><img src="./assets/ui/shopkeeper.png" width="128" height="128" alt="机器人店员"><div><span>SHOP</span><h2>道具商店</h2></div></div>';
  I('overlay').querySelector('.dialog').append(hero,liteRewardPanel);
  for(const [id,label] of [['all','全部'],['tool','道具'],['special','特殊方块']]){
    const button=document.createElement('button');button.type='button';button.dataset.category=id;button.textContent=label;
    button.onclick=()=>{L.lite.roll.shopCategory=id;liteUpdateReward();liteSaveSafe();};I('lite-shop-categories').append(button);
  }
  I('v3-shop-open').onclick=()=>{if(L.lite.roll.adReadyAt)return;L.lite.roll.shopOpen=true;liteUpdateReward();liteSaveSafe();};
  I('lite-next').onclick=()=>{L.lite.roll.shopOpen=false;liteUpdateReward();liteSaveSafe();};
  I('lite-refresh-reward').onclick=event=>{const r=L.lite.roll;if(r.settled){liteContinueAfterReward(I('lite-refresh-reward'),event);return;}const changed=r.freeRefreshes>0?L.liteRefreshReward():L.liteStartRewardAd();if(changed){d3();se.play('turn');liteUpdateReward();liteSaveSafe();}};
}
function liteContinueAfterReward(origin=liteRewardPanel,event){
  const roll=L.lite.roll;if(!roll?.settled||liteRewardAdvance===roll||me.active)return;
  liteRewardAdvance=roll;const next=L.liteNextStageInfo();liteRewardPanel.inert=true;liteRewardPanel.setAttribute('aria-busy','true');liteSaveSafe();se.unlock();
  z6({element:origin,event,palette:l5[next.stage%l5.length],kicker:next.won?'本局完成':`目标 ${next.goal} 分`,title:next.won?'挑战完成':`第 ${next.stage+1} 关`,swap:()=>{
    liteRewardPanel.inert=false;liteRewardPanel.removeAttribute('aria-busy');
    if(L.lite.roll!==roll||!L.liteNext()){liteRewardAdvance=null;return;}
    liteCloseReward();G0=false;y5();I('overlay').hidden=true;Gt.reset();Ie.reset();pe.reset();G3();yt=0;k0=null;H3=-1;be.round=-1;v5(0,true);d3();Qt();liteSaveSafe();
  }});
}
function liteUpdateReward(){
  const roll=L.lite.roll;if(!roll||!liteRewardPanel)return;
  const shop=!!roll.shopOpen;I('overlay').dataset.litePage=shop?'shop':'supply';liteRewardPanel.dataset.page=shop?'shop':'supply';
  I('lite-shop-hero').hidden=!shop;I('lite-shop').hidden=!shop;I('lite-next').hidden=!shop;
  I('v3-reward-choices').hidden=shop;I('lite-choice-refresh').hidden=shop;I('v3-shop-open').hidden=shop;I('lite-reward-summary').hidden=shop;
  I('lite-reward-summary').textContent=roll.chosenTool?'已领取 '+liteTool(roll.chosenTool).name+' ×1':'免费补给 · 选择一件';
  I('lite-reward-title').textContent=shop?'道具商店':'补给站';I('dialog-tag').textContent=shop?'ROTATION V3 · 商店':'ROTATION V3 · 三选一';
  I('lite-shop-wallet').textContent=`${L.lite.coins} 金币`;I('v3-shop-open').disabled=!!roll.adReadyAt;
  const choices=I('v3-reward-choices');choices.replaceChildren();
  for(const id of roll.toolOptions){
    const tool=liteTool(id),button=document.createElement('button');button.className='v3-reward-choice';button.type='button';button.dataset.tool=id;button.dataset.kind=tool.blockEffect?'special':'tool';button.disabled=roll.settled||!!roll.adReadyAt;
    button.innerHTML='<span class="v3-choice-art">'+liteIcon(id)+'</span><span class="v3-choice-copy"><small></small><strong></strong><span></span></span><b>+1</b><span class="v3-choice-claim">领取 <i>→</i></span>';
    button.querySelector('small').textContent=tool.blockEffect?'特殊方块':'道具';button.querySelector('strong').textContent=tool.name;button.querySelector('.v3-choice-copy>span').textContent=tool.description;
    button.dataset.claimed=String(roll.chosenTool===id);
    if(roll.settled){button.querySelector('.v3-choice-claim').textContent=roll.chosenTool===id?'已领取':'未选择';button.querySelector('b').textContent=roll.chosenTool===id?'✓':'';}
    button.onclick=()=>{if(!L.liteChooseTool(id))return;liteSync();d3();liteUpdateReward();liteSaveSafe();se.play('clear');I('lite-refresh-reward').focus({preventScroll:true});};choices.append(button);
  }
  const category=roll.shopCategory||'all';for(const b of I('lite-shop-categories').children)b.setAttribute('aria-pressed',String(b.dataset.category===category));
  const offers=I('lite-shop-offers');offers.replaceChildren();
  for(const offer of roll.shopOffers||[]){
    const tool=offer.kind==='special'?liteTool('block-'+offer.item):liteTool(offer.item),button=document.createElement('button');button.type='button';button.className='lite-shop-buy';button.dataset.slot=offer.slot;button.hidden=category!=='all'&&offer.kind!==category;
    button.innerHTML='<span class="v3-shop-card-heading"><strong></strong><span class="v3-shop-card-labels"><span class="v3-shop-owned" hidden></span><span class="lite-shop-category"></span></span></span><span class="lite-shop-art">'+liteIcon(tool.id)+'</span><span class="lite-shop-price"></span>';
    const owned=L.lite.tools[tool.id]||0,badge=button.querySelector('.v3-shop-owned');badge.hidden=owned<=0;badge.textContent=`已拥有 ×${owned}`;
    button.querySelector('strong').textContent=tool.name;button.querySelector('.lite-shop-category').textContent=tool.blockEffect?'特殊方块':'道具';button.querySelector('.lite-shop-price').textContent=`${L.liteOfferPrice(offer)} 金币`;
    button.title=tool.description;button.onclick=event=>liteOpenShopDetail(offer,button,event);offers.append(button);
  }
  liteUpdateRefresh();
}
function liteUpdateRefresh(){
  const r=L.lite.roll;if(!r||!I('lite-refresh-reward'))return;
  const button=I('lite-refresh-reward'),free=r.freeRefreshes,ads=r.adRefreshes,waiting=!!r.adReadyAt;
  button.dataset.action=r.settled?'next':'refresh';button.disabled=r.settled?liteRewardAdvance===r:waiting||(!free&&!ads);liteText(button,r.settled?'下一关':waiting?'观看中…':free?'免费刷新':ads?'看广告刷新':'刷新次数已用完');
  I('lite-refresh-status').hidden=r.settled;
  liteText(I('lite-refresh-status'),waiting?'广告播放中…':`免费 ${free} 次 · 广告 ${ads} 次`);
}

// Keep the clear acknowledgement on the board, before opening the dice destination.
function liteResetCompletion(){
  liteCompletionState?.walletAnimation?.cancel();liteCompletionState?.node.remove();liteCompletionState=null;liteCompletionStage=-1;delete I('stage').dataset.liteClear;
}
function liteShowCompletion(){
  if(liteCompletionState)return;
  // Resumed clears from older rule files may not have credited the award yet.
  L.liteAwardClearCoins();
  liteCompletionStage=L.stage;
  const node=document.createElement('div');node.id='lite-stage-clear';node.setAttribute('role','status');node.setAttribute('aria-live','polite');node.setAttribute('aria-atomic','true');node.tabIndex=-1;
  node.innerHTML='<div class="lite-clear-emblem"><img class="lite-clear-lettering" src="./assets/ui/stage-clear-c-v1.png" width="2017" height="780" alt="通关成功" draggable="false"><div class="lite-clear-coins"><svg viewBox="0 0 20 20" aria-hidden="true" shape-rendering="crispEdges"><path fill="#143b83" d="M5 1h10v2h3v3h1v9h-2v3h-3v1H6v-1H3v-3H1V6h2V3h2z"/><path fill="#ffcc32" d="M6 3h8v2h3v10h-3v2H6v-2H3V6h3z"/><path fill="#fff1a0" d="M6 4h8v2H6zM4 6h2v8H4z"/><path fill="#cb791b" d="M9 7h3v7H9z"/><path fill="#fff1a0" d="M8 6h3v7H8z"/></svg><span>金币</span><strong>+'+liteConfig.clearCoins+'</strong></div><span class="lite-clear-pixels" aria-hidden="true"></span></div>';

  const particles=node.querySelector('.lite-clear-pixels');
  for(let i=0;i<28;i++){
    const pixel=document.createElement('i'),angle=i*Math.PI*2/28;
    pixel.style.setProperty('--clear-x',Math.round(Math.cos(angle)*(112+i%4*18))+'px');
    pixel.style.setProperty('--clear-y',Math.round(Math.sin(angle)*(76+i%3*24))+'px');
    pixel.style.setProperty('--clear-delay',i%4*35+'ms');pixel.style.setProperty('--clear-size',i%3===0?'9px':'5px');particles.append(pixel);
  }
  const reward=L.liteClearCoinReward(),batches=[...(reward.overflow>0?[{kind:'overflow',label:'溢出金币',amount:reward.overflow}]:[]),{kind:'base',label:'通关金币',amount:reward.base}];
  liteCompletionState={node,stage:L.stage,elapsed:0,last:performance.now(),coinTotal:reward.total,coinArrived:0,coinFlights:[],coinStarted:false,coinsSettledAt:null,batches,batchIndex:0,batchArrived:0,batchStartedAt:0,batchSettledAt:null};
  liteSetClearCoinBatch(liteCompletionState);
  I('overlay').hidden=true;I('game-ui').inert=true;I('game-ui').setAttribute('aria-hidden','true');I('stage').dataset.liteClear='true';I('stage').append(node);
  _t();se.play('clear');liteSaveSafe();node.focus({preventScroll:true});fe.dirty=true;
}
function liteSetClearCoinBatch(state){
  const batch=state.batches[state.batchIndex];state.node.dataset.coinSource=batch.kind;delete state.node.dataset.coinPhase;
  state.node.querySelector('.lite-clear-coins span').textContent=batch.label;
  state.node.querySelector('.lite-clear-coins strong').textContent='+'+batch.amount;
}
function liteAnimateClearCoins(state){
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(state.batchSettledAt!==null&&state.batchIndex<state.batches.length-1){
    if(state.elapsed-state.batchSettledAt<420)return;
    state.node.querySelectorAll('.lite-clear-wallet-burst').forEach(node=>node.remove());
    state.batchIndex++;state.batchArrived=0;state.batchStartedAt=state.elapsed;state.batchSettledAt=null;state.coinStarted=false;state.coinFlights=[];liteSetClearCoinBatch(state);
  }
  if(state.elapsed-state.batchStartedAt<700)return;
  const batch=state.batches[state.batchIndex];
  const root=state.node.getBoundingClientRect(),source=state.node.querySelector('.lite-clear-coins svg').getBoundingClientRect(),target=I('lite-coins').getBoundingClientRect();
  const sx=source.left+source.width/2-root.left,sy=source.top+source.height/2-root.top;
  const tx=target.left+target.width/2-root.left,ty=target.top+target.height/2-root.top;
  if(!state.coinStarted){
    state.coinStarted=true;state.node.dataset.coinPhase='flying';
    const count=Math.min(24,batch.amount);
    for(let i=0;i<count;i++){
      const coin=document.createElement('div');coin.className='lite-clear-coin-flight';coin.setAttribute('aria-hidden','true');coin.innerHTML=state.node.querySelector('.lite-clear-coins svg').outerHTML;
      state.node.append(coin);state.coinFlights.push({node:coin,arrived:false,delay:i*65,value:Math.floor((i+1)*batch.amount/count)-Math.floor(i*batch.amount/count)});
    }
  }
  for(const flight of state.coinFlights){
    if(flight.arrived)continue;
    const t=reduced?1:Math.max(0,Math.min(1,(state.elapsed-state.batchStartedAt-700-flight.delay)/650));
    flight.node.hidden=t<=0;
    const bend=sx+62,high=sy-90;
    const x=(1-t)*(1-t)*sx+2*(1-t)*t*bend+t*t*tx,y=(1-t)*(1-t)*sy+2*(1-t)*t*high+t*t*ty;
    flight.node.style.transform=`translate(${Math.round(x)-14}px,${Math.round(y)-14}px) scale(${1-t*.36})`;
    if(t>=1){
      flight.arrived=true;flight.node.remove();state.coinArrived+=flight.value;state.batchArrived+=flight.value;
      if(!reduced){state.walletAnimation?.cancel();state.walletAnimation=I('lite-coins').animate([{transform:'scale(1)',color:'#fff4b0'},{transform:'scale(1.6)',color:'#ffe24f',offset:.3},{transform:'scale(1)',color:'#fff4b0'}],{duration:260,easing:'ease-out'});}
    }
  }
  if(state.batchArrived===batch.amount&&state.batchSettledAt===null){
    state.batchSettledAt=state.elapsed;if(state.batchIndex===state.batches.length-1)state.coinsSettledAt=state.elapsed;state.node.dataset.coinPhase='settled';se.play('clear');
    const burst=document.createElement('div');burst.className='lite-clear-wallet-burst';burst.setAttribute('aria-hidden','true');burst.style.left=Math.max(12,tx+22)+'px';burst.style.top=Math.max(12,ty-8)+'px';
    const points=document.createElement('strong');points.textContent='+'+batch.amount;burst.append(points);
    if(!reduced)for(let i=0;i<12;i++){const pixel=document.createElement('i'),angle=i*Math.PI/6;pixel.style.setProperty('--coin-x',Math.cos(angle)*(26+i%3*9)+'px');pixel.style.setProperty('--coin-y',Math.sin(angle)*(20+i%3*6)+'px');burst.append(pixel);}
    state.node.append(burst);
  }
}
function liteUpdateCompletion(now){
  const state=liteCompletionState;if(!state)return;
  if(!he||state.stage!==L.stage||!['checkpoint-complete','level-complete'].includes(L.phase)){liteResetCompletion();return;}
  const delta=Math.min(50,now-state.last);state.last=now;if(G0||Pt||me.active||document.hidden)return;
  state.elapsed+=delta;liteAnimateClearCoins(state);
  if(state.coinsSettledAt===null)return;
  const settled=state.elapsed-state.coinsSettledAt;
  if(settled>=520)state.node.classList.add('is-leaving');
  if(settled>=720){
    // Open the destination before releasing the clear overlay and its visible HUD.
    liteShowReward();
    state.walletAnimation?.cancel();state.node.remove();liteCompletionState=null;delete I('stage').dataset.liteClear;liteSync();
  }
}
function liteShowReward(){
  liteCreateReward();L.litePrepareReward();v3RegisterRankClear();liteRewardStage=L.stage;
  Ht('','','','');I('overlay').dataset.liteReward='true';I('game-ui').inert=true;I('game-ui').setAttribute('aria-hidden','true');
  liteRewardPanel.hidden=false;I('overlay').querySelector('.dialog').setAttribute('aria-labelledby','lite-reward-title');
  I('start').hidden=true;liteUpdateReward();liteSaveSafe();
  if(L.lite.roll.settled)I('lite-refresh-reward').focus({preventScroll:true});else I('v3-reward-choices').querySelector('button')?.focus({preventScroll:true});
}
Qt=function(){
  if(G0||me.active||Ie.busy||Vt||pe.particles.length||k0)return;
  if(['checkpoint-complete','level-complete'].includes(L.phase)){
    if(L.lite.roll||liteCompletionStage===L.stage){if(!liteCompletionState)liteShowReward();}
    else liteShowCompletion();
    return;
  }
  if(L.phase==='lost'||L.phase==='won'){
    if(I('overlay').dataset.liteEnd===L.phase&&!I('overlay').hidden)return;
    liteCloseReward();const won=L.phase==='won';let best=0;try{best=Number(localStorage.getItem('rotationLiteBest')||0);if(L.score>best){best=L.score;localStorage.setItem('rotationLiteBest',String(best));}O9(localStorage);}catch{}
    Ht(won?'这次旋转，圆满通关。':'再转一次，会更好。',`${won?'全部小关已完成。':L.reason||'本局已结束。'}\n本局得分 ${Ne(L.score)} · 最佳 ${Ne(best)}\n${won?'':'已到达第 '+(L.stage+1)+' 关。\n'}`,'再玩一局',won?'RUN COMPLETE':'TRY AGAIN');I('overlay').dataset.liteEnd=L.phase;I('game-ui').inert=true;if(!won)liteShowRevive();return;
  }
  if(L.phase==='play'&&!L.stageCommitted)L.beginStage();
};
const liteOriginalHt=Ht;
Ht=function(...args){liteCloseReward();I('start').disabled=false;delete I('overlay').dataset.liteEnd;return liteOriginalHt(...args);};
function liteShowRevive(){
  const panel=I('revive-panel');panel.replaceChildren();panel.hidden=false;
  const button=document.createElement('button');button.id='lite-revive-ad';button.type='button';button.className='revive-action';
  button.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M5 3h3v2h3v2h3v2h3v2h-3v2h-3v2H8v2H5z"/></svg><span>看广告复活</span>';
  const note=document.createElement('p');note.className='revive-note';note.textContent='投放 +10 次 · 补满虚线内空格';
  button.onclick=()=>{if(!L.liteStartReviveAd())return;se.unlock();liteUpdateRevive();};panel.append(button,note);liteUpdateRevive();
}
function liteUpdateRevive(){
  const button=I('lite-revive-ad');if(!button||I('revive-panel').hidden||L.phase!=='lost')return;
  const ad=L.lite.reviveAd;button.disabled=!!ad;I('start').disabled=!!ad;
  button.querySelector('span').textContent=ad?'广告播放中…':'看广告复活';
  if(!ad||Date.now()<ad.readyAt)return;
  const scoreBefore=L.score;if(!L.liteFinishReviveAd())return;
  I('revive-panel').hidden=true;I('start').disabled=false;delete I('overlay').dataset.liteEnd;
  Ie.reset();pe.reset();V9=scoreBefore;G3();G0=false;Pt=false;k0=null;yt=0;q9=0;y5();I('overlay').hidden=true;I('game-ui').inert=false;I('game-ui').removeAttribute('aria-hidden');H3=-1;d3();Qt();liteSaveSafe();
}
I('start').onclick=event=>{
  if(!he&&!Qe)g5=false;
  if(me.active)return;se.unlock();
  if(G0){$9();return;}
  if(!he&&Qe){Gf();return;}
  if(['checkpoint-complete','level-complete'].includes(L.phase)&&he)return;
  z6({mode:he?'fluid':'submerge',element:event.currentTarget,event,kicker:'旋轴填形 · 道具补给',title:'第 1 关',palette:l5[0],swap:()=>ka(true)});
};
const v3Help='接住方块，旋转结构，填满虚线轮廓得分。达到本关目标即可通关。\n\n通关后从三件补给中选一件。普通道具可直接使用；特殊方块用于改造当前下落块。快捷栏最多3种，多余道具存入背包，用完按顺序补位。背包内可调整顺序。\n\n金币可在关间商店购买道具或特殊方块。每次补给可免费刷新一次，之后可看广告刷新三次。失败时可看广告复活，增加10次投放并补满当前虚线内空格。\n\n方向键移动，R或↑旋转，空格投放。';
I('help').onclick=()=>{if(me.active||!he||k0||Ie.busy||L.phase!=='play')return;G0=true;_t();se.pause();Ht('转一转，填满这一圈。',v3Help,'继续游戏','ROTATION V3');I('game-ui').inert=true;};
const rulesEntry=document.createElement('button');rulesEntry.id='v3-rules-open';rulesEntry.type='button';rulesEntry.setAttribute('aria-label','查看玩法规则');rulesEntry.title='玩法规则';rulesEntry.setAttribute('aria-haspopup','dialog');
rulesEntry.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" shape-rendering="crispEdges"><path fill="currentColor" d="M7 3h10v2h3v7h-3v3h-3v3h-4v-6h3V9h3V7H8v3H4V6h3zM10 20h4v4h-4z"/></svg>';
rulesEntry.onclick=()=>{if(liteCanAct())I('help').click();};I('game-ui').append(rulesEntry);
// Lightweight saves retain the existing game object, with their own namespace.
P6=function(text){const value=JSON.parse(text,Lf),g=value?.game;
  if(value?.version!=='rotation-v3-1'||!g?.lite||!Array.isArray(g.board)||!['play','checkpoint-complete','lost','won'].includes(g.phase)||!Number.isInteger(g.stage)||g.stage<0)throw Error('V3存档无效');
  const probe=new e9(42);Object.assign(probe,g);probe.liteEnsureExpansion();
  if(!probe.valid(probe.board,[])||probe.active&&!probe.valid(probe.cells()))throw Error('V3棋盘无效');return value;
};
jr=function(storage,game,fallTime){if(!['play','checkpoint-complete','lost','won'].includes(game.phase)||game.events.length||k0||Ie.busy)throw Error('等待棋盘结算');const text=JSON.stringify({version:'rotation-v3-1',savedAt:Date.now(),fallTime,game},Jr);P6(text);storage.setItem(o5,text);};
Qr=function(game,value){const saved=P6(JSON.stringify(value,Jr));Object.assign(game,saved.game);game.liteEnsureExpansion();return Math.min(.8,saved.fallTime||0);};
function liteSaveSafe(){try{if(he&&!k0&&!Ie.busy&&['play','checkpoint-complete'].includes(L.phase))jr(localStorage,L,yt);}catch{}}
f5=function(){Qe=null;N3=false;try{Qe=I6(localStorage);}catch{I('home-save-summary').textContent='V3 存档无法读取，可以重新开始。';}
  I('start').innerHTML=Df;const label=I('start').querySelector('.home-start-content > span');if(label)label.textContent=Qe?'继续 V3':'开始游戏';I('start').setAttribute('aria-label',Qe?'继续 V3':'开始游戏');I('start').disabled=false;I('home-new-run').hidden=!Qe;
  if(Qe)I('home-save-summary').textContent=`已保存 · ${Qe.game.endless?'无尽模式 · ':''}第 ${Qe.game.stage+1} 关 · ${Qe.game.score} 分`;else I('home-save-summary').textContent='道具补给 · 特殊方块 · 旋转消除';
  if(typeof v3ReconcileRankGifts==='function'){v3ReadGroundState();v3ReconcileRankGifts();v3HomeSync();}
};
g5=true;m5=true;pa=function(){z3.hidden=true;};pa();z3.onclick=null;
const liteOriginalB6=B6;
B6=function(){
  const leave=()=>{liteResetCompletion();liteCloseReward();liteRewardStage=-1;liteOriginalB6();};
  if(rotationCodex.dialog.open){
    if(rotationCodex.dialog.dataset.v3Closing==='true')return;
    rotationCodex.dialog.addEventListener('close',leave,{once:true});rotationCodex.close('home');
  }else leave();
};
const liteOriginalGf=Gf;
Gf=function(){liteResetCompletion();liteRewardStage=-1;liteOriginalGf();liteSync();};
// Catalogue previews run on throwaway models and never touch the live save.
const rotationCodex=createRotationCodex({config:liteConfig,makeGame:()=>new e9(42),entry:I('home-library-open'),onResume:()=>{se.unlock();$9();},onHome:()=>I('return-home').click()});
Fa=function(){_t();G0=true;se.pause();I('overlay').dataset.pause='true';I('stage').classList.add('pause-active');I('game-ui').inert=true;I('game-ui').setAttribute('aria-hidden','true');rotationCodex.open(I('pause'),{mode:'pause'});};
I('exit-dialog').addEventListener('close',()=>{if(rotationCodex.dialog.open)I('v3-pause-home').focus({preventScroll:true});});
const rotationBackpack=createRotationBackpack({rail:toolRail,config:liteConfig,game:()=>L,canOpen:liteCanAct,pause:()=>{const previous=G0;G0=true;_t();se.pause();return previous;},resume:previous=>{G0=previous;u3=performance.now();_t();if(!previous)se.unlock();liteSync();liteSaveSafe();},changed:()=>{liteSync();liteSaveSafe();}});
function liteSyncInventory(){
  const inv=L.liteInventory(),key=inv.active.join('|');
  if(toolRail.dataset.order!==key){for(const id of inv.active)toolRail.append(I('lite-'+id));toolRail.append(rotationBackpack.entry);toolRail.dataset.order=key;}
  const button=rotationBackpack.entry;button.disabled=!liteCanAct();liteText(button.querySelector('b'),inv.reserve.length);button.querySelector('b').hidden=!inv.reserve.length;button.setAttribute('aria-label','背包，暂存'+inv.reserve.length+'种道具');
}
// The score and life display share the progress track; throws sit over the piece queue.
const lifeLine=I('lives').closest('.life-line'),lifeHearts=document.createElement('span');lifeHearts.id='v3-life-hearts';lifeHearts.setAttribute('aria-hidden','true');lifeLine.append(lifeHearts);I('goal-track').parentElement.prepend(lifeLine);I('game-ui').append(I('drop-budget'));
function liteSyncLives(){
  const value=String(L.lives);if(lifeHearts.dataset.lives===value)return;
  lifeHearts.dataset.lives=value;lifeHearts.replaceChildren();
  for(let i=0;i<L.lives;i++){const heart=lifeLine.querySelector('.life-pixel-face').cloneNode(true);heart.removeAttribute('id');heart.classList.add('v3-life-heart');lifeHearts.append(heart);}
  lifeLine.setAttribute('aria-label','剩余生命 '+value);
}
const homeBadge=document.createElement('span');homeBadge.className='lite-home-badge';homeBadge.textContent='ROTATION V3 · 道具补给';I('overlay').append(homeBadge);
// Ranked home: one shared mode, a slowly turning pixel sky, and a small tower
// that stores the ordinary blocks earned from completed stages.
const v3HomeOverlay=I('overlay');v3HomeOverlay.dataset.v3Home='true';
const v3HomePanel=document.createElement('section');v3HomePanel.id='v3-home-panel';v3HomePanel.setAttribute('aria-labelledby','v3-home-title');
v3HomePanel.innerHTML='<header class="v3-home-head"><div><p>ROTATION V3 · 排行挑战</p><h1 id="v3-home-title">云端地基</h1></div><span class="v3-home-record" id="v3-home-record">已通关 0 关</span></header><div class="v3-home-scene"><canvas id="v3-home-canvas" width="760" height="920" aria-label="像素天空与方块地基"></canvas><div class="v3-home-scene-label">四面天空盒 · 缓慢旋转</div><div class="v3-home-piece-label" id="v3-home-piece-label">通关后获得普通方块</div><div class="v3-home-controls" id="v3-home-controls" role="group" aria-label="操作赠送方块"><button type="button" id="v3-home-left" aria-label="向左移动">←</button><button type="button" id="v3-home-rotate" aria-label="旋转方块">↻</button><button type="button" id="v3-home-right" aria-label="向右移动">→</button><button type="button" id="v3-home-drop" aria-label="放下方块">↓ 放下</button></div></div><div class="v3-home-info"><strong id="v3-home-gift-count">地面 0 格</strong><span id="v3-home-status">完成排行关卡后，获得一块普通方块</span></div><div class="v3-home-actions"><button type="button" id="v3-home-start">开始排行挑战 <span>→</span></button><button type="button" id="v3-home-rank">查看排行</button></div><p class="v3-home-note">每通关一关获得一块随机普通方块 · 至少一格必须落在矩形地基上</p>';
v3HomeOverlay.querySelector('.dialog').append(v3HomePanel);
const v3HomeCanvas=I('v3-home-canvas'),v3HomeCtx=v3HomeCanvas.getContext('2d');
const v3HomePieces=[
  {id:'bar',name:'长条方块',color:'#68e6ff',cells:[[0,0],[1,0],[2,0],[3,0]]},
  {id:'corner',name:'转角方块',color:'#ffcf4b',cells:[[0,0],[0,1],[1,0],[2,0]]},
  {id:'zig',name:'折线方块',color:'#a7f06a',cells:[[0,0],[1,0],[1,1],[2,1]]},
  {id:'block',name:'方块',color:'#ff7da9',cells:[[0,0],[1,0],[0,1],[1,1]]},
  {id:'tee',name:'三叉方块',color:'#a48cff',cells:[[0,0],[1,0],[2,0],[1,1]]}
];
const v3GroundKey='rotationV3GroundGiftsV1';let v3GroundState={cleared:0,granted:0,settled:0,queue:[],active:null,tower:[]};let v3HomeFrameId=0,v3HomeLast=0,v3HomeGravity=0;
function v3RandomPiece(){return v3HomePieces[Math.floor(Math.random()*v3HomePieces.length)].id;}
function v3PieceById(id){return v3HomePieces.find(piece=>piece.id===id)||v3HomePieces[0];}
function v3ReadGroundState(){try{const stored=JSON.parse(localStorage.getItem(v3GroundKey)||'{}');if(stored&&typeof stored==='object')v3GroundState={...v3GroundState,...stored,queue:Array.isArray(stored.queue)?stored.queue:[],tower:Array.isArray(stored.tower)?stored.tower:[]};}catch{}}
function v3CompletedRankStages(){let count=0;const inspect=game=>{if(!game)return;const stages=game.lite?.completedStages;if(Array.isArray(stages))count=Math.max(count,stages.length);if(Number.isInteger(game.stage))count=Math.max(count,game.stage);};inspect(L);try{const saved=JSON.parse(localStorage.getItem('rotationV3SuspendedRunV1')||'null');inspect(saved?.game);}catch{}return count;}
function v3SaveGroundState(){try{localStorage.setItem(v3GroundKey,JSON.stringify(v3GroundState));}catch{}}
function v3ReconcileRankGifts(){const completed=Math.max(Number(v3GroundState.cleared)||0,v3CompletedRankStages());v3GroundState.cleared=completed;while((Number(v3GroundState.granted)||0)<completed){v3GroundState.queue.push(v3RandomPiece());v3GroundState.granted++;}v3EnsureActivePiece();v3SaveGroundState();}
function v3RegisterRankClear(){v3ReadGroundState();const completed=Math.max(v3GroundState.cleared||0,v3CompletedRankStages());v3GroundState.cleared=completed;while((Number(v3GroundState.granted)||0)<completed){v3GroundState.queue.push(v3RandomPiece());v3GroundState.granted++;}v3EnsureActivePiece();v3SaveGroundState();v3HomeSync();}
function v3EnsureActivePiece(){if(!v3GroundState.active&&v3GroundState.queue.length){v3GroundState.active={id:v3GroundState.queue[0],x:0,y:8,rotation:0};}}
function v3RotatedCells(piece){let cells=piece.cells.map(([x,y])=>[x,y]);for(let i=0;i<((v3GroundState.active?.rotation||0)%4);i++)cells=cells.map(([x,y])=>[-y,x]);const minX=Math.min(...cells.map(cell=>cell[0])),minY=Math.min(...cells.map(cell=>cell[1]));return cells.map(([x,y])=>[x-minX,y-minY]);}
function v3HomeCells(active=v3GroundState.active,yOverride=active?.y){if(!active)return [];const piece=v3PieceById(active.id),cells=v3RotatedCells(piece);return cells.map(([x,y])=>({x:x+active.x,y:yOverride+y}));}
function v3GroundOccupied(x,y){return v3GroundState.tower.some(cell=>cell.x===x&&cell.y===y);}
function v3HomeFits(cells){return cells.every(cell=>cell.x>=-5&&cell.x<=5&&cell.y>=0&&!v3GroundOccupied(cell.x,cell.y));}
function v3HomeSupported(cells){return cells.some(cell=>cell.y===0&&cell.x>=-3&&cell.x<=3||v3GroundOccupied(cell.x,cell.y-1));}
function v3HomeMove(dx){const active=v3GroundState.active;if(!active)return;const cells=v3HomeCells({...active,x:active.x+dx});if(v3HomeFits(cells)){active.x+=dx;v3SaveGroundState();v3HomeSync();}}
function v3HomeRotate(){const active=v3GroundState.active;if(!active)return;const next={...active,rotation:(active.rotation+1)%4};if(v3HomeFits(v3HomeCells(next))){active.rotation=next.rotation;v3SaveGroundState();v3HomeSync();}}
let v3HomeMessage='';
function v3HomeDrop(){const active=v3GroundState.active;if(!active)return;let y=active.y;while(y>0&&v3HomeFits(v3HomeCells(active,y-1)))y--;const cells=v3HomeCells(active,y);if(!v3HomeSupported(cells)){active.y=8;v3HomeMessage='至少一格要落在矩形地基上';v3HomeSync();return;}active.y=y;v3GroundState.tower.push(...cells.map(cell=>({...cell,color:v3PieceById(active.id).color})));v3GroundState.queue.shift();v3GroundState.active=null;v3GroundState.settled++;v3EnsureActivePiece();v3SaveGroundState();v3HomeMessage=v3GroundState.active?'继续放置下一块普通方块':'等待下一次通关奖励';v3HomeSync();}
function v3HomeTick(dt){const active=v3GroundState.active;if(!active)return;v3HomeGravity+=dt;if(v3HomeGravity<650)return;v3HomeGravity=0;const next=v3HomeCells(active,active.y-1);if(active.y>0&&v3HomeFits(next)){active.y--;v3SaveGroundState();}v3HomeSync();}
function v3DrawHome(now){if(!v3HomeLast)v3HomeLast=now;const dt=Math.min(50,now-v3HomeLast);v3HomeLast=now;v3HomeTick(dt);const ctx=v3HomeCtx,w=v3HomeCanvas.width,h=v3HomeCanvas.height,yGround=Math.floor(h*.72),yaw=(now*.000012)%1;const sky=ctx.createLinearGradient(0,0,0,yGround);sky.addColorStop(0,'#102f91');sky.addColorStop(.55,'#1e72d7');sky.addColorStop(1,'#42c7e6');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);for(let side=0;side<4;side++){const x0=side*w/4;ctx.fillStyle=side%2?'#62d6ee16':'#081c7418';ctx.fillRect(x0,0,w/4,yGround);ctx.strokeStyle='#b7efff30';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x0,0);ctx.lineTo(x0,yGround);ctx.stroke();}for(let i=0;i<80;i++){const x=(i*97+(yaw*w*1.5))%w,y=(i*53)%Math.max(1,yGround-30);ctx.fillStyle=i%9===0?'#d9ff65':'#dcf7ff';ctx.globalAlpha=.16+(i%5)*.07;ctx.fillRect(x,y,3+(i%3),3+(i%2));}for(let i=0;i<9;i++){const x=((i*147+yaw*w*2)% (w+180))-90,y=110+(i%4)*62;ctx.globalAlpha=.14;ctx.fillStyle=i%2?'#d4f8ff':'#b7dcff';ctx.fillRect(x,y,110,18);ctx.fillRect(x+24,y-12,48,18);ctx.fillRect(x+66,y+7,38,12);}ctx.globalAlpha=1;ctx.fillStyle='#16326f';ctx.fillRect(0,yGround,w,h-yGround);for(let x=0;x<w;x+=28){ctx.fillStyle=(x/28)%2?'#244990':'#2e5eaa';ctx.fillRect(x,yGround+9,22,9);ctx.fillStyle='#8ce8e8';ctx.fillRect(x+4,yGround+2,12,5);}const cellSize=34,baseX=w/2-cellSize/2,baseY=yGround-4;ctx.fillStyle='#9ff2ff';ctx.strokeStyle='#143879';ctx.lineWidth=3;ctx.fillRect(baseX-cellSize*3,baseY,cellSize*7,15);ctx.strokeRect(baseX-cellSize*3,baseY,cellSize*7,15);for(const cell of v3GroundState.tower){const x=baseX+cell.x*cellSize,y=baseY-(cell.y+1)*cellSize;ctx.fillStyle=cell.color||'#70dcef';ctx.fillRect(x,y,cellSize-3,cellSize-3);ctx.strokeStyle='#122f72';ctx.strokeRect(x,y,cellSize-3,cellSize-3);}if(v3GroundState.active){const piece=v3PieceById(v3GroundState.active.id),cells=v3HomeCells();for(const cell of cells){const x=baseX+cell.x*cellSize,y=baseY-(cell.y+1)*cellSize;ctx.fillStyle=piece.color;ctx.fillRect(x,y,cellSize-3,cellSize-3);ctx.strokeStyle='#fff5ad';ctx.strokeRect(x,y,cellSize-3,cellSize-3);}}ctx.globalAlpha=1;v3HomeFrameId=requestAnimationFrame(v3DrawHome);}
function v3HomeSync(){v3HomePanel.querySelector('#v3-home-record').textContent=`已通关 ${v3GroundState.cleared||0} 关`;v3HomePanel.querySelector('#v3-home-gift-count').textContent=`地面 ${v3GroundState.settled||0} 格 · 待放 ${v3GroundState.queue.length+(v3GroundState.active?1:0)} 块`;const active=v3GroundState.active;v3HomePanel.querySelector('#v3-home-piece-label').textContent=active?`获得：${v3PieceById(active.id).name} · 调整位置后放下`:'通关后获得普通方块';v3HomePanel.querySelector('#v3-home-status').textContent=v3HomeMessage||(active?'至少一格落在矩形地基上即可继续搭建':'完成排行关卡后，获得一块普通方块');}
v3ReadGroundState();v3ReconcileRankGifts();v3HomeSync();v3HomeFrameId=requestAnimationFrame(v3DrawHome);
I('v3-home-start').onclick=()=>I('start').click();I('v3-home-left').onclick=()=>v3HomeMove(-1);I('v3-home-right').onclick=()=>v3HomeMove(1);I('v3-home-rotate').onclick=()=>v3HomeRotate();I('v3-home-drop').onclick=()=>v3HomeDrop();I('v3-home-rank').onclick=()=>{const score=Number(L?.score||0);I('v3-home-status').textContent=score?`当前排行分 ${score} · 完成更多关卡领取方块`:'排行榜将在首次通关后记录分数';};
addEventListener('keydown',event=>{if(v3HomeOverlay.hidden||v3HomeOverlay.dataset.home!=='true'||v3HomePanel.hidden)return;if(['ArrowLeft','a','ArrowRight','d','ArrowUp','w',' ','Enter'].includes(event.key)){event.preventDefault();if(event.key==='ArrowLeft'||event.key==='a')v3HomeMove(-1);else if(event.key==='ArrowRight'||event.key==='d')v3HomeMove(1);else if(event.key==='ArrowUp'||event.key==='w')v3HomeRotate();else v3HomeDrop();}});
// Pause controls reuse the existing catalogue and audio engine.
const pauseCodex=document.createElement('button');pauseCodex.id='pause-codex';pauseCodex.type='button';pauseCodex.textContent='图鉴';pauseCodex.setAttribute('aria-haspopup','dialog');pauseCodex.setAttribute('aria-controls','v3-codex');
pauseCodex.onclick=()=>rotationCodex.open(pauseCodex);
const pauseActions=I('pause-tools').querySelector('.pause-actions');
for(const button of [I('sound'),I('pause-settings'),I('help'),pauseCodex])pauseActions.insertBefore(button,I('collection-open'));
I('sound').innerHTML='<svg class="v3-sound-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" shape-rendering="crispEdges"><path d="M2 9h4l5-5h2v16h-2l-5-5H2z"/><path class="v3-sound-waves" d="M15 8h2v2h2v4h-2v2h-2v-3h2v-2h-2zM18 3h2v3h2v3h1v6h-1v3h-2v3h-2v-4h2V7h-2z"/><path class="v3-sound-muted" d="M16 8h2v2h2V8h2v2h-2v4h2v2h-2v-2h-2v2h-2v-2h2v-4h-2z"/></svg>';
function liteSyncSound(){const button=I('sound'),muted=String(se.muted);if(button.dataset.muted===muted)return;button.dataset.muted=muted;button.setAttribute('aria-pressed',muted);button.setAttribute('aria-label',se.muted?'开启声音':'静音');button.title=se.muted?'开启声音':'静音';}
I('sound').onclick=()=>{se.setMuted(!se.muted);liteSyncSound();};liteSyncSound();

const audioSettings=document.createElement('section');audioSettings.className='v3-audio-settings';audioSettings.setAttribute('aria-label','声音设置');
audioSettings.innerHTML='<button id="v3-audio-toggle" type="button" aria-label="静音"></button><label for="v3-volume">音量</label><input id="v3-volume" type="range" min="0" max="100" step="1"><output for="v3-volume" id="v3-volume-value"></output>';
I('motion-tuner').querySelector('header').after(audioSettings);I('v3-audio-toggle').innerHTML=I('sound').innerHTML;
let v3Volume=100,v3Muted=false;
try{const saved=JSON.parse(localStorage.getItem('rotationV3AudioV1'));if(saved&&Number.isFinite(saved.volume)){v3Volume=Math.max(0,Math.min(100,saved.volume));v3Muted=!!saved.muted;}}catch{}
const originalAudioSetup=se.setup.bind(se),originalAudioMute=se.setMuted.bind(se);
function v3ApplyVolume(){if(se.master)se.master.gain.setValueAtTime(se.muted?0:.35*v3Volume/100,se.ctx.currentTime);}
se.setup=function(){originalAudioSetup();v3ApplyVolume();};
se.setMuted=function(value){originalAudioMute(value);v3ApplyVolume();};
function v3SyncAudio(save=false){
  se.setMuted(v3Muted||v3Volume===0);const button=I('v3-audio-toggle');button.dataset.muted=String(se.muted);button.setAttribute('aria-pressed',String(se.muted));button.setAttribute('aria-label',se.muted?'开启声音':'静音');I('v3-volume').value=v3Volume;I('v3-volume-value').textContent=se.muted?'静音':v3Volume+'%';
  if(save)try{localStorage.setItem('rotationV3AudioV1',JSON.stringify({volume:v3Volume,muted:v3Muted}));}catch{I('v3-volume-value').textContent='保存失败';}
}
I('v3-audio-toggle').onclick=()=>{if(se.muted){v3Muted=false;if(!v3Volume)v3Volume=100;}else v3Muted=true;se.unlock();v3SyncAudio(true);se.play('ui');};
I('v3-volume').oninput=()=>{v3Volume=Number(I('v3-volume').value);v3Muted=false;se.unlock();v3SyncAudio(true);};
I('v3-volume').onchange=()=>se.play('ui');v3SyncAudio();

// Keep only effect copy, actions and actionable status in player dialogs.
I('exit-description').hidden=true;I('exit-dialog').removeAttribute('aria-describedby');
I('exit-save').querySelector('strong').textContent='保存并退出';I('exit-save').querySelector('small').textContent='';
I('exit-discard').querySelector('strong').textContent='结束本局';I('exit-discard').querySelector('small').textContent='清除本局进度';
I('motion-tuner').removeAttribute('aria-describedby');
const settingsStatus=I('motion-tuner').querySelector('[role=status]');
const trimSettingsStatus=()=>{if(/设置自动保存|已保存到本机|并保存到本机/.test(settingsStatus.textContent))settingsStatus.textContent='';};
new MutationObserver(trimSettingsStatus).observe(settingsStatus,{childList:true,characterData:true,subtree:true});trimSettingsStatus();

// Cell-owned multipliers stay attached to the rendered cell through every move.
const heavyMarkers=document.createElement('div');heavyMarkers.id='lite-heavy-markers';heavyMarkers.setAttribute('aria-hidden','true');I('game-ui').append(heavyMarkers);
function liteSyncHeavyMarkers(){
  const cells=L.board.filter(cell=>cell.liteHeavyBonus>0),ids=new Set(cells.map(cell=>String(cell.id)));
  for(const node of [...heavyMarkers.children])if(!ids.has(node.dataset.cell))node.remove();
  for(const cell of cells){
    let node=heavyMarkers.querySelector(`[data-cell="${cell.id}"]`);if(!node){node=document.createElement('span');node.dataset.cell=cell.id;heavyMarkers.append(node);}
    node.textContent='×'+(1+cell.liteHeavyBonus);
    const position=rotorCellPositions.get(cell.id)||cell,p=new U(position.x,position.y,position.z||0).project(Bt);
    const edge=new U(position.x+.5,position.y,position.z||0).project(Bt),width=Math.max(12,Math.abs(edge.x-p.x)*Ge.w);
    node.style.left=(p.x+1)*Ge.w/2+'px';node.style.top=Ge.top+(1-p.y)*Ge.playHeight/2+'px';node.style.fontSize=Math.max(6,Math.min(10,width/(node.textContent.length*.65)))+'px';
  }
}
function liteFrame(){if(he){liteSyncHeavyMarkers();liteUpdateRevive();liteUpdateCompletion(performance.now());liteSync();litePlayPendingAcquisition();if(L.lite.roll?.adReadyAt){if(L.liteFinishRewardAd()){d3();liteUpdateReward();liteSaveSafe();se.play('turn');}else liteUpdateRefresh();}}}
// Deterministic fixture access is only present with the explicit QA query flag.
if(new URLSearchParams(location.search).has('qa')){
  window.__liteQA={game:L,action:H6,specialVisuals:()=>liteBlockFx.snapshot(),refresh:()=>{H3=-1;V3();d3();Qt();},get paused(){return G0;},set paused(value){G0=value;},set naturalFall(value){liteNaturalFall=value;},get busy(){return !!k0||Ie.busy||!!pe.particles.length||me.active;},screenCell(x,y){const rect=I('stage').getBoundingClientRect(),p=new U(x,y,0).project(Bt);return{x:rect.left+I('stage').clientLeft+(p.x+1)*Ge.w/2,y:rect.top+I('stage').clientTop+Ge.top+(1-p.y)*Ge.playHeight/2};},start(){ka(true);},settle(){for(let i=0;i<100;i++){if(L.phase==='rotating')L.finishRotation();else if(L.phase==='clearing')L.finishClear();else if(L.phase==='settling')L.finishSettlement();else break;}L.events=[];k0=null;Ie.reset();pe.reset();V3();Qt();},renderer:de};
  window.__THREE_GAME_TEST_HOOKS__={
    async setState(name){
      if(!['active-play','reward','failure'].includes(name))throw Error('Unknown state '+name);
      ka(true);liteNaturalFall=false;
      const paths=[Array(12).fill('down'),[...Array(10).fill('down'),'rotate'],['right','right',...Array(10).fill('down'),'rotate','down','down'],['left',...Array(11).fill('down'),'rotate','down','rotate','rotate','down']];
      for(const path of paths.slice(0,name==='reward'?4:3)){for(const action of path)action==='rotate'?L.rotatePiece():L.move(action==='left'?-1:action==='right'?1:0,action==='down'?-1:0);L.drop();window.__liteQA.settle();}
      if(name==='reward'){for(let i=0;L.phase==='play'&&i<20;i++){L.board=L.target.cells.map(c=>({...c,id:L.id++,type:'L'}));L.checkClear();window.__liteQA.settle();}liteShowReward();d3();liteUpdateReward();}
      if(name==='failure'){L.dropsUsed=L.dropLimit;L.checkDropLimit();d3();Qt();}
      await new Promise(resolve=>setTimeout(resolve,1100));return {state:name};
    },
    setPausedForScreenshot(value){G0=value;},
  };
  Object.defineProperty(window,'__THREE_GAME_DIAGNOSTICS__',{get(){return {phase:L.phase,level:L.stage+1,renderer:{calls:de.info.render.calls,triangles:de.info.render.triangles,geometries:de.info.memory.geometries,textures:de.info.memory.textures},dpr:de.getPixelRatio()};}});
}
