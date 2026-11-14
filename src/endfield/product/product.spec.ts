import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CanActivateFn,
  Params,
  provideRouter,
  Router,
  Routes,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { Id } from '~/app/id/id';
import { editorGuard, idGuard } from '~/app/id/id-guard';
import { landingGuard } from '~/app/landing/landing-guard';
import { DEFAULT_MOD } from '~/data/datasets';
import { Release } from '~/data/release';
import { emptyModData } from '~/data/schema/mod-data';
import {
  cloneDefaults,
  EFFECTIVE_DEFAULTS,
  initialDefaults,
  PINNED_MOD_ID,
} from '~/extensions/defaults';
import { rational } from '~/rational/rational';
import { FlowDiagram } from '~/state/preferences/flow-diagram';
import { PowerUnit } from '~/state/preferences/power-unit';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { Migration } from '~/state/router/migration';
import { RouterSync } from '~/state/router/router-sync';
import { SettingsStore } from '~/state/settings/settings-store';
import { MockComponent } from '~/tests/mocks/component';
import { mockModHash } from '~/tests/mocks/data';
import { TestModule } from '~/tests/test-module';

import { provideEndfield } from '../providers';
import { createEndfieldDefaults, provideEndfieldDefaults } from './product';

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
      expect(createEndfieldDefaults(production, browser).preferences.language)
        .withContext(`${String(production)}: ${browser}`)
        .toBe(expected);
  });

  it('provides independent immutable defaults without changing upstream values', () => {
    const snapshot = createEndfieldDefaults(true, 'zh-CN');
    const defaults = cloneDefaults(snapshot);
    expect(
      snapshot.settings.costs.unproduceable.eq(rational(100000000)),
    ).toBeTrue();
    expect(snapshot.settings.costs.surplus.eq(rational.one)).toBeTrue();
    expect(snapshot.settings.costs.recycling.eq(rational.one)).toBeTrue();
    expect(snapshot.preferences.powerUnit).toBe(PowerUnit.kW);
    expect(snapshot.preferences.theme).toBe('light');
    expect(snapshot.preferences.flowSettings.diagram).toBe(FlowDiagram.BoxLine);
    expect(Object.isFrozen(snapshot.preferences.flowSettings)).toBeTrue();
    defaults.preferences.flowSettings.diagram = FlowDiagram.Sankey;
    expect(snapshot.preferences.flowSettings.diagram).toBe(FlowDiagram.BoxLine);
    expect(initialDefaults.settings.costs.surplus.eq(rational.zero)).toBeTrue();
  });

  it('provides pinned Endfield defaults while keeping the native factory reusable', () => {
    TestBed.configureTestingModule({ providers: provideEndfieldDefaults() });
    expect(TestBed.inject(PINNED_MOD_ID)).toBe('aef');
    expect(TestBed.inject(EFFECTIVE_DEFAULTS)).toEqual(
      createEndfieldDefaults(false, navigator.language),
    );
    expect(
      cloneDefaults(initialDefaults).settings.costs.surplus.eq(rational.zero),
    ).toBeTrue();
  });
});

