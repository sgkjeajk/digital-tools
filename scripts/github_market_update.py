"""Actions entry point: price snapshot or one exact-symbol metadata lookup."""
import os, json, datetime as dt
from market_service import ROOT,atomic,lookup,now,refresh,symbol,validate,read_config
from market_hours import market_open

FRESH_PRICE_SECONDS = 10 * 60
HEARTBEAT_MIN_SECONDS = 10 * 60

def prices_are_fresh(config, data, at=None, eligible=None):
    """Skip only when every enabled ticker has a recent successful price."""
    if data.get('config_revision') != config.get('revision',0): return False
    active=[x['ticker'] for x in config['instruments'] if x['enabled'] and (eligible is None or x['ticker'] in eligible)]
    if not active: return False
    rows={x['ticker']:x for x in data.get('instruments',[])}
    at=at or dt.datetime.now(dt.timezone.utc)
    for ticker in active:
        row=rows.get(ticker,{})
        if row.get('refresh_error'): return False
        try:
            stamp=dt.datetime.fromisoformat(row['price_retrieved_at'].replace('Z','+00:00'))
            age=(at-stamp).total_seconds()
            if not 0 <= age < FRESH_PRICE_SECONDS: return False
        except (KeyError,ValueError,TypeError): return False
    return True

def recent_check(data, at=None, minimum_seconds=HEARTBEAT_MIN_SECONDS):
    at=at or dt.datetime.now(dt.timezone.utc)
    try:
        stamp=dt.datetime.fromisoformat(data['last_check_completed_at'].replace('Z','+00:00'))
        age=(at-stamp).total_seconds()
        return 0 <= age < minimum_seconds
    except (KeyError,ValueError,TypeError):
        return False

def write_check_heartbeat(config, status, request_id='', history=False, force=False):
    try:
        data=json.loads((ROOT/'market-data.json').read_text(encoding='utf-8'))
    except (OSError,ValueError):
        data={}
    if not force and recent_check(data):
        return data
    stamp=now()
    data.setdefault('ath_since','2000-01-01')
    data.setdefault('instruments',[])
    data.setdefault('source','Yahoo Finance; per-row timestamps and errors apply')
    data['generated_at']=stamp
    data['last_check_completed_at']=stamp
    data['last_check_status']=status
    data['config_revision']=config.get('revision',data.get('config_revision',0))
    data['request_id']=request_id
    data['workflow_run']=os.environ.get('GITHUB_RUN_ID')
    data['ath_refresh_requested']=history
    atomic(ROOT/'market-data.json',data)
    atomic(ROOT/'data/stock-monitor.json',data)
    return data

if __name__=='__main__':
    ticker=os.environ.get('LOOKUP_TICKER','').strip()
    request_id=os.environ.get('REQUEST_ID','')
    if ticker:
        ticker=symbol(ticker)
        try: result={'request_id':request_id,'generated_at':now(),'instrument':lookup(ticker)}
        except ValueError as e: result={'request_id':request_id,'generated_at':now(),'error':str(e)}
        path=ROOT/'data/lookups'/f'{ticker}.json';path.parent.mkdir(parents=True,exist_ok=True);atomic(path,result)
        print('Completed metadata lookup for',ticker)
    else:
        config=read_config()
        validate(config)
        history=os.environ.get('REFRESH_ATH','false').lower()=='true'
        eligible=None
        if os.environ.get('TRIGGER_EVENT')=='schedule' and not history:
            at=dt.datetime.now(dt.timezone.utc)
            eligible={x['ticker'] for x in config['instruments'] if x['enabled'] and market_open(x['ticker'],at)}
            if not eligible:
                write_check_heartbeat(config,'skipped_market_closed',request_id,history)
                print('Skipped scheduled quote scraping: neither SGX nor US regular market is open.')
                raise SystemExit(0)
            try: saved=json.loads((ROOT/'market-data.json').read_text(encoding='utf-8'))
            except (OSError,ValueError): saved={}
            if prices_are_fresh(config,saved,at,eligible):
                write_check_heartbeat(config,'skipped_recent_prices_fresh',request_id,history)
                print('Skipped scraping: all open-market prices were successfully retrieved less than 10 minutes ago.')
                raise SystemExit(0)
        data=refresh(history=history,eligible_tickers=eligible);data['request_id']=request_id;data['workflow_run']=os.environ.get('GITHUB_RUN_ID');data['ath_refresh_requested']=history;data['last_check_completed_at']=data.get('generated_at') or now();data['last_check_status']='prices_refreshed'
        atomic(ROOT/'market-data.json',data);atomic(ROOT/'data/stock-monitor.json',data)
        print('Price refresh completed:',len(data['instruments']),'tickers;',sum(bool(x.get('refresh_error')) for x in data['instruments']),'unavailable prices')
