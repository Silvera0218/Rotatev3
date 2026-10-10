/* Lightweight rules layered on the original ROTATION model. */
(function (root) {
  'use strict';
  const BUFFS = [];
  const SPECIALS = [
    {id:'column',name:'变色方块',description:'落地后，将自身所在的整列染成同色'},
    {id:'blast',name:'爆炸方块',description:'清除全部同色格，每格使本关分数增长3%',detail:'落地后清除全部同色格（含自身），正常计分。额外加分按触发前本关得分×（1.03的消除格数次方−1）计算，整批计算后四舍五入。'},
    {id:'trim',name:'修枝方块',description:'落地后，消除虚线区域外的所有方块'},
    {id:'patch',name:'金币方块',description:'消除时，按本次消除格数获得金币',detail:'落地后保留金币标记。消除时，每个金币格获得等同于本批消除格数的金币；多个金币格分别触发。铲除或重排消耗不发金币。'},
    {id:'pack',name:'强迫症方块',description:'落地后，消耗自身将其余方块向内重排'},
    {id:'heavy',name:'超重方块',description:'落地后，各格分别下落到底',detail:'落地后，方块的每一格分别下落到无法继续下落的位置；落空不扣生命。结算下落后再旋转转轴。'},
    {id:'diamond',name:'钻石方块',description:'消除时，标记的钻石格分数×3',detail:'落地后标记钻石方块自身。被标记的格子消除时，按该格基础分的3倍结算；同色普通格不受影响。标记会跟随方块移动、旋转和重排。'}
  ];
  const RULES = Object.freeze({
    levels: 5, scoreGoals: [45,80,120,180,240],
    dropLimit: 24, lateDropStart: 3, lateDropBase: 36, lateDropStep: 6, rotorDropChance: 0.06,
    colorScoring: Object.freeze({version:'lite-connected-fibonacci-v1',lineMinimum:4,connectedMinimum:5,firstBonus:4,secondBonus:8,recurrenceEnd:10}),
    coinReward: 5, clearCoins: 5, toolPrice:5, shopSlots:8, buffs: BUFFS,
    tools: [
      { id: 'shovel', name: '蔓延', description: '用随机颜色填补最外围两圈空缺。', detail:'优先填补当前最外围一圈，再向外扩一圈；每格颜色随机。' },
      { id: 'swap', name: '换块', description: '获得一个随机特殊方块。', detail:'优先填入装备槽；装备槽已满时进入暂存背包。' },
      { id: 'supply', name: '补给箱', description: '增加本关总投放次数的10%', detail:'按使用时本关总投放次数的10%增加投放机会，四舍五入；总次数包含此前已增加的次数。' },
      { id: 'dye', name: '调色瓶', description: '将当前落块染成棋盘上最多的颜色。' },
      { id: 'repair', name: '生命之心', description: '恢复 1 次落空容错，最多 3 次。' },
      ...SPECIALS.map(block=>({id:'block-'+block.id,name:block.name,blockEffect:block.id,description:block.description,detail:block.detail}))
    ],
    specials: SPECIALS,
    rewardRoutes: [{id:'tool',name:'道具补给'}]
  });
  root.ROTATION_LITE = RULES;

  const colorKey = cell => `${cell.x},${cell.y}`;
  const colorGroups = cells => {
    const occupied=new Map(cells.map(c=>[colorKey(c),c]));
    const visited=new Set(),groups=[];
    for(const seed of occupied.values()){
      if(visited.has(colorKey(seed)))continue;
      const group=[seed];visited.add(colorKey(seed));
      for(let i=0;i<group.length;i++)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const next=occupied.get(`${group[i].x+dx},${group[i].y+dy}`);
        if(next&&next.type===seed.type&&!visited.has(colorKey(next))){visited.add(colorKey(next));group.push(next);}
      }
      groups.push(group);
    }
    return groups;
  };
  root.liteColorBonus = function (size) {
    const p=RULES.colorScoring;
    if (!Number.isInteger(size) || size<p.lineMinimum) return 0;
    let previous=p.firstBonus,current=p.secondBonus;
    if (size===p.lineMinimum) return previous;
    for(let n=p.lineMinimum+2;n<=Math.min(size,p.recurrenceEnd);n++) {
      [previous,current]=[current,previous+current];
    }
    return current+Math.max(0,size-p.recurrenceEnd)*(current-previous);
  };
  root.liteBlastBonus=function(snapshot,count){
    // Exact integer arithmetic: round once after compounding all removed cells.
    const denominator=100n**BigInt(count),growth=103n**BigInt(count)-denominator;
    return Number((BigInt(snapshot)*growth*2n+denominator)/(denominator*2n));
  };
  const heavyMultiplier=cell=>1+Math.max(0,Number(cell.liteHeavyBonus)||0);
  root.liteScoreConnectedColors = function (cells, result, game) {
    const p=RULES.colorScoring;
    cells=[...new Map(cells.map(cell=>[colorKey(cell),cell])).values()];
    const lineKeys=new Set((result.runs||[]).filter(run=>run.cells.length>=p.lineMinimum).flatMap(run=>run.cells.map(colorKey)));
    const runs=colorGroups(cells).filter(group=>
      group.length>=p.connectedMinimum || group.length>=p.lineMinimum&&group.some(cell=>lineKeys.has(colorKey(cell))))
      .map(group=>{
      const bonus=root.liteColorBonus(group.length)*result.perCell;
      return {axis:'connected',type:group[0].type,cells:group,A:group.length,E:group.length,b:bonus/group.length,bonus,rotorBoosted:false};
    });
    const round=value=>Math.floor(value+.5+Number.EPSILON*Math.max(1,Math.abs(value))*8);
    const colorBonus=runs.reduce((sum,run)=>sum+run.bonus,0);
    // Attribute base points to each cell and divide each connected colour bonus
    // over its own members; a marked cell never amplifies another colour.
    const heavyCells=cells.filter(cell=>heavyMultiplier(cell)>1);
    const heavyBonus=cells.reduce((sum,cell)=>sum+result.perCell*(heavyMultiplier(cell)-1),0)+runs.reduce((sum,run)=>sum+run.bonus/run.cells.length*run.cells.reduce((n,cell)=>n+heavyMultiplier(cell)-1,0),0);
    const score0=round(result.scoreBase+colorBonus+heavyBonus);
    // Replace the already-rounded local subtotal, not its unrounded colour part.
    const base=result.base+score0-result.score0;
    const points=round(base*result.boost*result.synergyMultiplier);
    return {...result,lineRuns:result.runs,runs,qualified:runs.flatMap(run=>run.cells.map(colorKey)),colorBonus,score0,base,points,
      multiplier:result.scoreBase?score0/result.scoreBase:1,effectiveMultiplier:result.scoreBase?points/result.scoreBase:1,
      heavyBonus,heavyCellCount:heavyCells.length,heavyMaxMultiplier:Math.max(1,...heavyCells.map(heavyMultiplier)),scoringVersion:p.version};
  };

  // Extend an outline clear through whole same-colour components, while keeping
  // the original straight-line matches supplied in selected.
  root.liteExpandConnectedClear = function (board, outline, selected, game) {
    const key = cell => `${cell.x},${cell.y}`;
    const inside = new Set(outline.map(key));
    const removed = new Set(selected.map(key));
    for (const group of colorGroups(board)) {
      if (group.length >= 5 && group.some(cell => inside.has(key(cell))) && group.some(cell => !inside.has(key(cell)))) {
        for (const cell of group) removed.add(key(cell));
      }
    }
    return board.filter(cell => removed.has(key(cell)));
  };

  root.installRotationLite = function ({ Game }) {
    const p = Game.prototype;
    if (p.rotationLiteInstalled) return;
    Object.defineProperty(p, 'rotationLiteInstalled', { value: true });
    const original = {};
    for (const key of ['reset', 'spawn', 'cells', 'lock', 'finishRotation', 'awardCells',
      'completeCheckpoint', 'checkDeadlock', 'checkClear', 'resolvePendingSpecial', 'finishSettlement']) original[key] = p[key];
    const originalTarget = Object.getOwnPropertyDescriptor(p, 'target').get;
    const originalDropLimit = Object.getOwnPropertyDescriptor(p, 'dropLimit').get;
    const randomTool = game => RULES.tools[Math.floor(game.liteRandom() * RULES.tools.length)].id;
    const emptyTools = () => Object.fromEntries(RULES.tools.map(tool => [tool.id, 0]));
    const rewardPhase = game => game.phase === 'checkpoint-complete';
    p.liteInventory = function () {
      const owned=RULES.tools.filter(tool=>this.lite.tools[tool.id]>0).map(tool=>tool.id);
      const previous=Array.isArray(this.lite.toolOrder)?this.lite.toolOrder:[];
      const order=[...new Set([...previous.filter(id=>owned.includes(id)),...owned])];
      if(order.length!==previous.length||order.some((id,i)=>id!==previous[i]))this.lite.toolOrder=order;
      return {active:order.slice(0,3),reserve:order.slice(3),order};
    };
    p.liteGrantTool = function (id,count=1) {
      if(!RULES.tools.some(tool=>tool.id===id)||!Number.isInteger(count)||count<=0)return false;
      this.liteInventory();
      this.lite.tools[id]=(this.lite.tools[id]||0)+count;
      this.liteInventory();return true;
    };
    p.liteMoveTool = function (id,target) {
      const {order}=this.liteInventory(),from=order.indexOf(id);
      if(from<0||!Number.isInteger(target)||target<0||target>=order.length||target===from)return false;
      order.splice(from,1);order.splice(target,0,id);this.lite.toolOrder=order;return true;
    };
    p.liteEnsureExpansion = function () {
      this.lite.buffs=[];
      delete this.lite.mods;delete this.lite.stageState;delete this.lite.heavyTurns;
      delete this.lite.growth;delete this.lite.milestones;
      this.lite.completedStages ||= [];
      this.lite.extraDrops ??= 0;
      this.lite.tools ||= {};
      const retired={bonus:'blast',coin:'blast',chameleon:'column',pigment:'column',spread:'column',link:'heavy',charge:'heavy',prism:'pack'};
      // Saves from before the diamond block existed have no diamond counter.
      // Keep current V3 heavy blocks as heavy; migrate only those legacy saves.
      if(!Object.prototype.hasOwnProperty.call(this.lite.tools||{},'block-diamond'))retired.heavy='diamond';
      for(const [old,id] of Object.entries(retired)){
        const key='block-'+old,next='block-'+id;
        if(this.lite.tools[key])this.lite.tools[next]=(this.lite.tools[next]||0)+this.lite.tools[key];
        delete this.lite.tools[key];
      }
      if(Array.isArray(this.lite.toolOrder))this.lite.toolOrder=this.lite.toolOrder.map(id=>typeof id==='string'&&id.startsWith('block-')&&retired[id.slice(6)]?'block-'+retired[id.slice(6)]:id);
      if(this.active&&retired[this.active.liteEffect])this.active.liteEffect=retired[this.active.liteEffect];
      for(const cell of this.board||[])if(retired[cell.liteEffect]){cell.liteEffect=null;delete cell.litePrismPending;}
      const roll=this.lite.roll;
      if(roll?.toolOptions?.some(id=>!RULES.tools.some(t=>t.id===id))){
        roll.toolOptions=this.liteRewardOptions();
      }
      for(const offer of roll?.shopOffers||[])if(offer.kind==='special'&&retired[offer.item])offer.item=retired[offer.item];
      if(!this.lite.shopPurchases){
        this.lite.shopPurchases={};
        for(const offer of roll?.shopOffers||[])if(offer.sold){
          const id=offer.kind==='special'?'block-'+offer.item:offer.item;
          this.lite.shopPurchases[id]=(this.lite.shopPurchases[id]||0)+1;
        }
      }
      for(const offer of roll?.shopOffers||[])delete offer.sold;
      for(const tool of RULES.tools)this.lite.tools[tool.id] ??= 0;
      this.liteInventory();
      for(const cell of this.board||[])cell.placementId ??= 'legacy-'+cell.id;
      return this.lite;
    };
    p.liteMarkCompleted = function (stage) {
      this.lite.completedStages ||= [];
      if(this.lite.completedStages.includes(stage))return false;
      this.lite.completedStages.push(stage);return true;
    };
    // Kept for original renderer and save adapters; V3 has no Buff or milestone system.
    p.liteBuffStacks = () => 0;
    p.liteGrantBuff = () => false;
    p.liteBuffText = () => ({text:'',parts:[],stacks:0,progress:'',progressParts:[]});
    p.liteBuffProgress = () => '';
    p.litePreventMiss = () => false;
    p.liteNeedsMilestone = () => false;
    p.liteComboNeedsChoice = () => false;
    p.liteAfterAttach = function (cells) {
      if(!cells.length||cells.some(c=>c.liteAttached))return;
      const placementId=`${this.stage}:${cells[0].id}`;
      for(const cell of cells){cell.placementId=placementId;cell.liteAttached=true;}
      this.lite.lastPlacementIds=cells.map(c=>c.id);
      if(SPECIALS.some(s=>s.id===cells[0].liteEffect))this.lite.landing={effect:cells[0].liteEffect,ids:cells.map(c=>c.id)};
    };
    p.litePrepareClear = function () { this.liteEnsureExpansion(); };
    p.resolvePendingSpecial = function () {
      const landing=this.lite.landing;
      if(!landing)return original.resolvePendingSpecial.call(this);
      this.lite.landing=null;
      const ids=new Set(landing.ids),cells=this.board.filter(c=>ids.has(c.id));
      if(!cells.length)return null;
      const before=this.board.map(c=>({...c})),effect=landing.effect,color=cells[0].type;
      const inside=new Set(this.target.cells.map(colorKey));
      let removed=[],scoring=null,moved=false,compact=false,repack=false,heavyBoost=null;
      if(effect==='column'){
        const columns=new Set(cells.map(c=>c.x));
        for(const c of this.board)if(columns.has(c.x))c.type=color;
      }else if(effect==='blast'){
        const snapshot=this.checkpointScore;
        removed=this.board.filter(cell=>cell.type===color);
        this.board=this.board.filter(cell=>cell.type!==color);
        scoring=this.awardCells(removed,'tool');
        const extra=root.liteBlastBonus(snapshot,removed.length);
        this.score+=extra;this.levelScore+=extra;this.checkpointScore+=extra;this.chainPoints+=extra;
        scoring.points+=extra;scoring.chainPoints=this.chainPoints;scoring.blastBonus=extra;scoring.source='blast';scoring.burst=true;
        compact=true;
      }else if(effect==='trim'){
        removed=this.board.filter(c=>!inside.has(colorKey(c)));
        this.board=this.board.filter(c=>inside.has(colorKey(c)));
        if(removed.length){scoring=this.awardCells(removed,'tool');scoring.source='trim';}
      }else if(effect==='patch'){
        for(const cell of cells)cell.liteCoin=true;
      }else if(effect==='pack'){
        removed=cells;this.board=this.board.filter(c=>!ids.has(c.id));compact=true;repack=true;
      }else if(effect==='heavy'){
        // Compatibility for old saves/tests that invoke the former effect directly.
        const targets=this.board.filter(cell=>cell.type===color),gain=targets.length*3;
        for(const cell of targets)cell.liteHeavyBonus=(heavyMultiplier(cell)-1)+gain;
        heavyBoost={count:targets.length,gain,ids:targets.map(cell=>cell.id),maxMultiplier:Math.max(...targets.map(heavyMultiplier))};
      }else if(effect==='diamond'){
        // Only the diamond piece itself is marked. Same-colour ordinary cells stay plain.
        for(const cell of cells)cell.liteDiamond=true;
      }
      // Landing powers are single use. Surviving cells keep their ordinary colour.
      for(const c of this.board)if(ids.has(c.id)){if(effect!=='patch')c.liteEffect=null;delete c.litePrismPending;}
      const aliases={column:'column_dye',blast:'bomb',trim:'trim',patch:'stitch',pack:'pack',heavy:'heavy_drop',diamond:'diamond'};
      const landed=before.filter(c=>ids.has(c.id)),contact={x:landed.reduce((n,c)=>n+c.x,0)/landed.length,y:landed.reduce((n,c)=>n+c.y,0)/landed.length};
      this.events.push({kind:'special',effect:aliases[effect],liteEffect:effect,cells:landed,contact,removed,scoring,heavyBoost});
      if(moved)this.events.push({kind:'compact',before});
      this.build.revision++;
      return {compact,repack,moved,scoring,retainTorque:effect==='column'};
    };
    p.liteRandom = function () {
      this.lite.seed = (Math.imul(this.lite.seed, 1664525) + 1013904223) >>> 0;
      return this.lite.seed / 4294967296;
    };
    p.reset = function (shapeSeed = 42, rewardSeed = shapeSeed) {
      this.lite = {
        toolOrder: ['shovel','swap'], coins: 0, tools: { ...emptyTools(), shovel: 1, swap: 1 }, shopPurchases: {}, extraDrops: 0, buffs: [], specials: [], specialToolsMigrated:true, lastPlacementIds: [], clears: 0,
        roll: null, clearCoinStage:-1, seed: (rewardSeed ^ 0x6a09e667) >>> 0
      };
      const result = original.reset.call(this, shapeSeed, rewardSeed);
      this.pixelCards = {};
      this.specialBlocks = [];
      this.unlockedBlocks = [];
      this.upgrades = { base: 0, multiplier: 0 };
      this.insertion = null;
      this.energy = 0;
      this.roundOffers = null;
      this.stageCommitted = true;
      return result;
    };
    Object.defineProperty(p, 'target', { configurable: true, get() {
      return originalTarget.call(this);
    } });
    Object.defineProperty(p, 'goal', { configurable: true, get() { return RULES.scoreGoals[this.stage] ?? this.target.goals[0]; } });
    Object.defineProperty(p, 'dropLimit', { configurable: true, get() {
      const base=this.stage<RULES.lateDropStart?RULES.dropLimit:RULES.lateDropBase+(this.stage-RULES.lateDropStart)*RULES.lateDropStep;
      return (this.endless?Math.max(base,originalDropLimit.call(this)):base) + (this.lite?.extraDrops || 0);
    } });
    const originalRevive=p.revive;
    Object.defineProperty(p, 'canRevive', { configurable: true, get() { return this.phase==='lost'&&!!this.deathSnapshot&&this._liteReviveApplying===true; } });
    p.liteStartReviveAd = function (now=Date.now()) {
      if(!Number.isFinite(now)||this.phase!=='lost'||!this.deathSnapshot||this.lite.reviveAd)return false;
      this.lite.reviveAd={stage:this.stage,readyAt:now+2000};return true;
    };
    p.liteFinishReviveAd = function (now=Date.now()) {
      const ad=this.lite.reviveAd;
      if(!Number.isFinite(now)||!ad||now<ad.readyAt||ad.stage!==this.stage||this.phase!=='lost'||!this.deathSnapshot)return false;
      this.lite.reviveAd=null;this.lite.extraDrops+=10;
      const occupied=new Set(this.board.map(colorKey));
      this.deathSnapshot.holes=this.target.cells.filter(cell=>!occupied.has(colorKey(cell))).map(cell=>({...cell}));
      this._liteReviveApplying=true;
      try{return originalRevive.call(this);}finally{delete this._liteReviveApplying;}
    };
    p.expandTarget = () => false;
    p.prepareStageOffers = function () { this.roundOffers = null; };
    p.drawSpecial = () => null;
    p.selectInsertion = () => false;
    p.chooseRotor = () => false;
    p.useAbility = () => false;
    p.openRewards = function () {
      this.rewardChoices = [];
      this.rewardKind = null;
      this.giftOpened = false;
    };

    p.spawn = function (...args) {
      const old = this.active;
      const result = original.spawn.apply(this, args);
      if (this.active && this.active !== old && this.lite) {
        this.active.liteEffect = null;
        this.lite.nextEffect = null;
      }
      return result;
    };
    p.cells = function (piece = this.active) {
      return original.cells.call(this, piece).map(cell => ({ ...cell, liteEffect: piece?.liteEffect ?? null }));
    };
    p.liteLockHeavy = function (settleImmediately = false) {
      const piece = this.active;
      if (this.phase !== 'play' || !piece || this.dropsRemaining <= 0) return false;
      if (!this.stageCommitted) this.captureDropBudget();
      if (this.checkDropLimit()) return false;
      const raw = this.cells(piece).map(cell => ({ ...cell }));
      const liteDropCost = piece.origin === 'inserted' ? 2 : 1;
      this.dropsUsed += liteDropCost;
      this.rotationCredited = false;
      this.outlineFlowDir = 0;
      this.stageCommitted = true;
      this.build.suppress = false;
      this.build.placement = { count: 0, outline: false, colors: new Set(), mirrored: false, ink: null };
      this.active = null;
      this.chain = 0;
      this.chainPoints = 0;
      const landed = [];
      // Resolve each column from its lowest cell upward so the cells can stack
      // naturally while every cell keeps its original x coordinate.
      for (const source of raw.sort((a, b) => a.y - b.y || a.x - b.x)) {
        let y = source.y;
        while (this.valid([{ x: source.x, y: y - 1, type: source.type }], this.board.concat(landed))) y--;
        const cell = { ...source, y, id: this.id++ };
        delete cell.liteEffect;
        cell.placementId = `${this.stage}:${cell.id}`;
        cell.liteAttached = true;
        landed.push(cell);
      }
      // A heavy piece that misses the playable outline vanishes. It still
      // consumes the throw, but never deals damage and never leaves a ghost cell.
      const targetCells=this.target.cells, minX=Math.min(...targetCells.map(cell=>cell.x))-1, maxX=Math.max(...targetCells.map(cell=>cell.x))+1;
      const supported = landed.some(cell => (cell.x>=minX&&cell.x<=maxX) || this.board.some(other => Math.abs(other.x-cell.x)<=1 && Math.abs(other.y-cell.y)<=1));
      if (!supported) {
        this.lite.lastPlacementIds = [];
        this.events.push({ kind:'special', effect:'heavy_drop', liteEffect:'heavy', cells:[], removed:[], contact:null, scoring:null, heavyDrop:true, missed:true });
        this.checkDeadlock();
        if (this.phase === 'play') this.spawn();
        return true;
      }
      this.board.push(...landed);
      this.lite.lastPlacementIds = landed.map(cell => cell.id);
      this.events.push({ kind: 'special', effect: 'heavy_drop', liteEffect: 'heavy', cells: landed.map(cell => ({ ...cell })), removed: [], contact: { x: landed.reduce((n, cell) => n + cell.x, 0) / landed.length, y: landed.reduce((n, cell) => n + cell.y, 0) / landed.length }, scoring: null, heavyDrop: true });
      const lever = landed.length ? landed.reduce((n, cell) => n + cell.x, 0) / landed.length : 0;
      const torque = { lever, dir: lever >= 1 ? -1 : lever <= -1 ? 1 : 0 };
      this.lastTorque = torque;
      this.events.push({ kind: 'lock', lever: torque.lever, cells: landed, contact: { x: lever, y: landed.reduce((n, cell) => n + cell.y, 0) / landed.length, }, contacts: [], ids: landed.map(cell => cell.id), heavyDrop: true });
      if (this.checkClear()) {
        this.lite.heavyRotationTorque = torque;
        return true;
      }
      if (torque.dir && this.beginRotation(torque)) return true;
      this.checkDeadlock();
      if (this.phase === 'play') this.spawn();
      return true;
    };
    p.lock = function (...args) {
      if (this.active?.liteEffect === 'heavy') return this.liteLockHeavy(...args);
      const recording = this.phase === 'play' && this.active && this.dropsRemaining > 0;
      const firstId = this.id;
      // Record before lock: the original may rotate, clear or check rescue immediately.
      if (recording) this.lite.lastPlacementIds = this.cells().map((_, index) => firstId + index);
      const result = original.lock.apply(this, args);
      if (recording) this.lite.lastPlacementIds = this.lite.lastPlacementIds.filter(id => id < this.id);
      return result;
    };
    p.finishSettlement = function (...args) {
      const result = original.finishSettlement.apply(this, args);
      const torque = this.lite?.heavyRotationTorque;
      if (torque && this.phase === 'play' && torque.dir) {
        delete this.lite.heavyRotationTorque;
        this.beginRotation(torque);
      } else if (torque && this.phase !== 'clearing' && this.phase !== 'settling') {
        delete this.lite.heavyRotationTorque;
      }
      return result;
    };
    p.liteAwardCoinCells = function (cells) {
      const batch=[...new Map(cells.map(cell=>[colorKey(cell),cell])).values()],coins=batch.filter(cell=>cell.liteCoin&&!cell.liteCoinPaid);
      for(const cell of coins)cell.liteCoinPaid=true;
      const reward=batch.length*coins.length;this.lite.coins+=reward;return reward;
    };
    p.awardCells = function (cells,source='outline') {
      const result=original.awardCells.call(this,cells,source);
      const diamondCells=[...new Map(cells.filter(cell=>cell.liteDiamond).map(cell=>[colorKey(cell),cell])).values()];
      if(diamondCells.length){
        const round=value=>Math.floor(value+.5+Number.EPSILON*Math.max(1,Math.abs(value))*8);
        const baseBonus=round(diamondCells.length*result.perCell*2);
        const bonus=round(baseBonus*result.boost*result.synergyMultiplier);
        this.score+=bonus;this.levelScore+=bonus;this.checkpointScore+=bonus;this.chainPoints+=bonus;
        result.points+=bonus;result.score0=(result.score0||0)+baseBonus;result.base=(result.base||0)+baseBonus;
        result.chainPoints=this.chainPoints;result.diamondBonus=bonus;result.diamondCellCount=diamondCells.length;result.diamondMultiplier=3;
      }
      result.coinReward=this.liteAwardCoinCells(cells);
      if(cells.length&&source==='outline')this.lite.clears++;
      return result;
    };
    p.finishRotation = function (...args) {
      // Only a real, valid core turn can award an item. Previews clone the model.
      if (this.phase === 'rotating' && this.valid(this.board, []) && this.lastTorque.dir) {
        if(this.liteRandom()<RULES.rotorDropChance){
          const tool=randomTool(this);this.liteGrantTool(tool);
          this.events.push({kind:'lite-drop',tool,stage:this.stage});
        }
      }
      const result = original.finishRotation.apply(this, args);
      this.energy = 0;
      return result;
    };
    p.completeCheckpoint = function () {
      // The original score gate also performs completion cleanup and emits renderer events.
      const result=original.completeCheckpoint.call(this);
      if(result)this.liteMarkCompleted(this.stage);
      this.liteAwardClearCoins();
      return result;
    };
    p.liteAwardClearCoins = function () {
      if(!rewardPhase(this)||this.lite.clearCoinStage===this.stage)return false;
      // Entered saves from earlier versions already received this reward.
      this.lite.clearCoinStage=this.stage;
      const base=this.lite.roll?.coins??RULES.clearCoins;
      const excess=Math.max(0,this.checkpointScore-this.goal);
      const overflow=this.lite.roll?.entered?0:Math.round(excess/10);
      this.lite.clearCoinReward={stage:this.stage,base,excess,overflow,total:base+overflow};
      if(!this.lite.roll?.entered)this.lite.coins+=base+overflow;
      return true;
    };
    p.liteClearCoinReward = function () {
      return this.lite.clearCoinReward?.stage===this.stage?this.lite.clearCoinReward:{stage:this.stage,base:RULES.clearCoins,excess:0,overflow:0,total:RULES.clearCoins};
    };
    p.checkDeadlock = function (...args) {
      // The original rescue search knows neither lite tool. Let the player use
      // an available shovel or swap before declaring the position unrecoverable.
      if (this.lite?.tools.shovel > 0 && this.target.cells.some(cell=>!this.board.some(other=>colorKey(other)===colorKey(cell))) || this.lite?.tools.swap > 0) {
        this.deadlockCells = [];
        this.deadlockWarning = null;
        return false;
      }
      return original.checkDeadlock.apply(this, args);
    };

    p.liteShovelCells = function () {
      const ids = new Set(this.lite?.lastPlacementIds || []);
      return this.board.filter(cell => ids.has(cell.id));
    };
    p.liteDyeColor = function () {
      const counts = new Map();
      for (const cell of this.board) counts.set(cell.type, (counts.get(cell.type) || 0) + 1);
      return [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0] ?? null;
    };
    p.liteCanUseTool = function (type) {
      if (this.phase !== 'play' || !this.stageCommitted || !this.active || !(this.lite.tools[type] > 0)) return false;
      if(!this.liteInventory().active.includes(type))return false;
      if (type === 'shovel') return this.target.cells.some(cell=>!this.board.some(other=>colorKey(other)===colorKey(cell)));
      if (type === 'dye') { const color = this.liteDyeColor(); return !!color && color !== (this.active.color || this.active.type); }
      if (type === 'repair') return this.lives < 3;
      const effect=RULES.tools.find(tool=>tool.id===type)?.blockEffect;
      if(effect)return this.active.liteEffect!==effect;
      return type === 'swap' || type === 'supply';
    };
    p.liteUseTool = function (type) {
      if (!this.liteCanUseTool(type)) return false;
      if (type === 'shovel') {
        const colors=['I','J','L','O','S','T','Z'];
        const occupied=new Set(this.board.map(colorKey));
        const targetCells=this.target.cells, targetKeys=new Set(targetCells.map(colorKey));
        const radius=cell=>Math.max(Math.abs(cell.x),Math.abs(cell.y));
        const maxRadius=targetCells.length?Math.max(...targetCells.map(radius)):0;
        const ring=targetCells.filter(cell=>radius(cell)===maxRadius);
        const inner=ring.filter(cell=>!occupied.has(colorKey(cell)));
        const expansionBase=inner.length?inner:ring;
        const expansion=[];
        for(const cell of expansionBase)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const next={x:cell.x+dx,y:cell.y+dy};
          if(!targetKeys.has(colorKey(next))&&!occupied.has(colorKey(next))&&!expansion.some(other=>colorKey(other)===colorKey(next)))expansion.push(next);
        }
        const outer=[...inner,...expansion];
        const added=outer.map(cell=>({x:cell.x,y:cell.y,type:colors[Math.floor(this.liteRandom()*colors.length)],id:this.id++,placementId:`${this.stage}:spread-${this.id}`,liteAttached:true}));
        if(!added.length)return false;
        this.board.push(...added);
        this.lite.lastPlacementIds=[];
        this.events.push({ kind:'lite-tool', tool:'shovel', spreadCells:added.map(cell=>({...cell})), amount:added.length });
        this.deadlockCells=[];this.deadlockWarning=null;
      } else if (type === 'swap') {
        const specials=RULES.tools.filter(tool=>tool.blockEffect);
        const block=specials[Math.floor(this.liteRandom()*specials.length)];
        const id='block-'+block.blockEffect;
        this.liteGrantTool(id);
        this.events.push({ kind:'lite-special-tool', id, source:'swap' });
      } else if (type === 'supply') {
        const amount=Math.floor((this.dropLimit+5)/10);
        this.lite.extraDrops = (this.lite.extraDrops || 0) + amount;
        this.events.push({ kind: 'lite-tool', tool: type, amount });
      } else if (type === 'dye') {
        this.active.color = this.liteDyeColor();
        this.events.push({ kind: 'lite-tool', tool: type });
      } else if (type === 'repair') {
        this.lives++;
        this.events.push({ kind: 'lite-tool', tool: type });
      } else {
        const effect=RULES.tools.find(tool=>tool.id===type)?.blockEffect;if(!effect)return false;
        this.active.liteEffect=effect;
        this.events.push({kind:'lite-tool',tool:type});
      }
      this.lite.tools[type]--;
      this.liteInventory();
      this.build.revision++;
      return true;
    };
    p.liteRewardOptions = function (_route='tool', previous=[]) {
      const shuffle=items=>{for(let i=items.length-1;i>0;i--){const j=Math.floor(this.liteRandom()*(i+1));[items[i],items[j]]=[items[j],items[i]];}return items;};
      const ordinary=shuffle(RULES.tools.filter(t=>!t.blockEffect).map(t=>t.id));
      const special=shuffle(RULES.tools.filter(t=>t.blockEffect).map(t=>t.id));
      const options=[ordinary[0],special[0]];
      const remaining=shuffle([...ordinary.slice(1),...special.slice(1)]);
      options.push(remaining.find(id=>!previous.includes(id))??remaining[0]);
      return shuffle(options);
    };
    p.liteOfferPrice = function (offer) {
      const id=offer.kind==='special'?'block-'+offer.item:offer.item;
      const count=this.lite.shopPurchases?.[id]||0;
      let price=RULES.toolPrice,next=RULES.toolPrice*2;
      for(let n=0;n<count;n++)[price,next]=[next,price+next];
      return price;
    };
    p.liteCreateShop = function () {
      const shuffle=items=>{for(let i=items.length-1;i>0;i--){const j=Math.floor(this.liteRandom()*(i+1));[items[i],items[j]]=[items[j],items[i]];}return items;};
      const normal=shuffle(RULES.tools.filter(t=>!t.blockEffect)).slice(0,4);
      const special=shuffle(RULES.tools.filter(t=>t.blockEffect)).slice(0,4);
      return shuffle([...normal,...special]).map((tool,slot)=>({slot,kind:tool.blockEffect?'special':'tool',item:tool.blockEffect||tool.id}));
    };
    p.liteBuyOffer = function (slot) {
      const r=this.lite.roll;
      if(!rewardPhase(this)||!r?.entered||r.adReadyAt!==null)return false;
      const offer=r.shopOffers?.find(item=>item.slot===slot);
      if(!offer)return false;
      const price=this.liteOfferPrice(offer);
      if(this.lite.coins<price)return false;
      const id=offer.kind==='special'?'block-'+offer.item:offer.item;
      if(!RULES.tools.some(t=>t.id===id))return false;
      this.lite.coins-=price;offer.paidPrice=price;
      this.lite.shopPurchases ||= {};
      this.lite.shopPurchases[id]=(this.lite.shopPurchases[id]||0)+1;
      this.liteGrantTool(id);
      this.events.push({kind:'lite-buy',item:offer.item,category:offer.kind});return true;
    };
    p.litePrepareReward = function () {
      if(!rewardPhase(this))return null;
      this.liteEnsureExpansion();
      this.liteAwardClearCoins();
      if(this.lite.roll?.route==='tool'&&this.lite.roll.entered)return this.lite.roll;
      return this.lite.roll={route:'tool',entered:true,settled:false,toolOptions:this.liteRewardOptions(),shopOffers:this.liteCreateShop(),chosenTool:null,tools:{},freeRefreshes:1,adRefreshes:3,adReadyAt:null,coins:0,combo:null};
    };
    p.liteCanRefreshReward = function () {
      const r=this.lite.roll;return !!(rewardPhase(this)&&r?.entered&&!r.settled&&r.route==='tool');
    };
    p.liteRefreshReward = function () {
      const r=this.lite.roll;if(!this.liteCanRefreshReward()||r.adReadyAt!==null||r.freeRefreshes<=0)return false;
      r.freeRefreshes--;r.toolOptions=this.liteRewardOptions('tool',r.toolOptions);
      this.events.push({kind:'lite-refresh',route:'tool'});return true;
    };
    p.liteStartRewardAd = function (now=Date.now()) {
      const r=this.lite.roll;if(!Number.isFinite(now)||!this.liteCanRefreshReward()||r.adReadyAt!==null||r.freeRefreshes>0||r.adRefreshes<=0)return false;
      r.adReadyAt=now+2000;return true;
    };
    p.liteFinishRewardAd = function (now=Date.now()) {
      const r=this.lite.roll;if(!Number.isFinite(now)||!this.liteCanRefreshReward()||r.adReadyAt===null||now<r.adReadyAt||r.adRefreshes<=0)return false;
      r.adRefreshes--;r.adReadyAt=null;r.toolOptions=this.liteRewardOptions('tool',r.toolOptions);
      this.events.push({kind:'lite-refresh',route:'tool'});return true;
    };
    p.liteChooseTool = function (id) {
      const r=this.lite.roll;
      if(!rewardPhase(this)||!r?.entered||r.route!=='tool'||r.settled||r.adReadyAt!==null||!r.toolOptions?.includes(id))return false;
      this.liteGrantTool(id);
      r.tools[id]=1;r.chosenTool=id;r.settled=true;
      this.events.push({kind:'lite-tool-choice',id});return true;
    };
    p.liteSkipReward = function () {
      const r=this.litePrepareReward();
      if(!r||r.settled||r.adReadyAt!==null)return false;
      r.settled=true;r.skipped=true;return this.liteNext();
    };
    p.liteNextStageInfo = function () {
      const stage=this.stage+1;
      if(!this.endless&&stage>=RULES.levels)return {stage:RULES.levels-1,won:true,goal:null};
      return {stage,won:false,goal:RULES.scoreGoals[stage]??originalTarget.call({...this,stage,outline:null}).goals[0]};
    };
    p.liteNext = function () {
      if (!rewardPhase(this) || !this.lite.roll?.entered || !this.lite.roll.settled) return false;
      const next=this.liteNextStageInfo();
      if (next.won) {
        this.stage=next.stage;
        this.phase = 'won';
        this.events.push({ kind: 'won', stage: this.stage, score: this.score });
        return true;
      }
      this.stage=next.stage;
      this.checkpoint = 0;
      this.outline = null;
      this.board = [];
      this.active = null;
      this.lite.clears = 0;
      this.lite.roll = null;
      this.lite.lastPlacementIds = [];
      this.lite.extraDrops = 0;

      this.levelScore = 0;
      this.checkpointScore = 0;
      this.dropsUsed = 0;
      this.stageCommitted = true;
      this.stageDropBudget = null;
      this.chain = 0;
      this.chainPoints = 0;
      this.clearStreak = 0;
      this.levelMaxChain = 0;
      this.levelMaxMultiplier = 1;
      this.lastScore = null;
      this.pendingSpecial = null;
      this.settlement = null;
      this.build.placement = null;
      this.build.revision++;
      this.phase = 'play';
      this.spawn();
      this.events.push({ kind: 'stage-start', stage: this.stage, checkpoint: 0 });
      return true;
    };
    p.advanceStage = function () { return this.liteNext(); };
  };
})(globalThis);
