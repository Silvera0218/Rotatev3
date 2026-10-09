// Replace the entire cell mesh/material; inventory art previews the same material.
globalThis.createLiteBlockEffects=function(scene,THREE,capacity,dirty){
  const layers=new Map(),matrix=new THREE.Matrix4(),scale=new THREE.Vector3();
  for(const block of ROTATION_LITE.specials){
    const img=new Image(),texture=new THREE.Texture(img);
    texture.magFilter=texture.minFilter=1003;texture.generateMipmaps=false;texture.colorSpace='srgb';
    const glass=block.id==='column'||block.id==='diamond',metal=block.id==='heavy';
    const material=new THREE.MeshStandardMaterial({map:texture,roughness:glass?.18:metal?.4:.9,metalness:metal?.28:0,transparent:glass,opacity:glass?.88:1,alphaTest:.1});
    const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(.96,.96,.36),material,capacity);mesh.count=0;mesh.frustumCulled=false;scene.add(mesh);
    const layer={mesh,count:0};layers.set(block.id,layer);
    img.onload=()=>{texture.needsUpdate=true;dirty();};img.src=`./assets/icons/block-${block.id}.svg`;
  }
  return{
    begin(){for(const layer of layers.values())layer.count=0;},
    add(cell,x,y,z,size,angle){const layer=layers.get(cell.liteEffect);if(!layer||layer.count>=capacity)return;matrix.makeRotationZ(angle);matrix.scale(scale.set(size,size,size));matrix.setPosition(x,y,z);layer.mesh.setMatrixAt(layer.count++,matrix);},
    finish(){for(const {mesh,count} of layers.values()){mesh.count=count;mesh.instanceMatrix.needsUpdate=true;}},
    snapshot(){return Object.fromEntries([...layers].map(([id,{mesh,count}])=>[id,{count,loaded:!!mesh.material.map.image.naturalWidth}]));}
  };
};
