import { TestBed } from '@angular/core/testing';
import { loadModule } from 'glpk-ts';

import rawData from '/public/data/aef/data.json';
import rawHash from '/public/data/aef/hash.json';
import { RecipeDetail } from '~/app/main/data/recipe-detail/recipe-detail';
import { Machine } from '~/data/schema/machine';
import { ModData } from '~/data/schema/mod-data';
import { Recipe, RecipeFlag } from '~/data/schema/recipe';
import { provideEndfield } from '~/endfield/providers';
import { EndfieldStore } from '~/endfield/state/endfield-store';
import { rational } from '~/rational/rational';
import { Adjustment } from '~/state/adjustment';
import { ObjectiveType } from '~/state/objectives/objective-type';
import { ObjectiveUnit } from '~/state/objectives/objective-unit';
import { ObjectivesStore } from '~/state/objectives/objectives-store';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { RecipesStore } from '~/state/recipes/recipes-store';
import { initialSettingsState } from '~/state/settings/settings-state';
import { SettingsStore } from '~/state/settings/settings-store';
import { TestModule } from '~/tests/test-module';
import { setInputs } from '~/tests/utils';

import { calculateEndfieldRecipeCost, EndfieldRecipeCostInput } from './cost';

describe('Endfield recipe costs', () => {
  const machine: Machine = { usage: rational(50), size: [5, 5] };
  const defaults = (): EndfieldRecipeCostInput => ({
    raw: { flags: new Set<RecipeFlag>() },
    recipeSettings: {},
    machine,
    costs: { ...initialSettingsState.costs, recycling: rational(1000) },
    electric: rational.one,
  });

  it('uses explicit user zero before raw costs, then applies recycling', () => {
    const input = defaults();
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        raw: { flags: new Set(['recycling']), cost: rational(-30) },
        recipeSettings: { cost: rational.zero },
      }),
    ).toEqual(rational.zero);
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        raw: { flags: new Set(['recycling']), cost: rational(2) },
      }),
    ).toEqual(rational(2000));
  });

  it('uses raw zero and negative declared cost regardless of output or machine', () => {
    const input = defaults();
    const costs = { ...input.costs, factor: rational(2) };
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        costs,
        raw: { flags: new Set(), cost: rational(-30) },
      }),
    ).toEqual(rational(-60));
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        costs,
        raw: { flags: new Set(), cost: rational.zero },
      }),
    ).toEqual(rational.zero);
  });

  it('uses raw machine usage and treats footprint as an enable switch', () => {
    const input = defaults();
    expect(calculateEndfieldRecipeCost(input)).toEqual(rational(75));
    expect(
      calculateEndfieldRecipeCost({ ...input, electric: rational(2) }),
    ).toEqual(rational(125));
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        costs: { ...input.costs, footprint: rational.zero },
      }),
    ).toEqual(rational(50));
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        costs: { ...input.costs, footprint: rational(5) },
      }),
    ).toEqual(rational(75));
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        machine: { usage: rational(-50) },
      }),
    ).toEqual(rational(-50));
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        electric: rational.zero,
        machine: {},
      }),
    ).toEqual(input.costs.machine);
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        machine: { usage: rational(-25), size: [5, 5] },
      }),
    ).toEqual(input.costs.machine);
  });
});

describe('neutral upstream recipe costs', () => {
  it('uses the public upstream adjustment and its output-based and default formulas', () => {
    TestBed.configureTestingModule({ imports: [TestModule] });
    const adjustment = TestBed.inject(Adjustment);
    const declared: Recipe = {
      id: 'declared',
      name: 'declared',
      row: 0,
      time: rational(2),
      in: {},
      out: { item: rational(6) },
      cost: rational(4),
      flags: new Set(),
    };
    const defaulted: Recipe = {
      ...declared,
      id: 'defaulted',
      cost: undefined,
    };
    adjustment.adjustCosts(
      { declared, defaulted },
      { declared: {}, defaulted: {} },
      {
        ...initialSettingsState.costs,
        factor: rational(3),
        machine: rational(5),
        footprint: rational.zero,
      },
      TestBed.inject(SettingsStore).dataset(),
    );
    expect(declared.cost).toEqual(rational(36));
    expect(defaulted.cost).toEqual(rational(5));
  });
});

describe('RecipeDetail Endfield costs', () => {
  beforeAll(async () => {
    await loadModule('glpk.all.wasm');
  });

  it('renders the effective ordinary and declared costs and reacts to power changes', async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, RecipeDetail],
      providers: [
        ...provideEndfield(),
        { provide: SettingsStore, useClass: SettingsStore },
      ],
    }).compileComponents();
    const settings = TestBed.inject(SettingsStore);
    settings.apply({
      modId: 'aef',
      locationIds: new Set(['tundra', 'jinlong']),
    });
    settings['modDataResource'].set(rawData as unknown as ModData);
    settings['modHashResource'].set(rawHash);
    const recipes = TestBed.inject(RecipesStore);
    const endfield = TestBed.inject(EndfieldStore);
    const objectives = TestBed.inject(ObjectivesStore);
    TestBed.inject(PreferencesStore).apply({ paused: false });
    objectives.set({
      '1': {
        id: '1',
        targetId: 'originium_ore',
        value: rational(60),
        type: ObjectiveType.Output,
        unit: ObjectiveUnit.Items,
      },
    });
    const fixture = TestBed.createComponent(RecipeDetail);
    setInputs(fixture, {
      id: 'originium_ore',
      collectionLabel: 'data.recipes',
    });

    const costInput = async (): Promise<HTMLInputElement> => {
      fixture.detectChanges();
      await Promise.resolve();
      TestBed.tick();
      fixture.detectChanges();
      const input = fixture.nativeElement.querySelector(
        'tr:has(#cost) input',
      ) as HTMLInputElement | null;
      expect(input).not.toBeNull();
      if (input == null) throw new Error('Missing recipe cost input');
      return input;
    };

    // miner_2 has usage 5 and no footprint: the independent expected costs are
    // 5 * electric(1/2), with the product's machine weight equal to one.
    expect(recipes.settings()['originium_ore'].machineId).toBe('miner_2');
    expect(
      recipes.adjustedDataset().adjustedRecipe['originium_ore'].cost,
    ).toEqual(rational(5));
    expect((await costInput()).value).toBe('5');
    expect(objectives.matrixResult().resultType).toBe('solved');
    expect(objectives.matrixResult().cost).toEqual(rational(15));
    endfield.set({ ...endfield.state(), electric: rational(2) });
    expect(
      recipes.adjustedDataset().adjustedRecipe['originium_ore'].cost,
    ).toEqual(rational(10));
    expect((await costInput()).value).toBe('10');
    expect(objectives.matrixResult().resultType).toBe('solved');
    expect(objectives.matrixResult().cost).toEqual(rational(30));

    // A zero-output recipe's declared negative cost must not be normalized away.
    setInputs(fixture, { id: 'sewage-treat', collectionLabel: 'data.recipes' });
    expect(
      recipes.adjustedDataset().adjustedRecipe['sewage-treat'].cost,
    ).toEqual(rational(-30));
    expect((await costInput()).value).toBe('-30');
    recipes.updateRecordField('sewage-treat', 'cost', rational.zero);
    expect(
      recipes.adjustedDataset().adjustedRecipe['sewage-treat'].cost,
    ).toEqual(rational.zero);
    expect((await costInput()).value).toBe('0');
  });
});
