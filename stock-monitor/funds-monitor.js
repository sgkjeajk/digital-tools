'use strict';
const fund$=id=>document.getElementById(id);
const fundValid=n=>typeof n==='number'&&Number.isFinite(n);
const fundFmt=n=>fundValid(n)?n.toFixed(2):'—';
const fundPct=n=>fundValid(n)?(n>=0?'+':'')+n.toFixed(2)+'%':'—';
const fundClass=n=>fundValid(n)&&n>0?'pos':fundValid(n)&&n<0?'neg':'';
const fundTime=t=>t&&!Number.isNaN(Date.parse(t))?new Intl.DateTimeFormat('en-SG',{timeZone:'Asia/Singapore',dateStyle:'medium',timeStyle:'short'}).format(new Date(t))+' SGT':'Not yet retrieved';
const fundSort={key:null,dir:'asc'};
let fundRows=[],fundRunning=false;

async function fetchFundsJson(path){
 const url=new URL(path,location.href);
 const candidates=[url.toString()+'?fundsTs='+Date.now(),'https://raw.githubusercontent.com/myai118/digital-tools/main/'+url.pathname.replace(/^\/digital-tools\//,'')+'?fundsTs='+Date.now()];
 let last;
 for(const candidate of candidates){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{const response=await fetch(candidate,{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);return await response.json();}
  catch(error){last=error;}
  finally{clearTimeout(timer);}
 }
 throw Error('Funds data unavailable: '+(last?.name==='AbortError'?'request timed out':last?.message||'network error'));
}

async function loadFundsData(){
 const [config,market,dividend]=await Promise.all([
  fetchFundsJson('../data/stock-tickers.json'),
  fetchFundsJson('../market-data.json'),
  fetchFundsJson('../dividend-data.json').catch(()=>null)
 ]);
 const dividendByTicker=new Map((dividend?.instruments||[]).map(row=>[row.ticker,row]));
 const marketByTicker=new Map((market.instruments||[]).map(row=>[row.ticker,row]));
 return {
  config,
  market,
  rows:(config.instruments||[]).filter(row=>row.enabled&&row.type==='Fund').map(row=>{
   const quote={...(marketByTicker.get(row.ticker)||{}),...(dividendByTicker.get(row.ticker)||{})};
   return {...row,...quote};
  })
 };
}

function fundCell(tr,text,className=''){const td=document.createElement('td');td.textContent=text;td.className=className;tr.append(td);return td;}
function buildFundHeader(){
 const head=fund$('#fundSection')?.querySelector('thead');if(!head||head.querySelector('tr'))return;
 const tr=document.createElement('tr');
 const columns=[['Ticker','ticker'],['Region / Market','region'],['Fund Name'],['Prev Day Close'],['Prev Day % Chg'],['Current Price'],['Current % Chg','currentPct'],['All-Time High'],['Drawdown %','drawdown'],['Dividend / Share'],['Dividend Yield %','dividendYield']];
 for(const [label,key] of columns){
  const th=document.createElement('th');if(key){th.dataset.sortKey=key;th.setAttribute('aria-sort','none');const button=document.createElement('button');button.type='button';button.className='sort-heading';button.textContent=label+' ';const arrow=document.createElement('span');arrow.className='sort-arrow';arrow.textContent='↕';button.append(arrow);button.onclick=()=>chooseFundSort(key);th.append(button);}else th.textContent=label;tr.append(th);
 }
 head.append(tr);
}
window.chooseFundSort=chooseFundSort;
function chooseFundSort(key){fundSort.dir=fundSort.key===key&&fundSort.dir==='asc'?'desc':'asc';fundSort.key=key;renderFundRows();}
function renderFundRows(){
 buildFundHeader();
 const body=fund$('fundRows');if(!body)return;body.replaceChildren();
 const sorted=[...fundRows].sort((a,b)=>{
  const key=fundSort.key;if(!key)return 0;
  const av=key==='ticker'?a.ticker:key==='region'?(a.region||''):key==='currentPct'?a.current_pct_change:key==='drawdown'?a.drawdown_pct:a.dividend_yield_pct;
  const bv=key==='ticker'?b.ticker:key==='region'?(b.region||''):key==='currentPct'?b.current_pct_change:key==='drawdown'?b.drawdown_pct:b.dividend_yield_pct;
  const numeric=key!=='ticker'&&key!=='region',am=numeric&&!fundValid(av),bm=numeric&&!fundValid(bv);
  if(am||bm)return am===bm?0:(am?1:-1);
  const p=numeric?av-bv:String(av).localeCompare(String(bv),'en',{numeric:true,sensitivity:'base'});
  return (fundSort.dir==='asc'?p:-p)||a.ticker.localeCompare(b.ticker);
 });
 for(const q of sorted){
  const tr=document.createElement('tr');tr.dataset.ticker=q.ticker;
  const link=document.createElement('a');link.href='https://finance.yahoo.com/quote/'+encodeURIComponent(q.ticker)+'/';link.target='_blank';link.rel='noopener noreferrer';link.textContent=q.ticker;fundCell(tr,'').append(link);
  fundCell(tr,q.region||'');
  const name=fundCell(tr,(q.name||q.ticker)+(q.currency?' ('+q.currency+')':''));const note=document.createElement('small');note.className='row-note';note.textContent=q.refresh_error?'Refresh failed · '+fundTime(q.price_as_of):q.price_as_of?'Market time: '+fundTime(q.price_as_of):'Price pending';name.append(note);
  fundCell(tr,fundFmt(q.prev_close));fundCell(tr,fundPct(q.prev_day_pct_change),fundClass(q.prev_day_pct_change));fundCell(tr,fundFmt(q.current_price));fundCell(tr,fundPct(q.current_pct_change),fundClass(q.current_pct_change));fundCell(tr,fundFmt(q.ath));fundCell(tr,fundPct(q.drawdown_pct),fundClass(q.drawdown_pct));fundCell(tr,fundValid(q.dividend_per_share)?Number(q.dividend_per_share).toFixed(4):'—');fundCell(tr,fundValid(q.dividend_yield_pct)?Number(q.dividend_yield_pct).toFixed(2)+'%':'—');body.append(tr);
 }
 const count=fundRows.length;fund$('fundCount').textContent='Total Funds: '+count;
 for(const th of document.querySelectorAll('#fundSection th[data-sort-key]')){const selected=th.dataset.sortKey===fundSort.key;th.setAttribute('aria-sort',selected?(fundSort.dir==='asc'?'ascending':'descending'):'none');th.querySelector('.sort-arrow').textContent=selected?(fundSort.dir==='asc'?'▲':'▼'):'↕';}
}
function exportFunds(){
 if(!fundRows.length){fund$('status').textContent='No fund data loaded yet.';return;}
 const headers=['Ticker','Region / Market','Fund Name','Prev Day Close','Prev Day % Chg','Current Price','Current % Chg','All-Time High','Drawdown %','Dividend / Share','Dividend Yield %'];
 const table='<table><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr>'+fundRows.map(q=>'<tr>'+[q.ticker,q.region,q.name,q.prev_close,q.prev_day_pct_change,q.current_price,q.current_pct_change,q.ath,q.drawdown_pct,q.dividend_per_share,q.dividend_yield_pct].map(v=>'<td>'+String(v??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</td>').join('')+'</tr>').join('')+'</table>';
 const blob=new Blob(['<html><body>'+table+'</body></html>'],{type:'application/vnd.ms-excel'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='funds-monitor.xls';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function refreshFunds(){
 if(fundRunning)return;fundRunning=true;
 try{const loaded=await loadFundsData();fundRows=loaded.rows;renderFundRows();fund$('reference-time').textContent=fundTime(loaded.market.last_check_completed_at||loaded.market.generated_at);fund$('tracked')?.replaceChildren();fund$('status').textContent='Latest fund data loaded. Last refresh & check completed: '+fund$('reference-time').textContent+'.';}
 catch(error){fund$('status').textContent=error.message;}
 finally{fundRunning=false;}
}
buildFundHeader();fund$('exportExcelButton')?.addEventListener('click',exportFunds);refreshFunds();
