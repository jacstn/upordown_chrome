const SERVER_CONFIG_KEY = 'tradingPanelServerConfig';
const form = document.getElementById('server-form');
const apiBaseUrl = document.getElementById('api-base-url');
const tradeSocketUrl = document.getElementById('trade-socket-url');
const test = document.getElementById('test');
const save = document.getElementById('save');
const status = document.getElementById('status');
const refreshOrders = document.getElementById('refresh-orders');
const ordersStatus = document.getElementById('orders-status');
const ordersList = document.getElementById('orders-list');
let ordersSocket = null;
let ordersReconnectTimer = 0;
let ordersRefreshTimer = 0;
let ordersRequestId = 0;
let ordersRefreshInFlight = false;
const pendingOrdersRequests = new Map();

function normalizedConfig() {
  const api = new URL(apiBaseUrl.value.trim());
  const socket = new URL(tradeSocketUrl.value.trim());
  if (!['http:', 'https:'].includes(api.protocol) || api.pathname !== '/') throw new Error('HTTP API must contain only scheme, host, and port.');
  if (!['ws:', 'wss:'].includes(socket.protocol) || socket.pathname !== '/') throw new Error('WebSocket URL must contain only scheme, host, and port.');
  return { apiBaseUrl: api.href.replace(/\/$/, ''), tradeSocketUrl: socket.href.replace(/\/$/, '') };
}

function permissionOrigins(config) {
  const api = new URL(config.apiBaseUrl);
  const socket = new URL(config.tradeSocketUrl);
  const socketScheme = socket.protocol === 'wss:' ? 'https:' : 'http:';
  return [...new Set([`${api.protocol}//${api.host}/*`, `${socketScheme}//${socket.host}/*`])];
}

async function requestPermissions(config) {
  const permissions = { origins: permissionOrigins(config) };
  const alreadyGranted = await chrome.permissions.contains(permissions);
  if (alreadyGranted) return;
  const granted = await chrome.permissions.request(permissions);
  if (!granted) throw new Error('Host access was not granted for the configured Trading Bridge.');
}

function setBusy(busy) { test.disabled = busy; save.disabled = busy; }
function setStatus(message, failure = false) { status.textContent = message; status.classList.toggle('failure', failure); }
function setOrdersStatus(message, failure = false) {
  ordersStatus.textContent = message;
  ordersStatus.classList.toggle('failure', failure);
}

function orderId(order) {
  return order?.id ?? order?.order_id ?? order?.orderId ?? order?.orderID ?? order?.hash ?? '';
}

function remainingShares(order) {
  const explicit = Number(order?.remainingSize ?? order?.remaining_size ?? order?.size_remaining);
  if (Number.isFinite(explicit)) return Math.max(0, explicit);
  const size = Number(order?.size ?? order?.original_size ?? order?.originalSize);
  const matched = Number(order?.size_matched ?? order?.matched_size ?? order?.matchedSize ?? 0);
  return Number.isFinite(size) ? Math.max(0, size - (Number.isFinite(matched) ? matched : 0)) : null;
}

