import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {loadEngine,settle} from '../tools/load-engine.mjs';
const original=loadEngine(null,fileURLToPath(new URL('../index.html',import.meta.url)));
const context=vm.createContext({console,structuredClone,performance});
vm.runInContext(original.source,context);
vm.runInContext(fs.readFileSync(new URL('../lite-levels.js',import.meta.url),'utf8'),context);
vm.runInContext(fs.readFileSync(new URL('../lite-rules.js',import.meta.url),'utf8'),context);
vm.runInContext('installRotationLite(api)',context);
const ctx=context;
const scripted=(g,values)=>{let index=0;g.liteRandom=()=>values[index++]??.99;};
const make=()=>new context.api.Game(42);
// The editor rewrites lite-levels.js whenever the level author saves, so fixtures
// that depend on exact authored geometry run on the built-in route instead of the
// editable data file.  The route snapshot test uses the same context.
const route=vm.createContext({console,structuredClone,performance});
vm.runInContext(original.source,route);
vm.runInContext(fs.readFileSync(new URL('../lite-rules.js',import.meta.url),'utf8'),route);
vm.runInContext('installRotationLite(api)',route);
const makeRoute=()=>new route.api.Game(42);
// One level with two outlines followed by a single-outline level, so the in-level
// outline switch can be exercised without touching the editor data.  Goals sit far
// above what a couple of clears score, which keeps the score gate out of the way.
const phaseRoute={version:1,levels:[
  {id:'two-outlines',name:'双轮廓关',phases:[
    {id:'small',name:'小轮廓',style:'geometry',goal:4000,drops:10,cells:[[-1,1],[0,1],[1,1],[-1,0],[1,0],[-1,-1],[0,-1],[1,-1]]},
    {id:'large',name:'大轮廓',style:'geometry',goal:9999,drops:1,cells:[[-2,2],[-1,2],[0,2],[1,2],[2,2],[-2,1],[-1,1],[0,1],[1,1],[2,1],[-2,0],[-1,0],[1,0],[2,0],[-2,-1],[-1,-1],[0,-1],[1,-1],[2,-1],[-2,-2],[-1,-2],[0,-2],[1,-2],[2,-2]]}
  ]},
  {id:'solo',name:'第二关',phases:[{id:'solo-outline',name:'单轮廓',style:'geometry',goal:65,drops:8,cells:[[0,2],[-1,1],[0,1],[1,1],[-2,0],[-1,0],[1,0],[2,0],[-1,-1],[0,-1],[1,-1],[0,-2]]}]}
]};
const phaseContext=vm.createContext({console,structuredClone,performance,__routeText:JSON.stringify(phaseRoute)});
vm.runInContext(original.source,phaseContext);
vm.runInContext('globalThis.ROTATION_LITE_LEVEL_DATA=JSON.parse(globalThis.__routeText);delete globalThis.__routeText;',phaseContext);
vm.runInContext(fs.readFileSync(new URL('../lite-rules.js',import.meta.url),'utf8'),phaseContext);
vm.runInContext('installRotationLite(api)',phaseContext);
const makePhase=()=>new phaseContext.api.Game(42);
const fillOutline=g=>{g.phase='play';g.board=g.target.cells.map((c,i)=>({...c,id:g.id++,type:i%2?'T':'S'}));return g;};

test('inventory uses three kinds, stacks duplicates and promotes reserves in acquisition order',()=>{
  const g=make();g.liteGrantTool('shovel');g.liteGrantTool('supply');g.liteGrantTool('block-heavy');g.liteGrantTool('repair');g.liteGrantTool('block-heavy');
  assert.deepEqual(Array.from(g.liteInventory().active),['swap','shovel','supply']);
  assert.deepEqual(Array.from(g.liteInventory().reserve),['block-heavy','repair']);assert.equal(g.lite.tools['block-heavy'],2);
  assert.equal(g.liteUseTool('block-heavy'),false);assert.equal(g.liteUseTool('supply'),true);
  assert.deepEqual(Array.from(g.liteInventory().active),['swap','shovel','block-heavy']);
  assert.equal(g.liteUseTool('block-heavy'),true);assert.equal(g.lite.tools['block-heavy'],1);
  assert.deepEqual(Array.from(g.liteInventory().reserve),['repair']);
});
test('inventory reorder, saved order and reacquisition keep one position per kind',()=>{
  const g=make();g.liteGrantTool('shovel');for(const id of ['supply','repair','block-glass'])g.liteGrantTool(id);
  assert.equal(g.liteMoveTool('block-glass',2),true);
  assert.deepEqual(Array.from(g.liteInventory().active),['swap','shovel','block-glass']);
  const h=make();h.lite=JSON.parse(JSON.stringify(g.lite));h.liteEnsureExpansion();
  assert.deepEqual(Array.from(h.liteInventory().order),Array.from(g.liteInventory().order));
  h.liteMoveTool('swap',4);assert.deepEqual(Array.from(h.liteInventory().active),['shovel','block-glass','supply']);
  h.liteUseTool('supply');h.liteGrantTool('supply');assert.equal(h.liteInventory().order.at(-1),'supply');
  assert.equal(h.liteMoveTool('repair',-1),false);assert.equal(h.liteMoveTool('unknown',0),false);
});
test('shop and free reward put excess kinds in reserve and preserve them across stages',()=>{
  const g=make();g.liteGrantTool('shovel');g.liteGrantTool('supply');const r=complete(g);g.lite.coins=100;
  r.shopOffers=[{slot:0,kind:'special',item:'glass'}];assert.equal(g.liteBuyOffer(0),true);
  r.toolOptions=['repair'];assert.equal(g.liteChooseTool('repair'),true);
  assert.deepEqual(Array.from(g.liteInventory().reserve),['block-glass','repair']);
  assert.equal(g.liteNext(),true);assert.deepEqual(Array.from(g.liteInventory().reserve),['block-glass','repair']);
});

test('special tools consume on first use and ignore retired upgrade fields from saves',()=>{
 for(const legacy of [false,true]){
  const g=make();g.lite.tools['block-column']=2;
  if(legacy){g.lite.mods=['return','refund','diagonal'];g.lite.stageState={stage:g.stage,returnUsed:false};}
  const h=make();h.lite=JSON.parse(JSON.stringify(g.lite));h.liteEnsureExpansion();
  assert.equal('mods' in h.lite,false);assert.equal('stageState' in h.lite,false);
  assert.equal(h.liteUseTool('block-column'),true);assert.equal(h.lite.tools['block-column'],1);
  assert.equal(h.events.some(e=>e.kind==='lite-mod'),false);
  complete(h);h.liteSkipReward();assert.equal(h.liteUseTool('block-column'),true);assert.equal(h.lite.tools['block-column'],0);
 }
});
const finishObjective=g=>{while(g.phase==='play'){g.board=g.target.cells.map(c=>({...c,id:g.id++,type:'L'}));assert.equal(g.checkClear(),true);settle(g);}assert.equal(g.phase,'checkpoint-complete');};
const complete=g=>{g.checkpointScore=g.goal;g.completeCheckpoint();return g.litePrepareReward();};
const colourFixture = (coords, extras = []) => {
  const g = make();
  g.board = g.target.cells.map((c, i) => ({ ...c, id:g.id++, type:i % 2 ? 'T' : 'S' }));
  for (const [x,y] of coords) {
    const existing = g.board.find(c => c.x === x && c.y === y);
    if (existing) existing.type = 'L';
    else g.board.push({x,y,id:g.id++,type:'L'});
  }
  for (const [x,y,type] of extras) g.board.push({x,y,type,id:g.id++});
  return g;
};
const colourRoute = (coords, extras = []) => {
  const g = makeRoute();
  g.board = g.target.cells.map((c, i) => ({ ...c, id:g.id++, type:i % 2 ? 'T' : 'S' }));
  for (const [x,y] of coords) {
    const existing = g.board.find(c => c.x === x && c.y === y);
    if (existing) existing.type = 'L';
    else g.board.push({x,y,id:g.id++,type:'L'});
  }
  for (const [x,y,type] of extras) g.board.push({x,y,type,id:g.id++});
  return g;
};

const fill=(g,coords=[],effect=null)=>{
 g.phase='play';g.board=g.target.cells.map((c,i)=>({...c,id:g.id++,type:i%2?'T':'S'}));
 for(const [x,y] of coords){let c=g.board.find(c=>c.x===x&&c.y===y);if(!c){c={x,y,id:g.id++};g.board.push(c);}c.type='L';}
 if(effect)g.board.find(c=>c.type==='L').liteEffect=effect;
 return g;
};
const piece=(g,coords,effect,type='L')=>{const cells=coords.map(([x,y])=>({x,y,type,liteEffect:effect,id:g.id++}));g.board.push(...cells);g.liteAfterAttach(cells);return cells;};
const material=(g,coord,effect,placementId)=>({...coord,id:g.id++,type:'L',liteEffect:effect,placementId});

test('outline clear includes a whole bent same-colour component across its boundary in all rotations', () => {
  let shape = [[1,1],[2,1],[2,0],[3,0],[3,-1]];
  for (let turn=0;turn<4;turn++) {
    const g = colourRoute(shape, [[6,6,'L'],[2,2,'J']]);
    const ids = g.board.filter(c=>c.type==='L'&&c.x!==6).map(c=>c.id);
    assert.equal(g.checkClear(),true);
    assert.ok(ids.every(id=>g.cleared.some(c=>c.id===id)));
    assert.deepEqual(Array.from(g.board,c=>c.type),['L','J']);
    assert.equal(new Set(g.cleared.map(c=>c.id)).size,g.cleared.length);
    assert.equal(g.events.at(-1).linkedCount,4);
    assert.equal(g.totalCleared,g.cleared.length);
    shape=shape.map(([x,y])=>[-y,x]);
  }
});


