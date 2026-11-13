import { TestBed } from '@angular/core/testing';
import { loadModule } from 'glpk-ts';

import rawData from '/public/data/aef/data.json';
import rawHash from '/public/data/aef/hash.json';
import { ModData } from '~/data/schema/mod-data';
import { ModHash } from '~/data/schema/mod-hash';
import { createEndfieldState } from '~/endfield/domain/model';
import { compileEndfieldRules } from '~/endfield/domain/rules';
import { provideEndfield } from '~/endfield/providers';
import { EndfieldStore } from '~/endfield/state/endfield-store';
import { CalculationVariable } from '~/extensions/calculation-extension';
import { STATE_EXTENSION } from '~/extensions/state-extension';
import { WorkspaceLifecycle } from '~/extensions/workspace-lifecycle';
import { Rational, rational } from '~/rational/rational';
import { GlpkResult } from '~/solver/glpk-result';
import { SimplexState } from '~/solver/simplex-state';
import { Solver } from '~/solver/solver';
import { Step } from '~/solver/step';
import { ObjectiveType } from '~/state/objectives/objective-type';
import { ObjectivesStore } from '~/state/objectives/objectives-store';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { Migration } from '~/state/router/migration';
import { RouterSync } from '~/state/router/router-sync';
import { SettingsStore } from '~/state/settings/settings-store';
import { TestModule } from '~/tests/test-module';

import golden from './fixtures/legacy-golden.json';

interface GoldenObjective {
  id: string;
  targetId: string;
  value: string;
  unit: number;
  type: number;
  machineId?: string;
}

interface GoldenNormal {
  originalCount: number;
  objectives: GoldenObjective[];
  locationIds: string[];
  excludedRecipeIds: string[];
  costs: Record<string, string>;
  displayRate: number;
  maximizeType: number;
  requireMachinesOutput: boolean;
  candidateSet: string;
  resourceEnabled: boolean;
  resourceRates: Record<string, number>;
  machineEnabled: boolean;
  machineLimit: number | null;
  transferEnabled: boolean;
  resultType: 'solved' | 'failed';
  status: GlpkResult['status'];
  returnCode: NonNullable<GlpkResult['returnCode']>;
  cost: number;
  power: number;
  recipes: Record<string, number>;
  items: Record<string, ItemMetrics>;
  material: Record<string, MaterialMetrics>;
}

interface ItemMetrics {
  items: number;
  output: number;
  surplus: number;
}

interface MaterialMetrics {
  produced: number;
  consumed: number;
}

interface Metrics {
  recipes: Record<string, number>;
  items: Record<string, ItemMetrics>;
  material: Record<string, MaterialMetrics>;
  power: number;
}

interface KnownDifference {
  code: 'unused-transfer-key-input-budget';
  oldReportedInputPerSecond: number;
  newExpectedActualInputPerSecond: number;
  newExpectedTransferBatches: number;
  normalizedInputAndLimitPerSecond: number;
}

interface RawRecipe {
  id: string;
  time: string;
  in: Record<string, string>;
  out: Record<string, string>;
  output: Record<string, string>;
  cost: string;
  producers: string[];
}

interface RawObjective {
  id: string;
  targetId: string;
  unit: number;
  type: number;
  value: string;
  recipe?: RawRecipe;
}

interface RawModel {
  objectives: RawObjective[];
  recipeObjectives: RawObjective[];
  steps: unknown[];
  recipes: Record<string, RawRecipe>;
  itemValues: Record<string, Record<string, string>>;
  recipeLimits: Record<string, string>;
  unproduceableIds: string[];
  excludedIds: string[];
  itemIds: string[];
  data: {
    modId: string;
    flags: string[];
    itemEntities: Record<string, { id: string }>;
    itemAvailableIoRecipeIds: Record<string, string[]>;
  };
  costs: Record<string, string>;
  maximizeType: number;
  requireMachinesOutput: boolean;
  hasSurplusCost: boolean;
}

function rationalRecord(
  record: Record<string, string>,
): Record<string, Rational> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, rational(value)]),
  );
}

