# Trading Bridge integration

The browser extension gets account and trade information from a user-operated
Trading Bridge WebSocket:

```text
wss://<bridge-host>:<websocket-port>
```

It does not retrieve account trades directly from Polymarket. The extension
polls the configured Trading Bridge every 1.5 seconds.

The companion must be installed and operated by the user. It can run locally
where the user is permitted to access Polymarket, or on a remote machine under
the user's control. It is not intended to bypass regional restrictions.

## Request and response protocol

Each request contains a unique ID, a command, and its parameters:

```json
{
  "id": "other-app-1712345678901-1",
  "command": "positions_open",
  "params": {}
}
```

The server response uses the same request ID:

```json
{
  "id": "other-app-1712345678901-1",
  "ok": true,
  "response": {
    "body": {}
  }
}
```

The useful result may be in `response.body` or directly in `response`.

An unsuccessful response can contain an error in `error.message`, `response.body.message`, or `response.body.error`.

The server can also send a message with `type: "welcome"`. This is informational and does not correspond to a request.

## Commands used for account data

### Current positions

```json
{
  "command": "positions_open",
  "params": {
    "slug": "btc-updown-5m-1712345700"
  }
}
```

The extension expects the returned positions in `positions`:

```json
{
  "positions": [
    {
      "slug": "btc-updown-5m-1712345700",
      "outcome": "Up",
      "tokenId": "12345678901234567890",
      "size": 12.5,
      "avgPrice": 0.54,
      "currentValue": 7.1
    }
  ]
}
```

These are currently held positions created by filled orders. They are not a historical list of every fill.
The extension requests the complete position list by omitting a slug. Each row
should include `tokenId` (the aliases `token_id`, `assetId`, and `asset_id` are
also accepted). If it is omitted, the extension resolves the token from the
position's `slug` and `outcome`. The public CLOB order-book depth, rather than
`currentValue`, is used for the displayed live liquidation value.

### Open orders

The trading panel requests each outcome separately for its active market:

```json
{
  "command": "orders_open",
  "params": {
    "slug": "btc-updown-5m-1712345700",
    "outcome": "Up"
  }
}
```

```json
{
  "command": "orders_open",
  "params": {
    "slug": "btc-updown-5m-1712345700",
    "outcome": "Down"
  }
}
```

The result can be an array directly or an object containing `orders`:

```json
{
  "orders": [
    {
      "id": "order-id",
      "slug": "btc-updown-5m-1712345700",
      "outcome": "Up",
      "side": "buy",
      "price": 0.52
    }
  ]
}
```

An order ID may be returned as `id`, `order_id`, `orderId`, `orderID`, or `hash`.

While the settings page is open, it requests all current CLOB orders every 1.5
seconds by omitting the market filters:

```json
{
  "command": "orders_open",
  "params": {}
}
```

The Bridge should return every open order for the configured account. The
settings page accepts the same array and `{ "orders": [...] }` response shapes.

### Balance

```json
{
  "command": "balances",
  "params": {}
}
```

The extension reads the pUSD balance from:

```text
balances.pUSD.balance
```

## Open orders versus filled trades

- `orders_open` returns orders that are still resting/open, including orders that may be partially filled.
- `positions_open` returns positions currently owned as a result of fills.
- The extension does not call a historical fills or completed-trades command.
- An order disappearing from `orders_open` does not prove that it filled; it may have been cancelled.
- Comparing position snapshots can suggest that a fill happened, but it is not a reliable historical record because positions can be aggregated, reduced, or sold.

For reliable completed-trade information, the server should expose a dedicated command such as `fills` or `trades`, or publish fill events containing at least:

```json
{
  "tradeId": "...",
  "orderId": "...",
  "slug": "...",
  "outcome": "Up",
  "side": "buy",
  "shares": 10,
  "price": 0.54,
  "filledAt": "2026-07-21T12:34:56.000Z"
}
```

No such history command or event is used by the current extension.

## Immediate market-order fill information

After submitting a market order, the command response can contain immediate execution information. The extension reads matched shares from:

```text
postSubmitStatus.order.size_matched
```

It determines the average fill price in this order:

1. `response.makingAmount` and `response.takingAmount`
2. `postSubmitStatus.order.average_price`
3. `postSubmitStatus.order.avg_price`
4. `postSubmitStatus.order.price`
5. As a fallback, submitted USD divided by matched shares

This only describes the order that was just submitted. It does not provide general fill history.

## Reusable JavaScript client

This example works in environments that provide the standard `WebSocket` API. For Node.js versions without a global `WebSocket`, install and import a WebSocket library.

```js
const bridgeWebSocketUrl = "wss://<bridge-host>:<websocket-port>";
const socket = new WebSocket(bridgeWebSocketUrl);
const pending = new Map();
let sequence = 0;

socket.addEventListener("message", event => {
  const message = JSON.parse(event.data);

  if (message.type === "welcome") return;

  const request = pending.get(message.id);
  if (!request) return;

  clearTimeout(request.timeout);
  pending.delete(message.id);

  if (message.ok) {
    request.resolve(message.response?.body ?? message.response);
  } else {
    request.reject(new Error(
      message.error?.message ||
      message.response?.body?.message ||
      message.response?.body?.error ||
      "Trading command failed"
    ));
  }
});

function command(name, params = {}) {
  return new Promise((resolve, reject) => {
    if (socket.readyState !== WebSocket.OPEN) {
      reject(new Error("Trading socket is not connected"));
      return;
    }

    const id = `other-app-${Date.now()}-${++sequence}`;
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${name} timed out`));
    }, 60_000);

    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, command: name, params }));
  });
}

async function getCurrentTrades(slug) {
  const [positionsResult, upResult, downResult] = await Promise.all([
    command("positions_open"),
    command("orders_open", { slug, outcome: "Up" }),
    command("orders_open", { slug, outcome: "Down" })
  ]);

  const normalizeOrders = result =>
    Array.isArray(result) ? result : result?.orders ?? [];

  return {
    positions: positionsResult?.positions ?? [],
    openOrders: [
      ...normalizeOrders(upResult),
      ...normalizeOrders(downResult)
    ]
  };
}

socket.addEventListener("open", async () => {
  try {
    const trades = await getCurrentTrades(
      "btc-updown-5m-1712345700"
    );
    console.log(trades);
  } catch (error) {
    console.error(error);
  }
});
```

To mirror the extension, call `getCurrentTrades(slug)` every 1.5 seconds and prevent a new refresh from starting while the previous refresh is still running.

## Source in the extension

The WebSocket connection and request protocol are implemented in `trading-panel-extension/content.js`. The account refresh uses these commands:

```js
tradeCommand("balances")
tradeCommand("positions_open")
tradeCommand("orders_open", { slug, outcome: "Up" })
tradeCommand("orders_open", { slug, outcome: "Down" })
```

The settings page independently calls `orders_open` with empty parameters to
display the complete account-wide list.