test('four bent cells, diagonal contacts and entirely external groups do not extend an outline clear', () => {
  const cases = [
    [[1,1],[2,1],[2,0],[3,0]],
    [[1,1],[2,2],[3,2],[3,3],[4,3],[4,4]],
    [[3,1],[4,1],[4,0],[5,0],[5,-1]]
  ];
  for (const shape of cases) {
    const g = colourRoute(shape);
    const outline = new Set(g.target.cells.map(c=>`${c.x},${c.y}`));
    const outside = g.board.filter(c=>!outline.has(`${c.x},${c.y}`)).map(c=>c.id);
    assert.equal(g.checkClear(),true);
    assert.deepEqual(g.board.map(c=>c.id),outside);
    assert.equal(g.events.at(-1).linkedCount,0);
  }
});


test('original four-cell straight matches remain valid and connected groups wait for a filled outline', () => {
  const line = colourRoute([[1,1],[2,1],[3,1],[4,1]]);
  assert.equal(line.checkClear(),true);
  assert.equal(line.board.length,0);
  const bent = colourRoute([[1,1],[2,1],[2,0],[3,0],[3,-1]]);
  bent.board=bent.board.filter(c=>!(c.x===-1&&c.y===-1));
  const ids=bent.board.map(c=>c.id);
  assert.equal(bent.checkClear(),false);
  assert.deepEqual(bent.board.map(c=>c.id),ids);
});



test('copy retains original tetromino shapes and movement', () => {
  const g = make();
  const baseline = new original.Game(42);
  assert.equal(g.active.type, baseline.active.type);
  assert.deepEqual(JSON.parse(JSON.stringify(g.active.shape)), JSON.parse(JSON.stringify(baseline.active.shape)));
  assert.equal(g.stageCommitted, true);
  const x = g.active.x;
  assert.equal(g.move(1, 0), true);
  assert.equal(g.active.x, x + 1);
  assert.equal(g.rotatePiece(), true);
  assert.deepEqual(Object.keys(g.pixelCards), []);
  assert.equal(g.specialBlocks.length, 0);
});


test('score gate ignores clear count, rejects below goal, and accepts exact and excess scores', () => {
  const goal=make().goal;
  for(const score of [goal-1,goal,goal+1]){
    const g=make();g.lite.clears=100;g.checkpointScore=score;
    assert.equal(g.completeCheckpoint(),score>=goal);
    if(score>=goal){assert.equal(g.active,null);assert.equal(g.events.at(-1).goal,goal);}
  }
  const g=make();g.score=99999;g.checkpointScore=0;
  assert.equal(g.completeCheckpoint(),false);
  const area=g.target.cells.length;finishObjective(g);
  assert.ok(g.checkpointScore>=g.goal);assert.equal(g.target.cells.length,area);
  assert.ok(g.events.some(e=>e.kind==='clear'));assert.equal(g.active,null);
});

test('authored transition stages keep score pressure and drop budgets gradual', () => {
  const g = makeRoute();
  g.stage = 3;
  assert.equal(g.goal, 120);
  assert.equal(g.dropLimit, 26);
  g.stage = 4;
  assert.equal(g.goal, 140);
  assert.equal(g.dropLimit, 28);
  g.stage = 8;
  assert.equal(g.goal, 240);
  assert.equal(g.dropLimit, 42);
  g.endless = true;
  g.stage = 9;
  assert.equal(g.goal, Math.round(g.target.goals[0] * 0.875));
  assert.equal(g.dropLimit, Math.max(78, new original.Game(42).dropLimit));
});

test('authored outline changes invalidate a same-id outline from an older suspended run', () => {
  const g = make();
  const current = g.target;
  // This is the shape of a save produced before the editor changed the
  // phase: it has the same profile id but no content signature and stale
  // cells. Reading target must rebuild it from the authored route.
  g.outline = {
    stage: 0,
    growth: 0,
    liteProfile: ctx.ROTATION_LITE_OUTLINES[0].id,
    cells: [{x: 6, y: 6}]
  };
  assert.equal(g.target.cells.length, current.cells.length);
  assert.deepEqual(g.target.cells, current.cells);
  assert.notDeepEqual(g.target.cells, [{x: 6, y: 6}]);
});


test('four actual drops form a twelve-cell colour group and pass using the new score', () => {
  const g = makeRoute();
  const paths = [
    Array(12).fill('down'),
    [...Array(10).fill('down'), 'rotate'],
    ['right', 'right', ...Array(10).fill('down'), 'rotate', 'down', 'down'],
    ['left', ...Array(11).fill('down'), 'rotate', 'down', 'rotate', 'rotate', 'down']
  ];
  for (const path of paths) {
    for (const action of path) {
      const legal = action === 'rotate' ? g.rotatePiece()
        : g.move(action === 'left' ? -1 : action === 'right' ? 1 : 0, action === 'down' ? -1 : 0);
      assert.equal(legal, true);
    }
    g.drop();
    settle(g);
  }
  assert.equal(g.phase, 'checkpoint-complete');
  assert.equal(g.checkpointScore,160);
  assert.equal(g.dropsUsed, 4);
  assert.equal(g.lite.clears, 1);
  assert.ok(g.score > 0);
});


test('colour score uses connected components, deduplicates intersections, and leaves small non-lines plain', () => {
  const fixtures=[
    {shape:[[1,1],[2,1],[2,0],[3,0],[3,-1]],bonus:8,total:13},
    {shape:[[1,1],[2,1],[3,1],[4,1],[1,2],[1,3],[1,4]],bonus:20,total:27},
    {shape:[[1,1],[2,1],[1,2],[2,2]],bonus:0,total:4},
    {shape:[[1,1],[2,2],[3,3],[4,4],[5,5]],bonus:0,total:5},
    {shape:[[1,1],[2,1],[3,1],[4,1],[5,1],[1,3],[2,3],[3,3],[4,3],[5,3]],bonus:16,total:26},
    {shape:[[1,1],[2,1],[3,1],[4,1],[5,1],[1,2],[2,2],[3,2],[4,2],[5,2]],types:['L','L','L','L','L','T','T','T','T','T'],bonus:16,total:26}
  ];
  for(const f of fixtures){
    const cells=f.shape.map(([x,y],i)=>({x,y,id:i+1,type:f.types?.[i]||'L'}));
    const score=make().awardCells(cells);
    assert.equal(score.colorBonus,f.bonus);
    assert.equal(score.points,f.total);
    assert.equal(new Set(score.qualified).size,score.qualified.length);
    const duplicateScore=context.api.score([...cells,{...cells[0]}],{},{});
    assert.equal(duplicateScore.points,f.total);
  }
});


test('completed real rotor turn drops once; no drop on piece rotation or repeated finish', () => {
  const g = make();
  scripted(g, [0.01, 0.01]);
  const initial = g.lite.tools.supply;
  g.rotatePiece();
  assert.equal(g.lite.tools.supply, initial);
  g.board = [{ x: 1, y: 0, id: g.id++, type: 'L' }];
  g.beginRotation({ lever: 1, dir: -1 });
  g.finishRotation();
  assert.equal(g.lite.tools.supply, initial + 1);
  g.finishRotation();
  assert.equal(g.lite.tools.supply, initial + 1);
  assert.equal(g.events.filter(e => e.kind === 'lite-drop').length, 1);
});


test('rotation miss and invalid overflow never award a tool', () => {
  for (const overflow of [false, true]) {
    const g = make();
    scripted(g, [overflow ? 0 : 0.06]);
    const total = g.lite.tools.shovel + g.lite.tools.swap;
    g.board = [{ x: overflow ? 100 : 1, y: 0, id: g.id++, type: 'L' }];
    g.beginRotation({ lever: 1, dir: -1 });
    g.finishRotation();
    assert.equal(g.lite.tools.shovel + g.lite.tools.swap, total);
    if (overflow) assert.equal(g.phase, 'lost');
  }
});


test('deadlock waits for a usable swap even with no shovel, then resumes original check', () => {
  const g = make();
  g.board = [];
  for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) {
    if ((x !== 0 || y !== 0) && (x !== 1 || y !== 1)) g.board.push({ x, y, id: g.id++, type: 'L' });
  }
  g.lite.tools.shovel = 0;
  g.lite.tools.swap = 1;
  assert.equal(g.checkDeadlock(), false);
  assert.equal(g.phase, 'play');
  g.lite.tools.swap = 0;
  assert.equal(g.checkDeadlock(), true);
  assert.equal(g.phase, 'lost');
});


