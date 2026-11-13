import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { loadModule, Model } from 'glpk-ts';

import rawData from '/public/data/aef/data.json';
import rawHash from '/public/data/aef/hash.json';
import { Main } from '~/app/main/main';
import { ModData } from '~/data/schema/mod-data';
import { CALCULATION_EXTENSION } from '~/extensions/calculation-extension';
import { PRESENTATION_EXTENSION } from '~/extensions/presentation-extension';
import { STATE_EXTENSION, WorkspaceState } from '~/extensions/state-extension';
import { WorkspaceLifecycle } from '~/extensions/workspace-lifecycle';
import { WorkspacePreparation } from '~/extensions/workspace-preparation';
import { rational } from '~/rational/rational';
import { Step } from '~/solver/step';
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

  it('supports a declared-cost recipe without a selected producer at the pure cost boundary', () => {
    const data = recipes.adjustedDataset();
    expect(
      TestBed.inject(CALCULATION_EXTENSION)
        .cost({
          raw: data.recipeRecord['sewage-treat'],
          adjusted: data.adjustedRecipe['sewage-treat'],
          recipeSettings: {},
          settings: settings.settings(),
          data,
          extension: store.snapshot(),
        })
        ?.eq(rational(-30)),
    ).toBeTrue();
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
