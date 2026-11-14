import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { modRecord } from '~/data/datasets';
import { emptyModData } from '~/data/schema/mod-data';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { SettingsStore } from '~/state/settings/settings-store';
import { mockModHash } from '~/tests/mocks/data';
import { Translate, TRANSLATION_FALLBACK } from '~/translate/translate';

import {
  endfieldTranslationFallback,
  mergeTranslation,
} from './translation-fallback';

describe('Endfield interface translation fallback', () => {
  let translate: Translate;
  let preferences: PreferencesStore;
  let http: HttpTestingController;
  let originalPreferences: string | null;

  beforeEach(() => {
    originalPreferences = localStorage.getItem('preferences');
    localStorage.removeItem('preferences');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: TRANSLATION_FALLBACK,
          useValue: endfieldTranslationFallback,
        },
      ],
    });
    preferences = TestBed.inject(PreferencesStore);
    translate = TestBed.inject(Translate);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify({ ignoreCancelled: true });
    if (originalPreferences == null) localStorage.removeItem('preferences');
    else localStorage.setItem('preferences', originalPreferences);
  });

  it('keeps complete English and product strings available even if the first request fails', async () => {
    let settled = false;
    const loaded = translate.load().then((value) => {
      settled = true;
      return value;
    });
    TestBed.tick();
    await Promise.resolve();
    expect(settled).toBeFalse();
    http
      .expectOne('i18n/en.json')
      .flush('unavailable', { status: 503, statusText: 'Unavailable' });
    TestBed.tick();
    expect(await loaded).toBeTrue();
    expect(translate.get('app.name')).toBe('EndfieldLab');
    expect(translate.get('app.simplexSolved', { time: 1, cost: 2 })).toBe(
      'Solved, 1ms, cost: 2',
    );
    expect(translate.get('endfield.resources.title')).toBe(
      'Resource configuration',
    );
  });

  it('does not retain the previous language while loading or after a failed language switch', async () => {
    TestBed.tick();
    http.expectOne('i18n/en.json').flush(endfieldTranslationFallback);
    await Promise.resolve();
    preferences.apply({ language: 'zh' });
    TestBed.tick();
    http.expectOne('i18n/zh.json').flush({ app: { name: '终末地量化计算器' } });
    await Promise.resolve();
    TestBed.tick();
    expect(translate.get('app.name')).toBe('终末地量化计算器');
    preferences.apply({ language: 'fr' });
    TestBed.tick();
    expect(translate.get('app.name')).toBe('EndfieldLab');
    http
      .expectOne('i18n/fr.json')
      .flush('missing', { status: 404, statusText: 'Not Found' });
    expect(translate.get('app.name')).toBe('EndfieldLab');
  });

  it('merges independent nested overrides without dropping unrelated English entries', () => {
    expect(
      mergeTranslation(
        { a: { one: '1', two: '2' }, b: 'old', c: { old: 'old' } },
        { a: { one: 'new' }, b: { child: 'new' }, c: 'new' },
      ),
    ).toEqual({ a: { one: 'new', two: '2' }, b: { child: 'new' }, c: 'new' });
  });
});

describe('SettingsStore Endfield game translations', () => {
  let service: SettingsStore;
  let preferences: PreferencesStore;
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SettingsStore);
    preferences = TestBed.inject(PreferencesStore);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    localStorage.clear();
  });
  it('uses English base data and applies non-English entity translations without overriding metadata', async () => {
    service.apply({ modId: 'aef' });
    TestBed.tick();
    const data = emptyModData();
    data.categories = [{ id: 'category', name: 'English' }];
    data.icons = [{ id: 'category', x: 0, y: 0, color: '#fff' }];
    data.version = { game: 'base' };
    http.expectOne('data/aef/data.json').flush(data);
    http.expectOne('data/aef/hash.json').flush(mockModHash);
    http.expectNone('data/aef/i18n/en.json');
    await TestBed.inject(ApplicationRef).whenStable();
    TestBed.tick();
    expect(service.modInfo()?.name).toBe(modRecord['aef'].name);
    expect(service.dataset().categoryRecord['category'].name).toBe('English');
    expect(service.dataset().version).toEqual({ game: 'base' });

    preferences.apply({ language: 'ja' });
    expect(service.modI18n()).toBeUndefined();
    TestBed.tick();
    http.expectOne('data/aef/i18n/ja.json').flush({
      name: 'Ignored metadata',
      version: { game: 'ignored' },
      categories: { category: '日本語' },
      items: {},
      recipes: {},
    });
    await TestBed.inject(ApplicationRef).whenStable();
    TestBed.tick();
    expect(service.modInfo()?.name).toBe(modRecord['aef'].name);
    expect(service.dataset().categoryRecord['category'].name).toBe('日本語');
    expect(service.dataset().version).toEqual({ game: 'base' });

    preferences.apply({ language: 'de' });
    expect(service.modI18n()).toBeUndefined();
    TestBed.tick();
    http.expectOne('data/aef/i18n/de.json').flush({
      categories: { category: '中文' },
      items: {},
      recipes: {},
    });
    await TestBed.inject(ApplicationRef).whenStable();
    TestBed.tick();
    expect(service.dataset().categoryRecord['category'].name).toBe('中文');
    expect(service.dataset().version).toEqual({ game: 'base' });
  });
  it('uses the base dataset when a translation request fails', async () => {
    preferences.apply({ language: 'ja' });
    service.apply({ modId: 'aef' });
    TestBed.tick();
    const data = emptyModData();
    data.categories = [{ id: 'category', name: 'English' }];
    data.icons = [{ id: 'category', x: 0, y: 0, color: '#fff' }];
    http.expectOne('data/aef/data.json').flush(data);
    http.expectOne('data/aef/hash.json').flush(mockModHash);
    http.expectOne('data/aef/i18n/ja.json').flush('missing', {
      status: 404,
      statusText: 'Not Found',
    });
    await TestBed.inject(ApplicationRef).whenStable();
    TestBed.tick();

    expect(service.loading()).toBeFalse();
    expect(service.loadError()).toBeUndefined();
    expect(service.modI18n()).toBeUndefined();
    expect(service.modInfo()?.name).toBe(modRecord['aef'].name);
    expect(service.dataset().categoryRecord['category'].name).toBe('English');
    expect(service.retryFailedResources()).toBeFalse();
  });
});