test('spread expands exactly one vacant ring around currently placed pattern with random colours',()=>{
 const g=make();g.lite.tools.shovel=1;g.board=[{x:0,y:0,id:g.id++,type:'L'}];
 const before=g.board.length;assert.equal(g.liteUseTool('shovel'),true);
 const added=g.events.at(-1).spreadCells;assert.equal(added.length,8);assert.equal(g.board.length,before+added.length);
 assert(added.every(cell=>['I','J','L','O','S','T','Z'].includes(cell.type)));
 const maxRadius=Math.max(...g.board.map(cell=>Math.max(Math.abs(cell.x),Math.abs(cell.y))));
 assert.equal(maxRadius,1);assert(!g.events.some(event=>event.kind==='compact'));
 assert.equal(g.board[0].x,0);assert.equal(g.board[0].y,0);
 assert.equal(g.lite.tools.shovel,0);assert.equal(g.liteUseTool('shovel'),false);
});
test('spread expands one ring around currently placed pattern rather than dashed target outline',()=>{
 const g=make();
 g.board=[{x:3,y:3,id:g.id++,type:'L'}];
 g.lite.tools.shovel=1;
 assert.equal(g.liteUseTool('shovel'),true);
 const ev=g.events.findLast(e=>e.tool==='shovel');
 assert(ev&&ev.amount===8);
 // All added cells should be exactly one ring away from the placed pattern (Chebyshev distance === 1 from (3,3))
 assert(ev.spreadCells.every(c=>Math.max(Math.abs(c.x-3),Math.abs(c.y-3))===1));
 // And target outline cells far away should NOT have been filled
 assert(!g.board.some(c=>c.x===0&&c.y===1));
});
test('spread expands exactly 12 cells around a 2x2 placed square',()=>{
 const g=make();
 g.board=[
   {x:3,y:3,id:g.id++,type:'L'},{x:4,y:3,id:g.id++,type:'L'},
   {x:3,y:4,id:g.id++,type:'L'},{x:4,y:4,id:g.id++,type:'L'}
 ];
 g.lite.tools.shovel=1;
 assert.equal(g.liteUseTool('shovel'),true);
 const ev=g.events.findLast(e=>e.tool==='shovel');
 assert.equal(ev.amount,12);
 assert(ev.spreadCells.every(c=>Math.min(...g.board.slice(0,4).map(b=>Math.max(Math.abs(c.x-b.x),Math.abs(c.y-b.y))))===1));
});
test('spread on empty board (开局) adds exactly 8 blocks around the rotor (0, 0)',()=>{
 const g=make();
 g.board=[];
 g.lite.tools.shovel=1;
 assert.equal(g.liteUseTool('shovel'),true);
 const ev=g.events.findLast(e=>e.tool==='shovel');
 assert.equal(ev.amount,8);
 assert.equal(g.board.length,8);
 for(const cell of g.board){
   assert.ok(Math.abs(cell.x)<=1&&Math.abs(cell.y)<=1);
   assert.ok(!(cell.x===0&&cell.y===0));
 }
});

test('swap grants a random special block and sends it to reserve when the three slots are full',()=>{
 const g=make();g.liteGrantTool('shovel');g.liteGrantTool('supply');g.lite.tools.swap=2;
 assert.equal(g.liteInventory().active.length,3);assert.equal(g.liteUseTool('swap'),true);
 const event=g.events.at(-1);assert.equal(event.kind,'lite-special-tool');assert.match(event.id,/^block-/);
 assert.equal(g.active!==null,true);assert.equal(g.lite.tools.swap,1);
 assert.equal(g.liteInventory().reserve.includes(event.id),true);
});

test('a missed heavy piece disappears without losing a life',()=>{
 const g=make();g.active.liteEffect='heavy';g.active.x=8;g.drop();
 assert.equal(g.lives,3);assert.equal(g.dropsUsed,1);assert.equal(g.board.length,0);assert.equal(g.events.at(-1).missed,true);
});

test('abandoning a piece keeps the drop budget, including the final remaining throw', () => {
  for(const endless of [false,true])for(const finalThrow of [false,true]){
    const g=make();g.endless=endless;
    if(finalThrow)g.dropsUsed=g.dropLimit-1;
    const used=g.dropsUsed,remaining=g.dropsRemaining,lives=g.lives,board=JSON.stringify(g.board);
    g.active.x=8;g.drop();settle(g);
    assert.ok(g.events.some(e=>e.kind==='miss'));
    assert.equal(g.dropsUsed,used);assert.equal(g.dropsRemaining,remaining);
    assert.equal(g.lives,lives-1);assert.equal(JSON.stringify(g.board),board);
    assert.equal(g.phase,'play');assert.ok(g.active);
    g.active={type:'L',color:'L',shape:[[0,0]],x:0,y:1,origin:'ordinary'};
    g.lock();assert.equal(g.dropsUsed,used+1);
  }
  const g=make();g.lives=1;g.active.x=8;g.drop();
  assert.equal(g.phase,'lost');assert.equal(g.dropsUsed,0);
});



test('dye takes the dominant board color and refuses empty or already matching colors', () => {
  const g=make();g.lite.tools.dye=2;
  assert.equal(g.liteUseTool('dye'),false);assert.equal(g.lite.tools.dye,2);
  g.board=[{x:2,y:0,id:g.id++,type:'T'},{x:3,y:0,id:g.id++,type:'T'},{x:4,y:0,id:g.id++,type:'L'}];
  g.active={type:'L',color:'L',shape:[[0,0]],x:0,y:1,origin:'ordinary'};
  const shape=JSON.stringify(g.active.shape),drops=g.dropsUsed,score=g.score;
  assert.equal(g.liteUseTool('dye'),true);assert.equal(g.active.color,'T');assert.equal(g.active.type,'L');
  assert.equal(JSON.stringify(g.active.shape),shape);assert.equal(g.dropsUsed,drops);assert.equal(g.score,score);
  assert.equal(g.liteUseTool('dye'),false);assert.equal(g.lite.tools.dye,1);
  g.lock();assert.equal(g.board.find(c=>c.x===0).type,'T');
});


test('repair restores one miss allowance, caps at three and cannot be used during resolution', () => {
  const g=make();g.lite.tools.repair=2;
  assert.equal(g.liteUseTool('repair'),false);assert.equal(g.lite.tools.repair,2);
  g.lives=2;g.phase='rotating';assert.equal(g.liteUseTool('repair'),false);
  g.phase='play';assert.equal(g.liteUseTool('repair'),true);assert.equal(g.lives,3);
  assert.equal(g.lite.tools.repair,1);assert.equal(g.liteUseTool('repair'),false);
});









test('ad revive adds ten drops, fills all outline holes and clears through the normal engine once',()=>{
 const g=make();g.lite.tools.supply=2;g.lite.coins=7;g.dropsUsed=g.dropLimit-1;g.fail('落空');
 const originalComplete=g.completeCheckpoint;g.completeCheckpoint=()=>false;
 const remaining=g.dropsRemaining,used=g.dropsUsed;assert.equal(g.canRevive,false);assert.equal(g.liteStartReviveAd(100),true);assert.equal(g.liteStartReviveAd(100),false);
 assert.equal(g.liteFinishReviveAd(2099),false);assert.equal(g.liteFinishReviveAd(2100),true);assert.equal(g.dropsRemaining,remaining+10);assert.equal(g.dropsUsed,used);assert.equal(g.phase,'clearing');assert.equal(g.cleared.length,g.target.cells.length);assert.equal(g.events.find(e=>e.kind==='revive').cells.length,g.target.cells.length);
 assert.equal(g.lite.tools.supply,2);assert.equal(g.lite.coins,7);assert.equal(g.lives,3);assert.equal(g.liteFinishReviveAd(2200),false);settle(g);assert.equal(g.phase,'play');assert(g.active);assert.equal(g.dropsRemaining,11);g.completeCheckpoint=originalComplete;
});

test('zero-drop fallback fills the authored outline once and can pass the score gate',()=>{
 const g=make();g.checkpointScore=g.goal-1;g.dropsUsed=g.dropLimit;
 const beforeClears=g.lite.clears;
 assert.equal(g.checkDropLimit(),true);
 assert.equal(g.phase,'clearing');
 assert.equal(g.events.at(-1).kind,'lite-zero-drop-clear');
 const clear=g.events.find(event=>event.kind==='clear');
 assert.equal(clear.fallback,true);assert.equal(clear.source,'zero-drop');
 settle(g);
 assert.equal(g.phase,'checkpoint-complete');assert(g.checkpointScore>=g.goal);
 assert.equal(g.lite.clears,beforeClears+1);
 const score=g.checkpointScore,clears=g.lite.clears;
 assert.equal(g.checkDropLimit(),false);assert.equal(g.checkpointScore,score);assert.equal(g.lite.clears,clears);
});

test('zero-drop fallback still clears before passing when the score is already at goal',()=>{
 const g=make();g.checkpointScore=g.goal;g.dropsUsed=g.dropLimit;
 assert.equal(g.checkDropLimit(),true);assert.equal(g.phase,'clearing');
 assert.equal(g.lite.clears,1);assert.equal(g.events.some(event=>event.kind==='clear'&&event.fallback),true);
 settle(g);assert.equal(g.phase,'checkpoint-complete');assert(g.checkpointScore>g.goal);
});

test('zero-drop fallback still respects a forced failure after its clear',()=>{
 const g=makeRoute();g.completeCheckpoint=()=>false;g.dropsUsed=g.dropLimit;
 assert.equal(g.checkDropLimit(),true);assert.equal(g.phase,'clearing');
 settle(g);
 assert.equal(g.phase,'lost');assert.equal(g.lite.clears,1);assert.equal(g.checkpointScore,g.goal);
});

test('revive preserves occupied cells, fills only missing slots and can complete a checkpoint',()=>{
 const g=make();g.board=g.target.cells.slice(0,3).map((c,i)=>({...c,id:g.id++,type:i%2?'T':'S'}));const existing=g.board.map(c=>c.id);g.checkpointScore=g.goal-1;g.lives=0;g.fail('落空');g.liteStartReviveAd(0);assert.equal(g.liteFinishReviveAd(2000),true);
 const added=g.events.find(e=>e.kind==='revive').cells;assert.equal(added.length,g.target.cells.length-existing.length);assert(existing.every(id=>g.cleared.some(c=>c.id===id)));assert.equal(new Set(g.cleared.map(c=>`${c.x},${c.y}`)).size,g.cleared.length);settle(g);assert.equal(g.phase,'checkpoint-complete');assert.equal(g.liteAwardClearCoins(),false);
});

test('revive cannot claim early, from play, after restart or with an old stage token',()=>{
 const g=make();assert.equal(g.liteStartReviveAd(0),false);g.fail('test');g.liteStartReviveAd(0);g.stage++;assert.equal(g.liteFinishReviveAd(3000),false);g.reset();assert.equal(g.liteFinishReviveAd(3000),false);assert.equal(g.lite.extraDrops,0);
});

