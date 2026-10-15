"""Dispatch one dividend retry when the morning price checker finds a failed run."""
import datetime as dt
import json
import os
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

SGT = ZoneInfo('Asia/Singapore')

def singapore_hour(moment=None):
    moment = moment or dt.datetime.now(dt.timezone.utc)
    if moment.tzinfo is None: moment = moment.replace(tzinfo=dt.timezone.utc)
    return moment.astimezone(SGT).hour

def should_retry(runs, hour):
    if hour != 8: return False
    if any(run.get('status') in ('queued', 'in_progress') for run in runs): return False
    completed=[run for run in runs if run.get('status') == 'completed']
    latest=max(completed,key=lambda run:run.get('created_at',''),default=None)
    return bool(latest and latest.get('conclusion') == 'failure')

def api(method,url,token,body=None):
    headers={'Accept':'application/vnd.github+json','Authorization':'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'}
    data=None if body is None else json.dumps(body).encode('utf-8')
    request=urllib.request.Request(url,data=data,headers=headers,method=method)
    with urllib.request.urlopen(request,timeout=30) as response:
        text=response.read().decode('utf-8'); return json.loads(text) if text else {}

def run():
    token=os.environ.get('GH_TOKEN','').strip(); repo=os.environ.get('REPO','').strip(); workflow=os.environ.get('DIVIDEND_WORKFLOW','dividend-checker.yml').strip()
    hour=singapore_hour()
    if not token or not repo: print('Dividend recovery skipped: GitHub API settings are missing.'); return False
    if hour != 8: print(f'Dividend recovery skipped: current Singapore hour is {hour:02d}:xx.'); return False
    base=f'https://api.github.com/repos/{repo}/actions/workflows/{workflow}'
    try:
        runs=api('GET',base+'/runs?per_page=20',token).get('workflow_runs',[])
        if not should_retry(runs,hour): print('Dividend recovery skipped: no failed, idle dividend run requires retry.'); return False
        api('POST',base+'/dispatches',token,{'ref':'main'})
        print('Dividend recovery dispatched one workflow retry.'); return True
    except (urllib.error.URLError,urllib.error.HTTPError,ValueError,KeyError) as error:
        print('Dividend recovery check failed safely:',error); return False

if __name__=='__main__': run()

