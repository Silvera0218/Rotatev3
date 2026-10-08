// Cosmetic pixel streams are independent of gameplay randomness and inventory state.
globalThis.playLiteAcquisition=async function({button,origin,sources=[]}){
  const img=button.querySelector('img');if(!img)return;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  if(!img.complete)await img.decode().catch(()=>{});if(!img.naturalWidth)return;
  const tile=document.createElement('canvas');tile.width=tile.height=32;const sample=tile.getContext('2d',{willReadFrequently:true});sample.drawImage(img,0,0,32,32);const data=sample.getImageData(0,0,32,32).data,points=[];
  for(let y=0;y<32;y+=2)for(let x=0;x<32;x+=2){const i=(y*32+x)*4;if(data[i+3]>128)points.push({x,y,color:`rgb(${data[i]},${data[i+1]},${data[i+2]})`});}
  const emitters=[origin,origin,origin,...sources],particles=points.filter((_,i)=>i%2===0).map(p=>({...p,from:emitters[Math.floor(Math.random()*emitters.length)],delay:Math.random()*.16,bend:(Math.random()-.5)*100}));
  const canvas=document.createElement('canvas');canvas.className='lite-acquisition-canvas';canvas.dataset.tool=button.id;canvas.setAttribute('aria-hidden','true');document.body.append(canvas);button.dataset.liteAcquiring='true';
  const ctx=canvas.getContext('2d'),started=performance.now();let frame;
  await new Promise(resolve=>{
    function finish(){cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',hidden);canvas.remove();delete button.dataset.liteAcquiring;resolve();}
    function hidden(){if(document.hidden)finish();}document.addEventListener('visibilitychange',hidden);
    function draw(now){
      if(!button.isConnected||button.hidden){finish();return;}
      const t=Math.min(1,(now-started)/1050),r=img.getBoundingClientRect();canvas.width=innerWidth;canvas.height=innerHeight;ctx.imageSmoothingEnabled=false;
      for(const p of particles){
        const u=Math.max(0,Math.min(1,(t-p.delay)/.78)),ease=1-(1-u)**3,end={x:r.x+p.x*r.width/32,y:r.y+p.y*r.height/32};
        const x=p.from.x+(end.x-p.from.x)*ease+Math.sin(u*Math.PI)*p.bend,y=p.from.y+(end.y-p.from.y)*ease-Math.sin(u*Math.PI)*55;
        ctx.fillStyle=p.color;ctx.globalAlpha=Math.min(1,u*12);const size=u>.8?Math.max(2,r.width/16):3;
        ctx.fillRect(Math.round(x),Math.round(y),size,size);
        if(u<.85){ctx.fillStyle='#9bf6ff';ctx.globalAlpha=.28;ctx.fillRect(Math.round(x-(end.x-p.from.x)*.016),Math.round(y-(end.y-p.from.y)*.016),3,3);}
      }
      ctx.globalAlpha=1;canvas.dataset.phase=t<.65?'flight':'assembly';
      if(t>=1){finish();button.animate([{filter:'brightness(1.65)'},{filter:'brightness(1)'}],{duration:240});}else frame=requestAnimationFrame(draw);
    }
    frame=requestAnimationFrame(draw);
  });
};
