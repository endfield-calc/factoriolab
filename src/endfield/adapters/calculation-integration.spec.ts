import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { loadModule, Model } from 'glpk-ts';

import rawData from '/public/data/aef/data.json';
import rawHash from '/public/data/aef/hash.json';
import { Main } from '~/app/main/main';
import { ModData } from '~/data/schema/mod-data';
import { finalizeRecipe } from '~/data/schema/recipe';
import { CALCULATION_EXTENSION } from '~/extensions/calculation-extension';
import { PRESENTATION_EXTENSION } from '~/extensions/presentation-extension';
import {
  STATE_EXTENSION,
  WorkspaceRestoreError,
  WorkspaceState,
} from '~/extensions/state-extension';
import { WorkspaceLifecycle } from '~/extensions/workspace-lifecycle';
import { WorkspacePreparation } from '~/extensions/workspace-preparation';
import { rational } from '~/rational/rational';
import { Step } from '~/solver/step';
import { Adjustment } from '~/state/adjustment';
import { ItemsStore } from '~/state/items/items-store';
import { MachinesStore } from '~/state/machines/machines-store';
import {
  ObjectiveSettings,
  ObjectiveState,
} from '~/state/objectives/objective';
import { ObjectiveType } from '~/state/objectives/objective-type';
import { ObjectiveUnit } from '~/state/objectives/objective-unit';
import { ObjectivesStore } from '~/state/objectives/objectives-store';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { RecipeSettings } from '~/state/recipes/recipe-settings';
import { RecipesStore } from '~/state/recipes/recipes-store';
import { Migration } from '~/state/router/migration';
import { Params } from '~/state/router/params';
import { RouterSync } from '~/state/router/router-sync';
import { DisplayRate } from '~/state/settings/display-rate';
import { MaximizeType } from '~/state/settings/maximize-type';
import { SettingsStore } from '~/state/settings/settings-store';
import { TableStore } from '~/state/table/table-store';
import { TestModule } from '~/tests/test-module';
import { Translate } from '~/translate/translate';

