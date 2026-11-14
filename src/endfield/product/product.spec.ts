import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ApplicationRef, FactoryProvider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Params,
  provideRouter,
  Router,
  RouterStateSnapshot,
  Routes,
  UrlTree,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { Id } from '~/app/id/id';
import { editorGuard, idGuard } from '~/app/id/id-guard';
import { landingGuard } from '~/app/landing/landing-guard';
import { DEFAULT_MOD } from '~/data/datasets';
import { Release } from '~/data/release';
import { provideEndfieldStateExtension } from '~/endfield/adapters/state-extension';
import { environment } from '~/environments/environment';
import {
  cloneDefaults,
  PRODUCT_PROFILE,
  ProductProfile,
  upstreamProduct,
} from '~/extensions/product-profile';
import { STATE_EXTENSION } from '~/extensions/state-extension';
import { rational } from '~/rational/rational';
import { FlowDiagram } from '~/state/preferences/flow-diagram';
import { PowerUnit } from '~/state/preferences/power-unit';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { Migration } from '~/state/router/migration';
import { RouterSync } from '~/state/router/router-sync';
import { MockComponent } from '~/tests/mocks/component';
import { TestModule } from '~/tests/test-module';

import { provideEndfield } from '../providers';
import { createEndfieldProduct, provideEndfieldProduct } from './product';

describe('Endfield release presentation', () => {
  let release: Release;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideEndfield(),
      ],
    });
    release = TestBed.inject(Release);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify({ ignoreCancelled: true });
  });

  it('keeps the view empty before its single upstream resource resolves', () => {
    expect(release.version()).toBe('');
  });

  for (const [version, expected] of [
    ['1.2.3', 'EndfieldLab 1.2.3'],
    ['', 'EndfieldLab (dev)'],
  ]) {
    it(`uses the product label for ${version || 'an unversioned build'}`, async () => {
      TestBed.tick();
      http.expectOne('release.json').flush({ version });
      await TestBed.inject(ApplicationRef).whenStable();
      expect(release.version()).toBe(expected);
    });
  }
});

