import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const manifest = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));

test('manifest declares host permissions for declared video content-script targets', () => {
  assert.ok(Array.isArray(manifest.host_permissions), 'host_permissions should be explicit for runtime injection');
  assert.ok(manifest.host_permissions.includes('<all_urls>'));
});

test('manifest exposes extension UI assets to injected iframes', () => {
  const resources = manifest.web_accessible_resources?.flatMap((entry) => entry.resources ?? []) ?? [];

  assert.ok(resources.includes('ui/*'), 'extension iframe HTML should be web accessible');
  assert.ok(resources.includes('ui/assets/*'), 'extension iframe JS and CSS assets should be web accessible');
});
