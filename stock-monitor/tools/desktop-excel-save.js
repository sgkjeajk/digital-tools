'use strict';
// Loaded only by kwc.html, klz.html and syc.html. Never starts a background save.
(()=>{
 const button=document.getElementById('desktopExcelSaveButton');
 if(!button)return;
 const status=document.getElementById('desktopExcelSaveStatus');
 let handle=null,busy=false;
 const mobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.maxTouchPoints>1&&/Macintosh/i.test(navigator.userAgent));
 const supported=!mobile&&window.isSecureContext&&typeof window.showSaveFilePicker==='function';
 if(!supported){button.disabled=true;status.textContent='Desktop Chrome/Edge with file access support and HTTPS required. Use Export Excel for a normal download.';}
 // Persist only the user-approved handle, never an arbitrary filesystem path.
 function storedHandle(action,value){
  return new Promise((resolve,reject)=>{
   if(!window.indexedDB){resolve(null);return;}
   const request=window.indexedDB.open('stock-monitor-excel-save',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('handles');
   request.onerror=()=>reject(request.error);
   request.onblocked=()=>reject(Error('Close other Stock Monitor tabs and try again.'));
   request.onsuccess=()=>{
    const db=request.result;
    try{
     const tx=db.transaction('handles',action==='get'?'readonly':'readwrite'),store=tx.objectStore('handles');
     const operation=action==='get'?store.get('workbook'):action==='delete'?store.delete('workbook'):store.put(value,'workbook');
     tx.oncomplete=()=>{db.close();resolve(operation.result||null);};
     tx.onabort=tx.onerror=()=>{db.close();reject(tx.error||Error('File selection could not be remembered.'));};
    }catch(error){db.close();reject(error);}
   };
  });
 }
 if(supported){
  button.disabled=true;
  storedHandle('get').then(saved=>{if(saved&&saved.name==='stock-monitor.xlsx')handle=saved;}).catch(()=>{}).finally(()=>{button.disabled=false;});
 }
 function workbook(){
  // Union configuration and saved quotes; include disabled/hidden and quote-only instruments.
  const records=new Map();
  for(const row of latestCfg.instruments||[])records.set(row.ticker,{...row});
  for(const row of latestData.instruments||[])records.set(row.ticker,{...records.get(row.ticker),...row});
  const metadata={};
  for(const [prefix,source] of [['config',latestCfg],['data',latestData]]){
   for(const [key,value] of Object.entries(source))if(key!=='instruments')metadata[prefix+'.'+key]=value;
  }
  const rows=[...records.values()].sort((a,b)=>String(a.type||'').localeCompare(String(b.type||''))||String(a.ticker||'').localeCompare(String(b.ticker||''))).map(row=>({...row,...metadata}));
  if(!rows.length)throw Error('No instrument data is available to save.');
  const keys=[...new Set(rows.flatMap(row=>Object.keys(row)))];
  return window.XlsxWriter.build({sheetName:'All Stock Monitor Data',columns:keys.map(header=>({header,width:24})),rows:rows.map(row=>keys.map(key=>{
   const value=row[key];
   return typeof value==='number'&&Number.isFinite(value)?{value,style:'num'}:{value:value==null?'':typeof value==='object'?JSON.stringify(value):String(value),style:'text'};
  }))});
 }
 button.onclick=async()=>{
  if(!supported||busy)return;
  if(!latestCfg||!latestData||!window.XlsxWriter){status.textContent='Wait for Stock Monitor data and the Excel writer to load, then try again.';return;}
  busy=true;button.disabled=true;let writable;
  try{
   if(!handle){
    if(!window.confirm('First-time Excel save: in the next Save As window, open Desktop → refresh (create the refresh folder if needed). The filename is already filled in as stock-monitor.xlsx. Choose Save and approve replacing the existing file if asked. Later Save Excel clicks will update the same approved file. Continue?'))return;
    // Invoke the picker from the click, before asynchronous permission/storage work.
    const candidate=await window.showSaveFilePicker({id:'stock-monitor-desktop-excel',startIn:'desktop',suggestedName:'stock-monitor.xlsx',excludeAcceptAllOption:true,types:[{description:'Excel workbook',accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}]});
    if(candidate.name!=='stock-monitor.xlsx')throw Error('Keep the filename stock-monitor.xlsx. No workbook data was written.');
    handle=candidate;
   }
   // Request write access on each user-initiated save if permission is not already granted.
   if(await handle.queryPermission({mode:'readwrite'})!=='granted'&&await handle.requestPermission({mode:'readwrite'})!=='granted')throw Error('Write permission was not granted. No file was changed.');
   const blob=workbook();
   writable=await handle.createWritable();
   await writable.write(blob);
   await writable.close();writable=null;
   status.textContent='Saved stock-monitor.xlsx into the refresh folder successfully.';
   try{await storedHandle('put',handle);}catch{status.textContent+=' Your browser could not remember the file after reload; selection is retained while this page remains open.';}
  }catch(error){
   if(writable)try{await writable.abort();}catch{}
   if(error.name==='NotFoundError'){handle=null;storedHandle('delete').catch(()=>{});}
   status.textContent=error.name==='AbortError'?'Save cancelled. No file was changed.':'Save failed: '+error.message;
  }finally{busy=false;button.disabled=false;}
 };
})();
