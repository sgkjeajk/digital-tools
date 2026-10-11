'use strict';
const $=id=>document.getElementById(id), valid=n=>typeof n==='number'&&Number.isFinite(n), fmt=n=>valid(n)?n.toFixed(2):'—', pct=n=>valid(n)?(n>=0?'+':'')+n.toFixed(2)+'%':'—', cls=n=>valid(n)&&n>0?'pos':valid(n)&&n<0?'neg':'';
const sg=t=>t&&!Number.isNaN(Date.parse(t))?new Intl.DateTimeFormat('en-SG',{timeZone:'Asia/Singapore',dateStyle:'medium',timeStyle:'short'}).format(new Date(t))+' SGT':'Not yet retrieved';
let interval, running=false, exportRows=[];
const tableSort={ETF:{key:null,dir:'asc'},Stock:{key:null,dir:'asc'}};
function sortTable(type){
 const tbody=$(type==='ETF'?'etfRows':'stockRows'),state=tableSort[type];
 if(state.key){
  const rows=[...tbody.querySelectorAll('tr[data-ticker]')];
  rows.sort((a,b)=>{
   const aValue=state.key==='ticker'?a.dataset.ticker:a.dataset.region||'';
   const bValue=state.key==='ticker'?b.dataset.ticker:b.dataset.region||'';
   const primary=aValue.localeCompare(bValue,'en',{numeric:true,sensitivity:'base'});
   return (state.dir==='asc'?primary:-primary)||a.dataset.ticker.localeCompare(b.dataset.ticker,'en');
  });
  tbody.append(...rows);
 }
 const section=$(type==='ETF'?'etfSection':'stockSection');
 for(const th of section.querySelectorAll('th[data-sort-key]')){
  const selected=th.dataset.sortKey===state.key;
  th.setAttribute('aria-sort',selected?(state.dir==='asc'?'ascending':'descending'):'none');
  const button=th.querySelector('button');
  button.querySelector('.sort-arrow').textContent=selected?(state.dir==='asc'?'▲':'▼'):'↕';
  button.setAttribute('aria-label','Sort '+(th.dataset.sortKey==='ticker'?'ticker':'region or market')+(selected?' '+(state.dir==='asc'?'ascending':'descending'):''));
 }
}
function chooseSort(type,key){
 const state=tableSort[type];state.dir=state.key===key&&state.dir==='asc'?'desc':'asc';state.key=key;sortTable(type);
}
async function get(path){const response=await fetch(path+'?ts='+Date.now(),{cache:'no-store'});if(!response.ok)throw Error('Saved data unavailable: '+response.status);return response.json();}
function cell(tr,text,className=''){const td=document.createElement('td');td.textContent=text;td.className=className;tr.append(td);return td;}
function htmlEscape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function excelDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replace(/-/g,'');}
function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function mobileBrowser(){return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||navigator.maxTouchPoints>1&&/Macintosh/i.test(navigator.userAgent);}
function openExportPage(name,tableHtml){
 const page=window.open('','_blank');
 if(!page)return false;
 const fileHref='data:application/vnd.ms-excel;charset=utf-8,'+encodeURIComponent('<!doctype html><html><head><meta charset="utf-8"></head><body>'+tableHtml+'</body></html>');
 page.document.open();
 page.document.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+htmlEscape(name)+'</title><style>body{font-family:Arial,sans-serif;margin:16px;color:#17233c}.download{display:inline-flex;margin:0 0 12px;padding:12px 16px;border-radius:6px;background:#0072ff;color:white;text-decoration:none;font-weight:bold}.hint{font-size:13px;color:#556;line-height:1.5}table{border-collapse:collapse;font-size:12px;min-width:1100px}th,td{border:1px solid #999;padding:5px;white-space:nowrap}th{background:#eaf3ff}.wrap{overflow:auto}</style></head><body><a class="download" download="'+htmlEscape(name)+'" href="'+fileHref+'">Download Excel File</a><p class="hint">If your phone opens the table instead of downloading, use Share or Save to Files from your browser menu.</p><div class="wrap">'+tableHtml+'</div></body></html>');
 page.document.close();
 return true;
}
function exportExcel(){
 if(!exportRows.length){$('status').textContent='No monitor data loaded yet. Please wait for the page to finish loading.';return;}
 const columns=['#','Category','Ticker','Name','Region / Market','Currency','Previous Close','Previous Day % Change','Current Price','Current % Change','All-Time High','Drawdown %','Market Time','Retrieved Time','Refresh Status'];
 const rows=exportRows.map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+htmlEscape(r.type)+'</td><td>'+htmlEscape(r.ticker)+'</td><td>'+htmlEscape(r.name)+'</td><td>'+htmlEscape(r.region)+'</td><td>'+htmlEscape(r.currency)+'</td><td>'+htmlEscape(fmt(r.prev_close))+'</td><td>'+htmlEscape(pct(r.prev_day_pct_change))+'</td><td>'+htmlEscape(fmt(r.current_price))+'</td><td>'+htmlEscape(pct(r.current_pct_change))+'</td><td>'+htmlEscape(fmt(r.ath))+'</td><td>'+htmlEscape(pct(r.drawdown_pct))+'</td><td>'+htmlEscape(sg(r.price_as_of))+'</td><td>'+htmlEscape(sg(r.price_retrieved_at))+'</td><td>'+htmlEscape(r.refresh_error?'Refresh failed':'OK')+'</td></tr>').join('');
 const tableHtml='<table><thead><tr>'+columns.map(c=>'<th>'+htmlEscape(c)+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table>';
 const html='<!doctype html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse}th,td{border:1px solid #999;padding:5px}th{background:#eaf3ff}</style></head><body>'+tableHtml+'</body></html>',name='stock-monitor-'+excelDate()+'.xls';
 if(mobileBrowser()&&openExportPage(name,tableHtml)){$('status').textContent='Excel export opened in a new tab. Tap Download Excel File, or use Share / Save to Files if your phone opens the table.';return;}
 download(name,html,'application/vnd.ms-excel;charset=utf-8');
 $('status').textContent='Excel export requested: '+exportRows.length+' instruments sorted by category and ticker. Check your browser downloads for the .xls file.';
}
function render(cfg,data){
 const prices=new Map((data.instruments||[]).map(x=>[x.ticker,x]));const active=cfg.instruments.filter(x=>x.enabled).sort((a,b)=>(a.type==='ETF'?0:1)-(b.type==='ETF'?0:1)||a.ticker.localeCompare(b.ticker));
 exportRows=active.map(x=>({...x,...(prices.get(x.ticker)||{})}));
 $('etfRows').replaceChildren();$('stockRows').replaceChildren();let successful=[];
 for(const x of active){const q=prices.get(x.ticker)||{},tr=document.createElement('tr');tr.dataset.ticker=x.ticker;tr.dataset.region=x.region||'';const tickerCell=cell(tr,'');const tickerLink=document.createElement('a');tickerLink.textContent=x.ticker;tickerLink.href='https://finance.yahoo.com/quote/'+encodeURIComponent(x.ticker)+'/';tickerLink.target='_blank';tickerLink.rel='noopener noreferrer';tickerLink.setAttribute('aria-label',x.ticker+' on Yahoo Finance (opens in a new tab)');tickerCell.append(tickerLink);cell(tr,x.region);const name=cell(tr,x.name+(q.currency?' ('+q.currency+')':''));const note=document.createElement('small');note.className='row-note';note.textContent=q.refresh_error?'Refresh failed · '+sg(q.price_as_of):q.price_as_of?'Market time: '+sg(q.price_as_of):'Price pending';if(q.ath_error)note.textContent+=' · Using saved ATH — latest update failed.';name.append(note);if(q.price_retrieved_at&&!q.refresh_error)successful.push(q.price_retrieved_at);cell(tr,fmt(q.prev_close));cell(tr,pct(q.prev_day_pct_change),cls(q.prev_day_pct_change));cell(tr,fmt(q.current_price));cell(tr,pct(q.current_pct_change),cls(q.current_pct_change));const ath=cell(tr,fmt(q.ath));if(q.ath_error){ath.title=q.ath_error;ath.className='warning';}cell(tr,pct(q.drawdown_pct),cls(q.drawdown_pct));$(x.type==='ETF'?'etfRows':'stockRows').append(tr);}
 for(const [type,id] of [['ETF','etf'],['Stock','stock']]){const count=active.filter(x=>x.type===type).length;$(id+'Count').textContent='Total '+(type==='ETF'?'ETFs':'Stocks')+': '+count;if(!count){const tr=document.createElement('tr');cell(tr,'No enabled '+type+' tickers.').colSpan=9;$(id+'Rows').append(tr);}}
 sortTable('ETF');sortTable('Stock');
 const latestPriceTime=successful.sort().at(-1)||active.map(x=>prices.get(x.ticker)?.price_retrieved_at).filter(Boolean).sort().at(-1);
 $('reference-time').textContent=sg(data.last_check_completed_at||data.generated_at||latestPriceTime);$('tracked').textContent=active.length+' instruments';
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
   const key=text==='Ticker'?'ticker':'region',button=document.createElement('button'),arrow=document.createElement('span');
   th.dataset.sortKey=key;th.setAttribute('aria-sort','none');button.type='button';button.className='sort-heading';
   button.append(document.createTextNode(text+' '));arrow.className='sort-arrow';arrow.textContent='↕';button.append(arrow);
   button.setAttribute('aria-label','Sort '+(key==='ticker'?'ticker':'region or market'));button.onclick=()=>chooseSort(type,key);th.append(button);
  }else th.textContent=text;
  tr.append(th);
 }
 head.append(tr);
}
$('jumpETF').onclick=()=>$('etfSection').scrollIntoView({behavior:'smooth'});$('jumpStock').onclick=()=>$('stockSection').scrollIntoView({behavior:'smooth'});window.addEventListener('focus',()=>refresh(false));refresh(false);
$('exportExcelButton').onclick=exportExcel;
