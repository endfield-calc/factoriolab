import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import ts from 'typescript';

import {
  appendOnlyHash,
  convertData,
  extractLegacyDatasets,
  hashKeys,
  legacyHash,
  readSource,
  sourceRevision,
} from './convert-data.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const input = readSource(process.env.AEF_SOURCE);
const fromSource = (name) => JSON.parse(input[`src/data/aef/${name}`]);
const json = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const sourceData = fromSource('data.json');
const data = json('public/data/aef/data.json');
const sourceHash = fromSource('hash.json');
const frozen = json('src/endfield/compat/legacy-hash.json');
const hash = json('public/data/aef/hash.json');
const display = json('src/endfield/domain/display-metadata.json');
const ids = (list) => list.map((entry) => entry.id);
const byId = (list) =>
  Object.fromEntries(list.map((entry) => [entry.id, entry]));

// Execute actual upstream class bodies in Node without bootstrapping Angular.
function loadClass(path, name, context = {}) {
  const source = readFileSync(join(root, path), 'utf8')
    .replace(/^import\s[\s\S]*?;\r?\n/gm, '')
    .replace(/^@Service\(\)\r?\n/gm, '')
    .replace(/^export class /gm, 'class ');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  vm.runInNewContext(`${compiled}\nthis.loaded = ${name};`, context);
  return context.loaded;
}

