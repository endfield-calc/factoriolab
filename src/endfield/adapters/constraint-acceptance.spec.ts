import { TestBed } from '@angular/core/testing';
import { loadModule } from 'glpk-ts';

import rawData from '/public/data/aef/data.json';
import rawHash from '/public/data/aef/hash.json';
import { ModData } from '~/data/schema/mod-data';
import { CALCULATION_EXTENSION } from '~/extensions/calculation-extension';
import { rational } from '~/rational/rational';
import { SimplexResult } from '~/solver/simplex-result';
import { Step } from '~/solver/step';
import { ItemsStore } from '~/state/items/items-store';
import { ObjectiveState } from '~/state/objectives/objective';
import { ObjectiveType } from '~/state/objectives/objective-type';
import { ObjectiveUnit } from '~/state/objectives/objective-unit';
import { ObjectivesStore } from '~/state/objectives/objectives-store';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { SettingsStore } from '~/state/settings/settings-store';
import { TestModule } from '~/tests/test-module';

import {
  createEndfieldState,
  ovenId,
  resourceIds,
  resourceObjectiveId,
} from '../domain/model';
import { provideEndfield } from '../providers';
import { EndfieldCoordinator } from '../state/coordinator';
import { EndfieldStore } from '../state/endfield-store';

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
        ...provideEndfield(),
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
    objectives = TestBed.inject(ObjectivesStore);
    extension = TestBed.inject(EndfieldStore);
    preferences = TestBed.inject(PreferencesStore);
    preferences.apply({ paused: false, glpkAlgorithm: 'simplex' });
  });

  function result(label: string): SimplexResult {
    const value = objectives.matrixResult();
    console.info(
      '[remaining-constraint]',
      label,
      JSON.stringify({
        resultType: value.resultType,
        status: value.simplexStatus,
        steps: value.steps.map((s) => ({
          id: s.id,
          item: s.itemId,
          recipe: s.recipeId,
          obj: s.recipeObjectiveId,
          machine: s.recipeSettings?.machineId,
          n: s.machines?.toNumber(),
          items: s.items?.toNumber(),
          surplus: s.surplus?.toNumber(),
          belts: s.belts?.toNumber(),
        })),
      }),
    );
    return value;
  }

  it('A08 solves originium alone, preserving 560/min, 28 miners and surplus', () => {
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
      1: objective('1', 'originium_ore', 60, ObjectiveUnit.Items),
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
    expect(supply.value.eq(rational(28))).toBeTrue();
    for (const id of resourceIds.filter((id) => id !== 'originium_ore'))
      expect(
        context.objectives
          .find((o) => o.id === `ef:limit:${id}`)
          ?.value.isZero(),
      )
        .withContext(id)
        .toBeTrue();
    const solved = result('A08-originium');
    expect(solved.resultType).toBe('solved');
    close(count(solved.steps, 'originium_ore'), 28);
    const ore = objectives.steps().find((s) => s.itemId === 'originium_ore')!;
    close(ore.items!.toNumber(), 560);
    close(ore.surplus!.toNumber(), 500);
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
    ).toEqual(['copper_ore-liquid_water', 'gas_xiranite', 'gas_inert']);
    const solved = result('A08-copper-gases');
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
    close(
      copper
        .machines!.mul(copper.recipe!.in['__miner_water']!)
        .div(copper.recipe!.time)
        .toNumber() * 60,
      510,
    );
    close(
      objectives
        .steps()
        .find((s) => s.itemId === '__miner_water')!
        .items!.toNumber(),
      510,
    );
    expect(
      solved.steps.filter((s) =>
        s.recipeObjectiveId?.startsWith('ef:resource:'),
      ).length,
    ).toBe(3);
  });

  it('A10 charges ordinary, explicit and fractional exception to one actual-oven budget', () => {
    const excluded = data.recipes
      .filter(
        (r) =>
          r.out?.['xiranite_powder'] && r.id !== 'xiranite_powder-carbon_enr',
      )
      .map((r) => r.id);
    settings.apply({ excludedRecipeIds: new Set(excluded) });
    objectives.set({
      1: objective('1', 'xiranite_powder', 90, ObjectiveUnit.Items),
      2: objective('2', 'xiranite_powder-carbon_enr', 1),
      3: objective('3', 'xiranite_enr_powder', 0.5),
    });
    const state = createEndfieldState();
    extension.set({
      ...state,
      machineLimits: { enabled: true, limits: { [ovenId]: rational(4) } },
    });
    expect(result('A10-cap4').resultType).toBe('failed');
    extension.set({
      ...state,
      machineLimits: { enabled: true, limits: { [ovenId]: rational(9, 2) } },
    });
    const solved = result('A10-cap4.5');
    expect(solved.resultType).toBe('solved');
    const steps = objectives.steps();
    const normal = steps.find(
      (s) =>
        s.recipeId === 'xiranite_powder-carbon_enr' &&
        s.recipeObjectiveId == null,
    )!;
    const explicit = steps.find((s) => s.recipeObjectiveId === '2')!;
    const exception = steps.find((s) => s.recipeObjectiveId === '3')!;
    expect(normal.recipeSettings?.machineId).toBe(ovenId);
    expect(explicit.recipeSettings?.machineId).toBe(ovenId);
    expect(exception.recipeSettings?.machineId).toBe(ovenId);
    close(normal.machines!.toNumber(), 3);
    close(explicit.machines!.toNumber(), 1);
    close(exception.machines!.toNumber(), 0.5);
    close(
      normal
        .machines!.add(explicit.machines!)
        .add(exception.machines!)
        .toNumber(),
      4.5,
    );
    extension.set({
      ...state,
      machineLimits: { enabled: true, limits: { [ovenId]: rational(12) } },
    });
    const twelve = result('A10-cap12');
    expect(twelve.resultType).toBe('solved');
    close(
      count(twelve.steps, 'xiranite_powder-carbon_enr') +
        count(twelve.steps, 'xiranite_enr_powder'),
      4.5,
    );
    extension.set({
      ...state,
      machineLimits: { enabled: true, limits: { [ovenId]: rational.zero } },
    });
    expect(result('A10-cap0').resultType).toBe('failed');
    extension.set({
      ...state,
      machineLimits: { enabled: false, limits: { [ovenId]: rational.zero } },
    });
    const disabled = result('A10-disabled');
    expect(disabled.resultType).toBe('solved');
    expect(count(disabled.steps, 'xiranite_powder-carbon_enr')).toBeGreaterThan(
      0,
    );
  });

  it('A10 does not charge the alternative producer to a zero oven budget', () => {
    const excluded = data.recipes
      .filter(
        (r) =>
          r.out?.['xiranite_powder'] &&
          r.id !== 'phase_trans_2-xiranite_powder',
      )
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
    const solved = result('A10-other-machine');
    expect(solved.resultType).toBe('solved');
    const step = objectives
      .steps()
      .find((s) => s.recipeId === 'phase_trans_2-xiranite_powder')!;
    expect(step.recipeSettings?.machineId).toBe('phase_trans_2');
    expect(step.machines!.gt(rational.zero)).toBeTrue();
    expect(
      objectives.steps().filter((s) => s.recipeSettings?.machineId === ovenId)
        .length,
    ).toBe(0);
  });

  for (const algorithm of ['simplex', 'exact'] as const) {
    it(`A11 ${algorithm} rounds the same half transfer and rejects an explicit half batch`, () => {
      preferences.apply({ glpkAlgorithm: algorithm });
      const state = createEndfieldState();
      extension.set({
        ...state,
        transfer: { enabled: true, source: 'tundra' },
      });
      const excluded = data.recipes
        .filter(
          (r) => r.out?.['carbon_enr'] && r.id !== 'transfer_tundra_carbon_enr',
        )
        .map((r) => r.id);
      settings.apply({ excludedRecipeIds: new Set(excluded) });
      objectives.set({
        1: objective('1', 'carbon_enr', 12.5, ObjectiveUnit.Items),
      });
      const solved = result(`A11-${algorithm}-half`);
      expect(solved.resultType).toBe('solved');
      expect(extension.snapshot().machineLimits.enabled).toBeFalse();
      close(count(solved.steps, 'transfer_tundra_carbon_enr'), 1);
      close(
        solved.steps
          .filter((s) => s.recipeId?.startsWith('transfer_tundra_'))
          .reduce((sum, s) => sum + (s.machines?.toNumber() ?? 0), 0),
        1,
      );
      close(
        solved.steps
          .find((s) => s.itemId === 'domain_key_tundra')!
          .items!.toNumber(),
        1 / 3600,
      );
      const carbon = objectives.steps().find((s) => s.itemId === 'carbon_enr')!;
      close(carbon.items!.toNumber(), 25);
      close(carbon.surplus!.toNumber(), 12.5);
      objectives.set({ 1: objective('1', 'transfer_tundra_carbon_enr', 0.5) });
      expect(result(`A11-${algorithm}-explicit`).resultType).toBe('failed');
      extension.set({
        ...state,
        transfer: { enabled: false, source: 'tundra' },
      });
      objectives.set({
        1: objective('1', 'carbon_enr', 12.5, ObjectiveUnit.Items),
      });
      expect(result(`A11-${algorithm}-disabled`).resultType).toBe('failed');
      settings.apply({ excludedRecipeIds: new Set() });
      const alternate = result(`A11-${algorithm}-disabled-alternate`);
      expect(alternate.resultType).toBe('solved');
      close(count(alternate.steps, 'transfer_tundra_carbon_enr'), 0);
      close(
        objectives
          .steps()
          .find((s) => s.itemId === 'carbon_enr')!
          .output!.toNumber(),
        12.5,
      );
    });
  }

  it('A12 shares water nodes, supports fractional use and disabling/restoring them without an oven cap', () => {
    const coordinator = TestBed.inject(EndfieldCoordinator);
    settings.apply({ excludedRecipeIds: new Set(['carbon_enr']) });
    objectives.set({
      1: objective('1', 'sewage-treat', 1.5),
      2: objective('2', 'sewage-treat-export', 0.5),
    });
    expect(extension.snapshot().machineLimits.enabled).toBeFalse();
    const solved = result('A12-both-boundary');
    expect(solved.resultType).toBe('solved');
    close(count(solved.steps, 'sewage-treat', '1'), 1.5);
    close(count(solved.steps, 'sewage-treat-export', '2'), 0.5);
    objectives.set({
      1: objective('1', 'sewage-treat', 3),
      2: objective('2', 'sewage-treat-export', 0.1),
    });
    expect(result('A12-overlap').resultType).toBe('failed');
    const compile = spyOn(
      TestBed.inject(CALCULATION_EXTENSION),
      'rules',
    ).and.callThrough();
    settings.apply({
      excludedRecipeIds: new Set(['carbon_enr', 'sewage-treat-export']),
    });
    objectives.set({ 1: objective('1', 'sewage-treat', 3) });
    const sparseX = result('A12-x-sparse');
    expect(sparseX.resultType).toBe('solved');
    close(count(sparseX.steps, 'sewage-treat'), 3);
    close(count(sparseX.steps, 'sewage-treat-export'), 0);
    expect(
      compile.calls
        .mostRecent()
        .args[1].some((v) => v.recipeId === 'sewage-treat-export'),
    ).toBeFalse();
    expect(
      compile.calls
        .mostRecent()
        .args[1].some((v) => v.recipeId === 'sewage-treat'),
    ).toBeTrue();
    objectives.set({ 1: objective('1', 'sewage-treat', 3.1) });
    expect(result('A12-x-sparse-over').resultType).toBe('failed');
    settings.apply({
      excludedRecipeIds: new Set(['carbon_enr', 'sewage-treat']),
    });
    objectives.set({ 1: objective('1', 'sewage-treat-export', 1) });
    const sparseY = result('A12-y-sparse');
    expect(sparseY.resultType).toBe('solved');
    close(count(sparseY.steps, 'sewage-treat'), 0);
    close(count(sparseY.steps, 'sewage-treat-export'), 1);
    expect(
      compile.calls
        .mostRecent()
        .args[1].some((v) => v.recipeId === 'sewage-treat'),
    ).toBeFalse();
    expect(
      compile.calls
        .mostRecent()
        .args[1].some((v) => v.recipeId === 'sewage-treat-export'),
    ).toBeTrue();
    objectives.set({ 1: objective('1', 'sewage-treat-export', 1.1) });
    expect(result('A12-y-sparse-over').resultType).toBe('failed');
    settings.apply({ excludedRecipeIds: new Set(['carbon_enr']) });
    objectives.set({ 1: objective('1', 'sewage-treat-export', 1) });
    expect(
      coordinator.dispatch({ type: 'waterDisabled', disabled: true }),
    ).toBeTrue();
    expect(settings.settings().excludedRecipeIds.has('carbon_enr')).toBeTrue();
    expect(
      settings.settings().excludedRecipeIds.has('sewage-treat'),
    ).toBeTrue();
    expect(
      settings.settings().excludedRecipeIds.has('sewage-treat-export'),
    ).toBeTrue();
    // Recipe exclusions govern automatic selection. Existing explicit recipe
    // objectives are preserved by the upstream objective contract.
    expect(result('A12-disabled-explicit').resultType).toBe('solved');
    objectives.set({
      1: objective('1', 'sewage-treat', 3),
      2: objective('2', 'sewage-treat-export', 0.1),
    });
    expect(result('A12-disabled-explicit-overlap').resultType).toBe('failed');
    objectives.set({ 1: objective('1', 'sewage-treat-export', 1) });
    expect(
      coordinator.dispatch({ type: 'waterDisabled', disabled: false }),
    ).toBeTrue();
    expect(settings.settings().excludedRecipeIds.has('carbon_enr')).toBeTrue();
    expect(
      settings.settings().excludedRecipeIds.has('sewage-treat'),
    ).toBeFalse();
    expect(
      settings.settings().excludedRecipeIds.has('sewage-treat-export'),
    ).toBeFalse();
    expect(result('A12-restored').resultType).toBe('solved');
  });

  it('A12 makes an automatic node compete with an explicit node and toggles automatic use', () => {
    const coordinator = TestBed.inject(EndfieldCoordinator);
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
    const combined = result('A12-auto-explicit');
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
    const enabled = result('A12-auto-enabled');
    expect(enabled.resultType).toBe('solved');
    close(count(enabled.steps, 'sewage-treat-export'), 1);
    close(count(enabled.steps, 'sewage-treat'), 0);
    expect(
      coordinator.dispatch({ type: 'waterDisabled', disabled: true }),
    ).toBeTrue();
    const disabled = result('A12-auto-disabled');
    expect(disabled.resultType).toBe('solved');
    close(count(disabled.steps, 'sewage-treat-export'), 0);
    close(count(disabled.steps, 'sewage-treat'), 0);
    expect(
      coordinator.dispatch({ type: 'waterDisabled', disabled: false }),
    ).toBeTrue();
    const restored = result('A12-auto-restored');
    expect(restored.resultType).toBe('solved');
    close(count(restored.steps, 'sewage-treat-export'), 1);
    expect(settings.settings().excludedRecipeIds.has('carbon_enr')).toBeTrue();
    expect(extension.snapshot().machineLimits.enabled).toBeFalse();
  });
});
