import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { build } from 'esbuild';
import sharp from 'sharp';

const root = process.cwd();
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const data = await json('public/data/aef/data.json');
const hash = await json('public/data/aef/hash.json');
const ids = (entries) => entries.map((entry) => entry.id);
const entities = ['categories', 'items', 'recipes', 'locations'];

// Bundle the actual application implementation in memory, including its
// dependencies, so this test uses the same hash rules as update-hash.ts.
const built = await build({
  stdin: {
    contents:
      'export { emptyModHash, updateHash } from "./src/utils/hash"; export { rational } from "./src/rational/rational";',
    resolveDir: root,
    sourcefile: 'endfield-hash-spec.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  tsconfig: 'tsconfig.json',
  write: false,
  logLevel: 'silent',
});
const { emptyModHash, updateHash, rational } = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`
);

function assertAmount(value, name, strictlyPositive = false) {
  assert.ok(
    (typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' && value.length > 0),
    name,
  );
  const amount = rational(value);
  assert.ok(
    strictlyPositive ? amount.gt(rational.zero) : amount.gte(rational.zero),
    name,
  );
}

test('current dataset has valid entity shapes and unique IDs', () => {
  assert.ok(
    data.version &&
      Object.values(data.version).every((v) => typeof v === 'string'),
  );
  assert.ok(Array.isArray(data.flags));
  for (const key of [...entities, 'icons']) {
    assert.ok(Array.isArray(data[key]), key);
    const values = ids(data[key]);
    assert.ok(
      values.every((id) => typeof id === 'string' && id.length > 0),
      key,
    );
    assert.equal(new Set(values).size, values.length, `${key}: duplicate ID`);
  }
  for (const key of entities)
    for (const entry of data[key])
      assert.ok(
        typeof entry.name === 'string' && entry.name.length > 0,
        `${key}: ${entry.id}`,
      );
  for (const recipe of data.recipes) {
    assertAmount(recipe.time, recipe.id, true);
    for (const field of ['in', 'out']) {
      assert.ok(
        recipe[field] &&
          typeof recipe[field] === 'object' &&
          !Array.isArray(recipe[field]),
        recipe.id,
      );
      for (const value of Object.values(recipe[field]))
        assertAmount(value, recipe.id);
    }
  }
  assert.equal(
    data.items.find((entry) => entry.id === 'iron_ore').name,
    'Ferrium Ore',
  );
  assert.equal(
    data.recipes.find((entry) => entry.id === 'iron_ore').name,
    'Ferrium Ore',
  );
  for (const id of ['settlement-jinlong_coupon', 'settlement-tundra_coupon'])
    assert.ok(
      data.items.some((entry) => entry.id === id),
      id,
    );
});

test('calculation, category, location, and icon references resolve', () => {
  const items = new Map(data.items.map((entry) => [entry.id, entry]));
  const categories = new Set(ids(data.categories));
  const hiddenCategories = new Set([
    'machine',
    'belt-and-pipe',
    '__internal',
    '__domain_transfer',
  ]);
  const locations = new Set(ids(data.locations));
  const icons = new Set(ids(data.icons));
  for (const entry of [
    ...data.categories,
    ...data.items,
    ...data.recipes,
    ...data.locations,
  ]) {
    assert.ok(icons.has(entry.icon ?? entry.id), `icon: ${entry.id}`);
    if (entry.category)
      assert.ok(
        categories.has(entry.category) || hiddenCategories.has(entry.category),
        `category: ${entry.id}`,
      );
    for (const location of [
      ...(entry.locations ?? []),
      ...(entry.machine?.locations ?? []),
    ])
      assert.ok(locations.has(location), `location: ${entry.id} ${location}`);
  }
  for (const recipe of data.recipes) {
    for (const id of [
      ...Object.keys(recipe.in),
      ...Object.keys(recipe.out),
      ...Object.keys(recipe.catalyst ?? {}),
    ])
      assert.ok(items.has(id), `material: ${recipe.id} ${id}`);
    for (const id of recipe.producers ?? [])
      assert.ok(items.get(id)?.machine, `producer: ${recipe.id} ${id}`);
  }
  for (const id of data.defaults.locations ?? [])
    assert.ok(locations.has(id), `default location: ${id}`);
  for (const id of data.defaults.beltRank ?? [])
    assert.ok(items.get(id)?.belt, `default belt: ${id}`);
});

test('atlas decodes and every 64-pixel icon lies within it', async () => {
  const atlas = await readFile('public/data/aef/icons.webp');
  const { info } = await sharp(atlas)
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height], [1024, 1024]);
  for (const icon of data.icons) {
    assert.match(icon.color, /^#[0-9a-f]{6}$/i, icon.id);
    assert.ok(Number.isInteger(icon.x) && Number.isInteger(icon.y), icon.id);
    assert.ok(
      icon.x >= 0 &&
        icon.y >= 0 &&
        icon.x + 64 <= info.width &&
        icon.y + 64 <= info.height,
      icon.id,
    );
  }
});

test('source overlays have exactly the current entities and ModI18n fields', async () => {
  assert.deepEqual(await readdir('public/data/aef/i18n'), [
    'ja.json',
    'ru.json',
    'zh.json',
  ]);
  for (const language of ['zh', 'ja', 'ru']) {
    const translation = await json(
      path.join('public/data/aef/i18n', `${language}.json`),
    );
    assert.deepEqual(Object.keys(translation).sort(), [...entities].sort());
    for (const key of entities) {
      assert.deepEqual(
        new Set(Object.keys(translation[key])),
        new Set(ids(data[key])),
        `${language}: ${key}`,
      );
      assert.ok(
        Object.values(translation[key]).every(
          (value) => typeof value === 'string' && value.length > 0,
        ),
        `${language}: ${key}`,
      );
    }
  }
});

test('native hash covers exactly the current IDs and is idempotent', () => {
  const generated = emptyModHash();
  updateHash(data, generated);
  assert.deepEqual(Object.keys(hash).sort(), Object.keys(generated).sort());
  for (const key of Object.keys(generated)) {
    const entries = hash[key].filter((id) => id !== null);
    assert.equal(new Set(entries).size, entries.length, `${key}: duplicate ID`);
    assert.deepEqual(new Set(entries), new Set(generated[key]), key);
  }
  const copy = structuredClone(hash);
  updateHash(data, copy);
  assert.deepEqual(copy, hash);
  updateHash(data, copy);
  assert.deepEqual(copy, hash);

  for (const key of ['items', 'recipes']) {
    const retired = structuredClone(hash);
    const index = retired[key].indexOf(null);
    assert.ok(index >= 0, `${key}: expected a vacant retired slot`);
    retired[key][index] = `retired-${key}`;
    updateHash(data, retired);
    assert.deepEqual(retired, hash);
  }
});
