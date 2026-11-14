import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { loadModule, Model } from 'glpk-ts';

import rawData from '/public/data/aef/data.json';
import rawHash from '/public/data/aef/hash.json';
import { Main } from '~/app/main/main';
import { ModData } from '~/data/schema/mod-data';
import { WorkspaceLifecycle } from '~/extensions/workspace-lifecycle';
import { Rational, rational } from '~/rational/rational';
import { Step } from '~/solver/step';
import { Adjustment } from '~/state/adjustment';
import { ItemsStore } from '~/state/items/items-store';
import { MachinesStore } from '~/state/machines/machines-store';
import { ObjectiveState } from '~/state/objectives/objective';
import { ObjectiveType } from '~/state/objectives/objective-type';
import { ObjectiveUnit } from '~/state/objectives/objective-unit';
import { ObjectivesStore } from '~/state/objectives/objectives-store';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { RecipesStore } from '~/state/recipes/recipes-store';
import { DisplayRate } from '~/state/settings/display-rate';
import { MaximizeType } from '~/state/settings/maximize-type';
import { SettingsStore } from '~/state/settings/settings-store';
import { TestModule } from '~/tests/test-module';
import { Translate } from '~/translate/translate';

import { decodeEndfield } from '../compat/codec';
import {
  createEndfieldState,
  ovenId,
  resourceObjectiveId,
  resourceOwner,
} from '../domain/model';
import { provideEndfield } from '../providers';
import { EndfieldCoordinator } from '../state/coordinator';
import { EndfieldStore } from '../state/endfield-store';

function machineObjective(
  id: string,
  targetId: string,
  value = rational.one,
): ObjectiveState {
  return {
    id,
    targetId,
    value,
    type: ObjectiveType.Output,
    unit: ObjectiveUnit.Machines,
  };
}

