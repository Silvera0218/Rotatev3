import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

export function loadEngine(configPath, sourcePath='index.html') {
  const html=fs.readFileSync(sourcePath,'utf8');
  const start=html.indexOf('/* ROTATION_CONFIG_BEGIN */');
  const end=html.indexOf('var ho=0',start);
  if(start<0||end<0)throw Error('Game engine markers missing');
  let source=html.slice(start,end);
  const config=JSON.parse(source.match(/var ROTATION_CONFIG = (.*);/)[1]);
  if(configPath)source=source.replace(/var ROTATION_CONFIG = .*;/,'var ROTATION_CONFIG = '+fs.readFileSync(configPath,'utf8').trim()+';');
  source+='\nRotationMechanics.installModel(e9,ft,nt.energyCap);C5=RotationMechanics.makeScorer(C5);globalThis.api={Game:e9,clone:L5,score:C5,buffDescription:w5,config:ROTATION_CONFIG,mechanics:RotationMechanics,shapes:et,buffs:Ze,cards:Lt,geometry:Nn,drawRewards:Q9};';
  const context=vm.createContext({console,structuredClone,performance});
  vm.runInContext(source,context,{timeout:10000});
  return {...context.api,source,sourceHash:crypto.createHash('sha256').update(html).digest('hex'),baseline:config};
}
export function settle(g){for(let i=0;i<100;i++){if(g.phase==='rotating')g.finishRotation();else if(g.phase==='clearing')g.finishClear();else if(g.phase==='settling')g.finishSettlement();else return;}throw Error('phase loop limit');}