describe('PreferencesStore with Endfield defaults', () => {
  const defaults = createEndfieldDefaults(true, 'zh-CN');

  afterEach(() => {
    localStorage.clear();
  });

  function create(raw?: string): PreferencesStore {
    localStorage.clear();
    if (raw != null) localStorage.setItem('preferences', raw);
    TestBed.configureTestingModule({
      providers: [{ provide: EFFECTIVE_DEFAULTS, useValue: defaults }],
    });
    return TestBed.inject(PreferencesStore);
  }

  it('restores a valid current preferences object and preserves archives on reset', () => {
    const saved = cloneDefaults(defaults).preferences;
    saved.language = 'ja';
    saved.theme = 'dark';
    saved.states = { aef: { saved: '/aef/list?v=12&o=iron_ore*1' } };
    const service = create(JSON.stringify(saved));
    expect(service.restoreError()).toBeUndefined();
    expect(service.language()).toBe('ja');
    expect(service.states()).toEqual(saved.states);
    service.resetPreferences(true);
    TestBed.tick();
    expect(service.theme()).toBe('light');
    expect(service.states()).toEqual(saved.states);
    const persisted = JSON.parse(localStorage.getItem('preferences')!);
    expect(persisted.theme).toBe('light');
    expect(persisted.states).toEqual(saved.states);
  });

  it('merges a valid current partial object with defaults', () => {
    const service = create(
      JSON.stringify({
        language: 'pt-BR',
        states: { aef: { safe: '/aef/list?v=12' } },
        columns: { items: { show: false, precision: 3 } },
        flowSettings: { elkAlgorithm: 'stress' },
        sections: { sources: false },
      }),
    );
    expect(service.restoreError()).toBeUndefined();
    expect(service.language()).toBe('pt-BR');
    expect(service.states()['aef']['safe']).toBe('/aef/list?v=12');
    expect(service.columns().items).toEqual({ show: false, precision: 3 });
    expect(service.columns().belts).toEqual(defaults.preferences.columns.belts);
    expect(service.flowSettings().elkAlgorithm).toBe('stress');
    expect(service.flowSettings().diagram).toBe(
      defaults.preferences.flowSettings.diagram,
    );
    expect(service.state().sections.sources).toBeFalse();
    expect(service.state().sections.outputs).toBeTrue();
  });

  it('clears archives when explicitly resetting without preservation', () => {
    const raw = JSON.stringify({
      language: 'ja',
      states: { aef: { first: '/aef/list?v=12' }, other: { saved: '?v=12' } },
    });
    const service = create(raw);
    expect(service.restoreError()).toBeUndefined();
    expect(service.states()['aef']['first']).toBe('/aef/list?v=12');
    service.resetPreferences(false);
    TestBed.tick();
    expect(service.language()).toBe('zh');
    expect(service.states()).toEqual({});
    expect(JSON.parse(localStorage.getItem('preferences')!).states).toEqual({});
  });

  const validScalars: [string, unknown][] = [
    ...['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt-BR', 'ru', 'zh'].map(
      (value): [string, unknown] => ['language', value],
    ),
    ...[0, 1, 2, 3].map((value): [string, unknown] => ['powerUnit', value]),
    ...['system', 'light', 'dark'].map((value): [string, unknown] => [
      'theme',
      value,
    ]),
    ...['simplex', 'exact'].map((value): [string, unknown] => [
      'glpkAlgorithm',
      value,
    ]),
    ['hue', -1],
    ['chroma', 0],
    ['backgroundLightness', 100],
    ['bypassLanding', true],
    ['paused', false],
  ];
  for (const [field, value] of validScalars) {
    it(`restores and saves current ${field} = ${String(value)}`, () => {
      const service = create(JSON.stringify({ [field]: value }));
      expect(service.restoreError()).toBeUndefined();
      const state = service.state() as unknown as Record<string, unknown>;
      expect(state[field]).toEqual(value);
      TestBed.tick();
      const saved = JSON.parse(localStorage.getItem('preferences')!) as Record<
        string,
        unknown
      >;
      expect(saved[field]).toEqual(value);
    });
  }

  const validFlows: [string, unknown][] = [
    ...[0, 1].map((value): [string, unknown] => ['diagram', value]),
    ...[0, 1, 2, 3, 4, 5].flatMap((value): [string, unknown][] => [
      ['linkSize', value],
      ['linkText', value],
    ]),
    ...[0, 1, 2, 3].map((value): [string, unknown] => ['sankeyAlign', value]),
    ...[false, true].map((value): [string, unknown] => ['hideExcluded', value]),
    ...['layered', 'force', 'stress'].map((value): [string, unknown] => [
      'elkAlgorithm',
      value,
    ]),
  ];
  for (const [field, value] of validFlows) {
    it(`restores current flow ${field} = ${String(value)} without losing other defaults`, () => {
      const service = create(
        JSON.stringify({ flowSettings: { [field]: value } }),
      );
      expect(service.restoreError()).toBeUndefined();
      const flow = service.flowSettings() as unknown as Record<string, unknown>;
      expect(flow[field]).toEqual(value);
      expect(Object.keys(flow).sort()).toEqual(
        Object.keys(defaults.preferences.flowSettings).sort(),
      );
      TestBed.tick();
      const saved = JSON.parse(localStorage.getItem('preferences')!);
      expect(saved.flowSettings[field]).toEqual(value);
    });
  }

  for (const precision of [null, 0, 100]) {
    it(`restores and saves a column precision of ${String(precision)}`, () => {
      const service = create(
        JSON.stringify({ columns: { items: { show: false, precision } } }),
      );
      expect(service.restoreError()).toBeUndefined();
      expect(service.columns().items).toEqual({ show: false, precision });
      expect(service.columns().belts).toEqual(
        defaults.preferences.columns.belts,
      );
      TestBed.tick();
      expect(
        JSON.parse(localStorage.getItem('preferences')!).columns.items,
      ).toEqual({ show: false, precision });
    });
  }

  it('restores all current section booleans and valid empty archives', () => {
    const sections = {
      sources: false,
      destinations: true,
      depletion: false,
      inputs: true,
      outputs: false,
    };
    const service = create(
      JSON.stringify({ sections, states: { aef: {}, other: { empty: '' } } }),
    );
    expect(service.restoreError()).toBeUndefined();
    expect(service.state().sections).toEqual(sections);
    expect(service.states()).toEqual({ aef: {}, other: { empty: '' } });
    TestBed.tick();
    const saved = JSON.parse(localStorage.getItem('preferences')!);
    expect(saved.sections).toEqual(sections);
    expect(saved.states).toEqual({ aef: {}, other: { empty: '' } });
  });

  const invalidFields: [string, unknown][] = [
    ['unknown', true],
    ['language', 'not-a-language'],
    ['powerUnit', -1],
    ['powerUnit', 4],
    ['powerUnit', 1.5],
    ['powerUnit', '1'],
    ['theme', 'black'],
    ['glpkAlgorithm', 'not-a-solver'],
    ['hue', '10'],
    ['chroma', {}],
    ['backgroundLightness', null],
    ['states', []],
    ['states', { aef: [] }],
    ['states', { aef: { safe: 'v=12', invalid: 1 } }],
    ['columns', null],
    ['columns', []],
    ['columns', { unknown: { show: true, precision: 0 } }],
    ['columns', { items: [] }],
    ['columns', { items: { show: true } }],
    ['columns', { items: { show: 'true', precision: 0 } }],
    ...[-1, 101, 1.5, '1'].map((precision): [string, unknown] => [
      'columns',
      { items: { show: true, precision } },
    ]),
    ['columns', { items: { show: true, precision: 0, extra: false } }],
    ['flowSettings', null],
    ['flowSettings', []],
    ['flowSettings', { diagram: 2 }],
    ['flowSettings', { linkSize: 6 }],
    ['flowSettings', { linkText: -1 }],
    ['flowSettings', { sankeyAlign: 4 }],
    ['flowSettings', { hideExcluded: 'false' }],
    ['flowSettings', { elkAlgorithm: 'random' }],
    ['flowSettings', { extra: true }],
    ['sections', null],
    ['sections', []],
    ['sections', { unknown: true }],
    ['sections', { sources: 'false' }],
    ['bypassLanding', 1],
  ];
  const invalidDocuments: [string, string][] = [
    ...[null, [], 42, 'bad'].map((value): [string, string] => [
      `root ${JSON.stringify(value)}`,
      JSON.stringify(value),
    ]),
    ['non-finite scalar', '{"language":"ru","hue":1e1000}'],
    ...invalidFields.map(([field, value], i): [string, string] => [
      `${field} case ${i}: ${JSON.stringify(value)}`,
      JSON.stringify({
        language: 'ru',
        states: { aef: { safe: 'v=12' } },
        [field]: value,
      }),
    ]),
  ];
  for (const [label, raw] of invalidDocuments) {
    it(`rejects invalid ${label} as one document and protects its original`, () => {
      spyOn(console, 'warn');
      const service = create(raw);
      expect(service.restoreError()).toBeDefined();
      expect(service.stored()).toBe(raw);
      expect(service.language()).toBe('zh');
      expect(service.states()).toEqual({});
      TestBed.tick();
      service.apply({ language: 'ja' });
      service.saveState('aef', 'later', '/aef/list?v=12');
      TestBed.tick();
      expect(service.restoreError()).toBeDefined();
      expect(localStorage.getItem('preferences')).toBe(raw);
      expect(localStorage.getItem('preferences.recovery')).toBeNull();
    });
  }

  for (const [label, raw] of [
    ['malformed JSON', '{"states":'],
    ['empty JSON', ''],
    ['retired black theme', JSON.stringify({ theme: 'black', language: 'ru' })],
    [
      'invalid nested schema',
      JSON.stringify({
        ...cloneDefaults(defaults).preferences,
        theme: 'black',
        language: 'ru',
        states: { aef: { safe: '/aef/list?v=12', broken: 42 } },
      }),
    ],
  ]) {
    it(`preserves ${label} without salvaging fields until explicit reset`, () => {
      const service = create(raw);
      expect(service.restoreError()).toBeDefined();
      expect(service.language()).toBe('zh');
      expect(service.theme()).toBe('light');
      expect(service.states()).toEqual({});
      TestBed.tick();
      service.apply({ theme: 'dark', language: 'ja' });
      service.saveState('aef', 'new', '/aef/list?v=12');
      TestBed.tick();
      expect(service.restoreError()).toBeDefined();
      expect(localStorage.getItem('preferences')).toBe(raw);
      expect(localStorage.getItem('preferences.recovery')).toBeNull();
      expect(localStorage.getItem('preferences.recovery.1')).toBeNull();
      service.resetPreferences(true);
      TestBed.tick();
      expect(service.restoreError()).toBeUndefined();
      const persisted = JSON.parse(localStorage.getItem('preferences')!);
      expect(persisted.theme).toBe('light');
      expect(persisted.states.aef.new).toBe('/aef/list?v=12');
    });
  }

  it('does not consult or change the retired display preference', () => {
    localStorage.clear();
    localStorage.setItem('endfield.presentation', '{broken');
    const get = spyOn(Storage.prototype, 'getItem').and.callThrough();
    TestBed.configureTestingModule({
      providers: [{ provide: EFFECTIVE_DEFAULTS, useValue: defaults }],
    });
    const service = TestBed.inject(PreferencesStore);
    TestBed.tick();
    expect(service.restoreError()).toBeUndefined();
    expect(get).not.toHaveBeenCalledWith('endfield.presentation');
    expect(localStorage.getItem('endfield.presentation')).toBe('{broken');
  });
});

