// Replace the entire cell mesh/material; inventory art previews the same material.
globalThis.createLiteBlockEffects=function(scene,THREE,capacity,dirty){
  const layers=new Map(),matrix=new THREE.Matrix4(),scale=new THREE.Vector3();
  const defaultPalette={I:0x38e4ff,O:0xffd436,T:0xac49ff,L:0xff8c32,J:0x416dff,S:0x8bf339,Z:0xff477f};
  const palette=THREE.palette||defaultPalette;
  const colorHelper=THREE.Color?new THREE.Color():null;

  for(const block of ROTATION_LITE.specials){
    const img=new Image(),texture=new THREE.Texture(img);
    texture.magFilter=texture.minFilter=1003;texture.generateMipmaps=false;texture.colorSpace='srgb';
    const glass=block.id==='column'||block.id==='glass',metal=block.id==='heavy'||block.id==='diamond'||block.id==='patch';
    const material=new THREE.MeshStandardMaterial({map:texture,roughness:glass?.14:metal?.4:.9,metalness:glass?.1:metal?.28:0,transparent:true,opacity:glass?.85:1,alphaTest:.08,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(.96,.96,.36),material,capacity);mesh.count=0;mesh.frustumCulled=false;scene.add(mesh);
    const layer={mesh,count:0};layers.set(block.id,layer);
    img.onload=()=>{texture.needsUpdate=true;dirty();};img.src=`./assets/icons/block-${block.id}.svg`;
  }

  // Programmatic translucent glass material: no dark backing, translucent body with crystal bevels & reflections
  let glassMaterial;
  if(THREE.ShaderMaterial){
    glassMaterial=new THREE.ShaderMaterial({
      transparent:true,
      depthWrite:true,
      depthTest:true,
      vertexShader:`
        varying vec2 vUv;
        varying vec3 vTint;
        varying vec3 vNormal;
        void main(){
          vUv=uv;
          vTint=instanceColor;
          vNormal=normalize(mat3(modelViewMatrix*instanceMatrix)*normal);
          gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);
        }
      `,
      fragmentShader:`
        varying vec2 vUv;
        varying vec3 vTint;
        varying vec3 vNormal;
        void main(){
          vec2 fUv=abs(vUv-0.5)*2.0;
          float maxD=max(fUv.x,fUv.y);
          float bevel=smoothstep(0.70,0.92,maxD);
          float rim=smoothstep(0.92,0.98,maxD);

          float streak1=smoothstep(0.045,0.0,abs((vUv.x+vUv.y)-1.05));
          float streak2=smoothstep(0.025,0.0,abs((vUv.x+vUv.y)-0.72));
          float shine=streak1*0.45+streak2*0.25;

          vec3 N=normalize(vNormal);
          vec3 L=normalize(vec3(-0.35,0.65,0.85));
          vec3 V=vec3(0.0,0.0,1.0);
          vec3 H=normalize(L+V);
          float spec=pow(max(dot(N,H),0.0),28.0)*0.55;
          float fresnel=pow(1.0-abs(N.z),1.8);

          vec3 glassBody=vTint*(0.80+0.35*max(dot(N,L),0.0));
          vec3 highlight=vec3(0.95,0.98,1.0);
          vec3 finalColor=mix(glassBody,highlight,bevel*0.35+rim*0.55+fresnel*0.40);
          finalColor+=highlight*(spec+shine*0.55);

          float alpha=0.52+bevel*0.25+rim*0.15+fresnel*0.20+spec*0.22+shine*0.15;
          alpha=clamp(alpha,0.0,0.94);

          gl_FragColor=vec4(finalColor,alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });
  }else{
    glassMaterial=new THREE.MeshStandardMaterial({roughness:0.1,metalness:0.15,transparent:true,opacity:0.65,depthWrite:true});
  }

  const glassMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(.86,.86,.36),glassMaterial,capacity);
  glassMesh.count=0;glassMesh.frustumCulled=false;
  if(colorHelper){
    for(let i=0;i<capacity;i++)glassMesh.setColorAt(i,colorHelper.setHex(0x38e4ff));
    if(glassMesh.instanceColor)glassMesh.instanceColor.needsUpdate=true;
  }
  scene.add(glassMesh);
  const glassLayer={mesh:glassMesh,count:0};

  return{
    begin(){for(const layer of layers.values())layer.count=0;glassLayer.count=0;},
    add(cell,x,y,z,size,angle){
      const isGlass=!!(cell.liteGlass||cell.liteEffect==='glass');
      if(isGlass&&glassLayer.count<capacity){
        matrix.makeRotationZ(angle);
        matrix.scale(scale.set(size,size,size));
        matrix.setPosition(x,y,z);
        glassMesh.setMatrixAt(glassLayer.count,matrix);
        if(colorHelper){
          const hex=palette[cell.type]||defaultPalette[cell.type]||0x38e4ff;
          colorHelper.setHex(hex);
          glassMesh.setColorAt(glassLayer.count,colorHelper);
        }
        glassLayer.count++;
      }else if(cell.liteEffect){
        const layer=layers.get(cell.liteEffect);
        if(layer&&layer.count<capacity){
          matrix.makeRotationZ(angle);
          matrix.scale(scale.set(size,size,size));
          matrix.setPosition(x,y,z);
          layer.mesh.setMatrixAt(layer.count++,matrix);
        }
      }
    },
    finish(){
      for(const {mesh,count} of layers.values()){mesh.count=count;mesh.instanceMatrix.needsUpdate=true;}
      glassMesh.count=glassLayer.count;
      glassMesh.instanceMatrix.needsUpdate=true;
      if(glassMesh.instanceColor)glassMesh.instanceColor.needsUpdate=true;
    },
    snapshot(){
      const result=Object.fromEntries([...layers].map(([id,{mesh,count}])=>[id,{count,loaded:!!mesh.material.map?.image?.naturalWidth}]));
      result.glass={count:glassLayer.count,loaded:true};
      return result;
    }
  };
};
