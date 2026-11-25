import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { prepareAssets } from './prepare-i18n.mjs';
import { packageSites } from './package-sites.mjs';
import { readBaseArgument, workspace } from './verify-sites.mjs';

const base = readBaseArgument(process.argv.slice(2));
await prepareAssets(path.join(workspace, '.tmp/endfield-assets'));
execFileSync(
  process.execPath,
  ['node_modules/@angular/cli/bin/ng.js', 'build', `--base-href=${base}`],
  { cwd: workspace, stdio: 'inherit' },
);
await packageSites({ base });
