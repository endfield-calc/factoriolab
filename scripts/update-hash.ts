import fs from 'fs';

import { datasets } from '~/data/datasets';
import { CUSTOM_MOD } from '~/data/game';
import { ModData } from '~/data/schema/mod-data';
import { ModHash } from '~/data/schema/mod-hash';
import { emptyModHash, updateHash } from '~/utils/hash';

import { getJsonData, writeJsonData } from './utils/file';
import { logTime } from './utils/log';

// Load mods from arguments
let mods = process.argv.slice(2);
if (mods.length === 0)
  mods = datasets.mods.filter((m) => m.id !== CUSTOM_MOD).map((m) => m.id);

// Resolve every requested identity before any writes. Filesystem aliases must
// never bypass a registered dataset's index-retention policy.
const selectedMods = mods.map((id) => {
  const info = datasets.mods.find((entry) => entry.id === id);
  if (info == null || info.id === CUSTOM_MOD)
    throw new Error(`Unknown data set ID: ${id}`);
  return info;
});

logTime(
  `Starting hash update for ${mods.length.toString()} mod${mods.length > 1 ? 's' : ''}...`,
);

for (let i = 0; i < mods.length; i++) {
  const info = selectedMods[i];
  const mod = info.id;
  const modPath = `./public/data/${mod}`;
  const modDataPath = `${modPath}/data.json`;
  const modHashPath = `${modPath}/hash.json`;

  const modData = getJsonData(modDataPath) as ModData;
  const modHash = fs.existsSync(modHashPath)
    ? (getJsonData(modHashPath) as ModHash)
    : emptyModHash();

  updateHash(modData, modHash, info.hashPolicy);
  writeJsonData(modHashPath, modHash);

  logTime(
    `Updated mod '${mod}' (${(i + 1).toString()} of ${mods.length.toString()})`,
  );
}