describe('Endfield calculation composition with the published aef data', () => {
  let settings: SettingsStore;
  let objectives: ObjectivesStore;
  let store: EndfieldStore;
  let recipes: RecipesStore;

  beforeAll(async () => {
    await loadModule('glpk.all.wasm');
  });
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestModule, Main],
      providers: [
        ...provideEndfield(),
        { provide: SettingsStore, useClass: SettingsStore },
      ],
    });
    settings = TestBed.inject(SettingsStore);
    settings.apply({
      modId: 'aef',
      locationIds: new Set(['tundra', 'jinlong']),
    });
    settings['modDataResource'].set(rawData as unknown as ModData);
    settings['modHashResource'].set(rawHash);
    objectives = TestBed.inject(ObjectivesStore);
    store = TestBed.inject(EndfieldStore);
    recipes = TestBed.inject(RecipesStore);
    TestBed.inject(PreferencesStore).apply({
      paused: false,
      glpkAlgorithm: 'simplex',
    });
  });

  it('constructs the calculation stores and skips an empty default workspace', () => {
    expect(objectives.calculationContext().objectives).toEqual([]);
    expect(objectives.matrixResult().resultType).toBe('skipped');
  });

  it('keeps the complete recipe availability set for every location subset', () => {
    for (const locations of [
      [],
      ['tundra'],
      ['jinlong'],
      ['tundra', 'jinlong'],
    ]) {
      settings.apply({ locationIds: new Set(locations) });
      const newAvailable = settings.settings().availableRecipeIds;
      expect(newAvailable.has('tundra_coupon-glass_bottle')).toBe(
        locations.includes('tundra'),
      );
      expect(newAvailable.has('jinlong_coupon-copper_cmpt')).toBe(
        locations.includes('jinlong'),
      );
    }
  });

  it('retains raw or overridden settlement costs independently of production rate', () => {
    const id = 'tundra_coupon-bottled_food_3';
    settings.apply({
      overclock: rational(200),
      costs: {
        ...settings.state().costs,
        factor: rational(2),
        machine: rational(50),
        footprint: rational(50),
      },
    });
    for (const override of [undefined, rational.zero, rational(-3)]) {
      recipes.set({ [id]: { cost: override } });
      const current = recipes.adjustedDataset();
      const expected = override ?? rational(60);
      expect(current.adjustedRecipe[id].cost).toEqual(expected);
    }
  });

  it('retains a restored exact tiny supply and reports its unrepresentable solver bound', () => {
    const json = JSON.stringify({
      version: 1,
      resourceLimits: { enabled: true, rates: { originium_ore: '1e-400' } },
    });
    const ef = btoa(json)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const params = { v: '12', ef };
    store.set(decodeEndfield(params.ef, rawData as unknown as ModData));

    const tiny = rational(1n, 10n ** 400n);
    expect(
      store.snapshot().resourceLimits.rates.originium_ore.eq(tiny),
    ).toBeTrue();
    const supply = objectives
      .calculationContext()
      .objectives.find(
        (objective) => objective.id === resourceObjectiveId('originium_ore'),
      )!;
    expect(supply.value.gt(rational.zero)).toBeTrue();
    expect(
      supply.value.mul(supply.recipe!.output['originium_ore']).eq(tiny),
    ).toBeTrue();
    expect(() => objectives.matrixResult()).toThrowError(
      /Unrepresentable bound of objective ef:resource:originium_ore: numeric underflow/,
    );
    expect(
      store.snapshot().resourceLimits.rates.originium_ore.eq(tiny),
    ).toBeTrue();
    expect(params.ef).toBe(ef);
    expect(atob(params.ef.replace(/-/g, '+').replace(/_/g, '/'))).toBe(json);
  });

  it('supports a declared-cost recipe without a selected producer through the adjustment boundary', () => {
    const data = recipes.adjustedDataset();
    const recipe = { ...data.adjustedRecipe['sewage-treat'] };
    TestBed.inject(Adjustment).adjustCosts(
      { 'sewage-treat': recipe },
      { 'sewage-treat': {} },
      settings.settings().costs,
      data,
    );
    expect(recipe.cost?.eq(rational(-30))).toBeTrue();
  });

  it('rejects a source whose adjusted output is not positive without changing visible objectives', () => {
    const initial = store.snapshot();
    store.set({
      ...initial,
      resourceLimits: {
        enabled: true,
        rates: { ...initial.resourceLimits.rates, originium_ore: rational.one },
      },
    });
    const adjustment = TestBed.inject(Adjustment);
    const original = adjustment.adjustObjective.bind(adjustment);
    let output: Rational | undefined;
    spyOn(adjustment, 'adjustObjective').and.callFake((...args) => {
      const result = original(...args);
      if (result.id !== resourceObjectiveId('originium_ore')) return result;
      return {
        ...result,
        recipe: {
          ...result.recipe!,
          output: { ...result.recipe!.output, originium_ore: output! },
        },
      };
    });
    for (output of [rational.zero, rational(-1), undefined]) {
      store.set({ ...store.snapshot() });
      expect(() => objectives.calculationContext()).toThrowError(
        /no positive adjusted output/,
      );
    }
    expect(objectives.state()).toEqual({});
  });

  it('rejects a missing current resource recipe before solving', () => {
    const initial = store.snapshot();
    store.set({
      ...initial,
      resourceLimits: { ...initial.resourceLimits, enabled: true },
    });
    const data = recipes.adjustedDataset();
    const recipeRecord = { ...data.recipeRecord };
    delete recipeRecord['originium_ore'];
    spyOn(recipes, 'adjustedDataset').and.returnValue({
      ...data,
      recipeRecord,
    });
    expect(() => objectives.calculationContext()).toThrowError(
      /Unknown derived target: originium_ore/,
    );
    expect(objectives.state()).toEqual({});
  });

  it('rejects an ordinary objective with the same ID as a derived resource limit', () => {
    const initial = store.snapshot();
    store.set({
      ...initial,
      resourceLimits: { ...initial.resourceLimits, enabled: true },
    });
    const id = 'ef:limit:originium_ore';
    objectives.set({ [id]: machineObjective(id, 'originium_ore') });
    expect(() => objectives.calculationContext()).toThrowError(
      /Duplicate derived objective ID/,
    );
    expect(objectives.state()[id].targetId).toBe('originium_ore');
  });

  it('shows the product title if an interface dictionary lacks the application key', () => {
    spyOn(TestBed.inject(Translate), 'get').and.returnValue('app.name');
    TestBed.tick();
    expect(TestBed.inject(Title).getTitle()).toBe('EndfieldLab');
  });

  it('updates an item-objective title with interface dictionary changes', () => {
    const data = settings.dataset();
    spyOn(settings, 'dataset').and.returnValue(data);
    const translate = TestBed.inject(Translate);
    translate.data.set({ 'app.name': 'First title' });
    objectives.set({
      1: {
        id: '1',
        targetId: 'originium_ore',
        value: rational.one,
        unit: ObjectiveUnit.Items,
        type: ObjectiveType.Output,
      },
    });
    TestBed.tick();
    expect(TestBed.inject(Title).getTitle()).toBe(
      `${data.itemRecord['originium_ore'].name} | First title`,
    );
    translate.data.set({ 'app.name': '第二标题' });
    TestBed.tick();
    expect(TestBed.inject(Title).getTitle()).toBe(
      `${data.itemRecord['originium_ore'].name} | 第二标题`,
    );
  });

  it('keeps a fixed physical supply after machine speed changes and leaves visible objectives unchanged', () => {
    const ordinary: ObjectiveState = {
      id: '1',
      targetId: 'originium_ore',
      value: rational(60),
      unit: ObjectiveUnit.Items,
      type: ObjectiveType.Output,
    };
    objectives.set({ 1: ordinary });
    const base = store.snapshot();
    store.set({
      ...base,
      resourceLimits: {
        enabled: true,
        rates: { ...base.resourceLimits.rates, originium_ore: rational(28) },
      },
    });
    for (const machineId of ['miner_2', 'miner_3']) {
      store.updateResourceRecipeField('originium_ore', 'machineId', machineId);
      store.updateResourceRecipeField(
        'originium_ore',
        'overclock',
        machineId === 'miner_2' ? rational(100) : rational(150),
      );
      settings.apply({
        miningBonus: machineId === 'miner_2' ? rational.zero : rational(50),
      });
      const context = objectives.calculationContext();
      const supply = context.objectives.find(
        (o) => o.id === resourceObjectiveId('originium_ore'),
      )!;
      expect(
        supply.value
          .mul(supply.recipe!.output['originium_ore'])
          .eq(rational(28)),
      ).toBeTrue();
      expect(supply.machineId).toBe(machineId);
      expect(
        supply.value.eq(
          machineId === 'miner_2' ? rational(84) : rational(112, 3),
        ),
      ).toBeTrue();
      expect(
        context.objectives.filter(
          (o) =>
            o.type === ObjectiveType.Limit && o.unit === ObjectiveUnit.Machines,
        ).length,
      ).toBe(6);
      expect(objectives.state()).toEqual({ 1: ordinary });
      expect(objectives.matrixResult().resultType).toBe('solved');
      const step = objectives
        .steps()
        .find((s) => s.recipeObjectiveId === supply.id)!;
      expect(step.recipeSettings?.machineId).toBe(machineId);
      expect(step.power?.gt(rational.zero)).toBeTrue();
      const ore = objectives.steps().find((s) => s.itemId === 'originium_ore')!;
      expect(ore.items?.eq(rational(1680))).toBeTrue();
      expect(ore.surplus?.eq(rational(1620))).toBeTrue();
    }
  });

  it('retains copper mining water and power as part of its independently prepared supply', () => {
    const state = store.snapshot();
    store.set({
      ...state,
      resourceLimits: {
        enabled: true,
        rates: { ...state.resourceLimits.rates, copper_ore: rational(2) },
      },
    });
    const supply = objectives
      .calculationContext()
      .objectives.find((o) => o.id === resourceObjectiveId('copper_ore'))!;
    expect(
      supply
        .recipe!.in['__miner_water']!.mul(supply.value)
        .div(supply.recipe!.time)
        .eq(rational(2)),
    ).toBeTrue();
    expect(objectives.matrixResult().resultType).toBe('solved');
    const step = objectives
      .steps()
      .find((s) => s.recipeObjectiveId === supply.id)!;
    expect(step.power).toBeUndefined();
    expect(
      objectives
        .steps()
        .some(
          (s) => s.itemId === '__miner_water' && s.items?.gt(rational.zero),
        ),
    ).toBeTrue();
  });

  it('rejects positive derived supplies and explicit machines outside the selected region without deleting their configuration', () => {
    settings.apply({ locationIds: new Set(['tundra']) });
    for (const id of ['gas_xiranite', 'copper_ore'] as const) {
      const state = createEndfieldState();
      store.set({
        ...state,
        resourceLimits: {
          enabled: true,
          rates: { ...state.resourceLimits.rates, [id]: rational.one },
        },
      });
      const snapshot = store.snapshot();
      expect(objectives.matrixResult().resultType)
        .withContext(id)
        .toBe('failed');
      expect(store.snapshot()).toBe(snapshot);
      settings.apply({ locationIds: new Set(['tundra', 'jinlong']) });
      expect(objectives.matrixResult().resultType)
        .withContext(id)
        .toBe('solved');
      settings.apply({ locationIds: new Set(['tundra']) });
    }
    store.reset();
    objectives.set({ 1: machineObjective('1', 'xiranite_powder-carbon_enr') });
    expect(objectives.matrixResult().resultType).toBe('failed');
    settings.apply({ locationIds: new Set(['tundra', 'jinlong']) });
    expect(objectives.matrixResult().resultType).toBe('solved');
  });

  it('keeps item transfer rates per second across every display rate', () => {
    const state = store.snapshot();
    store.set({ ...state, transfer: { enabled: true, source: 'tundra' } });
    for (const displayRate of Object.values(DisplayRate).filter(
      (value) => typeof value === 'number',
    )) {
      settings.apply({ displayRate: displayRate });
      const transfer = objectives
        .calculationContext()
        .normalized.filter((o) => o.targetId === 'domain_key_tundra');
      expect(transfer.length).toBe(2);
      expect(transfer.every((o) => o.value.eq(rational(1, 3600)))).toBeTrue();
    }
  });

  it('binds both explicit oven instances to a single shared budget and permits the continuous exception', () => {
    const state = store.snapshot();
    store.set({
      ...state,
      machineLimits: { enabled: true, limits: { [ovenId]: rational.one } },
    });
    objectives.set({
      1: machineObjective('1', 'xiranite_powder-carbon_enr'),
      2: machineObjective('2', 'xiranite_powder-carbon_enr'),
    });
    expect(objectives.matrixResult().resultType).toBe('failed');
    objectives.set({
      1: machineObjective('1', 'xiranite_powder-carbon_enr', rational(1, 2)),
    });
    expect(objectives.matrixResult().resultType).toBe('failed');
    objectives.set({
      1: machineObjective('1', 'xiranite_enr_powder', rational(1, 2)),
    });
    expect(objectives.matrixResult().resultType).toBe('solved');
  });

  it('uses integer transfer batches even with the oven limit disabled', () => {
    const state = store.snapshot();
    store.set({ ...state, transfer: { enabled: true, source: 'tundra' } });
    objectives.set({
      1: machineObjective('1', 'transfer_tundra_carbon_enr', rational(1, 2)),
    });
    expect(objectives.matrixResult().resultType).toBe('failed');
  });

  it('applies whole-machine drain semantics and retains negative generation with empty outputs', () => {
    for (const [amount, power] of [
      [rational(1, 2), rational(5)],
      [rational.one, rational(5)],
      [rational(9, 4), rational(15)],
    ]) {
      objectives.set({ 1: machineObjective('1', 'carbon_enr', amount) });
      expect(objectives.matrixResult().resultType).toBe('solved');
      expect(
        objectives
          .steps()
          .find((step) => step.recipeObjectiveId === '1')
          ?.power?.eq(power),
      ).toBeTrue();
    }
    objectives.set({
      1: machineObjective('1', 'power_proc_battery_3', rational(1, 2)),
    });
    expect(objectives.matrixResult().resultType).toBe('solved');
    const generator = objectives
      .steps()
      .find((step) => step.recipeObjectiveId === '1')!;
    expect(generator.recipe?.out).toEqual({});
    expect(generator.power?.eq(rational(-1100))).toBeTrue();
  });

  it('uses raw negative and zero declared costs and the independent electric weight consistently', () => {
    expect(
      recipes
        .adjustedDataset()
        .adjustedRecipe['sewage-treat'].cost?.eq(rational(-30)),
    ).toBeTrue();
    expect(
      recipes
        .adjustedDataset()
        .adjustedRecipe['sewage-treat-export'].cost?.eq(rational(-50)),
    ).toBeTrue();
    recipes.set({ 'sewage-treat': { cost: rational.zero } });
    expect(
      recipes.adjustedDataset().adjustedRecipe['sewage-treat'].cost?.isZero(),
    ).toBeTrue();
    const ordinary =
      recipes.adjustedDataset().adjustedRecipe['originium_ore'].cost!;
    store.set({ ...store.snapshot(), electric: rational(2) });
    const changed =
      recipes.adjustedDataset().adjustedRecipe['originium_ore'].cost!;
    expect(changed.gt(ordinary)).toBeTrue();
    expect(settings.settings().costs.factor.eq(rational.one)).toBeTrue();
  });

  it('keeps ordinary, explicit and derived machine settings independent', () => {
    recipes.set({
      originium_ore: { machineId: 'miner_2', overclock: rational(100) },
    });
    const initial = store.snapshot();
    store.set({
      ...initial,
      resourceLimits: {
        enabled: true,
        rates: { ...initial.resourceLimits.rates, originium_ore: rational.one },
      },
      resourceRecipeSettings: {
        originium_ore: { machineId: 'miner_3', overclock: rational(125) },
      },
    });
    objectives.set({
      1: {
        ...machineObjective('1', 'originium_ore'),
        machineId: 'miner_3',
        overclock: rational(150),
      },
    });
    for (const electric of [rational.one, rational(2)]) {
      store.set({ ...store.snapshot(), electric });
      const ordinary =
        recipes.adjustedDataset().adjustedRecipe['originium_ore'];
      const explicit = objectives.objectives()[0];
      const derived = objectives
        .calculationContext()
        .objectives.find((o) => o.id === resourceObjectiveId('originium_ore'))!;
      expect(ordinary.cost).toEqual(rational(5).mul(electric));
      expect(recipes.settings()['originium_ore'].machineId).toBe('miner_2');
      expect(recipes.settings()['originium_ore'].overclock).toEqual(
        rational(100),
      );
      expect(explicit.machineId).toBe('miner_3');
      expect(explicit.overclock).toEqual(rational(150));
      expect(derived.machineId).toBe('miner_3');
      expect(derived.overclock).toEqual(rational(125));
    }
    store.setResourceChecked('originium_ore', true);
    const enabled = store.snapshot();
    store.set({
      ...enabled,
      resourceLimits: { ...enabled.resourceLimits, enabled: false },
    });
    expect(
      objectives
        .calculationContext()
        .objectives.some((o) => o.id === resourceObjectiveId('originium_ore')),
    ).toBeFalse();
    expect(recipes.settings()['originium_ore'].machineId).toBe('miner_2');
    expect(objectives.objectives()[0].overclock).toEqual(rational(150));
    expect(
      store.snapshot().checkedDerived.has(resourceOwner('originium_ore')),
    ).toBeTrue();
    store.set({ ...store.snapshot(), resourceLimits: enabled.resourceLimits });
    expect(
      objectives
        .calculationContext()
        .objectives.find((o) => o.id === resourceObjectiveId('originium_ore'))
        ?.overclock,
    ).toEqual(rational(125));
  });

  it('restores ordinary mining when a separate source is disabled and reuses its settings when reopened', () => {
    recipes.set({
      originium_ore: { machineId: 'miner_2', overclock: rational(100) },
    });
    objectives.set({
      1: {
        ...machineObjective('1', 'originium_ore'),
        machineId: 'miner_3',
        overclock: rational(150),
      },
      2: {
        id: '2',
        targetId: 'originium_ore',
        value: rational(540),
        type: ObjectiveType.Output,
        unit: ObjectiveUnit.Items,
      },
    });
    const initial = store.snapshot();
    store.set({
      ...initial,
      resourceLimits: {
        enabled: true,
        rates: {
          ...initial.resourceLimits.rates,
          originium_ore: rational(560, 60),
        },
      },
      resourceRecipeSettings: {
        originium_ore: { machineId: 'miner_3', overclock: rational(125) },
      },
    });
    store.setResourceChecked('originium_ore', true);
    const sourceId = resourceObjectiveId('originium_ore');
    expect(objectives.matrixResult().resultType).toBe('solved');
    const source = objectives
      .steps()
      .find((s) => s.recipeObjectiveId === sourceId)!;
    expect(source.recipeSettings?.machineId).toBe('miner_3');
    expect(source.recipeSettings?.overclock).toEqual(rational(125));
    expect(
      source
        .machines!.mul(source.recipe!.output['originium_ore'])
        .eq(rational(560, 60)),
    ).toBeTrue();
    expect(
      objectives
        .steps()
        .some(
          (s) => s.recipeId === 'originium_ore' && s.recipeObjectiveId == null,
        ),
    ).toBeFalse();
    expect(
      objectives.steps().find((s) => s.recipeObjectiveId === '1')
        ?.recipeSettings?.overclock,
    ).toEqual(rational(150));

    const enabled = store.snapshot();
    store.set({
      ...enabled,
      resourceLimits: { ...enabled.resourceLimits, enabled: false },
    });
    expect(objectives.matrixResult().resultType).toBe('solved');
    expect(
      objectives.steps().some((s) => s.recipeObjectiveId === sourceId),
    ).toBeFalse();
    const ordinary = objectives
      .steps()
      .find(
        (s) => s.recipeId === 'originium_ore' && s.recipeObjectiveId == null,
      )!;
    expect(ordinary.machines!.gt(rational.zero)).toBeTrue();
    expect(ordinary.recipeSettings?.machineId).toBe('miner_2');
    expect(ordinary.recipeSettings?.overclock).toEqual(rational(100));
    expect(
      store.snapshot().checkedDerived.has(resourceOwner('originium_ore')),
    ).toBeTrue();

    store.set({ ...store.snapshot(), resourceLimits: enabled.resourceLimits });
    expect(objectives.matrixResult().resultType).toBe('solved');
    const restored = objectives
      .steps()
      .find((s) => s.recipeObjectiveId === sourceId)!;
    expect(restored.recipeSettings?.machineId).toBe('miner_3');
    expect(restored.recipeSettings?.overclock).toEqual(rational(125));
    expect(
      restored
        .machines!.mul(restored.recipe!.output['originium_ore'])
        .eq(rational(560, 60)),
    ).toBeTrue();
  });

  it('preserves raw, override and recycling costs in ordinary recipe costs', () => {
    const adjustment = TestBed.inject(Adjustment);
    const data = recipes.adjustedDataset();
    const recipeSettings = recipes.settings();
    const costSettings = {
      ...settings.settings().costs,
      factor: rational(2),
      recycling: rational(1000),
    };
    const cases = [
      {
        raw: undefined,
        override: undefined,
        recycling: false,
        expected: costSettings.machine,
      },
      {
        raw: rational(-30),
        override: undefined,
        recycling: false,
        expected: rational(-60),
      },
      {
        raw: rational.zero,
        override: undefined,
        recycling: false,
        expected: rational.zero,
      },
      {
        raw: rational(2),
        override: undefined,
        recycling: true,
        expected: rational(4000),
      },
      {
        raw: rational(-30),
        override: rational.zero,
        recycling: false,
        expected: rational.zero,
      },
      {
        raw: rational(-30),
        override: rational(-3),
        recycling: true,
        expected: rational(-3000),
      },
    ];
    for (const [index, example] of cases.entries()) {
      const id = 'sewage-treat';
      const candidate = {
        ...data,
        recipeRecord: {
          ...data.recipeRecord,
          [id]: {
            ...data.recipeRecord[id],
            cost: example.raw,
            flags: new Set(example.recycling ? ['recycling' as const] : []),
          },
        },
      };
      const ordinary = { ...data.adjustedRecipe[id] };
      adjustment.adjustCosts(
        { [id]: ordinary },
        { [id]: { ...recipeSettings[id], cost: example.override } },
        costSettings,
        candidate,
      );
      expect(ordinary.cost)
        .withContext(`case ${index}`)
        .toEqual(example.expected);
    }
  });

  it('uses selected base machine usage and footprint in ordinary recipe costs', () => {
    const adjustment = TestBed.inject(Adjustment);
    const data = recipes.adjustedDataset();
    const recipeSettings = recipes.settings();
    const id = 'originium_ore';
    const candidate = {
      ...data,
      machineRecord: {
        ...data.machineRecord,
        miner_2: {
          ...data.machineRecord['miner_2'],
          usage: rational(50),
          size: [5, 5] as [number, number],
        },
      },
    };
    const chosenSettings = {
      ...recipeSettings[id],
      machineId: 'miner_2',
      overclock: rational(150),
    };
    const costs = {
      ...settings.settings().costs,
      machine: rational(2),
      footprint: rational(5),
    };
    store.set({ ...store.snapshot(), electric: rational(2) });
    const ordinary = { ...data.adjustedRecipe[id] };
    adjustment.adjustCosts(
      { [id]: ordinary },
      { [id]: chosenSettings },
      costs,
      candidate,
    );
    const objective = adjustment.adjustObjective(
      {
        ...machineObjective('1', id),
        machineId: 'miner_2',
        overclock: rational(150),
      },
      TestBed.inject(ItemsStore).settings(),
      recipeSettings,
      TestBed.inject(MachinesStore).settings(),
      { ...settings.settings(), costs },
      candidate,
    );
    // 2 * electric(2) * base usage(50) + 2 * footprint area(25).
    expect(ordinary.cost).toEqual(rational(250));
    const adjustedPower =
      objective.recipe!.drain ?? objective.recipe!.consumption;
    expect(adjustedPower).toBeDefined();
    expect(adjustedPower).not.toEqual(rational(50));
    costs.footprint = rational.zero;
    adjustment.adjustCosts(
      { [id]: ordinary },
      { [id]: chosenSettings },
      costs,
      candidate,
    );
    expect(ordinary.cost).toEqual(rational(200));
  });

  it('matches the visible integer objective to an independent dot product of every solved model variable', () => {
    settings.apply({
      maximizeType: MaximizeType.Weight,
      costs: {
        ...settings.state().costs,
        maximize: rational(-1000000),
        unproduceable: rational(100),
      },
    });
    const base = store.snapshot();
    store.set({
      ...base,
      resourceLimits: {
        enabled: true,
        rates: { ...base.resourceLimits.rates, originium_ore: rational.one },
      },
      machineLimits: { enabled: true, limits: { [ovenId]: rational(2) } },
      transfer: { enabled: true, source: 'tundra' },
    });
    objectives.set({
      '1': {
        id: '1',
        targetId: 'carbon_enr',
        value: rational(60),
        type: ObjectiveType.Output,
        unit: ObjectiveUnit.Items,
      },
      '2': machineObjective('2', 'xiranite_powder-carbon_enr'),
      '3': {
        ...machineObjective('3', 'xiranite_powder-carbon_enr'),
        type: ObjectiveType.Maximize,
      },
    });

    const snapshots: {
      objective: number;
      variables: {
        id: number;
        name: string;
        type: string;
        coefficient: number;
        value: number;
      }[];
    }[] = [];
    const originalIntopt = Model.prototype.intopt;
    spyOn(Model.prototype, 'intopt').and.callFake(function (
      this: Model,
      options,
    ) {
      const code = originalIntopt.call(this, options);
      if (code === 'ok' && this.statusMIP === 'optimal') {
        const variables = this.vars.map((variable) => ({
          id: variable.id,
          name: variable.name,
          type: variable.type,
          coefficient: variable.obj,
          value: variable.valueMIP,
        }));
        expect(variables.length).toBe(this.numVars);
        snapshots.push({ objective: this.valueMIP, variables });
      }
      return code;
    });

    const result = objectives.matrixResult();
    expect(result.resultType).toBe('solved');
    expect(snapshots.length).toBe(1);
    const model = snapshots[0];
    expect(new Set(model.variables.map((variable) => variable.id)).size).toBe(
      model.variables.length,
    );
    const named = (name: string): typeof model.variables =>
      model.variables.filter((variable) => variable.name === name);
    // The solver must bind normal production, the fixed explicit recipe, the
    // maximize recipe and its reward, and the separate fixed mining supply.
    expect(
      named('carbon_enr').some(
        (variable) => variable.value > 0 && variable.coefficient > 0,
      ),
    ).toBeTrue();
    expect(
      named('2').some(
        (variable) => variable.value === 1 && variable.coefficient === 0,
      ),
    ).toBeTrue();
    expect(
      named('3').some(
        (variable) => variable.value > 0 && variable.coefficient === 0,
      ),
    ).toBeTrue();
    expect(
      named('3').some(
        (variable) => variable.value > 0 && variable.coefficient === -1000000,
      ),
    ).toBeTrue();
    expect(
      named(resourceObjectiveId('originium_ore')).some(
        (variable) => variable.value === 3 && variable.coefficient === 0,
      ),
    ).toBeTrue();
    expect(
      named('originium_ore').some(
        (variable) => variable.value > 0 && variable.coefficient === 1,
      ),
    ).toBeTrue();

    // Read GLPK's own complete column list and coefficients, not the solver's
    // cost validator or its returned recipe subset. Integer columns are
    // normalized only after independently checking their distance to an integer.
    let independentlySummed = 0;
    for (const variable of model.variables) {
      expect(
        Number.isFinite(variable.value) &&
          Number.isFinite(variable.coefficient),
      ).toBeTrue();
      const integer = variable.type === 'integer' || variable.type === 'binary';
      if (integer)
        expect(
          Math.abs(variable.value - Math.round(variable.value)),
        ).toBeLessThanOrEqual(1e-7);
      independentlySummed +=
        variable.coefficient *
        (integer ? Math.round(variable.value) : variable.value);
    }
    const tolerance =
      1e-7 *
      (1 + Math.max(Math.abs(model.objective), Math.abs(independentlySummed)));
    expect(Math.abs(model.objective - independentlySummed)).toBeLessThanOrEqual(
      tolerance,
    );
    expect(
      Math.abs(result.cost!.toNumber() - independentlySummed),
    ).toBeLessThanOrEqual(tolerance);

    const fixture = TestBed.createComponent(Main);
    fixture.detectChanges();
    const footer = fixture.nativeElement.querySelector(
      'main > div:last-child span',
    ) as HTMLElement;
    expect(footer.textContent).toContain(result.cost!.toLocaleString());
    expect(footer.textContent).toContain(
      independentlySummed.toLocaleString(undefined, {
        maximumFractionDigits: 2,
        roundingMode: 'ceil',
      }),
    );
    console.info(
      `[acceptance-mip-cost] ${JSON.stringify({ objective: model.objective, independentlySummed, displayed: footer.textContent?.trim(), variables: model.variables })}`,
    );
  });

  it('preserves the upstream available recipe set when applying the cost policy', () => {
    settings.apply({ locationIds: new Set(['tundra']) });
    expect(
      Object.keys(recipes.adjustedDataset().adjustedRecipe).sort(),
    ).toEqual([...settings.settings().availableRecipeIds].sort());
    expect(
      recipes.adjustedDataset().adjustedRecipe['xiranite_powder-carbon_enr'],
    ).toBeUndefined();
  });

  it('isolates source edits and check state from ordinary objectives and settings', () => {
    const state = store.snapshot();
    store.set({
      ...state,
      resourceLimits: {
        enabled: true,
        rates: { ...state.resourceLimits.rates, originium_ore: rational.one },
      },
    });
    const step: Step = {
      id: 'supply',
      recipeId: 'originium_ore',
      recipeObjectiveId: resourceObjectiveId('originium_ore'),
    };
    objectives.updateRecipeField(step, 'machineId', 'miner_3');
    objectives.updateRecipeField(step, 'overclock', rational(125));
    objectives.updateRecipeField(step, 'cost', rational(-1));
    expect(store.snapshot().resourceRecipeSettings.originium_ore).toEqual({
      machineId: 'miner_3',
      overclock: rational(125),
    });
    expect(objectives.state()).toEqual({});
    expect(recipes.state()['originium_ore']).toBeUndefined();
    expect(
      objectives.stepsModified().objectives[
        resourceObjectiveId('originium_ore')
      ],
    ).toBeTrue();
    expect(objectives.recipesModified().machines).toBeTrue();
    expect(objectives.recipesModified().beacons).toBeFalse();
    expect(objectives.recipesModified().cost).toBeFalse();
    store.setResourceChecked('originium_ore', true);
    const solved = objectives
      .steps()
      .find((value) => value.recipeObjectiveId === step.recipeObjectiveId)!;
    expect(solved.itemId).toBe('originium_ore');
    expect(solved.checked).toBeFalse();
    expect(
      store.snapshot().checkedDerived.has(resourceOwner('originium_ore')),
    ).toBeTrue();
    expect(settings.state().checkedObjectiveIds.size).toBe(0);
    store.clearResourceChecked();
    expect(store.snapshot().checkedDerived.size).toBe(0);
    store.resetResourceRecipe('originium_ore');
    expect(objectives.recipesModified().machines).toBeFalse();
    store.updateResourceRecipeField(
      'originium_ore',
      'overclock',
      rational(125),
    );
    expect(objectives.recipesModified().machines).toBeTrue();
  });

  it('gives item checks priority over a source objective on the same step', () => {
    const state = store.snapshot();
    store.set({
      ...state,
      checkedDerived: new Set([resourceOwner('originium_ore')]),
    });
    const recipeObjectiveId = resourceObjectiveId('originium_ore');
    spyOn(objectives['normalization'], 'normalizeSteps').and.returnValue([
      {
        id: 'item',
        itemId: 'originium_ore',
        recipeObjectiveId,
        checked: false,
      },
      { id: 'source', recipeObjectiveId, checked: false },
    ]);
    expect(objectives.steps().map((step) => step.checked)).toEqual([
      false,
      true,
    ]);
  });

  it('gates solving and derived preparation while workspace resources are being restored', () => {
    store.set({
      ...createEndfieldState(),
      resourceLimits: {
        ...createEndfieldState().resourceLimits,
        enabled: true,
      },
    });
    TestBed.inject(WorkspaceLifecycle).begin('/aef/list?ef=loading');
    settings['modDataResource'].set(undefined);
    expect(objectives.matrixResult().resultType).toBe('paused');
    expect(objectives.steps()).toEqual([]);
    expect(objectives.calculationContext().objectives).toEqual([]);
    expect(objectives.stepsModified().objectives).toEqual({});
    expect(
      TestBed.inject(EndfieldCoordinator).dispatch({
        type: 'resourceEnabled',
        enabled: true,
      }),
    ).toBeFalse();
  });
});
