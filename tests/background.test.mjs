import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const backgroundSource = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');

function waitForMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test('action click falls back to direct content toggle when messaging remains unavailable', async () => {
  let clickHandler = null;
  const executedScripts = [];
  const sendAttempts = [];
  const chrome = {
    action: {
      onClicked: {
        addListener(callback) {
          clickHandler = callback;
        }
      }
    },
    runtime: {
      lastError: null
    },
    tabs: {
      sendMessage(tabId, message, callback) {
        sendAttempts.push({ tabId, message });
        chrome.runtime.lastError = { message: 'Could not establish connection. Receiving end does not exist.' };
        if (callback) {
          callback(undefined);
          chrome.runtime.lastError = null;
          return undefined;
        }
        chrome.runtime.lastError = null;
        return Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'));
      }
    },
    scripting: {
      executeScript(options, callback) {
        executedScripts.push(options);
        callback?.([{ result: true }]);
      }
    }
  };
  const context = vm.createContext({ chrome, console, setTimeout });

  vm.runInContext(backgroundSource, context, { filename: 'extension/background.js' });
  assert.equal(typeof clickHandler, 'function');

  clickHandler({ id: 17, url: 'https://www.youtube.com/' });
  await waitForMicrotasks();

  assert.equal(sendAttempts.length, 2);
  assert.equal(executedScripts[0].target.tabId, 17);
  assert.deepEqual(Array.from(executedScripts[0].files), ['content.js']);
  assert.equal(typeof executedScripts[1].func, 'function');
});

test('action click proceeds when activeTab omits the tab URL', async () => {
  let clickHandler = null;
  const sendAttempts = [];
  const chrome = {
    action: {
      onClicked: {
        addListener(callback) {
          clickHandler = callback;
        }
      }
    },
    runtime: {
      lastError: null
    },
    tabs: {
      sendMessage(tabId, message, callback) {
        sendAttempts.push({ tabId, message });
        callback({ status: 'ok' });
      }
    },
    scripting: {
      executeScript() {
        throw new Error('executeScript should not be needed when messaging succeeds');
      }
    }
  };
  const context = vm.createContext({ chrome, console, setTimeout });

  vm.runInContext(backgroundSource, context, { filename: 'extension/background.js' });

  clickHandler({ id: 23 });
  await waitForMicrotasks();

  assert.equal(sendAttempts.length, 1);
  assert.equal(sendAttempts[0].tabId, 23);
  assert.equal(sendAttempts[0].message.action, 'toggle_ui');
});

test('action click retries when YouTube replaces the active frame during loading', async () => {
  let clickHandler = null;
  let directToggleAttempts = 0;
  let fileInjectAttempts = 0;
  let getAttempts = 0;
  const sendAttempts = [];
  const chrome = {
    action: {
      onClicked: {
        addListener(callback) {
          clickHandler = callback;
        }
      }
    },
    runtime: {
      lastError: null
    },
    tabs: {
      get(tabId, callback) {
        getAttempts += 1;
        callback({ id: tabId, url: 'https://www.youtube.com/', status: getAttempts < 2 ? 'loading' : 'complete' });
      },
      sendMessage(tabId, message, callback) {
        sendAttempts.push({ tabId, message });
        chrome.runtime.lastError = { message: 'Could not establish connection. Receiving end does not exist.' };
        callback(undefined);
        chrome.runtime.lastError = null;
      }
    },
    scripting: {
      executeScript(options, callback) {
        if (options.files) {
          fileInjectAttempts += 1;
          callback([{ result: true }]);
          return;
        }

        directToggleAttempts += 1;
        if (directToggleAttempts === 1) {
          chrome.runtime.lastError = { message: 'Frame with ID 0 was removed.' };
          callback(undefined);
          chrome.runtime.lastError = null;
          return;
        }

        callback([{ result: true }]);
      }
    }
  };
  const context = vm.createContext({
    chrome,
    console,
    setTimeout(callback) {
      callback();
      return 1;
    }
  });

  vm.runInContext(backgroundSource, context, { filename: 'extension/background.js' });

  clickHandler({ id: 51, url: 'https://www.youtube.com/', status: 'loading' });
  await waitForMicrotasks();

  assert.ok(sendAttempts.length >= 2);
  assert.ok(fileInjectAttempts >= 2);
  assert.equal(directToggleAttempts, 2);
});
