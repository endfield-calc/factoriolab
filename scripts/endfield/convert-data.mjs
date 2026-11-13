import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const sourceRevision = '26a49e814f0570e050a19b726b3ba689d282aa3b';

// Pin both the Git and explicit-directory inputs to the same source snapshot.
const sourceHashes = {
  'src/data/aef/data.json':
    '48950cbbb6067931520e47574be5e07130eac2a15ab40c73fac96f75c347d910',
  'src/data/aef/hash.json':
    'e36df77260e9c70d6fd14914f8dcb24a9111284d4487373abf88fa6ec094dcc5',
  'src/data/aef/icons.webp':
    'a4b1467e2623783504121a43e707ea4e1b2a52fa7281754bd9808584d427c093',
  'src/data/aef/i18n/en.json':
    'dab934055d2e4bd5ad395ed01711be9b5a95881053cdef5e544fa48d36eef41d',
  'src/data/aef/i18n/zh.json':
    '398baf1ba3f8f95bedbfdf954523555df993a358fa8cff372b2beca86721a4b4',
  'src/data/aef/i18n/ja.json':
    '767aba573db764031c57e3e8795472721e52655b21c7330f31c71385a69888a5',
  'src/data/aef/i18n/ru.json':
    'cadb59eed3f92383ed71f5415bed338b13cf6b3e3fc6cc35b2fc7e707661f5d8',
  'src/data/index.ts':
    '6c363bb654b886d498d8a13f832123ef9414c5b56e4c8fb6913562268658a1aa',
  'src/app/models/constants.ts':
    'b2ef5e84a139a832410b342e42be84bc6a84405b44f0cada65a38cbb43dc1f13',
};

export const hashKeys = [
  'items',
  'beacons',
  'belts',
  'fuels',
  'wagons',
  'machines',
  'modules',
  'recipes',
  'technologies',
  'locations',
];

// Explicit classification includes the virtual mining water and the event gas
// with stack=50. Bottled liquids, coupons, virtual keys and machines are items.
const fluidIds = new Set([
  'liquid_plant_grass_1',
  'liquid_plant_grass_2',
  'liquid_copper',
  'liquid_copper_enr',
  'gas_copper',
  'gas_copper_enr',
  'gas_copper_enr2',
  'liquid_xiranite_poly',
  'liquid_xiranite_lowpoly',
  'liquid_sewage',
  'liquid_xiranite',
  'gas_xiranite',
  'liquid_xiranite_enr',
  'gas_xiranite_enr',
  'liquid_water',
  'gas_water',
  'liquid_acid',
  'gas_acid',
  'gas_inert',
  '__miner_water',
  'activity_copper_poly_gas',
]);

export function readSource(sourceRoot) {
  const files = {};
  for (const [path, expected] of Object.entries(sourceHashes)) {
    const bytes = sourceRoot
      ? readFileSync(join(sourceRoot, path))
      : execFileSync('git', ['show', `${sourceRevision}:${path}`], {
          cwd: root,
          maxBuffer: 10 * 1024 * 1024,
        });
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== expected)
      throw new Error(`Source ${path} does not match ${sourceRevision}`);
    files[path] = bytes;
  }
  return files;
}

function parseJson(bytes) {
  return JSON.parse(bytes.toString('utf8'));
}

export function extractLegacyDatasets(indexSource, constantsSource) {
  const gameId = constantsSource.match(
    /export const ARKNIGHTS_ENDFIELD_ID\s*=\s*'([^']+)'/,
  );
  if (!gameId) throw new Error('Could not extract ARKNIGHTS_ENDFIELD_ID');
  const uncommented = indexSource.replace(/\/\/[^\r\n]*/g, '');
  const parseArray = (key) => {
    const match = uncommented.match(
      new RegExp(`\\b${key}:\\s*\\[([\\s\\S]*?)\\]`),
    );
    if (!match) throw new Error(`Could not extract ${key}`);
    return match[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .flatMap((part) => {
        const literal = part.match(/^'([^']*)'$/);
        if (literal) return [literal[1]];
        if (part === 'ARKNIGHTS_ENDFIELD_ID') return [gameId[1]];
        const fill = part.match(/^\.\.\.Array<string>\((\d+)\)\.fill\(''\)$/);
        if (fill) return Array(Number(fill[1])).fill('');
        throw new Error(`Unsupported ${key} entry: ${part}`);
      });
  };
  return { modHashV0: parseArray('modHashV0'), modHash: parseArray('modHash') };
}

export function legacyHash(oldHash) {
  for (const key of Object.keys(oldHash)) {
    if (!hashKeys.includes(key)) throw new Error(`Unknown hash array: ${key}`);
  }
  return Object.fromEntries(
    hashKeys.map((key) => [key, [...(oldHash[key] ?? [])]]),
  );
}

export function appendOnlyHash(previous, data, frozen) {
  const current = legacyHash(previous);
  const baseline = legacyHash(frozen);
  const ids = {
    items: data.items.map((item) => item.id),
    beacons: data.items.filter((item) => item.beacon).map((item) => item.id),
    belts: data.items.filter((item) => item.belt).map((item) => item.id),
    fuels: data.items.filter((item) => item.fuel).map((item) => item.id),
    wagons: data.items.filter((item) => item.wagon).map((item) => item.id),
    machines: data.items.filter((item) => item.machine).map((item) => item.id),
    modules: data.items.filter((item) => item.module).map((item) => item.id),
    recipes: data.recipes.map((recipe) => recipe.id),
    technologies: data.items
      .filter((item) => item.technology)
      .map((item) => item.id),
    locations: (data.locations ?? []).map((location) => location.id),
  };
  for (const key of hashKeys) {
    if (baseline[key].some((id, index) => current[key][index] !== id))
      throw new Error(`Existing ${key} hash changed a frozen slot`);
    const nonNull = current[key].filter((id) => id != null);
    if (nonNull.length !== new Set(nonNull).size)
      throw new Error(`Existing ${key} hash contains duplicate IDs`);
    const seen = new Set(nonNull);
    for (const id of ids[key]) {
      if (!seen.has(id)) {
        current[key].push(id);
        seen.add(id);
      }
    }
  }
  return current;
}

