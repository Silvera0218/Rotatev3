// Reference: a bright pixel sweep replaces content, followed by scattered squares.
// Cosmetic patterns do not consume the gameplay RNG.
globalThis.playLiteRewardWipe=function(swap,{region,origin}={}){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){swap();return Promise.resolve();}
  const canvas=document.createElement('canvas');canvas.id='lite-reward-wipe';canvas.setAttribute('aria-hidden','true');document.body.append(canvas);
  const ctx=canvas.getContext('2d');let changed=false,frame=0,start=performance.now();
  const bounds=region?.();
  return new Promise((resolve,reject)=>{
    function cleanup(){cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',hidden);canvas.remove();}
    function finish(){cleanup();resolve();}
    function change(){if(!changed){changed=true;swap();}}
    function hidden(){if(document.hidden){try{change();finish();}catch(e){cleanup();reject(e);}}}
    document.addEventListener('visibilitychange',hidden);
    function draw(now){
      try{
        const t=Math.min(1,(now-start)/(origin?780:640)),vw=innerWidth,vh=innerHeight;
        if(canvas.width!==vw||canvas.height!==vh){canvas.width=vw;canvas.height=vh;}
        ctx.clearRect(0,0,vw,vh);
        const x=bounds?.x??0,y=bounds?.y??0,w=bounds?.width??vw,h=bounds?.height??vh;
        // Reward cards expand into a full-screen pixel cover; swap only when opaque.
        if(origin){
          const size=vw<600?24:36,cx=origin.x*vw,cy=origin.y*vh;
          const far=Math.hypot(Math.max(cx,vw-cx),Math.max(cy,vh-cy));
          for(let py=0;py<vh;py+=size)for(let px=0;px<vw;px+=size){
            const col=Math.floor(px/size),row=Math.floor(py/size);
            const distance=Math.min(1,Math.hypot(px+size/2-cx,py+size/2-cy)/far);
            const delay=distance*.24+((col*7+row*11)%5)*.008;
            const cover=Math.max(0,Math.min(1,(t-delay)/.15));
            const reveal=Math.max(0,Math.min(1,(t-.52-delay)/.15));
            const scale=cover*(1-reveal),side=(size+1)*scale;
            const seed=(col*13+row*7)%23;
            ctx.fillStyle=seed<15?'#e9faff':seed<19?'#b3edff':seed<22?'#39dcea':'#c4ff17';
            ctx.fillRect(Math.round(px+(size-side)/2),Math.round(py+(size-side)/2),Math.ceil(side),Math.ceil(side));
          }
          canvas.dataset.phase=t<.46?'cover':t<.52?'covered':'reveal';
          if(t>=.46)change();
          if(t<1)frame=requestAnimationFrame(draw);else finish();
          return;
        }
        const size=w<600?20:32,cols=Math.ceil(w/size),rows=Math.ceil(h/size);
        ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.translate(x,y);
        // Both edges move downward. The swap happens under an opaque pixel plate.
        for(let col=0;col<cols;col++){
          const delay=((col*7)%5)*.013;
          const front=Math.floor(Math.max(0,Math.min(1,(t-delay)/.23))*(rows+1));
          const tail=Math.floor(Math.max(0,Math.min(1,(t-.35-delay)/.28))*(rows+1));
          for(let row=tail;row<front;row++){
            const seed=(Math.floor(col/2)*13+Math.floor(row/2)*7)%23;
            ctx.fillStyle=seed<16?'#f8ffdc':seed<20?'#dfff79':seed<22?'#c4ff17':'#92eadf';
            ctx.fillRect(col*size,row*size,size+1,size+1);
          }
        }
        // The bright leading band breaks into larger pixels as the new page appears.
        const edge=(t<.32?t/.29:(t-.35)/.31)*h;
        for(let j=0;j<26;j++){
          const px=((j*137+37)%997)/997*w,py=edge+((j*31)%101)-50,s=size*(j%3===0?1.25:.55);
          ctx.globalAlpha=t<.7?.9:0;ctx.fillStyle=j%3===0?'#fffde1':'#c4ff17';ctx.fillRect(Math.round(px),Math.round(py),s,s);
        }
        ctx.globalAlpha=1;
        // Loose fragments drift away after the content is already readable.
        for(let j=0;j<30;j++){
          const birth=.12+(j%5)*.018,p=Math.max(0,(t-birth)/(1-birth));if(t<birth)continue;
          const px=((j*173+53)%997)/997*w,py=((j*97+13)%991)/991*h;
          const dx=((j%7)-3)*35,dy=24+(j%4)*20,s=j%5===0?14:j%3===0?9:5;
          ctx.globalAlpha=Math.max(0,1-p)*.9;ctx.fillStyle=j%4===0?'#fffde1':j%4===1?'#39dcea':'#c4ff17';
          ctx.save();ctx.translate(px+dx*p,py+dy*p);ctx.rotate(p*(j%2?1:-1));ctx.fillRect(-s/2,-s/2,s,s);ctx.restore();
        }
        ctx.restore();ctx.globalAlpha=1;
        canvas.dataset.phase=t<.31?'cover':t<.7?'reveal':'scatter';
        if(t>=.31)change();
        if(t<1)frame=requestAnimationFrame(draw);else finish();
      }catch(e){cleanup();reject(e);}
    }
    frame=requestAnimationFrame(draw);
  });
};
