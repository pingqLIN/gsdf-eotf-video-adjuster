import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extensionDir = resolve(process.env.CODEX_CHROME_EXTENSION_ROOT || process.env.CHROME_EXTENSION_ROOT || resolve(repoRoot, 'extension'));
const extensionDirForChrome = extensionDir.replaceAll('\\', '/');
const outputDir = resolve(repoRoot, 'output', 'playwright');
const profileDir = resolve(outputDir, 'gsdf-extension-profile');
const screenshotPath = resolve(outputDir, 'gsdf-extension-smoke.png');
const chromePath = process.env.CHROME_PATH || findPlaywrightChromiumPath() || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const remoteDebuggingPort = Number(process.env.CHROME_DEBUG_PORT || 9338);
const targetUrl = process.argv[2] || process.env.SMOKE_URL || '';

function findPlaywrightChromiumPath() {
  if (!process.env.LOCALAPPDATA) {
    return null;
  }

  const browserRoot = resolve(process.env.LOCALAPPDATA, 'ms-playwright');
  if (!existsSync(browserRoot)) {
    return null;
  }

  const chromiumDirs = readdirSync(browserRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^chromium-\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => Number(right.replace('chromium-', '')) - Number(left.replace('chromium-', '')));

  for (const dir of chromiumDirs) {
    const candidate = resolve(browserRoot, dir, 'chrome-win64', 'chrome.exe');
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function jsonResponse(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

function startLocalServer() {
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      jsonResponse(res, 200, { ok: true });
      return;
    }

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>GSDF Extension Smoke</title>
    <style>
      body { margin: 0; min-height: 100vh; background: #111; color: white; font-family: sans-serif; }
      video { width: 640px; max-width: 80vw; margin: 48px; display: block; background: #222; }
    </style>
  </head>
  <body>
    <h1>GSDF Extension Smoke</h1>
    <video controls muted playsinline></video>
  </body>
</html>`);
  });

  return new Promise((resolveServer, rejectServer) => {
    server.once('error', rejectServer);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        rejectServer(new Error('Could not allocate local smoke server port'));
        return;
      }

      resolveServer({
        close: () => new Promise((resolveClose) => server.close(resolveClose)),
        url: `http://127.0.0.1:${address.port}/`
      });
    });
  });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} from ${url}`);
  }

  return response.json();
}

async function pollJson(url, predicate, timeoutMs = 15000) {
  const start = Date.now();
  let lastValue;
  let lastError;

  while (Date.now() - start < timeoutMs) {
    try {
      lastValue = await fetchJson(url);
      if (predicate(lastValue)) {
        return lastValue;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || JSON.stringify(lastValue)}`);
}

class CdpClient {
  constructor(webSocketUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.contexts = [];
    this.ws = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolveReady, rejectReady) => {
      this.ws.once('open', resolveReady);
      this.ws.once('error', rejectReady);
    });
    this.ws.on('message', (data) => {
      const message = JSON.parse(String(data));
      if (message.id && this.pending.has(message.id)) {
        const { resolveCommand, rejectCommand } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          rejectCommand(new Error(message.error.message));
          return;
        }
        resolveCommand(message.result);
        return;
      }

      this.events.push(message);
      if (message.method === 'Runtime.executionContextCreated') {
        this.contexts.push(message.params.context);
      }
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId;
    this.nextId += 1;
    const command = { id, method, params };

    return new Promise((resolveCommand, rejectCommand) => {
      this.pending.set(id, { resolveCommand, rejectCommand });
      this.ws.send(JSON.stringify(command));
    });
  }

  close() {
    this.ws.close();
  }
}

async function evaluate(client, expression, contextId) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    contextId,
    awaitPromise: true,
    returnByValue: true
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed');
  }

  return result.result.value;
}

async function waitForPageInteractive(page, timeoutMs = 20000) {
  const start = Date.now();
  let lastState = 'unknown';

  while (Date.now() - start < timeoutMs) {
    try {
      lastState = await evaluate(page, 'document.readyState');
      if (lastState && lastState !== 'loading') {
        return lastState;
      }
    } catch {
      // Navigation can briefly invalidate the execution context.
    }

    await delay(300);
  }

  throw new Error(`Timed out waiting for page to become interactive, last readyState=${lastState}`);
}