test('V3 has only five tools and seven special blocks, with no Buff gains or growth',()=>{
 const g=make();assert.equal(ctx.ROTATION_LITE.buffs.length,0);assert.equal(ctx.ROTATION_LITE.tools.length,12);assert.equal(ctx.ROTATION_LITE.specials.length,7);assert(ctx.ROTATION_LITE.specials.some(block=>block.id==='diamond'));
 g.lite.buffs=['extra-moves','loose-outline','tool-echo'];g.lite.growth={training:4};g.lite.milestones=[{stage:2}];g.liteEnsureExpansion();
 assert.equal(g.lite.buffs.length,0);assert.equal(g.lite.growth,undefined);assert.equal(g.lite.milestones,undefined);assert.equal(g.dropLimit,24);assert.equal(g.liteGrantBuff('extra-moves'),false);assert.equal(g.liteBuffStacks('extra-moves'),0);assert.equal(g.liteNeedsMilestone(),false);assert.equal(g.liteComboNeedsChoice(),false);
 assert.equal(typeof g.liteRoll,'undefined');assert.equal(typeof g.liteGamble,'undefined');assert.equal(typeof g.liteRest,'undefined');
});
test('every reward gives three unique mixed choices and persists without reroll',()=>{
 for(let seed=0;seed<40;seed++){
  const g=new ctx.api.Game(seed),r=complete(g);assert.equal(r.route,'tool');assert.equal(r.entered,true);assert.equal(r.toolOptions.length,3);assert.equal(new Set(r.toolOptions).size,3);assert(r.toolOptions.some(id=>id.startsWith('block-')));assert(r.toolOptions.some(id=>!id.startsWith('block-')));
  const saved=JSON.stringify(g.lite),h=make();h.phase=g.phase;h.lite=JSON.parse(saved);h.litePrepareReward();assert.equal(JSON.stringify(h.lite),saved);
  const id=r.toolOptions[0],before=g.lite.tools[id];assert.equal(g.liteNext(),false);assert.equal(g.liteChooseTool(id),true);assert.equal(g.liteChooseTool(id),false);assert.equal(g.lite.tools[id],before+1);assert.equal(g.liteNext(),true);assert.equal(g.stage,1);assert.equal(g.lite.tools[id],before+1);
 }
});
test('choice refresh allows free once then three timed ads, rejects early/double claims and resumes saves',()=>{
 const g=make();g.stage=6;const r=complete(g),before=[...r.toolOptions];assert.equal(g.liteStartRewardAd(0),false);assert.equal(g.liteRefreshReward(),true);assert(r.toolOptions.some(id=>!before.includes(id)));assert.equal(g.liteRefreshReward(),false);
 for(let i=0;i<3;i++){
  assert.equal(g.liteStartRewardAd(i*3000),true);assert.equal(g.liteChooseTool(r.toolOptions[0]),false);assert.equal(g.liteFinishRewardAd(i*3000+1999),false);
  const h=make();h.stage=g.stage;h.phase=g.phase;h.lite=JSON.parse(JSON.stringify(g.lite));assert.equal(h.liteFinishRewardAd(i*3000+2000),true);assert.equal(h.lite.roll.adRefreshes,2-i);
  assert.equal(g.liteFinishRewardAd(i*3000+2000),true);assert.equal(g.liteFinishRewardAd(i*3000+2000),false);assert(r.toolOptions.some(id=>id.startsWith('block-')));assert(r.toolOptions.some(id=>!id.startsWith('block-')));
 }
 assert.equal(g.liteStartRewardAd(20000),false);assert.equal(g.liteChooseTool(r.toolOptions[0]),true);assert.equal(g.liteRefreshReward(),false);
});
test('supply station supports selection before confirmation and changing choice',()=>{
 const g=make(),r=complete(g);
 assert.equal(r.selectedTool,null);assert.equal(r.settled,false);assert.equal(r.chosenTool,null);
 const [opt0,opt1]=r.toolOptions;
 const before0=g.lite.tools[opt0]||0,before1=g.lite.tools[opt1]||0;
 r.selectedTool=opt0;
 assert.equal(r.settled,false);assert.equal(g.lite.tools[opt0]||0,before0);
 r.selectedTool=opt1;
 assert.equal(r.settled,false);assert.equal(g.lite.tools[opt1]||0,before1);
 assert.equal(g.liteChooseTool(r.selectedTool),true);
 assert.equal(r.settled,true);assert.equal(r.chosenTool,opt1);assert.equal(r.selectedTool,null);
 assert.equal(g.lite.tools[opt1],before1+1);assert.equal(g.lite.tools[opt0]||0,before0);
 assert.equal(g.liteChooseTool(opt0),false);
});
test('shop repeats purchases with independent Fibonacci prices, keeps choices and persists prices across stages',()=>{
 const g=make();g.stage=6;const r=complete(g);assert.equal(r.shopOffers.length,8);assert.equal(r.shopOffers.filter(o=>o.kind==='tool').length,4);assert.equal(r.shopOffers.filter(o=>o.kind==='special').length,4);assert.equal(new Set(r.shopOffers.map(o=>o.kind+o.item)).size,8);
 // SymPy: 5 * fibonacci(n + 2), n = 0..7.
 const prices=[5,10,15,25,40,65,105,170];
 for(const kind of ['tool','special']){
  const offer=r.shopOffers.find(o=>o.kind===kind),id=kind==='special'?'block-'+offer.item:offer.item,before=g.lite.tools[id];
  for(const [index,price] of prices.entries()){
   assert.equal(g.liteOfferPrice(offer),price);g.lite.coins=price-1;
   const count=g.lite.shopPurchases[id]||0;assert.equal(g.liteBuyOffer(offer.slot),false);assert.equal(g.lite.shopPurchases[id]||0,count);
   g.lite.coins=price;assert.equal(g.liteBuyOffer(offer.slot),true);assert.equal(g.lite.coins,0);assert.equal(g.lite.tools[id],before+index+1);assert.equal(offer.paidPrice,price);
  }
 }
 const untouched=r.shopOffers.find(o=>!g.lite.shopPurchases[o.kind==='special'?'block-'+o.item:o.item]);assert.equal(g.liteOfferPrice(untouched),5);assert.equal(r.settled,false);
 const offer=r.shopOffers[0],price=g.liteOfferPrice(offer);const h=make();h.stage=g.stage;h.phase=g.phase;h.lite=JSON.parse(JSON.stringify(g.lite));h.litePrepareReward();assert.equal(h.liteOfferPrice(offer),price);
 assert.equal(h.liteChooseTool(r.toolOptions[0]),true);assert.equal(h.liteBuyOffer(offer.slot),false);assert.equal(h.liteNext(),true);complete(h);
 // Returning stock is priced by item identity, independent of its new slot.
 assert.equal(h.liteOfferPrice({...offer,slot:777}),price);h.reset();assert.equal(h.liteOfferPrice(offer),5);
});

test('shop batch purchase sums consecutive Fibonacci prices and grants one item per quantity',()=>{
 const g=make(),r=complete(g),offer=r.shopOffers[0],id=offer.kind==='special'?'block-'+offer.item:offer.item;
 assert.equal(g.liteOfferBatchPrice(offer,3),30);g.lite.coins=30;
 const before=g.lite.tools[id]||0;assert.equal(g.liteBuyOffer(offer.slot,3),true);
 assert.equal(g.lite.coins,0);assert.equal(g.lite.tools[id],before+3);assert.equal(g.lite.shopPurchases[id],3);
 assert.equal(offer.paidPrice,30);assert.equal(offer.paidQuantity,3);assert.equal(g.events.at(-1).quantity,3);assert.equal(g.events.at(-1).totalPrice,30);
 assert.equal(g.liteOfferPrice(offer),25);assert.equal(g.liteOfferBatchPrice(offer,2),65);
 const coins=g.lite.coins,owned=g.lite.tools[id];assert.equal(g.liteBuyOffer(offer.slot,2),false);assert.equal(g.lite.coins,coins);assert.equal(g.lite.tools[id],owned);
});

test('shop purchases can occur across consecutive stages with stage coins and increasing prices',()=>{
 const g=make();
 for(let s=0;s<3;s++){
  assert.equal(g.stage,s);
  const r=complete(g);
  assert.equal(g.lite.coins>=5,true);
  const offer=r.shopOffers[0];
  const price=g.liteOfferPrice(offer);
  const id=offer.kind==='special'?'block-'+offer.item:offer.item;
  const initialTools=g.lite.tools[id]||0;
  g.lite.coins=Math.max(g.lite.coins,price);
  assert.equal(g.liteBuyOffer(offer.slot),true);
  assert.equal(g.lite.tools[id],initialTools+1);
  assert.equal(g.liteChooseTool(r.toolOptions[0]),true);
  assert.equal(g.liteNext(),true);
 }
});

test('free rewards and rotor drops do not raise shop prices; old sold stock reopens at its next price',()=>{
 const g=make(),r=complete(g),offer=r.shopOffers[0],id=offer.kind==='special'?'block-'+offer.item:offer.item;
 g.lite.tools[id]+=8;assert.equal(g.liteOfferPrice(offer),5);
 delete g.lite.shopPurchases;offer.sold=true;offer.price=5;g.liteEnsureExpansion();assert.equal(g.liteOfferPrice(offer),10);assert.equal(offer.sold,undefined);
 g.liteEnsureExpansion();assert.equal(g.liteOfferPrice(offer),10);g.lite.coins=10;assert.equal(g.liteBuyOffer(offer.slot),true);assert.equal(g.liteOfferPrice(offer),15);
});

