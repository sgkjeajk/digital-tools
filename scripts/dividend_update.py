"""Dividend-only retrieval. Writes dividend-data.json without modifying market prices."""
import concurrent.futures
import datetime as dt
import json
import urllib.parse
from market_service import ROOT, atomic, fetch, finite, now, read_config, validate

FIELDS = ('dividend_per_share','dividend_yield_pct','dividend_declaration_date','ex_dividend_date','dividend_payment_date')

def date_value(value):
    if isinstance(value,dict):
        value=value.get('raw')
    if isinstance(value,(int,float)) and value>0:
        return dt.datetime.fromtimestamp(value,dt.timezone.utc).strftime('%d %b %Y')
    if isinstance(value,str):
        try: return dt.date.fromisoformat(value[:10]).strftime('%d %b %Y')
        except ValueError: pass
    return None

def get_one(ticker, price):
    stamp=now()
    result={'ticker':ticker,'dividend_retrieved_at':stamp}
    today=dt.datetime.now(dt.timezone.utc)
    first=int((today-dt.timedelta(days=400)).timestamp())
    last=int(today.timestamp())
    errors=[]
    for host in ('query1.finance.yahoo.com','query2.finance.yahoo.com'):
        try:
            url='https://'+host+'/v8/finance/chart/'+urllib.parse.quote(ticker)+'?period1='+str(first)+'&period2='+str(last)+'&interval=1d&events=div'
            data=json.loads(fetch(url))
            charts=data.get('chart',{}).get('result') or []
            if len(charts)!=1: raise ValueError('No unique chart')
            events=(charts[0].get('events') or {}).get('dividends') or {}
            rows=sorted((int(v['date']),float(v['amount'])) for v in events.values() if finite(v.get('amount')) and float(v['amount'])>=0)
            cutoff=int((today-dt.timedelta(days=365)).timestamp())
            annual=sum(amount for t,amount in rows if t>=cutoff)
            result['dividend_per_share']=rows[-1][1] if rows else None
            result['dividend_yield_pct']=annual/price*100 if rows and finite(price) and price>0 else None
            result['ex_dividend_date']=date_value(rows[-1][0]) if rows else None
            result['dividend_declaration_date']=None
            result['dividend_payment_date']=None
            # Calendar events are not universally provided by Yahoo Finance.
            for summary_host in ('query1.finance.yahoo.com','query2.finance.yahoo.com'):
                try:
                    summary_url='https://'+summary_host+'/v10/finance/quoteSummary/'+urllib.parse.quote(ticker)+'?modules=calendarEvents'
                    summary=json.loads(fetch(summary_url))
                    records=(summary.get('quoteSummary',{}).get('result') or [])
                    if len(records)!=1: continue
                    div=(records[0].get('calendarEvents') or {}).get('dividend') or {}
                    result['ex_dividend_date']=date_value(div.get('exDividendDate')) or result['ex_dividend_date']
                    result['dividend_payment_date']=date_value(div.get('paymentDate'))
                    result['dividend_declaration_date']=date_value(div.get('declarationDate'))
                    break
                except Exception: continue
            result['dividend_error']=None
            return result
        except Exception as error:
            errors.append(str(error))
    return {'ticker':ticker,'dividend_retrieved_at':stamp,'dividend_error':'Dividend sources unavailable; prior values retained'}

def run():
    cfg=validate(read_config())
    old_path=ROOT/'dividend-data.json'
    old=json.loads(old_path.read_text(encoding='utf-8')) if old_path.exists() else {}
    previous={row['ticker']:row for row in old.get('instruments',[])}
    market_path=ROOT/'market-data.json'
    market=json.loads(market_path.read_text(encoding='utf-8')) if market_path.exists() else {}
    prices={row['ticker']:row.get('current_price') for row in market.get('instruments',[])}
    tickers=[row['ticker'] for row in cfg['instruments'] if row.get('enabled')]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        updates=list(pool.map(lambda ticker:get_one(ticker,prices.get(ticker)),tickers))
    rows=[]
    for update in updates:
        prior=previous.get(update['ticker'],{})
        if update.get('dividend_error'):
            rows.append({**prior,**{k:v for k,v in update.items() if k not in FIELDS}})
        else:
            rows.append({**prior,**update})
    result={'generated_at':now(),'config_revision':cfg.get('revision',0),'instruments':rows}
    atomic(old_path,result)
    print('Dividend refresh completed:',len(rows),'tickers;',sum(bool(x.get('dividend_error')) for x in rows),'unavailable')
    return result

if __name__=='__main__':
    run()