async function readIframeState(page) {
  return evaluate(page, `(() => {
    const iframe = document.getElementById('gsdf-eotf-ui-iframe');
    if (!iframe) {
      return { exists: false };
    }
    const rect = iframe.getBoundingClientRect();
    return Promise.resolve(fetch(iframe.src))
      .then((response) => response.text().then((text) => ({
        fetchOk: response.ok,
        fetchStatus: response.status,
        fetchTextStart: text.slice(0, 80)
      })))
      .catch((error) => ({
        fetchOk: false,
        fetchStatus: null,
        fetchError: String(error?.message || error)
      }))
      .then((fetchResult) => ({
      exists: true,
      src: iframe.src,
      display: getComputedStyle(iframe).display,
      visibility: getComputedStyle(iframe).visibility,
      opacity: getComputedStyle(iframe).opacity,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      zIndex: getComputedStyle(iframe).zIndex,
      fetchResult
    }));
  })()`);
}

async function waitForIframeState(page, timeoutMs = 10000) {
  const start = Date.now();
  let iframeState = { exists: false };

  while (Date.now() - start < timeoutMs) {
    iframeState = await readIframeState(page);
    if (iframeState.exists) {
      return iframeState;
    }

    await delay(300);
  }

  return iframeState;
}

async function runWorkerTabScript(worker, scriptBody) {
  return evaluate(worker, `new Promise((resolve) => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, ([tab]) => {
      if (!tab) {
        resolve({ ok: false, reason: 'no active tab' });
        return;
      }

      ${scriptBody}
    });
  })`);
}

async function getExtensionWorkerTarget(targets) {
  for (const target of targets.filter((entry) => entry.type === 'service_worker')) {
    const client = new CdpClient(target.webSocketDebuggerUrl);
    try {
      await client.send('Runtime.enable');
      const manifestName = await evaluate(client, 'chrome.runtime?.getManifest?.().name || null');
      if (manifestName === 'GSDF EOTF Video Adjuster') {
        return { target, client };
      }
    } catch {
      // Ignore unrelated browser service workers.
    }

    client.close();
  }

  return null;
}

