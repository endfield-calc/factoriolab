import { TestBed } from '@angular/core/testing';

import rawData from '/public/data/aef/data.json';
import rawHash from '/public/data/aef/hash.json';
import { RecipeDetail } from '~/app/main/data/recipe-detail/recipe-detail';
import { ModData } from '~/data/schema/mod-data';
import { endfieldAdjustmentProvider } from '~/endfield/adapters/calculation-extension';
import { EndfieldStore } from '~/endfield/state/endfield-store';
import { rational } from '~/rational/rational';
import { RecipesStore } from '~/state/recipes/recipes-store';
import { initialSettingsState } from '~/state/settings/settings-state';
import { SettingsStore } from '~/state/settings/settings-store';
import { TestModule } from '~/tests/test-module';
import { setInputs } from '~/tests/utils';

import { calculateEndfieldRecipeCost, EndfieldRecipeCostInput } from './cost';

describe('Endfield recipe costs', () => {
  const defaults = (): EndfieldRecipeCostInput => ({
    usage: rational(50),
    area: rational(25),
    recycling: false,
    weights: { ...initialSettingsState.costs, recycling: rational(1000) },
    electric: rational.one,
  });

  it('uses explicit user zero before raw costs, then applies recycling', () => {
    const input = defaults();
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        recycling: true,
        declaredCost: rational(-30),
        overrideCost: rational.zero,
      }),
    ).toEqual(rational.zero);
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        recycling: true,
        declaredCost: rational(2),
      }),
    ).toEqual(rational(2000));
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        recycling: true,
        declaredCost: rational(2),
        overrideCost: rational(-3),
      }),
    ).toEqual(rational(-3000));
  });

  it('uses raw zero and negative declared cost regardless of output or machine', () => {
    const input = defaults();
    const weights = { ...input.weights, factor: rational(2) };
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        weights,
        declaredCost: rational(-30),
      }),
    ).toEqual(rational(-60));
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        weights,
        declaredCost: rational.zero,
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
        weights: { ...input.weights, footprint: rational.zero },
      }),
    ).toEqual(rational(50));
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        weights: { ...input.weights, footprint: rational(5) },
      }),
    ).toEqual(rational(75));
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        usage: rational(-50),
        area: undefined,
      }),
    ).toEqual(rational(-50));
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        electric: rational.zero,
        usage: undefined,
        area: undefined,
      }),
    ).toEqual(input.weights.machine);
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        usage: rational(-25),
        area: rational(25),
      }),
    ).toEqual(input.weights.machine);
  });
});

describe('RecipeDetail Endfield costs', () => {
  it('renders the effective ordinary and declared costs and reacts to power changes', async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, RecipeDetail],
      providers: [
        endfieldAdjustmentProvider,
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

    const effective = (id: string): string =>
      recipes.adjustedDataset().adjustedRecipe[id].cost!.toString();
    const before = effective('originium_ore');
    expect((await costInput()).value).toBe(before);
    endfield.set({ ...endfield.state(), electric: rational(2) });
    const after = effective('originium_ore');
    expect(after).not.toBe(before);
    expect((await costInput()).value).toBe(after);

    setInputs(fixture, { id: 'sewage-treat', collectionLabel: 'data.recipes' });
    expect((await costInput()).value).toBe(effective('sewage-treat'));
    recipes.updateRecordField('sewage-treat', 'cost', rational.zero);
    expect((await costInput()).value).toBe('0');
  });
});