function hydrateRecipe(recipe: RawRecipe): object {
  return {
    ...recipe,
    time: rational(recipe.time),
    in: rationalRecord(recipe.in),
    out: rationalRecord(recipe.out),
    output: rationalRecord(recipe.output),
    cost: rational(recipe.cost),
  };
}

/** Same recorded synthetic matrix as the old solver, with new Endfield rules. */
function runRecordedModel(id: string, raw: RawModel): GlpkResult {
  const recipes = Object.fromEntries(
    Object.entries(raw.recipes).map(([key, recipe]) => [
      key,
      hydrateRecipe(recipe),
    ]),
  );
  const recipeObjectives = raw.recipeObjectives.map((objective) => ({
    ...objective,
    value: rational(objective.value),
    recipe:
      objective.recipe == null ? undefined : hydrateRecipe(objective.recipe),
    machineId: objective.recipe?.producers[0],
  }));
  const machineLimit = raw.objectives.find(
    (objective) => objective.type === 13,
  );
  const base = createEndfieldState();
  const extension = {
    ...base,
    machineLimits: {
      enabled: machineLimit != null,
      limits: { xiranite_oven_1: rational(machineLimit?.value ?? '12') },
    },
    transfer: { enabled: id.includes('transfer'), source: 'tundra' as const },
  };
  const state = {
    ...raw,
    objectives: raw.objectives.map((objective) => ({
      ...objective,
      value: rational(objective.value),
    })),
    recipeObjectives,
    recipes,
    itemValues: Object.fromEntries(
      Object.entries(raw.itemValues).map(([key, values]) => [
        key,
        rationalRecord(values),
      ]),
    ),
    recipeLimits: rationalRecord(raw.recipeLimits),
    unproduceableIds: new Set(raw.unproduceableIds),
    excludedIds: new Set(raw.excludedIds),
    costs: rationalRecord(raw.costs),
    data: {
      ...raw.data,
      flags: new Set(raw.data.flags),
      itemRecord: raw.data.itemEntities,
    },
    glpkAlgorithm: 'simplex',
    modelContext: {
      recipeSettings: Object.fromEntries(
        Object.entries(raw.recipes).map(([key, recipe]) => [
          key,
          { machineId: recipe.producers[0] },
        ]),
      ),
      compile: (variables: readonly CalculationVariable[]) =>
        compileEndfieldRules(extension, variables),
    },
  } as unknown as SimplexState;
  const solver = TestBed.inject(Solver) as unknown as {
    glpk(value: SimplexState): GlpkResult;
  };
  return solver.glpk(state);
}

const data = rawData as unknown as ModData;
const hash = rawHash as unknown as ModHash;
const ABS_TOLERANCE = 1e-7;
const REL_TOLERANCE = 1e-7;

function metrics(steps: Step[]): Metrics {
  const result: Metrics = { recipes: {}, items: {}, material: {}, power: 0 };
  for (const step of steps) {
    result.power += step.power?.toNumber() ?? 0;
    if (step.itemId != null) {
      result.items[step.itemId] = {
        items: step.items?.toNumber() ?? 0,
        output: step.output?.toNumber() ?? 0,
        surplus: step.surplus?.toNumber() ?? 0,
      };
    }
    if (step.recipeId == null || step.machines == null || step.recipe == null)
      continue;
    const count = step.machines.toNumber();
    result.recipes[step.recipeId] =
      (result.recipes[step.recipeId] ?? 0) + count;
    const amount = count / step.recipe.time.toNumber();
    for (const [kind, key] of [
      ['in', 'consumed'],
      ['out', 'produced'],
    ] as const) {
      for (const [item, value] of Object.entries(step.recipe[kind])) {
        if (value == null) continue;
        const entry = (result.material[item] ??= { produced: 0, consumed: 0 });
        entry[key] += value.toNumber() * amount;
      }
    }
  }
  return result;
}

function expectClose(actual: number, expected: number, field: string): void {
  const difference = Math.abs(actual - expected);
  const allowed =
    ABS_TOLERANCE +
    REL_TOLERANCE * Math.max(Math.abs(actual), Math.abs(expected));
  expect(Number.isFinite(actual) && difference <= allowed)
    .withContext(
      `${field}: actual=${actual}, old=${expected}, allowed=${allowed}`,
    )
    .toBeTrue();
}