async function pollExtensionWorker(port, timeoutMs = 15000) {
  const start = Date.now();
  let lastTargets = [];

  while (Date.now() - start < timeoutMs) {
    lastTargets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
    const worker = await getExtensionWorkerTarget(lastTargets);
    if (worker) {
      return worker;
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for GSDF EOTF Video Adjuster worker: ${JSON.stringify(lastTargets)}`);
}

async function tryPollExtensionWorker(port, timeoutMs = 5000) {
  try {
    return await pollExtensionWorker(port, timeoutMs);
  } catch (error) {
    return { target: null, client: null, reason: String(error?.message || error) };
  }
}

function findExtensionContext(contexts) {
  return contexts.find((context) => {
    return context.origin?.startsWith('chrome-extension://') || context.name?.includes('chrome-extension://');
  });
}

function getExtensionIdFromContext(context) {
  if (!context?.origin?.startsWith('chrome-extension://')) {
    return null;
  }

  return new URL(context.origin).hostname;
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  await rm(profileDir, { recursive: true, force: true });
  await mkdir(profileDir, { recursive: true });

  const localServer = targetUrl ? null : await startLocalServer();
  const url = targetUrl || localServer.url;
  const chromeArgs = [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${remoteDebuggingPort}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-component-extensions-with-background-pages',
    '--disable-popup-blocking',
    '--enable-logging=stderr',
    `--load-extension=${extensionDirForChrome}`,
    url
  ];
  const chrome = spawn(chromePath, chromeArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false
  });
  const stderrChunks = [];
  chrome.stderr.on('data', (chunk) => stderrChunks.push(String(chunk)));

  try {
    await pollJson(`http://127.0.0.1:${remoteDebuggingPort}/json/version`, (value) => Boolean(value.webSocketDebuggerUrl));
    const targets = await pollJson(
      `http://127.0.0.1:${remoteDebuggingPort}/json/list`,
      (value) => value.some((target) => target.type === 'page')
    );
    const pageTarget = targets.find((target) => target.type === 'page');
    const page = new CdpClient(pageTarget.webSocketDebuggerUrl);

    await page.send('Runtime.enable');
    await page.send('Page.enable');
    const readyState = await waitForPageInteractive(page);
    await delay(800);

    const isolatedContext = findExtensionContext(page.contexts);
    const extensionId = getExtensionIdFromContext(isolatedContext);
    const workerInfo = await tryPollExtensionWorker(remoteDebuggingPort);
    const worker = workerInfo.client;
    const contentStatus = isolatedContext
      ? await evaluate(page, 'globalThis.__GSDF_EOTF_CONTENT__?.status || null', isolatedContext.id)
      : null;
    const workerToggleType = worker ? await evaluate(worker, 'typeof togglePanel') : null;
    const triggerResult = worker
      ? await evaluate(worker, `new Promise((resolve) => {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, async ([tab]) => {
          try {
            if (!tab) {
              resolve({ ok: false, reason: 'no active tab' });
              return;
            }
            if (typeof togglePanel !== 'function') {
              resolve({ ok: false, reason: 'togglePanel missing', tab });
              return;
            }
            await togglePanel(tab);
            resolve({ ok: true, tab: { id: tab.id, url: tab.url } });
          } catch (error) {
            resolve({ ok: false, reason: String(error?.message || error), tab });
          }
        });
      })`)
      : isolatedContext
        ? await evaluate(page, `(() => {
          const api = globalThis.__GSDF_EOTF_CONTENT__;
          if (!api || typeof api.toggleUI !== 'function') {
            return {
              ok: false,
              reason: 'content api missing',
              hasApi: Boolean(api),
              status: api?.status || null
            };
          }

          api.toggleUI();
          return {
            ok: true,
            status: api.status,
            state: typeof api.getState === 'function' ? api.getState() : null
          };
        })()`, isolatedContext.id)
        : { ok: false, reason: 'extension content script context missing' };
    let iframeState = await waitForIframeState(page);
    let manualInjectResult = null;
    let manualDirectToggleResult = null;

    if (!iframeState.exists && worker) {
      manualInjectResult = await runWorkerTabScript(worker, `chrome.scripting.executeScript(
        { target: { tabId: tab.id }, files: ['content.js'] },
        (results) => {
          resolve({
            ok: !chrome.runtime.lastError,
            reason: chrome.runtime.lastError?.message || null,
            results,
            tab: { id: tab.id, url: tab.url, status: tab.status }
          });
        }
      );`);
      await delay(500);
      manualDirectToggleResult = await runWorkerTabScript(worker, `chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          func: () => {
            const api = globalThis.__GSDF_EOTF_CONTENT__;
            if (!api || typeof api.toggleUI !== 'function') {
              return {
                ok: false,
                hasApi: Boolean(api),
                status: api?.status || null
              };
            }

            api.toggleUI();
            return {
              ok: true,
              status: api.status,
              state: typeof api.getState === 'function' ? api.getState() : null
            };
          }
        },
        (results) => {
          resolve({
            ok: !chrome.runtime.lastError,
            reason: chrome.runtime.lastError?.message || null,
            results,
            tab: { id: tab.id, url: tab.url, status: tab.status }
          });
        }
      );`);
      iframeState = await waitForIframeState(page, 5000);
    } else if (!iframeState.exists && isolatedContext) {
      manualDirectToggleResult = await evaluate(page, `(() => {
        const api = globalThis.__GSDF_EOTF_CONTENT__;
        if (!api || typeof api.toggleUI !== 'function') {
          return {
            ok: false,
            hasApi: Boolean(api),
            status: api?.status || null
          };
        }

        api.toggleUI();
        return {
          ok: true,
          status: api.status,
          state: typeof api.getState === 'function' ? api.getState() : null
        };
      })()`, isolatedContext.id);
      iframeState = await waitForIframeState(page, 5000);
    }
    if (iframeState.exists) {
      await delay(1000);
      iframeState = await readIframeState(page);
    }
    const exceptions = page.events
      .filter((event) => event.method === 'Runtime.exceptionThrown')
      .map((event) => event.params.exceptionDetails.text || event.params.exceptionDetails.exception?.description || 'unknown exception');
    const screenshot = await page.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));

    page.close();
    worker?.close();

    const smokeResult = {
      ok: Boolean(triggerResult.ok && iframeState.exists && iframeState.fetchResult?.fetchOk),
      url,
      chromePath,
      extensionId,
      workerTargetUrl: workerInfo.target?.url || null,
      workerFallbackReason: workerInfo.reason || null,
      readyState,
      contentStatus,
      workerToggleType,
      triggerResult,
      manualInjectResult,
      manualDirectToggleResult,
      iframeState,
      exceptions,
      screenshotPath
    };

    console.log(JSON.stringify(smokeResult, null, 2));
    if (!smokeResult.ok) {
      process.exitCode = 1;
    }
  } finally {
    chrome.kill();
    await delay(500);
    await localServer?.close();
    if (stderrChunks.length) {
      const relevantStderr = stderrChunks.join('').split(/\r?\n/).filter(Boolean).slice(-12);
      if (relevantStderr.length) {
        console.error(relevantStderr.join('\n'));
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
