"""Build the lightweight derivative from the unchanged original game."""
from pathlib import Path
import hashlib
import json
import re
root = Path(__file__).resolve().parent
source = (root / 'source/base.html').read_text(encoding='utf-8')
level_data_script = (root / 'lite-levels.js').read_text(encoding='utf-8')
rules_script = (root / 'lite-rules.js').read_text(encoding='utf-8')
def replace_once(old, new):
    global source
    if source.count(old) != 1:
        raise RuntimeError(f'Expected one integration marker: {old[:90]} ({source.count(old)})')
    source = source.replace(old, new, 1)
replace_once('<html lang="zh-CN"', '<html data-lite="true" data-v3="true" lang="zh-CN"')
replace_once('<title>ROTATION</title>', '<title>ROTATION V3</title>')
replace_once('let t=[I("start"),I("sound"),I("help"),I("collection-open")]', 'let t=[I("start"),I("sound"),I("pause-settings"),I("help"),I("pause-codex"),I("return-home")]')
replace_once('</head>', '<link rel="stylesheet" href="./lite-ui.css"><link rel="stylesheet" href="./lite-integration.css"><link rel="stylesheet" href="./lite-v3.css"><link rel="stylesheet" href="./lite-codex.css"><link rel="stylesheet" href="./lite-backpack.css"><link rel="preload" as="image" href="./assets/ui/stage-clear-c-v1.png"></head>')
# Keep the authored level data and the rules that consume it inside the main
# document.  The editor may be opened from file:// and browsers are allowed to
# keep external scripts cached aggressively; inlining these two small runtime
# files makes the generated index self-contained and guarantees that the game
# opens with the exact data that was present at build time.  The editor updates
# the data between the explicit marker tags as a fallback when Python is not
# available.
replace_once('<script>(()=>{', '<script id="lite-level-data">' + level_data_script + '</script><script id="lite-rules">' + rules_script + '</script><script src="./lite-transition.js"></script><script src="./lite-blocks.js"></script><script src="./lite-acquisition.js"></script><script src="./lite-popup-motion.js"></script><script src="./lite-codex.js"></script><script src="./lite-backpack.js"></script><script src="./lite-tool-fx.js"></script><script>(()=>{')
replace_once('C5=RotationMechanics.makeScorer(C5);', 'C5=RotationMechanics.makeScorer(C5);globalThis.installRotationLite({Game:e9,mechanics:RotationMechanics});')
replace_once('return {\n        ...previous,\n        ...local,', 'const result = {\n        ...previous,\n        ...local,')
replace_once('scoringVersion: 2\n      };\n    };\n  }', 'scoringVersion: 2\n      };\n      return globalThis.liteScoreConnectedColors ? globalThis.liteScoreConnectedColors(cells,result,context.liteGame) : result;\n    };\n  }')
replace_once('function oo(n,e){let t=new Set(e.map(s=>le(s.x,s.y))),i=new Set(t);for(let s of Z3(n))if(s.cells.some(r=>t.has(le(r.x,r.y))))for(let r of s.cells)i.add(le(r.x,r.y));return n.filter(s=>i.has(le(s.x,s.y)))}', 'function oo(n,e,game){let t=new Set(e.map(s=>le(s.x,s.y))),i=new Set(t);for(let s of Z3(n))if(s.cells.some(r=>t.has(le(r.x,r.y))))for(let r of s.cells)i.add(le(r.x,r.y));return globalThis.liteExpandConnectedClear(n,e,n.filter(s=>i.has(le(s.x,s.y))),game)}')
replace_once('...Mn(this),rotor:RotationMechanics.rotorState(this)', '...Mn(this),liteGame:this,rotor:RotationMechanics.rotorState(this)')
replace_once('let e=this.target.cells;this.cleared=oo(this.board,e);', 'this.litePrepareClear();let e=this.target.cells;this.cleared=oo(this.board,e,this);')
replace_once('this.board.push(...t.map(h=>({...h,id:this.id++}))),this.pendingSpecial=', 'this.board.push(...t.map(h=>({...h,id:this.id++}))),this.liteAfterAttach(this.board.slice(-t.length)),this.pendingSpecial=')
replace_once('this.clearStreak=0,this.lives--,this.events.push({kind:"miss",cells:t})', 'this.clearStreak=0,(this.litePreventMiss()||this.lives--),this.events.push({kind:"miss",cells:t})')
replace_once('!this.checkClear()&&!this.beginRotation(l)&&this.checkDeadlock()', '!this.checkClear()&&!this.completeCheckpoint()&&!this.beginRotation(l)&&this.checkDeadlock()')
replace_once('ids:this.board.slice(-t.length).map(cell=>cell.id)', 'ids:[...this.lite.lastPlacementIds]')
replace_once('let h=c.compact&&this.settleRemaining(c.repack===!0);', 'let h=c.moved||c.compact&&this.settleRemaining(c.repack===!0);')
replace_once('S1(ae.find(t=>t.id===e.effect).name+', 'S1((e.liteEffect?liteSpecial(e.liteEffect).name:ae.find(t=>t.id===e.effect).name)+')
# Charge only attached placements. Misses keep their existing life penalty,
# and the next spawn must see the unchanged budget even on the last drop.
replace_once('this.dropsUsed+=this.active.origin==="inserted"?nt.specialDropCost:nt.ordinaryDropCost,this.rotationCredited=!1', 'const liteDropCost=this.active.origin==="inserted"?nt.specialDropCost:nt.ordinaryDropCost;this.rotationCredited=!1')
replace_once('if(this.build.placement.attached=r,r){let a=[];', 'if(this.build.placement.attached=r,r){this.dropsUsed+=liteDropCost;let a=[];')
replace_once(' function medallion(id){', ''' Object.assign(buffArt,{'extra-moves':buffArt.patience,'shovel-supply':buffArt.frontier_edge,'clear-score':buffArt.spare_change,'bonus-score':buffArt.opening_act});
 Object.assign(buffArt,'''+json.dumps({p.stem[5:]:p.read_text(encoding='utf-8') for p in sorted((root/'assets/icons').glob('buff-*.svg'))},ensure_ascii=False)+''');
 function medallion(id){''')
