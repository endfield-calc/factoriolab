import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { PreferencesStore } from '~/state/preferences/preferences-store';
import { Translate, TRANSLATION_FALLBACK } from '~/translate/translate';

import { provideEndfieldProduct } from '../product/product';
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
        provideEndfieldProduct(),
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
