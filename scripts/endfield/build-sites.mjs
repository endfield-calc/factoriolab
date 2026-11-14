import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareAssets } from './prepare-i18n.mjs';
import { packageSites } from './package-sites.mjs';
import { normalizeBase, readBaseArgument, workspace } from './verify-sites.mjs';

function angularBuild(base) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['node_modules/@angular/cli/bin/ng.js', 'build', `--base-href=${base}`],
      { cwd: workspace, stdio: 'inherit' },
    );
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Angular build failed: ${signal ?? code}`));
    });
  });
}

/** Prepare assets, build once, then finalize both independent sites. */
export async function buildSites({
  base = '/',
  prepare = prepareAssets,
  build = angularBuild,
  pack = packageSites,
} = {}) {
  const normalizedBase = normalizeBase(base);
  await prepare(path.join(workspace, '.tmp/endfield-assets'));
  await build(normalizedBase);
  await pack({ base: normalizedBase });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await buildSites({ base: readBaseArgument(process.argv.slice(2)) });
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