replace_once("if(root.matches('.upgrade-button'))decorateChoice(root);root.querySelectorAll('.upgrade-button').forEach(decorateChoice);", "if(root.matches('.upgrade-button,.lite-rest-buff-icon'))decorateChoice(root);root.querySelectorAll('.upgrade-button,.lite-rest-buff-icon').forEach(decorateChoice);")
# Register lightweight destinations with the same pixel assembly effect as native dialogs.
replace_once('const key=shown?[overlay.dataset.plan,overlay.dataset.pause,overlay.dataset.reading,', 'const key=shown?[overlay.dataset.litePage,overlay.dataset.plan,overlay.dataset.pause,overlay.dataset.reading,')
replace_once("attributeFilter:['hidden','data-home','data-plan','data-pause','data-reading','data-gift','data-buff-detail']", "attributeFilter:['hidden','data-home','data-plan','data-pause','data-reading','data-gift','data-buff-detail','data-lite-page']")
# A full-screen pixel wipe owns reward-to-reward motion; keep native motion elsewhere.
replace_once('if(value)burst(target);else target.dataset.arcEntry=\'pending\';', 'if(value&&target===panel&&overlay.dataset.liteReward===\'true\'){delete target.dataset.arcEntry;}else if(value)burst(target);else target.dataset.arcEntry=\'pending\';')
replace_once('  f5();V3();requestAnimationFrame(F6);', '\n/* LITE_UI_BEGIN: existing engine and scene integration */\n' + (root/'lite-integration.js').read_text(encoding='utf-8') + '\n/* LITE_UI_END */\n  f5();V3();requestAnimationFrame(F6);')
replace_once('za.sync(),La(),$f(),N6.render()', 'za.sync(),liteFrameSafe(),La(),$f(),N6.render()')
replace_once('yt>=.85&&(yt=0,L.step(!0)', 'liteNaturalFall&&yt>=.85&&(yt=0,L.step(!0)')
# Keep the scored cells with their feedback, including queued chain clears.
replace_once('Of(n.scoring),se.play("clear")', 'Of(n.scoring,n.cells),se.play("clear")')
# Mark special cells using the existing rendered material effects, without enabling
# the original gameplay effects. The underlying blocks keep liteEffect metadata.
replace_once('var ln=new Y7(lt,K3+4)', 'var liteBlockFx=createLiteBlockEffects(lt,{BoxGeometry:Dt,InstancedMesh:ut,MeshStandardMaterial:Zt,ShaderMaterial:we,Color:L0,Texture:ct,Matrix4:oe,Vector3:U,palette:i9},K3+4,()=>{fe.dirty=true});var ln=new Y7(lt,K3+4)')
replace_once('ln.begin();starCellFx.begin(L.build);', 'ln.begin();starCellFx.begin(L.build);liteBlockFx.begin();')
replace_once('starCellFx.add(g,w,b,y,A,M),ln.add(g,w,b,y,A,M)', 'liteBlockFx.add(g,w,b,y,A,M),starCellFx.add(g,w,b,y,A,M),ln.add(g,w,b,y,A,M)')
replace_once('ln.finish(),starCellFx.finish(),', 'ln.finish(),starCellFx.finish(),liteBlockFx.finish(),')
replace_once('<script id="rotation-pwa" src="./rotation-pwa-register.js" defer></script>', '<script>if("serviceWorker" in navigator){navigator.serviceWorker.getRegistrations().then(r=>r.forEach(s=>s.unregister())).catch(()=>{});if("caches" in window){caches.keys().then(k=>k.forEach(c=>caches.delete(c))).catch(()=>{});}}</script>')
# Copy uses its own run/settings keys. It never reads or deletes the original run.
source=source.replace('bearingRotorInsertionUISuspendedRunV1','rotationLiteSuspendedRunV1').replace('bearingRotorInsertionEndlessUnlockedV1','rotationLiteUnusedEndlessV1')
source=source.replace('rotation.webmanifest','lite.webmanifest')
# Keep the native plan/reward copy tied to the same authored values used by
# lite-rules.js.  These expressions are evaluated after lite-levels.js and
# lite-rules.js have loaded, so editing the external data immediately changes
# both the simulator and the in-game copy.
source=source.replace('Ne(a1[0].goals[0])', 'Ne(globalThis.ROTATION_LITE?.scoreGoals?.[0] ?? a1[0].goals[0])')
source=source.replace('t9(0,0)', '(globalThis.ROTATION_LITE?.dropLimits?.[0] ?? t9(0,0))')
source=source.replace('Ne(V1(s,L.endless,L.outlineSeed).goals[r])', 'Ne((globalThis.ROTATION_LITE&&!L.endless?globalThis.ROTATION_LITE.scoreGoals[s]:V1(s,L.endless,L.outlineSeed).goals[r]))')
source=source.replace('t9(s,r,s===L.stage?L.target.cells.length:V1(s,L.endless,L.outlineSeed).cells.length)', '(globalThis.ROTATION_LITE&&!L.endless?globalThis.ROTATION_LITE.dropLimits[s]:t9(s,r,s===L.stage?L.target.cells.length:V1(s,L.endless,L.outlineSeed).cells.length))')
source=source.replace('n.goals.map(Ne)', '(globalThis.ROTATION_LITE&&!L.endless?globalThis.ROTATION_LITE.scoreGoals.slice(L.stage+1,L.stage+2):n.goals).map(Ne)')
source=source.replace('t9(L.stage+1,0,n.cells.length)', '(globalThis.ROTATION_LITE&&!L.endless?globalThis.ROTATION_LITE.dropLimits[L.stage+1]:t9(L.stage+1,0,n.cells.length))')
source=source.replace('L.stage===a1.length-1', 'L.stage===(globalThis.ROTATION_LITE&&!L.endless?globalThis.ROTATION_LITE.levels:a1.length)-1')
# The native dashed outline cache originally keyed only by stage and cell
# count.  Two different editor shapes can have the same number of cells, so
# include the coordinate set and force the visible outline to be rebuilt when
# an authored contour changes in place.
source=source.replace('H3=L.stage+":"+L.target.cells.length', 'H3=L.stage+":"+L.target.cells.map(i=>le(i.x,i.y)).sort().join(";")')
source=source.replace('H3!==L.stage+":"+L.target.cells.length&&Nf()', 'H3!==L.stage+":"+L.target.cells.map(i=>le(i.x,i.y)).sort().join(";")&&Nf()')
# The HTML embeds integration code, while its rules/renderers are separate files.
# Change each dependency URL when its bytes change so an older cached script
# cannot be paired with a newly generated integration bundle.
def version_dependency(match):
    name = match.group(2)
    version = hashlib.sha256((root / name).read_bytes()).hexdigest()[:12]
    return f'{match.group(1)}{name}?v={version}{match.group(3)}'

source = re.sub(r'((?:src|href)="\./)(lite-[^"?]+\.(?:js|css))(")', version_dependency, source)
# New V3 dialogs share the original close artwork and all interaction states.
source=source.replace('.arcade-ui .route-dialog button.popup-close', '.arcade-ui :is(.route-dialog button.popup-close,button.v3-popup-close)')
source=source.replace('rotationLite','rotationV3')
(root/'index.html').write_text(source,encoding='utf-8')
print('Built index.html with isolated saves, tools and special blocks.')