test('both input paths use the same pinned snapshot', () => {
  const tempRoot = join(root, '.tmp');
  mkdirSync(tempRoot, { recursive: true });
  const directory = mkdtempSync(join(tempRoot, 'convert-data-test-'));
  assert.equal(dirname(resolve(directory)), resolve(tempRoot));
  try {
    for (const [path, bytes] of Object.entries(input)) {
      const target = join(directory, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
    }
    assert.deepEqual(readSource(directory), input);
    writeFileSync(join(directory, 'src/data/aef/data.json'), '{}');
    assert.throws(() => readSource(directory), /does not match/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  assert.equal(data.meta['source-revision'], sourceRevision);
  assert.equal(data.meta.author, sourceData.meta.author);
  assert.equal(
    data.meta['game-data-source'],
    sourceData.meta['game-data-source'],
  );
});

test('entity sets, fields and physical quantities match the source', () => {
  const counts = {
    items: 161,
    recipes: 257,
    icons: 254,
    categories: 5,
    locations: 2,
  };
  for (const [key, count] of Object.entries(counts)) {
    assert.equal(data[key].length, count, key);
    assert.equal(new Set(ids(data[key])).size, count, `${key} IDs are unique`);
    assert.deepEqual(
      new Set(ids(data[key])),
      new Set(ids(sourceData[key])),
      key,
    );
  }
  assert.deepEqual(data.version, sourceData.version);
  assert.deepEqual(data.categories, sourceData.categories);
  assert.deepEqual(data.locations, sourceData.locations);
  const convertedItems = byId(data.items);
  for (const old of sourceData.items) {
    const { pipe, belt, buildIcon, ...same } = old;
    const { types, belt: newBelt, ...converted } = convertedItems[old.id];
    assert.deepEqual(converted, same, old.id);
    assert.ok(types.length === 1 && ['item', 'fluid'].includes(types[0]));
    if (buildIcon)
      assert.deepEqual(data.meta['build-icons'][old.id], buildIcon);
    if (pipe) assert.deepEqual(newBelt, { ...pipe, itemTypes: ['fluid'] });
    else if (belt) assert.deepEqual(newBelt, { ...belt, itemTypes: ['item'] });
    else assert.equal(newBelt, undefined);
  }
  const convertedRecipes = byId(data.recipes);
  for (const old of sourceData.recipes) {
    const converted = { ...convertedRecipes[old.id] };
    const hidden = (old.flags ?? []).filter((flag) =>
      ['hideProducer', 'forceShowLabel'].includes(flag),
    );
    const flags = (old.flags ?? []).filter((flag) => !hidden.includes(flag));
    if (old.flags && !hidden.length)
      assert.deepEqual(converted.flags, old.flags, old.id);
    if (hidden.length) {
      assert.deepEqual(
        display.recipes[old.id],
        Object.fromEntries(hidden.map((flag) => [flag, true])),
      );
      if (flags.length) assert.deepEqual(converted.flags, flags, old.id);
      else assert.equal(converted.flags, undefined, old.id);
      if (old.flags) converted.flags = old.flags;
    }
    assert.deepEqual(converted, old, old.id);
  }
  assert.equal(Object.keys(display.recipes).length, 28);
  assert.ok(
    data.recipes.some((recipe) => Object.keys(recipe.out).length === 0),
  );
  assert.equal(convertedRecipes['sewage-treat'].cost, -30);
  assert.equal(convertedRecipes['power_proc_battery_5'].usage, -3200);
  assert.deepEqual(convertedRecipes['copper_ore-liquid_water'].in, {
    __miner_water: 1,
  });
});

test('item types and both transport devices match their physical roles', () => {
  const fluidIds = [
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
  ];
  const fluids = new Set(fluidIds);
  for (const item of data.items) {
    assert.deepEqual(
      item.types,
      [fluids.has(item.id) ? 'fluid' : 'item'],
      item.id,
    );
  }
  const items = byId(data.items);
  assert.equal(items.activity_copper_poly_gas.stack, 50);
  for (const id of [
    'domain_key_tundra',
    'tundra_coupon',
    'jinlong_coupon',
    '__domain_transfer',
    'iron_bottle-liquid_plant_grass_1',
  ]) {
    assert.deepEqual(items[id].types, ['item'], id);
  }
  for (const item of data.items.filter((entry) => entry.machine))
    assert.deepEqual(item.types, ['item']);
  assert.deepEqual(items.belt.belt, { speed: 0.5, itemTypes: ['item'] });
  assert.deepEqual(items.pipe.belt, { speed: 2, itemTypes: ['fluid'] });
});

test('mining, transfer and wastewater retain their physical quantities', () => {
  const recipes = byId(data.recipes);
  for (const [recipeId, itemId] of [
    ['originium_ore', 'originium_ore'],
    ['quartz_sand', 'quartz_sand'],
    ['iron_ore', 'iron_ore'],
    ['copper_ore-liquid_water', 'copper_ore'],
    ['gas_xiranite', 'gas_xiranite'],
    ['gas_inert', 'gas_inert'],
  ]) {
    assert.equal(recipes[recipeId].time, 3);
    assert.deepEqual(recipes[recipeId].out, { [itemId]: 1 });
  }
  assert.deepEqual(recipes['copper_ore-liquid_water'].in, { __miner_water: 1 });
  const transfers = data.recipes.filter((recipe) =>
    recipe.id.startsWith('transfer_tundra_'),
  );
  assert.equal(transfers.length, 59);
  for (const recipe of transfers) {
    assert.equal(recipe.time, 3600);
    assert.deepEqual(recipe.in, { domain_key_tundra: 1 });
    assert.deepEqual(recipe.producers, ['__domain_transfer']);
  }
  assert.deepEqual(recipes.transfer_tundra_originium_enr_powder.out, {
    originium_enr_powder: 1500,
  });
  assert.deepEqual(recipes.transfer_tundra_proc_battery_3.out, {
    proc_battery_3: 30,
  });
  assert.deepEqual(recipes['sewage-treat'].out, {});
  assert.equal(recipes['sewage-treat'].cost, -30);
  assert.equal(recipes['sewage-treat-export'].time, 60);
  assert.deepEqual(recipes['sewage-treat-export'].in, { liquid_sewage: 360 });
  assert.deepEqual(recipes['sewage-treat-export'].out, {
    liquid_xiranite_poly: 12,
  });
  assert.equal(recipes['sewage-treat-export'].cost, -50);
});

test('all calculation references and icon references resolve; hidden categories remain hidden', () => {
  const items = byId(data.items);
  const locations = new Set(ids(data.locations));
  const icons = new Set(ids(data.icons));
  const categories = new Set(ids(data.categories));
  const missingCategories = new Set();
  for (const entry of [...data.items, ...data.recipes]) {
    if (entry.category && !categories.has(entry.category))
      missingCategories.add(entry.category);
    assert.ok(icons.has(entry.icon ?? entry.id), `icon: ${entry.id}`);
    for (const location of entry.locations ?? entry.machine?.locations ?? []) {
      assert.ok(locations.has(location), `location: ${entry.id} ${location}`);
    }
  }
  for (const entry of [...data.categories, ...data.locations]) {
    assert.ok(icons.has(entry.icon ?? entry.id), `icon: ${entry.id}`);
  }
  for (const recipe of data.recipes) {
    for (const id of [...Object.keys(recipe.in), ...Object.keys(recipe.out)]) {
      assert.ok(items[id], `material: ${recipe.id} ${id}`);
    }
    for (const id of recipe.producers)
      assert.ok(items[id]?.machine, `producer: ${recipe.id} ${id}`);
  }
  assert.deepEqual(
    missingCategories,
    new Set(['machine', 'belt-and-pipe', '__internal', '__domain_transfer']),
  );
});

test('atlas bytes, coordinates, colors and language packs are retained', () => {
  const atlas = readFileSync(join(root, 'public/data/aef/icons.webp'));
  assert.deepEqual(atlas, input['src/data/aef/icons.webp']);
  assert.equal(atlas.toString('ascii', 12, 16), 'VP8X');
  const width = atlas.readUIntLE(24, 3) + 1;
  const height = atlas.readUIntLE(27, 3) + 1;
  assert.deepEqual([width, height], [1024, 1024]);
  const converted = byId(data.icons);
  for (const icon of sourceData.icons) {
    const [x, y] = icon.position
      .split(' ')
      .map((part) => -Number(part.slice(0, -2)) || 0);
    assert.deepEqual(converted[icon.id], {
      id: icon.id,
      color: icon.color,
      x,
      y,
    });
    assert.ok(x >= 0 && y >= 0 && x + 64 <= width && y + 64 <= height, icon.id);
  }
  for (const lang of ['en', 'zh', 'ja', 'ru']) {
    const bytes = readFileSync(join(root, `public/data/aef/i18n/${lang}.json`));
    assert.deepEqual(bytes, input[`src/data/aef/i18n/${lang}.json`]);
    const translation = JSON.parse(bytes);
    assert.ok(translation.name);
    assert.deepEqual(translation.version, sourceData.version);
  }
});

test('flags, defaults and extracted display flags preserve their intended meaning', () => {
  assert.deepEqual(data.flags, [
    'consumptionAsDrain',
    'power',
    'resourcePurity',
    'hideMachineSettings',
  ]);
  assert.deepEqual(data.defaults, {
    presets: [{ id: 0, label: 'options.preset.minimum' }],
    locations: ['tundra', 'jinlong'],
    beltRank: ['belt', 'pipe'],
  });
  // No machineRank means both versions use the first available producer.
  assert.equal(data.defaults.machineRank, undefined);
  assert.deepEqual(
    data.recipes.map((recipe) => recipe.producers),
    sourceData.recipes.map((recipe) => recipe.producers),
  );
  const sample = structuredClone(sourceData);
  sample.recipes[0].flags = ['mining', 'hideProducer', 'forceShowLabel'];
  const result = convertData(sample);
  assert.deepEqual(result.displayMetadata.recipes[sample.recipes[0].id], {
    hideProducer: true,
    forceShowLabel: true,
  });
  assert.deepEqual(result.data.recipes[0].flags, ['mining']);
  assert.deepEqual(
    result.data.recipes[0].producers,
    sample.recipes[0].producers,
  );
});

test('actual machine selection retains the source producer order and location rules', () => {
  const Options = loadClass('src/state/options.ts', 'Options', {
    fnPropsNotNullish:
      (...keys) =>
      (value) =>
        keys.every((key) => value[key] != null),
  });
  const options = new Options();
  const oldItems = byId(sourceData.items);
  const currentItems = byId(data.items);
  const machineRecord = Object.fromEntries(
    data.items
      .filter((item) => item.machine)
      .map((item) => [item.id, item.machine]),
  );
  const dataset = { itemRecord: currentItems, machineRecord };
  const recipeRecord = byId(data.recipes);
  for (const enabled of [['tundra', 'jinlong'], ['tundra'], ['jinlong']]) {
    const locations = new Set(enabled);
    const settings = {
      availableItemIds: new Set(ids(data.items)),
      locationIds: locations,
    };
    for (const recipe of sourceData.recipes) {
      const allowed = recipe.producers.filter((id) => {
        const machineLocations = oldItems[id].machine.locations;
        return (
          !machineLocations || machineLocations.some((id) => locations.has(id))
        );
      });
      const expected = (allowed.length ? allowed : recipe.producers)[0];
      const choices = options.machineOptions(
        recipeRecord[recipe.id],
        settings,
        dataset,
      );
      assert.equal(
        options.bestMatch(choices, []),
        expected,
        `${enabled.join('+')}: ${recipe.id}`,
      );
    }
  }

  const parsedItems = Object.fromEntries(
    data.items.map((item) => [
      item.id,
      {
        ...item,
        types: new Set(item.types),
        belt: item.belt && {
          ...item.belt,
          itemTypes: new Set(item.belt.itemTypes),
        },
      },
    ]),
  );
  const logistics = { itemRecord: parsedItems, beltIds: ['belt', 'pipe'] };
  const available = { availableItemIds: new Set(ids(data.items)) };
  for (const item of data.items) {
    const choices = options.logisticsOptions(
      parsedItems[item.id],
      available,
      logistics,
      'belt',
    );
    assert.equal(choices.length, 1, item.id);
    assert.equal(
      choices[0].value,
      item.types[0] === 'fluid' ? 'pipe' : 'belt',
      item.id,
    );
  }
});

test('frozen hashes preserve every original slot; new IDs append and future updates never reuse slots', () => {
  assert.deepEqual(frozen, legacyHash(sourceHash));
  const expectedLegacy = {
    modHashV0: ['1.1', '1.0', 'aef'],
    modHash: ['1.1', '1.0', ...Array(13).fill(''), 'sxp', 'aef'],
  };
  assert.deepEqual(
    json('src/endfield/compat/legacy-datasets.json'),
    expectedLegacy,
  );
  assert.deepEqual(
    extractLegacyDatasets(
      input['src/data/index.ts'].toString(),
      input['src/app/models/constants.ts'].toString(),
    ),
    expectedLegacy,
  );
  for (const key of hashKeys) {
    assert.deepEqual(hash[key].slice(0, frozen[key].length), frozen[key], key);
    assert.equal(new Set(hash[key]).size, hash[key].length, key);
  }
  for (const [key, current, added, retired] of [
    ['items', ids(data.items), 11, 9],
    ['recipes', ids(data.recipes), 14, 22],
    [
      'belts',
      data.items.filter((item) => item.belt).map((item) => item.id),
      1,
      0,
    ],
  ]) {
    const missing = current.filter((id) => !frozen[key].includes(id));
    assert.equal(missing.length, added, key);
    assert.equal(
      frozen[key].filter((id) => !current.includes(id)).length,
      retired,
      key,
    );
    assert.deepEqual(hash[key].slice(frozen[key].length), missing, key);
  }
  assert.deepEqual(hash.belts, ['belt', 'pipe']);
  const oldIndex = hash.items.findIndex((id) => !ids(data.items).includes(id));
  const simulated = structuredClone(hash);
  simulated.items.push(null, 'retired_later');
  const nextData = structuredClone(data);
  const retiredNow = nextData.items.shift().id;
  nextData.items.push({ id: 'next_item' });
  nextData.recipes.push({ id: 'next_recipe' });
  const next = appendOnlyHash(simulated, nextData, frozen);
  assert.deepEqual(
    next.items.slice(0, simulated.items.length),
    simulated.items,
  );
  assert.equal(next.items[oldIndex], simulated.items[oldIndex]);
  assert.ok(next.items.includes(retiredNow));
  assert.equal(next.items.at(-1), 'next_item');
  assert.equal(next.recipes.at(-1), 'next_recipe');
  assert.deepEqual(appendOnlyHash(next, nextData, frozen), next);
  const corrupted = structuredClone(hash);
  corrupted.items[0] = 'reused';
  assert.throws(() => appendOnlyHash(corrupted, data, frozen), /frozen slot/);
});

test('all current entities round-trip through the production compressed index codec', () => {
  const Compression = loadClass(
    'src/state/router/compression.ts',
    'Compression',
    { noop: () => {} },
  );
  const compression = new Compression();
  const STATE_EXTENSION = Symbol('STATE_EXTENSION');
  class WorkspaceRestoreError extends Error {}
  const Zip = loadClass('src/state/router/zip.ts', 'Zip', {
    inject: (token) => {
      if (token === Compression) return compression;
      if (token === STATE_EXTENSION) return { strictImports: false };
      throw new Error('Unexpected injection token');
    },
    Compression,
    STATE_EXTENSION,
    WorkspaceRestoreError,
    ZEMPTY: '_',
  });
  const zip = new Zip();
  assert.equal(zip.zipNString(hash.items[0], hash.items), 'A');
  assert.equal(zip.zipNString(hash.items[64], hash.items), 'BA');
  const collections = {
    items: ids(data.items),
    recipes: ids(data.recipes),
    machines: data.items.filter((item) => item.machine).map((item) => item.id),
    belts: data.items.filter((item) => item.belt).map((item) => item.id),
    locations: ids(data.locations),
  };
  for (const [key, current] of Object.entries(collections)) {
    const codes = new Set();
    for (const id of current) {
      assert.ok(hash[key].includes(id), `${key}: ${id}`);
      const encoded = zip.zipNString(id, hash[key]);
      assert.equal(zip.parseNString(encoded, hash[key]), id, `${key}: ${id}`);
      codes.add(encoded);
    }
    assert.equal(codes.size, current.length, key);
  }
});
