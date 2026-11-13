import { TestBed } from '@angular/core/testing';

import { Exporter } from '~/exporter/exporter';
import { PRODUCT_PROFILE, upstreamProduct } from '~/extensions/product-profile';
import { rational } from '~/rational/rational';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { ItemId } from '~/tests/item-id';
import { RecipeId } from '~/tests/recipe-id';
import { TestModule } from '~/tests/test-module';

import { endfieldCsv } from './csv';

describe('Endfield exports', () => {
  let exporter: Exporter;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        {
          provide: PRODUCT_PROFILE,
          useValue: {
            ...upstreamProduct,
            exportPrefix: 'endfield-calc',
            csv: endfieldCsv,
          },
        },
      ],
    });
    exporter = TestBed.inject(Exporter);
    TestBed.inject(PreferencesStore).apply({ language: 'zh' });
    const data = exporter['data']();
    spyOn<any>(exporter, 'data').and.returnValue({
      ...data,
      itemRecord: {
        ...data.itemRecord,
        [ItemId.IronPlate]: {
          ...data.itemRecord[ItemId.IronPlate],
          name: '铁板,试验"号"',
        },
        [ItemId.IronOre]: { ...data.itemRecord[ItemId.IronOre], name: '铁矿' },
      },
      recipeRecord: {
        ...data.recipeRecord,
        [RecipeId.IronPlate]: {
          ...data.recipeRecord[RecipeId.IronPlate],
          name: '铁板配方',
        },
      },
    });
  });

  it('exports Chinese headers and properly quoted entity names with UTF-8 BOM and product filenames', () => {
    const save = spyOn<any>(exporter, 'saveAsCsv');
    exporter.stepsToCsv([
      {
        id: '1',
        itemId: ItemId.IronPlate,
        items: rational.one,
        recipeId: RecipeId.IronPlate,
        machines: rational.one,
      },
    ]);
    const [csv, filename] = save.calls.mostRecent().args as [string, string];
    expect(filename).toBe('endfield-calc_list');
    expect(
      csv.startsWith('\uFEFF"' + window.location.href + '"\r\n'),
    ).toBeTrue();
    expect(csv).toContain('物品,产量');
    expect(csv).toContain('设施数量');
    expect(csv).toContain('"铁板,试验""号"""');
    expect(csv).toContain('铁板配方');
  });

  it('localizes structured item and recipe references while retaining missing IDs and numeric formulas', () => {
    expect(exporter['csvValue']('Inputs', '"iron-ore:1,missing:2"')).toBe(
      '"铁矿:1,missing:2"',
    );
    expect(exporter['csvValue']('Outputs', '"iron-plate:2"')).toBe(
      '"铁板,试验""号"":2"',
    );
    expect(exporter['csvValue']('Targets', '"iron-plate:3"')).toBe(
      '铁板配方:3',
    );
    expect(exporter['csvValue']('Items', '=1/3')).toBe('=1/3');
    expect(exporter['csvValue']('Items', undefined)).toBeUndefined();
    expect(exporter['csvValue']('Outputs', '"unknown"')).toBe('unknown');
  });

  it('keeps English column names and JSON flow export data', () => {
    expect(endfieldCsv!.columnLabel('Item', 'en')).toBe('Item');
    expect(endfieldCsv!.columnLabel('Custom', 'zh')).toBe('Custom');
    const save = spyOn<any>(exporter, 'saveAsJson');
    exporter.flowToJson({ nodes: [], links: [] });
    expect(save).toHaveBeenCalledWith(
      '{"nodes":[],"links":[]}',
      'endfield-calc_flow',
    );
  });
});
