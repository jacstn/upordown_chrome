(() => {
  'use strict';

  const isSidePanel = location.protocol === 'chrome-extension:' && location.pathname.endsWith('/sidepanel.html');
  const isTradingPage = location.pathname.startsWith('/polymarket/live') || /^\/live3(?:\/|$)/i.test(location.pathname);
  if (window.top !== window || document.getElementById('five-minute-trading-extension-shell')) return;
  if (!isSidePanel && (!/(^|\.)upordown\.pl$/i.test(location.hostname) || !isTradingPage)) return;

  console.info(`[Polymarket Trading Panel] opening ${isSidePanel ? 'side' : 'page'} panel 1.3.50`);

  const SERVER_CONFIG_KEY = 'tradingPanelServerConfig';
  const shell = document.createElement('aside');
  shell.id = 'five-minute-trading-extension-shell';
  shell.classList.toggle('side-panel', isSidePanel);
  shell.innerHTML = `
    <header class="tp-header">
      <img class="tp-logo" alt="" src="${chrome.runtime.getURL('icon-128.png')}">
      <div class="tp-heading"><strong>Trading panel</strong><span id="tp-market">Waiting for live market</span></div>
      <div id="tp-connection" class="tp-connection" title="Disconnected"><i></i><span id="tp-balance">--</span></div>
      <button id="tp-settings" type="button" title="Server settings" aria-label="Server settings">&#9881;</button>
      <button id="tp-minimize" type="button" title="Minimize">−</button>
    </header>
    <div class="tp-body">
      <div class="tp-prices">
        <span>Page price</span><strong>UP <b id="tp-up">--</b></strong><strong>DOWN <b id="tp-down">--</b></strong>
      </div>
      <div class="tp-tabs" role="tablist">
        <button data-mode="market" class="active" type="button">M</button>
        <button data-mode="limit" type="button">L</button>
        <button data-mode="quick" type="button">Q</button>
        <button data-mode="multi-limit" type="button">MU</button>
        <button data-mode="market-tp" type="button">M-TP</button>
        <button data-mode="sq" type="button">SQ</button>
        <button data-mode="mint" type="button">Mint</button>
      </div>
      <div class="tp-grid">
        <label id="tp-amount-field">USD<input id="tp-amount" type="number" min="0.01" step="0.01" value="5"></label>
        <label id="tp-price-field">Entry price<input id="tp-price" type="number" min="0.001" max="0.999" step="0.001" value="0.55"></label>
        <label id="tp-buy-min-field" class="tp-check"><input id="tp-buy-min" type="checkbox"> Buy min 5.1 shares</label>
        <label id="tp-timeout-field">Timeout (sec)<input id="tp-timeout" type="number" min="1" step="1" value="10"></label>
        <label id="tp-tp-field">TP price<input id="tp-tp" type="number" min="0.001" max="0.999" step="0.001" value="0.65"></label>
        <label id="tp-percent-field">TP %<input id="tp-percent" type="number" min="0.01" step="0.01" value="30"></label>
      </div>
      <div id="tp-multi" class="tp-multi" hidden>
        <div><strong>Limit opens</strong><button id="tp-add-row" type="button">+</button></div>
        <div id="tp-rows"></div>
      </div>
      <div id="tp-mtp-exceptions" class="tp-mtp-exceptions" hidden>
        <div><strong>TP % by buy price</strong><button id="tp-add-mtp-exception" type="button" title="Add price-range exception">+</button></div>
        <div id="tp-mtp-exception-rows"></div>
      </div>
      <div id="tp-sq" class="tp-sq" hidden>
        <div class="tp-sq-positions">
          <span>Held contracts</span>
          <strong>UP <b id="tp-sq-up-shares">0</b></strong>
          <strong>DOWN <b id="tp-sq-down-shares">0</b></strong>
        </div>
        <div class="tp-sq-summary">
          <span id="tp-sq-side">Waiting for price</span>
          <strong id="tp-sq-available">0 available</strong>
        </div>
        <div class="tp-sq-grid">
          <label>TP %<input id="tp-sq-percent" type="number" min="0.01" step="0.01" value="20"></label>
          <div id="tp-sq-plan" class="tp-sq-plan">Waiting for positions</div>
        </div>
        <button id="tp-sq-submit" type="button" disabled>Go</button>
      </div>
      <div id="tp-mint" class="tp-mint" hidden>
        <div class="tp-mint-head"><span id="tp-mint-clock">Checking server time</span><button id="tp-mint-refresh" type="button">Refresh</button></div>
        <div id="tp-mint-markets" class="tp-mint-markets"></div>
        <button id="tp-mint-submit" type="button" disabled>Mint UP + DOWN tokens</button>
      </div>
      <div class="tp-actions">
        <button id="tp-buy-up" type="button" disabled>Up</button>
        <button id="tp-buy-down" type="button" disabled>Down</button>
      </div>
      <div id="tp-output" class="tp-output">Waiting for server configuration</div>
      <div class="tp-current-head"><strong>Current trades</strong><button id="tp-refresh" type="button">Refresh</button></div>
      <div id="tp-list" class="tp-list"><div class="tp-empty">Connecting…</div></div>
    </div>
    <button id="tp-restore" type="button" title="Restore trading panel"><img alt="Trading panel" src="${chrome.runtime.getURL('icon-128.png')}"></button>
    <div id="tp-resize" title="Resize"></div>
  `;
  (document.body || document.documentElement).append(shell);

  const $ = selector => shell.querySelector(selector);
  const refs = {
    header: $('.tp-header'), market: $('#tp-market'), connection: $('#tp-connection'), balance: $('#tp-balance'),
    minimize: $('#tp-minimize'), settings: $('#tp-settings'), restore: $('#tp-restore'), resize: $('#tp-resize'), up: $('#tp-up'), down: $('#tp-down'),
    tabs: [...shell.querySelectorAll('.tp-tabs button')], amount: $('#tp-amount'), amountField: $('#tp-amount-field'), price: $('#tp-price'), buyMin: $('#tp-buy-min'),
    timeout: $('#tp-timeout'), takeProfit: $('#tp-tp'), percent: $('#tp-percent'), priceField: $('#tp-price-field'),
    buyMinField: $('#tp-buy-min-field'), timeoutField: $('#tp-timeout-field'), takeProfitField: $('#tp-tp-field'),
    percentField: $('#tp-percent-field'), multi: $('#tp-multi'), rows: $('#tp-rows'), addRow: $('#tp-add-row'),
    mtpExceptions: $('#tp-mtp-exceptions'), mtpExceptionRows: $('#tp-mtp-exception-rows'), addMtpException: $('#tp-add-mtp-exception'),
    sq: $('#tp-sq'), sqUpShares: $('#tp-sq-up-shares'), sqDownShares: $('#tp-sq-down-shares'), sqSide: $('#tp-sq-side'),
    sqAvailable: $('#tp-sq-available'), sqPercent: $('#tp-sq-percent'), sqPlan: $('#tp-sq-plan'), sqSubmit: $('#tp-sq-submit'),
    mint: $('#tp-mint'), mintClock: $('#tp-mint-clock'), mintMarkets: $('#tp-mint-markets'), mintRefresh: $('#tp-mint-refresh'), mintSubmit: $('#tp-mint-submit'),
    actions: $('.tp-actions'), buyUp: $('#tp-buy-up'), buyDown: $('#tp-buy-down'), output: $('#tp-output'), refresh: $('#tp-refresh'), list: $('#tp-list')
  };
  if (isSidePanel) {
    refs.minimize.textContent = '×';
    refs.minimize.title = 'Remove from Side Panel';
  }

  let mode = 'market';
  let marketSlug = '';
  let upPrice = null;
  let socket = null;
  let reconnectTimer = null;
  let refreshTimer = null;
  let requestId = 0;
  let scanQueued = false;
  let sidePanelScanInFlight = false;
  let accountRefreshInFlight = false;
  let renderedAccountSignature = null;
  let latestPositions = [];
  let latestOrders = [];
  let multiRows = [{ openPrice: '0.55', takeProfitPrice: '0.65', timeout: '10' }];
  let marketTpExceptions = [];
  let mintMarkets = [];
  let selectedMintSlug = '';
  let mintMarketsInFlight = false;
  let modeAmounts = { market: '5', limit: '5', quick: '5', 'multi-limit': '5', 'market-tp': '5', sq: '5', mint: '5' };
  const pending = new Map();

  function setOutput(message, state = '') {
    const className = `tp-output${state ? ` ${state}` : ''}`;
    if (refs.output.textContent !== message) refs.output.textContent = message;
    if (refs.output.className !== className) refs.output.className = className;
  }

  function wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
  }

  function setConnection(label, connected = false) {
    refs.connection.classList.toggle('connected', connected);
    refs.connection.title = label;
    refs.buyUp.disabled = !connected;
    refs.buyDown.disabled = !connected;
    updateSqPreview();
  }

  function parsePrice(value) {
    const number = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(number)) return null;
    const normalized = number > 1 && number <= 100 ? number / 100 : number;
    return normalized > 0 && normalized < 1 ? normalized : null;
  }

  function liveCard() {
    return document.querySelector('#live .chart-card.live') || document.querySelector('.chart-card.live') || document.querySelector('#live article') || document.body;
  }

  function normalizeMarketSlug(value) {
    const match = String(value || '').match(/(?:btc|eth|sol|xrp)-updown-(?:5m|15m)-\d+/i);
    return match ? match[0].toLowerCase() : '';
  }

  function slugFromCard(card) {
    const explicit = card?.dataset?.slug || card?.dataset?.marketSlug || card?.querySelector('[data-market-slug]')?.dataset?.marketSlug;
    const explicitSlug = normalizeMarketSlug(explicit);
    if (explicitSlug) return explicitSlug;
    const refresh = card?.querySelector('.chart-refresh[title], .chart-refresh[aria-label]');
    const refreshText = refresh?.getAttribute('title') || refresh?.getAttribute('aria-label') || '';
    const reloadMatch = refreshText.match(/Reload\s+([^\s]+)/i);
    const refreshSlug = normalizeMarketSlug(reloadMatch?.[1]);
    if (refreshSlug) return refreshSlug;
    return normalizeMarketSlug(card?.textContent);
  }

  function applyMarketState(nextSlug, nextPrice, clearSlug = false) {
    const slugChanged = Boolean(nextSlug && nextSlug !== marketSlug);
    upPrice = nextPrice;
    if (nextSlug || clearSlug) marketSlug = nextSlug || '';
    if (slugChanged) {
      latestPositions = [];
      latestOrders = [];
    }
    refs.up.textContent = upPrice == null ? '--' : upPrice.toFixed(3);
    refs.down.textContent = upPrice == null ? '--' : (1 - upPrice).toFixed(3);
    refs.market.textContent = marketSlug || 'Waiting for live market';
    refs.market.title = marketSlug;
    updateMintState();
    updateButtonPrices();
    updateSqPreview();
    if (slugChanged && socket?.readyState === WebSocket.OPEN) void refreshAccount();
  }

  async function scanActiveTab() {
    if (sidePanelScanInFlight) return;
    sidePanelScanInFlight = true;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active browser tab.');
      let snapshot = null;
      try {
        snapshot = await chrome.tabs.sendMessage(tab.id, { type: 'polymarket-trading-market-snapshot' });
      } catch {
        // A freshly reloaded extension may not yet have a content-script receiver
        // in an already-open tab, so read the supported page directly as fallback.
      }
      if (!snapshot || (!snapshot.marketSlug && parsePrice(snapshot.upPrice) == null)) {
        const [injection] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const root = document.querySelector('#live .chart-card.live') || document.querySelector('.chart-card.live') || document.querySelector('#live article') || document.body;
            const priceNode = root?.querySelector('b[data-stat="poly-up"]') || document.querySelector('b[data-stat="poly-up"]');
            const explicit = root?.dataset?.slug || root?.dataset?.marketSlug || root?.querySelector('[data-market-slug]')?.dataset?.marketSlug || '';
            const refresh = root?.querySelector('.chart-refresh[title], .chart-refresh[aria-label]');
            const refreshText = refresh?.getAttribute('title') || refresh?.getAttribute('aria-label') || '';
            const slugText = `${explicit} ${refreshText} ${root?.textContent || ''}`;
            const slugMatch = slugText.match(/(?:btc|eth|sol|xrp)-updown-(?:5m|15m)-\d+/i);
            return { marketSlug: slugMatch?.[0] || '', upPrice: priceNode?.textContent || null };
          }
        });
        snapshot = injection?.result;
      }
      if (!snapshot?.marketSlug && parsePrice(snapshot?.upPrice) == null) throw new Error('Market data was not found in the active tab.');
      applyMarketState(normalizeMarketSlug(snapshot?.marketSlug), parsePrice(snapshot?.upPrice), true);
    } catch {
      applyMarketState('', null, true);
      refs.market.textContent = 'Open an UpOrDown live page';
      refs.market.title = 'The Side Panel could not read market data from the active tab.';
    } finally {
      sidePanelScanInFlight = false;
    }
  }

  function scanPage() {
    scanQueued = false;
    if (isSidePanel) {
      void scanActiveTab();
      return;
    }
    const card = liveCard();
    const priceNode = card?.querySelector('b[data-stat="poly-up"]') || document.querySelector('b[data-stat="poly-up"]');
    applyMarketState(slugFromCard(card), parsePrice(priceNode?.textContent));
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(scanPage);
  }

  function outcomePrice(outcome) {
    return upPrice == null ? null : outcome === 'Up' ? upPrice : 1 - upPrice;
  }

  function marketMaxPrice(outcome) {
    const value = outcomePrice(outcome);
    return value == null ? null : Math.min(.999, Math.ceil(value * 1.1 * 1000) / 1000);
  }

  const MARKET_TP_MIN_SHARES = 6;
  const MARKET_TP_ORDER_SHARES = 6.1;

  function marketTakeProfitUsd(outcome, usd) {
    const maxPrice = marketMaxPrice(outcome);
    if (maxPrice == null) return null;
    const minimumUsd = Math.ceil(maxPrice * MARKET_TP_ORDER_SHARES * 1e6) / 1e6;
    return Math.max(Number.isFinite(usd) && usd > 0 ? usd : 0, minimumUsd);
  }

  function takeProfitPercent(value) {
    const number = Number(value);
    if (!(number > 0)) return null;
    return number >= 1 ? number / 100 : number;
  }

  function marketTpRange(value) {
    const match = String(value ?? '').trim().match(/^(\d*\.?\d+)\s*-\s*(\d*\.?\d+)$/);
    if (!match) return null;
    const normalize = raw => {
      const number = Number(raw);
      if (!Number.isFinite(number)) return null;
      const normalized = Number.isInteger(number) ? number / 100 : number;
      return normalized >= 0 && normalized <= 1 ? normalized : null;
    };
    const min = normalize(match[1]);
    const max = normalize(match[2]);
    return min != null && max != null && min <= max ? { min, max } : null;
  }

  function readMarketTpExceptionRows() {
    return [...refs.mtpExceptionRows.querySelectorAll('.tp-mtp-exception-row')].map(row => ({
      range: row.querySelector('.tp-mtp-range').value.trim(),
      percent: row.querySelector('.tp-mtp-percent').value
    }));
  }

  function validateMarketTpExceptionRows(rows = readMarketTpExceptionRows(), markRows = true) {
    const parsed = rows.map(row => {
      const value = row && typeof row === 'object' ? row : {};
      return { range: String(value.range ?? ''), percent: String(value.percent ?? ''), parsedRange: marketTpRange(value.range), parsedPercent: takeProfitPercent(value.percent) };
    });
    const invalid = new Set();
    parsed.forEach((row, index) => {
      if (!row.parsedRange || row.parsedPercent == null) invalid.add(index);
    });
    for (let left = 0; left < parsed.length; left += 1) {
      if (!parsed[left].parsedRange) continue;
      for (let right = left + 1; right < parsed.length; right += 1) {
        if (!parsed[right].parsedRange) continue;
        const a = parsed[left].parsedRange;
        const b = parsed[right].parsedRange;
        if (a.min <= b.max && b.min <= a.max) {
          invalid.add(left);
          invalid.add(right);
        }
      }
    }
    if (markRows) {
      [...refs.mtpExceptionRows.querySelectorAll('.tp-mtp-exception-row')].forEach((row, index) => {
        const isInvalid = invalid.has(index);
        row.classList.toggle('invalid', isInvalid);
        row.querySelector('.tp-mtp-range').setAttribute('aria-invalid', String(isInvalid));
        row.querySelector('.tp-mtp-percent').setAttribute('aria-invalid', String(isInvalid));
      });
    }
    return { valid: invalid.size === 0, rows: parsed.map(({ range, percent }) => ({ range, percent })) };
  }

  function renderMarketTpExceptions() {
    refs.mtpExceptionRows.replaceChildren();
    marketTpExceptions.forEach((data, index) => {
      const row = document.createElement('div');
      row.className = 'tp-mtp-exception-row';
      row.innerHTML = '<label>Buy range<input class="tp-mtp-range" type="text" inputmode="decimal" placeholder="20-40"></label><label>TP %<input class="tp-mtp-percent" type="number" min="0.01" step="0.01" placeholder="50"></label><button class="tp-remove-mtp-exception" type="button" title="Remove exception">×</button>';
      row.querySelector('.tp-mtp-range').value = data.range;
      row.querySelector('.tp-mtp-percent').value = data.percent;
      row.querySelector('.tp-remove-mtp-exception').dataset.index = String(index);
      refs.mtpExceptionRows.append(row);
    });
    validateMarketTpExceptionRows();
  }

  function marketTpPercentForFill(fillPrice, fallbackPercent, exceptions) {
    const match = exceptions.find(exception => {
      const range = marketTpRange(exception.range);
      return range && fillPrice + 1e-9 >= range.min && fillPrice - 1e-9 <= range.max;
    });
    return match ? takeProfitPercent(match.percent) : fallbackPercent;
  }

  function marketFillPrice(result, usd, matchedShares) {
    const confirmedPrice = confirmedExecutionPrice(result);
    if (confirmedPrice != null) return confirmedPrice;
    const budgetPrice = usd / matchedShares;
    return budgetPrice > 0 && budgetPrice < 1 ? budgetPrice : null;
  }

  function confirmedExecutionPrice(result) {
    const response = result?.response || result || {};
    const makingAmount = Number(response.makingAmount ?? response.making_amount);
    const takingAmount = Number(response.takingAmount ?? response.taking_amount);
    if (makingAmount > 0 && takingAmount > 0) {
      const executionPrice = Math.min(makingAmount, takingAmount) / Math.max(makingAmount, takingAmount);
      if (executionPrice > 0 && executionPrice < 1) return executionPrice;
    }
    const order = result?.postSubmitStatus?.order;
    const statusPrice = Number(order?.average_price ?? order?.avg_price ?? order?.price);
    if (statusPrice > 0 && statusPrice < 1) return statusPrice;
    return null;
  }

  function quickPrice(outcome) {
    const value = outcomePrice(outcome);
    if (value == null) return null;
    const result = Math.round((value - .01) * 100) / 100;
    return result >= .01 ? result : null;
  }

  function quickOrderSize(usd, openPrice) {
    if (!(usd > 0) || !(openPrice > 0 && openPrice < 1)) return null;
    const shares = Math.ceil(Math.max(5.1, usd / openPrice, 1 / openPrice));
    const roundedUsd = Math.ceil(shares * openPrice * 1e6 - 1e-9) / 1e6;
    return { shares, usd: Math.max(1, roundedUsd) };
  }

  function roundUpTwo(value) {
    return Math.ceil(value * 100 - 1e-9) / 100;
  }

  function sqOutcome() {
    if (upPrice == null) return '';
    return upPrice > .5 ? 'Down' : 'Up';
  }

  function positionShares(outcome) {
    return latestPositions.reduce((total, position) => {
      const sameMarket = !position.slug || position.slug === marketSlug;
      return sameMarket && String(position.outcome).toLowerCase() === outcome.toLowerCase()
        ? total + Math.max(0, Number(position.size) || 0)
        : total;
    }, 0);
  }

  function openSellShares(outcome) {
    return latestOrders.reduce((total, order) => {
      if (String(order.side || '').toLowerCase() !== 'sell' || String(order.outcome || '').toLowerCase() !== outcome.toLowerCase()) return total;
      const sameMarket = !(order.slug || order.market) || (order.slug || order.market) === marketSlug;
      if (!sameMarket) return total;
      const remainingValue = order.remainingSize ?? order.remaining_size ?? order.size_remaining;
      let remaining = remainingValue == null ? NaN : Number(remainingValue);
      if (!Number.isFinite(remaining)) {
        const size = Number(order.size ?? order.original_size ?? order.originalSize);
        const matched = Number(order.size_matched ?? order.matched_size ?? order.matchedSize);
        remaining = Number.isFinite(size) ? Math.max(0, size - (Number.isFinite(matched) ? matched : 0)) : 0;
      }
      return total + Math.max(0, remaining);
    }, 0);
  }

  function formatShares(value) {
    return Number(value).toFixed(4).replace(/\.?0+$/, '');
  }

  function oppositeOutcome(outcome) {
    return outcome === 'Up' ? 'Down' : 'Up';
  }

  function updateSqPreview() {
    const upShares = positionShares('Up');
    const downShares = positionShares('Down');
    refs.sqUpShares.textContent = formatShares(upShares);
    refs.sqDownShares.textContent = formatShares(downShares);
    const outcome = sqOutcome();
    if (!outcome) {
      refs.sqSide.textContent = 'Waiting for price';
      refs.sqAvailable.textContent = '0 available';
      refs.sqPlan.textContent = 'Waiting for positions';
      refs.sqSubmit.disabled = true;
      return;
    }
    const currentPrice = outcomePrice(outcome);
    const availableShares = Math.max(0, positionShares(outcome) - openSellShares(outcome));
    const otherOutcome = oppositeOutcome(outcome);
    const otherShares = Math.max(0, positionShares(otherOutcome) - openSellShares(otherOutcome));
    const pairedShares = Math.min(availableShares, otherShares);
    const percent = takeProfitPercent(refs.sqPercent.value);
    const estimatedLimitPrice = percent != null ? roundUpTwo((1 - currentPrice) * (1 + percent)) : null;
    refs.sqSide.textContent = `Market sell ${outcome.toUpperCase()} @ ~${currentPrice.toFixed(3)}`;
    refs.sqAvailable.textContent = `${formatShares(pairedShares)} paired`;
    refs.sqPlan.textContent = estimatedLimitPrice == null
      ? `Sell ${formatShares(pairedShares)} ${outcome}, then ${formatShares(pairedShares)} ${otherOutcome}: enter TP %`
      : `Sell ${formatShares(pairedShares)} ${outcome}, then ${formatShares(pairedShares)} ${otherOutcome} @ ~${estimatedLimitPrice.toFixed(2)}`;
    refs.sqSubmit.disabled = socket?.readyState !== WebSocket.OPEN
      || !(pairedShares > 0 && percent != null && estimatedLimitPrice >= .01 && estimatedLimitPrice < 1);
  }

  function updateButtonPrices() {
    refs.buyUp.textContent = 'Up';
    refs.buyDown.textContent = 'Down';
  }

  function updateMintState() {
    const validSlug = /^btc-updown-5m-\d+$/.test(selectedMintSlug);
    const shares = Number(refs.amount.value);
    refs.mintSubmit.disabled = mintMarketsInFlight || !(validSlug && shares > 0 && shares <= 1000000);
    [...refs.mintMarkets.querySelectorAll('button')].forEach(button => {
      button.classList.toggle('active', button.dataset.slug === selectedMintSlug);
      button.setAttribute('aria-pressed', String(button.dataset.slug === selectedMintSlug));
    });
  }

  function renderMintMarkets(serverTime) {
    refs.mintMarkets.replaceChildren();
    mintMarkets.forEach((market, index) => {
      const button = document.createElement('button');
      const start = new Date(market.startsAt * 1000);
      const end = new Date(market.endsAt * 1000);
      const time = `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}-${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      button.type = 'button';
      button.dataset.slug = market.slug;
      button.innerHTML = `<span>${index === 0 ? 'Current' : `Next +${index * 5}m`} <b>${time}</b></span><strong>${market.slug}</strong>`;
      refs.mintMarkets.append(button);
    });
    refs.mintClock.textContent = `Server ${new Date(serverTime).toLocaleTimeString()}`;
    updateMintState();
  }

  async function refreshMintMarkets() {
    if (mintMarketsInFlight) return;
    mintMarketsInFlight = true;
    refs.mintRefresh.disabled = true;
    refs.mintClock.textContent = 'Checking server time';
    updateMintState();
    try {
      const response = await chrome.runtime.sendMessage({ type: 'polymarket-trading-mint-markets' });
      if (!response?.ok) throw new Error(response?.error || 'Could not get mint markets.');
      mintMarkets = Array.isArray(response.markets) ? response.markets : [];
      if (!mintMarkets.some(item => item.slug === selectedMintSlug)) selectedMintSlug = mintMarkets[0]?.slug || '';
      renderMintMarkets(response.serverTime);
    } catch (error) {
      mintMarkets = [];
      selectedMintSlug = '';
      refs.mintMarkets.replaceChildren();
      refs.mintClock.textContent = 'Server time unavailable';
      setOutput(error.message || 'Could not get mint markets.', 'failure');
    } finally {
      mintMarketsInFlight = false;
      refs.mintRefresh.disabled = false;
      updateMintState();
    }
  }

  function updateMode() {
    refs.tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.mode === mode));
    refs.amountField.hidden = mode === 'sq';
    refs.amountField.firstChild.nodeValue = mode === 'mint' ? 'Shares' : 'USD';
    refs.priceField.hidden = mode !== 'limit';
    refs.buyMinField.hidden = mode !== 'market';
    refs.timeoutField.hidden = mode === 'market' || mode === 'multi-limit' || mode === 'market-tp' || mode === 'sq' || mode === 'mint';
    refs.takeProfitField.hidden = mode !== 'limit';
    refs.percentField.hidden = mode !== 'quick' && mode !== 'market-tp';
    refs.percentField.firstChild.nodeValue = mode === 'market-tp' ? 'General TP %' : 'TP %';
    refs.multi.hidden = mode !== 'multi-limit';
    refs.mtpExceptions.hidden = mode !== 'market-tp';
    refs.sq.hidden = mode !== 'sq';
    refs.mint.hidden = mode !== 'mint';
    refs.actions.hidden = mode === 'sq' || mode === 'mint';
    if (mode === 'multi-limit') renderMultiRows();
    if (mode === 'market-tp') renderMarketTpExceptions();
    if (mode === 'sq') updateSqPreview();
    if (mode === 'mint') {
      updateMintState();
      void refreshMintMarkets();
    }
    updateButtonPrices();
    void saveOrderSettings();
  }

  function readMultiRows() {
    const rows = [...refs.rows.querySelectorAll('.tp-row')].map(row => ({
      openPrice: row.querySelector('.tp-open').value,
      takeProfitPrice: row.querySelector('.tp-row-tp').value,
      timeout: row.querySelector('.tp-row-timeout').value
    }));
    return rows.length ? rows : multiRows;
  }

  function renderMultiRows() {
    refs.rows.replaceChildren();
    multiRows.forEach((data, index) => {
      const row = document.createElement('div');
      row.className = 'tp-row';
      row.innerHTML = '<label>Open<input class="tp-open" type="number" min="0.001" max="0.999" step="0.001"></label><label>TP<input class="tp-row-tp" type="number" min="0.001" max="0.999" step="0.001"></label><label>Sec<input class="tp-row-timeout" type="number" min="1" step="1"></label><button class="tp-remove-row" type="button">×</button>';
      row.querySelector('.tp-open').value = data.openPrice;
      row.querySelector('.tp-row-tp').value = data.takeProfitPrice;
      row.querySelector('.tp-row-timeout').value = data.timeout;
      const remove = row.querySelector('.tp-remove-row');
      remove.dataset.index = String(index);
      remove.disabled = multiRows.length === 1;
      refs.rows.append(row);
    });
  }

  function orderSettings() {
    return {
      mode, amount: refs.amount.value, amounts: { ...modeAmounts, [mode]: refs.amount.value },
      price: refs.price.value, buyMinimum: refs.buyMin.checked,
      timeout: refs.timeout.value, takeProfitPrice: refs.takeProfit.value, percent: refs.percent.value,
      sqPercent: refs.sqPercent.value,
      multiRows: readMultiRows(), marketTpExceptions: marketTpExceptions.map(row => ({ ...row }))
    };
  }

  async function saveOrderSettings() {
    if (refs.mtpExceptionRows.childElementCount) {
      const exceptions = validateMarketTpExceptionRows();
      if (!exceptions.valid) return false;
      marketTpExceptions = exceptions.rows;
    }
    multiRows = readMultiRows();
    modeAmounts[mode] = refs.amount.value;
    await chrome.storage.local.set({ nativeTradingPanelSettings: orderSettings() });
    return true;
  }

  async function restoreSettings() {
    const { nativeTradingPanelSettings: saved = {}, tradingPanelMinimized = false, tradingPanelPosition = null, tradingPanelSize = null, tradingPanelSidePanelEnabled = false } = await chrome.storage.local.get({
      nativeTradingPanelSettings: {}, tradingPanelMinimized: false, tradingPanelPosition: null, tradingPanelSize: null, tradingPanelSidePanelEnabled: false
    });
    if (['market', 'limit', 'quick', 'multi-limit', 'market-tp', 'sq', 'mint'].includes(saved.mode)) mode = saved.mode;
    if (saved.amounts && typeof saved.amounts === 'object') {
      for (const savedMode of Object.keys(modeAmounts)) {
        if (saved.amounts[savedMode] != null) modeAmounts[savedMode] = String(saved.amounts[savedMode]);
      }
    } else if (saved.amount != null) {
      modeAmounts[mode] = String(saved.amount);
    }
    refs.amount.value = modeAmounts[mode];
    if (saved.price != null) refs.price.value = saved.price;
    refs.buyMin.checked = Boolean(saved.buyMinimum);
    if (saved.timeout != null) refs.timeout.value = saved.timeout;
    if (saved.takeProfitPrice != null) refs.takeProfit.value = saved.takeProfitPrice;
    if (saved.percent != null) refs.percent.value = saved.percent;
    if (saved.sqPercent != null) refs.sqPercent.value = saved.sqPercent;
    if (Array.isArray(saved.multiRows) && saved.multiRows.length) multiRows = saved.multiRows;
    if (Array.isArray(saved.marketTpExceptions)) {
      const restoredExceptions = validateMarketTpExceptionRows(saved.marketTpExceptions, false);
      if (restoredExceptions.valid) marketTpExceptions = restoredExceptions.rows;
    }
    if (!isSidePanel && tradingPanelPosition) {
      shell.style.left = `${tradingPanelPosition.left}px`;
      shell.style.top = `${tradingPanelPosition.top}px`;
      shell.style.right = 'auto';
      shell.style.bottom = 'auto';
    }
    if (!isSidePanel && tradingPanelSize) {
      shell.style.width = `${tradingPanelSize.width}px`;
      shell.style.height = `${tradingPanelSize.height}px`;
    }
    shell.classList.toggle('minimized', !isSidePanel && Boolean(tradingPanelMinimized));
    shell.classList.toggle('side-panel-enabled', !isSidePanel && Boolean(tradingPanelSidePanelEnabled));
    if (!isSidePanel) requestAnimationFrame(() => {
      const rect = shell.getBoundingClientRect();
      if (rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight) {
        shell.style.left = `${Math.max(4, Math.min(innerWidth - shell.offsetWidth - 4, rect.left))}px`;
        shell.style.top = `${Math.max(4, Math.min(innerHeight - shell.offsetHeight - 4, rect.top))}px`;
        shell.style.right = 'auto';
        shell.style.bottom = 'auto';
      }
    });
    updateMode();
  }

  function rejectPending(message) {
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error(message));
    }
    pending.clear();
  }

  async function connectTrading() {
    clearTimeout(reconnectTimer);
    const previousSocket = socket;
    socket = null;
    if (previousSocket && previousSocket.readyState <= WebSocket.OPEN) previousSocket.close();
    clearInterval(refreshTimer);
    let tradeSocketUrl;
    try {
      const stored = await chrome.storage.local.get({ [SERVER_CONFIG_KEY]: {} });
      tradeSocketUrl = String(stored[SERVER_CONFIG_KEY]?.tradeSocketUrl || '').trim();
      if (!/^wss?:\/\/[^/]+$/i.test(tradeSocketUrl)) throw new Error('Open server settings and configure the trading WebSocket URL.');
    } catch (error) {
      setConnection('Not configured');
      setOutput(error.message, 'failure');
      return;
    }
    setConnection('Connecting');
    setOutput(`Connecting to ${tradeSocketUrl}...`);
    const ws = new WebSocket(tradeSocketUrl);
    socket = ws;
    ws.onopen = () => {
      if (socket !== ws) return;
      setConnection('Connected', true);
      setOutput('Connected to trading server.', 'success');
      void refreshAccount();
      clearInterval(refreshTimer);
      refreshTimer = setInterval(refreshAccount, 1500);
    };
    ws.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'welcome') return;
        const request = pending.get(message.id);
        if (!request) return;
        clearTimeout(request.timeout);
        pending.delete(message.id);
        if (message.ok) request.resolve(message.response?.body ?? message.response);
        else request.reject(new Error(message.error?.message || message.response?.body?.message || message.response?.body?.error || 'Trading command failed.'));
      } catch (error) {
        setOutput(error.message, 'failure');
      }
    };
    ws.onerror = () => setConnection('Socket error');
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      clearInterval(refreshTimer);
      rejectPending('Trading socket disconnected.');
      setConnection('Reconnecting');
      reconnectTimer = setTimeout(connectTrading, 1500);
    };
  }

  function tradeCommand(command, params = {}) {
    return new Promise((resolve, reject) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return reject(new Error('Trading socket is not connected.'));
      const id = `extension-${Date.now()}-${++requestId}`;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${command} timed out.`));
      }, 60000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, command, params }));
    });
  }

  function renderAccount(positions, orders) {
    latestPositions = positions || [];
    latestOrders = orders || [];
    updateSqPreview();
    const signature = JSON.stringify({
      marketSlug,
      positions: (positions || []).map(position => ({
        slug: position.slug || marketSlug,
        outcome: position.outcome || '?',
        size: position.size ?? null,
        avgPrice: position.avgPrice ?? null,
        currentValue: position.currentValue ?? null
      })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      orders: (orders || []).map(order => ({
        id: order.id ?? order.order_id ?? order.orderId ?? order.orderID ?? order.hash ?? null,
        slug: order.slug || order.market || marketSlug,
        outcome: order.outcome || '?',
        side: String(order.side || '').toLowerCase(),
        price: order.price ?? null,
        size: order.size ?? order.original_size ?? order.originalSize ?? null,
        matched: order.size_matched ?? order.matched_size ?? order.matchedSize ?? null,
        remaining: order.remainingSize ?? order.remaining_size ?? order.size_remaining ?? null
      })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    });
    if (signature === renderedAccountSignature) return;
    renderedAccountSignature = signature;
    refs.list.replaceChildren();
    const items = [];
    for (const position of positions || []) items.push({ type: 'position', value: position });
    for (const order of orders || []) items.push({ type: 'order', value: order });
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'tp-empty';
      empty.textContent = 'No open positions or orders';
      refs.list.append(empty);
      return;
    }
    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'tp-item';
      if (item.type === 'position') {
        const position = item.value;
        const slug = position.slug || marketSlug;
        const outcome = position.outcome || '?';
        const shares = Number(position.size);
        const title = document.createElement('strong');
        title.textContent = `POSITION · ${outcome} · ${position.size ?? '?'} @ ${position.avgPrice ?? '?'}`;
        const market = document.createElement('span');
        market.textContent = slug;
        const controls = document.createElement('div');
        controls.className = 'tp-item-actions';
        if (shares >= 5) {
          const input = document.createElement('input');
          input.className = 'tp-sell-price';
          input.type = 'number'; input.min = '.001'; input.max = '.999'; input.step = '.001';
          input.value = Math.min(.999, Math.max(.001, Number(position.currentValue) / shares || Number(position.avgPrice) || .01)).toFixed(3);
          controls.append(input, actionButton('Limit sell', 'limit-sell', { slug, outcome, shares }));
        }
        controls.append(actionButton('Sell now', 'sell-now', { slug, outcome, shares }));
        row.append(title, market, controls);
      } else {
        const order = item.value;
        const id = order.id ?? order.order_id ?? order.orderId ?? order.orderID ?? order.hash;
        const title = document.createElement('strong');
        title.textContent = `ORDER · ${String(order.side || '').toUpperCase()} ${order.outcome || '?'} · ${order.price ?? '?'}`;
        const market = document.createElement('span');
        market.textContent = order.slug || order.market || marketSlug;
        row.append(title, market);
        if (id && String(order.side || '').toLowerCase() === 'buy') {
          row.append(actionButton('Cancel', 'cancel', { id, slug: order.slug || order.market || marketSlug, outcome: order.outcome || '', side: 'buy' }));
        }
      }
      refs.list.append(row);
    }
  }

  function actionButton(label, action, data) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.action = action;
    for (const [key, value] of Object.entries(data)) button.dataset[key] = String(value);
    return button;
  }

  async function refreshAccount({ showBusy = false } = {}) {
    if (!marketSlug || !socket || socket.readyState !== WebSocket.OPEN || accountRefreshInFlight) return;
    accountRefreshInFlight = true;
    if (showBusy) refs.refresh.disabled = true;
    try {
      const [balances, positions, upOrders, downOrders] = await Promise.all([
        tradeCommand('balances'), tradeCommand('positions_open', { slug: marketSlug }),
        tradeCommand('orders_open', { slug: marketSlug, outcome: 'Up' }), tradeCommand('orders_open', { slug: marketSlug, outcome: 'Down' })
      ]);
      const balance = Number(balances?.balances?.pUSD?.balance);
      const balanceText = Number.isFinite(balance) ? `$${balance.toFixed(2)}` : '--';
      if (refs.balance.textContent !== balanceText) refs.balance.textContent = balanceText;
      renderAccount(positions?.positions || [], [
        ...(Array.isArray(upOrders) ? upOrders : upOrders?.orders || []),
        ...(Array.isArray(downOrders) ? downOrders : downOrders?.orders || [])
      ]);
    } catch (error) {
      setOutput(error.message, 'failure');
    } finally {
      accountRefreshInFlight = false;
      if (showBusy) refs.refresh.disabled = false;
    }
  }

  function normalizedInput(input) {
    const value = Number(input.value);
    return Number.isInteger(value) ? value / 100 : value;
  }

  async function placeOrder(outcome) {
    if (!marketSlug) return setOutput('Live market slug was not found on this page.', 'failure');
    const amount = Number(refs.amount.value);
    if (!(amount > 0) && mode !== 'market-tp' && !(mode === 'market' && refs.buyMin.checked)) return setOutput('Enter an amount greater than zero.', 'failure');
    const base = { slug: marketSlug, outcome, source: 'browser-extension', extraMessage: 'native page-panel order' };
    let command = mode === 'market' || mode === 'market-tp' ? 'order_market' : 'order_limit_advanced';
    let requests = [];
    let marketTpConfig = null;
    if (mode === 'market' || mode === 'market-tp') {
      const maxPrice = marketMaxPrice(outcome);
      if (maxPrice == null) return setOutput('Current Polymarket price is not available on the page.', 'failure');
      if (mode === 'market-tp') {
        const percent = takeProfitPercent(refs.percent.value);
        if (percent == null) {
          return setOutput('Enter a TP percentage greater than zero. Use 30 or 0.3 for 30%.', 'failure');
        }
        const exceptions = validateMarketTpExceptionRows();
        if (!exceptions.valid) {
          return setOutput('Fix invalid or overlapping M-TP price ranges before placing an order.', 'failure');
        }
        marketTpConfig = { fallbackPercent: percent, exceptions: exceptions.rows };
        const adjustedUsd = marketTakeProfitUsd(outcome, amount);
        if (adjustedUsd == null) return setOutput('Current Polymarket price is not available on the page.', 'failure');
        requests = [{ ...base, side: 'buy', usd: adjustedUsd, orderType: 'FOK', maxPrice, takeProfitPercent: percent }];
      } else {
        requests = [{ ...base, side: 'buy', usd: refs.buyMin.checked ? Math.max(amount || 0, Math.ceil(maxPrice * 5.1 * 1e6) / 1e6) : amount, orderType: 'FAK', maxPrice }];
      }
    } else if (mode === 'multi-limit') {
      multiRows = readMultiRows();
      for (const [index, row] of multiRows.entries()) {
        const openPrice = parsePrice(row.openPrice);
        const takeProfitPrice = parsePrice(row.takeProfitPrice);
        const timeout = Number(row.timeout);
        if (openPrice == null || takeProfitPrice == null || takeProfitPrice <= openPrice || !(timeout > 0)) return setOutput(`Invalid multi-limit row ${index + 1}.`, 'failure');
        requests.push({ ...base, usd: Math.max(amount, Math.ceil(openPrice * 5.1 * 1e6) / 1e6), openPrice, takeProfitPrice, timeout });
      }
    } else {
      const openPrice = mode === 'quick' ? quickPrice(outcome) : normalizedInput(refs.price);
      const timeout = Number(refs.timeout.value);
      const percent = mode === 'quick' ? takeProfitPercent(refs.percent.value) : null;
      if (mode === 'quick' && percent == null) return setOutput('Enter a TP percentage greater than zero. Use 30 or 0.3 for 30%.', 'failure');
      const takeProfitPrice = mode === 'quick'
        ? Math.ceil(openPrice * (1 + percent) * 100 - 1e-9) / 100
        : normalizedInput(refs.takeProfit);
      if (!(openPrice > 0 && openPrice < 1)) return setOutput('Entry price must be between 0 and 1.', 'failure');
      if (!(takeProfitPrice > openPrice && takeProfitPrice < 1)) return setOutput('TP price must be above entry and below 1.', 'failure');
      if (!(timeout > 0)) return setOutput('Timeout must be greater than zero.', 'failure');
      const quickSize = mode === 'quick' ? quickOrderSize(amount, openPrice) : null;
      if (mode === 'quick' && !quickSize) return setOutput('Quick order size could not be calculated.', 'failure');
      requests = [{
        ...base,
        usd: mode === 'quick' ? quickSize.usd : Math.max(amount, Math.ceil(openPrice * 5.1 * 1e6) / 1e6),
        openPrice, takeProfitPrice, timeout
      }];
    }
    refs.buyUp.disabled = refs.buyDown.disabled = true;
    setOutput(`Submitting ${requests.length} ${outcome} order${requests.length === 1 ? '' : 's'}…`);
    try {
      let successMessage = 'Order submitted successfully.';
      for (const params of requests) {
        const result = await tradeCommand(command, params);
        if (mode === 'market-tp') {
          const matchedShares = Number(result?.postSubmitStatus?.order?.size_matched);
          if (!(matchedShares >= MARKET_TP_MIN_SHARES)) {
            setOutput(`M-TP was not fully filled for at least ${MARKET_TP_MIN_SHARES} shares. No TP order was placed.`, 'failure');
            await refreshAccount();
            return;
          }
          const fillPrice = marketFillPrice(result, params.usd, matchedShares);
          if (fillPrice == null) {
            throw new Error(`M-TP bought ${matchedShares} shares, but the confirmed fill price was unavailable. TP was not placed.`);
          }
          const selectedPercent = marketTpPercentForFill(fillPrice, marketTpConfig.fallbackPercent, marketTpConfig.exceptions);
          const takeProfitPrice = Math.min(.999, Math.ceil(fillPrice * (1 + selectedPercent) * 1000 - 1e-9) / 1000);
          let takeProfitError = null;
          for (let attempt = 1; attempt <= 5; attempt += 1) {
            try {
              await tradeCommand('order_limit', {
                ...base, side: 'sell', shares: matchedShares, price: takeProfitPrice,
                extraMessage: `native page-panel M-TP take profit (attempt ${attempt}/5)`
              });
              takeProfitError = null;
              break;
            } catch (error) {
              takeProfitError = error;
              if (attempt < 5) {
                setOutput(`TP sell attempt ${attempt}/5 failed; retrying in 0.3 seconds…`, 'failure');
                await wait(300);
              }
            }
          }
          if (takeProfitError) {
            throw new Error(`M-TP bought ${matchedShares} shares, but TP placement failed after 5 attempts: ${takeProfitError.message}`);
          }
          successMessage = `M-TP bought ${matchedShares} shares @ ${fillPrice.toFixed(3)}; ${(selectedPercent * 100).toFixed(2).replace(/\.00$/, '')}% TP set @ ${takeProfitPrice.toFixed(3)}.`;
        }
      }
      setOutput(successMessage, 'success');
      await refreshAccount();
    } catch (error) {
      setOutput(error.message, 'failure');
    } finally {
      const disabled = socket?.readyState !== WebSocket.OPEN;
      refs.buyUp.disabled = refs.buyDown.disabled = disabled;
    }
  }

  async function placeSqOrders() {
    if (!marketSlug) return setOutput('Live market slug was not found on this page.', 'failure');
    const outcome = sqOutcome();
    if (!outcome) return setOutput('Current Polymarket price is not available on the page.', 'failure');
    const availableShares = Math.max(0, positionShares(outcome) - openSellShares(outcome));
    const otherOutcome = oppositeOutcome(outcome);
    const otherShares = Math.max(0, positionShares(otherOutcome) - openSellShares(otherOutcome));
    const pairedShares = Math.min(availableShares, otherShares);
    const percent = takeProfitPercent(refs.sqPercent.value);
    if (!(pairedShares > 0)) return setOutput('SQ requires an available matched quantity of both UP and DOWN contracts.', 'failure');
    if (!(percent > 0)) return setOutput('Enter an SQ TP percentage greater than zero. Use 20 or 0.2 for 20%.', 'failure');
    const estimatedLimitPrice = roundUpTwo(outcomePrice(otherOutcome) * (1 + percent));
    if (!(estimatedLimitPrice >= .01 && estimatedLimitPrice < 1)) {
      return setOutput(`The estimated ${otherOutcome} limit price ${estimatedLimitPrice.toFixed(2)} is outside the valid market range.`, 'failure');
    }
    const base = { slug: marketSlug, outcome, source: 'browser-extension' };
    refs.sqSubmit.disabled = true;
    setOutput(`Market selling ${formatShares(pairedShares)} ${outcome} paired contracts…`);
    let marketSold = false;
    try {
      const result = await tradeCommand('order_market', {
        ...base, side: 'sell', shares: pairedShares, orderType: 'FAK',
        extraMessage: 'native page-panel SQ market sell'
      });
      const matchedShares = Number(result?.postSubmitStatus?.order?.size_matched);
      if (!(matchedShares > 0)) throw new Error('the market sell returned no confirmed matched contracts');
      marketSold = true;
      const averageSoldPrice = confirmedExecutionPrice(result);
      if (averageSoldPrice == null) throw new Error('the market sell average execution price was unavailable');
      const limitPrice = roundUpTwo((1 - averageSoldPrice) * (1 + percent));
      if (!(limitPrice >= .01 && limitPrice < 1)) {
        throw new Error(`the calculated ${otherOutcome} limit price ${limitPrice.toFixed(2)} is outside the valid market range`);
      }
      setOutput(`Sold ${formatShares(matchedShares)} ${outcome} @ ${averageSoldPrice.toFixed(3)}; placing ${otherOutcome} limit sell @ ${limitPrice.toFixed(2)}…`);
      await tradeCommand('order_limit', {
        ...base, outcome: otherOutcome, side: 'sell', shares: matchedShares, price: limitPrice,
        extraMessage: 'native page-panel SQ opposite-side limit sell'
      });
      setOutput(`SQ sold ${formatShares(matchedShares)} ${outcome} @ ${averageSoldPrice.toFixed(3)}; matching limit sell placed for ${formatShares(matchedShares)} ${otherOutcome} @ ${limitPrice.toFixed(2)}.`, 'success');
      await refreshAccount();
    } catch (error) {
      setOutput(`${marketSold ? 'SQ market sell completed, but the opposite limit sell failed' : 'SQ market sell failed'}: ${error.message}`, 'failure');
      await refreshAccount();
    } finally {
      updateSqPreview();
    }
  }

  async function mintTokens() {
    const slug = selectedMintSlug;
    const shares = Number(refs.amount.value);
    if (!/^btc-updown-5m-\d+$/.test(slug)) {
      return setOutput('Minting requires a BTC 5-minute market.', 'failure');
    }
    if (!(shares > 0 && shares <= 1000000)) {
      return setOutput('Shares must be between 0 and 1,000,000.', 'failure');
    }

    refs.mintSubmit.disabled = true;
    setOutput(`Minting ${formatShares(shares)} UP + DOWN tokens...`);
    try {
      const response = await chrome.runtime.sendMessage({ type: 'polymarket-trading-mint', slug, shares });
      if (!response?.ok) throw new Error(response?.error || 'Mint request failed.');
      const transactionHash = response.data?.transactionHash || response.data?.transaction_hash || response.data?.txHash;
      const transactionLabel = transactionHash ? ` Transaction ${String(transactionHash).slice(0, 14)}...` : '';
      setOutput(`Minted ${formatShares(shares)} UP + DOWN tokens.${transactionLabel}`, 'success');
      await refreshAccount();
    } catch (error) {
      setOutput(error.message || 'Mint request failed.', 'failure');
    } finally {
      updateMintState();
    }
  }

  async function handleAccountAction(button) {
    button.disabled = true;
    try {
      if (button.dataset.action === 'cancel') {
        await tradeCommand('order_cancel', { id: button.dataset.id, orderId: button.dataset.id, slug: button.dataset.slug, outcome: button.dataset.outcome, side: 'buy', source: 'browser-extension' });
      } else {
        const sellNow = button.dataset.action === 'sell-now';
        const params = { slug: button.dataset.slug, outcome: button.dataset.outcome, side: 'sell', shares: Number(button.dataset.shares), source: 'browser-extension' };
        if (sellNow) params.orderType = 'FAK';
        else params.price = normalizedInput(button.parentElement.querySelector('.tp-sell-price'));
        await tradeCommand(sellNow ? 'order_market' : 'order_limit', params);
      }
      setOutput('Trading action submitted.', 'success');
      await refreshAccount();
    } catch (error) {
      setOutput(error.message, 'failure');
      button.disabled = false;
    }
  }

  refs.tabs.forEach(tab => tab.addEventListener('click', () => {
    modeAmounts[mode] = refs.amount.value;
    mode = tab.dataset.mode;
    refs.amount.value = modeAmounts[mode];
    updateMode();
  }));
  [refs.amount, refs.price, refs.buyMin, refs.timeout, refs.takeProfit, refs.percent].forEach(input => {
    input.addEventListener('change', saveOrderSettings);
  });
  refs.amount.addEventListener('input', () => {
    if (mode === 'mint') updateMintState();
  });
  refs.mintMarkets.addEventListener('click', event => {
    const button = event.target.closest('button[data-slug]');
    if (!button) return;
    selectedMintSlug = button.dataset.slug;
    updateMintState();
  });
  refs.mintRefresh.addEventListener('click', () => void refreshMintMarkets());
  refs.rows.addEventListener('change', saveOrderSettings);
  refs.rows.addEventListener('click', event => {
    const button = event.target.closest('.tp-remove-row');
    if (!button) return;
    multiRows = readMultiRows();
    multiRows.splice(Number(button.dataset.index), 1);
    renderMultiRows();
    void saveOrderSettings();
  });
  refs.addRow.addEventListener('click', () => {
    multiRows = readMultiRows();
    const last = multiRows.at(-1) || {};
    multiRows.push({ openPrice: last.openPrice || '.55', takeProfitPrice: last.takeProfitPrice || '.65', timeout: last.timeout || '10' });
    renderMultiRows();
    void saveOrderSettings();
  });
  refs.mtpExceptionRows.addEventListener('input', () => {
    const validation = validateMarketTpExceptionRows();
    if (!validation.valid) return;
    marketTpExceptions = validation.rows;
    void saveOrderSettings();
  });
  refs.mtpExceptionRows.addEventListener('click', event => {
    const button = event.target.closest('.tp-remove-mtp-exception');
    if (!button) return;
    const rows = readMarketTpExceptionRows();
    rows.splice(Number(button.dataset.index), 1);
    marketTpExceptions = rows;
    renderMarketTpExceptions();
    void saveOrderSettings();
  });
  refs.addMtpException.addEventListener('click', () => {
    const current = validateMarketTpExceptionRows();
    if (!current.valid) {
      setOutput('Fix the invalid or overlapping M-TP range before adding another.', 'failure');
      return;
    }
    marketTpExceptions = [...current.rows, { range: '', percent: '' }];
    renderMarketTpExceptions();
    refs.mtpExceptionRows.querySelector('.tp-mtp-exception-row:last-child .tp-mtp-range')?.focus();
  });
  refs.buyUp.addEventListener('click', () => void placeOrder('Up'));
  refs.buyDown.addEventListener('click', () => void placeOrder('Down'));
  refs.sqPercent.addEventListener('input', () => updateSqPreview());
  refs.sqPercent.addEventListener('change', saveOrderSettings);
  refs.sqSubmit.addEventListener('click', () => void placeSqOrders());
  refs.mintSubmit.addEventListener('click', () => void mintTokens());
  refs.settings.addEventListener('click', () => void chrome.runtime.openOptionsPage());
  refs.refresh.addEventListener('click', () => void refreshAccount({ showBusy: true }));
  refs.list.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (button) void handleAccountAction(button);
  });
  refs.minimize.addEventListener('click', async () => {
    if (isSidePanel) {
      const response = await chrome.runtime.sendMessage({ type: 'polymarket-trading-configure-side-panel', enabled: false });
      if (!response?.ok) setOutput(response?.error || 'Could not remove the Side Panel.', 'failure');
      return;
    }
    shell.classList.add('minimized');
    await chrome.storage.local.set({ tradingPanelMinimized: true });
  });
  refs.restore.addEventListener('click', async () => {
    shell.classList.remove('minimized');
    await chrome.storage.local.set({ tradingPanelMinimized: false });
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isSidePanel || message?.type !== 'polymarket-trading-market-snapshot') return false;
    scanPage();
    sendResponse({ marketSlug, upPrice });
    return false;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes[SERVER_CONFIG_KEY]) void connectTrading();
    if (!isSidePanel && changes.tradingPanelSidePanelEnabled) {
      shell.classList.toggle('side-panel-enabled', Boolean(changes.tradingPanelSidePanelEnabled.newValue));
    }
  });

  function enableDrag(handle) {
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button')) return;
      const rect = shell.getBoundingClientRect();
      const start = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      handle.setPointerCapture(event.pointerId);
      const move = moveEvent => {
        const left = Math.max(0, Math.min(innerWidth - shell.offsetWidth, start.left + moveEvent.clientX - start.x));
        const top = Math.max(0, Math.min(innerHeight - shell.offsetHeight, start.top + moveEvent.clientY - start.y));
        shell.style.left = `${left}px`; shell.style.top = `${top}px`; shell.style.right = 'auto'; shell.style.bottom = 'auto';
      };
      const end = async endEvent => {
        handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', end); handle.removeEventListener('pointercancel', end);
        if (handle.hasPointerCapture(endEvent.pointerId)) handle.releasePointerCapture(endEvent.pointerId);
        await chrome.storage.local.set({ tradingPanelPosition: { left: parseFloat(shell.style.left), top: parseFloat(shell.style.top) } });
      };
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
    });
  }
  if (!isSidePanel) {
    enableDrag(refs.header);
    enableDrag(refs.restore);
  }

  refs.resize.addEventListener('pointerdown', event => {
    const rect = shell.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height };
    refs.resize.setPointerCapture(event.pointerId);
    const move = moveEvent => {
      shell.style.width = `${Math.max(200, Math.min(innerWidth - 8, start.width + moveEvent.clientX - start.x))}px`;
      shell.style.height = `${Math.max(360, Math.min(innerHeight - 8, start.height + moveEvent.clientY - start.y))}px`;
    };
    const end = async endEvent => {
      refs.resize.removeEventListener('pointermove', move); refs.resize.removeEventListener('pointerup', end); refs.resize.removeEventListener('pointercancel', end);
      if (refs.resize.hasPointerCapture(endEvent.pointerId)) refs.resize.releasePointerCapture(endEvent.pointerId);
      await chrome.storage.local.set({ tradingPanelSize: { width: shell.offsetWidth, height: shell.offsetHeight } });
    };
    refs.resize.addEventListener('pointermove', move); refs.resize.addEventListener('pointerup', end); refs.resize.addEventListener('pointercancel', end);
  });

  if (isSidePanel) {
    setInterval(scanPage, 500);
  } else {
    new MutationObserver(records => {
      if (records.some(record => !shell.contains(record.target))) queueScan();
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  void restoreSettings();
  scanPage();
  connectTrading();
})();