export function convertData(old) {
  const buildIcons = {};
  const recipes = {};
  const items = old.items.map((item) => {
    const { pipe, buildIcon, ...result } = item;
    if (buildIcon) buildIcons[item.id] = buildIcon;
    if (item.stack == null && !fluidIds.has(item.id))
      throw new Error(`Classify non-stacking item ${item.id} explicitly`);
    result.types = [fluidIds.has(item.id) ? 'fluid' : 'item'];
    if (result.belt) result.belt = { ...result.belt, itemTypes: ['item'] };
    if (pipe) result.belt = { ...pipe, itemTypes: ['fluid'] };
    return result;
  });
  const found = new Set(items.map((item) => item.id));
  for (const id of fluidIds) {
    if (!found.has(id)) throw new Error(`Missing classified fluid ${id}`);
  }
  const convertedRecipes = old.recipes.map((recipe) => {
    const result = { ...recipe };
    const displayFlags = (recipe.flags ?? []).filter(
      (flag) => flag === 'hideProducer' || flag === 'forceShowLabel',
    );
    if (displayFlags.length) {
      recipes[recipe.id] = Object.fromEntries(
        displayFlags.map((flag) => [flag, true]),
      );
      const flags = recipe.flags.filter((flag) => !displayFlags.includes(flag));
      if (flags.length) result.flags = flags;
      else delete result.flags;
    }
    return result;
  });
  const icons = old.icons.map(({ position, ...icon }) => {
    const match = position.match(/^(-?\d+)px (-?\d+)px$/);
    if (!match || Number(match[1]) > 0 || Number(match[2]) > 0)
      throw new Error(`Unsupported icon position ${position}`);
    return { ...icon, x: -Number(match[1]) || 0, y: -Number(match[2]) || 0 };
  });
  const data = {
    ...old,
    flags: [
      'consumptionAsDrain',
      'power',
      'resourcePurity',
      'hideMachineSettings',
    ],
    icons,
    items,
    recipes: convertedRecipes,
    defaults: {
      presets: [{ id: 0, label: 'options.preset.minimum' }],
      locations: [...old.defaults.locations],
      beltRank: [old.defaults.minBelt, old.defaults.minPipe],
    },
    meta: {
      ...old.meta,
      'source-repository': 'https://github.com/endfield-calc/factoriolab/',
      'source-revision': sourceRevision,
      'build-icons': buildIcons,
    },
  };
  return { data, displayMetadata: { recipes } };
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeArrayObject(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const entries = Object.entries(value);
  const lines = entries.map(([key, array], index) => {
    const suffix = index < entries.length - 1 ? ',' : '';
    const prefix = `  ${JSON.stringify(key)}: `;
    const inline = `[${array.map((item) => JSON.stringify(item)).join(', ')}]`;
    if (prefix.length + inline.length + suffix.length <= 80)
      return prefix + inline + suffix;
    return (
      prefix + JSON.stringify(array, null, 2).replaceAll('\n', '\n  ') + suffix
    );
  });
  writeFileSync(path, `{\n${lines.join('\n')}\n}\n`);
}

export function generate(sourceRoot) {
  const files = readSource(sourceRoot);
  const oldData = parseJson(files['src/data/aef/data.json']);
  const frozen = legacyHash(parseJson(files['src/data/aef/hash.json']));
  const { data, displayMetadata } = convertData(oldData);
  const frozenPath = join(root, 'src/endfield/compat/legacy-hash.json');
  const hashPath = join(root, 'public/data/aef/hash.json');
  if (
    existsSync(frozenPath) &&
    !isDeepStrictEqual(parseJson(readFileSync(frozenPath)), frozen)
  )
    throw new Error('Existing frozen legacy hash differs from the source');
  const previous = existsSync(hashPath)
    ? parseJson(readFileSync(hashPath))
    : frozen;
  const hash = appendOnlyHash(previous, data, frozen);
  const global = extractLegacyDatasets(
    files['src/data/index.ts'].toString('utf8'),
    files['src/app/models/constants.ts'].toString('utf8'),
  );

  writeJson(join(root, 'public/data/aef/data.json'), data);
  writeJson(hashPath, hash);
  writeArrayObject(frozenPath, frozen);
  writeArrayObject(
    join(root, 'src/endfield/compat/legacy-datasets.json'),
    global,
  );
  writeJson(
    join(root, 'src/endfield/domain/display-metadata.json'),
    displayMetadata,
  );
  const atlasPath = join(root, 'public/data/aef/icons.webp');
  writeFileSync(atlasPath, files['src/data/aef/icons.webp']);
  for (const lang of ['en', 'zh', 'ja', 'ru']) {
    const path = join(root, `public/data/aef/i18n/${lang}.json`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, files[`src/data/aef/i18n/${lang}.json`]);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--source'))
    throw new Error(
      'Usage: node scripts/endfield/convert-data.mjs [--source <source-directory>]',
    );
  generate(args[1] ? resolve(args[1]) : undefined);
}
