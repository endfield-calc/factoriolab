import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { overridePaths, prepareI18n } from './prepare-i18n.mjs';

const parse = async (file) => JSON.parse(await readFile(file, 'utf8'));
const leaves = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([key, value]) => {
    const name = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object' ? leaves(value, name) : [name];
  });

test('composes localized assets without changing upstream and supplies English feature fallback', async () => {
  const dir = path.resolve('.tmp/upstream-migration/ui');
  await mkdir(dir, { recursive: true });
  const out = await mkdtemp(path.join(dir, 'i18n-test-'));
  const original = await readFile('public/i18n/en.json', 'utf8');
  const files = await prepareI18n(out);
  assert.ok(files.includes('zh.json') && files.includes('ja.json'));
  const en = await parse(path.join(out, 'en.json'));
  const zh = await parse(path.join(out, 'zh.json'));
  const ja = await parse(path.join(out, 'ja.json'));
  assert.equal(zh.endfield.resources.title, '资源配置');
  assert.equal(ja.endfield.resources.title, en.endfield.resources.title);
  assert.equal(ja.options.displayRate.perDaySuffix, '/d');
  assert.equal(zh.options.objectiveUnit.itemsPerDay, '物品/天');
  assert.equal(await readFile('public/i18n/en.json', 'utf8'), original);
});

test('local dictionaries only override declared upstream paths', async () => {
  for (const language of ['en', 'zh']) {
    const local = await parse(`public/endfield/i18n/${language}.json`);
    const invalid = leaves(local).filter(
      (key) => !key.startsWith('endfield.') && !overridePaths.includes(key),
    );
    assert.deepEqual(invalid, []);
  }
});

test('refuses to overwrite source dictionaries', async () => {
  await assert.rejects(prepareI18n('public/i18n'), /separate from source/);
  await assert.rejects(
    prepareI18n('public/endfield/i18n'),
    /separate from source/,
  );
});
