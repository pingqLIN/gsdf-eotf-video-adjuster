import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const manifest = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));

test('manifest declares host permissions for declared video content-script targets', () => {
  assert.ok(Array.isArray(manifest.host_permissions), 'host_permissions should be explicit for runtime injection');
  assert.ok(manifest.host_permissions.includes('<all_urls>'));
});
