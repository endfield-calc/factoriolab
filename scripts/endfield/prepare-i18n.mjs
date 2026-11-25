import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
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

/** Prepare the app's UI dictionaries for Angular. */
export async function prepareAssets(output) {
  const upstream = path.join(root, 'public/i18n');
  const local = path.join(root, 'public/endfield/i18n');
  const destination = path.resolve(output);
  if (
    [upstream, local, path.join(root, 'public/data/aef/i18n')].some(
      (source) =>
        contains(source, destination) || contains(destination, source),
    )
  )
    throw new Error('Output must be separate from source dictionaries');
  const localEnglish = await json(path.join(local, 'en.json'));
  const localLanguages = new Set(await readdir(local));
  const files = (await readdir(upstream))
    .filter((file) => file.endsWith('.json'))
    .sort();
  const uiDestination = path.join(destination, 'i18n');
  await mkdir(uiDestination, { recursive: true });
  await removeStaleJson(uiDestination, files);
  for (const file of files) {
    const source = await json(path.join(upstream, file));
    const translation = localLanguages.has(file)
      ? await json(path.join(local, file))
      : {};
    // English supplies product terms until an overlay translates them.
    const result = merge(merge(source, localEnglish), translation);
    result.options.game = { endfield: result.options.game.endfield };
    delete result.editor;
    delete result.customData;
    delete result.error.deleteCustom;
    delete result.settings.modVersions;
    delete result.settings.requestMod;
    delete result.modSet;
    delete result.modSetTooltip;
    delete result.technologies.exportFromFactorio;
    delete result.technologies.exportCopyScript;
    delete result.technologies.exportScriptCopied;
    delete result.technologies.exportUseMod;
    await writeFile(
      path.join(uiDestination, file),
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
    const files = await prepareAssets(path.resolve(process.argv[index + 1]));
    console.log(
      `Prepared ${files.length} UI dictionaries in ${path.resolve(process.argv[index + 1])}`,
    );
  }
}