test('clear overflow uses half-up rounding and never pays twice after reload or opening choices',()=>{
 // SymPy floor(excess/10 + 1/2) independently verified.
 for(const [excess,coins] of [[0,0],[4,0],[5,1],[14,1],[15,2],[25,3],[55,6],[10000,1000]]){
  const g=make();g.lite.coins=11;g.checkpointScore=g.goal+excess;g.completeCheckpoint();assert.equal(g.lite.coins,16+coins);assert.equal(g.liteClearCoinReward().overflow,coins);g.litePrepareReward();assert.equal(g.lite.coins,16+coins);
  const h=make();h.phase=g.phase;h.lite=JSON.parse(JSON.stringify(g.lite));assert.equal(h.liteAwardClearCoins(),false);assert.equal(h.lite.coins,16+coins);
 }
});
test('stage budgets, inventory and skipping continue every authored stage and finish the run',()=>{
 const g=make();g.lite.tools['block-pack']=4;g.lite.tools.repair=3;
 for(const budget of ctx.ROTATION_LITE.dropLimits){
  assert.equal(g.dropLimit,budget);complete(g);assert.equal(g.liteSkipReward(),true);assert.equal(g.lite.tools['block-pack'],4);assert.equal(g.lite.tools.repair,3);
 }
 assert.equal(g.phase,'won');assert.equal(g.liteSkipReward(),false);g.reset();assert.equal(g.lite.tools['block-pack'],0);assert.equal(g.lite.tools.repair,0);
});
test('authored contour route grows through geometric and object silhouettes',()=>{
 const profiles=route.ROTATION_LITE_OUTLINES;
 assert.equal(route.ROTATION_LITE.levels,9);assert.equal(profiles.length,9);
 const expectedNames=['小方环','菱形','横向矩形','十字星','圆角方环','宽翼十字','菱形扩展','圣诞树','小猫头'];
 const expectedSizes=[8,12,14,20,24,32,36,44,57];
 assert.deepEqual(Array.from(profiles,p=>p.name),expectedNames);
 assert.deepEqual(Array.from(profiles,p=>p.cells.length),expectedSizes);
 assert.equal(profiles.at(-2).style,'object');assert.equal(profiles.at(-1).style,'object');
 const g=makeRoute();
 for(const [stage,profile] of profiles.entries()){
  g.stage=stage;g.outline=null;const target=g.target;
  assert.equal(target.name,profile.name);assert.equal(target.cells.length,profile.cells.length);
  const keys=target.cells.map(c=>`${c.x},${c.y}`);
  assert.equal(new Set(keys).size,keys.length);
  assert(target.cells.every(c=>Number.isInteger(c.x)&&Number.isInteger(c.y)));
 }
});
test('endless retains native varied contours and continues beyond the authored route',()=>{
 const g=make(),baseline=new original.Game(42);g.endless=baseline.endless=true;baseline.outlineSeed=g.outlineSeed;const shapes=new Set();
 for(let stage=0;stage<12;stage++){
  g.stage=baseline.stage=stage;g.outline=baseline.outline=null;
  assert.equal(JSON.stringify(g.target.cells),JSON.stringify(baseline.target.cells));
  shapes.add(JSON.stringify(g.target.cells));
  const configured=ctx.ROTATION_LITE.dropLimits[stage]??(stage<ctx.ROTATION_LITE.lateDropStart?ctx.ROTATION_LITE.dropLimit:ctx.ROTATION_LITE.lateDropBase+(stage-ctx.ROTATION_LITE.lateDropStart)*ctx.ROTATION_LITE.lateDropStep+(stage>=ctx.ROTATION_LITE.lateScoreStart?ctx.ROTATION_LITE.postFourthDropBonus:0));
  assert.equal(g.dropLimit,Math.max(configured,baseline.dropLimit));
 }
 assert(shapes.size>5);complete(g);assert.equal(g.liteSkipReward(),true);assert.equal(g.stage,12);assert.equal(g.phase,'play');
});

test('Fibonacci colour bonus preserves the independently verified sequence and post-ten slope',()=>{
 // SymPy 4*Fibonacci(n-2) for n=4..10; after ten the final difference repeats.
 assert.deepEqual(Array.from({length:7},(_,i)=>ctx.liteColorBonus(i+4)),[4,8,12,20,32,52,84]);assert.equal(ctx.liteColorBonus(11),116);assert.equal(ctx.liteColorBonus(12),148);
});

