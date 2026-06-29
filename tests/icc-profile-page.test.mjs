import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../src/components/IccProfilePage.tsx', import.meta.url), 'utf8');
const panelSource = readFileSync(new URL('../src/components/DraggablePanel.tsx', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));

test('ICC profile page is routed as a standalone app surface', () => {
  assert.match(appSource, /import \{ IccProfilePage \} from '\.\/components\/IccProfilePage'/);
  assert.match(appSource, /window\.location\.pathname === '\/icc-profile'/);
  assert.match(appSource, /window\.location\.search\.includes\('mode=icc-profile'\)/);
  assert.match(appSource, /return <IccProfilePage settings=\{settings\} \/>/);
});

test('ICC profile page exports EIZO CSV through Blob download without extension download permission', () => {
  assert.match(pageSource, /buildToneCurveSnapshot\(settings, \{ tableSize: 256, displayPreset: displayPresetId \}\)/);
  assert.match(pageSource, /buildVirtualDisplayIcc\(settings, \{/);
  assert.match(pageSource, /profileIntent,[\s\S]*trcSampleCount: 8192,[\s\S]*displayPreset: displayPresetId/);
  assert.match(pageSource, /application\/vnd\.iccprofile/);
  assert.match(pageSource, /Export ICC compensation/);
  assert.match(pageSource, /Export ICC descriptive/);
  assert.match(pageSource, /buildEizoGammaLutCsv\(snapshot\)/);
  assert.match(pageSource, /validateEizoGammaLutCsv\(eizoCsv\)/);
  assert.match(pageSource, /URL\.createObjectURL\(blob\)/);
  assert.match(pageSource, /document\.createElement\('a'\)/);
  assert.match(pageSource, /anchor\.download = fileName/);
  assert.doesNotMatch(pageSource, /chrome\.downloads|nativeMessaging/);
  assert.ok(!manifest.permissions.includes('downloads'));
  assert.ok(!manifest.permissions.includes('nativeMessaging'));
});

test('ICC install remains disabled until a native helper exists', () => {
  const installBlock = pageSource.slice(
    pageSource.indexOf('Install ICC profile'),
    pageSource.indexOf('</button>', pageSource.indexOf('Install ICC profile')),
  );

  assert.match(installBlock, /Install ICC profile/);
  assert.match(pageSource, /disabled[\s\S]*aria-disabled="true"[\s\S]*Install ICC profile/);
});

test('export metadata avoids page and video-target private context', () => {
  const metadataBlock = pageSource.slice(
    pageSource.indexOf('function buildExportMetadata'),
    pageSource.indexOf('function CurvePreviewTable'),
  );

  assert.match(metadataBlock, /generator: 'LumaLift'/);
  assert.match(metadataBlock, /transferFormula: snapshot\.metadata\.transferFormula/);
  assert.doesNotMatch(metadataBlock, /window\.location|document\.URL|document\.referrer|hostUrl|hostname|domSelector|targetSelector|videoTarget|cameraProbe|pageContent/);
});

test('floating diagnostic panel does not own ICC or EIZO export actions', () => {
  assert.doesNotMatch(panelSource, /IccProfilePage|buildEizoGammaLutCsv|buildVirtualDisplayIcc|Export EIZO CSV|Export ICC compensation|Install ICC profile/);
});
