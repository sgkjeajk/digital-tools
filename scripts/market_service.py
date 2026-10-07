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
    hosts=('sg.finance.yahoo.com','finance.yahoo.com') if ticker.endswith('.SI') else ('finance.yahoo.com','sg.finance.yahoo.com')
    for host in hosts:
        try:
            return fetch('https://'+host+'/quote/'+urllib.parse.quote(ticker)+'/').replace('\\"','"')
        except Exception as error:
            last=error
    raise last

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

def page_quote(ticker,text=None):
    text=page(ticker) if text is None else text
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

def historical_high(ticker):
    from html.parser import HTMLParser
    class Rows(HTMLParser):
        def __init__(self): super().__init__();self.rows=[];self.row=None;self.cell=None
        def handle_starttag(self,tag,attrs):
            if tag=='tr': self.row=[]
            if tag=='td' and self.row is not None: self.cell=[]
        def handle_data(self,data):
            if self.cell is not None: self.cell.append(data)
        def handle_endtag(self,tag):
            if tag=='td' and self.cell is not None:
                self.row.append(''.join(self.cell).strip());self.cell=None
            if tag=='tr' and self.row is not None:
                self.rows.append(self.row);self.row=None
    end=int(dt.datetime.now(dt.timezone.utc).timestamp())
    hosts=('sg.finance.yahoo.com','finance.yahoo.com','uk.finance.yahoo.com','ca.finance.yahoo.com','au.finance.yahoo.com') if ticker.endswith('.SI') else ('finance.yahoo.com','sg.finance.yahoo.com')
    for host in hosts:
        try:
            text=fetch('https://'+host+'/quote/'+urllib.parse.quote(ticker)+'/history/?period1=946684800&period2='+str(end)).replace('\\"','"')
            metadata=page_quote(ticker,text)
            parser=Rows();parser.feed(text)
            points=[]
            for row in parser.rows:
                if len(row)!=7: continue
                try:
                    date=dt.datetime.strptime(row[0],'%b %d, %Y').date()
                    high=float(row[2].replace(',',''))
                    if date>=dt.date(2000,1,1) and finite(high) and high>0: points.append((date,high))
                except ValueError: continue
            if not points: raise ValueError('No historical daily highs on webpage')
            inception=metadata.get('firstTradeDateMilliseconds')
            if isinstance(inception,dict): inception=inception.get('raw')
            start=max(dt.date(2000,1,1),dt.datetime.fromtimestamp(inception/1000,dt.timezone.utc).date()) if finite(inception) else dt.date(2000,1,1)
            oldest,newest=min(d for d,h in points),max(d for d,h in points)
            if (oldest-start).days>10: raise ValueError('Historical table does not reach inception or January 2000')
            if (dt.datetime.now(dt.timezone.utc).date()-newest).days>10: raise ValueError('Historical table is outdated')
            if len(points)<max(1,(newest-oldest).days*0.55): raise ValueError('Historical daily table appears incomplete')
            return {'ath':max(h for d,h in points),'ath_retrieved_at':now(),'ath_error':None,'ath_source':'Yahoo historical webpage daily highs','ath_history_start':oldest.isoformat(),'ath_history_end':newest.isoformat(),'ath_history_rows':len(points)}
        except Exception as error: last=error
    raise last

def previous_day_change(ticker,price_as_of):
    from html import unescape
    from zoneinfo import ZoneInfo
    market_date=dt.datetime.fromisoformat(price_as_of).astimezone(ZoneInfo('Asia/Singapore' if ticker.endswith('.SI') else 'America/New_York')).date()
    end=int(dt.datetime.now(dt.timezone.utc).timestamp())
    hosts=('sg.finance.yahoo.com','finance.yahoo.com','uk.finance.yahoo.com') if ticker.endswith('.SI') else ('finance.yahoo.com','sg.finance.yahoo.com')
    for host in hosts:
        try:
            text=fetch('https://'+host+'/quote/'+urllib.parse.quote(ticker)+'/history/?period1='+str(end-60*86400)+'&period2='+str(end))
            rows=[]
            for tr in re.findall(r'<tr\b[^>]*>(.*?)</tr>',text,re.S):
                cells=[unescape(re.sub(r'<[^>]+>','',v)).strip() for v in re.findall(r'<td\b[^>]*>(.*?)</td>',tr,re.S)]
                if len(cells)!=7: continue
                try:
                    date=dt.datetime.strptime(cells[0],'%b %d, %Y').date()
                    close=float(cells[4].replace(',',''))
                    if date<market_date and finite(close) and close>0: rows.append((date,close))
                except ValueError: continue
            rows=sorted(dict(rows).items(),reverse=True)
            if len(rows)<2: raise ValueError('Two completed previous trading-day closes unavailable')
            return {'prev_day_pct_change':percentage(rows[0][1],rows[1][1]),'prev_day_change_as_of':rows[0][0].isoformat(),'prev_day_change_retrieved_at':now(),'prev_day_change_error':None}
        except Exception as error: last=error
    raise last

def retrieve(x,old,history=False):
    result={**old,**x}
    try:
        result.update(quote(x['ticker']))
        result['refresh_error']=None
        try: result.update(previous_day_change(x['ticker'],result['price_as_of']))
        except Exception as error:
            result['prev_day_pct_change']=None
            result['prev_day_change_error']='Previous trading-day change unavailable: '+str(error)
        # Price-only runs preserve historical data and its original timestamp.
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
    if history:
        try:
            result.update(historical_high(x['ticker']))
            if finite(result.get('current_price')):
                result['ath']=max(result['ath'],result['current_price'])
            result['drawdown_pct']=percentage(result.get('current_price'),result['ath'])
        except Exception as error:
            result['ath_error']='Historical scrape failed; saved ATH and timestamp retained. '+str(error)
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
