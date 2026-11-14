import { isDevMode } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { initialLanguage } from '~/translate/language';

import { FlowDiagram } from './flow-diagram';
import { PowerUnit } from './power-unit';
import { initialPreferencesState } from './preferences-state';
import { PreferencesStore } from './preferences-store';

describe('PreferencesStore', () => {
  let service: PreferencesStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(PreferencesStore);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('uses the native defaults when resetting edited preferences', () => {
    const originalLanguage = service.language();
    expect(service.powerUnit()).toBe(PowerUnit.kW);
    expect(service.theme()).toBe('light');
    expect(service.flowSettings().diagram).toBe(FlowDiagram.BoxLine);
    service.apply({
      language: 'ja',
      columns: {
        ...service.columns(),
        items: { ...service.columns().items, show: false },
      },
      flowSettings: { ...service.flowSettings(), diagram: FlowDiagram.Sankey },
    });
    service.setSectionDefault('sources', false);
    service.resetPreferences(false);
    expect(service.language()).toBe(originalLanguage);
    expect(service.columns().items.show).toBeTrue();
    expect(service.flowSettings().diagram).toBe(FlowDiagram.BoxLine);
    expect(service.state().sections.sources).toBeTrue();
    expect(initialPreferencesState.columns.items.show).toBeTrue();
    expect(initialPreferencesState.flowSettings.diagram).toBe(
      FlowDiagram.BoxLine,
    );
    expect(initialPreferencesState.sections.sources).toBeTrue();
  });

  describe('constructor', () => {
    it('should log if failed to parse stored preferences', () => {
      spyOn(console, 'warn');
      spyOn(localStorage, 'getItem').and.returnValue('abc');
      TestBed.runInInjectionContext(() => {
        service = new PreferencesStore();
      });
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('effects', () => {
    it('should apply light theme', () => {
      spyOn(document.documentElement, 'setAttribute');
      service.apply({ theme: 'light' });
      TestBed.tick();
      expect(document.documentElement.setAttribute).toHaveBeenCalledWith(
        'data-theme',
        'light',
      );
    });

    it('should apply dark theme', () => {
      spyOn(document.documentElement, 'removeAttribute');
      service.apply({ theme: 'dark' });
      TestBed.tick();
      expect(document.documentElement.removeAttribute).toHaveBeenCalledWith(
        'data-theme',
      );
    });

    it('should apply system light theme', () => {
      spyOn(window, 'matchMedia').and.returnValue({ matches: true } as any);
      spyOn(document.documentElement, 'setAttribute');
      service.apply({ theme: 'system' });
      TestBed.tick();
      expect(document.documentElement.setAttribute).toHaveBeenCalledWith(
        'data-theme',
        'light',
      );
    });
  });

  describe('saveState', () => {
    it('should save the state', () => {
      service.saveState('factorio', 'id', 'value');
      expect(service.state().states['factorio']['id']).toEqual('value');
    });
  });

  describe('removeState', () => {
    it('should remove the state', () => {
      service.saveState('factorio', 'id', 'value');
      service.removeState('factorio', 'id');
      expect(service.state().states['factorio']['id']).toBeUndefined();
    });
  });

  describe('setSectionDefault', () => {
    it('should update section state', () => {
      service.setSectionDefault('inputs', false);
      expect(service.state().sections.inputs).toBeFalse();
    });
  });
});

describe('PreferencesStore persistence and recovery', () => {
  afterEach(() => {
    localStorage.clear();
  });

  function create(raw?: string): PreferencesStore {
    localStorage.clear();
    if (raw != null) localStorage.setItem('preferences', raw);
    TestBed.configureTestingModule({});
    return TestBed.inject(PreferencesStore);
  }

  it('restores a valid current preferences object and preserves archives on reset', () => {
    const saved = { ...initialPreferencesState };
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
    expect(service.columns().belts).toEqual(
      initialPreferencesState.columns.belts,
    );
    expect(service.flowSettings().elkAlgorithm).toBe('stress');
    expect(service.flowSettings().diagram).toBe(
      initialPreferencesState.flowSettings.diagram,
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
    expect(service.language()).toBe(
      initialLanguage(!isDevMode(), navigator.language),
    );
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
        Object.keys(initialPreferencesState.flowSettings).sort(),
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
        initialPreferencesState.columns.belts,
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
    ['powerUnit', 'kW'],
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
    ['flowSettings', { diagram: 'Sankey' }],
    ['flowSettings', { linkSize: 6 }],
    ['flowSettings', { linkSize: 'Wagons' }],
    ['flowSettings', { linkText: -1 }],
    ['flowSettings', { linkText: 'Machines' }],
    ['flowSettings', { sankeyAlign: 4 }],
    ['flowSettings', { sankeyAlign: 'Left' }],
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
    ['malformed JSON', '{"states":'],
    ['empty JSON', ''],
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
      expect(service.language()).toBe(
        initialLanguage(!isDevMode(), navigator.language),
      );
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

  it('unlocks persistence only after an explicit reset', () => {
    const raw = JSON.stringify({ theme: 'black', language: 'ru' });
    const service = create(raw);
    expect(service.restoreError()).toBeDefined();
    expect(service.language()).toBe(
      initialLanguage(!isDevMode(), navigator.language),
    );
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
    expect(service.stored()).toBe(raw);
    const persisted = JSON.parse(localStorage.getItem('preferences')!);
    expect(persisted.theme).toBe('light');
    expect(persisted.states.aef.new).toBe('/aef/list?v=12');
  });

  it('does not consult or change the retired display preference', () => {
    localStorage.clear();
    localStorage.setItem('endfield.presentation', '{broken');
    const get = spyOn(Storage.prototype, 'getItem').and.callThrough();
    TestBed.configureTestingModule({});
    const service = TestBed.inject(PreferencesStore);
    TestBed.tick();
    expect(service.restoreError()).toBeUndefined();
    expect(get).not.toHaveBeenCalledWith('endfield.presentation');
    expect(localStorage.getItem('endfield.presentation')).toBe('{broken');
  });
});

describe('initial browser language', () => {
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
      expect(initialLanguage(production, browser))
        .withContext(`${String(production)}: ${browser}`)
        .toBe(expected);
  });
});
