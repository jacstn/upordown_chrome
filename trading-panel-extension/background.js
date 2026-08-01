const PANEL_MODE_MENU_ID = 'polymarket-trading-toggle-panel-mode';
const SERVER_SETTINGS_MENU_ID = 'polymarket-trading-server-settings';
const SERVER_CONFIG_KEY = 'tradingPanelServerConfig';

async function serverConfig() {
  const stored = await chrome.storage.local.get({ [SERVER_CONFIG_KEY]: {} });
  const config = stored[SERVER_CONFIG_KEY] || {};
  const apiBaseUrl = String(config.apiBaseUrl || '').trim().replace(/\/+$/, '');
  const tradeSocketUrl = String(config.tradeSocketUrl || '').trim();
  if (!/^https?:\/\/[^/]+$/i.test(apiBaseUrl)) throw new Error('Configure a valid HTTP API base URL in extension settings.');
  if (!/^wss?:\/\/[^/]+$/i.test(tradeSocketUrl)) throw new Error('Configure a valid trading WebSocket URL in extension settings.');
  return { apiBaseUrl, tradeSocketUrl };
}

async function apiUrl(path) {
  const config = await serverConfig();
  return `${config.apiBaseUrl}${path}`;
}

function testSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('Trading WebSocket test timed out.'));
    }, 8000);
    socket.onopen = () => {
      clearTimeout(timeout);
      socket.close();
      resolve();
    };
    socket.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Trading WebSocket connection failed.'));
    };
  });
}

async function configureActionMenu(enabled) {
  const properties = {
    title: enabled ? 'Use classic floating panel' : 'Use Chrome Side Panel',
    contexts: ['action']
  };
  try {
    await chrome.contextMenus.update(PANEL_MODE_MENU_ID, properties);
  } catch {
    chrome.contextMenus.create({ id: PANEL_MODE_MENU_ID, ...properties });
  }
  try {
    await chrome.contextMenus.update(SERVER_SETTINGS_MENU_ID, { title: 'Server settings', contexts: ['action'] });
  } catch {
    chrome.contextMenus.create({ id: SERVER_SETTINGS_MENU_ID, title: 'Server settings', contexts: ['action'] });
  }
}

async function configureSidePanel(enabled) {
  await chrome.sidePanel.setOptions({ path: 'sidepanel.html', enabled });
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: enabled });
  await chrome.action.setPopup({ popup: enabled ? '' : 'popup.html' });
  await chrome.action.setTitle({ title: enabled ? 'Open Polymarket Trading Side Panel' : 'Add Polymarket Trading Side Panel' });
  await configureActionMenu(enabled);
  await chrome.storage.local.set({ tradingPanelSidePanelEnabled: enabled });
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install' && reason !== 'update') return;
  await chrome.storage.local.set({ tradingPanelMinimized: false });
  await chrome.storage.local.remove(['tradingPanelPosition', 'tradingPanelSize']);
  const { tradingPanelSidePanelEnabled = false } = await chrome.storage.local.get({ tradingPanelSidePanelEnabled: false });
  await configureSidePanel(tradingPanelSidePanelEnabled);
  try {
    await serverConfig();
  } catch {
    await chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const { tradingPanelSidePanelEnabled = false } = await chrome.storage.local.get({ tradingPanelSidePanelEnabled: false });
  await configureSidePanel(tradingPanelSidePanelEnabled);
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === SERVER_SETTINGS_MENU_ID) {
    await chrome.runtime.openOptionsPage();
    return;
  }
  if (info.menuItemId !== PANEL_MODE_MENU_ID) return;
  const { tradingPanelSidePanelEnabled = false } = await chrome.storage.local.get({ tradingPanelSidePanelEnabled: false });
  const enable = !tradingPanelSidePanelEnabled;
  await configureSidePanel(enable);
  if (enable && tab?.windowId != null) await chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'polymarket-trading-configure-side-panel') {
    configureSidePanel(Boolean(message.enabled))
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message || 'Could not configure the side panel.' }));
    return true;
  }
  if (message?.type === 'polymarket-trading-test-server') {
    Promise.all([
      apiUrl('/balances').then(url => fetch(url, { method: 'GET', cache: 'no-store' })).then(async response => {
        await response.text();
        if (!response.ok) throw new Error(`HTTP API returned ${response.status}.`);
        return response.headers.get('date') || '';
      }),
      serverConfig().then(config => testSocket(config.tradeSocketUrl))
    ])
      .then(([serverDate]) => sendResponse({ ok: true, serverDate }))
      .catch(error => sendResponse({ ok: false, error: error.message || 'Server test failed.' }));
    return true;
  }
  if (message?.type === 'polymarket-trading-mint-markets') {
    apiUrl('/balances').then(url => fetch(url, { method: 'GET', cache: 'no-store' }))
      .then(async response => {
        await response.text();
        const serverTime = Date.parse(response.headers.get('date') || '');
        if (!Number.isFinite(serverTime)) throw new Error('Mint server did not return its current time.');
        const currentWindow = Math.floor(serverTime / 1000 / 300) * 300;
        const markets = Array.from({ length: 3 }, (_, index) => {
          const startsAt = currentWindow + index * 300;
          return { slug: `btc-updown-5m-${startsAt}`, startsAt, endsAt: startsAt + 300 };
        });
        sendResponse({ ok: true, serverTime, markets });
      })
      .catch(error => sendResponse({ ok: false, error: error.message || 'Could not get mint server time.' }));
    return true;
  }
  if (message?.type === 'polymarket-trading-mint') {
    const slug = String(message.slug || '').trim();
    const shares = Number(message.shares);
    if (!/^btc-updown-5m-\d+$/.test(slug)) {
      sendResponse({ ok: false, error: 'A valid BTC 5-minute market slug is required.' });
      return false;
    }
    if (!Number.isFinite(shares) || shares <= 0 || shares > 1000000) {
      sendResponse({ ok: false, error: 'Shares must be between 0 and 1,000,000.' });
      return false;
    }

    apiUrl('/mint').then(url => fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ slug, shares })
    }))
      .then(async (response) => {
        const text = await response.text();
        let data;
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          throw new Error(`Mint server returned invalid JSON (HTTP ${response.status}).`);
        }
        if (!response.ok) throw new Error(data?.message || data?.error || `Mint server returned HTTP ${response.status}.`);
        sendResponse({ ok: true, data });
      })
      .catch(error => sendResponse({ ok: false, error: error.message || 'Mint request failed.' }));
    return true;
  }

  if (message?.type !== 'five-minute-trading-redeem') return false;

  apiUrl('/redeem').then(url => fetch(url, { method: 'GET', cache: 'no-store' }))
    .then(async (response) => {
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Redeem server returned invalid JSON (HTTP ${response.status}).`);
      }
      if (!response.ok) throw new Error(data?.message || data?.error || `Redeem server returned HTTP ${response.status}.`);
      sendResponse({ ok: true, data });
    })
    .catch((error) => sendResponse({ ok: false, error: error.message || 'Redeem request failed.' }));

  return true;
});