const land=(g,effect,coords=[[0,1]],type='L')=>{
 g.active={type,color:type,shape:coords.map(([x,y])=>[x,y-1]),x:0,y:1,origin:'ordinary',liteEffect:effect};
 g.lock(true);return g.events.find(e=>e.kind==='special');
};
test('column landing dyes every occupied column including far cells but leaves other columns alone',()=>{
 const g=make();g.board=[[0,5],[0,-5],[1,6],[2,6]].map(([x,y])=>({x,y,id:g.id++,type:'T'}));
 land(g,'column',[[0,1],[1,1]]);
 assert(g.board.filter(c=>c.x===0||c.x===1).every(c=>c.type==='L'));
 assert.equal(g.board.find(c=>c.x===2).type,'T');
 assert(g.board.filter(c=>g.lite.lastPlacementIds.includes(c.id)).every(c=>!c.liteEffect));
});
test('blast clears every same-colour cell, adds compound snapshot bonus, and pays coin cells once',()=>{
 const g=make();g.stage=8;g.outline=null;g.checkpointScore=100;g.levelScore=100;g.score=500;
 g.board=[{x:4,y:0,id:g.id++,type:'L',liteHeavyBonus:12,liteCoin:true},{x:-1,y:0,id:g.id++,type:'L'},{x:1,y:0,id:g.id++,type:'T'}];
 const event=land(g,'blast');assert.equal(event.removed.length,3);assert(event.removed.every(c=>c.type==='L'));
 assert.equal(event.scoring.points,20);assert.equal(event.scoring.blastBonus,5);assert.equal(event.scoring.coinReward,3);
 assert.equal(g.lite.coins,3);assert.equal(g.score,520);assert.equal(g.checkpointScore,120);assert.equal(g.totalCleared,3);assert(g.board.every(c=>c.type==='T'));
 assert.equal(g.resolvePendingSpecial(),null);assert.equal(g.score,520);assert.equal(g.lite.coins,3);
});
test('blast compounds from one snapshot and rounds only once including exact halves',()=>{
 // SymPy: floor(S*((1015/1000)**N-1)+1/2), independently verified.
 for(const [score,count,expected] of [[100,3,5],[45,3,2],[1000,10,161],[50,1,1],[5000,2,151],[0,10,0]])assert.equal(ctx.liteBlastBonus(score,count),expected);
 const g=make();g.checkpointScore=1000;g.levelScore=1000;g.score=1000;g.board=Array.from({length:9},(_,i)=>({x:i+1,y:0,id:g.id++,type:'L'}));
 const expected=make().awardCells([...g.board,{x:0,y:1,type:'L',id:99}],'tool').points;
 const event=land(g,'blast');assert.equal(event.scoring.points,expected+161);assert.equal(g.checkpointScore,1000+expected+161);
});
test('glass block mirrors landing side blocks to the opposite side and only generated blocks become glass blocks',()=>{
 const g=make();
 g.board=[{x:-2,y:1,id:g.id++,type:'T'},{x:-1,y:0,id:g.id++,type:'S'},{x:3,y:3,id:g.id++,type:'J'}];
 // Land glass block at [-1, 1] (left side)
 const event=land(g,'glass',[[-1,1]],'L');
 assert.equal(event.liteEffect,'glass');
 const rightMap=new Map(g.board.filter(c=>c.x>0).map(c=>[`${c.x},${c.y}`,c]));
 assert.equal(rightMap.get('2,1')?.type,'T');
 assert.equal(rightMap.get('1,0')?.type,'S');
 assert.equal(rightMap.get('1,1')?.type,'L');
 assert.equal(rightMap.get('3,3')?.type,'J');
 // 1. Source side (left) does NOT become glass blocks
 assert(g.board.filter(c=>c.x<0).every(c=>!c.liteGlass));
 // Only generated/mirrored blocks on right become glass blocks
 assert.equal(rightMap.get('2,1')?.liteGlass,true);
 assert.equal(rightMap.get('1,0')?.liteGlass,true);
 assert.equal(rightMap.get('1,1')?.liteGlass,true);
 assert.equal(rightMap.get('3,3')?.liteGlass,undefined);

 // 2. Land on right side: mirrors right to left, without overwriting conflicting target coordinates
 const h=make();
 h.board=[{x:2,y:0,id:h.id++,type:'Z'},{x:-2,y:0,id:h.id++,type:'O'}];
 land(h,'glass',[[2,1]],'T');
 const leftCell=h.board.find(c=>c.x===-2&&c.y===0);
 assert.equal(leftCell?.type,'O');
 assert.equal(leftCell?.liteGlass,undefined);
 assert.equal(h.board.find(c=>c.x===2&&c.y===0)?.liteGlass,undefined);
 const mirroredNew=h.board.find(c=>c.x===-2&&c.y===1);
 assert.equal(mirroredNew?.type,'T');
 assert.equal(mirroredNew?.liteGlass,true);

 // 3. 4-long bar dropped symmetrically does NOT trigger mirror effect or turn into glass
 const k=make();
 k.board=[{x:-3,y:0,id:k.id++,type:'T'}];
 land(k,'glass',[[0,1],[0,2],[0,3],[0,4]],'I');
 assert.equal(k.board.filter(c=>c.x===3).length,0);
 assert(k.board.every(c=>!c.liteGlass));
});
test('generated glass blocks are immune to color effects such as blast, column dye and diamond marking',()=>{
 const g=make();
 g.board=[
   {x:1,y:1,id:g.id++,type:'L',liteGlass:true},
   {x:1,y:2,id:g.id++,type:'T',liteGlass:true},
   {x:2,y:1,id:g.id++,type:'L'},
   {x:3,y:1,id:g.id++,type:'T'}
 ];
 // Blast block of type 'L': clears regular 'L' at (2,1) and itself, but NOT glass 'L' at (1,1)
 piece(g,[[0,5]],'blast','L');
 g.resolvePendingSpecial();
 assert(g.board.some(c=>c.x===1&&c.y===1&&c.liteGlass&&c.type==='L'));
 assert(!g.board.some(c=>c.x===2&&c.y===1));

 // Column block of type 'S' dropped in column 1:
 // Glass cells in column 1 do NOT get dyed
 piece(g,[[1,5]],'column','S');
 g.resolvePendingSpecial();
 const glassCell=g.board.find(c=>c.x===1&&c.y===2);
 assert.equal(glassCell?.type,'T'); // Still 'T', not dyed to 'S'

 // Diamond block of type 'T':
 // Glass cells in board do NOT get diamond mark
 piece(g,[[3,5]],'diamond','T');
 g.resolvePendingSpecial();
 assert.equal(glassCell?.liteDiamond,undefined);
});
test('coin block stays where it lands and pays each coin cell for the whole clear batch once',()=>{
 const g=make();g.board=[{x:1,y:0,id:g.id++,type:'T'},{x:2,y:0,id:g.id++,type:'S'}];
 const marked=piece(g,[[3,1],[4,1]],'patch');g.resolvePendingSpecial();
 assert.deepEqual(Array.from(marked,c=>[c.x,c.y]),[[3,1],[4,1]]);assert(marked.every(c=>c.liteCoin&&c.liteEffect==='patch'));assert.equal(g.lite.coins,0);
 const score=g.awardCells(g.board,'outline');assert.equal(score.coinReward,8);assert.equal(g.lite.coins,8);
 g.awardCells(g.board,'outline');assert.equal(g.lite.coins,8);
});
test('coin reward covers blast and excludes shovel or pack consumption',()=>{
 const g=make();g.board=[{x:5,y:0,type:'L',id:g.id++,liteCoin:true},{x:6,y:0,type:'L',id:g.id++}];
 const event=land(g,'blast');assert.equal(event.scoring.coinReward,3);assert.equal(g.lite.coins,3);
 const h=make();h.liteGrantTool('shovel');piece(h,[[3,1]],'patch');h.resolvePendingSpecial();assert.equal(h.liteUseTool('shovel'),true);assert.equal(h.lite.coins,0);
 const k=make();const cells=piece(k,[[0,1]],'pack');cells[0].liteCoin=true;k.resolvePendingSpecial();assert.equal(k.lite.coins,0);
});
test('pack consumes its own piece and uses the original reference central repack with preserved colours and IDs',()=>{
 const g=make();g.board=[{x:5,y:5,id:g.id++,type:'T'},{x:-5,y:2,id:g.id++,type:'S'},{x:3,y:0,id:g.id++,type:'J'}];
 const expected=make();expected.board=g.board.map(c=>({...c}));expected.settleRemaining(true);
 const event=land(g,'pack');assert.equal(event.removed.length,1);assert.equal(event.scoring,null);
 assert.deepEqual(Array.from(g.board,c=>[c.id,c.x,c.y,c.type]),Array.from(expected.board,c=>[c.id,c.x,c.y,c.type]));
 assert.equal(g.phase,'settling');settle(g);assert.equal(g.phase,'play');assert.equal(g.dropsUsed,1);
});
test('heavy boosts only same-colour landing snapshot, includes itself, and stacks on repeat',()=>{
 const g=make();g.board=[[-1,0,'L'],[1,0,'L'],[2,0,'L'],[4,0,'T']].map(([x,y,type])=>({x,y,type,id:g.id++}));
 piece(g,[[0,1]],'heavy');g.resolvePendingSpecial();const first=g.board.filter(c=>c.type==='L');assert(first.every(c=>c.liteHeavyBonus===12));assert.equal(g.board.find(c=>c.type==='T').liteHeavyBonus,undefined);
 const later={x:3,y:1,type:'L',id:g.id++};g.board.push(later);assert.equal(later.liteHeavyBonus,undefined);
 piece(g,[[4,1]],'heavy');g.resolvePendingSpecial();assert(first.every(c=>c.liteHeavyBonus===30));assert.equal(later.liteHeavyBonus,18);assert.equal(g.events.filter(e=>e.kind==='turn').length,0);
});
test('heavy score weights base and each own colour bonus without boosting other colours',()=>{
 // SymPy: (4+4)*13+(4+4)=112; (5+8)*(2*13+3)/5=75.4 ->75.
 const g=make(),cells=[...Array.from({length:4},(_,x)=>({x,y:1,type:'L',id:x+1,liteHeavyBonus:12})),...Array.from({length:4},(_,x)=>({x,y:3,type:'T',id:x+5}))];
 const result=g.awardCells(cells,'outline');assert.equal(result.points,112);assert.equal(result.heavyCellCount,4);assert.equal(result.heavyMaxMultiplier,13);
 const mixed=Array.from({length:5},(_,x)=>({x,y:1,type:'L',id:x+1,liteHeavyBonus:x<2?12:0}));assert.equal(make().awardCells(mixed,'outline').points,75);
 const blast=make();blast.board=[{x:5,y:0,id:blast.id++,type:'L',liteHeavyBonus:12},{x:6,y:0,id:blast.id++,type:'T'}];assert.equal(land(blast,'blast').scoring.points,14);
});
test('diamond marks every same-colour cell at landing and triples marked score on clear',()=>{
 const g=make();
 const existing=[{x:1,y:1,type:'L',id:g.id++},{x:2,y:1,type:'L',id:g.id++},{x:3,y:1,type:'L',id:g.id++}];g.board.push(...existing);
 const marked=piece(g,[[0,1]],'diamond');g.resolvePendingSpecial();
 assert.equal(marked[0].liteDiamond,true);assert.equal(g.board.filter(c=>c.liteDiamond).length,4);
 const laterSameColour={x:4,y:1,type:'L',id:g.id++};g.board.push(laterSameColour);
 assert.equal(laterSameColour.liteDiamond,undefined);
 const result=g.awardCells(g.board,'outline');assert.equal(result.diamondCellCount,4);assert.equal(result.diamondMultiplier,3);assert.equal(result.diamondBonus,8);assert.equal(result.points,21);
});
test('heavy drops each cell independently without losing a life, then starts the rotor turn',()=>{
 const g=make();g.board=[{x:2,y:0,id:g.id++,type:'L'}];g.active.liteEffect='heavy';g.active.x=2;g.drop(true);
 assert.equal(g.lives,3);assert.equal(g.dropsUsed,1);assert.equal(g.phase,'rotating');
 assert.equal(g.events.filter(e=>e.heavyDrop).length,2);assert.equal(g.events.filter(e=>e.kind==='turn').length,1);
});
test('heavy block lands into position and eliminates up to 6 rows downwards per occupied column, self-eliminating to avoid hanging and compacting remaining blocks',()=>{
 const g=make();
 for(let y=1;y>=-6;y--){g.board.push({x:2,y,id:g.id++,type:'L'});}
 g.active={type:'I',shape:[[0,0]],x:2,y:5,liteEffect:'heavy',color:'I'};
 g.liteLockHeavy(true);
 const specialEvent=g.events.find(e=>e.kind==='special'&&e.liteEffect==='heavy');
 assert(specialEvent);
 assert.equal(specialEvent.cells[0].x,2);
 assert.equal(specialEvent.cells[0].y,2,'heavy cell should land at y = 2');
 assert.equal(specialEvent.removed.length,7,'should eliminate 6 blocks downwards plus the heavy block itself');
 assert(specialEvent.scoring.points>0);
 assert.equal(g.board.length,2,'8 initial blocks - 6 removed = 2 blocks remaining, heavy block not left hanging');
 assert(!g.board.some(c=>c.x===2&&c.y===2),'heavy block cell is not on board');
 const compactEvent=g.events.find(e=>e.kind==='compact');
 assert(compactEvent,'compact event should be recorded');
 assert(compactEvent.steps.length>0,'remaining blocks should compact inwards');
 const remainingDistances=g.board.map(c=>Math.abs(c.x)+Math.abs(c.y));
 assert(remainingDistances.every(d=>d < (2+6)),'blocks should have moved closer to center');
});
test('spread grows sequentially clockwise when center of gravity is to the right, and counterclockwise when to the left',()=>{
 const gRight=make();gRight.board=[{x:3,y:0,id:gRight.id++,type:'L'}];
 gRight.lite.tools.shovel=1;gRight.liteUseTool('shovel');
 const evRight=gRight.events.find(e=>e.kind==='lite-tool'&&e.tool==='shovel');
 assert.equal(evRight.direction,'cw');assert.equal(evRight.cog.x,3);

 const gLeft=make();gLeft.board=[{x:-3,y:0,id:gLeft.id++,type:'L'}];
 gLeft.lite.tools.shovel=1;gLeft.liteUseTool('shovel');
 const evLeft=gLeft.events.find(e=>e.kind==='lite-tool'&&e.tool==='shovel');
 assert.equal(evLeft.direction,'ccw');assert.equal(evLeft.cog.x,-3);
});
test('heavy and coin metadata follow rotations, repacks, dye and save reload; old extra turns are discarded',()=>{
 const g=make();g.board=[{x:1,y:0,id:g.id++,type:'L',liteHeavyBonus:12,liteCoin:true,liteEffect:'patch'},{x:-1,y:0,id:g.id++,type:'T'}];const id=g.board[0].id;
 g.beginRotation({dir:1,lever:-1});g.finishRotation();g.settleRemaining(true);const moved=g.board.find(c=>c.id===id);assert.equal(moved.liteHeavyBonus,12);assert.equal(moved.liteCoin,true);
 piece(g,[[moved.x,5]],'column','T');g.resolvePendingSpecial();assert.equal(g.board.find(c=>c.id===id).type,'T');assert.equal(g.board.find(c=>c.id===id).liteHeavyBonus,12);
 const h=make();h.board=JSON.parse(JSON.stringify(g.board));h.lite=JSON.parse(JSON.stringify(g.lite));h.lite.heavyTurns={remaining:2,dir:1};h.liteEnsureExpansion();assert.equal(h.lite.heavyTurns,undefined);assert.equal(h.board.find(c=>c.id===id).liteHeavyBonus,12);assert.equal(h.board.find(c=>c.id===id).liteCoin,true);
});
test('supply grants rounded ten percent of current total limit, including previous grants',()=>{
 const g=make();g.liteGrantTool('supply',2);g.dropsUsed=20;assert.equal(g.liteUseTool('supply'),true);assert.equal(g.dropLimit,29);assert.equal(g.events.at(-1).amount,5);assert.equal(g.liteUseTool('supply'),true);assert.equal(g.dropLimit,35);assert.equal(g.events.at(-1).amount,6);
 const h=make();h.stage=7;h.liteGrantTool('supply');const initLimit=h.dropLimit,inc=3+Math.round(initLimit*0.1);assert.equal(h.liteUseTool('supply'),true);assert.equal(h.dropLimit,initLimit+inc);assert.equal(h.events.at(-1).amount,inc);
 const half=make();half.lite.extraDrops=1;half.liteGrantTool('supply');half.liteUseTool('supply');assert.equal(half.dropLimit,31);
});
test('all six tools transform a real falling piece, consume inventory, trigger once on landing and settle',()=>{
 for(const {id} of ctx.ROTATION_LITE.specials){
  const g=make();g.lite.tools['block-'+id]=1;const shape=JSON.stringify(g.active.shape);
  assert.equal(g.liteUseTool('block-'+id),true);assert.equal(g.lite.tools['block-'+id],0);assert.equal(JSON.stringify(g.active.shape),shape);
  assert.equal(g.liteUseTool('block-'+id),false);g.drop(true);settle(g);
  assert.equal(g.events.filter(e=>e.kind==='special'&&e.liteEffect===id).length,1);
  assert(['play','checkpoint-complete'].includes(g.phase));assert.equal(g.dropsUsed,1);assert(g.board.every(c=>!c.liteEffect||(id==='patch'&&c.liteCoin)));
 }
});
test('missing with a special piece never fires its landing power or consumes a drop',()=>{
 for(const {id} of ctx.ROTATION_LITE.specials){const g=make();g.active.x=8;g.active.liteEffect=id;g.drop();if(id==='heavy'){assert.equal(g.events.some(e=>e.heavyDrop),true);assert.equal(g.dropsUsed,1);assert.equal(g.lives,3);}else{assert.equal(g.events.some(e=>e.kind==='special'),false);assert.equal(g.dropsUsed,0);assert.equal(g.lives,2);}}
});
test('old V3 inventory and pending choices migrate to the six-item pool once without refreshing quotas',()=>{
 const g=make();g.lite.tools['block-spread']=3;g.active.liteEffect='prism';
 g.lite.roll={toolOptions:['block-bonus','block-prism','shovel'],shopOffers:[{kind:'special',item:'coin',sold:true}],freeRefreshes:0,adRefreshes:1};
 g.liteEnsureExpansion();assert.equal(g.lite.tools['block-column'],3);assert.equal(g.active.liteEffect,'pack');assert.equal(g.lite.roll.freeRefreshes,0);assert.equal(g.lite.roll.adRefreshes,1);
 assert(g.lite.roll.toolOptions.every(id=>ctx.ROTATION_LITE.tools.some(t=>t.id===id)));assert.equal(g.lite.roll.shopOffers[0].sold,undefined);
 g.liteEnsureExpansion();assert.equal(g.lite.tools['block-column'],3);
});
test('claimed supply waits for continue, blocks reclaims but permits shop purchases',()=>{
 const g=make(),r=complete(g),id=r.toolOptions[0],before=g.lite.tools[id],stage=g.stage;
 assert.equal(g.liteChooseTool(id),true);assert.equal(g.stage,stage);assert.equal(r.chosenTool,id);
 for(const choice of r.toolOptions)assert.equal(g.liteChooseTool(choice),false);
 assert.equal(g.liteRefreshReward(),false);assert.equal(g.liteStartRewardAd(),false);
 const offer=r.shopOffers[0];g.lite.coins=g.liteOfferPrice(offer);assert.equal(g.liteBuyOffer(offer.slot),true);
 const h=make();h.stage=g.stage;h.phase=g.phase;h.lite=JSON.parse(JSON.stringify(g.lite));h.litePrepareReward();
 assert.equal(h.lite.roll.chosenTool,id);assert.equal(h.lite.roll.settled,true);assert.equal(h.liteChooseTool(id),false);
 assert.equal(h.liteNext(),true);assert.equal(h.stage,stage+1);assert.equal(h.liteNext(),false);
});

