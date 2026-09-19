# Polymarket Trading Panel Chrome extension

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this `trading-panel-extension` folder.
5. Pin **Polymarket Trading Panel** to the toolbar.
6. After installing or updating the unpacked extension, click its reload button on
   `chrome://extensions`, then reload the target browser tab.

The native panel appears automatically on `https://upordown.pro/polymarket/live*`,
including `/live2/` and the root `https://upordown.pro/live3` endpoint. On
UpOrDown, it reads the final URL slug,
uses Gamma only to discover the condition ID, and verifies the exact binary
market, outcome names, token IDs, and prices against the public CLOB API. An
event URL is accepted only when its slug exactly identifies a market or the
event has one unambiguous open CLOB market. Otherwise the panel displays
`unavailable` and trading stays disabled. UpOrDown pages continue to read the
active market slug from the live card. After resolving a market, the panel
subscribes both outcome token IDs to Polymarket's public CLOB market WebSocket.
The live display and both buy buttons show each outcome's current best ask and
update whenever the order book changes; the feed reconnects automatically.

## User interface

The panel is arranged from top to bottom as follows:

- The header shows the extension logo, detected market slug, Trading Bridge
  connection indicator, and current pUSD balance. The gear opens Trading Bridge
  settings. The minus button minimizes the floating panel; in Side Panel mode,
  the same control is an × button that removes Side Panel mode.
- **Live price** shows the current best ask for both verified market outcomes.
  The outcome labels come from the market rather than being fixed to UP and
  DOWN.
- The mode tabs select **M**, **L**, **Q**, **MU**, **M-TP**, **SQ**, or **Mint**.
  The form immediately below displays only the fields and controls used by the
  selected mode.
- The two large outcome buttons show the latest best ask and submit the selected
  mode's order. They remain disabled until a market is resolved and the Trading
  Bridge is connected.
- The status line reports connection, validation, order progress, success, and
  failure messages. Successes are green and failures are red.
- **Current trades** contains the active market's positions and open orders.
  **Refresh** reloads the account data. Position rows show token quantity,
  average price, executable live value, and the available sell controls. Order
  rows provide the applicable cancel or update control.
- The current-market summary shows mint cost for balanced complete sets,
  executable sell value, estimated profit or loss, visible-depth coverage, and
  **Sell all current market**.
- The footer shows each subscribed outcome's best bid, best ask, and spread.

Drag the panel by its header to position it anywhere in the browser window.
Resize it from the handle in its bottom-right corner.
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
logic and `content.css` contains its styles. Panel position, size, connection,
and order settings are stored locally in Chrome.
Panel, popup, and settings text uses the extension's enlarged UI scale,
including compact position summaries and live spread values.

## Trading Bridge companion

Trading and token operations require the separately installed **Trading
Bridge** companion. It is operated by the user and may run on the same computer
as the extension or on a remote machine controlled by the user. The Bridge
holds the trading credentials, signs requests, and exposes the HTTP API and
WebSocket connections consumed by this extension.

Running the Bridge locally is appropriate only where the user is permitted to
access Polymarket. The extension and Bridge are not intended to bypass regional
restrictions. Users are responsible for complying with applicable laws,
Polymarket's terms, and local access requirements.

Open **Trading Bridge settings** from the panel header, the extension popup, the
extension icon's context menu, or Chrome's extension details page. The HTTP API
URL and WebSocket URL are stored in `chrome.storage.local`. Saving or testing
requests Chrome host access only when the configured origins are not already
declared in the manifest.

The settings page also shows every current open CLOB order returned by the
Trading Bridge. It requests `orders_open` without market filters and refreshes
the list while the page remains open.

## Trading modes

The panel provides eight modes. Most modes use an outcome button to submit the
configured order for that outcome; SYM submits both outcomes together:

- **M (Market)** submits a fill-and-kill market buy with a maximum accepted
  price derived from the selected outcome's live best ask. **Buy min 5.1
  shares** raises the submitted USD value when needed to meet that minimum.
- **L (Limit)** submits a limit entry at the configured price, followed by the
  configured take-profit price when the entry fills. The timeout controls how
  long the advanced limit workflow waits. The submitted value is raised when
  necessary to cover at least 5.1 shares at the entry price.
- **Q (Quick)** snapshots the selected outcome's live best ask when clicked and
  uses it as the limit entry price. The take-profit price is calculated from
  **TP %** and rounded up to two decimal places. Quick mode rounds the contract
  quantity up to a whole number and raises the submitted USD total when needed
  so the marketable buy is at least $1 while retaining the minimum-share
  requirement.
- **MU (Multi-limit)** submits every configured row for the selected outcome.
  Each row has its own entry price, take-profit price, and timeout. Invalid rows,
  including a take-profit price that is not above its entry, are rejected before
  any row is submitted.
- **SYM (Symmetrical advanced)** submits one paired entry ladder to both binary
  outcomes through the Bridge's `order_symetrical_advanced` command. Each row
  supplies a matching entry and take-profit price; the USD amount applies to
  every individual entry and the timeout is shared by the full ladder. Duplicate
  entries and take-profit prices that are not above their entries are rejected.
- **M-TP (Market with take profit)** performs a fill-or-kill market buy and then
  creates a take-profit limit sell from the confirmed fill details, as described
  below.
- **SQ** operates on a paired quantity already held in both outcomes, as
  described below.
- **Mint** creates complete sets through the Trading Bridge, as described below.

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

The **Mint** tab accepts any valid Polymarket market slug. It keeps the slug
synchronized with the active detected market unless it is manually overridden,
and also requests the Trading Bridge's current
time to offer the current BTC 5-minute market plus the next two windows as
shortcuts. Enter the number of complete sets to create and click **Mint complete
set**; the extension forwards the selected slug and share quantity to the Bridge
mint API.

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

Submitting a priced **Limit sell** from a position replaces existing resting
sell orders for the same market and outcome. The extension validates the new
price first, retrieves the current open orders, cancels every matching sell,
and creates the replacement only after all cancellations succeed.

Every listed open sell order also has its own editable price and **Update sell**
button. Updating one row cancels only that order ID and recreates its remaining
unfilled share quantity at the new price; other sell orders are left untouched.
Open buy orders have a **Cancel** button that cancels only the selected order.

The extension requests open positions from the Trading Bridge but displays and
subscribes only positions belonging to the market currently open in the panel.
For each current-market position it uses the returned token/asset ID, or
resolves a missing ID from the market slug and outcome. **Live sell value** is
recalculated on every order-book snapshot and depth change by walking the bids
from highest to lowest for the full position size; limited depth is shown
explicitly.

For balanced minted positions, such as 10 tokens of each outcome, the current
market summary treats each complete set as $1 of mint cost. It compares that
cost with the combined executable value of both outcomes and displays the
estimated profit or loss. **Sell all current market** submits separate FAK
market sells for every held outcome in only the active market. Other markets in
the account are never included.

A compact footer at the bottom lists each current-market outcome's live
best bid (**BUY**, green), best ask (**SELL**, red), and bid/ask spread. It uses
the same order-book stream and updates as snapshots and price changes arrive.
