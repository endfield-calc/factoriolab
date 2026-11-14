import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';

import ts from 'typescript';

import { buildSites } from './build-sites.mjs';
import { packageSites } from './package-sites.mjs';
import {
  normalizeBase,
  pathForUrl,
  readJson,
  verifySite,
  workspace,
} from './verify-sites.mjs';

let fixture;
let product;
// Check bootstrap structure without loading the upstream-only editor modules.
test('wires product guards into the real exported application routes', async () => {
  const parse = async (file) =>
    ts.createSourceFile(
      file,
      await readFile(path.join(workspace, file), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
  const exported = (source, name) => {
    const declaration = source.statements
      .filter(
        (statement) =>
          ts.isVariableStatement(statement) &&
          statement.modifiers?.some(
            (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
          ),
      )
      .flatMap((statement) => statement.declarationList.declarations)
      .find((declaration) => declaration.name.getText(source) === name);
    assert.ok(declaration?.initializer, `Missing exported ${name}`);
    return declaration.initializer;
  };
  const property = (object, name) => {
    assert.ok(ts.isObjectLiteralExpression(object));
    return object.properties.find(
      (member) =>
        ts.isPropertyAssignment(member) && member.name.getText() === name,
    )?.initializer;
  };
  const imported = (source, name, module) => {
    assert.ok(
      source.statements.some(
        (statement) =>
          ts.isImportDeclaration(statement) &&
          statement.moduleSpecifier.text === module &&
          statement.importClause?.namedBindings &&
          ts.isNamedImports(statement.importClause.namedBindings) &&
          statement.importClause.namedBindings.elements.some(
            (binding) =>
              binding.name.text === name &&
              (binding.propertyName?.text ?? binding.name.text) === name,
          ),
      ),
      `${name} must be imported from ${module}`,
    );
  };
  const flatten = (array) => {
    assert.ok(ts.isArrayLiteralExpression(array));
    return array.elements.flatMap((route) => {
      const children = property(route, 'children');
      return [route, ...(children == null ? [] : flatten(children))];
    });
  };
  const guards = (route) => {
    const value = property(route, 'canActivate');
    if (value == null) return [];
    assert.ok(ts.isArrayLiteralExpression(value));
    return value.elements.map((guard) => guard.getText());
  };
  const routeSource = await parse('src/app/app.routes.ts');
  imported(routeSource, 'idGuard', './id/id-guard');
  imported(routeSource, 'editorGuard', './id/id-guard');
  imported(routeSource, 'landingGuard', './landing/landing-guard');
  const routes = exported(routeSource, 'routes');
  const all = flatten(routes);
  assert.equal(
    all.filter((route) => guards(route).includes('idGuard')).length,
    1,
  );
  assert.equal(
    all.filter((route) => guards(route).includes('landingGuard')).length,
    2,
  );
  const idRoute = routes.elements.find(
    (route) => property(route, 'path')?.text === ':id',
  );
  assert.deepEqual(guards(idRoute), ['idGuard']);
  const landing = property(idRoute, 'children').elements.find(
    (route) =>
      property(route, 'path')?.text === '' &&
      guards(route).includes('landingGuard'),
  );
  assert.deepEqual(guards(landing), ['landingGuard']);
  const wildcard = routes.elements.find(
    (route) => property(route, 'path')?.text === '**',
  );
  assert.deepEqual(guards(wildcard), ['landingGuard']);
  const editors = all.filter(
    (route) => property(route, 'path')?.text === 'editor',
  );
  assert.equal(editors.length, 1);
  assert.deepEqual(guards(editors[0]), ['editorGuard']);
  assert.ok(ts.isArrowFunction(property(editors[0], 'loadComponent')));
  assert.ok(ts.isArrowFunction(property(editors[0], 'loadChildren')));
  assert.equal(
    all.flatMap((route) =>
      ['loadComponent', 'loadChildren']
        .map((key) => property(route, key))
        .filter((value) => value != null),
    ).length,
    7,
  );

  const configSource = await parse('src/app/app.config.ts');
  imported(configSource, 'routes', './app.routes');
  imported(configSource, 'provideRouter', '@angular/router');
  const providers = property(exported(configSource, 'appConfig'), 'providers');
  assert.ok(ts.isArrayLiteralExpression(providers));
  const routerProviders = providers.elements.filter(
    (value) =>
      ts.isCallExpression(value) &&
      ts.isIdentifier(value.expression) &&
      value.expression.text === 'provideRouter',
  );
  assert.equal(routerProviders.length, 1);
  const input = routerProviders[0].arguments[0];
  assert.ok(ts.isIdentifier(input));
  assert.equal(input.text, 'routes');
  assert.equal(
    routerProviders[0].arguments[1].getText(),
    'withComponentInputBinding()',
  );
});

const base = '/nested%20path/deeper/';
const release = {
  version: 'v20261114-0123456',
  branch: 'test-branch',
  date: '2026-11-14T00:00:00.000Z',
  sha: '0123456789abcdef0123456789abcdef01234567',
};

before(async () => {
  const parent = path.join(workspace, '.tmp/upstream-migration/delivery');
  await mkdir(parent, { recursive: true });
  fixture = await mkdtemp(path.join(parent, 'site-spec-'));
  product = await readJson(
    path.join(workspace, 'public/endfield/product.json'),
  );
});

after(async () => {
  if (fixture) await rm(fixture, { recursive: true, force: true });
});

async function file(root, name, contents) {
  const target = path.join(root, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

test('build prepares translations before Angular and packages only after success', async () => {
  const calls = [];
  await buildSites({
    base: '/nested path/deeper/',
    prepare: async (destination) => calls.push(['prepare', destination]),
    build: async (value) => calls.push(['build', value]),
    pack: async (options) => calls.push(['package', options.base]),
  });
  assert.deepEqual(calls, [
    ['prepare', path.join(workspace, '.tmp/endfield-assets/i18n')],
    ['build', base],
    ['package', base],
  ]);
  const failedCalls = [];
  await assert.rejects(
    buildSites({
      prepare: async () => failedCalls.push('prepare'),
      build: async () => {
        throw new Error('build failed');
      },
      pack: async () => failedCalls.push('package'),
    }),
    /build failed/,
  );
  assert.deepEqual(failedCalls, ['prepare']);
});

test('final sites are independent and every hash reflects final bytes at a subpath', async () => {
  const source = path.join(fixture, 'source');
  const output = path.join(fixture, 'sites');
  const index = `<!doctype html><html lang="en"><head><base href="${base}"><title>Original</title><meta name="description" content="Original"></head><body></body></html>`;
  const manifest = JSON.stringify({
    name: 'Original',
    icons: [{ src: 'icons/icon.png' }],
  });
  await file(source, 'index.html', index);
  await file(source, 'manifest.webmanifest', manifest);
  await file(source, 'release.json', '{}');
  await file(source, 'ngsw.json', '{"old":true}');
  await file(source, 'main.js', 'console.log("app");');
  await file(source, 'glpk.all.wasm', 'wasm bytes');
  await file(source, 'data/aef/data.json', '{}');
  await file(source, 'data/aef/hash.json', '{}');
  await file(source, 'i18n/en.json', '{"app":"English"}');
  await file(source, 'icons/icon.png', 'icon');
  await packageSites({
    base,
    sourceDir: source,
    outputRoot: output,
    product,
    release,
  });
  const pages = path.join(output, 'pages');
  const yituliu = path.join(output, 'yituliu');
  await verifySite(pages, { base, product, language: 'en' });
  await verifySite(yituliu, { base, product, language: 'zh' });
  const [en, zh] = await Promise.all([
    readFile(path.join(pages, 'index.html'), 'utf8'),
    readFile(path.join(yituliu, 'index.html'), 'utf8'),
  ]);
  assert.match(en, /<title>EndfieldLab<\/title>/);
  assert.match(zh, /<title>终末地量化计算器<\/title>/);
  assert.notEqual(en, zh);
  assert.equal(await readFile(path.join(source, 'index.html'), 'utf8'), index);
  assert.equal(
    await readFile(path.join(source, 'manifest.webmanifest'), 'utf8'),
    manifest,
  );
  assert.equal(
    await readFile(path.join(source, 'ngsw.json'), 'utf8'),
    '{"old":true}',
  );
  const [enSw, zhSw] = await Promise.all([
    readJson(path.join(pages, 'ngsw.json')),
    readJson(path.join(yituliu, 'ngsw.json')),
  ]);
  const hash = (text) => createHash('sha1').update(text).digest('hex');
  assert.equal(enSw.hashTable[`${base}index.html`], hash(en));
  assert.equal(zhSw.hashTable[`${base}index.html`], hash(zh));
  assert.notEqual(
    enSw.hashTable[`${base}index.html`],
    zhSw.hashTable[`${base}index.html`],
  );
  assert.equal(enSw.hashTable[`${base}ngsw.json`], undefined);
  assert.deepEqual(await readJson(path.join(pages, 'release.json')), release);
  await writeFile(
    path.join(yituliu, 'release.json'),
    JSON.stringify({ ...release, version: 'v20261114-7654321' }),
  );
  await assert.rejects(
    verifySite(yituliu, { base, product, language: 'zh' }),
    /hash mismatch.*release\.json/,
  );
  await verifySite(pages, { base, product, language: 'en' });
  await writeFile(
    path.join(yituliu, 'release.json'),
    `${JSON.stringify(release, null, 2)}\n`,
  );
  const manifestPath = path.join(yituliu, 'manifest.webmanifest');
  const originalManifest = await readFile(manifestPath, 'utf8');
  await writeFile(
    manifestPath,
    JSON.stringify({ ...JSON.parse(originalManifest), theme_color: '#000000' }),
  );
  await assert.rejects(
    verifySite(yituliu, { base, product, language: 'zh' }),
    /hash mismatch.*manifest\.webmanifest/,
  );
  await writeFile(manifestPath, originalManifest);
  await writeFile(path.join(yituliu, 'index.html'), `${zh}<!--changed-->`);
  await writeFile(path.join(yituliu, '404.html'), `${zh}<!--changed-->`);
  await assert.rejects(
    verifySite(yituliu, { base, product, language: 'zh' }),
    /hash mismatch.*index\.html/,
  );
  await writeFile(path.join(yituliu, 'index.html'), zh);
  await writeFile(path.join(yituliu, '404.html'), zh);
  await writeFile(path.join(yituliu, 'data/aef/data.json'), '{"changed":true}');
  await assert.rejects(
    verifySite(yituliu, { base, product, language: 'zh' }),
    /hash mismatch/,
  );
  await verifySite(pages, { base, product, language: 'en' });
});

test('invalid base and untrusted output or hash paths cannot escape their roots', async () => {
  for (const bad of [
    'relative/',
    '/missing-trailing',
    '/a/../',
    '/%2e%2e/',
    '/a%2fb/',
    '/a\\b/',
    '//evil/',
    '/a/?x',
  ]) {
    assert.throws(() => normalizeBase(bad));
  }
  const site = path.join(fixture, 'sites/pages');
  for (const bad of [
    `${base}../outside`,
    `${base}%2e%2e/outside`,
    `${base}a%2fb`,
    '/outside',
  ]) {
    assert.throws(() => pathForUrl(site, base, bad));
  }
  await assert.rejects(
    packageSites({
      base,
      sourceDir: path.join(fixture, 'source'),
      outputRoot: workspace,
      product,
      release,
    }),
    /below dist or .tmp/,
  );
  await assert.rejects(
    packageSites({
      base,
      sourceDir: path.join(fixture, 'source'),
      outputRoot: path.join(fixture, 'source/nested'),
      product,
      release,
    }),
    /must not overlap/,
  );
  const swPath = path.join(site, 'ngsw.json');
  const sw = await readJson(swPath);
  sw.hashTable[`${base}%2e%2e/outside`] = '0'.repeat(40);
  sw.assetGroups[0].urls.push(`${base}%2e%2e/outside`);
  await writeFile(swPath, JSON.stringify(sw));
  await assert.rejects(
    verifySite(site, { base, product, language: 'en' }),
    /Unsafe URL path segment/,
  );
  const linked = path.join(fixture, 'linked');
  try {
    await symlink(path.join(fixture, 'source'), linked, 'junction');
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') return;
    throw error;
  }
  await assert.rejects(
    packageSites({
      base,
      sourceDir: linked,
      outputRoot: path.join(fixture, 'other-sites'),
      product,
      release,
    }),
    /Symbolic link/,
  );
});