function expectRecord(
  actual: Record<string, number>,
  expected: Record<string, number>,
  label: string,
): void {
  for (const id of new Set([...Object.keys(actual), ...Object.keys(expected)]))
    expectClose(actual[id] ?? 0, expected[id] ?? 0, `${label}.${id}`);
}

function compareMetrics(
  actual: Metrics,
  expected: GoldenNormal,
  knownDifference: KnownDifference | null,
): void {
  expectClose(actual.power, expected.power, 'power');
  expectRecord(actual.recipes, expected.recipes, 'recipes');
  for (const id of new Set([
    ...Object.keys(actual.items),
    ...Object.keys(expected.items),
  ])) {
    for (const field of ['items', 'output', 'surplus'] as const) {
      if (
        id === 'domain_key_tundra' &&
        field === 'items' &&
        knownDifference?.code === 'unused-transfer-key-input-budget'
      ) {
        expectClose(
          expected.items[id]?.items ?? 0,
          knownDifference.oldReportedInputPerSecond,
          'legacy unused transfer input upper bound',
        );
        expectClose(
          actual.items[id]?.items ?? 0,
          knownDifference.newExpectedActualInputPerSecond,
          'actual unused transfer input',
        );
        continue;
      }
      expectClose(
        actual.items[id]?.[field] ?? 0,
        expected.items[id]?.[field] ?? 0,
        `items.${id}.${field}`,
      );
    }
  }
  for (const id of new Set([
    ...Object.keys(actual.material),
    ...Object.keys(expected.material),
  ])) {
    for (const field of ['produced', 'consumed'] as const)
      expectClose(
        actual.material[id]?.[field] ?? 0,
        expected.material[id]?.[field] ?? 0,
        `material.${id}.${field}`,
      );
  }
}

