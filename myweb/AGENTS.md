# Page-specific maintenance instructions

## KWC admin links — explicit owner requirement (2026-10-21)

- Only `myweb/kwc.html` has the bottom admin hyperlinks: “Admin Stock Monitor Refresh” and “Admin What's On”.
- Preserve these links when updating, redesigning, syncing or regenerating KWC.
- Do not copy or replicate these links into `myweb/syc.html`, `myweb/klz.html`, any `index.html`, or any other page. Do not overwrite KWC with another portal page and lose these links.
- Stock monitor admin target: `../market-watch-admin.html#adminRefreshPrices`. This opens the existing admin refresh controls; clicking the hyperlink itself does not run a refresh.
- What's On admin target: `https://myai118.github.io/EverydayCompass/singapore-whats-on.html#admin-whats-on`. This opens its existing settings panel after source configuration loads.
- The public What's On page in `myai118/EverydayCompass` must have no bottom-left settings dot or visible settings hyperlink. Keep its settings panel accessible through the KWC link.
- Do not remove or broaden this exception unless the owner explicitly requests it. Existing admin authentication remains in place.

## KWC admin password prompt (owner request, 2026-10-21)

- Apply only to the two admin links in `myweb/kwc.html`; do not replicate to sibling pages.
- Prompt for the case-sensitive password `kwc` on every click. Do not remember successful access.
- A wrong entry or cancellation locks both admin links for the current visit. Reload must retain the lock; leaving the page and re-entering resets it, including browser Back navigation.
- Keep the real destinations in data attributes so the normal anchor action cannot bypass the prompt when JavaScript is unavailable or via a middle click.
- This is a browser-side deterrent to accidental access, not server-side access control. Direct admin addresses and source code remain accessible; preserve the existing authentication required for admin operations.
