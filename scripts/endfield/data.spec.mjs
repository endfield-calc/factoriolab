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
const transfer = await json('public/data/aef/transfer.json');
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

test('entity translations reference current entities', async () => {
  for (const file of await readdir('public/data/aef/i18n')) {
    const translation = await json(path.join('public/data/aef/i18n', file));
    for (const [key, names] of Object.entries(translation)) {
      assert.ok(entities.includes(key), `${file}: ${key}`);
      const available = new Set(ids(data[key]));
      for (const [id, name] of Object.entries(names)) {
        assert.ok(available.has(id), `${file}: ${key} ${id}`);
        assert.ok(
          typeof name === 'string' && name.length > 0,
          `${file}: ${id}`,
        );
      }
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
});

test('event recipes and outpost and mining data resolve against the shipped catalog', () => {
  const { activities, domains, schemaVersion } = data.endfield;
  assert.equal(schemaVersion, 1);
  const catalog = new Set(ids(data.items));
  for (const [key, event] of Object.entries(activities)) {
    assert.ok(event.openTime < event.closeTime, key);
    assert.equal(event.stageStarts[0], event.openTime, key);
    assert.deepEqual(
      event.stageStarts,
      [...new Set(event.stageStarts)].sort((a, b) => a - b),
      key,
    );
    assert.ok(event.stageStarts.at(-1) < event.closeTime, key);
    const recipes = data.recipes.filter((r) =>
      r.flags?.includes(`activity-${key}`),
    );
    assert.ok(
      recipes.some((r) => r.category === 'activity'),
      key,
    );
    assert.ok(
      recipes.some((r) => r.category === 'settlement'),
      key,
    );
    for (const r of recipes) assert.ok(r.flags.includes('activity'), r.id);
    for (const [recipeId, start] of Object.entries(event.recipeUnlocks)) {
      assert.ok(
        recipes.some((recipe) => recipe.id === recipeId),
        recipeId,
      );
      assert.ok(
        event.stageStarts.includes(start) && start > event.openTime,
        recipeId,
      );
    }
  }
  for (const recipe of data.recipes.filter((r) =>
    r.flags?.includes('activity'),
  )) {
    assert.equal(
      recipe.flags.filter(
        (f) => f.startsWith('activity-') && activities[f.slice(9)],
      ).length,
      1,
      recipe.id,
    );
  }
  assert.deepEqual(
    new Set(domains.map((d) => d.locationId)),
    new Set(ids(data.locations)),
  );
  for (const domain of domains) {
    assert.ok(catalog.has(domain.couponItemId));
    assert.ok(domain.mineSummary.length > 0 && domain.settlements.length > 0);
    for (const mine of domain.mineSummary) {
      assert.ok(catalog.has(mine.itemId));
      assert.ok(mine.outputPerMinute >= 0);
    }
    for (const outpost of domain.settlements) {
      assert.ok(outpost.levels.length > 0);
      assert.deepEqual(
        outpost.levels.map((l) => l.level),
        [...new Set(outpost.levels.map((l) => l.level))].sort((a, b) => a - b),
      );
      for (const level of outpost.levels)
        assert.ok(level.moneyMax >= 0 && level.baseMoneySpeed >= 0);
      for (const event of outpost.activities) {
        const window = activities[event.activityId.replace(/^activity_/, '')];
        for (const phase of event.phases) {
          assert.ok(phase.startTime < phase.endTime && phase.rate > 0);
          assert.ok(
            window.stageStarts.includes(phase.startTime),
            event.activityId,
          );
          assert.ok(
            phase.endTime === window.closeTime ||
              window.stageStarts.includes(phase.endTime),
            event.activityId,
          );
        }
      }
    }
  }
});

test('transfer data is separate and references current items and source locations', () => {
  assert.equal(transfer.schemaVersion, 1);
  const locations = new Set(ids(data.locations));
  const items = new Set(ids(data.items));
  assert.ok(transfer.sources.length > 0 && transfer.items.length > 0);
  for (const source of transfer.sources) {
    assert.ok(locations.has(source.locationId));
    assert.ok(Number.isFinite(source.capacity) && source.capacity > 0);
  }
  for (const item of transfer.items) {
    assert.ok(items.has(item.itemId));
    assert.ok(Number.isFinite(item.value) && item.value > 0);
    assert.ok(item.sourceDomainIds.length > 0);
  }
  assert.ok(
    data.recipes.every((recipe) => recipe.category !== '__domain_transfer'),
  );
});
