import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { prepareAssets } from './prepare-i18n.mjs';

const parse = async (file) => JSON.parse(await readFile(file, 'utf8'));
test('builds each upstream language with product labels and only the shipped game features', async () => {
  const dir = path.resolve('.tmp/endfield-assets-tests');
  await mkdir(dir, { recursive: true });
  const out = await mkdtemp(path.join(dir, 'assets-test-'));
  const original = await readFile('public/i18n/en.json', 'utf8');
  const files = await prepareAssets(out);
  assert.deepEqual(
    files,
    (await readdir('public/i18n'))
      .filter((file) => file.endsWith('.json'))
      .sort(),
  );
  const fallback = await parse('public/endfield/i18n/en.json');
  const overlays = await readdir('public/endfield/i18n');
  for (const file of files) {
    const dictionary = await parse(path.join(out, 'i18n', file));
    const overlay = overlays.includes(file)
      ? await parse(path.join('public/endfield/i18n', file))
      : {};
    assert.equal(
      dictionary.endfield.resources.title,
      overlay.endfield?.resources?.title ?? fallback.endfield.resources.title,
    );
    assert.equal(
      dictionary.options.game.endfield,
      overlay.options?.game?.endfield ?? fallback.options.game.endfield,
    );
    const upstream = await parse(path.join('public/i18n', file));
    assert.equal(dictionary.app.list, upstream.app.list);
    assert.deepEqual(Object.keys(dictionary.options.game), ['endfield']);
    assert.equal(dictionary.customData, undefined);
    assert.equal(dictionary.editor, undefined);
    assert.equal(dictionary.error.deleteCustom, undefined);
    assert.equal(dictionary.technologies.exportFromFactorio, undefined);
  }
  assert.equal(await readFile('public/i18n/en.json', 'utf8'), original);

  await writeFile(path.join(out, 'i18n/stale.json'), '{}');
  await prepareAssets(out);
  assert.deepEqual(await readdir(path.join(out, 'i18n')), files);
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
