import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { overridePaths, prepareAssets } from './prepare-i18n.mjs';

const parse = async (file) => JSON.parse(await readFile(file, 'utf8'));
const leaves = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([key, value]) => {
    const name = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object' ? leaves(value, name) : [name];
  });

test('prepares UI and complete game overlays with intentional Chinese coverage', async () => {
  const dir = path.resolve('.tmp/endfield-assets-tests');
  await mkdir(dir, { recursive: true });
  const out = await mkdtemp(path.join(dir, 'assets-test-'));
  const original = await readFile('public/i18n/en.json', 'utf8');
  const files = await prepareAssets(out);
  const languages = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt-BR', 'ru', 'zh'];
  assert.deepEqual(
    files.ui,
    languages.map((language) => `${language}.json`),
  );
  assert.deepEqual(
    files.game,
    languages.filter((language) => language !== 'en').map((l) => `${l}.json`),
  );
  const ui = (language) => parse(path.join(out, 'i18n', `${language}.json`));
  const game = (language) =>
    parse(path.join(out, 'data/aef/i18n', `${language}.json`));
  const en = await ui('en');
  const zh = await ui('zh');
  const ja = await ui('ja');
  assert.equal(en.options.game.endfield, 'Arknights: Endfield');
  assert.equal(en.endfield.guide.exampleJinlong, 'Wuling endgame example');
  assert.equal(zh.endfield.guide.exampleJinlong, '武陵毕业示例');
  assert.equal(zh.options.game.endfield, '明日方舟：终末地');
  assert.equal(ja.options.game.endfield, 'アークナイツ：エンドフィールド');
  assert.equal(
    (await ui('ru')).options.game.endfield,
    en.options.game.endfield,
  );
  assert.equal(zh.endfield.resources.title, '资源配置');
  assert.equal(ja.endfield.resources.title, en.endfield.resources.title);
  assert.equal(ja.options.displayRate.perDaySuffix, '/d');
  assert.equal(zh.options.objectiveUnit.itemsPerDay, '物品/天');
  const chineseGame = await game('zh');
  for (const language of ['de', 'es', 'fr', 'ko', 'pt-BR']) {
    const dictionary = await ui(language);
    assert.equal(dictionary.options.game.endfield, zh.options.game.endfield);
    assert.equal(
      dictionary.endfield.electric.title,
      en.endfield.electric.title,
    );
    assert.deepEqual(await game(language), chineseGame);
  }
  for (const language of ['ja', 'ru', 'zh'])
    assert.deepEqual(
      await game(language),
      await parse(`public/data/aef/i18n/${language}.json`),
    );
  assert.equal(await readFile('public/i18n/en.json', 'utf8'), original);

  const before = await readFile(path.join(out, 'data/aef/i18n/de.json'));
  await writeFile(path.join(out, 'data/aef/i18n/en.json'), '{}');
  await prepareAssets(out);
  assert.deepEqual(
    await readFile(path.join(out, 'data/aef/i18n/de.json')),
    before,
  );
  assert.deepEqual(await readdir(path.join(out, 'data/aef/i18n')), files.game);
});

test('local dictionaries only override declared upstream paths', async () => {
  for (const language of ['en', 'ja', 'zh']) {
    const local = await parse(`public/endfield/i18n/${language}.json`);
    const invalid = leaves(local).filter(
      (key) => !key.startsWith('endfield.') && !overridePaths.includes(key),
    );
    assert.deepEqual(invalid, []);
  }
});

test('refuses to overwrite source dictionaries or their parent directories', async () => {
  for (const output of [
    'public',
    'public/i18n',
    'public/endfield/i18n',
    'public/data/aef/i18n',
  ])
    await assert.rejects(prepareAssets(output), /separate from source/);
});

test('Angular build and Karma use the assets prepared by every npm entry point', async () => {
  const config = await parse('angular.json');
  const scripts = (await parse('package.json')).scripts;
  for (const entry of [
    'prestart',
    'prebuild',
    'prewatch',
    'pretest',
    'pretest:ci',
  ])
    assert.equal(
      scripts[entry],
      'node scripts/endfield/prepare-i18n.mjs --out .tmp/endfield-assets',
    );
  const targets = config.projects.factoriolab.architect;
  for (const name of ['build', 'test']) {
    const assets = targets[name].options.assets;
    for (const destination of ['i18n', 'data/aef/i18n'])
      assert.ok(
        assets.some(
          (asset) =>
            asset.input === `.tmp/endfield-assets/${destination}` &&
            asset.output === destination,
        ),
        `${name}: ${destination}`,
      );
  }
  assert.ok(
    targets.build.options.assets
      .find((asset) => asset.input === 'public/data/aef')
      .ignore.includes('i18n/**'),
  );
  assert.ok(
    targets.test.options.assets
      .find((asset) => asset.input === 'public')
      .ignore.includes('data/aef/i18n/**'),
  );
});
