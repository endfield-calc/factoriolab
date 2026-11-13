import { TestBed } from '@angular/core/testing';

import { createEndfieldProduct } from '~/endfield/product/product';
import { PRODUCT_PROFILE } from '~/extensions/product-profile';

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

  it('leaves the original intact when the recovery backup cannot be written', () => {
    const raw = '{bad';
    localStorage.clear();
    localStorage.setItem('preferences', raw);
    const realSet = localStorage.setItem.bind(localStorage);
    spyOn(localStorage, 'setItem').and.callFake((key, value) => {
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
  });
});