describe('dataset HTTP boundary', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('loads aef but does not request or expose a foreign dataset when pinned', async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideEndfieldDefaults(),
      ],
    });
    const settings = TestBed.inject(SettingsStore);
    const http = TestBed.inject(HttpTestingController);
    expect(settings.gameOptions.map((option) => option.value)).toEqual([
      'endfield',
    ]);
    settings.apply({ modId: 'aef' });
    TestBed.tick();
    const data = emptyModData();
    data.version = { game: 'aef' };
    http.expectOne('data/aef/data.json').flush(data);
    http.expectOne('data/aef/hash.json').flush(mockModHash);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(settings.modData()?.version).toEqual({ game: 'aef' });
    settings.apply({ modId: '2x1' });
    TestBed.tick();
    http.expectNone((request) => request.url.startsWith('data/2x1/'));
    expect(settings.modData()).toBeUndefined();
    expect(settings.modHash()).toBeUndefined();
    expect(settings.modInfo()).toBeUndefined();
    settings.apply({ modId: 'cst' });
    TestBed.tick();
    expect(settings.modData()).toBeUndefined();
    expect(settings.modHash()).toBeUndefined();
    expect(settings.modOptions()).toEqual([]);
    http.expectNone((request) => request.url.startsWith('data/cst/'));
    http.verify({ ignoreCancelled: true });
  });

  it('allows the native dataset resources when no mod is pinned', async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    expect(TestBed.inject(PINNED_MOD_ID)).toBeUndefined();
    const settings = TestBed.inject(SettingsStore);
    const http = TestBed.inject(HttpTestingController);
    settings.apply({ modId: '2x1' });
    TestBed.tick();
    http.expectOne('data/2x1/data.json').flush(emptyModData());
    http.expectOne('data/2x1/hash.json').flush(mockModHash);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(settings.modData()).toEqual(emptyModData());
    expect(settings.modInfo()?.id).toBe('2x1');
    settings.apply({ modId: 'missing-dataset' });
    expect(settings.modInfo()).toBeUndefined();
    expect(settings.game()).toBe('factorio');
    http.verify({ ignoreCancelled: true });
  });
});

