"""Shared configuration, provider retrieval and atomic market snapshot. Stdlib only."""
import concurrent.futures, datetime as dt, json, math, os, re, threading, urllib.request, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCK = threading.RLock()
UA = {'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json,text/html'}
CATALOG = {}
for directory_file in (ROOT/'data/symbol-directory').glob('*.json'):
    CATALOG.update(json.loads(directory_file.read_text(encoding='utf-8')))

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00','Z')

def atomic(path, data):
    tmp = path.with_suffix('.tmp')
    with tmp.open('w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, allow_nan=False); f.write('\n'); f.flush(); os.fsync(f.fileno())
    os.replace(tmp, path)

def read_config():
    return json.loads((ROOT/'data/stock-tickers.json').read_text(encoding='utf-8'))

def symbol(value):
    if not isinstance(value,str): raise ValueError('Ticker must be text.')
    value=value.strip().upper()
    if not re.fullmatch(r'[A-Z0-9][A-Z0-9.\-]{0,31}',value) or value[-1] in '.-' or re.search(r'[.\-]{2}',value):
        raise ValueError('Invalid ticker format.')
    return value

def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=12) as r:
        return r.read().decode('utf-8')

def chart(ticker, history=False):
    errors=[]
    query=('period1=946684800&period2='+str(int(dt.datetime.now(dt.timezone.utc).timestamp()))+'&interval=1d') if history else 'range=5d&interval=1d'
    for host in ('query1','query2'):
        try:
            raw=json.loads(fetch(f'https://{host}.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(ticker)}?{query}'))
            result=raw['chart']['result'][0]
            if result['meta'].get('symbol','').upper()!=ticker: raise ValueError('No exact symbol match')
            return result, 'Yahoo '+host
        except Exception as e: errors.append(type(e).__name__)
    raise ValueError('Yahoo chart sources unavailable ('+', '.join(errors)+').')

def lookup(ticker):
    ticker=symbol(ticker)
    if ticker in CATALOG:
        x=CATALOG[ticker]
        return {'ticker':ticker,'name':x['name'],'region':x['market'],'type':x['type'],'metadata_source':x['source']}
    data,source=chart(ticker); m=data['meta']
    if m.get('instrumentType') not in ('ETF','EQUITY'): raise ValueError('Only Stocks and ETFs are supported.')
    name=m.get('longName') or m.get('shortName'); market=m.get('fullExchangeName') or m.get('exchangeName')
    if not name or not market: raise ValueError('Incomplete ticker metadata; cannot add.')
    return {'ticker':ticker,'name':name,'region':market,'type':'ETF' if m['instrumentType']=='ETF' else 'Stock','metadata_source':source+' '+now()}

def validate(data):
    if not isinstance(data,dict) or data.get('version',1)!=1: raise ValueError('Unsupported configuration.')
    entries=data.get('tickers',data.get('instruments'))
    if not isinstance(entries,list) or len(entries)>20: raise ValueError('Expected at most 20 tickers.')
    interval=data.get('refreshIntervalMinutes',15)
    if type(interval)!=int or interval not in (5,10,15,30,60): raise ValueError('Invalid refresh interval.')
    seen=set(); result=[]
    for x in entries:
        if not isinstance(x,dict) or type(x.get('enabled'))!=bool: raise ValueError('Enabled must be true or false.')
        t=symbol(x.get('ticker'))
        if t in seen: raise ValueError('Duplicate ticker: '+t)
        seen.add(t); result.append({**lookup(t),'enabled':x['enabled']})
    result.sort(key=lambda x:(x['type']!='ETF',x['ticker']))
    return {'version':1,'refreshIntervalMinutes':interval,'instruments':result}

def save_config(data):
    validated=validate(data)
    with LOCK:
        old=read_config()
        if data.get('revision')!=old.get('revision',0): raise RuntimeError('Configuration changed in another window. Reload before saving.')
        validated['revision']=old.get('revision',0)+1; validated['saved_at']=now()
        atomic(ROOT/'data/stock-tickers.json',validated)
    return validated

def finite(v):
    return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)

