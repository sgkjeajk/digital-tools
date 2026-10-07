"""Actions entry point: price snapshot or one exact-symbol metadata lookup."""
import os
from market_service import ROOT,atomic,lookup,now,refresh,symbol,validate,read_config

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
        validate(read_config())
        data=refresh(history=False);data['request_id']=request_id;data['workflow_run']=os.environ.get('GITHUB_RUN_ID')
        atomic(ROOT/'market-data.json',data);atomic(ROOT/'data/stock-monitor.json',data)
        print('Price refresh completed:',len(data['instruments']),'tickers;',sum(bool(x.get('refresh_error')) for x in data['instruments']),'unavailable prices')
