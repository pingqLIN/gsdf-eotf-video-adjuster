const TOGGLE_MAX_ATTEMPTS = 5;
const TOGGLE_RETRY_DELAY_MS = 350;

function wait(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function sendToggleMessage(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { action: "toggle_ui" }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}

function executeScript(options) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(options, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(result);
    });
  });
}

function injectContentScript(tabId) {
  return executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

function invokeDirectToggle(tabId) {
  return executeScript({
    target: { tabId },
    func: () => {
      const contentApi = globalThis.__GSDF_EOTF_CONTENT__;
      if (!contentApi || typeof contentApi.toggleUI !== "function") {
        return false;
      }

      contentApi.toggleUI();
      return true;
    }
  });
}

function getTab(tabId) {
  return new Promise((resolve) => {
    if (!chrome.tabs.get) {
      resolve(null);
      return;
    }

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      resolve(tab);
    });
  });
}

function isSupportedWebTab(tab) {
  return Boolean(tab?.id) && (!tab.url || /^https?:\/\//.test(tab.url));
}

function isTransientActivationError(error) {
  const message = String(error?.message || error || '');

  return (
    /Frame with ID \d+ was removed/i.test(message) ||
    /The tab was closed/i.test(message) ||
    /No tab with id/i.test(message)
  );
}

async function activatePanel(tabId) {
  try {
    await sendToggleMessage(tabId);
    return;
  } catch {}

  try {
    await injectContentScript(tabId);
  } catch {}

  try {
    await sendToggleMessage(tabId);
    return;
  } catch {}

  await invokeDirectToggle(tabId);
}

async function togglePanel(tab) {
  if (!isSupportedWebTab(tab)) {
    return;
  }

  let lastError = null;

  for (let attempt = 0; attempt < TOGGLE_MAX_ATTEMPTS; attempt += 1) {
    const currentTab = attempt === 0 ? tab : await getTab(tab.id);
    if (currentTab && !isSupportedWebTab(currentTab)) {
      return;
    }

    if (currentTab?.status === 'loading' && attempt < TOGGLE_MAX_ATTEMPTS - 1) {
      await wait(TOGGLE_RETRY_DELAY_MS);
    }

    try {
      await activatePanel(tab.id);
      return;
    } catch (error) {
      lastError = error;
      if (!isTransientActivationError(error) || attempt === TOGGLE_MAX_ATTEMPTS - 1) {
        throw error;
      }
      await wait(TOGGLE_RETRY_DELAY_MS);
    }
  }

  if (lastError) {
    throw lastError;
  }
}

chrome.action.onClicked.addListener((tab) => {
  togglePanel(tab).catch(() => {});
});
