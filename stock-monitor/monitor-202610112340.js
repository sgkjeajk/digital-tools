'use strict';
const $=id=>document.getElementById(id), valid=n=>typeof n==='number'&&Number.isFinite(n), fmt=n=>valid(n)?n.toFixed(2):'—', pct=n=>valid(n)?(n>=0?'+':'')+n.toFixed(2)+'%':'—', cls=n=>valid(n)&&n>0?'pos':valid(n)&&n<0?'neg':'';
const sg=t=>t&&!Number.isNaN(Date.parse(t))?new Intl.DateTimeFormat('en-SG',{timeZone:'Asia/Singapore',dateStyle:'medium',timeStyle:'short'}).format(new Date(t))+' SGT':'Not yet retrieved';
const HIDDEN_TICKERS_KEY='stockMonitorHiddenTickers';
let interval, running=false, exportRows=[], latestCfg=null, latestData=null, hiddenTickers=loadHiddenTickers();
const tableSort={ETF:{key:null,dir:'asc'},Stock:{key:null,dir:'asc'}};
function loadHiddenTickers(){
 try{const saved=JSON.parse(localStorage.getItem(HIDDEN_TICKERS_KEY)||'[]');return new Set(Array.isArray(saved)?saved:[]);}
 catch{return new Set();}
}
function saveHiddenTickers(){localStorage.setItem(HIDDEN_TICKERS_KEY,JSON.stringify([...hiddenTickers].sort()));}
function rerender(){if(latestCfg&&latestData)render(latestCfg,latestData);}
function setTickerVisible(ticker,visible){if(visible)hiddenTickers.delete(ticker);else hiddenTickers.add(ticker);saveHiddenTickers();rerender();}
function setTypeVisible(type,visible){
 if(!latestCfg)return;
 for(const x of latestCfg.instruments.filter(x=>x.enabled&&x.type===type)){if(visible)hiddenTickers.delete(x.ticker);else hiddenTickers.add(x.ticker);}
 saveHiddenTickers();rerender();
}
function toggleSettings(open){
 const panel=$('settingsPanel'),button=$('settingsButton'),next=open??!panel.classList.contains('open');
 panel.classList.toggle('open',next);button.setAttribute('aria-expanded',String(next));
 if(next)panel.scrollIntoView({behavior:'smooth',block:'start'});
}
function renderSettings(allActive){
 const list=$('settingsList');
 if(!list)return;
 list.replaceChildren();
 for(const x of allActive){
  const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span'),title=document.createElement('strong'),meta=document.createElement('span');
  label.className='settings-option';input.type='checkbox';input.checked=!hiddenTickers.has(x.ticker);input.onchange=()=>setTickerVisible(x.ticker,input.checked);
  title.textContent=x.ticker+' · '+x.type;meta.textContent=[x.name,x.region].filter(Boolean).join(' · ');text.append(title,meta);label.append(input,text);list.append(label);
 }
 if(!allActive.length){const empty=document.createElement('p');empty.textContent='No enabled tickers found.';list.append(empty);}
}
function tableBody(id,sectionId){let body=$(id);if(body)return body;body=document.createElement('tbody');body.id=id;$(sectionId).querySelector('table').append(body);return body;}
function sortTable(type){
 const tbody=tableBody(type==='ETF'?'etfRows':'stockRows',type==='ETF'?'etfSection':'stockSection'),state=tableSort[type];
 if(state.key){
  const rows=[...tbody.querySelectorAll('tr[data-ticker]')];
  rows.sort((a,b)=>{
   const av=(a.dataset[state.key]||'').toUpperCase(),bv=(b.dataset[state.key]||'').toUpperCase(),base=av.localeCompare(bv);
   return state.dir==='asc'?base:-base;
  });
  tbody.replaceChildren(...rows);
 }
 for(const section of ['etfSection','stockSection']){
  const sectionType=section==='etfSection'?'ETF':'Stock';
  for(const th of $(section).querySelectorAll('th[data-sort-key]')){
   const key=th.dataset.sortKey,active=tableSort[sectionType].key===key;
   th.setAttribute('aria-sort',active?(tableSort[sectionType].dir==='asc'?'ascending':'descending'):'none');
   th.querySelector('.sort-arrow').textContent=active?(tableSort[sectionType].dir==='asc'?'↑':'↓'):'↕';
  }
 }
}
function chooseSort(type,key){
 const state=tableSort[type];state.dir=state.key===key&&state.dir==='asc'?'desc':'asc';state.key=key;sortTable(type);
}
async function get(path){const response=await fetch(path+'?ts='+Date.now(),{cache:'no-store'});if(!response.ok)throw Error('Saved data unavailable: '+response.status);return response.json();}
function cell(tr,text,className=''){const td=document.createElement('td');td.textContent=text;td.className=className;tr.append(td);return td;}
function htmlEscape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function excelNum(value){return valid(value)?String(value):'';}
function formulaCell(value){return '<td style="mso-number-format:\'0.00%\'">'+htmlEscape(value)+'</td>';}
function excelDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replace(/-/g,'');}
function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function mobileBrowser(){return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||navigator.maxTouchPoints>1&&/Macintosh/i.test(navigator.userAgent);}
function showExportPanel(name,html,tableHtml){
 const link=$('exportDownloadLink'),panel=$('exportPanel');
 $('exportPreview').innerHTML=tableHtml;
 link.href='data:application/vnd.ms-excel;charset=utf-8,'+encodeURIComponent(html);
 link.download=name;
 panel.classList.add('open');
 panel.scrollIntoView({behavior:'smooth',block:'start'});
}
function exportExcel(){
 if(!exportRows.length){$('status').textContent=latestCfg?'No tickers are currently selected for display. Open Settings and show at least one ticker before exporting.':'No monitor data loaded yet. Please wait for the page to finish loading.';return;}
 const columns=['#','Category','Ticker','Name','Region / Market','Currency','Previous Close','Previous Day % Change','Current Price','Current % Change','All-Time High','Drawdown %','Market Time','Retrieved Time','Refresh Status'];
 const rows=exportRows.map((r,i)=>{const row=i+2,prevDayBase=valid(r.prev_close)&&valid(r.prev_day_pct_change)?r.prev_close/(1+r.prev_day_pct_change/100):null,prevDayFormula=valid(prevDayBase)?'=IFERROR(G'+row+'/'+prevDayBase+'-1,"")':'',currentFormula='=IFERROR(I'+row+'/G'+row+'-1,"")',drawdownFormula='=IFERROR(I'+row+'/K'+row+'-1,"")';return '<tr><td>'+(i+1)+'</td><td>'+htmlEscape(r.type)+'</td><td>'+htmlEscape(r.ticker)+'</td><td>'+htmlEscape(r.name)+'</td><td>'+htmlEscape(r.region)+'</td><td>'+htmlEscape(r.currency)+'</td><td>'+htmlEscape(excelNum(r.prev_close))+'</td>'+formulaCell(prevDayFormula)+'<td>'+htmlEscape(excelNum(r.current_price))+'</td>'+formulaCell(currentFormula)+'<td>'+htmlEscape(excelNum(r.ath))+'</td>'+formulaCell(drawdownFormula)+'<td>'+htmlEscape(sg(r.price_as_of))+'</td><td>'+htmlEscape(sg(r.price_retrieved_at))+'</td><td>'+htmlEscape(r.refresh_error?'Refresh failed':'OK')+'</td></tr>';}).join('');
 const tableHtml='<table><thead><tr>'+columns.map(c=>'<th>'+htmlEscape(c)+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table>';
 const html='<!doctype html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse}th,td{border:1px solid #999;padding:5px}th{background:#eaf3ff}</style></head><body>'+tableHtml+'</body></html>',name='stock-monitor-'+excelDate()+'.xls';
 if(mobileBrowser()){showExportPanel(name,html,tableHtml);$('status').textContent='Excel export preview is shown above. Tap Download Excel File, or use Share / Save to Files if your phone opens the table.';return;}
 download(name,html,'application/vnd.ms-excel;charset=utf-8');
 $('status').textContent='Excel export requested: '+exportRows.length+' instruments sorted by category and ticker. Check your browser downloads for the .xls file.';
}
function render(cfg,data){
 latestCfg=cfg;latestData=data;
 const prices=new Map((data.instruments||[]).map(x=>[x.ticker,x]));
 const allActive=cfg.instruments.filter(x=>x.enabled).sort((a,b)=>(a.type==='ETF'?0:1)-(b.type==='ETF'?0:1)||a.ticker.localeCompare(b.ticker));
 renderSettings(allActive);
 const active=allActive.filter(x=>!hiddenTickers.has(x.ticker));
 exportRows=active.map(x=>({...x,...(prices.get(x.ticker)||{})}));
 const etfBody=tableBody('etfRows','etfSection'),stockBody=tableBody('stockRows','stockSection');
 etfBody.replaceChildren();stockBody.replaceChildren();let successful=[];
 for(const x of active){const q=prices.get(x.ticker)||{},tr=document.createElement('tr');tr.dataset.ticker=x.ticker;tr.dataset.region=x.region||'';const tickerCell=cell(tr,'');const tickerLink=document.createElement('a');tickerLink.textContent=x.ticker;tickerLink.href='https://finance.yahoo.com/quote/'+encodeURIComponent(x.ticker)+'/';tickerLink.target='_blank';tickerLink.rel='noopener noreferrer';tickerLink.setAttribute('aria-label',x.ticker+' on Yahoo Finance (opens in a new tab)');tickerCell.append(tickerLink);cell(tr,x.region);const name=cell(tr,x.name+(q.currency?' ('+q.currency+')':''));const note=document.createElement('small');note.className='row-note';note.textContent=q.refresh_error?'Refresh failed · '+sg(q.price_as_of):q.price_as_of?'Market time: '+sg(q.price_as_of):'Price pending';if(q.ath_error)note.textContent+=' · Using saved ATH — latest update failed.';name.append(note);if(q.price_retrieved_at&&!q.refresh_error)successful.push(q.price_retrieved_at);cell(tr,fmt(q.prev_close));cell(tr,pct(q.prev_day_pct_change),cls(q.prev_day_pct_change));cell(tr,fmt(q.current_price));cell(tr,pct(q.current_pct_change),cls(q.current_pct_change));const ath=cell(tr,fmt(q.ath));if(q.ath_error){ath.title=q.ath_error;ath.className='warning';}cell(tr,pct(q.drawdown_pct),cls(q.drawdown_pct));(x.type==='ETF'?etfBody:stockBody).append(tr);}
 for(const [type,id] of [['ETF','etf'],['Stock','stock']]){const allCount=allActive.filter(x=>x.type===type).length,count=active.filter(x=>x.type===type).length,hidden=allCount-count,section=$(id+'Section');section.style.display=count?'':'none';$(id+'Count').textContent='Total '+(type==='ETF'?'ETFs':'Stocks')+': '+count+(hidden?' · '+hidden+' hidden':'');}
 sortTable('ETF');sortTable('Stock');
 const latestPriceTime=successful.sort().at(-1)||allActive.map(x=>prices.get(x.ticker)?.price_retrieved_at).filter(Boolean).sort().at(-1),hiddenCount=allActive.length-active.length;
 $('reference-time').textContent=sg(data.last_check_completed_at||data.generated_at||latestPriceTime);$('tracked').textContent=active.length+' shown'+(hiddenCount?' · '+hiddenCount+' hidden':'')+' · '+allActive.length+' total instruments';
 clearInterval(interval);interval=setInterval(()=>refresh(false),Math.max(5,Math.min(10,cfg.refreshIntervalMinutes||10))*60000);
 return active.map(x=>prices.get(x.ticker)||{});
}
async function load(){const [cfg,data]=await Promise.all([get('../data/stock-tickers.json'),get('../market-data.json')]);return render(cfg,data);}
async function refresh(){if(running)return;running=true;try{const rows=await load();const failed=rows.filter(x=>x.refresh_error).length;$('status').textContent=failed?failed+' ticker(s) could not be updated; their saved prices and timestamps are retained.':'Latest saved data loaded. Last refresh & check completed: '+$('reference-time').textContent+'.';}catch(e){$('status').textContent=e.message;}finally{running=false;}}
for(const head of document.querySelectorAll('thead')){
 const type=head.closest('#etfSection')?'ETF':'Stock',tr=document.createElement('tr');
 for(const text of ['Ticker','Region / Market','Stock / ETF Name','Prev Day Close','Prev Day % Chg','Current Price','Current % Chg','All-Time High','Drawdown %']){
  const th=document.createElement('th');
  if(text==='Ticker'||text==='Region / Market'){
   const button=document.createElement('button'),arrow=document.createElement('span'),key=text==='Ticker'?'ticker':'region';
   th.dataset.sortKey=key;th.setAttribute('aria-sort','none');button.type='button';button.className='sort-heading';button.setAttribute('aria-label','Sort '+(key==='ticker'?'ticker':'region or market'));button.append(text+' ');arrow.className='sort-arrow';arrow.textContent='↕';button.append(arrow);button.onclick=()=>chooseSort(type,key);th.append(button);
  }else th.textContent=text;
  tr.append(th);
 }
 head.append(tr);
}
$('jumpETF').onclick=()=>($('etfSection').style.display==='none'?$('stockSection'):$('etfSection')).scrollIntoView({behavior:'smooth'});$('jumpStock').onclick=()=>$('stockSection').scrollIntoView({behavior:'smooth'});window.addEventListener('focus',()=>refresh(false));refresh(false);
$('exportExcelButton').onclick=exportExcel;
$('settingsButton').onclick=()=>toggleSettings();
$('settingsCloseButton').onclick=()=>toggleSettings(false);
$('showAllTickersButton').onclick=()=>{hiddenTickers.clear();saveHiddenTickers();rerender();};
$('hideAllEtfButton').onclick=()=>setTypeVisible('ETF',false);
$('hideAllStockButton').onclick=()=>setTypeVisible('Stock',false);
