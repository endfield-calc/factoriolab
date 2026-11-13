import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const workspace = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
export const defaultSites = path.join(workspace, 'dist/endfield-sites');

/** Normalize a path-only base without allowing traversal or encoded separators. */
export function normalizeBase(value = '/') {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    !value.endsWith('/') ||
    /[?#\\\u0000-\u001f]/.test(value) ||
    value.includes('//')
  ) {
    throw new Error('Base must be an absolute URL path ending in /');
  }
  if (value === '/') return '/';
  const segments = value.slice(1, -1).split('/').map(decodeSegment);
  return `/${segments.map(encodeURIComponent).join('/')}/`;
}

function decodeSegment(segment) {
  let decoded;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    throw new Error('Invalid URL encoding');
  }
  if (
    !decoded ||
    decoded === '.' ||
    decoded === '..' ||
    /[/\\:\u0000-\u001f]/.test(decoded)
  ) {
    throw new Error('Unsafe URL path segment');
  }
  return decoded;
}

export function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return (
    relative !== '' &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  );
}

/** Outputs and fixtures are confined to dist or .tmp, with no symlink ancestors. */
export async function assertManagedPath(value) {
  const resolved = path.resolve(value);
  if (
    ![path.join(workspace, 'dist'), path.join(workspace, '.tmp')].some(
      (parent) => isInside(parent, resolved),
    )
  ) {
    throw new Error(`Path must be below dist or .tmp: ${resolved}`);
  }
  let current = workspace;
  for (const component of path.relative(workspace, resolved).split(path.sep)) {
    current = path.join(current, component);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new Error(`Symbolic link is not allowed: ${current}`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      break;
    }
  }
  return resolved;
}

export async function assertSafeTree(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Symbolic link is not allowed: ${child}`);
    }
    if (entry.isDirectory()) await assertSafeTree(child);
    else if (!entry.isFile()) throw new Error(`Unexpected file type: ${child}`);
  }
}

export function pathForUrl(directory, base, url) {
  if (!url.startsWith(base) || /[?#\\]/.test(url)) {
    throw new Error(`URL is outside base ${base}: ${url}`);
  }
  const suffix = url.slice(base.length);
  const parts = suffix.split('/').map(decodeSegment);
  const result = path.resolve(directory, ...parts);
  if (!isInside(directory, result)) throw new Error(`URL escapes site: ${url}`);
  return result;
}

export async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

export function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function htmlAttribute(html, tag, attribute) {
  const elements = [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'gi'))];
  if (elements.length !== 1) throw new Error(`Expected one ${tag} element`);
  const match = elements[0][0].match(
    new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']*)["']`, 'i'),
  );
  if (!match) throw new Error(`Missing ${tag} ${attribute}`);
  return match[1];
}

