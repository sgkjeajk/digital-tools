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
        body=r.read()
        if body.startswith(b'\x1f\x8b'):
            import gzip
            body=gzip.decompress(body)
        return body.decode('utf-8')

def page(ticker):
    return fetch('https://finance.yahoo.com/quote/'+urllib.parse.quote(ticker)+'/').replace('\\"','"')

def lookup(ticker):
    ticker=symbol(ticker)
    if ticker not in CATALOG:
        data=page_quote(ticker)
        kind=data.get('quoteType')
        name=data.get('longName') or data.get('shortName')
        market=data.get('fullExchangeName') or data.get('exchange')
        if kind not in ('ETF','EQUITY') or not name or not market:
            raise ValueError('No verified Stock/ETF metadata on webpage.')
        return {'ticker':ticker,'name':name,'region':market,'type':'ETF' if kind=='ETF' else 'Stock','metadata_source':'Yahoo Finance quote webpage'}
    x=CATALOG[ticker]
    return {'ticker':ticker,'name':x['name'],'region':x['market'],'type':x['type'],'metadata_source':x['source']}

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

def page_quote(ticker):
    text=page(ticker)
    matches=[]
    for match in re.finditer(r'\{"quoteResponse"',text):
        try:
            payload=json.JSONDecoder().raw_decode(text[match.start():])[0]
            matches.extend(q for q in payload['quoteResponse']['result'] if q.get('symbol','').upper()==ticker)
        except (ValueError,KeyError):
            continue
    if not matches: raise ValueError('No exact-symbol quote on webpage')
    data=matches[0]
    return data

def quote(ticker):
    data=page_quote(ticker)
    def raw(field):
        value=data.get(field)
        value=value.get('raw') if isinstance(value,dict) else value
        if not finite(value): raise ValueError('Webpage quote field unavailable: '+field)
        return value
    cur,prev,stamp=raw('regularMarketPrice'),raw('regularMarketPreviousClose'),raw('regularMarketTime')
    if cur<=0 or prev<=0: raise ValueError('Invalid webpage quote')
    currency=data.get('currency')
    return {'current_price':cur,'prev_close':prev,'current_pct_change':percentage(cur,prev),'price_as_of':dt.datetime.fromtimestamp(stamp,dt.timezone.utc).isoformat(),'source':'Yahoo Finance quote webpage','price_retrieved_at':now(),**({'currency':currency} if currency else {})}

def retrieve(x,old,history=False):
    result={**old,**x}
    try:
        result.update(quote(x['ticker']))
        result['refresh_error']=None
        # Historical data is never requested. Preserve its original retrieval timestamp.
        if finite(result.get('ath')):
            if result['current_price']>result['ath']:
                result['ath']=result['current_price']
                result['ath_source']='Observed new high from current-price scrape'
            result['drawdown_pct']=percentage(result['current_price'],result['ath'])
        else:
            result['drawdown_pct']=None
            result['ath_error']='No saved ATH available; historical retrieval is disabled.'
    except Exception as error:
        result['refresh_error']='Webpage scraping failed; retained saved price and timestamp. '+str(error)
    return result

def refresh(history=False):
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
