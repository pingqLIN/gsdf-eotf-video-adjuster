import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const architecturePath = new URL('../docs/rendering-bit-depth-architecture.md', import.meta.url);
const architectureZhTwPath = new URL('../docs/rendering-bit-depth-architecture.zh-tw.md', import.meta.url);
const protocolPath = new URL('../docs/10-bit-output-validation-protocol.md', import.meta.url);
const protocolZhTwPath = new URL('../docs/10-bit-output-validation-protocol.zh-tw.md', import.meta.url);

test('10-bit architecture references preserve the current evidence boundary', async () => {
  const [architecture, architectureZhTw, protocol, protocolZhTw] = await Promise.all([
    readFile(architecturePath, 'utf8'),
    readFile(architectureZhTwPath, 'utf8'),
    readFile(protocolPath, 'utf8'),
    readFile(protocolZhTwPath, 'utf8')
  ]);

  assert.match(architecture, /effective 8-bit component-transfer/);
  assert.match(architecture, /uint8_t\[256\]/);
  assert.match(architecture, /does not prove/);
  assert.match(architecture, /10-bit-output-validation-protocol\.md/);
  assert.match(architectureZhTw, /effective 8-bit component-transfer/);
  assert.match(architectureZhTw, /不能證明/);
  assert.match(protocol, /G0 — Configuration record/);
  assert.match(protocol, /G5 — Comparison and regression/);
  assert.match(protocol, /every gate\s+is `pass`/);
  assert.match(protocolZhTw, /G0 — Configuration record/);
  assert.match(protocolZhTw, /G5 — Comparison and regression/);
  assert.match(protocolZhTw, /每一個 gate 都是 `pass`/);
});