export function descriptionTag(html) {
  const tags = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /\bname\s*=\s*["']description["']/i.test(tag));
  if (tags.length !== 1) throw new Error('Expected one description meta tag');
  return tags[0];
}

export function validateRelease(release) {
  if (
    !release ||
    typeof release.version !== 'string' ||
    !release.version.trim() ||
    typeof release.branch !== 'string' ||
    !release.branch.trim() ||
    typeof release.date !== 'string' ||
    !Number.isFinite(Date.parse(release.date)) ||
    typeof release.sha !== 'string' ||
    !/^[a-f0-9]{40,64}$/i.test(release.sha)
  )
    throw new Error('Release must include version, branch, date and full SHA');
}

/** Verify the exact final file bytes, not the earlier Angular build. */
export async function verifySite(
  directory,
  { base = '/', product, language } = {},
) {
  const site = await assertManagedPath(directory);
  const normalizedBase = normalizeBase(base);
  if (!product || !['en', 'zh'].includes(language))
    throw new Error('Product and site language are required');
  await assertSafeTree(site);
  const title = language === 'zh' ? product.nameZh : product.name;
  const description =
    language === 'zh' ? product.descriptionZh : product.description;
  if (
    ![title, description].every(
      (value) => typeof value === 'string' && value.trim(),
    )
  )
    throw new Error('Product metadata is incomplete');
  const html = await readFile(path.join(site, 'index.html'), 'utf8');
  const fallback = await readFile(path.join(site, '404.html'), 'utf8');
  if (fallback !== html)
    throw new Error('404.html must exactly match index.html');
  if (htmlAttribute(html, 'base', 'href') !== normalizedBase)
    throw new Error('HTML base does not match requested base');
  if (htmlAttribute(html, 'html', 'lang') !== language)
    throw new Error('Incorrect static language');
  const titles = [...html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)];
  if (titles.length !== 1 || titles[0][1] !== escapeHtml(title))
    throw new Error('Incorrect static title');
  if (
    htmlAttribute(descriptionTag(html), 'meta', 'content') !==
    escapeHtml(description)
  )
    throw new Error('Incorrect static description');
  const manifest = await readJson(path.join(site, 'manifest.webmanifest'));
  if (
    manifest.name !== title ||
    manifest.short_name !== title ||
    manifest.description !== description ||
    manifest.id !== './' ||
    manifest.start_url !== './' ||
    manifest.scope !== './'
  )
    throw new Error('Incorrect manifest metadata or scope');
  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0)
    throw new Error('Manifest icons are missing');
  for (const icon of manifest.icons) {
    if (
      typeof icon.src !== 'string' ||
      !icon.src ||
      icon.src.startsWith('/') ||
      /^[a-z][a-z0-9+.-]*:/i.test(icon.src)
    )
      throw new Error('Manifest icon must be relative to its base');
    const url = new URL(
      icon.src,
      `https://example.invalid${normalizedBase}manifest.webmanifest`,
    );
    if (url.origin !== 'https://example.invalid')
      throw new Error('Manifest icon leaves site');
    await readFile(pathForUrl(site, normalizedBase, url.pathname));
  }
  validateRelease(await readJson(path.join(site, 'release.json')));
  const dataDirectories = await readdir(path.join(site, 'data'));
  if (dataDirectories.length !== 1 || dataDirectories[0] !== 'aef')
    throw new Error('Production data must only contain aef');
  try {
    await lstat(path.join(site, 'endfield/i18n'));
    throw new Error('Source dictionaries must not be copied into the site');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const sw = await readJson(path.join(site, 'ngsw.json'));
  if (
    sw.index !== `${normalizedBase}index.html` ||
    !sw.hashTable ||
    typeof sw.hashTable !== 'object'
  )
    throw new Error('Invalid service worker base or hash table');
  const entries = Object.entries(sw.hashTable);
  const urls = new Set(
    (sw.assetGroups ?? []).flatMap((group) => group.urls ?? []),
  );
  if (
    !entries.length ||
    urls.size !== entries.length ||
    entries.some(([url]) => !urls.has(url))
  )
    throw new Error('Service worker URLs and hash table differ');
  for (const required of [
    'index.html',
    'manifest.webmanifest',
    'release.json',
    'data/aef/data.json',
    'data/aef/hash.json',
    'i18n/en.json',
    'glpk.all.wasm',
  ]) {
    if (!Object.hasOwn(sw.hashTable, `${normalizedBase}${required}`))
      throw new Error(`Service worker does not hash ${required}`);
  }
  for (const [url, expected] of entries) {
    const actual = createHash('sha1')
      .update(await readFile(pathForUrl(site, normalizedBase, url)))
      .digest('hex');
    if (actual !== expected)
      throw new Error(`Service worker hash mismatch: ${url}`);
  }
  return entries.length;
}

export async function verifySites({
  base = '/',
  outputRoot = defaultSites,
} = {}) {
  const output = await assertManagedPath(outputRoot);
  const product = await readJson(
    path.join(workspace, 'public/endfield/product.json'),
  );
  for (const [name, language] of [
    ['pages', 'en'],
    ['yituliu', 'zh'],
  ]) {
    const count = await verifySite(path.join(output, name), {
      base,
      product,
      language,
    });
    console.log(`Verified ${name}: ${count} service worker hashes`);
  }
}

export function readBaseArgument(args) {
  if (args.length === 0) return '/';
  if (args.length !== 2 || args[0] !== '--base')
    throw new Error('Usage: --base /path/');
  return normalizeBase(args[1]);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await verifySites({ base: readBaseArgument(process.argv.slice(2)) });
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
