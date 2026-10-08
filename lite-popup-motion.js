// New V3 dialogs use the original game's pixel departure renderer.
globalThis.installRotationPopupMotion=function(dialog){
  const nativeClose=dialog.close.bind(dialog);let closing=false;
  dialog.close=function(returnValue){
    if(!dialog.open||closing)return;
    closing=true;dialog.dataset.v3Closing='true';
    const focused=document.activeElement;
    const origin=dialog.contains(focused)&&focused.matches('button')?focused:dialog.querySelector('.v3-popup-close');
    const complete=()=>{closing=false;delete dialog.dataset.v3Closing;nativeClose(returnValue);};
    const request=new CustomEvent('rotation:ui-dismiss',{cancelable:true,detail:{target:dialog,origin,complete}});
    if(window.dispatchEvent(request))complete();
  };
  // Existing cancellation handlers run first, including cancelling a backpack drag.
  dialog.addEventListener('cancel',event=>{if(event.defaultPrevented)return;event.preventDefault();dialog.close();});
  for(const type of ['click','pointerdown','keydown'])dialog.addEventListener(type,event=>{if(closing){event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
};
