const SERVER_CONFIG_KEY = 'tradingPanelServerConfig';
const form = document.getElementById('server-form');
const apiBaseUrl = document.getElementById('api-base-url');
const tradeSocketUrl = document.getElementById('trade-socket-url');
const test = document.getElementById('test');
const save = document.getElementById('save');
const status = document.getElementById('status');

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
  if (!granted) throw new Error('Host access was not granted for the configured server.');
}

function setBusy(busy) { test.disabled = busy; save.disabled = busy; }
function setStatus(message, failure = false) { status.textContent = message; status.classList.toggle('failure', failure); }

async function persistConfig(config) {
  await requestPermissions(config);
  await chrome.storage.local.set({ [SERVER_CONFIG_KEY]: config });
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  setBusy(true);
  try {
    await persistConfig(normalizedConfig());
    setStatus('Server settings saved.');
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(false);
  }
});

test.addEventListener('click', async () => {
  setBusy(true);
  try {
    await persistConfig(normalizedConfig());
    const response = await chrome.runtime.sendMessage({ type: 'polymarket-trading-test-server' });
    if (!response?.ok) throw new Error(response?.error || 'Server test failed.');
    setStatus(`HTTP API and trading WebSocket connected${response.serverDate ? ` (${response.serverDate})` : ''}.`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(false);
  }
});

chrome.storage.local.get({ [SERVER_CONFIG_KEY]: {} }).then(stored => {
  const config = stored[SERVER_CONFIG_KEY] || {};
  apiBaseUrl.value = config.apiBaseUrl || '';
  tradeSocketUrl.value = config.tradeSocketUrl || '';
});
