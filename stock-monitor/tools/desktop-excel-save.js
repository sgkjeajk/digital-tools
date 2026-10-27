'use strict';
// Loaded only by kwc.html, klz.html and syc.html. Never starts a background save.
(()=>{
 const button=document.getElementById('desktopExcelSaveButton');
 if(!button)return;
 const status=document.getElementById('desktopExcelSaveStatus');
 let handle=null,busy=false,readyForPicker=false;
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
  const records=new Map();
  for(const row of latestCfg.instruments||[])records.set(row.ticker,{...row});
  for(const row of latestData.instruments||[])records.set(row.ticker,{...records.get(row.ticker),...row});
  const allRows=[...records.values()].sort((a,b)=>({ETF:0,Stock:1,Fund:2}[a.type]??3)-({ETF:0,Stock:1,Fund:2}[b.type]??3)||String(a.ticker||'').localeCompare(String(b.ticker||'')));
  if(!allRows.length)throw Error('No instrument data is available to save.');
 const columns=[['#',6],['Category',10],['Ticker',15],['Name',44],['Region / Market',16],['Currency',10],['Previous Close',14],['Previous Day % Change',15],['Current Price',13],['Current % Change',13],['All-Time High',14],['Drawdown %',12],['Market Time',26],['Retrieved Time',26],['Refresh Status',16],['Dividend / Share',16],['Dividend Yield %',16],['Ex-Dividend Date',20]];
 const text=v=>({value:String(v??''),style:'text'}),num=v=>valid(v)?{value:v,style:'num'}:{style:'num'};
 const rows=allRows.map((r,i)=>{
  const n=i+2,prevDayBase=valid(r.prev_close)&&valid(r.prev_day_pct_change)?r.prev_close/(1+r.prev_day_pct_change/100):null;
  const prevDay=valid(prevDayBase)&&prevDayBase!==0?{style:'pct',formula:'IFERROR(G'+n+'/'+prevDayBase+'-1,"")',value:r.prev_close/prevDayBase-1}:{style:'pct'};
  const current=valid(r.current_price)&&valid(r.prev_close)&&r.prev_close!==0?{style:'pct',formula:'IFERROR(I'+n+'/G'+n+'-1,"")',value:r.current_price/r.prev_close-1}:{style:'pct'};
  const drawdown=valid(r.current_price)&&valid(r.ath)&&r.ath!==0?{style:'pct',formula:'IFERROR(I'+n+'/K'+n+'-1,"")',value:r.current_price/r.ath-1}:{style:'pct'};
  return [{value:i+1,style:'int'},text(r.type),text(r.ticker),text(r.name),text(r.region),text(r.currency),num(r.prev_close),prevDay,num(r.current_price),current,num(r.ath),drawdown,text(sg(r.price_as_of)),text(sg(r.price_retrieved_at)),text(r.refresh_error?'Refresh failed':'OK'),num(r.dividend_per_share),valid(r.dividend_yield_pct)?{value:r.dividend_yield_pct/100,style:'pct'}:{style:'pct'},text(r.ex_dividend_date||'')];
 });
 const blob=window.XlsxWriter.build({sheetName:'Stock Monitor',columns:columns.map(([header,width])=>({header,width})),rows});
 return blob;
 }

 button.onclick=async()=>{
  if(!supported||busy)return;
  if(!latestCfg||!latestData||!window.XlsxWriter){status.textContent='Wait for Stock Monitor data and the Excel writer to load, then try again.';return;}
  if(!handle&&!readyForPicker){
   readyForPicker=true;
   status.textContent='First-time save: click Continue to Save As below, then open Desktop → refresh (create the folder if needed). Keep the prefilled filename stock-monitor.xlsx and approve replacement if asked. Later saves update the same approved file. If Save As does not open in an embedded browser, open this page in desktop Chrome or Edge.';
   button.textContent='Continue to Save As';
   return;
  }
  busy=true;button.disabled=true;let writable;
  try{
   if(!handle){
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
   status.textContent='Saved as desktop\\refresh\\stock-monitor.xlsx  successfully.';
   try{await storedHandle('put',handle);}catch{status.textContent+=' Your browser could not remember the file after reload; selection is retained while this page remains open.';}
  }catch(error){
   if(writable)try{await writable.abort();}catch{}
   if(error.name==='NotFoundError'){handle=null;storedHandle('delete').catch(()=>{});}
   status.textContent=error.name==='AbortError'?'Save cancelled. No file was changed.':'Save failed: '+error.message;
  }finally{busy=false;button.disabled=false;button.textContent=handle?'Save Excel — Desktop only':'Continue to Save As';}
 };
})();
