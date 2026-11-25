import { TestBed } from '@angular/core/testing';
import { loadModule } from 'glpk-ts';

import rawData from '/public/data/aef/data.json';
import rawHash from '/public/data/aef/hash.json';
import rawTransfer from '/public/data/aef/transfer.json';
import { ModData } from '~/data/schema/mod-data';
import { AdjustedRecipe } from '~/data/schema/recipe';
import { endfieldAdjustmentProvider } from '~/endfield/adapters/calculation-extension';
import { decodeEndfield } from '~/endfield/compat/codec';
import { Exporter } from '~/exporter/exporter';
import { rational } from '~/rational/rational';
import { SimplexResult } from '~/solver/simplex-result';
import { Step } from '~/solver/step';
import { ItemsStore } from '~/state/items/items-store';
import { ObjectiveState } from '~/state/objectives/objective';
import { ObjectiveType } from '~/state/objectives/objective-type';
import { ObjectiveUnit } from '~/state/objectives/objective-unit';
import { ObjectivesStore } from '~/state/objectives/objectives-store';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { RecipesStore } from '~/state/recipes/recipes-store';
import { SettingsStore } from '~/state/settings/settings-store';
import { TestModule } from '~/tests/test-module';

import {
  createEndfieldState,
  ovenId,
  resourceIds,
  resourceObjectiveId,
  resourceRecipes,
} from '../domain/model';
import {
  addEndfieldTransferRecipes,
  EndfieldTransferData,
} from '../domain/transfer';
import { EndfieldStore } from '../state/endfield-store';
import { EndfieldResources } from '../ui/resources';

function objective(
  id: string,
  targetId: string,
  value: number,
  unit = ObjectiveUnit.Machines,
): ObjectiveState {
  return {
    id,
    targetId,
    value: rational(value),
    type: ObjectiveType.Output,
    unit,
  };
}

function count(steps: Step[], recipeId: string, objectiveId?: string): number {
  return steps
    .filter(
      (step) =>
        step.recipeId === recipeId &&
        (objectiveId === undefined || step.recipeObjectiveId === objectiveId),
    )
    .reduce((sum, step) => sum + (step.machines?.toNumber() ?? 0), 0);
}

function close(actual: number, expected: number): void {
  expect(actual).toBeCloseTo(expected, 6);
}