describe('Endfield product', () => {
  it('uses only the production browser language and supports exact and prefix matches', () => {
    const cases: [boolean, string, string][] = [
      [false, 'zh-CN', 'en'],
      [true, 'zh', 'zh'],
      [true, 'zh-CN', 'zh'],
      [true, 'EN-us', 'en'],
      [true, 'DE-de', 'de'],
      [true, 'FR-CA', 'fr'],
      [true, 'RU-ru', 'ru'],
      [true, 'JA-JP', 'ja'],
      [true, 'ko-KR', 'ko'],
      [true, 'es-MX', 'es'],
      [true, 'pt-BR', 'pt-BR'],
      [true, 'PT-br', 'pt-BR'],
      [true, 'pt-PT', 'pt-BR'],
      [true, 'x-zh', 'en'],
      [true, '', 'en'],
    ];
    for (const [production, browser, expected] of cases)
      expect(
        createEndfieldProduct(production, browser).defaults().preferences
          .language,
      )
        .withContext(`${String(production)}: ${browser}`)
        .toBe(expected);
  });

  it('provides independent immutable defaults without changing upstream values', () => {
    const profile = createEndfieldProduct(true, 'zh-CN');
    const snapshot = profile.defaults();
    const defaults = cloneDefaults(snapshot);
    expect(
      snapshot.settings.costs.unproduceable.eq(rational(100000000)),
    ).toBeTrue();
    expect(snapshot.settings.costs.surplus.eq(rational.one)).toBeTrue();
    expect(snapshot.settings.costs.recycling.eq(rational.one)).toBeTrue();
    expect(
      profile.serializedCostDefaults?.unproduceable?.eq(rational(1000000)),
    ).toBeTrue();
    expect(
      profile.serializedCostDefaults?.recycling?.eq(rational(1000)),
    ).toBeTrue();
    expect(snapshot.preferences.powerUnit).toBe(PowerUnit.kW);
    expect(snapshot.preferences.theme).toBe('light');
    expect(snapshot.preferences.flowSettings.diagram).toBe(FlowDiagram.BoxLine);
    expect(Object.isFrozen(snapshot.preferences.flowSettings)).toBeTrue();
    defaults.preferences.flowSettings.diagram = FlowDiagram.Sankey;
    expect(snapshot.preferences.flowSettings.diagram).toBe(FlowDiagram.BoxLine);
    expect(
      upstreamProduct.defaults().settings.costs.surplus.eq(rational.zero),
    ).toBeTrue();
  });

  it('salvages valid archives, columns and flow fields and reports invalid fields', () => {
    const profile = createEndfieldProduct(true, 'zh-CN');
    const restore = profile.migratePreferences({
      states: {
        aef: { first: 'v=11&o=a&o=b', second: 'z=abc', broken: 123 },
        other: { old: '?x=1' },
      },
      language: 'ja',
      theme: 'black',
      powerUnit: 2,
      hideDuplicateIcons: true,
      columns: {
        items: { show: false, precision: 3 },
        belts: { show: 'bad', precision: null },
      },
      flowSettings: {
        diagram: 0,
        linkSize: 2,
        hideExcluded: true,
        linkText: 99,
      },
    });
    expect(restore.state.states).toEqual({
      aef: { first: 'v=11&o=a&o=b', second: 'z=abc' },
      other: { old: '?x=1' },
    });
    expect(restore.state.language).toBe('ja');
    expect(restore.state.theme).toBe('dark');
    expect(restore.state.powerUnit).toBe(PowerUnit.MW);
    expect(restore.state.columns?.items).toEqual({ show: false, precision: 3 });
    expect(restore.state.columns?.belts.precision).toBeNull();
    expect(restore.state.flowSettings?.diagram).toBe(FlowDiagram.Sankey);
    expect(restore.state.flowSettings?.linkText).toBe(2);
    expect(restore.state.flowSettings?.elkAlgorithm).toBe('layered');
    expect(
      (restore.state as Record<string, unknown>)['hideDuplicateIcons'],
    ).toBeTrue();
    expect(restore.warnings.length).toBeGreaterThan(0);
  });

  it('loads only the four available game translation packages', () => {
    const profile = createEndfieldProduct(false, 'zh');
    for (const lang of ['en', 'zh', 'ja', 'ru'] as const)
      expect(profile.loadGameI18n('aef', lang)).toBeTrue();
    for (const lang of ['de', 'fr', 'ko', 'pt-BR', 'es'] as const)
      expect(profile.loadGameI18n('aef', lang)).toBeFalse();
    expect(profile.loadGameI18n('2x1', 'en')).toBeFalse();
    expect(profile.languages.map((x): string => x.value).sort()).toEqual(
      ['de', 'en', 'fr', 'ja', 'ko', 'pt-BR', 'ru', 'es', 'zh'].sort(),
    );
    for (const { value } of profile.languages) {
      const restored = profile.migratePreferences({ language: value });
      expect(restored.state.language).withContext(value).toBe(value);
      expect(restored.warnings).withContext(value).toEqual([]);
    }
  });

  it('salvages independent fields while rejecting damaged archives and preferences', () => {
    const profile = createEndfieldProduct(true, 'zh');
    const input = {
      language: 'unknown',
      powerUnit: 99,
      bypassLanding: 'bad',
      showTechLabels: true,
      hue: Number.NaN,
      chroma: 42,
      glpkAlgorithm: 'bad',
      theme: 'bad',
      states: { aef: { safe: 'v=11&o=iron', broken: 3 }, invalid: [] },
      columns: {
        items: { show: true, precision: 101 },
        broken: {},
        belts: 'bad',
      },
      flowSettings: {
        diagram: 1,
        hideExcluded: false,
        elkAlgorithm: 'force',
        sankeyAlign: 99,
        unknown: 2,
      },
      sections: { sources: false, inputs: 'bad', unknown: true },
    };
    const result = profile.migratePreferences(input);
    expect(result.state.states).toEqual({ aef: { safe: 'v=11&o=iron' } });
    expect(result.state.language).toBeUndefined();
    expect(result.state.powerUnit).toBeUndefined();
    expect(result.state.showTechLabels).toBeTrue();
    expect(result.state.chroma).toBe(42);
    expect(result.state.theme).toBeUndefined();
    expect(result.state.columns?.items.show).toBeTrue();
    expect(result.state.flowSettings?.elkAlgorithm).toBe('force');
    expect(result.state.sections?.sources).toBeFalse();
    expect(result.warnings).toContain('Invalid preferences.states.aef.broken');
    expect(result.warnings).toContain('Invalid preferences.states.invalid');
    expect(result.warnings).toContain(
      'Invalid preferences.columns.items.precision',
    );
    expect(result.warnings).toContain(
      'Invalid preferences.flowSettings.sankeyAlign',
    );
    expect(result.warnings).toContain('Invalid preferences.sections.inputs');
    expect(input.states.aef.broken).toBe(3);
    expect(input.columns.items.precision).toBe(101);
  });

  it('handles invalid preference containers and validates localized game metadata', () => {
    const profile = createEndfieldProduct(false, 'en');
    expect(profile.migratePreferences(null).warnings).toEqual([
      'Invalid preferences',
    ]);
    const result = profile.migratePreferences({
      states: [],
      columns: [],
      flowSettings: null,
      sections: 'bad',
    });
    expect(result.warnings).toEqual([
      'Invalid preferences.states',
      'Invalid preferences.columns',
      'Invalid preferences.flowSettings',
      'Invalid preferences.sections',
    ]);
    expect(result.state.states).toEqual({});
    expect(profile.gameMetadata('other', 'en', {} as never)).toEqual({});
    expect(profile.gameMetadata('aef', 'en')).toEqual({});
    expect(
      profile.gameMetadata('aef', 'en', {
        name: 'Game',
        version: { current: '1.5' },
      } as never),
    ).toEqual({ name: 'Game', version: { current: '1.5' } });
    expect(
      profile.gameMetadata('aef', 'en', {
        name: 3,
        version: { current: 2 },
      } as never),
    ).toEqual({});
  });

  it('reads browser language only for a production provider', () => {
    const original = environment.production;
    spyOnProperty(navigator, 'language', 'get').and.returnValue('zh-CN');
    const factory = (provideEndfieldProduct() as FactoryProvider).useFactory;
    try {
      environment.production = false;
      expect(factory().defaults().preferences.language).toBe('en');
      environment.production = true;
      expect(factory().defaults().preferences.language).toBe('zh');
    } finally {
      environment.production = original;
    }
  });

  it('retains the supported stress layout algorithm during preference recovery', () => {
    const result = createEndfieldProduct(false, 'en').migratePreferences({
      flowSettings: { elkAlgorithm: 'stress' },
    });
    expect(result.state.flowSettings?.elkAlgorithm).toBe('stress');
    expect(result.warnings).toEqual([]);
  });
});

