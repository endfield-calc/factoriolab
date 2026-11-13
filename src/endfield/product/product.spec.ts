import { FactoryProvider } from '@angular/core';

import { environment } from '~/environments/environment';
import { cloneDefaults, upstreamProduct } from '~/extensions/product-profile';
import { rational } from '~/rational/rational';
import { FlowDiagram } from '~/state/preferences/flow-diagram';
import { PowerUnit } from '~/state/preferences/power-unit';

import { createEndfieldProduct, provideEndfieldProduct } from './product';

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
      [true, 'ko-KR', 'en'],
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
      snapshot.settings.costs.unproduceable.eq(rational(1000000)),
    ).toBeTrue();
    expect(snapshot.settings.costs.surplus.eq(rational.one)).toBeTrue();
    expect(snapshot.settings.costs.recycling.eq(rational(1000))).toBeTrue();
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
    for (const lang of ['de', 'fr'] as const)
      expect(profile.loadGameI18n('aef', lang)).toBeFalse();
    expect(profile.loadGameI18n('2x1', 'en')).toBeFalse();
    expect(profile.languages.map((x) => x.value).sort()).toEqual([
      'de',
      'en',
      'fr',
      'ja',
      'ru',
      'zh',
    ]);
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