describe('Endfield route navigation', () => {
  function setup(
    options: { bypass?: boolean; stored?: string; pinned?: boolean } = {},
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
        {
          provide: PINNED_MOD_ID,
          useValue: options.pinned === false ? undefined : 'aef',
        },
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
    const fixture = setup();
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
    const fixture = setup();
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
    const fixture = setup({
      stored: '/aef/list?old=1',
    });
    await RouterTestingHarness.create('/?v=11&o=a&o=b');
    expect(fixture.router.url).toBe('/aef?v=11&o=a&o=b');
    expect(fixture.stored).not.toHaveBeenCalled();
  });

  it('resumes only an allowed cache and gives an explicit root query priority', async () => {
    const fixture = setup({
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

  it('preserves upstream shortcut, alias and ordinary-id behavior in neutral mode', async () => {
    const fixture = setup({ pinned: false });
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
    const fixture = setup({
      pinned: false,
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

  it('passes the activated Id query to native migration', async () => {
    localStorage.clear();
    const migrate = jasmine.createSpy('migrate').and.callFake(() => {
      throw new Error('Stop after observing migration');
    });
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        ...provideEndfieldDefaults(),
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
    await RouterTestingHarness.create('/list?v=11&o=a&o=b&cet=x');
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
      TestBed.tick();
    }

    expect(router.url).toBe('/aef/list?v=11&o=a&o=b&cet=x');
    expect(migrate).toHaveBeenCalledOnceWith('aef', {
      v: '11',
      o: ['a', 'b'],
      cet: 'x',
    });
    http.expectNone((request) => /^data\/(?!aef\/)/.test(request.url));
  });
});
