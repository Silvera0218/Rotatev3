import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {loadEngine,settle} from '../tools/load-engine.mjs';
const original=loadEngine(null,fileURLToPath(new URL('../index.html',import.meta.url)));
const context=vm.createContext({console,structuredClone,performance});
vm.runInContext(original.source,context);
vm.runInContext(fs.readFileSync(new URL('../lite-rules.js',import.meta.url),'utf8'),context);
vm.runInContext('installRotationLite(api)',context);
const ctx=context;
const scripted=(g,values)=>{let index=0;g.liteRandom=()=>values[index++]??.99;};
const make=()=>new context.api.Game(42);

test('inventory uses three kinds, stacks duplicates and promotes reserves in acquisition order',()=>{
  const g=make();g.liteGrantTool('supply');g.liteGrantTool('block-heavy');g.liteGrantTool('repair');g.liteGrantTool('block-heavy');
  assert.deepEqual(Array.from(g.liteInventory().active),['shovel','swap','supply']);
  assert.deepEqual(Array.from(g.liteInventory().reserve),['block-heavy','repair']);assert.equal(g.lite.tools['block-heavy'],2);
  assert.equal(g.liteUseTool('block-heavy'),false);assert.equal(g.liteUseTool('supply'),true);
  assert.deepEqual(Array.from(g.liteInventory().active),['shovel','swap','block-heavy']);
  assert.equal(g.liteUseTool('block-heavy'),true);assert.equal(g.lite.tools['block-heavy'],1);
  assert.deepEqual(Array.from(g.liteInventory().reserve),['repair']);
});
test('inventory reorder, saved order and reacquisition keep one position per kind',()=>{
  const g=make();for(const id of ['supply','repair','block-trim'])g.liteGrantTool(id);
  assert.equal(g.liteMoveTool('block-trim',2),true);
  assert.deepEqual(Array.from(g.liteInventory().active),['shovel','swap','block-trim']);
  const h=make();h.lite=JSON.parse(JSON.stringify(g.lite));h.liteEnsureExpansion();
  assert.deepEqual(Array.from(h.liteInventory().order),Array.from(g.liteInventory().order));
  h.liteMoveTool('swap',4);assert.deepEqual(Array.from(h.liteInventory().active),['shovel','block-trim','supply']);
  h.liteUseTool('supply');h.liteGrantTool('supply');assert.equal(h.liteInventory().order.at(-1),'supply');
  assert.equal(h.liteMoveTool('repair',-1),false);assert.equal(h.liteMoveTool('unknown',0),false);
});
test('shop and free reward put excess kinds in reserve and preserve them across stages',()=>{
  const g=make();g.liteGrantTool('supply');const r=complete(g);g.lite.coins=100;
  r.shopOffers=[{slot:0,kind:'special',item:'trim'}];assert.equal(g.liteBuyOffer(0),true);
  r.toolOptions=['repair'];assert.equal(g.liteChooseTool('repair'),true);
  assert.deepEqual(Array.from(g.liteInventory().reserve),['block-trim','repair']);
  assert.equal(g.liteNext(),true);assert.deepEqual(Array.from(g.liteInventory().reserve),['block-trim','repair']);
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
    const g = colourFixture(shape, [[6,6,'L'],[2,2,'J']]);
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
    const g = colourFixture(shape);
    const outline = new Set(g.target.cells.map(c=>`${c.x},${c.y}`));
    const outside = g.board.filter(c=>!outline.has(`${c.x},${c.y}`)).map(c=>c.id);
    assert.equal(g.checkClear(),true);
    assert.deepEqual(g.board.map(c=>c.id),outside);
    assert.equal(g.events.at(-1).linkedCount,0);
  }
});


test('original four-cell straight matches remain valid and connected groups wait for a filled outline', () => {
  const line = colourFixture([[1,1],[2,1],[3,1],[4,1]]);
  assert.equal(line.checkClear(),true);
  assert.equal(line.board.length,0);
  const bent = colourFixture([[1,1],[2,1],[2,0],[3,0],[3,-1]]);
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
  for(const score of [44,45,46]){
    const g=make();g.lite.clears=100;g.checkpointScore=score;
    assert.equal(g.completeCheckpoint(),score>=45);
    if(score>=45){assert.equal(g.active,null);assert.equal(g.events.at(-1).goal,45);}
  }
  const g=make();g.score=99999;g.checkpointScore=0;
  assert.equal(g.completeCheckpoint(),false);
  const area=g.target.cells.length;finishObjective(g);
  assert.ok(g.checkpointScore>=g.goal);assert.equal(g.target.cells.length,area);
  assert.ok(g.events.some(e=>e.kind==='clear'));assert.equal(g.active,null);
});


