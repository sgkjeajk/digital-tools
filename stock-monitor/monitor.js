'use strict';
const $=id=>document.getElementById(id), valid=n=>typeof n==='number'&&Number.isFinite(n), fmt=n=>valid(n)?n.toFixed(2):'—', pct=n=>valid(n)?(n>=0?'+':'')+n.toFixed(2)+'%':'—', cls=n=>valid(n)&&n>0?'pos':valid(n)&&n<0?'neg':'';
const sg=t=>t&&!Number.isNaN(Date.parse(t))?new Intl.DateTimeFormat('en-SG',{timeZone:'Asia/Singapore',dateStyle:'medium',timeStyle:'short'}).format(new Date(t))+' SGT':'Not yet retrieved';
let interval, running=false;
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
function render(cfg,data){
 const prices=new Map((data.instruments||[]).map(x=>[x.ticker,x]));const active=cfg.instruments.filter(x=>x.enabled).sort((a,b)=>(a.type==='ETF'?0:1)-(b.type==='ETF'?0:1)||a.ticker.localeCompare(b.ticker));
 $('etfRows').replaceChildren();$('stockRows').replaceChildren();let successful=[];
 for(const x of active){const q=prices.get(x.ticker)||{},tr=document.createElement('tr');tr.dataset.ticker=x.ticker;tr.dataset.region=x.region||'';const tickerCell=cell(tr,'');const tickerLink=document.createElement('a');tickerLink.textContent=x.ticker;tickerLink.href='https://finance.yahoo.com/quote/'+encodeURIComponent(x.ticker)+'/';tickerLink.target='_blank';tickerLink.rel='noopener noreferrer';tickerLink.setAttribute('aria-label',x.ticker+' on Yahoo Finance (opens in a new tab)');tickerCell.append(tickerLink);cell(tr,x.region);const name=cell(tr,x.name+(q.currency?' ('+q.currency+')':''));const note=document.createElement('small');note.className='row-note';note.textContent=q.refresh_error?'Refresh failed · '+sg(q.price_as_of):q.price_as_of?'Market time: '+sg(q.price_as_of):'Price pending';if(q.ath_error)note.textContent+=' · Using saved ATH — latest update failed.';name.append(note);if(q.price_retrieved_at&&!q.refresh_error)successful.push(q.price_retrieved_at);cell(tr,fmt(q.prev_close));cell(tr,pct(q.prev_day_pct_change),cls(q.prev_day_pct_change));cell(tr,fmt(q.current_price));cell(tr,pct(q.current_pct_change),cls(q.current_pct_change));const ath=cell(tr,fmt(q.ath));if(q.ath_error){ath.title=q.ath_error;ath.className='warning';}cell(tr,pct(q.drawdown_pct),cls(q.drawdown_pct));$(x.type==='ETF'?'etfRows':'stockRows').append(tr);}
 for(const [type,id] of [['ETF','etf'],['Stock','stock']]){const count=active.filter(x=>x.type===type).length;$(id+'Count').textContent='Total '+(type==='ETF'?'ETFs':'Stocks')+': '+count;if(!count){const tr=document.createElement('tr');cell(tr,'No enabled '+type+' tickers.').colSpan=9;$(id+'Rows').append(tr);}}
 sortTable('ETF');sortTable('Stock');
 const latestPriceTime=successful.sort().at(-1)||active.map(x=>prices.get(x.ticker)?.price_retrieved_at).filter(Boolean).sort().at(-1);
 $('reference-time').textContent=sg(data.last_check_completed_at||data.generated_at||latestPriceTime);$('tracked').textContent=active.length+' instruments';
 clearInterval(interval);interval=setInterval(()=>refresh(false),Math.max(5,cfg.refreshIntervalMinutes||15)*60000);
 return active.map(x=>prices.get(x.ticker)||{});
}
async function load(){const [cfg,data]=await Promise.all([get('../data/stock-tickers.json'),get('../market-data.json')]);return render(cfg,data);}
async function refresh(){if(running)return;running=true;try{const rows=await load();const failed=rows.filter(x=>x.refresh_error).length;$('status').textContent=failed?failed+' ticker(s) could not be updated; their saved prices and timestamps are retained.':'Latest saved data loaded. Last refresh check completed: '+$('reference-time').textContent+'.';}catch(e){$('status').textContent=e.message;}finally{running=false;}}
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
