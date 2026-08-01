# Polymarket Trading Panel Chrome extension

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this `trading-panel-extension` folder.
5. Pin **Polymarket Trading Panel** to the toolbar.
6. On the extension details page, enable **Allow access to file URLs**.
7. After installing or updating the unpacked extension, click its reload button on
   `chrome://extensions`, then reload the target browser tab.

The native panel appears automatically on
`https://upordown.pl/polymarket/live*`, including `/live2/`, and on the root
`https://upordown.pl/live3` endpoint. It reads the active
market slug and current Up price directly from the live card in the open page.
Drag the panel by its header to position it anywhere in the browser window.
Use the minus button to minimize it to the branded logo; the logo can also be
dragged, and clicking it restores the full panel. Its position and minimized
state are remembered across page reloads.
The Side Panel reads the active page through the content-script message bridge
and falls back to a scoped script injection when an already-open tab has not
received the latest content script yet.
When Side Panel mode is disabled, the toolbar icon shows a small confirmation
to add it. Once enabled, clicking the toolbar icon opens Chrome's full-height
Side Panel directly. Its × button removes Side Panel mode and restores the
floating page panel. Right-clicking the extension toolbar icon also provides a
native Chrome menu item to switch between Side Panel and classic floating mode.
There is no embedded website or iframe. `content.js` contains the native trading
logic and `content.css` contains its styles. Trading connects only to the 212
server; panel position, size, and order settings are stored locally in Chrome.

Open **Server settings** from the panel header, the extension popup, the
extension icon's context menu, or Chrome's extension details page. The HTTP API
base URL and trading WebSocket URL are stored in `chrome.storage.local`. Saving
or testing requests Chrome host access only when the configured origins are not
already declared in the manifest.

The **M-TP** mode submits a market buy as fill-or-kill and then places a limit
take-profit sell using the confirmed average fill price and exact filled-share
count. Its TP input is the fallback percentage: both `30` and `0.3` mean 30%.
Optional buy-price exceptions can override it, such as range `20-40` with TP
`50` for confirmed fill prices from 0.20 through 0.40 (inclusive). Add as many
exceptions as needed with the plus button. Invalid or overlapping ranges turn
red and are not saved to Chrome storage. Every M-TP
buy is sized for at least 6 shares: when the entered USD budget is too low, the
extension automatically raises the submitted value enough to cover that target
at the market order's maximum accepted price. If its TP sell-limit request
fails, it tries that sell request up to 5 times with 300 ms between attempts
without repeating the market buy.

Each mode keeps its own amount, so changing the USD value in a trading tab or
the share quantity in Mint does not change the amount saved for the other tabs.

The **Mint** tab requests the 212 server's current time and offers the current
BTC 5-minute market plus the next two windows. Select a market, enter the number
of complete sets to create, and click **Mint UP + DOWN tokens**; the extension
forwards the selected slug and share quantity to the existing 212 mint API.

Quick mode rounds its calculated contract quantity up to a whole number and
raises the submitted USD total when necessary so a marketable buy is always at
least $1.00 while retaining the minimum-share requirement.

The **SQ** mode shows held UP and DOWN contracts and automatically selects the
cheaper outcome: DOWN when the current UP price is above `0.50`, otherwise UP.
Clicking **Go** uses only the paired quantity
`min(available UP, available DOWN)` and market-sells that amount on the cheaper
side. After the server confirms the actually matched quantity and average
execution price, SQ derives the opposite-side base price as
`1 - average sold price` and places a limit sell for exactly the same confirmed
quantity on the opposite side. Its price is rounded up to two decimals using
`ceil(opposite price * (1 + TP percentage) * 100) / 100`. Contracts already
reserved by visible open sell orders are excluded from each available count.
