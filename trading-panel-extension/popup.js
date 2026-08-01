const add = document.getElementById('add-side-panel');
const cancel = document.getElementById('cancel');
const message = document.getElementById('message');
const settings = document.getElementById('settings');

settings.addEventListener('click', () => chrome.runtime.openOptionsPage());

add.addEventListener('click', async () => {
  add.disabled = true;
  cancel.disabled = true;
  message.textContent = '';
  try {
    const response = await chrome.runtime.sendMessage({ type: 'polymarket-trading-configure-side-panel', enabled: true });
    if (!response?.ok) throw new Error(response?.error || 'Could not enable the side panel.');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.sidePanel.open({ windowId: tab.windowId });
    window.close();
  } catch (error) {
    message.textContent = error.message || 'Could not change the side panel setting.';
    add.disabled = false;
    cancel.disabled = false;
  }
});

cancel.addEventListener('click', () => window.close());
