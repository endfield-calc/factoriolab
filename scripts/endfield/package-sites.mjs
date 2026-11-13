import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  assertManagedPath,
  assertSafeTree,
  defaultSites,
  descriptionTag,
  escapeHtml,
  htmlAttribute,
  isInside,
  normalizeBase,
  readBaseArgument,
  readJson,
  validateRelease,
  verifySite,
  workspace,
} from './verify-sites.mjs';

const exec = promisify(execFile);
const defaultSource = path.join(workspace, 'dist/factoriolab/browser');

async function git(...args) {
  const { stdout } = await exec('git', args, { cwd: workspace });
  return stdout.trim();
}

export async function releaseMetadata() {
  const sha = process.env.GITHUB_SHA || (await git('rev-parse', 'HEAD'));
  const branch =
    process.env.GITHUB_REF_NAME || (await git('branch', '--show-current'));
  const date = new Date().toISOString();
  const version = `v${date.slice(0, 10).replaceAll('-', '')}-${sha.slice(0, 7)}`;
  const release = { version, branch, date, sha };
  validateRelease(release);
  return release;
}

function replaceOnce(input, expression, replacement, label) {
  const matches = [...input.matchAll(expression)];
  if (matches.length !== 1) throw new Error(`Expected one ${label}`);
  return input.replace(expression, () => replacement);
}

async function writeSiteMetadata(
  directory,
  { base, product, release, language },
) {
  const title = language === 'zh' ? product.nameZh : product.name;
  const description =
    language === 'zh' ? product.descriptionZh : product.description;
  if (
    ![title, description].every(
      (value) => typeof value === 'string' && value.trim(),
    )
  )
    throw new Error('Product metadata is incomplete');
  const indexPath = path.join(directory, 'index.html');
  let html = await readFile(indexPath, 'utf8');
  if (htmlAttribute(html, 'base', 'href') !== base)
    throw new Error('Build base does not match requested packaging base');
  html = replaceOnce(
    html,
    /<title\b[^>]*>[\s\S]*?<\/title>/gi,
    `<title>${escapeHtml(title)}</title>`,
    'title',
  );
  const descriptionElement = descriptionTag(html);
  html = html.replace(
    descriptionElement,
    `<meta name="description" content="${escapeHtml(description)}">`,
  );
  html = replaceOnce(
    html,
    /<html\b[^>]*>/gi,
    html
      .match(/<html\b[^>]*>/i)[0]
      .replace(/\blang\s*=\s*["'][^"']*["']/i, `lang="${language}"`),
    'html element',
  );
  if (htmlAttribute(html, 'html', 'lang') !== language)
    throw new Error('HTML language is missing');
  await writeFile(indexPath, html);
  await writeFile(path.join(directory, '404.html'), html);
  const manifestPath = path.join(directory, 'manifest.webmanifest');
  const manifest = await readJson(manifestPath);
  Object.assign(manifest, {
    name: title,
    short_name: title,
    description,
    id: './',
    start_url: './',
    scope: './',
  });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    path.join(directory, 'release.json'),
    `${JSON.stringify(release, null, 2)}\n`,
  );
}

async function generateServiceWorker(directory, base) {
  // The JSON asset glob matches a pre-existing ngsw.json, so remove it before
  // regeneration to avoid recording a hash of the previous manifest itself.
  await rm(path.join(directory, 'ngsw.json'), { force: true });
  await exec(
    process.execPath,
    [
      'node_modules/@angular/service-worker/ngsw-config.js',
      path.relative(workspace, directory),
      'ngsw-config.json',
      base,
    ],
    { cwd: workspace },
  );
}

/** Copy the Angular output into separate, independently finalized sites. */
export async function packageSites({
  base = '/',
  sourceDir = defaultSource,
  outputRoot = defaultSites,
  product,
  release,
} = {}) {
  const normalizedBase = normalizeBase(base);
  const source = await assertManagedPath(sourceDir);
  const output = await assertManagedPath(outputRoot);
  if (source === output || isInside(source, output) || isInside(output, source))
    throw new Error('Source and site outputs must not overlap');
  await assertSafeTree(source);
  const selectedProduct =
    product ??
    (await readJson(path.join(workspace, 'public/endfield/product.json')));
  const selectedRelease = release ?? (await releaseMetadata());
  validateRelease(selectedRelease);
  const sourceHtml = await readFile(path.join(source, 'index.html'), 'utf8');
  if (htmlAttribute(sourceHtml, 'base', 'href') !== normalizedBase)
    throw new Error('Build base does not match requested packaging base');
  await mkdir(output, { recursive: true });
  for (const [name, language] of [
    ['pages', 'en'],
    ['yituliu', 'zh'],
  ]) {
    const destination = await assertManagedPath(path.join(output, name));
    await rm(destination, { recursive: true, force: true });
    await cp(source, destination, { recursive: true });
    await writeSiteMetadata(destination, {
      base: normalizedBase,
      product: selectedProduct,
      release: selectedRelease,
      language,
    });
    await generateServiceWorker(destination, normalizedBase);
    const count = await verifySite(destination, {
      base: normalizedBase,
      product: selectedProduct,
      language,
    });
    console.log(`Packaged ${name}: ${count} verified service worker hashes`);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await packageSites({ base: readBaseArgument(process.argv.slice(2)) });
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
