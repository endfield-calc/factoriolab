import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
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
  'app.updateDetected',
  'app.updateDetectedMessage',
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

/** Produce Angular's i18n assets in a separate directory without editing upstream. */
export async function prepareI18n(output) {
  const upstream = path.join(root, 'public/i18n');
  const local = path.join(root, 'public/endfield/i18n');
  const destination = path.resolve(output);
  if (destination === upstream || destination === local) {
    throw new Error('Output must be separate from source dictionaries');
  }
  const english = await json(path.join(upstream, 'en.json'));
  const localEnglish = await json(path.join(local, 'en.json'));
  const product = await json(path.join(root, 'public/endfield/product.json'));
  const localLanguages = new Set(await readdir(local));
  const files = (await readdir(upstream)).filter((file) =>
    file.endsWith('.json'),
  );
  await mkdir(output, { recursive: true });
  for (const file of files) {
    const source = await json(path.join(upstream, file));
    const translation = localLanguages.has(file)
      ? await json(path.join(local, file))
      : {};
    const result = merge(
      merge(merge(merge(english, source), localEnglish), translation),
      product.uiLocaleOverrides?.[file.slice(0, -5)] ?? {},
    );
    await writeFile(
      path.join(output, file),
      `${JSON.stringify(result, null, 2)}\n`,
    );
  }
  return files;
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
    const files = await prepareI18n(path.resolve(process.argv[index + 1]));
    console.log(
      `Prepared ${files.length} languages in ${path.resolve(process.argv[index + 1])}`,
    );
  }
}