describe('Old Endfield UserTips through the real new calculation pipeline', () => {
  let router: RouterSync;
  let settings: SettingsStore;
  let objectives: ObjectivesStore;
  let endfield: EndfieldStore;
  let lifecycle: WorkspaceLifecycle;

  beforeAll(async () => {
    await loadModule('glpk.all.wasm');
  });

  beforeEach(() => {
    localStorage.removeItem('router');
    localStorage.removeItem('preferences');
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        ...provideEndfield(),
        { provide: SettingsStore, useClass: SettingsStore },
      ],
    });
    settings = TestBed.inject(SettingsStore);
    settings.apply({ modId: 'aef' });
    settings['modDataResource'].set(data);
    settings['modHashResource'].set(hash);
    TestBed.inject(PreferencesStore).apply({
      paused: false,
      glpkAlgorithm: 'simplex',
    });
    router = TestBed.inject(RouterSync);
    objectives = TestBed.inject(ObjectivesStore);
    endfield = TestBed.inject(EndfieldStore);
    lifecycle = TestBed.inject(WorkspaceLifecycle);
  });

  afterEach(() => {
    localStorage.removeItem('router');
    localStorage.removeItem('preferences');
  });

  async function restore(url: string): Promise<void> {
    const query = url.slice(url.indexOf('?') + 1);
    const ticket = lifecycle.begin(url);
    const unpacked = await router.unzipQueryParams(router.toParams(query));
    const plan = TestBed.inject(STATE_EXTENSION).prepare({
      modId: 'aef',
      params: unpacked,
    });
    const migrated = TestBed.inject(Migration).migrate(
      plan.modId,
      plan.params,
      plan.legacyModHashes,
    );
    router.updateState(
      migrated.modId,
      migrated.params,
      migrated.isBare,
      data,
      hash,
      plan,
      ticket,
    );
    expect(lifecycle.ready())
      .withContext(JSON.stringify(lifecycle.diagnostics()))
      .toBeTrue();
  }

  for (const fixture of golden.cases.filter((entry) => entry.id !== 'G03')) {
    it(`${fixture.id} restores old inputs and compares the resulting model`, async () => {
      const expected = fixture.expected as unknown as GoldenNormal;
      await restore(fixture.url);
      const ordinary = Object.values(objectives.state());
      expect(ordinary.length).toBe(expected.originalCount);
      for (const [index, old] of expected.objectives
        .filter((entry) => entry.type <= 3)
        .entries()) {
        const actual = ordinary[index];
        expect(actual?.targetId)
          .withContext(`objective ${old.id}`)
          .toBe(old.targetId);
        expect(actual?.type).withContext(`objective ${old.id}`).toBe(old.type);
        expect(actual?.unit).withContext(`objective ${old.id}`).toBe(old.unit);
        expect(actual?.machineId)
          .withContext(`objective ${old.id}`)
          .toBe(old.machineId);
        expectClose(
          actual?.value.toNumber() ?? NaN,
          rational(old.value).toNumber(),
          `objective.${old.id}.value`,
        );
      }

      const effective = settings.settings();
      expect([...effective.locationIds].sort()).toEqual(
        [...expected.locationIds].sort(),
      );
      expect([...effective.excludedRecipeIds].sort()).toEqual(
        [...expected.excludedRecipeIds].sort(),
      );
      const candidate = (
        golden.candidates as Record<
          string,
          { recipes: string[]; items: string[] }
        >
      )[expected.candidateSet];
      expect([...effective.availableRecipeIds].sort()).toEqual(
        [...candidate.recipes].sort(),
      );
      expect([...effective.availableItemIds].sort()).toEqual(
        [...candidate.items].sort(),
      );
      expect(effective.displayRate).toBe(expected.displayRate);
      expect(effective.maximizeType).toBe(expected.maximizeType);
      expect(effective.requireMachinesOutput).toBe(
        expected.requireMachinesOutput,
      );
      const extension = endfield.state();
      expect(extension.resourceLimits.enabled).toBe(expected.resourceEnabled);
      expect(extension.machineLimits.enabled).toBe(expected.machineEnabled);
      expect(extension.transfer.enabled).toBe(expected.transferEnabled);
      for (const [id, rate] of Object.entries(extension.resourceLimits.rates))
        expectClose(
          rate.toNumber(),
          expected.resourceRates[id],
          `resource.${id}`,
        );
      if (expected.machineEnabled)
        expectClose(
          extension.machineLimits.limits['xiranite_oven_1'].toNumber(),
          expected.machineLimit!,
          'machine.limit',
        );
      expectClose(
        extension.electric.toNumber(),
        rational(expected.costs['electric']).toNumber(),
        'cost.electric',
      );
      for (const [key, value] of Object.entries(effective.costs))
        expectClose(
          value.toNumber(),
          rational(expected.costs[key]).toNumber(),
          `cost.${key}`,
        );

      const context = objectives.calculationContext();
      const solver = TestBed.inject(Solver);
      const glpk = spyOn<any>(solver, 'glpk').and.callThrough();
      const result = objectives.matrixResult();
      const glpkResult = glpk.calls.mostRecent()?.returnValue as
        | GlpkResult
        | undefined;
      const actual = metrics(result.steps);
      console.info(
        `[golden] ${fixture.id} ${JSON.stringify({ resultType: result.resultType, status: glpkResult?.status, returnCode: glpkResult?.returnCode, cost: result.cost?.toNumber(), ordinary, actual, derived: context.objectives.filter((objective) => objective.id.startsWith('ef:')).map(({ id, targetId, value }) => ({ id, targetId, value })) })}`,
      );
      expect(result.resultType).toBe(expected.resultType);
      expect(glpkResult?.status).toBe(expected.status);
      expect(glpkResult?.returnCode).toBe(expected.returnCode);
      if (expected.resultType === 'solved') {
        const knownDifference =
          fixture.knownDifference as KnownDifference | null;
        if (knownDifference != null) {
          const transfer = context.normalized.filter(
            (objective) => objective.targetId === 'domain_key_tundra',
          );
          for (const type of [ObjectiveType.Input, ObjectiveType.Limit]) {
            const selected = transfer.filter(
              (objective) => objective.type === type,
            );
            expect(selected.length).toBe(1);
            expect(selected[0]?.value.eq(rational(1, 3600))).toBeTrue();
            expectClose(
              selected[0]?.value.toNumber() ?? NaN,
              knownDifference.normalizedInputAndLimitPerSecond,
              `transfer.normalized.${type}`,
            );
          }
          const usedBatches = Object.entries(actual.recipes)
            .filter(([id]) => id.startsWith('transfer_'))
            .reduce((sum, [, count]) => sum + count, 0);
          expectClose(
            usedBatches,
            knownDifference.newExpectedTransferBatches,
            'transfer.usedBatches',
          );
          expectClose(
            actual.material['domain_key_tundra']?.consumed ?? 0,
            knownDifference.newExpectedActualInputPerSecond,
            'transfer.actualConsumed',
          );
        }
        // The old implementation reports LP objective values on its MIP path.
        if (!expected.machineEnabled && !expected.transferEnabled)
          expectClose(result.cost?.toNumber() ?? NaN, expected.cost, 'cost');
        compareMetrics(actual, expected, knownDifference);
        expect(objectives.steps().length).toBeGreaterThan(0);
      } else expect(result.steps).toEqual([]);
    });
  }

  it('G03 keeps the four-machine retired recipe through the documented alias', async () => {
    const fixture = golden.cases[2];
    const expected = fixture.expected as unknown as {
      originalCount: number;
      objectives: GoldenObjective[];
      restoredAlias: { old: string; new: string; machines: number };
    };
    await restore(fixture.url);
    const ordinary = Object.values(objectives.state());
    expect(ordinary.length).toBe(expected.originalCount);
    for (const [index, old] of expected.objectives.entries()) {
      const current = ordinary[index];
      const target =
        old.unit === 3 && old.targetId === expected.restoredAlias.old
          ? expected.restoredAlias.new
          : old.targetId;
      expect(current?.targetId)
        .withContext(`G03 objective ${old.id}`)
        .toBe(target);
      expect(current?.type)
        .withContext(`G03 objective ${old.id}`)
        .toBe(old.type);
      expect(current?.unit)
        .withContext(`G03 objective ${old.id}`)
        .toBe(old.unit);
      expect(current?.machineId)
        .withContext(`G03 objective ${old.id}`)
        .toBe(old.machineId);
      expectClose(
        current?.value.toNumber() ?? NaN,
        rational(old.value).toNumber(),
        `G03 objective.${old.id}.value`,
      );
    }
    const objective = ordinary.find(
      (entry) => entry.targetId === expected.restoredAlias.new,
    );
    expect(objective).toBeDefined();
    expect(
      objective?.value.eq(rational(expected.restoredAlias.machines)),
    ).toBeTrue();
    const context = objectives.calculationContext();
    expect(
      context.objectives.some((entry) => entry.id === objective?.id),
    ).toBeTrue();
    const solver = TestBed.inject(Solver);
    const glpk = spyOn<any>(solver, 'glpk').and.callThrough();
    const result = objectives.matrixResult();
    const glpkResult = glpk.calls.mostRecent()?.returnValue as
      | GlpkResult
      | undefined;
    console.info(
      `[golden] G03 ${JSON.stringify({ resultType: result.resultType, status: glpkResult?.status, returnCode: glpkResult?.returnCode, objective, diagnostics: lifecycle.diagnostics(), cost: result.cost?.toNumber() })}`,
    );
    expect(result.resultType).toBe('solved');
    expect(glpkResult?.returnCode).toBe('ok');
    expect(glpkResult?.status).toBe('optimal');
  });

  for (const fixture of golden.counterexamples) {
    it(`${fixture.id} corrects the recorded old synthetic matrix`, () => {
      const raw = fixture.input as unknown as RawModel;
      const old = fixture.oldOutput as unknown as {
        status: string;
        returnCode: string;
        recipes: Record<string, string>;
        surplus: Record<string, string>;
        cost: string;
      };
      const oldObjectives = fixture.oldRecipeObjectives as RawObjective[];
      const result = runRecordedModel(fixture.id, raw);
      console.info(
        `[golden-model] ${fixture.id} ${JSON.stringify({ old, oldObjectives, result })}`,
      );
      expect(old.status).toBe('optimal');
      expect(old.returnCode).toBe('ok');
      switch (fixture.id) {
        case 'G07-transfer-only':
          expectClose(
            rational(old.recipes['transfer_tundra_bottled_food_1']).toNumber(),
            0.5,
            'old transfer batch',
          );
          expect(result.error).toBeFalse();
          expect(result.status).toBe('optimal');
          expectClose(
            result.recipes['transfer_tundra_bottled_food_1']?.toNumber() ?? 0,
            1,
            'new transfer batch',
          );
          expectClose(
            result.surplus['bottled_food_1']?.toNumber() ?? 0,
            1 / 48,
            'new transfer surplus',
          );
          expectClose(
            result.cost.toNumber(),
            49 / 48,
            'new transfer integer cost',
          );
          break;
        case 'G07-water-only':
          expectClose(
            rational(old.recipes['sewage-treat']).toNumber(),
            10,
            'old water',
          );
          expect(result.error).toBeFalse();
          expect(result.status).toBe('optimal');
          expectClose(
            result.recipes['sewage-treat']?.toNumber() ?? 0,
            3,
            'new water',
          );
          expectClose(result.cost.toNumber(), -90, 'new water cost');
          break;
        case 'G07-water-export-only':
          expectClose(
            rational(old.recipes['sewage-treat-export']).toNumber(),
            10,
            'old water export',
          );
          expect(result.error).toBeFalse();
          expect(result.status).toBe('optimal');
          expectClose(
            result.recipes['sewage-treat-export']?.toNumber() ?? 0,
            1,
            'new water export',
          );
          expectClose(result.cost.toNumber(), -49.8, 'new water export cost');
          break;
        case 'G07-water-explicit':
          expectClose(
            rational(oldObjectives[0].value).toNumber(),
            4,
            'old explicit water',
          );
          expect(result.error).toBeTrue();
          expect(result.status).toBe('no_feasible');
          break;
        case 'G07-transfer-explicit-with-mip':
          expectClose(
            rational(oldObjectives[0].value).toNumber(),
            0.5,
            'old explicit transfer',
          );
          expect(result.error).toBeTrue();
          expect(result.status).toBe('no_feasible');
          break;
        case 'G07-mip-cost':
          expectClose(rational(old.cost).toNumber(), 0.5, 'old LP cost');
          expect(result.error).toBeFalse();
          expect(result.status).toBe('optimal');
          expectClose(
            result.recipes['synthetic_oven_recipe']?.toNumber() ?? 0,
            1,
            'new oven count',
          );
          expectClose(
            result.surplus['synthetic_product']?.toNumber() ?? 0,
            0.5,
            'new oven surplus',
          );
          expectClose(result.cost.toNumber(), 1.5, 'new integer cost');
          break;
        default:
          fail(`Unknown recorded model ${fixture.id}`);
      }
    });
  }
});

