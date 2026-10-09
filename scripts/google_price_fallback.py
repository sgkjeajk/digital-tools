"""Google Finance rendered individual ticker quote; invoked only after both Yahoo routes fail."""
import datetime as dt
import json
import re
import sys
from playwright.sync_api import sync_playwright

EXCHANGES={'SPY':'NYSEARCA','VOO':'NYSEARCA','VTI':'NYSEARCA','VUG':'NYSEARCA','SHEL':'NYSE'}
def google_symbol(ticker):
    return ticker[:-3]+':SGX' if ticker.endswith('.SI') else ticker+':'+EXCHANGES.get(ticker,'NASDAQ')

def parse_quote(body,ticker):
    sym=google_symbol(ticker)
    pattern=r'(?m)^'+re.escape(sym)+r'\s*\n(?:add\s*\nAdd to list\s*\n)?([^\n]{2,140})\s*\n([\$€£]?\s*[\d,]+(?:\.\d+)?)\s*\n'
    match=re.search(pattern,body)
    if not match: raise ValueError('Exact exchange-qualified ticker primary quote not found')
    price=float(re.sub(r'[^\d.]','',match.group(2)))
    if not 0<price<1e7: raise ValueError('Invalid primary price')
    near=body[match.end():match.end()+350]
    currency='SGD' if ticker.endswith('.SI') else 'USD'
    if not re.search(r'\b'+currency+r'\b',near):raise ValueError('Primary quote currency mismatch')
    # Quote timestamp must come from the same primary price block, never after-hours.
    stamp=re.search(r'\b([A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M\s*UTC[+-]\d{1,2}(?::\d{2})?)\b',near)
    if not stamp:raise ValueError('Original market quote time absent')
    raw=stamp.group(1).replace(',','')
    datepart,zonepart=raw.rsplit(' UTC',1)
    datepart=re.sub(r'\s+',' ',datepart.strip())
    fmt='%b %d %Y %I:%M:%S %p' if datepart.count(':')==2 else '%b %d %Y %I:%M %p'
    local=dt.datetime.strptime(datepart,fmt)
    sign=1 if zonepart[0]=='+' else -1
    parts=zonepart[1:].split(':')
    offset=dt.timedelta(hours=int(parts[0]),minutes=int(parts[1]) if len(parts)>1 else 0)
    quote_time=local.replace(tzinfo=dt.timezone(sign*offset)).astimezone(dt.timezone.utc)
    age=dt.datetime.now(dt.timezone.utc)-quote_time
    if age < dt.timedelta(minutes=-5) or age > dt.timedelta(days=7):
        raise ValueError('Google quote timestamp invalid or stale')
    return {'current_price':price,'price_as_of':quote_time.isoformat(),
            'currency':currency,'source':'Google Finance individual ticker (rendered)',
            'price_retrieved_at':dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00','Z')}

def retrieve(ticker):
    sym=google_symbol(ticker)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
        try:
            page=browser.new_page(locale='en-US')
            response=page.goto('https://www.google.com/finance/quote/'+sym+'?hl=en',wait_until='domcontentloaded',timeout=25000)
            if not response or response.status!=200:raise ValueError('Google Finance page unavailable')
            page.wait_for_timeout(1300)
            if sym not in page.url:raise ValueError('Google Finance ticker URL mismatch')
            return parse_quote(page.locator('body').inner_text(timeout=10000),ticker)
        finally:browser.close()

if __name__=='__main__':
    try:print(json.dumps(retrieve(sys.argv[1])))
    except Exception as e:
        print(json.dumps({'error':str(e)}))
        sys.exit(1)