describe('PreferencesStore with Endfield product', () => {
  afterEach(() => {
    localStorage.clear();
  });

  function create(raw?: string): PreferencesStore {
    localStorage.clear();
    if (raw != null) localStorage.setItem('preferences', raw);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: PRODUCT_PROFILE,
          useValue: createEndfieldProduct(true, 'zh-CN'),
        },
      ],
    });
    return TestBed.inject(PreferencesStore);
  }

  it('uses the production browser language until a valid saved preference overrides it', () => {
    const service = create(
      JSON.stringify({
        language: 'ja',
        states: { aef: { saved: 'v=11&o=a' } },
      }),
    );
    expect(service.language()).toBe('ja');
    expect(service.states()['aef']['saved']).toBe('v=11&o=a');
    expect(service.flowSettings().elkAlgorithm).toBe('layered');
  });

  it('keeps a saved Portuguese preference over the browser default', () => {
    const service = create(JSON.stringify({ language: 'pt-BR' }));
    expect(service.language()).toBe('pt-BR');
    expect(service.migrationWarnings).toEqual([]);
  });

  it('backs up a partly damaged original before saving independently valid fields', () => {
    const raw = JSON.stringify({
      language: 'ru',
      theme: 'black',
      hideDuplicateIcons: true,
      states: { aef: { kept: 'z=abc&v=11', bad: 42, another: 'o=x&o=y' } },
      columns: {
        items: { show: false, precision: 2 },
        belts: { show: 'invalid', precision: 4 },
      },
    });
    const service = create(raw);
    expect(localStorage.getItem('preferences.recovery')).toBe(raw);
    expect(service.language()).toBe('ru');
    expect(service.theme()).toBe('dark');
    expect(service.states()['aef']).toEqual({
      kept: 'z=abc&v=11',
      another: 'o=x&o=y',
    });
    expect(service.columns().items).toEqual({ show: false, precision: 2 });
    expect(service.columns().belts.precision).toBe(4);
    TestBed.tick();
    const saved = JSON.parse(localStorage.getItem('preferences') ?? '{}');
    expect(saved.states.aef.kept).toBe('z=abc&v=11');
    expect(saved.hideDuplicateIcons).toBeTrue();
    expect(service.migrationWarnings.length).toBeGreaterThan(0);
  });

  it('preserves malformed JSON as a recovery copy before saving defaults', () => {
    const raw = '{"states":';
    const service = create(raw);
    expect(localStorage.getItem('preferences.recovery')).toBe(raw);
    expect(service.language()).toBe('zh');
    TestBed.tick();
    expect(localStorage.getItem('preferences')).not.toBeNull();
    expect(
      JSON.parse(localStorage.getItem('preferences') ?? '{}').language,
    ).toBe('zh');
  });

  it('keeps distinct recovery copies and reuses an existing copy of the same original', () => {
    const raw = '{"states":';
    localStorage.clear();
    localStorage.setItem('preferences', raw);
    localStorage.setItem('preferences.recovery', 'older original');
    localStorage.setItem('preferences.recovery.1', 'another original');
    spyOn(console, 'warn');
    TestBed.configureTestingModule({
      providers: [
        {
          provide: PRODUCT_PROFILE,
          useValue: createEndfieldProduct(false, 'zh'),
        },
      ],
    });
    const service = TestBed.inject(PreferencesStore);
    expect(service.migrationWarnings).toContain(
      'Failed to parse stored preferences',
    );
    expect(localStorage.getItem('preferences.recovery')).toBe('older original');
    expect(localStorage.getItem('preferences.recovery.1')).toBe(
      'another original',
    );
    expect(localStorage.getItem('preferences.recovery.2')).toBe(raw);
    TestBed.tick();

    localStorage.setItem('preferences', raw);
    TestBed.runInInjectionContext(() => new PreferencesStore());
    expect(localStorage.getItem('preferences.recovery.2')).toBe(raw);
    expect(localStorage.getItem('preferences.recovery.3')).toBeNull();
  });

  it('leaves the original intact when the recovery backup cannot be written', () => {
    const raw = '{bad';
    localStorage.clear();
    localStorage.setItem('preferences', raw);
    const realSet = localStorage.setItem.bind(localStorage);
    spyOn(Storage.prototype, 'setItem').and.callFake((key, value) => {
      if (key.startsWith('preferences.recovery')) throw new Error('quota');
      realSet(key, value);
    });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: PRODUCT_PROFILE,
          useValue: createEndfieldProduct(false, 'zh'),
        },
      ],
    });
    TestBed.inject(PreferencesStore);
    TestBed.tick();
    expect(localStorage.getItem('preferences')).toBe(raw);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'preferences.recovery',
      raw,
    );
  });
});