test('four actual drops form a twelve-cell colour group and pass using the new score', () => {
  const g = make();
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
  const initial = g.lite.tools.shovel;
  g.rotatePiece();
  assert.equal(g.lite.tools.shovel, initial);
  g.board = [{ x: 1, y: 0, id: g.id++, type: 'L' }];
  g.beginRotation({ lever: 1, dir: -1 });
  g.finishRotation();
  assert.equal(g.lite.tools.shovel, initial + 1);
  g.finishRotation();
  assert.equal(g.lite.tools.shovel, initial + 1);
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


test('spread fills the two outermost vacant rings with random colours',()=>{
 const g=make();g.lite.tools.shovel=1;g.board=[{x:0,y:0,id:g.id++,type:'L'}];
 const before=g.board.length;assert.equal(g.liteUseTool('shovel'),true);
 const added=g.events.at(-1).spreadCells;assert(added.length>8);assert.equal(g.board.length,before+added.length);
 assert(added.every(cell=>['I','J','L','O','S','T','Z'].includes(cell.type)));
 const maxRadius=Math.max(...g.board.map(cell=>Math.max(Math.abs(cell.x),Math.abs(cell.y))));
 assert(maxRadius<=3);assert(g.events.some(event=>event.kind==='compact'));
 assert.equal(g.lite.tools.shovel,0);assert.equal(g.liteUseTool('shovel'),false);
});

test('swap grants a random special block and sends it to reserve when the three slots are full',()=>{
 const g=make();g.liteGrantTool('supply');g.lite.tools.swap=2;
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
 const g=make();g.lite.tools.supply=2;g.lite.coins=7;g.dropsUsed=g.dropLimit;assert.equal(g.checkDropLimit(),true);
 const remaining=g.dropsRemaining,used=g.dropsUsed;assert.equal(g.canRevive,false);assert.equal(g.liteStartReviveAd(100),true);assert.equal(g.liteStartReviveAd(100),false);
 assert.equal(g.liteFinishReviveAd(2099),false);assert.equal(g.liteFinishReviveAd(2100),true);assert.equal(g.dropsRemaining,remaining+10);assert.equal(g.dropsUsed,used);assert.equal(g.phase,'clearing');assert.equal(g.cleared.length,g.target.cells.length);assert.equal(g.events.find(e=>e.kind==='revive').cells.length,g.target.cells.length);
 assert.equal(g.lite.tools.supply,2);assert.equal(g.lite.coins,7);assert.equal(g.lives,3);assert.equal(g.liteFinishReviveAd(2200),false);settle(g);assert.equal(g.phase,'play');assert(g.active);assert.equal(g.dropsRemaining,10);
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
 const g=make(),r=complete(g),before=[...r.toolOptions];assert.equal(g.liteStartRewardAd(0),false);assert.equal(g.liteRefreshReward(),true);assert(r.toolOptions.some(id=>!before.includes(id)));assert.equal(g.liteRefreshReward(),false);
 for(let i=0;i<3;i++){
  assert.equal(g.liteStartRewardAd(i*3000),true);assert.equal(g.liteChooseTool(r.toolOptions[0]),false);assert.equal(g.liteFinishRewardAd(i*3000+1999),false);
  const h=make();h.phase=g.phase;h.lite=JSON.parse(JSON.stringify(g.lite));assert.equal(h.liteFinishRewardAd(i*3000+2000),true);assert.equal(h.lite.roll.adRefreshes,2-i);
  assert.equal(g.liteFinishRewardAd(i*3000+2000),true);assert.equal(g.liteFinishRewardAd(i*3000+2000),false);assert(r.toolOptions.some(id=>id.startsWith('block-')));assert(r.toolOptions.some(id=>!id.startsWith('block-')));
 }
 assert.equal(g.liteStartRewardAd(20000),false);assert.equal(g.liteChooseTool(r.toolOptions[0]),true);assert.equal(g.liteRefreshReward(),false);
});
test('shop repeats purchases with independent Fibonacci prices, keeps choices and persists prices across stages',()=>{
 const g=make(),r=complete(g);assert.equal(r.shopOffers.length,8);assert.equal(r.shopOffers.filter(o=>o.kind==='tool').length,4);assert.equal(r.shopOffers.filter(o=>o.kind==='special').length,4);assert.equal(new Set(r.shopOffers.map(o=>o.kind+o.item)).size,8);
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
 const offer=r.shopOffers[0],price=g.liteOfferPrice(offer);const h=make();h.phase=g.phase;h.lite=JSON.parse(JSON.stringify(g.lite));h.litePrepareReward();assert.equal(h.liteOfferPrice(offer),price);
 assert.equal(h.liteChooseTool(r.toolOptions[0]),true);assert.equal(h.liteBuyOffer(offer.slot),false);assert.equal(h.liteNext(),true);complete(h);
 // Returning stock is priced by item identity, independent of its new slot.
 assert.equal(h.liteOfferPrice({...offer,slot:777}),price);h.reset();assert.equal(h.liteOfferPrice(offer),5);
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
test('stage budgets, inventory and skipping continue every stage and finish the run',()=>{
 const g=make();g.lite.tools['block-pack']=4;g.lite.tools.repair=3;
 for(const budget of [24,24,24,36,42]){
  assert.equal(g.dropLimit,budget);complete(g);assert.equal(g.liteSkipReward(),true);assert.equal(g.lite.tools['block-pack'],4);assert.equal(g.lite.tools.repair,3);
 }
 assert.equal(g.phase,'won');assert.equal(g.liteSkipReward(),false);g.reset();assert.equal(g.lite.tools['block-pack'],0);assert.equal(g.lite.tools.repair,0);
});
test('endless retains native varied contours, increasing budgets and continues beyond stage five',()=>{
 const g=make(),baseline=new original.Game(42);g.endless=baseline.endless=true;baseline.outlineSeed=g.outlineSeed;const shapes=new Set();
 for(let stage=0;stage<12;stage++){
  g.stage=baseline.stage=stage;g.outline=baseline.outline=null;assert.equal(JSON.stringify(g.target.cells),JSON.stringify(baseline.target.cells));shapes.add(JSON.stringify(g.target.cells));assert.equal(g.dropLimit,Math.max(stage<3?24:36+(stage-3)*6,baseline.dropLimit));
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
 const g=make();g.stage=3;g.checkpointScore=100;g.levelScore=100;g.score=500;
 g.board=[{x:4,y:0,id:g.id++,type:'L',liteHeavyBonus:12,liteCoin:true},{x:-1,y:0,id:g.id++,type:'L'},{x:1,y:0,id:g.id++,type:'T'}];
 const event=land(g,'blast');assert.equal(event.removed.length,3);assert(event.removed.every(c=>c.type==='L'));
 assert.equal(event.scoring.points,24);assert.equal(event.scoring.blastBonus,9);assert.equal(event.scoring.coinReward,3);
 assert.equal(g.lite.coins,3);assert.equal(g.score,524);assert.equal(g.checkpointScore,124);assert.equal(g.totalCleared,3);assert(g.board.every(c=>c.type==='T'));
 assert.equal(g.resolvePendingSpecial(),null);assert.equal(g.score,524);assert.equal(g.lite.coins,3);
});
test('blast compounds from one snapshot and rounds only once including exact halves',()=>{
 // SymPy: floor(S*((103/100)**N-1)+1/2), independently verified.
 for(const [score,count,expected] of [[100,3,9],[45,3,4],[1000,10,344],[50,1,2],[5000,2,305],[0,10,0]])assert.equal(ctx.liteBlastBonus(score,count),expected);
 const g=make();g.checkpointScore=1000;g.levelScore=1000;g.score=1000;g.board=Array.from({length:9},(_,i)=>({x:i+1,y:0,id:g.id++,type:'L'}));
 const expected=make().awardCells([...g.board,{x:0,y:1,type:'L',id:99}],'tool').points;
 const event=land(g,'blast');assert.equal(event.scoring.points,expected+344);assert.equal(g.checkpointScore,1000+expected+344);
});
test('trim clears every outside cell while preserving inner cells and their coordinates',()=>{
 const g=make();g.board=[{x:1,y:0,id:g.id++,type:'T'},{x:6,y:6,id:g.id++,type:'S'},{x:-5,y:0,id:g.id++,type:'J'}];
 const event=land(g,'trim');assert.equal(event.removed.length,2);
 assert.deepEqual(Array.from(g.board,c=>[c.x,c.y]),[[1,0],[0,1]]);assert(g.board.every(c=>!c.liteEffect||(id==='patch'&&c.liteCoin)));
 assert(event.scoring.points>0);assert.equal(g.phase,'play');
});
test('coin block stays where it lands and pays each coin cell for the whole clear batch once',()=>{
 const g=make();g.board=[{x:1,y:0,id:g.id++,type:'T'},{x:2,y:0,id:g.id++,type:'S'}];
 const marked=piece(g,[[3,1],[4,1]],'patch');g.resolvePendingSpecial();
 assert.deepEqual(Array.from(marked,c=>[c.x,c.y]),[[3,1],[4,1]]);assert(marked.every(c=>c.liteCoin&&c.liteEffect==='patch'));assert.equal(g.lite.coins,0);
 const score=g.awardCells(g.board,'outline');assert.equal(score.coinReward,8);assert.equal(g.lite.coins,8);
 g.awardCells(g.board,'outline');assert.equal(g.lite.coins,8);
});
test('coin reward covers trim and excludes shovel or pack consumption',()=>{
 const g=make();g.board=[{x:5,y:0,type:'L',id:g.id++,liteCoin:true},{x:6,y:0,type:'T',id:g.id++}];
 const event=land(g,'trim');assert.equal(event.scoring.coinReward,2);assert.equal(g.lite.coins,2);
 const h=make();piece(h,[[3,1]],'patch');h.resolvePendingSpecial();assert.equal(h.liteUseTool('shovel'),true);assert.equal(h.lite.coins,0);
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
 const trim=make();trim.board=[{x:5,y:0,id:trim.id++,type:'L',liteHeavyBonus:12},{x:6,y:0,id:trim.id++,type:'T'}];assert.equal(land(trim,'trim').scoring.points,14);
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
 const g=make();g.active.liteEffect='heavy';g.active.x=2;g.drop(true);
 assert.equal(g.lives,3);assert.equal(g.dropsUsed,1);assert.equal(g.phase,'rotating');
 assert.equal(g.events.filter(e=>e.heavyDrop).length,2);assert.equal(g.events.filter(e=>e.kind==='turn').length,1);
});
test('heavy and coin metadata follow rotations, repacks, dye and save reload; old extra turns are discarded',()=>{
 const g=make();g.board=[{x:1,y:0,id:g.id++,type:'L',liteHeavyBonus:12,liteCoin:true,liteEffect:'patch'},{x:-1,y:0,id:g.id++,type:'T'}];const id=g.board[0].id;
 g.beginRotation({dir:1,lever:-1});g.finishRotation();g.settleRemaining(true);const moved=g.board.find(c=>c.id===id);assert.equal(moved.liteHeavyBonus,12);assert.equal(moved.liteCoin,true);
 piece(g,[[moved.x,5]],'column','T');g.resolvePendingSpecial();assert.equal(g.board.find(c=>c.id===id).type,'T');assert.equal(g.board.find(c=>c.id===id).liteHeavyBonus,12);
 const h=make();h.board=JSON.parse(JSON.stringify(g.board));h.lite=JSON.parse(JSON.stringify(g.lite));h.lite.heavyTurns={remaining:2,dir:1};h.liteEnsureExpansion();assert.equal(h.lite.heavyTurns,undefined);assert.equal(h.board.find(c=>c.id===id).liteHeavyBonus,12);assert.equal(h.board.find(c=>c.id===id).liteCoin,true);
});
test('supply grants rounded ten percent of current total limit, including previous grants',()=>{
 // SymPy half-up: 24/10 ->2;26/10 ->3;36/10 ->4;25/10 ->3.
 const g=make();g.liteGrantTool('supply',2);g.dropsUsed=20;assert.equal(g.liteUseTool('supply'),true);assert.equal(g.dropLimit,26);assert.equal(g.events.at(-1).amount,2);assert.equal(g.liteUseTool('supply'),true);assert.equal(g.dropLimit,29);assert.equal(g.events.at(-1).amount,3);
 const h=make();h.stage=3;h.liteGrantTool('supply');assert.equal(h.dropLimit,36);h.liteUseTool('supply');assert.equal(h.dropLimit,40);assert.equal(h.events.at(-1).amount,4);
 const half=make();half.lite.extraDrops=1;half.liteGrantTool('supply');half.liteUseTool('supply');assert.equal(half.dropLimit,28);
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