def percentage(a,b):
    return (a/b-1)*100 if finite(a) and finite(b) and b>0 else None

def quote(ticker):
    try:
        d,source=chart(ticker); m=d['meta']; cur=m.get('regularMarketPrice'); prev=m.get('previousClose')
        pairs=[(t,c) for t,c in zip(d.get('timestamp',[]),d['indicators']['quote'][0]['close']) if finite(c)]
        # Daily chart usually includes the current session; use exchange-local session dates.
        offset=m.get('gmtoffset',0); stamp=m.get('regularMarketTime')
        if not finite(stamp): raise ValueError('Quote has no market timestamp')
        session=dt.datetime.fromtimestamp(stamp+offset,dt.timezone.utc).date()
        closed=[c for t,c in pairs if dt.datetime.fromtimestamp(t+offset,dt.timezone.utc).date()<session]
        if closed: prev=closed[-1]
        pp=closed[-2] if len(closed)>1 else None
        if not finite(cur) or cur<=0 or not finite(prev) or prev<=0: raise ValueError('Incomplete price')
        return {'current_price':cur,'prev_close':prev,'prev_day_pct_change':percentage(prev,pp),'current_pct_change':percentage(cur,prev),'currency':m.get('currency'),'price_as_of':dt.datetime.fromtimestamp(stamp,dt.timezone.utc).isoformat(),'source':source,'price_retrieved_at':now()}
    except Exception as primary:
        # Fallback is the public quote page, not a saved value relabelled as fresh.
        text=fetch('https://finance.yahoo.com/quote/'+urllib.parse.quote(ticker)+'/')
        text=text.replace('\\"','"')
        def raw(field):
            match=re.search(r'"'+field+r'"\s*:\s*\{\s*"raw"\s*:\s*([0-9.]+)',text)
            if not match: raise ValueError('Primary and fallback prices unavailable.') from primary
            return float(match.group(1))
        cur,prev,stamp=raw('regularMarketPrice'),raw('regularMarketPreviousClose'),raw('regularMarketTime')
        if cur<=0 or prev<=0: raise ValueError('Invalid fallback quote.')
        return {'current_price':cur,'prev_close':prev,'prev_day_pct_change':None,'current_pct_change':percentage(cur,prev),'currency':None,'price_as_of':dt.datetime.fromtimestamp(stamp,dt.timezone.utc).isoformat(),'source':'Yahoo public quote page fallback','price_retrieved_at':now()}

def retrieve(x,old,history=True):
    result={**old,**x}; result['refresh_error']=None
    try:
        result.update(quote(x['ticker']))
        try:
            if not history and finite(result.get('ath')):
                historical=None
            else:
                historical,_=chart(x['ticker'],True)
            highs=[h for t,h in zip(historical.get('timestamp',[]),historical['indicators']['quote'][0]['high']) if t>=946684800 and finite(h)] if historical else [result['ath']]
            if not highs: raise ValueError('Historical highs unavailable')
            result['ath']=max(highs); result['ath_retrieved_at']=now(); result['ath_error']=None
        except Exception:
            result['ath_error']='ATH refresh unavailable; retained prior ATH if present.'
        if finite(result.get('ath')): result['ath']=max(result['ath'],result['current_price'])
        result['drawdown_pct']=percentage(result['current_price'],result.get('ath'))
    except Exception:
        result['refresh_error']='Price sources unavailable. Saved value retained with its original timestamp.'
    return result

def refresh(history=True):
    with LOCK: cfg=read_config()
    path=ROOT/'market-data.json'
    old=json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
    prior={x['ticker']:x for x in old.get('instruments',[])}
    active=[x for x in cfg['instruments'] if x['enabled']]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        rows=list(pool.map(lambda x:retrieve(x,prior.get(x['ticker'],{}),history),active))
    result={'generated_at':now(),'ath_since':'2000-01-01','config_revision':cfg.get('revision',0),'instruments':rows,'source':'Yahoo Finance; per-row timestamps and errors apply'}
    with LOCK:
        if read_config().get('revision',0)!=cfg.get('revision',0): raise RuntimeError('Configuration changed during refresh; retry.')
        atomic(path,result)
    return result