describe('Legacy preferences against the real Endfield product', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [...provideEndfield()],
    });
    spyOn(console, 'warn');
  });

  afterEach(() => {
    localStorage.clear();
  });

  for (const fixture of golden.legacyPreferences) {
    it(`${fixture.id} preserves recoverable old input and router`, () => {
      localStorage.setItem('preferences', fixture.input.preferences);
      localStorage.setItem('router', fixture.input.router);
      const preferences = TestBed.inject(PreferencesStore);
      TestBed.tick();
      expect(localStorage.getItem('router')).toBe(fixture.input.router);
      expect(localStorage.getItem('preferences.recovery')).toBe(
        fixture.input.preferences,
      );
      if (fixture.id === 'G08-valid') {
        expect(fixture.oldTheme).toBe('black');
        expect(preferences.theme()).toBe('dark');
        expect(preferences.states()).toEqual(
          fixture.oldStates as unknown as Record<
            string,
            Record<string, string>
          >,
        );
        expect(preferences.columns().items.show).toBeFalse();
        expect(preferences.columns().items.precision).toBe(2);
        expect(preferences.language()).toBe('zh');
      } else {
        expect(fixture.oldOriginalPreserved).toBeFalse();
        expect(preferences.migrationWarnings.length).toBeGreaterThan(0);
        expect(preferences.states()).toEqual({});
      }
      console.info(
        `[golden-preferences] ${fixture.id} ${JSON.stringify({ oldTheme: fixture.oldTheme, oldOriginalPreserved: fixture.oldOriginalPreserved, newTheme: preferences.theme(), states: preferences.states(), warnings: preferences.migrationWarnings, router: localStorage.getItem('router'), recovered: localStorage.getItem('preferences.recovery') === fixture.input.preferences })}`,
      );
    });
  }
});
