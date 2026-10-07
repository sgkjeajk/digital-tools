# sgkjeajk Stock and ETF Monitor test guide

Monitor: https://sgkjeajk.github.io/digital-tools/stock-monitor/

Admin: https://sgkjeajk.github.io/digital-tools/market-watch-admin.html

Digital Tools: https://sgkjeajk.github.io/digital-tools/

## Owner access

Open **Owner access — connect GitHub** in Admin. Create a fine-grained token restricted to **sgkjeajk/digital-tools**, with **Contents: read and write** and **Actions: read and write**, and enter it into the password field on the page. Do not send it in chat. The token stays only in that tab's memory and is cleared on Disconnect or reload. It is never embedded in the repository or put into browser storage. The connected Codex GitHub app cannot sign the website in on your behalf.

The public Monitor can be viewed without signing in. Its Refresh Current Price button reloads the latest shared snapshot for unsigned viewers and explicitly says so. A signed-in owner can use that button to request new prices through GitHub Actions. Alternatively, remain signed into Admin and click **Retrieve New Prices**, then refresh the Monitor tab.

## Thorough test

1. Confirm 13 initial enabled tickers, including **ES3.SI — State Street SPDR Straits Times Index ETF**, priced in **SGD**. The other initially tracked instruments use USD. Compare market time with retrieval time; prices may be delayed or from a closed market.
2. In Admin, enter **VTI**, click Add Ticker, then Save Changes. Name, market and ETF classification are automatic. Save commits `data/stock-tickers.json`; no manual Export/Import is needed. Refresh Monitor: VTI should appear, initially with prices pending if the updater is still running.
3. Wait for the [price updater](https://github.com/sgkjeajk/digital-tools/actions/workflows/stock-monitor.yml), then refresh Monitor again to view the new prices. GitHub Actions queueing can take several minutes; a queued request does not imply new prices have already arrived.
4. Disable VTI and Save; refresh Monitor and verify it is hidden. Enable and Save; verify it returns.
5. Edit VTI to D05.SI and Save. Verify Singapore/Stock metadata and that the Monitor replaces VTI with D05.SI. After the updater finishes, its prices should be SGD.
6. Delete D05.SI and Save. Refresh Monitor and verify removal.
7. Try adding SPY twice and a ticker containing a space: both should be rejected. Unknown well-formed symbols use a GitHub Actions metadata lookup; an invalid symbol must be rejected without creating a ticker. An available `9988.HK` lookup should return Alibaba, HKSE, Stock. Lookups can take minutes and require Actions permission.
8. Add a draft ticker, then Cancel. Verify the unsaved change disappears. Reload Admin and reconnect; saved configuration should remain, while the credential should be gone.
9. Export Configuration as an optional backup. Import it after changing the draft, confirm replacement, then Save Changes. Verify the Monitor uses the restored shared list. Invalid JSON must leave the list unchanged.
10. Open two Admin tabs with the same starting revision. Save in one. A subsequent save in the other must reject the stale revision; reload before retrying.
11. Retrieve New Prices from signed-in Admin, or sign into Monitor and use Refresh Current Price. Check the queued status and wait for the correlated snapshot. If a provider fails, saved prices retain their own timestamps and failure notes appear. A new snapshot generation time is not a successful price timestamp.
12. Check desktop and mobile: swipe the wide tables sideways to see price columns or Admin Enabled/Actions. ETF entries precede Stocks and tickers sort A–Z.
13. Return the test list to your preferred configuration and Save. The shipped STI entry is not protected from deliberate owner deletion.

## Architecture and limitations

Both pages read the shared files through GitHub's repository API, avoiding a delay caused by the static Pages copy being rebuilt. Admin uses the Contents API with SHA/revision conflict checks. A configuration commit automatically triggers `stock-monitor.yml`. The updater writes `market-data.json` and the legacy compatibility file `data/stock-monitor.json` using GitHub Actions. Public API rate limits are lower than authenticated limits; if you hit a limit, connect as owner or wait for its reset.

Scheduled main runs are 08:00/14:00/20:00 SGT. Backups are 10:00/12:00/16:00/22:00/00:00 SGT. GitHub may delay scheduled or manually requested runs. The token needs Contents write for Save and Actions write for manual price/metadata requests; signing in with insufficient permissions will produce an explicit error.

Ticker metadata uses a dated directory for known US and selected Singapore symbols. Other metadata and prices are obtained server-side by the updater from Yahoo without an API key. Provider availability and historical coverage can change. ATH is the maximum available daily high since 1 January 2000. The banner uses the existing market illustration while retaining the reference layout and colours.

Before deployment, 28 hosted browser checks passed with explicitly simulated GitHub responses. Real provider retrieval succeeded for all 13 instruments, including STI; this does not by itself prove a signed-in browser save with your own token. Your owner's sign-in and permission setup must be tested using the steps above. No static Admin password can authorize a repository write.
