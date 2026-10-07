from market_service import ROOT,atomic,refresh
if __name__=='__main__':
 data=refresh();atomic(ROOT/'data/stock-monitor.json',data);print('Shared market snapshot updated.')
