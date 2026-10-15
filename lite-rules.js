/* Lightweight rules layered on the original ROTATION model. */
(function (root) {
  'use strict';
  const BUFFS = [];
  const SPECIALS = [
    {id:'column',unlockStage:0,name:'变色方块',description:'落地后，将自身所在的整列染成同色'},
    {id:'patch',unlockStage:0,name:'金币方块',description:'消除时，按本次消除格数获得金币',detail:'落地后保留金币标记。消除时，每个金币格获得等同于本批消除格数的金币；多个金币格分别触发。铲除或重排消耗不发金币。'},
    {id:'heavy',unlockStage:0,name:'超重方块',description:'落地后按占用列数向下消除整列方块并消除自身，剩余方块向内收缩聚拢',detail:'各格分别独立下落至落位点，按占用列数向下消除该列下方全部方块，自身也一同消除（不造成悬空）；每消除1格使每个消除方块基础分+1（如消除10格则每格基础分+10）；其余方块按向心聚拢规则收缩填补空隙；落空不扣生命。'},
    {id:'pack',unlockStage:2,name:'强迫症方块',description:'落地后，消耗自身将其余方块向内重排'},
    {id:'glass',unlockStage:3,name:'玻璃方块',description:'落地后将一侧方块镜像填充至另一侧空格，生成方块变为玻璃方块',detail:'落地后，若位于转轴左侧，将左侧所有方块对称镜像填充至右侧空格（不覆盖对侧已有方块）；若位于右侧则镜像填充至左侧空格。镜像生成方块转化为半透明玻璃方块（原侧方块不变），保留原色并可正常参与消除，且不受以方块颜色为条件的效果影响。4长条形方块若在中心对称掉落，则不触发镜像。'},
    {id:'diamond',unlockStage:4,name:'钻石方块',description:'同色标记格消除时分数×3',detail:'落地时标记棋盘上全部同色方块；这些格子消除时按基础分的3倍结算。标记会跟随方块移动、旋转和重排。'},
    {id:'blast',unlockStage:6,name:'爆炸方块',description:'清除全部同色格，每格使本关分数增长3%',detail:'落地后清除全部同色格（含自身），正常计分。额外加分按触发前本关得分×（1.03的消除格数次方−1）计算，整批计算后四舍五入。'}
  ];
  const BASE_RULES = Object.freeze({
    // The original engine has ten procedural stages, but the lightweight
    // rules intentionally use a shorter, authored route.  Nine authored
    // stages keep the first three familiar and add five readable bridges
    // before the cat silhouette becomes the finale.
    // Monte Carlo tuning (moderate no-tool baseline, 30 samples per stage)
    // lowered the pressure while preserving a clear upward curve.
    levels: 9, scoreGoals: [40,65,90,120,140,165,190,215,240],
    dropLimits: [24,24,24,26,28,30,33,37,42],
    dropLimit: 24, lateDropStart: 3, lateDropBase: 36, lateDropStep: 6, postFourthDropBonus: 6,
    lateScoreStart: 4, lateScoreFactor: 0.875, rotorDropChance: 0.06,
    colorScoring: Object.freeze({version:'lite-connected-fibonacci-v1',lineMinimum:4,connectedMinimum:5,firstBonus:4,secondBonus:8,recurrenceEnd:10}),
    coinReward: 5, clearCoins: 5, toolPrice:5, shopSlots:8, buffs: BUFFS,
    tools: [
      { id: 'supply', unlockStage: 0, name: '补给箱', description: '增加本关投放次数。', detail:'使用后增加本关可用投放次数。' },
      { id: 'repair', unlockStage: 0, name: '生命之心', description: '恢复 1 次落空容错，最多 3 次。' },
      { id: 'swap', unlockStage: 0, name: '换块', description: '获得一个随机特殊方块。', detail:'优先填入装备槽；装备槽已满时进入暂存背包。' },
      { id: 'shovel', unlockStage: 2, name: '蔓延', description: '沿当前已摆好的样式向外扩圈。', detail:'在当前已摆好的样式上，检测边界一圈，根据重心偏移方向依次顺时针或逆时针生长新的一圈（最多32格）；60%概率生成当前主导色，40%随机色。' },
      { id: 'dye', unlockStage: 0, name: '调色瓶', description: '将当前落块染成棋盘上最多的颜色。' },
      ...SPECIALS.map(block=>({id:'block-'+block.id,unlockStage:block.unlockStage??0,name:block.name,blockEffect:block.id,description:block.description,detail:block.detail}))
    ],
    specials: SPECIALS,
    rewardRoutes: [{id:'tool',name:'道具补给'}]
  });
  const maskCells = rows => {
    const width = Math.max(...rows.map(row => row.length));
    const left = Math.floor(width / 2);
    const top = Math.floor(rows.length / 2);
    const cells = [];
    rows.forEach((row, rowIndex) => {
      for (let column = 0; column < row.length; column++) {
        if (row[column] !== '#') continue;
        const x = column - left;
        const y = top - rowIndex;
        // The rotor occupies the centre cell.  Every authored outline leaves
        // it open, matching the original geometry and keeping rotations fair.
        if (x === 0 && y === 0) continue;
        cells.push({ x, y });
      }
    });
    return cells;
  };
  const predicateCells = predicate => {
    const cells = [];
    for (let y = -5; y <= 5; y++) {
      for (let x = -5; x <= 5; x++) {
        if ((x || y) && predicate(x, y)) cells.push({ x, y });
      }
    }
    return cells;
  };
  const LITE_OUTLINES = Object.freeze([
    { id: 'square-ring', name: '小方环', style: 'geometry', cells: maskCells(['###', '#.#', '###']) },
    { id: 'diamond', name: '菱形', style: 'geometry', cells: maskCells(['..#..', '.###.', '#####', '.###.', '..#..']) },
    { id: 'wide-rectangle', name: '横向矩形', style: 'geometry', cells: maskCells(['#####', '##.##', '#####']) },
    { id: 'cross-star', name: '十字星', style: 'geometry', cells: maskCells([
      '...........', '...........', '...........', '....###....', '...#####...',
      '...##.##...', '...#####...', '....###....', '...........', '...........', '...........'
    ]) },
    { id: 'rounded-ring', name: '圆角方环', style: 'geometry', cells: maskCells([
      '...........', '...........', '...........', '...#####...', '...#####...',
      '...##.##...', '...#####...', '...#####...', '...........', '...........', '...........'
    ]) },
    { id: 'winged-cross', name: '宽翼十字', style: 'geometry', cells: maskCells([
      '...........', '...........', '....###....', '....###....', '..#######..',
      '..###.###..', '..#######..', '....###....', '....###....', '...........', '...........'
    ]) },
    { id: 'faceted-diamond', name: '菱形扩展', style: 'geometry', cells: predicateCells((x, y) =>
      Math.abs(x) + Math.abs(y) <= 4 && !(Math.abs(x) === 4 && y === 0) && !(Math.abs(y) === 4 && x === 0)) },
    { id: 'christmas-tree', name: '圣诞树', style: 'object', cells: maskCells([
      '.....#.....', '....###....', '...#####...', '....###....', '..#######..',
      '...##.##...', '..#######..', '...#####...', '....###....', '....###....', '....###....'
    ]) },
    { id: 'cat-head', name: '小猫头', style: 'object', cells: maskCells([
      '...........', '..##...##..', '..###.###..', '.#########.', '.#########.',
      '.#########.', '.#########.', '..#######..', '...#####...', '...........', '...........'
    ]) }
  ].map((profile, stage) => Object.freeze({
    ...profile,
    stage,
    cells: Object.freeze(profile.cells.map(cell => Object.freeze(cell)))
  })));
  // The editor writes ROTATION_LITE_LEVEL_DATA before this file is loaded.
  // Keep the authored route above as a self-contained fallback for tests and
  // for opening the rules file without the editor-generated bundle.
  const normaliseCell = cell => {
    const x = Array.isArray(cell) ? Number(cell[0]) : Number(cell?.x);
    const y = Array.isArray(cell) ? Number(cell[1]) : Number(cell?.y);
    return Number.isInteger(x) && Number.isInteger(y) && (x !== 0 || y !== 0) ? {x, y} : null;
  };
  const normaliseProfile = (profile, stage, levelIndex = stage, phaseIndex = 0, levelName = '') => {
    const rawCells = Array.isArray(profile?.cells) ? profile.cells.map(normaliseCell).filter(Boolean) : [];
    const unique = [...new Map(rawCells.map(cell => [`${cell.x},${cell.y}`, cell])).values()];
    if (!unique.length) return null;
    return Object.freeze({
      id: String(profile.id || `stage-${stage + 1}`),
      name: String(profile.name || `第${stage + 1}阶段`),
      style: profile.style === 'object' ? 'object' : 'geometry',
      levelName: String(profile.levelName || levelName || `第${levelIndex + 1}关`),
      levelIndex, phaseIndex, stage,
      goal: Number.isFinite(Number(profile.goal ?? profile.score)) ? Math.max(1, Math.round(Number(profile.goal ?? profile.score))) : null,
      drops: Number.isFinite(Number(profile.drops ?? profile.dropLimit)) ? Math.max(1, Math.round(Number(profile.drops ?? profile.dropLimit))) : null,
      cells: Object.freeze(unique.map(cell => Object.freeze(cell)))
    });
  };
  // A level owns an ordered list of outlines.  The route plays them one after
  // another inside the same level: clearing an outline moves on to the next one
  // while the level score and drop budget carry over, and reaching the level
  // goal settles the level immediately.  The level therefore supplies one goal
  // and one drop budget for all of its outlines (authored on its first phase).
  const buildLevel = (level, levelIndex) => {
    const raw = Array.isArray(level?.phases) && level.phases.length ? level.phases : [level];
    const phases = raw
      .map((phase, phaseIndex) => normaliseProfile(phase, levelIndex, levelIndex, phaseIndex, level?.name))
      .filter(Boolean);
    if (!phases.length) return null;
    const goal = phases[0].goal ?? BASE_RULES.scoreGoals[levelIndex] ?? phases[0].cells.length;
    const drops = phases[0].drops ?? BASE_RULES.dropLimits[levelIndex] ?? BASE_RULES.dropLimit;
    return Object.freeze({
      id: String(level?.id || `level-${levelIndex + 1}`),
      name: String(level?.name || phases[0].levelName || `第${levelIndex + 1}关`),
      levelIndex, goal, drops,
      phases: Object.freeze(phases.map(phase => Object.freeze({...phase, goal, drops})))
    });
  };
  const buildLevels = data => Array.isArray(data?.levels) ? data.levels.map(buildLevel).filter(Boolean) : [];
  const FALLBACK_LEVELS = Object.freeze(LITE_OUTLINES.map((profile, stage) => Object.freeze({
    id: profile.id, name: profile.name, levelIndex: stage,
    goal: BASE_RULES.scoreGoals[stage] ?? profile.cells.length,
    drops: BASE_RULES.dropLimits[stage] ?? BASE_RULES.dropLimit,
    phases: Object.freeze([Object.freeze({
      ...profile, levelIndex: stage, phaseIndex: 0,
      goal: BASE_RULES.scoreGoals[stage] ?? profile.cells.length,
      drops: BASE_RULES.dropLimits[stage] ?? BASE_RULES.dropLimit
    })])
  })));
  const externalLevels = buildLevels(root.ROTATION_LITE_LEVEL_DATA);
  const ACTIVE_LEVELS = Object.freeze((externalLevels.length ? externalLevels : FALLBACK_LEVELS).map((level, stage) => Object.freeze({...level, stage})));
  const ACTIVE_GOALS = Object.freeze(ACTIVE_LEVELS.map(level => level.goal));
  const ACTIVE_DROPS = Object.freeze(ACTIVE_LEVELS.map(level => level.drops));
  // First outline of every level, in route order.  Kept for the codex previews
  // and for callers that only need one representative outline per level.
  const ACTIVE_OUTLINES = Object.freeze(ACTIVE_LEVELS.map(level => level.phases[0]));
  const RULES = Object.freeze({...BASE_RULES, levels: ACTIVE_LEVELS.length, scoreGoals: ACTIVE_GOALS, dropLimits: ACTIVE_DROPS});
  root.ROTATION_LITE = RULES;
  root.ROTATION_LITE_OUTLINES = ACTIVE_OUTLINES;
  root.ROTATION_LITE_LEVELS = ACTIVE_LEVELS;
  root.ROTATION_LITE_LEVEL_DATA = root.ROTATION_LITE_LEVEL_DATA || {
    version: 1,
    levels: ACTIVE_LEVELS.map(level => ({
      id: level.id, name: level.name,
      phases: level.phases.map(phase => ({id: phase.id, name: phase.name, style: phase.style, goal: level.goal, drops: level.drops, cells: phase.cells.map(cell => ({x: cell.x, y: cell.y}))}))
    }))
  };

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
    // Exact integer arithmetic: round once after compounding all removed cells (1.03 = 103/100).
    const denominator=100n**BigInt(count),growth=103n**BigInt(count)-denominator;
    return Number((BigInt(snapshot)*growth*2n+denominator)/(denominator*2n));
  };
  root.liteStageClearCoins = function (stage = 0, baseCoins = RULES.clearCoins) {
    const s = Math.max(0, stage) + 1;
    return Math.round(baseCoins * (1 + Math.log(s)));
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
      'completeCheckpoint', 'checkDropLimit', 'checkDeadlock', 'checkClear', 'resolvePendingSpecial', 'finishSettlement']) original[key] = p[key];
    const originalTarget = Object.getOwnPropertyDescriptor(p, 'target').get;
    const originalDropLimit = Object.getOwnPropertyDescriptor(p, 'dropLimit').get;
    const stageGoal = (game, stage) => {
      if(game.endless){
        const native=originalTarget.call({ ...game, stage, outline: null }).goals[0];
        return stage >= RULES.lateScoreStart ? Math.max(1, Math.round(native * RULES.lateScoreFactor)) : native;
      }
      const configured = ACTIVE_GOALS[stage];
      if (configured !== undefined) return configured;
      const native = originalTarget.call({ ...game, stage, outline: null }).goals[0];
      return stage >= RULES.lateScoreStart ? Math.max(1, Math.round(native * RULES.lateScoreFactor)) : native;
    };
    const randomTool = game => {
      const pool = game.liteUnlockedTools ? game.liteUnlockedTools() : RULES.tools;
      return pool[Math.floor(game.liteRandom() * pool.length)].id;
    };
    p.liteUnlockedTools = function (stage = this.stage ?? 0) {
      if (this.endless) return RULES.tools;
      const currentStage = Math.max(0, stage);
      return RULES.tools.filter(tool => (tool.unlockStage ?? 0) <= currentStage);
    };
    p.liteUnseenShopTools = function (stage = this.stage ?? 0) {
      const seen = new Set(this.lite?.seenShopTools || []);
      return this.liteUnlockedTools(stage).filter(tool => !seen.has(tool.id));
    };
    p.liteMarkShopToolsSeen = function (toolIds) {
      if (!this.lite) return [];
      const seen = new Set(this.lite.seenShopTools || []);
      const ids = Array.isArray(toolIds) ? toolIds : this.liteUnlockedTools().map(t => t.id);
      const newlyMarked = [];
      for (const id of ids) {
        if (!seen.has(id)) {
          seen.add(id);
          newlyMarked.push(id);
        }
      }
      this.lite.seenShopTools = Array.from(seen);
      return newlyMarked;
    };
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
      this.lite.acquiredTools ||= [];
      if(!this.lite.acquiredTools.includes(id)) this.lite.acquiredTools.push(id);
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
      // Runs saved before levels owned several outlines have no outline index.
      this.lite.phaseIndex ??= 0;
      delete this.lite.pendingPhase;
      this.lite.extraDrops ??= 0;
      this.lite.zeroDropKey ??= null;
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
      if(!Array.isArray(this.lite.seenShopTools)){
        this.lite.seenShopTools = ['block-column', 'block-patch', 'block-heavy', 'supply', 'repair', 'swap', 'dye'];
      }
      this.lite.acquiredTools ||= [];
      for(const [id, count] of Object.entries(this.lite.tools||{})){
        if(count > 0 && !this.lite.acquiredTools.includes(id)) this.lite.acquiredTools.push(id);
      }
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
      if(SPECIALS.some(s=>s.id===cells[0].liteEffect)){
        this.lite.landing={effect:cells[0].liteEffect,ids:cells.map(c=>c.id)};
        const specialId='block-'+cells[0].liteEffect;
        this.lite.acquiredTools ||= [];
        if(!this.lite.acquiredTools.includes(specialId)) this.lite.acquiredTools.push(specialId);
      }
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
        for(const c of this.board)if(columns.has(c.x)&&!c.liteGlass)c.type=color;
      }else if(effect==='blast'){
        const snapshot=this.checkpointScore;
        removed=this.board.filter(cell=>cell.type===color&&!cell.liteGlass);
        this.board=this.board.filter(cell=>cell.type!==color||cell.liteGlass);
        scoring=this.awardCells(removed,'tool');
        const extra=root.liteBlastBonus(snapshot,removed.length);
        this.score+=extra;this.levelScore+=extra;this.checkpointScore+=extra;this.chainPoints+=extra;
        scoring.points+=extra;scoring.chainPoints=this.chainPoints;scoring.blastBonus=extra;scoring.source='blast';scoring.burst=true;
        compact=true;
      }else if(effect==='glass'||effect==='trim'){
        const leftCount=cells.filter(c=>c.x<0).length;
        const rightCount=cells.filter(c=>c.x>0).length;
        const avgX=cells.reduce((sum,c)=>sum+c.x,0)/cells.length;
        const isSymmetric=cells.every(c=>c.x===0)||(leftCount===rightCount&&Math.abs(avgX)<1e-4);
        if(!isSymmetric){
          const isLeft=avgX<0||(leftCount>rightCount);
          const sourceCells=this.board.filter(c=>isLeft?c.x<0:c.x>0);
          for(const c of sourceCells){
            const mx=-c.x,my=c.y;
            const existing=this.board.find(b=>b.x===mx&&b.y===my);
            if(!existing){
              this.board.push({x:mx,y:my,type:c.type,id:this.id++,liteGlass:true,placementId:`${this.stage}:glass-${c.id}`});
            }
          }
        }
      }else if(effect==='patch'){
        for(const cell of cells)cell.liteCoin=true;
      }else if(effect==='pack'){
        removed=cells;this.board=this.board.filter(c=>!ids.has(c.id));compact=true;repack=true;
      }else if(effect==='heavy'){
        // Compatibility for old saves/tests that invoke the former effect directly.
        const targets=this.board.filter(cell=>cell.type===color&&!cell.liteGlass),gain=targets.length*3;
        for(const cell of targets)cell.liteHeavyBonus=(heavyMultiplier(cell)-1)+gain;
        heavyBoost={count:targets.length,gain,ids:targets.map(cell=>cell.id),maxMultiplier:Math.max(...targets.map(heavyMultiplier))};
      }else if(effect==='diamond'){
        // Snapshot every same-colour cell at landing time. Later cells of the
        // same colour do not inherit the mark retroactively.
        for(const cell of this.board)if(cell.type===color&&!cell.liteGlass)cell.liteDiamond=true;
      }
      // Landing powers are single use. Surviving cells keep their ordinary colour.
      for(const c of this.board)if(ids.has(c.id)){if(effect!=='patch')c.liteEffect=null;delete c.litePrismPending;}
      const aliases={column:'column_dye',blast:'bomb',glass:'glass',trim:'glass',patch:'stitch',pack:'pack',heavy:'heavy_drop',diamond:'diamond'};
      const landed=before.filter(c=>ids.has(c.id)),contact={x:landed.reduce((n,c)=>n+c.x,0)/landed.length,y:landed.reduce((n,c)=>n+c.y,0)/landed.length};
      this.events.push({kind:'special',effect:aliases[effect],liteEffect:effect,cells:landed,contact,removed,scoring,heavyBoost});
      if(moved)this.events.push({kind:'compact',before});
      this.build.revision++;
      return {compact,repack,moved,scoring,retainTorque:['column','patch','diamond'].includes(effect)};
    };
    p.liteRandom = function () {
      this.lite.seed = (Math.imul(this.lite.seed, 1664525) + 1013904223) >>> 0;
      return this.lite.seed / 4294967296;
    };
    p.reset = function (shapeSeed = 42, rewardSeed = shapeSeed) {
      this.lite = {
        toolOrder: ['swap'], coins: 0, tools: { ...emptyTools(), swap: 1 }, acquiredTools: ['swap'], shopPurchases: {}, seenShopTools: ['block-column', 'block-patch', 'block-heavy', 'supply', 'repair', 'swap', 'dye'], extraDrops: 0, buffs: [], specials: [], specialToolsMigrated:true, lastPlacementIds: [], clears: 0,
        roll: null, clearCoinStage:-1, zeroDropKey:null, phaseIndex:0, seed: (rewardSeed ^ 0x6a09e667) >>> 0
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
    // A suspended run can outlive an editor sync.  The old implementation
    // only compared the authored profile id, so editing the cells/goal/drops
    // in place (the normal editor workflow) left the restored `outline` with
    // the previous geometry even though index.html contained the new data.
    // Keep a compact content signature on the runtime outline and rebuild it
    // whenever authored data changes.  Older saves have no signature and are
    // deliberately treated as stale.
    const profileSignature = (level, phase, index) => [
      level.id,
      phase.id,
      index,
      phase.style ?? '',
      level.goal ?? '',
      level.drops ?? '',
      phase.cells.map(cell => `${cell.x},${cell.y}`).join(';')
    ].join('|');
    // Which outline of the current level is showing.  The index lives in the
    // saved run so a resumed game comes back to the same outline.
    const phaseIndexFor = game => {
      const level = ACTIVE_LEVELS[game.stage];
      if (!level) return 0;
      const index = Math.floor(Number(game.lite?.phaseIndex) || 0);
      return Math.max(0, Math.min(index, level.phases.length - 1));
    };
    Object.defineProperty(p, 'target', { configurable: true, get() {
      const level=ACTIVE_LEVELS[this.stage];
      if(this.endless){
        if(this.outline?.liteProfile)this.outline=null;
        return originalTarget.call(this);
      }
      if(!level)return originalTarget.call(this);
      const index=phaseIndexFor(this);
      const profile=level.phases[index];
      const signature=profileSignature(level,profile,index);
      if(!this.outline||this.outline.stage!==this.stage||this.outline.liteProfile!==profile.id||this.outline.liteProfileSignature!==signature){
        this.outline={stage:this.stage,growth:0,liteProfile:profile.id,liteProfileSignature:signature,cells:profile.cells.map(cell=>({...cell}))};
      }
      const goal=ACTIVE_GOALS[this.stage]??profile.cells.length;
      return {name:profile.name,style:profile.style,levelName:level.name,levelIndex:level.levelIndex,phaseIndex:index,phaseCount:level.phases.length,playful:false,goals:[goal,goal,goal],cells:this.outline.cells};
    } });
    // Several outlines belong to one level: clearing an outline moves the level on
    // to its next outline, while the level score, the drop budget and the board
    // carry over.  The score gate owns completion, so a clear that already reached
    // the level goal is settled instead of switching outlines, and running out of
    // drops keeps the current outline (the zero-drop fallback resolves the level).
    p.liteNextPhaseIndex = function () {
      const level=ACTIVE_LEVELS[this.stage];
      if(this.endless||!level||level.phases.length<2)return null;
      if(this.checkpointScore>=this.goal)return null;
      if(this.dropsRemaining<=0)return null;
      const next=phaseIndexFor(this)+1;
      return next>=level.phases.length?null:next;
    };
    p.liteAdvancePhase = function (index) {
      const level=ACTIVE_LEVELS[this.stage];
      if(!level||!Number.isInteger(index)||index<=phaseIndexFor(this)||index>=level.phases.length)return false;
      this.lite.phaseIndex=index;
      this.outline=null;
      this.events.push({kind:'lite-phase',stage:this.stage,levelIndex:level.levelIndex,phaseIndex:index,phaseCount:level.phases.length});
      return true;
    };
    // The outline swap waits for the settle step so the finished outline is seen
    // clearing before the next one is drawn.
    p.checkClear = function (...args) {
      const result=original.checkClear.apply(this,args);
      if(result){
        const next=this.liteNextPhaseIndex();
        if(next!==null)this.lite.pendingPhase=next;
      }
      return result;
    };
    Object.defineProperty(p, 'goal', { configurable: true, get() { return stageGoal(this, this.stage); } });
    Object.defineProperty(p, 'dropLimit', { configurable: true, get() {
      const configured=ACTIVE_DROPS[this.stage];
      const base=configured??(this.stage<RULES.lateDropStart?RULES.dropLimit:RULES.lateDropBase+(this.stage-RULES.lateDropStart)*RULES.lateDropStep+(this.stage>=RULES.lateScoreStart?RULES.postFourthDropBonus:0));
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
    p.liteZeroDropClear = function () {
      if(this.phase!=='play'||this.dropsRemaining>0)return false;
      const key=`${this.stage}:${this.checkpoint}`;
      if(this.lite.zeroDropKey===key)return false;
      this.lite.zeroDropKey=key;
      const targetCells=this.target.cells;
      const targetKeys=new Set(targetCells.map(colorKey));
      const occupied=new Set(this.board.map(colorKey));
      const counts=new Map();
      for(const cell of this.board)if(targetKeys.has(colorKey(cell)))counts.set(cell.type,(counts.get(cell.type)||0)+1);
      const dominant=[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]||this.active?.color||this.nextColor||this.next||'L';
      const added=[];
      for(const target of targetCells){
        if(occupied.has(colorKey(target)))continue;
        // Borrow a nearby colour when possible so the safeguard still
        // participates in the normal connected-colour scoring rules.
        const neighbour=this.board.find(cell=>Math.abs(cell.x-target.x)+Math.abs(cell.y-target.y)===1);
        added.push({...target,id:this.id++,type:neighbour?.type||dominant,placementId:`${this.stage}:zero-drop`,liteAttached:true});
      }
      if(added.length)this.board.push(...added);
      this.active=null;
      this.events.push({kind:'lite-zero-drop-fill',stage:this.stage,checkpoint:this.checkpoint,cells:added.map(cell=>({...cell}))});
      const cleared=this.checkClear();
      if(!cleared){
        this.events.push({kind:'lite-zero-drop-clear',stage:this.stage,checkpoint:this.checkpoint,cells:[],scoring:null,skipped:true});
        return false;
      }
      const event=this.events.findLast?.(entry=>entry.kind==='clear')||[...this.events].reverse().find(entry=>entry.kind==='clear');
      if(event){
        event.fallback=true;
        event.source='zero-drop';
        if(event.scoring)event.scoring.source='zero-drop';
      }
      this.events.push({kind:'lite-zero-drop-clear',stage:this.stage,checkpoint:this.checkpoint,cells:this.cleared?.map(cell=>({...cell}))||[],scoring:this.lastScore,skipped:false});
      return true;
    };
    p.checkDropLimit = function (...args) {
      if(this.phase==='play'&&this.dropsRemaining<=0){
        if(this.liteZeroDropClear())return true;
        if(this.checkpointScore>=this.goal&&this.completeCheckpoint())return true;
      }
      return original.checkDropLimit.apply(this,args);
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
      if (this.phase==='play' && this.dropsRemaining===0 && this.lite?.zeroDropKey!==`${this.stage}:${this.checkpoint}`) {
        if (this.liteZeroDropClear()) return true;
      }
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

      // Drop each cell individually straight down in its column.
      // A cell can only land if there is an obstacle below it:
      // - an existing block in this.board in that column
      // - or the rotor at (0, 0) if the cell is in column 0
      // - or another cell from this piece that already landed in that column.
      this.lite.acquiredTools ||= [];
      if (!this.lite.acquiredTools.includes('block-heavy')) this.lite.acquiredTools.push('block-heavy');

      // If a cell has no obstacle below it, it has missed and vanishes immediately.
      const landed = [];
      const sorted = raw.sort((a, b) => a.y - b.y || a.x - b.x);
      for (const source of sorted) {
        const col = source.x;
        let highestY = null;
        for (const b of this.board) {
          if (b.x === col && b.y < source.y) {
            if (highestY === null || b.y > highestY) highestY = b.y;
          }
        }
        if (col === 0 && source.y > 0) {
          if (highestY === null || 0 > highestY) highestY = 0;
        }
        for (const l of landed) {
          if (l.x === col && l.y < source.y) {
            if (highestY === null || l.y > highestY) highestY = l.y;
          }
        }

        if (highestY === null) {
          // No obstacle beneath this cell: it misses and vanishes!
          continue;
        }

        const landingY = highestY + 1;
        if (this.valid([{ x: col, y: landingY, type: source.type }], this.board.concat(landed))) {
          const cell = { ...source, x: col, y: landingY, id: this.id++ };
          delete cell.liteEffect;
          cell.placementId = `${this.stage}:${cell.id}`;
          cell.liteAttached = true;
          landed.push(cell);
        }
      }

      // If no cells could land, the entire heavy piece missed: vanishes with no damage/lives lost.
      if (!landed.length) {
        this.lite.lastPlacementIds = [];
        this.events.push({
          kind: 'special',
          effect: 'heavy_drop',
          liteEffect: 'heavy',
          cells: [],
          removed: [],
          contact: null,
          scoring: null,
          heavyDrop: true,
          missed: true
        });
        this.checkDeadlock();
        if (this.phase === 'play') this.spawn();
        return true;
      }

      // 1. Eliminate downwards per occupied column, AND eliminate the heavy block itself!
      // ("超重方块自己也会被自己的效果消掉，不会造成悬空")
      const occupiedCols = [...new Set(landed.map(cell => cell.x))];
      const removedUnderneath = [];
      for (const col of occupiedCols) {
        const colLanded = landed.filter(cell => cell.x === col);
        const minLandedY = Math.min(...colLanded.map(cell => cell.y));
        const colCandidates = this.board.filter(b => b.x === col && b.y < minLandedY);
        colCandidates.sort((a, b) => b.y - a.y);
        removedUnderneath.push(...colCandidates);
      }

      // The heavy block itself is also eliminated along with the crushed blocks
      const removed = [...removedUnderneath, ...landed];
      if (removedUnderneath.length) {
        const removedUnderneathIds = new Set(removedUnderneath.map(cell => cell.id));
        this.board = this.board.filter(cell => !removedUnderneathIds.has(cell.id));
      }
      this.lite.lastPlacementIds = [];

      const scoring = this.awardCells(removed, 'tool');
      if (removed.length > 0) {
        const count = removed.length;
        const extraBasePerCell = count;
        const extraBaseBonus = count * extraBasePerCell;
        const boost = scoring.boost ?? 1;
        const synergy = scoring.synergyMultiplier ?? 1;
        const extraBonus = Math.round(extraBaseBonus * boost * synergy * (scoring.comboMultiplier || 1));
        this.score += extraBonus;
        this.levelScore += extraBonus;
        this.checkpointScore += extraBonus;
        this.chainPoints += extraBonus;
        scoring.points += extraBonus;
        scoring.chainPoints = this.chainPoints;
        scoring.base = (scoring.base || 0) + extraBaseBonus;
        scoring.score0 = (scoring.score0 || 0) + extraBaseBonus;
        scoring.perCell = (scoring.perCell || 1) + extraBasePerCell;
        scoring.heavyBonus = extraBonus;
        scoring.heavyBaseBonus = extraBaseBonus;
        scoring.heavyBonusPerCell = extraBasePerCell;
      }

      const lever = landed.length ? landed.reduce((n, cell) => n + cell.x, 0) / landed.length : 0;
      const torque = { lever, dir: lever >= 1 ? -1 : lever <= -1 ? 1 : 0 };
      this.lastTorque = torque;

      this.events.push({
        kind: 'special',
        effect: 'heavy_drop',
        liteEffect: 'heavy',
        cells: landed.map(cell => ({ ...cell })),
        removed,
        scoring,
        heavyDrop: true
      });

      this.events.push({
        kind: 'lock',
        lever: torque.lever,
        cells: landed,
        contact: { x: lever, y: landed.reduce((n, cell) => n + cell.y, 0) / landed.length },
        contacts: [],
        ids: landed.map(cell => cell.id),
        heavyDrop: true
      });

      this.build.revision++;

      const compacted = this.settleRemaining(false);
      if (compacted) {
        this.settlement = { source: 'heavy', torque };
        this.lite.heavyRotationTorque = torque;
        this.phase = 'settling';
        if (settleImmediately) {
          this.finishSettlement();
        }
        return true;
      }

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
      const pending = this.lite?.pendingPhase;
      if (pending !== undefined) {
        delete this.lite.pendingPhase;
        this.liteAdvancePhase(pending);
      }
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
      const combo=Math.max(result.chain||1,result.streak||1);
      if(combo>1){
        const n=combo-1;
        const originalPoints=result.points;
        const comboMultiplier=1+0.05*n;
        const finalPoints=Math.round(originalPoints*comboMultiplier);
        const bonus=finalPoints-originalPoints;
        this.score+=bonus;this.levelScore+=bonus;this.checkpointScore+=bonus;this.chainPoints+=bonus;
        result.points=finalPoints;result.chainPoints=this.chainPoints;
        result.combo=combo;result.comboN=n;result.comboMultiplier=comboMultiplier;result.comboBonus=bonus;
        if(this.lastScore){
          this.lastScore.points=finalPoints;this.lastScore.chainPoints=this.chainPoints;
          this.lastScore.combo=combo;this.lastScore.comboN=n;
          this.lastScore.comboMultiplier=comboMultiplier;this.lastScore.comboBonus=bonus;
        }
      }else{
        result.combo=combo;result.comboN=0;result.comboMultiplier=1;result.comboBonus=0;
        if(this.lastScore){
          this.lastScore.combo=combo;this.lastScore.comboN=0;
          this.lastScore.comboMultiplier=1;this.lastScore.comboBonus=0;
        }
      }
      result.coinReward=this.liteAwardCoinCells(cells);
      if(cells.length&&source==='outline')this.lite.clears++;
      return result;
    };
    p.finishRotation = function (...args) {
      // Only a real, valid core turn can award an item. Previews clone the model.
      if (this.phase === 'rotating' && this.valid(this.board, []) && this.lastTorque.dir) {
        if(this.liteRandom()<RULES.rotorDropChance){
          const tool = (this.stage < 2) ? 'supply' : randomTool(this);
          this.liteGrantTool(tool);
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
    p.liteStageClearCoins = function (stage = this.stage ?? 0) {
      return root.liteStageClearCoins(stage);
    };
    p.liteAwardClearCoins = function () {
      if(!rewardPhase(this)||this.lite.clearCoinStage===this.stage)return false;
      // Entered saves from earlier versions already received this reward.
      this.lite.clearCoinStage=this.stage;
      const base=this.liteStageClearCoins(this.stage);
      const excess=Math.max(0,this.checkpointScore-this.goal);
      const overflow=this.lite.roll?.entered?0:Math.round(excess/10);
      this.lite.clearCoinReward={stage:this.stage,base,excess,overflow,total:base+overflow};
      if(!this.lite.roll?.entered)this.lite.coins+=base+overflow;
      return true;
    };
    p.liteClearCoinReward = function () {
      const base=this.liteStageClearCoins(this.stage);
      return this.lite.clearCoinReward?.stage===this.stage?this.lite.clearCoinReward:{stage:this.stage,base,excess:0,overflow:0,total:base};
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
        const colors = ['I','J','L','O','S','T','Z'];
        const occupied = new Set(this.board.map(colorKey));
        const baseCells = this.board.length ? this.board : [{ x: 0, y: 0 }];
        const cx = baseCells.reduce((sum, c) => sum + c.x, 0) / baseCells.length;
        const cy = baseCells.reduce((sum, c) => sum + c.y, 0) / baseCells.length;

        // Determine rotation direction by center of gravity offset:
        // In RotateV3, positive x (right-heavy) rotates clockwise ('cw').
        // Negative x (left-heavy) rotates counterclockwise ('ccw').
        // If horizontal offset is 0, use vertical offset (cy >= 0 ? 'cw' : 'ccw').
        const dir = cx > 0 ? 'cw' : cx < 0 ? 'ccw' : (cy >= 0 ? 'cw' : 'ccw');

        const DIRS = [
          [1, 0], [-1, 0], [0, 1], [0, -1],
          [1, 1], [1, -1], [-1, 1], [-1, -1]
        ];
        const ring = [];
        const ringSet = new Set();
        for (const cell of baseCells) {
          for (const [dx, dy] of DIRS) {
            const nx = cell.x + dx, ny = cell.y + dy;
            if (nx === 0 && ny === 0) continue;
            if (nx < -12 || nx > 12 || ny < -12 || ny > 16) continue;
            const key = `${nx},${ny}`;
            if (!occupied.has(key) && !ringSet.has(key)) {
              ringSet.add(key);
              ring.push({ x: nx, y: ny });
            }
          }
        }

        // Sort ring cells sequentially by angle in the determined direction (cw / ccw),
        // starting from the angle of the center of gravity.
        const startAngle = (cx !== 0 || cy !== 0) ? Math.atan2(cy, cx) : Math.PI / 2;
        ring.sort((a, b) => {
          const angleA = Math.atan2(a.y, a.x);
          const angleB = Math.atan2(b.y, b.x);
          let diffA = dir === 'cw' ? (startAngle - angleA) % (2 * Math.PI) : (angleA - startAngle) % (2 * Math.PI);
          if (diffA < 0) diffA += 2 * Math.PI;
          let diffB = dir === 'cw' ? (startAngle - angleB) % (2 * Math.PI) : (angleB - startAngle) % (2 * Math.PI);
          if (diffB < 0) diffB += 2 * Math.PI;
          if (Math.abs(diffA - diffB) > 1e-4) return diffA - diffB;
          return Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y);
        });

        const dominantColor = this.liteDyeColor();
        const cappedRing = ring.slice(0, 32);
        const added = cappedRing.map(cell => ({
          x: cell.x,
          y: cell.y,
          type: (dominantColor && this.liteRandom() < 0.6)
            ? dominantColor
            : colors[Math.floor(this.liteRandom() * colors.length)],
          id: this.id++,
          placementId: `${this.stage}:spread-${this.id}`,
          liteAttached: true
        }));
        if (!added.length) return false;
        this.board.push(...added);
        this.lite.lastPlacementIds = [];
        this.events.push({
          kind: 'lite-tool',
          tool: 'shovel',
          spreadCells: added.map(cell => ({ ...cell })),
          amount: added.length,
          direction: dir,
          cog: { x: cx, y: cy }
        });
        this.deadlockCells = []; this.deadlockWarning = null;
        this.build.revision++;
      } else if (type === 'swap') {
        const specials=this.liteUnlockedTools().filter(tool=>tool.blockEffect);
        const block=specials[Math.floor(this.liteRandom()*specials.length)];
        const id='block-'+block.blockEffect;
        this.liteGrantTool(id);
        this.events.push({ kind:'lite-special-tool', id, source:'swap' });
      } else if (type === 'supply') {
        const amount = 3 + Math.round(this.dropLimit * 0.1);
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
      const pool=this.liteUnlockedTools();
      const ordinary=shuffle(pool.filter(t=>!t.blockEffect).map(t=>t.id));
      const special=shuffle(pool.filter(t=>t.blockEffect).map(t=>t.id));
      const options=[];
      if(ordinary.length)options.push(ordinary[0]);
      if(special.length)options.push(special[0]);
      const remaining=shuffle([...ordinary.slice(1),...special.slice(1)]);
      while(options.length<3&&remaining.length){
        const candidate=remaining.find(id=>!previous.includes(id)&&!options.includes(id))??remaining.find(id=>!options.includes(id))??remaining[0];
        options.push(candidate);
        remaining.splice(remaining.indexOf(candidate),1);
      }
      return shuffle(options);
    };
    const fibonacciPrice = count => {
      let price=RULES.toolPrice,next=RULES.toolPrice*2;
      for(let n=0;n<count;n++)[price,next]=[next,price+next];
      return price;
    };
    p.liteToolBuyPrice = function (id) {
      if(!id)return RULES.toolPrice;
      const purchases=this.lite?.shopPurchases?.[id]||0;
      return fibonacciPrice(purchases);
    };
    p.liteToolSellPrice = function (id) {
      const buyPrice=this.liteToolBuyPrice(id);
      return Math.floor(buyPrice/2);
    };
    p.liteCanSellTool = function (id, quantity=1) {
      if(!id||!Number.isInteger(quantity)||quantity<=0)return false;
      if(!rewardPhase(this)||!this.lite)return false;
      const r=this.lite.roll;
      if(!r?.entered||r.adReadyAt!==null)return false;
      const owned=this.lite.tools?.[id]||0;
      return owned>=quantity;
    };
    p.liteSellTool = function (id, quantity=1) {
      if(!this.liteCanSellTool(id,quantity))return false;
      const unitPrice=this.liteToolSellPrice(id);
      const totalPrice=unitPrice*quantity;
      this.lite.tools[id]-=quantity;
      this.lite.coins+=totalPrice;
      this.liteInventory();
      this.events.push({kind:'lite-sell',tool:id,quantity,unitPrice,totalPrice});
      return true;
    };
    p.liteOfferPrice = function (offer) {
      const id=offer.kind==='special'?'block-'+offer.item:offer.item;
      return this.liteToolBuyPrice(id);
    };
    p.liteOfferBatchPrice = function (offer, quantity=1) {
      if(!Number.isInteger(quantity)||quantity<=0)return Infinity;
      const id=offer.kind==='special'?'block-'+offer.item:offer.item;
      const count=this.lite.shopPurchases?.[id]||0;
      let total=0;
      for(let n=0;n<quantity;n++)total+=fibonacciPrice(count+n);
      return total;
    };
    p.liteCreateShop = function () {
      const shuffle=items=>{for(let i=items.length-1;i>0;i--){const j=Math.floor(this.liteRandom()*(i+1));[items[i],items[j]]=[items[j],items[i]];}return items;};
      const pool=this.liteUnlockedTools();
      const normal=shuffle(pool.filter(t=>!t.blockEffect)).slice(0,4);
      const special=shuffle(pool.filter(t=>t.blockEffect)).slice(0,4);
      return shuffle([...normal,...special]).map((tool,slot)=>({slot,kind:tool.blockEffect?'special':'tool',item:tool.blockEffect||tool.id}));
    };
    p.liteBuyOffer = function (slot, quantity=1) {
      const r=this.lite.roll;
      if(!rewardPhase(this)||!r?.entered||r.adReadyAt!==null)return false;
      const offer=r.shopOffers?.find(item=>item.slot===slot);
      if(!offer)return false;
      if(!Number.isInteger(quantity)||quantity<=0)return false;
      const price=this.liteOfferBatchPrice(offer,quantity);
      if(this.lite.coins<price)return false;
      const id=offer.kind==='special'?'block-'+offer.item:offer.item;
      if(!RULES.tools.some(t=>t.id===id))return false;
      this.lite.coins-=price;offer.paidPrice=price;offer.paidQuantity=quantity;
      this.lite.shopPurchases ||= {};
      this.lite.shopPurchases[id]=(this.lite.shopPurchases[id]||0)+quantity;
      this.liteGrantTool(id,quantity);
      this.events.push({kind:'lite-buy',item:offer.item,category:offer.kind,quantity,totalPrice:price});return true;
    };
    p.litePrepareReward = function () {
      if(!rewardPhase(this))return null;
      this.liteEnsureExpansion();
      this.liteAwardClearCoins();
      if(this.lite.roll?.route==='tool'&&this.lite.roll.entered)return this.lite.roll;
      return this.lite.roll={route:'tool',entered:true,settled:false,toolOptions:this.liteRewardOptions(),shopOffers:this.liteCreateShop(),chosenTool:null,selectedTool:null,tools:{},freeRefreshes:1,adRefreshes:3,adReadyAt:null,coins:0,combo:null};
    };
    p.liteCanRefreshReward = function () {
      const r=this.lite.roll;return !!(rewardPhase(this)&&r?.entered&&!r.settled&&r.route==='tool');
    };
    p.liteRefreshReward = function () {
      const r=this.lite.roll;if(!this.liteCanRefreshReward()||r.adReadyAt!==null||r.freeRefreshes<=0)return false;
      r.freeRefreshes--;r.toolOptions=this.liteRewardOptions('tool',r.toolOptions);r.selectedTool=null;
      this.events.push({kind:'lite-refresh',route:'tool'});return true;
    };
    p.liteStartRewardAd = function (now=Date.now()) {
      const r=this.lite.roll;if(!Number.isFinite(now)||!this.liteCanRefreshReward()||r.adReadyAt!==null||r.freeRefreshes>0||r.adRefreshes<=0)return false;
      r.adReadyAt=now+2000;return true;
    };
    p.liteFinishRewardAd = function (now=Date.now()) {
      const r=this.lite.roll;if(!Number.isFinite(now)||!this.liteCanRefreshReward()||r.adReadyAt===null||now<r.adReadyAt||r.adRefreshes<=0)return false;
      r.adRefreshes--;r.adReadyAt=null;r.toolOptions=this.liteRewardOptions('tool',r.toolOptions);r.selectedTool=null;
      this.events.push({kind:'lite-refresh',route:'tool'});return true;
    };
    p.liteChooseTool = function (id) {
      const r=this.lite.roll;
      if(!rewardPhase(this)||!r?.entered||r.route!=='tool'||r.settled||r.adReadyAt!==null||!r.toolOptions?.includes(id))return false;
      this.liteGrantTool(id);
      r.tools[id]=1;r.chosenTool=id;r.settled=true;r.selectedTool=null;
      this.events.push({kind:'lite-tool-choice',id});return true;
    };
    p.liteSkipReward = function () {
      const r=this.litePrepareReward();
      if(!r||r.settled||r.adReadyAt!==null)return false;
      r.settled=true;r.skipped=true;return this.liteNext();
    };
    p.liteNextStageInfo = function () {
      const stage=this.stage+1;
      if(!this.endless&&stage>=ACTIVE_LEVELS.length)return {stage:ACTIVE_LEVELS.length-1,won:true,goal:null};
      return {stage,won:false,goal:stageGoal(this,stage)};
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
      this.lite.phaseIndex = 0;
      delete this.lite.pendingPhase;
      this.lite.roll = null;
      this.lite.lastPlacementIds = [];
      this.lite.extraDrops = 0;
      this.lite.zeroDropKey = null;

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
