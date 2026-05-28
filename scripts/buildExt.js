import fs from 'fs/promises';
import path from 'path';

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function buildExt() {
  console.log('Copying build to extension/ui...');
  const extensionUiDir = path.resolve('extension/ui');
  try {
    await fs.rm(extensionUiDir, { recursive: true, force: true });
    await copyDir(path.resolve('dist'), extensionUiDir);
    console.log('✓ Build successfully copied to extension/ui');
  } catch (err) {
    console.error('Failed to copy build:', err);
    process.exit(1);
  }
}

buildExt();