test('clearing an outline moves the level on to its next outline and keeps the run',()=>{
 const g=makePhase();
 assert.equal(phaseContext.ROTATION_LITE.levels,2);
 // 分数与投放次数属于整关：第二个阶段自己填的 9999 / 1 不参与，取第一个阶段的值
 assert.deepEqual(Array.from(phaseContext.ROTATION_LITE.dropLimits),[10,8]);
 assert.equal(g.stage,0);assert.equal(g.goal,4000);assert.equal(g.dropLimit,10);
 assert.equal(g.target.cells.length,8);assert.equal(g.target.phaseIndex,0);assert.equal(g.target.phaseCount,2);
 fillOutline(g);g.dropsUsed=3;
 assert.equal(g.checkClear(),true);assert.equal(g.phase,'clearing');
 settle(g);
 assert.equal(g.stage,0);assert.equal(g.lite.phaseIndex,1);
 assert.equal(g.target.name,'大轮廓');assert.equal(g.target.cells.length,24);
 assert.equal(g.dropsUsed,3);
 assert(g.checkpointScore>0);
 assert.equal(g.lite.clears,1);
 assert.equal(g.events.filter(e=>e.kind==='lite-phase').length,1);
});

test('reaching the level goal settles instead of switching outlines',()=>{
 const g=makePhase();
 fillOutline(g);g.checkpointScore=g.goal-1;
 assert.equal(g.checkClear(),true);
 settle(g);
 assert.equal(g.lite.phaseIndex,0);
 assert.equal(g.target.cells.length,8);
 assert.equal(g.phase,'checkpoint-complete');
 assert.equal(g.events.some(e=>e.kind==='lite-phase'),false);
});

test('the last outline stays put and a spent drop budget never switches',()=>{
 const g=makePhase();
 fillOutline(g);assert.equal(g.checkClear(),true);settle(g);
 assert.equal(g.lite.phaseIndex,1);
 fillOutline(g);assert.equal(g.checkClear(),true);settle(g);
 assert.equal(g.phase,'play');assert.equal(g.lite.phaseIndex,1);assert.equal(g.target.cells.length,24);
 const h=makePhase();
 fillOutline(h);h.dropsUsed=h.dropLimit;
 assert.equal(h.checkClear(),true);settle(h);
 assert.equal(h.lite.phaseIndex,0);assert.equal(h.target.cells.length,8);
});

test('a resumed run comes back to the outline it was left on',()=>{
 const g=makePhase();
 fillOutline(g);g.checkClear();settle(g);
 assert.equal(g.lite.phaseIndex,1);
 const saved=JSON.parse(JSON.stringify(g));
 const h=makePhase();
 Object.assign(h,saved);h.liteEnsureExpansion();
 assert.equal(h.target.name,'大轮廓');assert.equal(h.target.cells.length,24);
});

test('tools and special blocks unlock progressively across stages in shop, drops, swap and rewards',()=>{
 // Stage 0 (第1关): 6 items (block-column, block-heavy, block-patch, repair, supply, swap)
 const g0=make();assert.equal(g0.stage,0);
 const unlocked0=g0.liteUnlockedTools();
 assert.deepEqual(Array.from(unlocked0.map(t=>t.id)).sort(),['block-column','block-heavy','block-patch','repair','supply','swap'].sort());
 const r0=complete(g0);
 assert.equal(r0.shopOffers.length,6);
 assert.equal(r0.shopOffers.filter(o=>o.kind==='tool').length,3);
 assert.equal(r0.shopOffers.filter(o=>o.kind==='special').length,3);
 assert.equal(r0.toolOptions.length,3);
 assert(r0.toolOptions.every(id=>unlocked0.some(t=>t.id===id)));

 // Stage 2 (第3关): +shovel, block-pack -> 8 items
 const g2=make();g2.stage=2;
 const unlocked2=g2.liteUnlockedTools();
 assert.equal(unlocked2.length,8);
 const r2=complete(g2);
 assert.equal(r2.shopOffers.length,8);
 assert.equal(r2.shopOffers.filter(o=>o.kind==='tool').length,4);
 assert.equal(r2.shopOffers.filter(o=>o.kind==='special').length,4);
 assert.equal(r2.toolOptions.length,3);
 assert(r2.toolOptions.every(id=>unlocked2.some(t=>t.id===id)));

 // Stage 3 (第4关): +block-glass -> 9 items
 const g3=make();g3.stage=3;
 const unlocked3=g3.liteUnlockedTools();
 assert.equal(unlocked3.length,9);
 const r3=complete(g3);
 assert.equal(r3.shopOffers.length,8);

 // Stage 4 (第5关): +block-diamond -> 10 items
 const g4=make();g4.stage=4;
 assert.equal(g4.liteUnlockedTools().length,10);

 // Stage 5 (第6关): +dye -> 11 items
 const g5=make();g5.stage=5;
 const unlocked5=g5.liteUnlockedTools();
 assert.equal(unlocked5.length,11);
 for(let i=0;i<10;i++){
  g5.lite.tools.swap=1;g5.phase='play';g5.active={type:'T',color:'T'};
  g5.liteUseTool('swap');
  assert.equal(g5.lite.tools['block-blast']||0,0);
 }

 // Stage 6+ (第7关及以后): all 12 items
 const g6=make();g6.stage=6;
 assert.equal(g6.liteUnlockedTools().length,12);
 const r6=complete(g6);
 assert.equal(r6.shopOffers.length,8);
});

