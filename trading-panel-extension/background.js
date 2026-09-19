const PANEL_MODE_MENU_ID = 'polymarket-trading-toggle-panel-mode';
const SERVER_SETTINGS_MENU_ID = 'polymarket-trading-server-settings';
const SERVER_CONFIG_KEY = 'tradingPanelServerConfig';

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function polymarketSlug(pageUrl) {
  try {
    const url = new URL(pageUrl);
    if (!/(^|\.)polymarket\.com$/i.test(url.hostname)) return '';
    const parts = url.pathname.split('/').filter(Boolean);
    return decodeURIComponent(parts.at(-1) || '').toLowerCase();
  } catch {
    return '';
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { method: 'GET', cache: 'no-store', headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Market lookup returned HTTP ${response.status}.`);
  return response.json();
}

async function resolvePolymarketMarket(pageUrl) {
  const urlSlug = polymarketSlug(pageUrl);
  if (!urlSlug || !/^[a-z0-9][a-z0-9-]*$/.test(urlSlug)) throw new Error('unavailable');

  let candidate = null;
  try {
    const event = await fetchJson(`https://gamma-api.polymarket.com/events/slug/${encodeURIComponent(urlSlug)}`);
    const tradable = (Array.isArray(event?.markets) ? event.markets : []).filter(market =>
      market?.enableOrderBook && market?.conditionId && !market?.closed
    );
    candidate = tradable.find(market => market.slug === urlSlug) || (tradable.length === 1 ? tradable[0] : null);
  } catch {
    // A direct market URL does not always have a corresponding event slug.
  }

  if (!candidate) {
    try {
      const market = await fetchJson(`https://gamma-api.polymarket.com/markets/slug/${encodeURIComponent(urlSlug)}`);
      if (market?.slug === urlSlug) candidate = market;
    } catch {
      throw new Error('unavailable');
    }
  }

  if (!candidate?.conditionId || !candidate?.slug) throw new Error('unavailable');
  let clob;
  try {
    clob = await fetchJson(`https://clob.polymarket.com/markets/${encodeURIComponent(candidate.conditionId)}`);
  } catch {
    throw new Error('unavailable');
  }
  const tokens = Array.isArray(clob?.tokens) ? clob.tokens : [];
  if (clob?.condition_id !== candidate.conditionId || clob?.market_slug !== candidate.slug || tokens.length !== 2 ||
      tokens.some(token => !/^\d+$/.test(String(token?.token_id || '')) || !String(token?.outcome || '').trim())) {
    throw new Error('unavailable');
  }

  const gammaOutcomes = parseJsonArray(candidate.outcomes).map(String);
  const gammaTokenIds = parseJsonArray(candidate.clobTokenIds).map(String);
  if (gammaOutcomes.length === 2 && gammaTokenIds.length === 2 && tokens.some((token, index) =>
    token.outcome !== gammaOutcomes[index] || String(token.token_id) !== gammaTokenIds[index]
  )) throw new Error('unavailable');

  return {
    slug: clob.market_slug,
    conditionId: clob.condition_id,
    outcomes: tokens.map(token => String(token.outcome)),
    tokenIds: tokens.map(token => String(token.token_id)),
    prices: tokens.map(token => {
      const price = Number(token.price);
      return price > 0 && price < 1 ? price : null;
    })
  };
}

async function serverConfig() {
  const stored = await chrome.storage.local.get({ [SERVER_CONFIG_KEY]: {} });
  const config = stored[SERVER_CONFIG_KEY] || {};
  const apiBaseUrl = String(config.apiBaseUrl || '').trim().replace(/\/+$/, '');
  const tradeSocketUrl = String(config.tradeSocketUrl || '').trim();
  if (!/^https?:\/\/[^/]+$/i.test(apiBaseUrl)) throw new Error('Configure a valid Trading Bridge HTTP API URL.');
  if (!/^wss?:\/\/[^/]+$/i.test(tradeSocketUrl)) throw new Error('Configure a valid Trading Bridge WebSocket URL.');
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
      reject(new Error('Trading Bridge WebSocket test timed out.'));
    }, 8000);
    socket.onopen = () => {
      clearTimeout(timeout);
      socket.close();
      resolve();
    };
    socket.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Trading Bridge WebSocket connection failed.'));
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
    await chrome.contextMenus.update(SERVER_SETTINGS_MENU_ID, { title: 'Trading Bridge settings', contexts: ['action'] });
  } catch {
    chrome.contextMenus.create({ id: SERVER_SETTINGS_MENU_ID, title: 'Trading Bridge settings', contexts: ['action'] });
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
  if (message?.type === 'polymarket-trading-resolve-market') {
    resolvePolymarketMarket(message.url)
      .then(market => sendResponse({ ok: true, market }))
      .catch(() => sendResponse({ ok: false, error: 'unavailable' }));
    return true;
  }
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
        if (!Number.isFinite(serverTime)) throw new Error('Trading Bridge did not return its current time.');
        const currentWindow = Math.floor(serverTime / 1000 / 300) * 300;
        const markets = Array.from({ length: 3 }, (_, index) => {
          const startsAt = currentWindow + index * 300;
          return { slug: `btc-updown-5m-${startsAt}`, startsAt, endsAt: startsAt + 300 };
        });
        sendResponse({ ok: true, serverTime, markets });
      })
      .catch(error => sendResponse({ ok: false, error: error.message || 'Could not get Trading Bridge time.' }));
    return true;
  }
  if (message?.type === 'polymarket-trading-mint') {
    const slug = String(message.slug || '').trim();
    const shares = Number(message.shares);
    if (!/^[a-z0-9][a-z0-9-]{0,255}$/.test(slug)) {
      sendResponse({ ok: false, error: 'A valid Polymarket market slug is required.' });
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
          throw new Error(`Trading Bridge returned invalid JSON (HTTP ${response.status}).`);
        }
        if (!response.ok) throw new Error(data?.message || data?.error || `Trading Bridge returned HTTP ${response.status}.`);
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