describe('Endfield route navigation', () => {
  function setup(
    profile: ProductProfile,
    options: { bypass?: boolean; stored?: string } = {},
  ): {
    router: Router;
    source: Routes;
    received: { id: string | undefined; params: Params }[];
    loadEditor: jasmine.Spy;
    bypass: jasmine.Spy;
    stored: jasmine.Spy;
    unzip: jasmine.Spy;
    migrate: jasmine.Spy;
  } {
    const received: { id: string | undefined; params: Params }[] = [];
    const capture: CanActivateFn = (route) => {
      received.push({
        id: route.parent?.params['id'] as string | undefined,
        params: route.queryParams,
      });
      return true;
    };
    const loadEditor = jasmine
      .createSpy('loadEditor')
      .and.resolveTo(MockComponent);
    const source: Routes = [
      {
        path: 'editor',
        canActivate: [editorGuard],
        loadComponent: loadEditor,
        children: [{ path: 'deep', component: MockComponent }],
      },
      {
        path: ':id',
        canActivate: [idGuard],
        children: [
          {
            path: '',
            pathMatch: 'full',
            canActivate: [landingGuard],
            component: MockComponent,
          },
          ...['list', 'wizard', 'flow', 'data'].map((path) => ({
            path,
            canActivate: [capture],
            runGuardsAndResolvers: 'always' as const,
            component: MockComponent,
          })),
        ],
      },
      { path: '**', canActivate: [landingGuard], children: [] },
    ];
    const bypass = jasmine
      .createSpy('bypassLanding')
      .and.returnValue(options.bypass ?? false);
    const stored = jasmine.createSpy('stored').and.returnValue(options.stored);
    const unzip = jasmine
      .createSpy('unzipQueryParams')
      .and.callFake((params: Params) => Promise.resolve(params));
    const migrate = jasmine.createSpy('migrate').and.returnValue({
      modId: 'sfy',
      params: { v: '12', o: ['migrated', 'again'] },
    });
    const hash = jasmine.createSpy('getHashParams').and.resolveTo({});
    TestBed.configureTestingModule({
      providers: [
        provideRouter(source),
        { provide: PRODUCT_PROFILE, useValue: profile },
        { provide: PreferencesStore, useValue: { bypassLanding: bypass } },
        {
          provide: RouterSync,
          useValue: { stored, unzipQueryParams: unzip, getHashParams: hash },
        },
        { provide: Migration, useValue: { migrate } },
      ],
    });
    return {
      router: TestBed.inject(Router),
      source,
      received,
      loadEditor,
      bypass,
      stored,
      unzip,
      migrate,
    };
  }

  it('passes every shortcut query to the destination unchanged before any old migration', async () => {
    const fixture = setup(createEndfieldProduct(false, 'en'));
    const harness = await RouterTestingHarness.create('/aef/list?v=11&o=a&o=b');
    expect(fixture.router.url).toBe('/aef/list?v=11&o=a&o=b');
    for (const shortcut of ['list', 'wizard', 'flow', 'data']) {
      await harness.navigateByUrl(`/${shortcut}?v=11&o=a&o=b&cet=x&z=abc`);
      expect(fixture.router.url).toBe(
        `/aef/${shortcut}?v=11&o=a&o=b&cet=x&z=abc`,
      );
      expect(fixture.received.at(-1)).toEqual({
        id: 'aef',
        params: { v: '11', o: ['a', 'b'], cet: 'x', z: 'abc' },
      });
    }
    expect(fixture.unzip).not.toHaveBeenCalled();
    expect(fixture.migrate).not.toHaveBeenCalled();
  });

  it('drops foreign queries and blocks editor and editor deep links', async () => {
    const fixture = setup(createEndfieldProduct(false, 'en'));
    const harness = await RouterTestingHarness.create('/2x1/list?o=foreign');
    expect(fixture.router.url).toBe('/aef');
    for (const url of [
      '/factorio?o=foreign',
      '/cst/list?o=foreign',
      '/editor?o=foreign',
      '/editor/deep?o=foreign',
    ]) {
      await harness.navigateByUrl(url);
      expect(fixture.router.url).withContext(url).toBe('/aef');
    }
    expect(fixture.loadEditor).not.toHaveBeenCalled();
    expect(fixture.unzip).not.toHaveBeenCalled();
    expect(fixture.migrate).not.toHaveBeenCalled();
  });

  it('preserves a root query with landing enabled without consulting the cache', async () => {
    const fixture = setup(createEndfieldProduct(false, 'en'), {
      stored: '/aef/list?old=1',
    });
    await RouterTestingHarness.create('/?v=11&o=a&o=b');
    expect(fixture.router.url).toBe('/aef?v=11&o=a&o=b');
    expect(fixture.stored).not.toHaveBeenCalled();
  });

  it('uses the upstream default for a restricted product without a default mod', async () => {
    const fixture = setup({
      ...upstreamProduct,
      allowedModIds: [DEFAULT_MOD],
    });
    const harness = await RouterTestingHarness.create('/?v=11&o=a&o=b');
    expect(fixture.router.url).toBe(`/${DEFAULT_MOD}?v=11&o=a&o=b`);
    fixture.bypass.and.returnValue(true);
    await harness.navigateByUrl('/?v=11&o=a&o=b');
    expect(fixture.router.url).toBe(`/${DEFAULT_MOD}/list?v=11&o=a&o=b`);
    expect(fixture.unzip).not.toHaveBeenCalled();
    expect(fixture.migrate).not.toHaveBeenCalled();
  });

  it('resumes only an allowed cache and gives an explicit root query priority', async () => {
    const fixture = setup(createEndfieldProduct(false, 'en'), {
      bypass: true,
      stored: '/aef/list?v=11&o=old',
    });
    const harness = await RouterTestingHarness.create('/');
    expect(fixture.router.url).toBe('/aef/list?v=11&o=old');
    fixture.stored.and.returnValue('/2x1/list?o=foreign');
    await harness.navigateByUrl('/');
    expect(fixture.router.url).toBe('/aef/list');
    fixture.stored.and.returnValue('/aef/list?old=1');
    await harness.navigateByUrl('/?v=11&o=a&o=b');
    expect(fixture.router.url).toBe('/aef/list?v=11&o=a&o=b');
    await harness.navigateByUrl('/aef');
    expect(fixture.router.url).toBe('/aef/list');
    expect(fixture.unzip).not.toHaveBeenCalled();
    expect(fixture.migrate).not.toHaveBeenCalled();
  });

  it('treats an empty allowlist as an active restriction', () => {
    const fixture = setup(
      {
        ...upstreamProduct,
        defaultModId: 'aef',
        allowedModIds: [],
      },
      { bypass: true, stored: '/aef/list?old=1' },
    );
    const state = {} as RouterStateSnapshot;
    const idRoute = {
      params: { id: 'aef' },
      queryParams: {},
    } as unknown as ActivatedRouteSnapshot;
    const idResult = TestBed.runInInjectionContext(() =>
      idGuard(idRoute, state),
    );
    expect(idResult instanceof UrlTree).toBeTrue();
    expect(fixture.router.serializeUrl(idResult as UrlTree)).toBe('/aef');
    const rootRoute = {
      params: {},
      queryParams: {},
      paramMap: { get: () => null },
    } as unknown as ActivatedRouteSnapshot;
    const landingResult = TestBed.runInInjectionContext(() =>
      landingGuard(rootRoute, state),
    );
    expect(fixture.router.serializeUrl(landingResult as UrlTree)).toBe(
      '/aef/list',
    );
    expect(fixture.migrate).not.toHaveBeenCalled();
  });

  it('preserves upstream shortcut, alias and ordinary-id behavior in neutral mode', async () => {
    const fixture = setup(upstreamProduct);
    const harness = await RouterTestingHarness.create('/ffy');
    for (const [url, expected] of [
      ['/list?v=10&o=a&o=b', '/sfy/list?v=12&o=migrated&o=again'],
      ['/wizard?v=10&o=a&o=b', '/sfy/wizard?v=12&o=migrated&o=again'],
      ['/flow?v=10&o=a&o=b', '/sfy/flow?v=12&o=migrated&o=again'],
      ['/data?v=10&o=a&o=b', '/sfy/data?v=12&o=migrated&o=again'],
      ['/factorio?x=1', '/2x1'],
      ['/final-factory?x=1', '/ffy'],
      ['/custom/list?x=1', '/custom/list?x=1'],
    ]) {
      await harness.navigateByUrl(url);
      expect(fixture.router.url).withContext(url).toBe(expected);
    }
    expect(fixture.unzip).toHaveBeenCalled();
    expect(fixture.migrate).toHaveBeenCalled();
    expect(fixture.router.url).toBe('/custom/list?x=1');
  });

  it('preserves neutral landing and editor behavior', async () => {
    const fixture = setup(upstreamProduct, {
      stored: '/2x1/list?o=old',
    });
    const harness = await RouterTestingHarness.create('/?v=11&o=a&o=b');
    expect(fixture.router.url).toBe(`/${DEFAULT_MOD}?v=11&o=a&o=b`);
    fixture.bypass.and.returnValue(true);
    await harness.navigateByUrl('/');
    expect(fixture.router.url).toBe('/2x1/list?o=old');
    await harness.navigateByUrl('/?v=11&o=a&o=b');
    expect(fixture.router.url).toBe(`/${DEFAULT_MOD}/list?v=11&o=a&o=b`);
    await harness.navigateByUrl('/editor?x=1');
    expect(fixture.router.url).toBe('/editor?x=1');
    expect(fixture.loadEditor).toHaveBeenCalled();
  });
});