describe('Remaining Endfield physical constraint acceptance with aef and GLPK', () => {
  let settings: SettingsStore;
  let objectives: ObjectivesStore;
  let extension: EndfieldStore;
  let preferences: PreferencesStore;
  const data = rawData as unknown as ModData;

  beforeAll(async () => {
    await loadModule('glpk.all.wasm');
  });
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        endfieldAdjustmentProvider,
        { provide: SettingsStore, useClass: SettingsStore },
      ],
    });
    settings = TestBed.inject(SettingsStore);
    settings.apply({
      modId: 'aef',
      locationIds: new Set(['tundra', 'jinlong']),
    });
    settings['modDataResource'].set(data);
    settings['modHashResource'].set(rawHash);
    settings['transferResource'].set(rawTransfer as EndfieldTransferData);
    objectives = TestBed.inject(ObjectivesStore);
    extension = TestBed.inject(EndfieldStore);
    preferences = TestBed.inject(PreferencesStore);
    preferences.apply({ paused: false, glpkAlgorithm: 'simplex' });
  });

  function result(): SimplexResult {
    return objectives.matrixResult();
  }

  it('A08 solves originium alone, preserving its configured rate and surplus', () => {
    const state = createEndfieldState();
    extension.set({
      ...state,
      resourceLimits: {
        enabled: true,
        rates: {
          ...state.resourceLimits.rates,
          originium_ore: rational(560, 60),
        },
      },
    });
    objectives.set({
      1: objective('1', 'originium_ore', 540, ObjectiveUnit.Items),
    });
    const context = objectives.calculationContext();
    expect(
      context.objectives
        .filter((o) => o.id.startsWith('ef:resource:'))
        .map((o) => o.id),
    ).toEqual([resourceObjectiveId('originium_ore')]);
    const supply = context.objectives.find(
      (o) => o.id === resourceObjectiveId('originium_ore'),
    )!;
    expect(
      supply.value
        .mul(supply.recipe!.output['originium_ore'])
        .eq(rational(560, 60)),
    ).toBeTrue();
    for (const id of resourceIds.filter((id) => id !== 'originium_ore'))
      expect(
        context.objectives
          .find((o) => o.id === `ef:limit:${id}`)
          ?.value.isZero(),
      )
        .withContext(id)
        .toBeTrue();
    const solved = result();
    expect(solved.resultType).toBe('solved');
    close(count(solved.steps, supply.targetId), supply.value.toNumber());
    const ore = objectives.steps().find((s) => s.itemId === 'originium_ore')!;
    close(ore.items!.toNumber(), 560);
    close(ore.surplus!.toNumber(), 20);
  });

  it('A08 solves copper and gases only, with physical water and fluid transport', () => {
    const state = createEndfieldState();
    extension.set({
      ...state,
      resourceLimits: {
        enabled: true,
        rates: {
          ...state.resourceLimits.rates,
          copper_ore: rational(510, 60),
          gas_xiranite: rational(150, 60),
          gas_inert: rational(460, 60),
        },
      },
    });
    const context = objectives.calculationContext();
    expect(
      context.objectives
        .filter((o) => o.id.startsWith('ef:resource:'))
        .map((o) => o.targetId),
    ).toEqual(
      ['copper_ore', 'gas_xiranite', 'gas_inert'].map(
        (id) => resourceRecipes[id as keyof typeof resourceRecipes],
      ),
    );
    const solved = result();
    expect(solved.resultType).toBe('solved');
    for (const [id, perMinute] of [
      ['copper_ore', 510],
      ['gas_xiranite', 150],
      ['gas_inert', 460],
    ] as const) {
      const step = objectives.steps().find((s) => s.itemId === id)!;
      close(step.items!.toNumber(), perMinute);
      if (id.startsWith('gas_')) {
        expect(data.items.find((i) => i.id === id)?.types).toContain('fluid');
        const itemSettings = TestBed.inject(ItemsStore).settings()[id];
        const options = itemSettings.beltOptions.map(
          (option) => settings.dataset().itemRecord[option.value].belt!,
        );
        expect(options.length).toBeGreaterThan(0);
        expect(options.every((belt) => belt.itemTypes.has('fluid'))).toBeTrue();
        expect(options.every((belt) => !belt.itemTypes.has('item'))).toBeTrue();
      }
    }
    const copper = solved.steps.find(
      (s) => s.recipeObjectiveId === resourceObjectiveId('copper_ore'),
    )!;
    const visibleCopper = objectives
      .steps()
      .find((s) => s.recipeObjectiveId === resourceObjectiveId('copper_ore'))!;
    expect(visibleCopper).toBeDefined();
    expect(visibleCopper.power).toBeUndefined();
    const copperWater =
      copper
        .machines!.mul(copper.recipe!.in['__miner_water']!)
        .div(copper.recipe!.time)
        .toNumber() * 60;
    close(
      objectives
        .steps()
        .find((s) => s.itemId === '__miner_water')!
        .items!.toNumber(),
      copperWater,
    );
    expect(
      solved.steps.filter((s) =>
        s.recipeObjectiveId?.startsWith('ef:resource:'),
      ).length,
    ).toBe(3);
  });

  it('A10 charges ordinary, explicit and fractional exception to one actual-oven budget', () => {
    const ordinaryRecipe = data.recipes.find(
      (recipe) =>
        recipe.out?.['xiranite_powder'] &&
        recipe.producers?.length === 1 &&
        recipe.producers[0] === ovenId,
    )!;
    const excluded = data.recipes
      .filter((r) => r.out?.['xiranite_powder'] && r.id !== ordinaryRecipe.id)
      .map((r) => r.id);
    settings.apply({ excludedRecipeIds: new Set(excluded) });
    objectives.set({
      1: objective('1', 'xiranite_powder', 90, ObjectiveUnit.Items),
      2: objective('2', ordinaryRecipe.id, 1),
      3: objective('3', 'xiranite_enr_powder', 0.5),
    });
    const adjusted = TestBed.inject(RecipesStore).adjustedDataset();
    const [demand, explicitObjective, exceptionObjective] = ['1', '2', '3'].map(
      (id) => objectives.normalizedObjectives().find((item) => item.id === id)!,
    );
    const ordinaryOutput =
      adjusted.adjustedRecipe[ordinaryRecipe.id].output['xiranite_powder'];
    const required = demand.value
      .sub(explicitObjective.value.mul(ordinaryOutput))
      .sub(
        exceptionObjective.value.mul(
          exceptionObjective.recipe!.output['xiranite_powder'] ?? rational.zero,
        ),
      )
      .div(ordinaryOutput)
      .ceil();
    const budget = required
      .add(explicitObjective.value)
      .add(exceptionObjective.value);
    const state = createEndfieldState();
    extension.set({
      ...state,
      machineLimits: {
        enabled: true,
        limits: { [ovenId]: budget.sub(rational(1, 2)) },
      },
    });
    expect(result().resultType).toBe('failed');
    extension.set({
      ...state,
      machineLimits: { enabled: true, limits: { [ovenId]: budget } },
    });
    const solved = result();
    expect(solved.resultType).toBe('solved');
    const steps = objectives.steps();
    const normal = steps.find(
      (s) => s.recipeId === ordinaryRecipe.id && s.recipeObjectiveId == null,
    )!;
    const explicit = steps.find((s) => s.recipeObjectiveId === '2')!;
    const exception = steps.find((s) => s.recipeObjectiveId === '3')!;
    expect(normal.recipeSettings?.machineId).toBe(ovenId);
    expect(explicit.recipeSettings?.machineId).toBe(ovenId);
    expect(exception.recipeSettings?.machineId).toBe(ovenId);
    close(normal.machines!.toNumber(), required.toNumber());
    close(explicit.machines!.toNumber(), 1);
    close(exception.machines!.toNumber(), 0.5);
    close(
      normal
        .machines!.add(explicit.machines!)
        .add(exception.machines!)
        .toNumber(),
      budget.toNumber(),
    );
    objectives.set({ 1: objective('1', ordinaryRecipe.id, 0.5) });
    expect(result().resultType).toBe('failed');
    objectives.set({
      1: objective('1', 'xiranite_powder', 90, ObjectiveUnit.Items),
      2: objective('2', ordinaryRecipe.id, 1),
      3: objective('3', 'xiranite_enr_powder', 0.5),
    });
    extension.set({
      ...state,
      machineLimits: { enabled: false, limits: { [ovenId]: rational.zero } },
    });
    const disabled = result();
    expect(disabled.resultType).toBe('solved');
    expect(count(disabled.steps, ordinaryRecipe.id)).toBeGreaterThan(0);
  });

  it('A10 does not charge the alternative producer to a zero oven budget', () => {
    const alternative = data.recipes.find(
      (recipe) =>
        recipe.out?.['xiranite_powder'] &&
        recipe.producers?.length === 1 &&
        recipe.producers[0] !== ovenId,
    )!;
    const excluded = data.recipes
      .filter((r) => r.out?.['xiranite_powder'] && r.id !== alternative.id)
      .map((r) => r.id);
    settings.apply({ excludedRecipeIds: new Set(excluded) });
    const state = createEndfieldState();
    extension.set({
      ...state,
      machineLimits: { enabled: true, limits: { [ovenId]: rational.zero } },
    });
    objectives.set({
      1: objective('1', 'xiranite_powder', 30, ObjectiveUnit.Items),
    });
    const solved = result();
    expect(solved.resultType).toBe('solved');
    const step = objectives.steps().find((s) => s.recipeId === alternative.id)!;
    expect(step.recipeSettings?.machineId).toBe(alternative.producers![0]);
    expect(step.machines!.gt(rational.zero)).toBeTrue();
    expect(
      objectives.steps().filter((s) => s.recipeSettings?.machineId === ovenId)
        .length,
    ).toBe(0);
  });

  for (const algorithm of ['simplex', 'exact'] as const) {
    it(`A11 ${algorithm} rounds a half transfer and keeps it outside selectable objectives`, () => {
      preferences.apply({ glpkAlgorithm: algorithm });
      const state = createEndfieldState();
      extension.set({
        ...state,
        transferEnabled: true,
      });
      const recipesStore = TestBed.inject(RecipesStore);
      const adjustedData = recipesStore.adjustedDataset();
      const transfer = Object.values(adjustedData.adjustedRecipe).find(
        (recipe) =>
          recipesStore.transferRecipeIds().has(recipe.id) &&
          recipe.out['carbon_enr'],
      )!;
      expect(transfer).toBeDefined();
      expect(settings.dataset().recipeRecord[transfer.id]).toBeUndefined();
      expect(adjustedData.recipeIds).not.toContain(transfer.id);
      expect(adjustedData.itemRecipeIds['carbon_enr']).not.toContain(
        transfer.id,
      );
      const batchPerMinute = transfer.output['carbon_enr'].mul(rational(60));
      const demand = batchPerMinute.div(rational(2)).toNumber();
      const excluded = data.recipes
        .filter((r) => r.out?.['carbon_enr'])
        .map((r) => r.id);
      settings.apply({ excludedRecipeIds: new Set(excluded) });
      objectives.set({
        1: objective('1', 'carbon_enr', demand, ObjectiveUnit.Items),
      });
      const solved = result();
      expect(solved.resultType).toBe('solved');
      expect(extension.state().machineLimits.enabled).toBeFalse();
      close(count(solved.steps, transfer.id), 1);
      const carbon = objectives.steps().find((s) => s.itemId === 'carbon_enr')!;
      close(carbon.items!.toNumber(), batchPerMinute.toNumber());
      close(carbon.surplus!.toNumber(), batchPerMinute.toNumber() - demand);
      const transferStep = objectives
        .steps()
        .find((step) => step.recipeId === transfer.id)!;
      expect(
        TestBed.inject(Exporter)['stepToJson'](transferStep, objectives.steps())
          .Recipe,
      ).toBe(transfer.id);
      for (const recipes of Object.values(objectives.stepRecipes()))
        expect(recipes.ids).not.toContain(transfer.id);
      objectives.set({ 1: objective('1', transfer.id, 0.5) });
      expect(objectives.baseObjectives()).toEqual([]);
      expect(result().resultType).toBe('skipped');
      extension.set({
        ...state,
        transferEnabled: false,
      });
      objectives.set({
        1: objective('1', 'carbon_enr', demand, ObjectiveUnit.Items),
      });
      expect(
        result().steps.some((step) => step.recipeId === transfer.id),
      ).toBeFalse();
      settings.apply({ excludedRecipeIds: new Set() });
      const alternate = result();
      expect(alternate.resultType).toBe('solved');
      close(count(alternate.steps, transfer.id), 0);
      close(
        objectives
          .steps()
          .find((s) => s.itemId === 'carbon_enr')!
          .output!.toNumber(),
        demand,
      );
    });
  }

  it('filters both actual transfer sources, skips self-transfer and permits other selected regions', () => {
    expect(rawTransfer.sources).toEqual([
      { domainId: 'domain_1', locationId: 'tundra', capacity: 1500 },
      { domainId: 'domain_2', locationId: 'jinlong', capacity: 1500 },
    ]);
    const recipesStore = TestBed.inject(RecipesStore);
    const current = recipesStore.adjustedDataset;
    extension.set({ ...createEndfieldState(), transferEnabled: true });
    const generated = (): AdjustedRecipe[] =>
      Object.values(current().adjustedRecipe).filter((recipe) =>
        recipesStore.transferRecipeIds().has(recipe.id),
      );
    settings.apply({ locationIds: new Set(['jinlong']) });
    expect(generated().some((recipe) => recipe.out['carbon_enr'])).toBeTrue();
    expect(generated().some((recipe) => recipe.out['copper_ming'])).toBeFalse();
    settings.apply({ locationIds: new Set(['tundra']) });
    expect(generated()).toEqual([]);
    extension.apply({ transferSource: 'jinlong' });
    expect(generated().some((recipe) => recipe.out['copper_ming'])).toBeTrue();
    const transfer = generated().find((recipe) => recipe.out['carbon_enr'])!;
    expect(transfer.out['carbon_enr']).toEqual(rational(1500));
    settings.apply({ locationIds: new Set(['tundra', 'jinlong']) });
    expect(generated().some((recipe) => recipe.out['copper_ming'])).toBeTrue();
    settings.apply({ locationIds: new Set() });
    expect(generated()).toEqual([]);
    extension.apply({ transferEnabled: false });
    expect(generated()).toEqual([]);
  });

  for (const algorithm of ['simplex', 'exact'] as const) {
    it(`enforces the 16-oven default and restored 12-oven limit with ${algorithm}`, () => {
      preferences.apply({ glpkAlgorithm: algorithm });
      const recipe = data.recipes.find((entry) =>
        entry.producers?.includes(ovenId),
      )!;
      const defaults = createEndfieldState();
      extension.set({
        ...defaults,
        machineLimits: { ...defaults.machineLimits, enabled: true },
      });
      objectives.set({ 1: objective('1', recipe.id, 16) });
      expect(result().resultType).toBe('solved');
      objectives.set({ 1: objective('1', recipe.id, 17) });
      expect(result().resultType).toBe('failed');

      extension.set(decodeEndfield('2'));
      objectives.set({ 1: objective('1', recipe.id, 12) });
      expect(result().resultType).toBe('solved');
      objectives.set({ 1: objective('1', recipe.id, 13) });
      expect(result().resultType).toBe('failed');
    });

    it(`uses actual formation probabilities and preserves the failed material with ${algorithm}`, () => {
      preferences.apply({ glpkAlgorithm: algorithm });
      const id = 'formation_magic_ming_item_copper_ming_1';
      settings.apply({
        locationIds: new Set(['jinlong']),
        excludedRecipeIds: new Set(
          data.recipes
            .filter((recipe) => recipe.id !== id && recipe.out?.['copper_ming'])
            .map((recipe) => recipe.id),
        ),
      });
      objectives.set({
        1: objective('1', 'copper_ming', 6, ObjectiveUnit.Items),
      });
      const solved = result();
      expect(solved.resultType).toBe('solved');
      const formation = solved.steps.find((step) => step.recipeId === id)!;
      expect(formation).toBeDefined();
      close(formation.machines!.toNumber(), 5);
      expect(
        formation.recipe!.output['copper_nugget'].eq(rational(-1, 50)),
      ).toBeTrue();
      expect(
        formation.recipe!.output['copper_ming'].eq(rational(1, 50)),
      ).toBeTrue();
      const sourceRate = solved.steps.reduce((sum, step) => {
        const rate = step.recipe?.output['copper_nugget'];
        return rate?.gt(rational.zero) && step.machines
          ? sum + rate.mul(step.machines).toNumber()
          : sum;
      }, 0);
      close(sourceRate * 60, 6);
      const producer = formation.recipe!.producers![0];
      const row = objectives.steps().find((step) => step.recipeId === id)!;
      expect(row.recipeSettings!.machineId).toBe(producer);
      expect(objectives.totals().machines[producer]).toBeUndefined();

      objectives.set({
        1: objective('1', 'copper_ming', 6, ObjectiveUnit.Items),
        2: {
          ...objective('2', 'copper_nugget', 6, ObjectiveUnit.Items),
          type: ObjectiveType.Limit,
        },
      });
      // The native limit counts all 30 processed items, including 24 returns.
      expect(result().resultType).toBe('failed');
      objectives.set({
        1: objective('1', 'copper_ming', 6, ObjectiveUnit.Items),
        2: {
          ...objective('2', 'copper_nugget', 30, ObjectiveUnit.Items),
          type: ObjectiveType.Limit,
        },
      });
      expect(result().resultType).toBe('solved');
      close(count(result().steps, id), 5);

      // An external supply needs only the six items actually converted.
      settings.apply({
        excludedRecipeIds: new Set(
          data.recipes
            .filter((recipe) => {
              if (recipe.id === id) return false;
              const output = Number(recipe.out?.['copper_nugget'] ?? 0);
              const input = Number(recipe.in?.['copper_nugget'] ?? 0);
              return !!recipe.out?.['copper_ming'] || output > input;
            })
            .map((recipe) => recipe.id),
        ),
      });
      objectives.set({
        1: objective('1', 'copper_ming', 6, ObjectiveUnit.Items),
        2: {
          ...objective('2', 'copper_nugget', 6, ObjectiveUnit.Items),
          type: ObjectiveType.Input,
        },
      });
      const external = result();
      expect(external.resultType).toBe('solved');
      close(count(external.steps, id), 5);
      const copper = objectives
        .steps()
        .find((step) => step.itemId === 'copper_nugget')!;
      close(copper.items!.toNumber(), 30);

      settings.apply({ locationIds: new Set(['tundra']) });
      expect(
        TestBed.inject(RecipesStore).adjustedDataset().itemAvailableRecipeIds[
          'copper_ming'
        ],
      ).not.toContain(id);
    });

    it(`keeps fractional affected positions for the combined array with ${algorithm}`, () => {
      preferences.apply({ glpkAlgorithm: algorithm });
      const id = 'formation_magic_heng_item_copper_enr_heng_2';
      const product = 'copper_enr_heng';
      settings.apply({
        locationIds: new Set(['jinlong']),
        excludedRecipeIds: new Set(
          data.recipes
            .filter((recipe) => recipe.id !== id && recipe.out?.[product])
            .map((recipe) => recipe.id),
        ),
      });
      objectives.set({ 1: objective('1', product, 6, ObjectiveUnit.Items) });
      const solved = result();
      expect(solved.resultType).toBe('solved');
      close(count(solved.steps, id), 1.25);
    });

    it(`uses the actual reactor outputs together with ${algorithm}`, () => {
      preferences.apply({ glpkAlgorithm: algorithm });
      const id = 'gas_copper_bright_clear';
      settings.apply({
        excludedRecipeIds: new Set(
          data.recipes
            .filter(
              (recipe) =>
                recipe.id !== id &&
                (recipe.out?.['gas_copper_bright_clear'] ||
                  recipe.out?.['gas_copper_bright_turbid']),
            )
            .map((recipe) => recipe.id),
        ),
      });
      objectives.set({
        1: objective('1', 'gas_copper_bright_clear', 30, ObjectiveUnit.Items),
        2: objective('2', 'gas_copper_bright_turbid', 30, ObjectiveUnit.Items),
      });
      const solved = result();
      expect(solved.resultType).toBe('solved');
      close(count(solved.steps, id), 1);
      const reactor = solved.steps.find((step) => step.recipeId === id)!;
      expect(reactor.recipe!.out['gas_copper_bright_clear']).toEqual(
        rational.one,
      );
      expect(reactor.recipe!.out['gas_copper_bright_turbid']).toEqual(
        rational.one,
      );
    });

    for (const [source, destination, item, fullRate] of [
      ['tundra', 'jinlong', 'carbon_enr', 25],
      ['jinlong', 'tundra', 'copper_ming', 2.5],
    ] as const) {
      it(`solves ${source} to ${destination} transfer using current data with ${algorithm}`, () => {
        preferences.apply({ glpkAlgorithm: algorithm });
        settings.apply({
          locationIds: new Set([destination]),
          excludedRecipeIds: new Set(
            data.recipes
              .filter((recipe) => recipe.out?.[item])
              .map((recipe) => recipe.id),
          ),
        });
        extension.apply({ transferEnabled: true, transferSource: source });
        objectives.set({
          1: objective('1', item, fullRate / 2, ObjectiveUnit.Items),
        });
        const solved = result();
        expect(solved.resultType).toBe('solved');
        const id = `__endfield_transfer_${source}_${item}`;
        close(count(solved.steps, id), 1);
        const step = objectives.steps().find((entry) => entry.itemId === item)!;
        close(step.items!.toNumber(), fullRate);
        close(step.surplus!.toNumber(), fullRate / 2);
      });
    }
  }

  it('does not finalize an enabled transfer while its file is missing or failed', () => {
    const transferData = spyOn(settings, 'transferData').and.returnValue(
      undefined,
    );
    const transferError = spyOn(settings, 'transferError').and.returnValue(
      undefined,
    );
    objectives.set({
      1: objective('1', 'originium_ore', 10, ObjectiveUnit.Items),
    });
    expect(result().resultType).toBe('solved');
    extension.apply({ transferEnabled: true });
    expect(result().resultType).toBe('paused');
    transferError.and.returnValue(new Error('unavailable'));
    extension.apply({ electric: rational(2) });
    expect(result().resultType).toBe('failed');
    expect(transferData).toHaveBeenCalled();
  });

  it('ignores a retired static transfer objective without affecting ordinary targets', () => {
    settings.apply({ locationIds: new Set(['jinlong']) });
    extension.apply({ transferEnabled: true });
    objectives.set({
      old: objective('old', 'transfer_tundra_carbon_enr', 1),
      current: objective('current', 'carbon_enr', 10, ObjectiveUnit.Items),
    });
    expect(
      objectives.baseObjectives().map((objective) => objective.id),
    ).toEqual(['current']);
    expect(
      settings.dataset().recipeRecord['transfer_tundra_carbon_enr'],
    ).toBeUndefined();
    expect(result().resultType).toBe('solved');
  });

  it('uses the source ID until location names load and rejects a recipe ID collision', () => {
    settings.apply({ locationIds: new Set(['jinlong']) });
    const recipes = TestBed.inject(RecipesStore).adjustedDataset();
    const state = { ...createEndfieldState(), transferEnabled: true };
    const id = '__endfield_transfer_tundra_carbon_enr';
    const loading = addEndfieldTransferRecipes(
      { ...recipes, locationRecord: {} },
      settings.settings(),
      state,
      rawTransfer as EndfieldTransferData,
    );
    expect(loading.data.recipeRecord[id].name).toContain('(tundra)');
    expect(() =>
      addEndfieldTransferRecipes(
        {
          ...recipes,
          recipeRecord: {
            ...recipes.recipeRecord,
            [id]: recipes.recipeRecord['carbon_enr'],
          },
        },
        settings.settings(),
        state,
        rawTransfer as EndfieldTransferData,
      ),
    ).toThrowError(/Duplicate transfer recipe/);
  });

  it('A12 shares water nodes, supports fractional use and disabling/restoring them without an oven cap', () => {
    const resources = TestBed.runInInjectionContext(
      () => new EndfieldResources(),
    );
    settings.apply({ excludedRecipeIds: new Set(['carbon_enr']) });
    objectives.set({
      1: objective('1', 'sewage-treat', 1.5),
      2: objective('2', 'sewage-treat-export', 0.5),
    });
    expect(extension.state().machineLimits.enabled).toBeFalse();
    const solved = result();
    expect(solved.resultType).toBe('solved');
    close(count(solved.steps, 'sewage-treat', '1'), 1.5);
    close(count(solved.steps, 'sewage-treat-export', '2'), 0.5);
    objectives.set({
      1: objective('1', 'sewage-treat', 3),
      2: objective('2', 'sewage-treat-export', 0.1),
    });
    expect(result().resultType).toBe('failed');
    settings.apply({
      excludedRecipeIds: new Set(['carbon_enr', 'sewage-treat-export']),
    });
    objectives.set({ 1: objective('1', 'sewage-treat', 3) });
    const sparseX = result();
    expect(sparseX.resultType).toBe('solved');
    close(count(sparseX.steps, 'sewage-treat'), 3);
    close(count(sparseX.steps, 'sewage-treat-export'), 0);
    objectives.set({ 1: objective('1', 'sewage-treat', 3.1) });
    expect(result().resultType).toBe('failed');
    settings.apply({
      excludedRecipeIds: new Set(['carbon_enr', 'sewage-treat']),
    });
    objectives.set({ 1: objective('1', 'sewage-treat-export', 1) });
    const sparseY = result();
    expect(sparseY.resultType).toBe('solved');
    close(count(sparseY.steps, 'sewage-treat'), 0);
    close(count(sparseY.steps, 'sewage-treat-export'), 1);
    objectives.set({ 1: objective('1', 'sewage-treat-export', 1.1) });
    expect(result().resultType).toBe('failed');
    settings.apply({ excludedRecipeIds: new Set(['carbon_enr']) });
    objectives.set({ 1: objective('1', 'sewage-treat-export', 1) });
    resources['setWaterDisabled'](true);
    // Recipe exclusions govern automatic selection. Existing explicit recipe
    // objectives are preserved by the upstream objective contract.
    expect(result().resultType).toBe('solved');
    objectives.set({
      1: objective('1', 'sewage-treat', 3),
      2: objective('2', 'sewage-treat-export', 0.1),
    });
    expect(result().resultType).toBe('failed');
    objectives.set({ 1: objective('1', 'sewage-treat-export', 1) });
    resources['setWaterDisabled'](false);
    expect(result().resultType).toBe('solved');
  });

  it('A12 makes an automatic node compete with an explicit node and toggles automatic use', () => {
    const resources = TestBed.runInInjectionContext(
      () => new EndfieldResources(),
    );
    const input: ObjectiveState = {
      ...objective('2', 'liquid_sewage', 360, ObjectiveUnit.Items),
      type: ObjectiveType.Input,
    };
    settings.apply({
      excludedRecipeIds: new Set([
        'carbon_enr',
        'liquid_xiranite_poly',
        'liquid_xiranite_poly-purifier',
      ]),
    });
    objectives.set({ 1: objective('1', 'sewage-treat-export', 0.5), 2: input });
    const combined = result();
    expect(combined.resultType).toBe('solved');
    close(count(combined.steps, 'sewage-treat-export', '1'), 0.5);
    close(count(combined.steps, 'sewage-treat'), 1.5);
    close(
      count(combined.steps, 'sewage-treat') +
        3 * count(combined.steps, 'sewage-treat-export'),
      3,
    );
    objectives.set({
      1: objective('1', 'liquid_xiranite_poly', 12, ObjectiveUnit.Items),
      2: input,
    });
    const enabled = result();
    expect(enabled.resultType).toBe('solved');
    close(count(enabled.steps, 'sewage-treat-export'), 1);
    close(count(enabled.steps, 'sewage-treat'), 0);
    resources['setWaterDisabled'](true);
    const disabled = result();
    expect(disabled.resultType).toBe('solved');
    close(count(disabled.steps, 'sewage-treat-export'), 0);
    close(count(disabled.steps, 'sewage-treat'), 0);
    resources['setWaterDisabled'](false);
    const restored = result();
    expect(restored.resultType).toBe('solved');
    close(count(restored.steps, 'sewage-treat-export'), 1);
    expect(settings.settings().excludedRecipeIds.has('carbon_enr')).toBeTrue();
    expect(extension.state().machineLimits.enabled).toBeFalse();
  });
});