test('unseen shop tools track unlocks, trigger badge, and persist once seen',()=>{
 // Stage 0: default 6 items are already seen, no unseen tools
 const g=make();
 assert.equal(g.stage,0);
 assert.deepEqual(Array.from(g.lite.seenShopTools).sort(),['block-column','block-heavy','block-patch','repair','supply','swap'].sort());
 assert.equal(g.liteUnseenShopTools().length,0);

 // Advance to Stage 1: still the same 6 items
 g.stage=1;
 assert.equal(g.liteUnseenShopTools().length,0);

 // Advance to Stage 2: shovel, block-pack are unlocked and unseen
 g.stage=2;
 const unseen2=g.liteUnseenShopTools();
 assert.equal(unseen2.length,2);
 assert.deepEqual(Array.from(unseen2.map(t=>t.id)).sort(),['block-pack','shovel'].sort());

 // Mark unseen as seen
 const marked2=g.liteMarkShopToolsSeen(unseen2.map(t=>t.id));
 assert.equal(marked2.length,2);
 assert.equal(g.liteUnseenShopTools().length,0);

 // Save and restore preserves seenShopTools
 const saved=JSON.parse(JSON.stringify(g));
 const restored=make();
 Object.assign(restored,saved);
 restored.liteEnsureExpansion();
 assert.equal(restored.liteUnseenShopTools().length,0);

 // Advance to Stage 3: block-glass unlocked and unseen
 restored.stage=3;
 const unseen3=restored.liteUnseenShopTools();
 assert.equal(unseen3.length,1);
 assert.deepEqual(Array.from(unseen3.map(t=>t.id)).sort(),['block-glass'].sort());
 restored.liteMarkShopToolsSeen();
 assert.equal(restored.liteUnseenShopTools().length,0);

 // Advance to Stage 4: block-diamond unlocked and unseen
 restored.stage=4;
 const unseen4=restored.liteUnseenShopTools();
 assert.equal(unseen4.length,1);
 assert.deepEqual(Array.from(unseen4.map(t=>t.id)).sort(),['block-diamond'].sort());
 restored.liteMarkShopToolsSeen();
 assert.equal(restored.liteUnseenShopTools().length,0);

 // Advance to Stage 5: dye unlocked and unseen
 restored.stage=5;
 const unseen5=restored.liteUnseenShopTools();
 assert.equal(unseen5.length,1);
 assert.deepEqual(Array.from(unseen5.map(t=>t.id)).sort(),['dye'].sort());
 restored.liteMarkShopToolsSeen();
 assert.equal(restored.liteUnseenShopTools().length,0);

 // Advance to Stage 6: block-blast unlocked and unseen
 restored.stage=6;
 const unseen6=restored.liteUnseenShopTools();
 assert.equal(unseen6.length,1);
 assert.deepEqual(Array.from(unseen6.map(t=>t.id)).sort(),['block-blast'].sort());
 restored.liteMarkShopToolsSeen();
 assert.equal(restored.liteUnseenShopTools().length,0);

 // Advance to Stage 7+: no more tools to unlock
 restored.stage=7;
 assert.equal(restored.liteUnseenShopTools().length,0);
});

test('shovel tool spreads outward ring up to 24 cells, respecting dominant color bias',()=>{
 const g=make();
 g.board=[{x:0,y:1,type:'T',id:g.id++},{x:1,y:1,type:'T',id:g.id++},{x:0,y:2,type:'T',id:g.id++}];
 g.liteGrantTool('shovel',1);
 assert.equal(g.liteUseTool('shovel'),true);
 const event=g.events.find(e=>e.kind==='lite-tool'&&e.tool==='shovel');
 assert(event);
 assert(event.amount <= 24);
 assert(event.spreadCells.length <= 24);
 assert(['cw','ccw'].includes(event.direction));
 assert.equal(g.liteDyeColor(),'T');
});

test('liteBlockFx creates glassMesh with procedural glass material and updates instances without dark backing',()=>{
  const code=fs.readFileSync(new URL('../lite-blocks.js',import.meta.url),'utf8');
  const addedMeshes=[];
  const mockScene={add:(m)=>addedMeshes.push(m)};
  class MockMatrix4 {
    makeRotationZ(a){this.a=a;return this;}
    scale(s){this.s={...s};return this;}
    setPosition(x,y,z){this.pos={x,y,z};return this;}
  }
  class MockVector3 {
    set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
  }
  class MockColor {
    setHex(hex){this.hex=hex;return this;}
  }
  class MockInstancedMesh {
    constructor(geo,mat,count){this.geo=geo;this.mat=mat;this.capacity=count;this.count=0;this.matrices=[];this.colors=[];this.instanceMatrix={};this.instanceColor={};}
    setMatrixAt(i,m){this.matrices[i]={...m};}
    setColorAt(i,c){this.colors[i]={...c};}
  }
  class MockShaderMaterial {
    constructor(cfg){this.cfg=cfg;}
  }
  class MockStandardMaterial {
    constructor(cfg){this.cfg=cfg;}
  }
  class MockBoxGeometry {}
  class MockTexture {}
  const mockTHREE = {
    Matrix4: MockMatrix4,
    Vector3: MockVector3,
    Color: MockColor,
    InstancedMesh: MockInstancedMesh,
    ShaderMaterial: MockShaderMaterial,
    MeshStandardMaterial: MockStandardMaterial,
    BoxGeometry: MockBoxGeometry,
    Texture: MockTexture,
    palette: { T: 0xac49ff, S: 0x8bf339 }
  };
  const c = vm.createContext({
    globalThis: {},
    ROTATION_LITE: ctx.ROTATION_LITE,
    Image: class { set src(v){} },
    console
  });
  c.globalThis = c;
  vm.runInContext(code, c);
  const fx = c.createLiteBlockEffects(mockScene, mockTHREE, 100, ()=>{});
  assert(addedMeshes.length > 0);
  const glassMesh = addedMeshes[addedMeshes.length - 1];
  assert(glassMesh.mat instanceof MockShaderMaterial);
  assert.equal(glassMesh.mat.cfg.transparent, true);
  assert.equal(glassMesh.mat.cfg.depthWrite, true);

  // Add a glass cell
  fx.begin();
  fx.add({ x: -1, y: 1, type: 'T', liteGlass: true }, -1, 1, 0, 1, 0);
  fx.finish();
  assert.equal(glassMesh.count, 1);
  assert.equal(glassMesh.colors[0].hex, 0xac49ff);
  assert.deepEqual(glassMesh.matrices[0].pos, { x: -1, y: 1, z: 0 });
});

test('liteBlockFx and special layers support coin blocks with polygonOffset and transparency', () => {
  const code = fs.readFileSync(new URL('../lite-blocks.js', import.meta.url), 'utf8');
  const addedMeshes = [];
  class MockBoxGeometry {}
  class MockTexture { constructor(img){ this.img = img; } }
  class MockStandardMaterial { constructor(cfg){ this.cfg = cfg; } }
  class MockShaderMaterial { constructor(cfg){ this.cfg = cfg; } }
  class MockInstancedMesh {
    constructor(geo, mat, cap){
      this.geo = geo; this.mat = mat; this.material = mat; this.cap = cap; this.count = 0;
      this.instanceMatrix = { needsUpdate: false };
      this.instanceColor = { needsUpdate: false };
      this.matrices = [];
      this.colors = [];
    }
    setMatrixAt(idx, mat){ this.matrices[idx] = mat; }
    setColorAt(idx, col){ this.colors[idx] = col; }
  }
  const mockScene = { add(m){ addedMeshes.push(m); } };
  const mockTHREE = {
    BoxGeometry: MockBoxGeometry,
    InstancedMesh: MockInstancedMesh,
    MeshStandardMaterial: MockStandardMaterial,
    ShaderMaterial: MockShaderMaterial,
    Texture: MockTexture,
    Matrix4: class {
      makeRotationZ(a){ this.rot = a; return this; }
      scale(s){ this.s = s; return this; }
      setPosition(x,y,z){ this.pos = {x,y,z}; return this; }
    },
    Vector3: class { set(x,y,z){ this.x=x;this.y=y;this.z=z; return this; } },
    Color: class { setHex(h){ this.hex=h; return this; } }
  };
  const c = vm.createContext({
    globalThis: {},
    ROTATION_LITE: ctx.ROTATION_LITE,
    Image: class { set src(v){ this.srcVal = v; } get src(){ return this.srcVal; } },
    console
  });
  c.globalThis = c;
  vm.runInContext(code, c);
  const fx = c.createLiteBlockEffects(mockScene, mockTHREE, 100, ()=>{});
  const specialMesh = addedMeshes.find(m => m.mat instanceof MockStandardMaterial);
  assert(specialMesh, 'StandardMaterial special mesh must exist');
  assert.equal(specialMesh.mat.cfg.polygonOffset, true);
  assert.equal(specialMesh.mat.cfg.transparent, true);

  fx.begin();
  fx.add({ x: 2, y: 1, type: 'L', liteEffect: 'patch', liteCoin: true }, 2, 1, 0, 1, 0);
  fx.finish();
  const snapshot = fx.snapshot();
  assert.equal(snapshot.patch.count, 1);
});