describe('Shortcut forwarding to the Endfield codec', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('passes the activated Id query to the codec before migration', async () => {
    localStorage.clear();
    const sequence: string[] = [];
    const migrate = jasmine.createSpy('migrate').and.callFake(() => {
      sequence.push('migrate');
      throw new Error('Stop after observing codec preparation');
    });
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        provideEndfieldProduct(),
        ...provideEndfieldStateExtension(),
        { provide: Migration, useValue: { migrate } },
        provideRouter([
          {
            path: ':id',
            component: Id,
            canActivate: [idGuard],
            children: [{ path: 'list', component: MockComponent }],
          },
        ]),
      ],
    });
    const router = TestBed.inject(Router);
    const http = TestBed.inject(HttpTestingController);
    const extension = TestBed.inject(STATE_EXTENSION);
    const originalPrepare = extension.prepare.bind(extension);
    const prepare = spyOn(extension, 'prepare').and.callFake((input) => {
      sequence.push('prepare');
      return originalPrepare(input);
    });
    await RouterTestingHarness.create('/list?v=11&o=a&o=b&cet=x');
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
      TestBed.tick();
    }

    expect(router.url).toBe('/aef/list?v=11&o=a&o=b&cet=x');
    expect(prepare).toHaveBeenCalledOnceWith({
      modId: 'aef',
      params: { v: '11', o: ['a', 'b'], cet: 'x' },
    });
    expect(migrate).toHaveBeenCalledTimes(1);
    expect(sequence).toEqual(['prepare', 'migrate']);
    http.expectNone((request) => /^data\/(?!aef\/)/.test(request.url));
  });
});