function displayNumber(value, maximumFractionDigits = 4) {
  if (value == null || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString(undefined, { maximumFractionDigits }) : '—';
}

function orderField(label, value, className = '') {
  const field = document.createElement('div');
  field.className = 'order-field';
  const caption = document.createElement('small');
  caption.textContent = label;
  const content = document.createElement('span');
  content.className = className;
  content.textContent = value;
  field.append(caption, content);
  return field;
}

function renderOrders(orders) {
  ordersList.replaceChildren();
  if (!orders.length) {
    const empty = document.createElement('div');
    empty.className = 'orders-empty';
    empty.textContent = 'No current open CLOB orders.';
    ordersList.append(empty);
    return;
  }

  for (const order of orders) {
    const card = document.createElement('article');
    card.className = 'order-card';
    const market = document.createElement('div');
    market.className = 'order-market';
    const slug = String(order?.slug ?? order?.market ?? '').trim();
    const marketName = document.createElement(slug ? 'a' : 'span');
    marketName.textContent = slug || 'Unknown market';
    if (slug) {
      marketName.href = `https://polymarket.com/event/${encodeURIComponent(slug)}`;
      marketName.target = '_blank';
      marketName.rel = 'noreferrer';
    }
    const id = document.createElement('div');
    id.className = 'order-id';
    id.textContent = orderId(order) || 'No order ID';
    id.title = id.textContent;
    market.append(marketName, id);

    const side = String(order?.side ?? '').toLowerCase();
    const matched = order?.size_matched ?? order?.matched_size ?? order?.matchedSize;
    card.append(
      market,
      orderField('Outcome', String(order?.outcome ?? '—')),
      orderField('Side', side || '—', `order-side ${side}`),
      orderField('Price', displayNumber(order?.price, 6)),
      orderField('Remaining', displayNumber(remainingShares(order), 6))
    );
    if (matched != null) card.title = `Matched: ${displayNumber(matched, 6)}`;
    ordersList.append(card);
  }
}

function normalizeOrders(result) {
  if (Array.isArray(result)) return result;
  return Array.isArray(result?.orders) ? result.orders : [];
}

function rejectOrdersRequests(message) {
  for (const request of pendingOrdersRequests.values()) {
    clearTimeout(request.timeout);
    request.reject(new Error(message));
  }
  pendingOrdersRequests.clear();
}

function ordersCommand(command, params = {}) {
  return new Promise((resolve, reject) => {
    if (!ordersSocket || ordersSocket.readyState !== WebSocket.OPEN) {
      reject(new Error('Trading Bridge WebSocket is not connected.'));
      return;
    }
    const id = `extension-settings-${Date.now()}-${++ordersRequestId}`;
    const timeout = setTimeout(() => {
      pendingOrdersRequests.delete(id);
      reject(new Error(`${command} timed out.`));
    }, 15000);
    pendingOrdersRequests.set(id, { resolve, reject, timeout });
    ordersSocket.send(JSON.stringify({ id, command, params }));
  });
}

async function loadOrders() {
  if (ordersRefreshInFlight || !ordersSocket || ordersSocket.readyState !== WebSocket.OPEN) return;
  ordersRefreshInFlight = true;
  refreshOrders.disabled = true;
  try {
    const orders = normalizeOrders(await ordersCommand('orders_open'));
    renderOrders(orders);
    setOrdersStatus(`${orders.length} open order${orders.length === 1 ? '' : 's'} · updated ${new Date().toLocaleTimeString()}`);
  } catch (error) {
    setOrdersStatus(error.message, true);
  } finally {
    ordersRefreshInFlight = false;
    refreshOrders.disabled = false;
  }
}

function connectOrders(tradeSocketUrl) {
  clearTimeout(ordersReconnectTimer);
  clearInterval(ordersRefreshTimer);
  const previousSocket = ordersSocket;
  ordersSocket = null;
  if (previousSocket && previousSocket.readyState <= WebSocket.OPEN) previousSocket.close();
  rejectOrdersRequests('Trading Bridge WebSocket reconnected.');
  renderOrders([]);

  if (!/^wss?:\/\/[^/]+$/i.test(tradeSocketUrl)) {
    setOrdersStatus('Save a valid Bridge WebSocket URL to load orders.', true);
    return;
  }

  setOrdersStatus('Connecting to Trading Bridge…');
  const socket = new WebSocket(tradeSocketUrl);
  ordersSocket = socket;
  socket.onopen = () => {
    if (ordersSocket !== socket) return;
    setOrdersStatus('Connected · loading orders…');
    void loadOrders();
    ordersRefreshTimer = setInterval(loadOrders, 1500);
  };
  socket.onmessage = event => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'welcome') return;
      const request = pendingOrdersRequests.get(message.id);
      if (!request) return;
      clearTimeout(request.timeout);
      pendingOrdersRequests.delete(message.id);
      if (message.ok) request.resolve(message.response?.body ?? message.response);
      else request.reject(new Error(message.error?.message || message.response?.body?.message || message.response?.body?.error || 'Trading command failed.'));
    } catch (error) {
      setOrdersStatus(error.message, true);
    }
  };
  socket.onerror = () => {
    if (ordersSocket === socket) setOrdersStatus('Trading Bridge WebSocket connection failed.', true);
  };
  socket.onclose = () => {
    if (ordersSocket !== socket) return;
    ordersSocket = null;
    clearInterval(ordersRefreshTimer);
    rejectOrdersRequests('Trading Bridge WebSocket disconnected.');
    setOrdersStatus('Disconnected · reconnecting…', true);
    ordersReconnectTimer = setTimeout(() => connectOrders(tradeSocketUrl), 1500);
  };
}

async function persistConfig(config) {
  await requestPermissions(config);
  await chrome.storage.local.set({ [SERVER_CONFIG_KEY]: config });
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  setBusy(true);
  try {
    const config = normalizedConfig();
    await persistConfig(config);
    setStatus('Trading Bridge settings saved.');
    connectOrders(config.tradeSocketUrl);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(false);
  }
});

test.addEventListener('click', async () => {
  setBusy(true);
  try {
    const config = normalizedConfig();
    await persistConfig(config);
    const response = await chrome.runtime.sendMessage({ type: 'polymarket-trading-test-server' });
    if (!response?.ok) throw new Error(response?.error || 'Trading Bridge test failed.');
    setStatus(`Trading Bridge HTTP API and WebSocket connected${response.serverDate ? ` (${response.serverDate})` : ''}.`);
    connectOrders(config.tradeSocketUrl);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(false);
  }
});

refreshOrders.addEventListener('click', () => {
  if (ordersSocket?.readyState === WebSocket.OPEN) void loadOrders();
  else connectOrders(tradeSocketUrl.value.trim());
});

chrome.storage.local.get({ [SERVER_CONFIG_KEY]: {} }).then(stored => {
  const config = stored[SERVER_CONFIG_KEY] || {};
  apiBaseUrl.value = config.apiBaseUrl || '';
  tradeSocketUrl.value = config.tradeSocketUrl || '';
  connectOrders(tradeSocketUrl.value.trim());
});

addEventListener('beforeunload', () => {
  clearTimeout(ordersReconnectTimer);
  clearInterval(ordersRefreshTimer);
  const socket = ordersSocket;
  ordersSocket = null;
  if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
  rejectOrdersRequests('Settings page closed.');
});
