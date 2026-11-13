import { cloneDefaults, upstreamProduct } from '~/extensions/product-profile';
import { rational } from '~/rational/rational';
import { FlowDiagram } from '~/state/preferences/flow-diagram';
import { PowerUnit } from '~/state/preferences/power-unit';

import { createEndfieldProduct } from './product';

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
});
