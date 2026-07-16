import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOP_BAR_COMPATIBILITY_STYLE = '<style id="gsdf-portable-scrollbar-compat">.analytics-top-bar{width:100%!important;margin-left:0!important;margin-right:0!important}</style>';

function parseArguments(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (!argument.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(`Invalid or incomplete argument: ${argument}`);
    }

    options[argument.slice(2)] = value;
    index += 1;
  }

  for (const required of ['plugin-root', 'input', 'output']) {
    if (!options[required]) {
      throw new Error(`Missing --${required}.`);
    }
  }

  return options;
}

function resolveRepositoryPath(pathText) {
  const absolutePath = isAbsolute(pathText) ? resolve(pathText) : resolve(repositoryRoot, pathText);
  const repositoryRelative = relative(repositoryRoot, absolutePath);
  if (repositoryRelative.startsWith('..') || isAbsolute(repositoryRelative)) {
    throw new Error(`Path escapes the repository: ${pathText}`);
  }

  return absolutePath;
}

function injectScrollbarCompatibilityStyle(html) {
  if (!html.includes('</head>')) {
    throw new Error('Portable HTML is missing </head>.');
  }

  return html.replace('</head>', `${TOP_BAR_COMPATIBILITY_STYLE}</head>`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const pluginRoot = resolve(options['plugin-root']);
  const inputPath = resolveRepositoryPath(options.input);
  const outputPath = resolveRepositoryPath(options.output);
  const candidatePath = `${outputPath}.candidate-${process.pid}.html`;
  const stageOnePath = `${outputPath}.stage1-${process.pid}.html`;
  const builderModule = await import(pathToFileURL(resolve(
    pluginRoot,
    'skills/build-report/scripts/build_portable_artifact.mjs',
  )).href);
  const extractorModule = await import(pathToFileURL(resolve(
    pluginRoot,
    'skills/build-report/scripts/extract_portable_chart_svgs.mjs',
  )).href);
  const verifierModule = await import(pathToFileURL(resolve(
    pluginRoot,
    'skills/build-report/scripts/verify_portable_artifact.mjs',
  )).href);
  const artifact = JSON.parse(readFileSync(inputPath, 'utf8'));

  mkdirSync(dirname(outputPath), { recursive: true });
  try {
    const stageOneHtml = builderModule.buildPortableArtifact(artifact);
    writeFileSync(stageOnePath, stageOneHtml, 'utf8');
    const staticCharts = await extractorModule.extractPortableChartSvgs({
      htmlPath: stageOnePath,
      readyTimeoutMs: 5_000,
      actionTimeoutMs: 2_500,
    });
    const finalHtml = injectScrollbarCompatibilityStyle(
      builderModule.buildPortableArtifact(artifact, { staticCharts }),
    );
    writeFileSync(candidatePath, finalHtml, 'utf8');
    const verification = await verifierModule.verifyPortableArtifact({
      artifactPath: inputPath,
      htmlPath: candidatePath,
      readyTimeoutMs: 5_000,
      actionTimeoutMs: 2_500,
      timeoutMs: 30_000,
      screenshotPath: `${candidatePath}.verification-failure.png`,
    });
    renameSync(candidatePath, outputPath);
    console.log(JSON.stringify({
      ok: true,
      output: relative(repositoryRoot, outputPath).replaceAll('\\', '/'),
      compatibilityPatch: 'portable top bar uses width:100% to exclude the Windows classic scrollbar gutter',
      verification,
    }, null, 2));
  } finally {
    rmSync(stageOnePath, { force: true });
    rmSync(candidatePath, { force: true });
  }
}

await main();