import { settlementRecipeAlias } from '../compat/codec';
import {
  createEndfieldState,
  EndfieldState,
  ovenId,
  resourceIds,
  resourceObjectiveId,
  resourceOwner,
  resourceRecipes,
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

  it('constructs all four providers without a dependency cycle and skips an empty default workspace', () => {
    expect(TestBed.inject(PRESENTATION_EXTENSION).mainPanels.length).toBe(2);
    expect(objectives.calculationContext().objectives).toEqual([]);
    expect(objectives.matrixResult().resultType).toBe('skipped');
  });

  it('keeps the complete recipe availability set for every location subset', () => {
    const current = rawData as unknown as ModData;
    const previous: ModData = {
      ...current,
      recipes: current.recipes.map((recipe) => {
        const alias = settlementRecipeAlias(recipe);
        return alias == null
          ? recipe
          : { ...recipe, locations: undefined, producers: [alias] };
      }),
    };
    for (const locations of [
      [],
      ['tundra'],
      ['jinlong'],
      ['tundra', 'jinlong'],
    ]) {
      settings.apply({ locationIds: new Set(locations) });
      settings['modDataResource'].set(previous);
      const oldAvailable = settings.settings().availableRecipeIds;
      settings['modDataResource'].set(current);
      const newAvailable = settings.settings().availableRecipeIds;
      expect(newAvailable)
        .withContext(locations.join('+') || 'none')
        .toEqual(oldAvailable);
      expect(newAvailable.has('tundra_coupon-glass_bottle')).toBe(
        locations.includes('tundra'),
      );
      expect(newAvailable.has('jinlong_coupon-copper_cmpt')).toBe(
        locations.includes('jinlong'),
      );
    }
  });

  it('matches upstream alias calculations for ordinary recipes and all explicit objective types', () => {
    const baseline = TestBed.runInInjectionContext(() => new Adjustment());
    const machineStore = TestBed.inject(MachinesStore);
    const itemStore = TestBed.inject(ItemsStore);
    const cases = [
      {
        global: 100,
        machine: undefined,
        recipe: undefined,
        objective: undefined,
      },
      {
        global: 150,
        machine: undefined,
        recipe: undefined,
        objective: undefined,
      },
      { global: 150, machine: 125, recipe: 200, objective: undefined },
      { global: 150, machine: 125, recipe: 200, objective: rational(175) },
      { global: 150, machine: 125, recipe: 200, objective: rational(225, 2) },
    ];
    const actualAdjustment = TestBed.inject(Adjustment);
    for (const [id, alias] of [
      ['tundra_coupon-glass_bottle', 'settlement-tundra_coupon'],
      ['jinlong_coupon-copper_cmpt', 'settlement-jinlong_coupon'],
    ] as const) {
      for (const example of cases) {
        settings.apply({ overclock: rational(example.global) });
        machineStore.set({
          [alias]:
            example.machine == null
              ? {}
              : { overclock: rational(example.machine) },
        });
        const saved = {
          machineId: alias,
          overclock:
            example.recipe == null ? undefined : rational(example.recipe),
          productivity: rational(25),
          fuelId: 'ignored',
          modules: [{ id: 'ignored' }],
          beacons: [{ id: 'ignored' }],
        };
        recipes.set({ [id]: saved });
        const machines = machineStore.settings();
        const current = recipes.adjustedDataset();
        const nativeRecipe = current.recipeRecord[id];
        const oldRecipe = {
          ...nativeRecipe,
          producers: [alias],
          locations: undefined,
        };
        const previous = {
          ...current,
          recipeRecord: { ...current.recipeRecord, [id]: oldRecipe },
        };
        const previousSettings: RecipeSettings = { ...saved };
        baseline.computeRecipeSettings(
          previousSettings,
          oldRecipe,
          machines,
          settings.settings(),
          previous,
        );
        const prepared = recipes.settings()[id];
        expect(prepared.machineId).toBeUndefined();
        expect(prepared.defaultMachineId).toBeUndefined();
        expect(prepared.machineOptions).toBeUndefined();
        for (const field of [
          'overclock',
          'defaultOverclock',
          'productivity',
          'fuelId',
          'modules',
          'beacons',
        ] as const)
          expect(prepared[field])
            .withContext(`${id} ${field}`)
            .toEqual(previousSettings[field]);
        expect(recipes.state()[id]).toEqual(saved);
        expect(nativeRecipe.producers).toBeUndefined();

        const oldAdjusted = baseline.adjustRecipe(
          id,
          previousSettings,
          itemStore.settings(),
          settings.settings(),
          previous,
        );
        finalizeRecipe(oldAdjusted);
        const adjusted = current.adjustedRecipe[id];
        for (const field of ['time', 'in', 'out', 'output', 'effects'] as const)
          expect(adjusted[field])
            .withContext(`${id} ordinary ${field}`)
            .toEqual(oldAdjusted[field]);

        for (const type of [
          ObjectiveType.Output,
          ObjectiveType.Input,
          ObjectiveType.Maximize,
          ObjectiveType.Limit,
        ]) {
          const objective: ObjectiveState = {
            ...machineObjective('1', id),
            type,
            machineId: alias,
            overclock: example.objective,
            productivity: rational(99),
          };
          const oldObjective = baseline.adjustObjective(
            objective,
            itemStore.settings(),
            { ...recipes.settings(), [id]: previousSettings },
            machines,
            settings.settings(),
            previous,
          );
          const actual = actualAdjustment.adjustObjective(
            objective,
            itemStore.settings(),
            recipes.settings(),
            machines,
            settings.settings(),
            current,
          );
          expect(actual.machineId).toBeUndefined();
          expect(actual.productivity).toEqual(rational(25));
          expect(actual.overclock).toEqual(oldObjective.overclock);
          for (const field of [
            'time',
            'in',
            'out',
            'output',
            'effects',
          ] as const)
            expect(actual.recipe![field])
              .withContext(`${id} objective ${type} ${field}`)
              .toEqual(oldObjective.recipe![field]);
          expect(objective.machineId).toBe(alias);
          if (
            example.recipe === 200 &&
            example.machine === 125 &&
            example.objective == null
          )
            expect(actual.overclock).toEqual(rational(125));
        }
      }
    }
  });

  it('retains raw or overridden settlement costs independently of production rate', () => {
    const id = 'tundra_coupon-bottled_food_3';
    const adjustment = TestBed.inject(Adjustment);
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
      const objective = adjustment.adjustObjective(
        { ...machineObjective('1', id), cost: override },
        TestBed.inject(ItemsStore).settings(),
        recipes.settings(),
        TestBed.inject(MachinesStore).settings(),
        settings.settings(),
        current,
      );
      expect(objective.recipe!.cost).toEqual(expected);
    }
  });

  it('restores, re-encodes and resets v11 and v12 settlement alias settings', async () => {
    const router = TestBed.inject(RouterSync);
    const migration = TestBed.inject(Migration);
    const lifecycle = TestBed.inject(WorkspaceLifecycle);
    const extension = TestBed.inject(STATE_EXTENSION);
    const machines = TestBed.inject(MachinesStore);
    const id = 'tundra_coupon-glass_bottle';
    const alias = 'settlement-tundra_coupon';
    const restore = async (query: string): Promise<void> => {
      const ticket = lifecycle.begin(query);
      const params = await router.unzipQueryParams(router.toParams(query));
      const plan = extension.prepare({ modId: 'aef', params });
      const migrated = migration.migrate(
        plan.modId,
        plan.params,
        plan.legacyModHashes,
      );
      router.updateState(
        migrated.modId,
        migrated.params,
        migrated.isBare,
        rawData as unknown as ModData,
        rawHash,
        plan,
        ticket,
      );
      expect(lifecycle.ready())
        .withContext(JSON.stringify(lifecycle.diagnostics()))
        .toBeTrue();
    };
    const zip = (): Promise<unknown> =>
      router.getHash(
        router.zipState({
          objectives: objectives.state(),
          items: TestBed.inject(ItemsStore).state(),
          recipes: recipes.state(),
          machines: machines.state(),
          settings: settings.state(),
          table: TestBed.inject(TableStore).state(),
          data: settings.dataset(),
          hash: rawHash,
          extension: store.snapshot(),
        }),
      );
    for (const version of ['11', '12']) {
      const query = `v=${version}&o=${id}**3**${alias}***175&r=${id}*${alias}***200***25&m=${alias}****125&moc=150`;
      await restore(query);
      expect(recipes.state()[id].machineId).toBe(alias);
      expect(recipes.state()[id].overclock).toEqual(rational(200));
      expect(recipes.state()[id].productivity).toEqual(rational(25));
      expect(machines.state()[alias].overclock).toEqual(rational(125));
      expect(settings.state().overclock).toEqual(rational(150));
      expect(objectives.state()['1'].machineId).toBe(alias);
      expect(objectives.objectives()[0].overclock).toEqual(rational(175));
      const adjusted = recipes.adjustedDataset().adjustedRecipe[id];
      expect(adjusted.time).toEqual(rational.one);
      expect(adjusted.output['tundra_coupon']).toEqual(rational(5, 2));
      const encoded = router.toString((await zip()) as Params);
      recipes.set({});
      machines.set({});
      objectives.set({});
      await restore(encoded);
      expect(recipes.state()[id].machineId).toBe(alias);
      expect(recipes.state()[id].overclock).toEqual(rational(200));
      expect(machines.state()[alias].overclock).toEqual(rational(125));
      expect(objectives.state()['1'].machineId).toBe(alias);
      expect(objectives.objectives()[0].overclock).toEqual(rational(175));
      expect(
        recipes.adjustedDataset().adjustedRecipe[id].output['tundra_coupon'],
      ).toEqual(rational(5, 2));
      const before = {
        recipes: recipes.state(),
        machines: machines.state(),
        objectives: objectives.state(),
      };
      await expectAsync(
        restore(`v=${version}&o=${id}**3**settlement-jinlong_coupon`),
      ).toBeRejectedWithError(WorkspaceRestoreError);
      expect(recipes.state()).toBe(before.recipes);
      expect(machines.state()).toBe(before.machines);
      expect(objectives.state()).toBe(before.objectives);
      recipes.resetId(id);
      expect(recipes.state()[id]).toBeUndefined();
      expect(recipes.settings()[id].machineId).toBeUndefined();
      expect(recipes.settings()[id].overclock).toEqual(rational(125));
    }
  });

  it('rejects a restoration without dataset identity and leaves live stores intact', () => {
    const initial = settings.state();
    expect(() =>
      TestBed.inject(WorkspacePreparation).prepareObjectives(
        {},
        rawData as unknown as ModData,
        rawHash,
        [],
      ),
    ).toThrowError('Cannot prepare an unknown or unavailable mod');
    expect(settings.state()).toBe(initial);
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
    const state: WorkspaceState = { settingsState: { modId: 'aef' } };
    const extension = TestBed.inject(STATE_EXTENSION);
    const plan = extension.prepare({ modId: 'aef', params });
    expect(
      extension.preflight({ state, plan, data: rawData as unknown as ModData }),
    ).toEqual([]);
    const decoded = extension.decode({
      state,
      params,
      plan,
      data: rawData as unknown as ModData,
      hash: rawHash,
    });
    extension.commit(decoded.extension);

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

  it('rejects malformed extension declarations without changing visible objectives', () => {
    const policy = TestBed.inject(CALCULATION_EXTENSION);
    const declaration = (
      id: string,
      targetId: string,
    ): { owner: string; objective: ObjectiveState } => ({
      owner: resourceOwner('originium_ore'),
      objective: machineObjective(id, targetId),
    });
    const spy = spyOn(policy, 'derive');
    spy.and.returnValue([declaration('invalid', 'missing')]);
    expect(() => objectives.calculationContext()).toThrowError(
      /Unknown derived target/,
    );
    spy.and.returnValue([
      declaration('duplicate', 'originium_ore'),
      declaration('duplicate', 'originium_ore'),
    ]);
    settings.apply({ miningBonus: rational.one });
    expect(() => objectives.calculationContext()).toThrowError(
      /Duplicate derived objective ID/,
    );
    spy.and.returnValue([
      {
        ...declaration('bad-output', 'sewage-treat'),
        fixedOutput: { itemId: 'originium_ore', perSecond: rational.one },
      },
    ]);
    settings.apply({ miningBonus: rational(2) });
    expect(() => objectives.calculationContext()).toThrowError(
      /no positive adjusted output/,
    );
    expect(objectives.state()).toEqual({});
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
    expect(TestBed.inject(Title).getTitle()).toBe('源矿 | First title');
    translate.data.set({ 'app.name': '第二标题' });
    TestBed.tick();
    expect(TestBed.inject(Title).getTitle()).toBe('源矿 | 第二标题');
  });

  it('restores all six legacy supplies using complete detached mining and speed adjustments', () => {
    const initial = store.snapshot();
    const legacy: WorkspaceState = {
      objectivesState: Object.fromEntries(
        resourceIds.map((id, index) => [
          String(index + 1),
          {
            ...machineObjective(
              String(index + 1),
              resourceRecipes[id],
              rational(5),
            ),
            type: 12 as ObjectiveType,
            overclock: rational(150),
          },
        ]),
      ),
      settingsState: {
        modId: 'aef',
        miningBonus: rational(50),
        locationIds: new Set(['tundra', 'jinlong']),
      },
    };
    const extension = TestBed.inject(STATE_EXTENSION);
    const params = { v: '11' };
    const plan = extension.prepare({ modId: 'aef', params });
    const selected = extension.preflight({
      state: legacy,
      plan,
      data: rawData as unknown as ModData,
    });
    expect(selected).toEqual(['1', '2', '3', '4', '5', '6']);
    const preparedObjectives = TestBed.inject(
      WorkspacePreparation,
    ).prepareObjectives(
      legacy,
      rawData as unknown as ModData,
      rawHash,
      selected,
    );
    const decoded = extension.decode({
      state: legacy,
      params,
      plan,
      preparedObjectives,
      data: rawData as unknown as ModData,
      hash: rawHash,
    }).extension as EndfieldState;
    for (const id of resourceIds) {
      const recipe = rawData.recipes.find(
        (entry) => entry.id === resourceRecipes[id],
      )!;
      const miningFactor = recipe.flags?.includes('mining')
        ? rational(3, 2)
        : rational.one;
      const expected = rational(5)
        .mul(miningFactor)
        .mul(rational(3, 2))
        .div(rational(recipe.time));
      expect(decoded.resourceLimits.rates[id].eq(expected))
        .withContext(id)
        .toBeTrue();
      expect(decoded.resourceRecipeSettings[id]?.overclock?.eq(rational(150)))
        .withContext(id)
        .toBeTrue();
    }
    expect(objectives.state()).toEqual({});
    expect(store.snapshot()).toBe(initial);
  });

  it('prepares candidate physical output without reading live electric or recipe settings', () => {
    recipes.set({ originium_ore: { machineId: 'miner_2' } });
    settings.apply({ miningBonus: rational.zero });
    const initial = store.snapshot();
    const candidate: WorkspaceState = {
      settingsState: {
        modId: 'aef',
        miningBonus: rational(50),
        locationIds: new Set(['tundra', 'jinlong']),
      },
      objectivesState: {
        1: {
          ...machineObjective('1', 'originium_ore'),
          machineId: 'miner_3',
          overclock: rational(150),
        },
      },
    };
    const preparation = TestBed.inject(WorkspacePreparation);
    const snapshot = spyOn(store, 'snapshot').and.callThrough();
    store.set({ ...initial, electric: rational(2) });
    const first = preparation.prepareObjectives(
      candidate,
      rawData as unknown as ModData,
      rawHash,
      ['1'],
    );
    store.set({ ...initial, electric: rational(17) });
    const second = preparation.prepareObjectives(
      candidate,
      rawData as unknown as ModData,
      rawHash,
      ['1'],
    );
    expect(snapshot).not.toHaveBeenCalled();
    expect(first['1'].machineId).toBe('miner_3');
    expect(
      first['1'].recipe!.output['originium_ore'].eq(rational(3, 4)),
    ).toBeTrue();
    expect(second).toEqual(first);
    expect(recipes.state()['originium_ore'].machineId).toBe('miner_2');
    expect(settings.state().miningBonus?.isZero()).toBeTrue();
    expect(store.state().electric.eq(rational(17))).toBeTrue();
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
      store.updateRecipeField('originium_ore', 'machineId', machineId);
      store.updateRecipeField(
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
      expect(context.owners[supply.id]).toEqual({
        kind: 'extension',
        id: resourceOwner('originium_ore'),
      });
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
    objectives.set({ 1: machineObjective('1', 'sewage-treat') });
    expect(
      objectives.objectives()[0].recipe?.cost?.eq(rational(-30)),
    ).toBeTrue();
    objectives.set({
      1: { ...machineObjective('1', 'sewage-treat'), cost: rational.zero },
    });
    expect(objectives.objectives()[0].recipe?.cost?.isZero()).toBeTrue();
    const ordinary =
      recipes.adjustedDataset().adjustedRecipe['originium_ore'].cost!;
    store.set({ ...store.snapshot(), electric: rational(2) });
    const changed =
      recipes.adjustedDataset().adjustedRecipe['originium_ore'].cost!;
    expect(changed.gt(ordinary)).toBeTrue();
    expect(settings.settings().costs.factor.eq(rational.one)).toBeTrue();
  });

  it('updates ordinary, explicit and derived machine costs from the chosen base machine', () => {
    const initial = store.snapshot();
    store.set({
      ...initial,
      resourceLimits: {
        enabled: true,
        rates: { ...initial.resourceLimits.rates, originium_ore: rational.one },
      },
      resourceRecipeSettings: {
        originium_ore: { machineId: 'miner_3', overclock: rational(150) },
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
      expect(explicit.recipe!.cost).toEqual(rational(10).mul(electric));
      expect(derived.recipe!.cost).toEqual(rational(10).mul(electric));
      expect(explicit.machineId).toBe('miner_3');
      expect(derived.machineId).toBe('miner_3');
    }
    objectives.set({
      1: { ...machineObjective('1', 'originium_ore'), cost: rational(-3) },
    });
    store.updateRecipeField('originium_ore', 'cost', rational.zero);
    expect(objectives.objectives()[0].recipe!.cost).toEqual(rational(-3));
    expect(
      objectives
        .calculationContext()
        .objectives.find((o) => o.id === resourceObjectiveId('originium_ore'))!
        .recipe!.cost,
    ).toEqual(rational.zero);
  });

  it('preserves raw, override and recycling costs in both public adjustment paths', () => {
    const adjustment = TestBed.inject(Adjustment);
    const data = recipes.adjustedDataset();
    const recipeSettings = recipes.settings();
    const items = TestBed.inject(ItemsStore).settings();
    const machines = TestBed.inject(MachinesStore).settings();
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
      const objective = adjustment.adjustObjective(
        { ...machineObjective('1', id), cost: example.override },
        items,
        recipeSettings,
        machines,
        { ...settings.settings(), costs: costSettings },
        candidate,
      );
      expect(ordinary.cost)
        .withContext(`case ${index}`)
        .toEqual(example.expected);
      expect(objective.recipe!.cost)
        .withContext(`case ${index}`)
        .toEqual(example.expected);
    }
  });

  it('uses selected base machine usage and footprint in both adjustment paths', () => {
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
    expect(objective.recipe!.cost).toEqual(rational(250));
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
    const withoutFootprint = adjustment.adjustObjective(
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
    expect(ordinary.cost).toEqual(rational(200));
    expect(withoutFootprint.recipe!.cost).toEqual(rational(200));
  });

  it('keeps machine-less objective costs on the public adjustment path', () => {
    const id = 'originium_ore';
    const data = recipes.adjustedDataset();
    const candidate = {
      ...data,
      recipeRecord: {
        ...data.recipeRecord,
        [id]: {
          ...data.recipeRecord[id],
          producers: undefined,
          cost: undefined,
        },
      },
    };
    const adjust = (cost?: ReturnType<typeof rational>): ObjectiveSettings =>
      TestBed.inject(Adjustment).adjustObjective(
        { ...machineObjective('1', id), cost },
        TestBed.inject(ItemsStore).settings(),
        recipes.settings(),
        TestBed.inject(MachinesStore).settings(),
        settings.settings(),
        candidate,
      );
    const result = adjust();
    expect(result.machineId).toBeUndefined();
    expect(result.recipe!.cost).toEqual(settings.settings().costs.machine);
    expect(adjust(rational.zero).recipe!.cost).toEqual(rational.zero);
    expect(data.recipeRecord[id].producers).toBeDefined();
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

  it('routes recipe edits and check state to their resource owner without creating ordinary targets', () => {
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
    objectives.updateRecipeField(step, 'cost', rational.zero);
    expect(
      store.state().resourceRecipeSettings.originium_ore?.cost?.isZero(),
    ).toBeTrue();
    expect(objectives.state()).toEqual({});
    expect(
      objectives.stepsModified().objectives[
        resourceObjectiveId('originium_ore')
      ],
    ).toBeTrue();
    const presentation = TestBed.inject(PRESENTATION_EXTENSION);
    expect(presentation.toggleChecked(step, true)).toBeTrue();
    expect(presentation.checked(step)).toBeTrue();
    expect(settings.state().checkedObjectiveIds.size).toBe(0);
    presentation.clearChecked();
    expect(presentation.hasChecked()).toBeFalse();
    spyOn(presentation, 'owner').and.returnValue({
      kind: 'extension',
      id: 'unknown',
    });
    expect(() => {
      objectives.updateRecipeField(step, 'cost', rational.one);
    }).toThrowError('Unhandled extension recipe owner: unknown');
    expect(objectives.state()).toEqual({});
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
