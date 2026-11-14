import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
// These are intentional product/feature overrides of upstream keys; every other
// local translation must live under the endfield namespace.
export const overridePaths = [
  'app.name',
  'app.updateAvailableMessage',
  'app.updateRequiredMessage',
  'landing.welcome',
  'options.game.endfield',
  'options.displayRate.perDay',
  'options.displayRate.perDaySuffix',
  'options.objectiveUnit.itemsPerDay',
  'options.objectiveUnit.wagonsPerDay',
  'options.objectiveUnit.rocketsPerDay',
  'options.objectiveUnit.pollutionPerDay',
];

function merge(base, overlay) {
  const result = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    result[key] =
      value && typeof value === 'object' && !Array.isArray(value)
        ? merge(
            result[key] && typeof result[key] === 'object' ? result[key] : {},
            value,
          )
        : value;
  }
  return result;
}

async function json(file) {
  return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
}

function contains(parent, child) {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

async function removeStaleJson(directory, files) {
  const expected = new Set(files);
  for (const file of await readdir(directory)) {
    if (file.endsWith('.json') && !expected.has(file))
      await unlink(path.join(directory, file));
  }
}

/** Prepare UI dictionaries and all non-English game overlays for Angular. */
export async function prepareAssets(output) {
  const upstream = path.join(root, 'public/i18n');
  const local = path.join(root, 'public/endfield/i18n');
  const game = path.join(root, 'public/data/aef/i18n');
  const destination = path.resolve(output);
  if (
    [upstream, local, game].some(
      (source) =>
        contains(source, destination) || contains(destination, source),
    )
  )
    throw new Error('Output must be separate from source dictionaries');
  const english = await json(path.join(upstream, 'en.json'));
  const localEnglish = await json(path.join(local, 'en.json'));
  const localChinese = await json(path.join(local, 'zh.json'));
  const gameChinese = await json(path.join(game, 'zh.json'));
  const localLanguages = new Set(await readdir(local));
  const gameLanguages = new Set(await readdir(game));
  const files = (await readdir(upstream))
    .filter((file) => file.endsWith('.json'))
    .sort();
  const uiDestination = path.join(destination, 'i18n');
  const gameDestination = path.join(destination, 'data/aef/i18n');
  const gameFiles = files.filter((file) => file !== 'en.json');
  await mkdir(uiDestination, { recursive: true });
  await mkdir(gameDestination, { recursive: true });
  await removeStaleJson(uiDestination, files);
  await removeStaleJson(gameDestination, gameFiles);
  for (const file of files) {
    const source = await json(path.join(upstream, file));
    const translation = localLanguages.has(file)
      ? await json(path.join(local, file))
      : {};
    const fallback =
      file !== 'en.json' && !gameLanguages.has(file)
        ? {
            options: { game: { endfield: localChinese.options.game.endfield } },
          }
        : {};
    const result = merge(
      merge(merge(merge(english, source), localEnglish), fallback),
      translation,
    );
    await writeFile(
      path.join(uiDestination, file),
      `${JSON.stringify(result, null, 2)}\n`,
    );
    if (file !== 'en.json') {
      const overlay = gameLanguages.has(file)
        ? await json(path.join(game, file))
        : gameChinese;
      await writeFile(
        path.join(gameDestination, file),
        `${JSON.stringify(overlay, null, 2)}\n`,
      );
    }
  }
  return { ui: files, game: gameFiles };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const index = process.argv.indexOf('--out');
  if (index < 0 || !process.argv[index + 1]) {
    console.error(
      'Usage: node scripts/endfield/prepare-i18n.mjs --out <directory>',
    );
    process.exitCode = 1;
  } else {
    const files = await prepareAssets(path.resolve(process.argv[index + 1]));
    console.log(
      `Prepared ${files.ui.length} UI dictionaries and ${files.game.length} game overlays in ${path.resolve(process.argv[index + 1])}`,
    );
  }
}
