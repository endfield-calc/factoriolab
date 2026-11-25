import { TestBed } from '@angular/core/testing';
import { loadModule, Model, Variable } from 'glpk-ts';

import { AdjustedRecipe } from '~/data/schema/recipe';
import { createEndfieldState, ovenId } from '~/endfield/domain/model';
import { compileEndfieldRules } from '~/endfield/domain/rules';
import { Rational, rational } from '~/rational/rational';
import { ObjectiveState, RecipeObjective } from '~/state/objectives/objective';
import { ObjectiveType } from '~/state/objectives/objective-type';
import { ObjectiveUnit } from '~/state/objectives/objective-unit';
import { AdjustedDataset } from '~/state/settings/dataset';
import { MaximizeType } from '~/state/settings/maximize-type';
import { Settings } from '~/state/settings/settings';
import { initialSettingsState } from '~/state/settings/settings-state';

import {
  bindModelRules,
  CalculationModelContext,
  CalculationVariable,
  finiteNumber,
  LinearRule,
  ModelBinding,
  ModelRow,
  ModelRules,
  ModelSimplexState as SimplexState,
  ModelVariableRef,
  validateModelSolution,
} from './model-extension';
import { SIMPLEX_CONFIG } from './simplex-config';
import { SimplexResult } from './simplex-result';
import { Solver } from './solver';

const recipeRef = (id: string): ModelVariableRef => ({ kind: 'recipe', id });
const objectiveRef = (id: string): ModelVariableRef => ({
  kind: 'objective',
  id,
});

function recipe(id: string, cost = rational.one): AdjustedRecipe {
  return {
    id,
    name: id,
    row: 0,
    time: rational.one,
    in: {},
    out: { product: rational.one },
    output: { product: rational.one },
    produces: new Set(['product']),
    flags: new Set(),
    effects: {} as AdjustedRecipe['effects'],
    cost,
    producers: ['limited', 'other'],
  };
}

function objective(
  id: string,
  target: AdjustedRecipe,
  value: Rational,
  type = ObjectiveType.Output,
  machineId = 'limited',
): RecipeObjective {
  return {
    id,
    targetId: target.id,
    recipe: target,
    value,
    type,
    unit: ObjectiveUnit.Machines,
    machineId,
  } as RecipeObjective;
}

function state(recipes: AdjustedRecipe[] = [recipe('r')]): SimplexState {
  return {
    objectives: [],
    recipeObjectives: [],
    steps: [],
    recipes: Object.fromEntries(recipes.map((r) => [r.id, r])),
    itemValues: { product: { out: rational(1n, 2n) } },
    recipeLimits: {},
    unproduceableIds: new Set(),
    excludedIds: new Set(),
    itemIds: ['product'],
    data: {
      itemAvailableIoRecipeIds: { product: recipes.map((r) => r.id) },
      itemRecord: { product: { stack: rational.one } },
      flags: new Set(),
    } as unknown as AdjustedDataset,
    maximizeType: MaximizeType.Weight,
    requireMachinesOutput: false,
    costs: {
      factor: rational.one,
      machine: rational.one,
      footprint: rational.one,
      recycling: rational.one,
      surplus: rational.one,
      unproduceable: rational(3),
      excluded: rational(4),
      maximize: rational(-2),
    },
    hasSurplusCost: true,
    glpkAlgorithm: 'simplex',
  };
}

function context(
  compile: CalculationModelContext['compile'],
  machines: Record<string, string> = { r: 'limited' },
): CalculationModelContext {
  return {
    recipeSettings: Object.fromEntries(
      Object.entries(machines).map(([id, machineId]) => [id, { machineId }]),
    ),
    compile,
  };
}

function ovenContext(
  upper: Rational,
  machines: Record<string, string> = {},
): CalculationModelContext {
  const endfield = {
    ...createEndfieldState(),
    machineLimits: { enabled: true, limits: { [ovenId]: upper } },
  };
  return context(
    (variables) =>
      compileEndfieldRules(endfield, variables, {
        transferRecipeIds: new Set(),
      }),
    machines,
  );
}

function budget(
  variables: readonly CalculationVariable[],
  upper: Rational,
  integer = true,
): ModelRules {
  const selected = variables.filter((v) => v.machineId === 'limited');
  return {
    constraints: [
      {
        id: 'budget',
        terms: selected.map(({ ref }) => ({ ref, coefficient: 1 })),
        upper,
      },
    ],
    integers: integer ? selected.map(({ ref }) => ref) : [],
  };
}

describe('Solver model extension', () => {
  let solver: Solver;

  beforeAll(async () => {
    await loadModule('glpk.all.wasm');
  });
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        Solver,
        { provide: SIMPLEX_CONFIG, useValue: { msgLevel: 'off' } },
      ],
    });
    solver = TestBed.inject(Solver);
  });

  it('rejects negative ordinary machine quantities at the public solve boundary', () => {
    const r = recipe('r');
    const compile = jasmine.createSpy('compile').and.returnValue({
      constraints: [],
      integers: [],
    });
    for (const type of [
      ObjectiveType.Output,
      ObjectiveType.Input,
      ObjectiveType.Maximize,
      ObjectiveType.Limit,
    ]) {
      const fixed = objective('negative', r, rational(-1), type);
      expect(() =>
        solver.solve(
          [fixed],
          initialSettingsState as Settings,
          {} as AdjustedDataset,
          false,
          'simplex',
          context(compile),
        ),
      ).toThrowError('Negative machine count for objective negative');
      expect(fixed.value).toEqual(rational(-1));
    }
    expect(compile).not.toHaveBeenCalled();
  });

  for (const algorithm of ['simplex', 'exact'] as const) {
    it(`uses the integer solution and objective after ${algorithm} LP preparation`, () => {
      const lp = state();
      lp.glpkAlgorithm = algorithm;
      lp.modelContext = context((variables) =>
        budget(variables, rational.one, false),
      );
      const lpResult = solver['glpk'](lp);
      expect(lpResult.error).toBeFalse();
      expect(lpResult.recipes['r']).toEqual(rational(1n, 2n));
      expect(lpResult.cost).toEqual(rational(1n, 2n));

      const mip = state();
      mip.glpkAlgorithm = algorithm;
      mip.modelContext = context((variables) =>
        budget(variables, rational.one),
      );
      const result = solver['glpk'](mip);
      expect(result.error).toBeFalse();
      expect(result.status).toBe('optimal');
      expect(result.recipes['r']).toEqual(rational.one);
      expect(result.surplus['product']).toEqual(rational(1n, 2n));
      expect(result.cost).toEqual(rational(3n, 2n));
    });

    it(`enforces fractional integer caps exactly after ${algorithm} LP preparation`, () => {
      for (const cap of [
        rational(9999999n, 10000000n),
        rational(99999999999999999n, 100000000000000000n),
      ]) {
        const s = state();
        s.glpkAlgorithm = algorithm;
        s.modelContext = context((variables) => budget(variables, cap));
        const result = solver['glpk'](s);
        expect(result.error).withContext(cap.toFraction(false)).toBeTrue();
        expect(result.status).not.toBe('optimal');
      }
    });
  }

  it('reports the opted-in transfer input at actual use in LP and MIP, including zero', () => {
    const transferKey = 'domain_key_tundra';
    const solve = (demand: Rational, integer: boolean): SimplexState => {
      const r = recipe('r');
      r.in[transferKey] = rational.one;
      r.output[transferKey] = rational(-1);
      const s = state([r]);
      s.itemValues['product'].out = demand;
      s.itemValues[transferKey] = { out: rational.zero, in: rational.one };
      s.itemValues['ordinary'] = { out: rational(1n, 2n), in: rational(2) };
      s.data.itemAvailableIoRecipeIds[transferKey] = ['r'];
      s.data.itemAvailableIoRecipeIds['ordinary'] = [];
      s.modelContext = {
        ...context(() => ({
          constraints: [],
          integers: integer ? [recipeRef('r')] : [],
        })),
        actualInputIds: new Set([transferKey]),
      };
      expect(solver['glpk'](s).error).toBeFalse();
      expect(s.itemValues['ordinary'].in).toEqual(rational(2));
      return s;
    };
    expect(solve(rational(1n, 2n), false).itemValues[transferKey].in).toEqual(
      rational(1n, 2n),
    );
    expect(solve(rational(1n, 2n), true).itemValues[transferKey].in).toEqual(
      rational.one,
    );
    for (const integer of [false, true])
      expect(solve(rational.zero, integer).itemValues[transferKey].in).toEqual(
        rational.zero,
      );
  });

  it('leaves native LP numeric conversion to the upstream solver', () => {
    const s = state();
    s.itemValues['product'].out = rational(1n, 10n ** 400n);
    expect(solver['glpk'](s).error).toBeFalse();
  });

  it('passes the real solve context and excludes input and limit objectives from the variable table', () => {
    const r = recipe('r');
    const data = {
      itemIds: ['product'],
      itemAvailableRecipeIds: { product: ['r'] },
      itemAvailableIoRecipeIds: { product: ['r'] },
      adjustedRecipe: { r },
      itemRecord: { product: { stack: rational.one } },
      flags: new Set(),
    } as unknown as AdjustedDataset;
    const settings = {
      ...initialSettingsState,
      costs: { ...initialSettingsState.costs, surplus: rational.one },
      requireMachinesOutput: false,
    } as Settings;
    const seen: ModelVariableRef[] = [];
    const result = solver.solve(
      [
        {
          id: 'demand',
          targetId: 'product',
          value: rational(1n, 2n),
          unit: ObjectiveUnit.Items,
          type: ObjectiveType.Output,
        },
        objective('fixed', r, rational.zero),
        objective('input', r, rational.zero, ObjectiveType.Input),
        objective('limit', r, rational.one, ObjectiveType.Limit),
      ],
      settings,
      data,
      false,
      'simplex',
      context((variables) => {
        seen.push(...variables.map((variable) => variable.ref));
        return budget(variables, rational.one);
      }),
    );
    expect(seen).toEqual([recipeRef('r'), objectiveRef('fixed')]);
    expect(result.resultType).toBe('solved');
    expect(result.cost).toEqual(rational(3n, 2n));
    expect(
      result.steps.find(
        (step) => step.recipeId === 'r' && !step.recipeObjectiveId,
      )?.machines,
    ).toEqual(rational.one);
    expect(
      result.steps.find((step) => step.itemId === 'product')?.surplus,
    ).toEqual(rational(1n, 2n));
  });

  for (const algorithm of ['simplex', 'exact'] as const) {
    it(`preserves ordinary input budgets across LP and MIP using ${algorithm}`, () => {
      const intopt = spyOn(Model.prototype, 'intopt').and.callThrough();
      const r = recipe('r');
      const supply = {
        ...recipe('supply'),
        out: { unused: rational.one },
        output: { unused: rational.one },
        produces: new Set(['unused']),
      };
      const data = {
        itemIds: ['input', 'product', 'unused'],
        itemAvailableRecipeIds: { input: [], product: ['r'], unused: [] },
        itemAvailableIoRecipeIds: { input: [], product: ['r'], unused: [] },
        adjustedRecipe: { r },
        itemRecord: {
          input: { stack: rational.one },
          product: { stack: rational.one },
          unused: { stack: rational.one },
        },
        flags: new Set(),
      } as unknown as AdjustedDataset;
      const settings = {
        ...initialSettingsState,
        costs: { ...initialSettingsState.costs, surplus: rational.one },
        requireMachinesOutput: false,
      } as Settings;
      const objectives: ObjectiveState[] = [
        {
          id: 'input-budget',
          targetId: 'input',
          value: rational(10),
          unit: ObjectiveUnit.Items,
          type: ObjectiveType.Input,
        },
        {
          id: 'input-demand',
          targetId: 'input',
          value: rational(3),
          unit: ObjectiveUnit.Items,
          type: ObjectiveType.Output,
        },
        {
          id: 'product-demand',
          targetId: 'product',
          value: rational.one,
          unit: ObjectiveUnit.Items,
          type: ObjectiveType.Output,
        },
        objective('recipe-limit', r, rational.one, ObjectiveType.Limit),
        objective('unused-budget', supply, rational(7), ObjectiveType.Input),
      ];
      const solve = (
        input: ObjectiveState[],
        integer: boolean,
        native = false,
      ): SimplexResult =>
        solver.solve(
          input,
          settings,
          data,
          false,
          algorithm,
          native
            ? undefined
            : context(() => ({
                constraints: [],
                integers: integer ? [recipeRef('r')] : [],
              })),
        );
      const native = solve(objectives, false, true);
      const lp = solve(objectives, false);
      expect(intopt).not.toHaveBeenCalled();
      const mip = solve(objectives, true);
      expect(intopt).toHaveBeenCalledTimes(1);

      // r - surplus(product) = 1 and r <= 1 force r = 1 even in the LP,
      // so marking r integer leaves the complete feasible domain unchanged.
      for (const result of [native, lp, mip]) {
        expect(result.resultType).toBe('solved');
        expect(result.cost).toEqual(rational.one);
        const input = result.steps.find((step) => step.itemId === 'input');
        expect(input?.items).toEqual(rational(10));
        expect(input?.output).toEqual(rational(3));
        expect(input?.surplus).toBeUndefined();
        expect(
          result.steps.some((step) => step.itemId === 'unused'),
        ).toBeTrue();
        const product = result.steps.find((step) => step.itemId === 'product');
        expect(product?.items).toEqual(rational.one);
        expect(product?.machines).toEqual(rational.one);
        expect(product?.surplus).toBeUndefined();
      }
      expect(native.steps).toEqual(lp.steps);
      expect(lp.steps).toEqual(mip.steps);
      expect(objectives[0].value).toEqual(rational(10));
      expect(objectives[4].value).toEqual(rational(7));

      // A smaller input budget requires one unit of unproduceable input, whose
      // cost confirms that the original upper bound still limits the model.
      const capped = objectives.map((obj) =>
        obj.id === 'input-budget' ? { ...obj, value: rational(2) } : obj,
      );
      for (const integer of [false, true]) {
        const result = solve(capped, integer);
        expect(result.resultType).toBe('solved');
        expect(result.cost).toEqual(
          initialSettingsState.costs.unproduceable.add(rational.one),
        );
        expect(
          result.steps.find((step) => step.itemId === 'input')?.items,
        ).toEqual(rational(3));
      }
      expect(capped[0].value).toEqual(rational(2));
    });
  }

  it('rejects noninteger fixed objectives with exact rational bounds', () => {
    for (const amount of [rational(1n, 2n), rational(100000001n, 100000000n)]) {
      const r = recipe('r');
      const s = state([]);
      s.recipeObjectives = [objective('fixed', r, amount)];
      s.modelContext = context((variables) => budget(variables, rational(2)));
      const result = solver['glpk'](s);
      expect(result.error).toBeTrue();
      expect(result.status).toBe('no_feasible');
      expect(result.returnCode).toBeUndefined();
    }
  });

  it('treats two objectives using the same recipe as two budget consumers', () => {
    const r = recipe('r');
    const s = state([]);
    s.recipeObjectives = [
      objective('first', r, rational.one),
      objective('second', r, rational.one),
    ];
    s.modelContext = context((variables) => budget(variables, rational.one));
    const result = solver['glpk'](s);
    expect(result.error).toBeTrue();
    expect(result.status).toBe('no_feasible');
  });

  it('uses prepared selected machines for automatic and explicit variables', () => {
    const r = recipe('r');
    const s = state([r]);
    s.recipeObjectives = [
      objective('external', r, rational.one, ObjectiveType.Output, 'other'),
    ];
    s.itemValues['product'].out = rational.one;
    let descriptions: readonly CalculationVariable[] = [];
    s.modelContext = context((variables) => {
      descriptions = variables;
      return budget(variables, rational.zero);
    });
    const result = solver['glpk'](s);
    expect(result.error).toBeFalse();
    expect(result.recipes['r']).toBeUndefined();
    expect(result.cost).toEqual(rational.zero);
    expect(descriptions).toEqual([
      { ref: recipeRef('r'), recipeId: 'r', machineId: 'limited' },
      { ref: objectiveRef('external'), recipeId: 'r', machineId: 'other' },
    ]);
    expect(r.producers).toContain('limited');
  });

  it('includes the actual fractional oven exception in the machine budget', () => {
    const exception = recipe('xiranite_enr_powder');
    const machines = { xiranite_enr_powder: ovenId };
    const s = state([exception]);
    s.modelContext = ovenContext(rational.one, machines);
    const result = solver['glpk'](s);
    expect(result.error).toBeFalse();
    expect(result.recipes['xiranite_enr_powder']).toEqual(rational(1n, 2n));

    const limited = state([exception]);
    limited.modelContext = ovenContext(rational(1n, 4n), machines);
    expect(solver['glpk'](limited).error).toBeTrue();
  });

  it('keeps a fractional oven exception in a mixed-integer budget', () => {
    const integral = recipe('integral', rational(2));
    const fractional = recipe('xiranite_enr_powder');
    const machines = { integral: ovenId, xiranite_enr_powder: ovenId };
    const s = state([integral, fractional]);
    s.modelContext = ovenContext(rational.one, machines);
    const result = solver['glpk'](s);
    expect(result.error).toBeFalse();
    expect(result.recipes['integral']).toBeUndefined();
    expect(result.recipes['xiranite_enr_powder']).toEqual(rational(1n, 2n));
    expect(result.cost).toEqual(rational(1n, 2n));

    const limited = state([integral, fractional]);
    limited.modelContext = ovenContext(rational(1n, 4n), machines);
    expect(solver['glpk'](limited).error).toBeTrue();
  });

  it('treats a zero-capped automatic oven exception as fixed', () => {
    const addRow = spyOn(Model.prototype, 'addConstr').and.callThrough();
    const exception = recipe('xiranite_enr_powder');
    const machines = { xiranite_enr_powder: ovenId };
    for (const cap of [rational(10n ** 400n), rational(1n, 10n ** 400n)]) {
      const s = state([exception]);
      s.recipeLimits['xiranite_enr_powder'] = rational.zero;
      s.unproduceableIds.add('product');
      s.modelContext = ovenContext(cap, machines);
      const result = solver['glpk'](s);
      expect(result.error).toBeFalse();
      expect(result.recipes['xiranite_enr_powder']).toBeUndefined();
      expect(result.unproduceable['product']).toEqual(rational(1n, 2n));
      expect(addRow.calls.allArgs().map(([row]) => row?.name)).toEqual([
        'product',
      ]);
      addRow.calls.reset();
    }

    const integer = recipe('integral');
    const s = state([exception, integer]);
    s.recipeLimits['xiranite_enr_powder'] = rational.zero;
    s.modelContext = ovenContext(rational.one, {
      ...machines,
      integral: ovenId,
    });
    const result = solver['glpk'](s);
    expect(result.error).toBeFalse();
    expect(result.recipes['integral']).toEqual(rational.one);
    expect(result.recipes['xiranite_enr_powder']).toBeUndefined();
    expect(addRow.calls.allArgs().map(([row]) => row?.name)).toEqual([
      'product',
      `ef:machine:${ovenId}:integer`,
    ]);
  });

  it('projects the mixed oven budget without excluding a valid exception', () => {
    const x = recipe('fixed');
    x.out = {};
    x.output = {};
    x.produces = new Set();
    const exception = recipe('xiranite_enr_powder');
    const machines = { xiranite_enr_powder: ovenId };
    const s = state([exception]);
    s.recipeObjectives = [
      objective('fixed', x, rational.one, ObjectiveType.Output, ovenId),
    ];
    s.modelContext = ovenContext(rational(3n, 2n), machines);
    const result = solver['glpk'](s);
    expect(result.error).toBeFalse();
    expect(result.recipes['xiranite_enr_powder']).toEqual(rational(1n, 2n));
    expect(result.cost).toEqual(rational(1n, 2n));

    const tooSmall = state([exception]);
    tooSmall.itemValues = {};
    tooSmall.recipeObjectives = [
      objective('fixed', x, rational.one, ObjectiveType.Output, ovenId),
    ];
    tooSmall.modelContext = ovenContext(
      rational(99999999999999999n, 100000000000000000n),
      machines,
    );
    const rejected = solver['glpk'](tooSmall);
    expect(rejected.error).toBeTrue();
    expect(rejected.status).not.toBe('optimal');
  });

  it('subtracts the fixed oven exception exactly before flooring the integer budget', () => {
    const x = recipe('x');
    const exception = recipe('xiranite_enr_powder');
    const solve = (cap: Rational, count = rational.one): boolean => {
      const s = state([]);
      s.itemValues = {};
      s.recipeObjectives = [
        objective('x', x, count, ObjectiveType.Output, ovenId),
        objective(
          'fraction',
          exception,
          rational(1n, 2n),
          ObjectiveType.Output,
          ovenId,
        ),
      ];
      s.modelContext = ovenContext(cap);
      return solver['glpk'](s).error;
    };
    expect(solve(rational(3n, 2n))).toBeFalse();
    expect(
      solve(rational(149999999999999999n, 100000000000000000n)),
    ).toBeTrue();
    // A negative fractional residual must floor to -1, not truncate to 0.
    expect(
      solve(rational(49999999999999999n, 100000000000000000n), rational.zero),
    ).toBeTrue();
  });

  it('keeps the original mixed row when exact fixed residuals underflow or are slightly negative', () => {
    const bind = (fixed: Rational, upper: Rational): ModelRow[] => {
      const model = new Model();
      const fixedValue = finiteNumber(fixed, 'fixed');
      const fixedVariable = model.addVar({ lb: fixedValue, ub: fixedValue });
      const freeVariable = model.addVar({ lb: 0 });
      const rows: ModelRow[] = [];
      const bound = bindModelRules(
        model,
        ovenContext(upper),
        [
          {
            variable: fixedVariable,
            description: {
              ref: objectiveRef('fixed'),
              recipeId: 'xiranite_enr_powder',
              machineId: ovenId,
            },
            fixed,
          },
          {
            variable: freeVariable,
            description: {
              ref: recipeRef('free'),
              recipeId: 'xiranite_enr_powder',
              machineId: ovenId,
            },
          },
        ],
        rows,
      );
      expect(bound.infeasible).toBeFalse();
      expect(rows.length).toBe(1);
      expect(rows[0].coeffs).toEqual([
        [fixedVariable, 1],
        [freeVariable, 1],
      ]);
      return rows;
    };
    const denominator = 10n ** 200n;
    const cap = rational(1n, denominator);
    expect(bind(rational(1n, denominator + 1n), cap)[0].upper).toBe(
      finiteNumber(cap, 'cap'),
    );
    const almostOne = rational(99999999999999999n, 100000000000000000n);
    expect(bind(rational.one, almostOne)[0].upper).toBe(1);
  });

  it('preserves integer feasibility when tightening a fractional recipe limit', () => {
    const s = state();
    s.recipeLimits['r'] = rational(19n, 10n);
    s.modelContext = context((variables) => budget(variables, rational(2)));
    const result = solver['glpk'](s);
    expect(result.error).toBeFalse();
    expect(result.recipes['r']).toEqual(rational.one);

    const infeasible = state();
    infeasible.recipeLimits['r'] = rational(9n, 10n);
    infeasible.modelContext = context((variables) =>
      budget(variables, rational(2)),
    );
    expect(solver['glpk'](infeasible).error).toBeTrue();
  });

  it('applies sparse weighted shared rules to ordinary and explicit variables', () => {
    const local = recipe('local', rational(-1));
    const remote = recipe('remote', rational(-1));
    const s = state([local, remote]);
    s.itemValues = {};
    s.recipeObjectives = [objective('fixed-remote', remote, rational.one)];
    s.modelContext = context(
      (variables) => ({
        constraints: [
          {
            id: 'shared',
            terms: variables.map(({ ref, recipeId }) => ({
              ref,
              coefficient: recipeId === 'remote' ? 3 : 1,
            })),
            upper: rational(3),
          },
        ],
        integers: [],
      }),
      { local: 'limited', remote: 'limited' },
    );
    const result = solver['glpk'](s);
    expect(result.error).toBeFalse();
    expect(result.recipes['local']).toBeUndefined();
    expect(result.recipes['remote']).toBeUndefined();
    expect(result.cost).toEqual(rational.zero);

    const sparse = state([local]);
    sparse.itemValues = {};
    sparse.modelContext = context(
      (variables) => ({
        constraints: [
          {
            id: 'shared',
            terms: variables.map(({ ref }) => ({
              ref,
              coefficient: 1,
            })),
            upper: rational(3),
          },
        ],
        integers: [],
      }),
      { local: 'limited' },
    );
    const sparseResult = solver['glpk'](sparse);
    expect(sparseResult.recipes['local']).toEqual(rational(3));
    expect(sparseResult.cost).toEqual(rational(-3));
  });

  it('handles empty rows and rejects missing or duplicate references', () => {
    const run = (rules: ModelRules): boolean => {
      const s = state();
      s.modelContext = context(() => rules);
      return solver['glpk'](s).error;
    };
    const empty: LinearRule = { id: 'empty', terms: [], upper: rational.zero };
    expect(run({ constraints: [empty], integers: [] })).toBeFalse();
    expect(
      run({ constraints: [{ ...empty, upper: rational(-1) }], integers: [] }),
    ).toBeTrue();
    expect(() =>
      run({ constraints: [], integers: [recipeRef('missing')] }),
    ).toThrowError(/Missing model binding/);
    expect(() =>
      run({
        constraints: [
          {
            ...empty,
            terms: [
              { ref: recipeRef('r'), coefficient: 1 },
              { ref: recipeRef('r'), coefficient: 1 },
            ],
          },
        ],
        integers: [],
      }),
    ).toThrowError(/Duplicate term/);
    expect(() =>
      run({ constraints: [], integers: [recipeRef('r'), recipeRef('r')] }),
    ).toThrowError(/Duplicate integer/);
    expect(() =>
      run({
        constraints: [
          {
            ...empty,
            terms: [{ ref: objectiveRef('missing'), coefficient: 1 }],
          },
        ],
        integers: [],
      }),
    ).toThrowError(/Missing model binding/);

    const duplicate = state([]);
    const r = recipe('r');
    duplicate.recipeObjectives = [
      objective('same', r, rational.one),
      objective('same', r, rational.one),
    ];
    duplicate.modelContext = context(() => ({ constraints: [], integers: [] }));
    expect(() => solver['glpk'](duplicate)).toThrowError(
      /Duplicate model binding/,
    );
  });

  it('checks every MIP column while retaining an ordinary input budget', () => {
    const mipValues = spyOnProperty(
      Variable.prototype,
      'valueMIP',
      'get',
    ).and.callThrough();
    const r = recipe('r');
    r.in = { raw: rational.one };
    r.output['raw'] = rational(-1);
    const s = state([r]);
    s.itemValues = {
      product: { out: rational(1n, 2n), max: rational.one },
      raw: { out: rational.zero },
      excluded: { out: rational(1n, 2n) },
      input: { out: rational(1n, 2n), in: rational(2) },
    };
    s.unproduceableIds = new Set(['raw']);
    s.excludedIds = new Set(['excluded']);
    s.data.itemAvailableIoRecipeIds = {
      product: ['r'],
      raw: ['r'],
      excluded: [],
      input: [],
    };
    s.data.itemRecord = {
      product: {},
      raw: {},
      excluded: {},
      input: {},
    } as unknown as AdjustedDataset['itemRecord'];
    s.modelContext = context((variables) => budget(variables, rational.one));
    const result = solver['glpk'](s);
    expect(result.error).toBeFalse();
    expect(result.recipes['r']).toEqual(rational.one);
    expect(result.unproduceable['raw']).toEqual(rational.one);
    expect(result.excluded['excluded']).toEqual(rational(1n, 2n));
    expect(s.itemValues['product'].out).toEqual(rational.one);
    expect(s.itemValues['input'].in).toEqual(rational(2));
    expect(
      mipValues.calls
        .all()
        .some(({ object }) => (object as unknown as Variable).name === 'input'),
    ).toBeTrue();
    expect(result.cost).toEqual(rational(5));
  });

  it('keeps the explicit maximize variable costless while its auxiliary earns the reward', () => {
    const r = recipe('r', rational(100));
    const s = state([]);
    s.itemValues = {};
    s.recipeObjectives = [
      objective('max', r, rational.one, ObjectiveType.Maximize),
    ];
    s.modelContext = context((variables) => budget(variables, rational.one));
    const result = solver['glpk'](s);
    expect(result.error).toBeFalse();
    expect(s.recipeObjectives[0].value).toEqual(rational.one);
    expect(result.cost).toEqual(rational(-2));
  });

  it('does not report an LP result as success after MIP failure', () => {
    spyOn(Model.prototype, 'intopt').and.returnValue('time_limit');
    const s = state();
    s.modelContext = context((variables) => budget(variables, rational.one));
    const result = solver['glpk'](s);
    expect(result.error).toBeTrue();
    expect(result.returnCode).toBe('time_limit');
    expect(result.status).not.toBe('optimal');
  });

  it('reports an integer-infeasible model as failure even when its LP is feasible', () => {
    const lp = spyOn<any>(solver, 'glpkSimplex').and.callThrough();
    const mip = spyOn(Model.prototype, 'intopt').and.callThrough();
    const mipObjective = spyOnProperty(Model.prototype, 'valueMIP', 'get');
    const r = recipe('r');
    r.in = { raw: rational.one };
    r.output['raw'] = rational(-1);
    const s = state([r]);
    s.itemValues['raw'] = {
      out: rational.zero,
      in: rational(3n, 4n),
      lim: rational(3n, 4n),
    };
    s.itemIds.push('raw');
    s.unproduceableIds.add('raw');
    s.data.itemAvailableIoRecipeIds['raw'] = ['r'];
    s.modelContext = context((variables) => budget(variables, rational.one));
    const result = solver['glpk'](s);
    expect(lp).toHaveBeenCalledTimes(1);
    expect(lp.calls.mostRecent().returnValue).toEqual(['ok', 'optimal']);
    expect(mip).toHaveBeenCalledTimes(1);
    expect(mip.calls.mostRecent().returnValue).toBe('ok');
    expect((mip.calls.mostRecent().object as Model).statusMIP).toBe(
      'no_feasible',
    );
    expect(result.error).toBeTrue();
    expect(result.returnCode).toBe('ok');
    expect(result.status).toBe('no_feasible');
    expect(result.cost).toEqual(rational.zero);
    expect(mipObjective).not.toHaveBeenCalled();
  });

  it('fails closed if the reported MIP objective differs from the variable values', () => {
    spyOnProperty(Model.prototype, 'valueMIP', 'get').and.returnValue(999);
    const s = state();
    s.modelContext = context((variables) => budget(variables, rational.one));
    expect(() => solver['glpk'](s)).toThrowError(/objective does not match/);
  });

  it('rejects a non-finite surplus from the integer solution', () => {
    const getter = Object.getOwnPropertyDescriptor(
      Variable.prototype,
      'valueMIP',
    )?.get;
    if (!getter) throw new Error('Missing MIP variable getter');
    spyOnProperty(Variable.prototype, 'valueMIP', 'get').and.callFake(function (
      this: Variable,
    ): number {
      return this.name === 'product' ? NaN : (getter.call(this) as number);
    });
    const s = state();
    s.modelContext = context((variables) => budget(variables, rational.one));
    expect(() => solver['glpk'](s)).toThrowError(/Non-finite solution row/);
  });

  it('uses the same normalized integer in validation, cost and displayed quantities', () => {
    spyOnProperty(Model.prototype, 'valueMIP', 'get').and.returnValue(
      1.50000005,
    );
    const getter = Object.getOwnPropertyDescriptor(
      Variable.prototype,
      'valueMIP',
    )?.get;
    if (!getter) throw new Error('Missing MIP variable getter');
    spyOnProperty(Variable.prototype, 'valueMIP', 'get').and.callFake(function (
      this: Variable,
    ): number {
      return this.name === 'r' ? 1.00000005 : (getter.call(this) as number);
    });
    const s = state();
    s.modelContext = context((variables) => budget(variables, rational.one));
    const result = solver['glpk'](s);
    expect(result.error).toBeFalse();
    expect(result.recipes['r']).toEqual(rational.one);
    expect(result.surplus['product']).toEqual(rational(1n, 2n));
    expect(result.cost).toEqual(rational(3n, 2n));
  });

  it('rejects a forged integer result that violates the exact row', () => {
    const getter = Object.getOwnPropertyDescriptor(
      Variable.prototype,
      'valueMIP',
    )?.get;
    if (!getter) throw new Error('Missing MIP variable getter');
    spyOnProperty(Variable.prototype, 'valueMIP', 'get').and.callFake(function (
      this: Variable,
    ): number {
      return this.name === 'r' ? 1 : (getter.call(this) as number);
    });
    const s = state();
    s.itemValues = {};
    s.recipes['r'].cost = rational.zero;
    s.modelContext = context((variables) => budget(variables, rational.zero));
    expect(() => solver['glpk'](s)).toThrowError(
      /exact integer upper constraint/,
    );
  });

  it('rejects forged values outside integer tolerance or an exact column bound', () => {
    const getter = Object.getOwnPropertyDescriptor(
      Variable.prototype,
      'valueMIP',
    )?.get;
    if (!getter) throw new Error('Missing MIP variable getter');
    const spy = spyOnProperty(Variable.prototype, 'valueMIP', 'get');
    spy.and.callFake(function (this: Variable): number {
      return this.name === 'r' ? 1.0000002 : (getter.call(this) as number);
    });
    const fractional = state();
    fractional.modelContext = context((variables) =>
      budget(variables, rational.one),
    );
    expect(() => solver['glpk'](fractional)).toThrowError(
      /integer constraint or safe range/,
    );

    spy.and.callFake(function (this: Variable): number {
      return this.name === 'r' ? 1 : (getter.call(this) as number);
    });
    const bounded = state();
    bounded.itemValues = {};
    bounded.recipeLimits['r'] = rational.zero;
    bounded.modelContext = context(() => ({
      constraints: [],
      integers: [recipeRef('r')],
    }));
    expect(() => solver['glpk'](bounded)).toThrowError(
      /exact integer upper bound/,
    );
  });

  it('rejects unsafe integer caps and nonfinite recipe limits', () => {
    const t = state();
    t.modelContext = ovenContext(rational(9007199254740992n), { r: ovenId });
    expect(() => solver['glpk'](t)).toThrowError(/safe numeric range/);

    const unrepresentable = state();
    unrepresentable.recipeLimits['r'] = rational(10n ** 400n);
    unrepresentable.modelContext = context(() => ({
      constraints: [],
      integers: [recipeRef('r')],
    }));
    expect(() => solver['glpk'](unrepresentable)).toThrowError(
      /Non-finite upper bound/,
    );
  });

  it('fails closed if a final variable violates a model row', () => {
    const getter = Object.getOwnPropertyDescriptor(
      Variable.prototype,
      'valueMIP',
    )?.get;
    if (!getter) throw new Error('Missing MIP variable getter');
    spyOnProperty(Variable.prototype, 'valueMIP', 'get').and.callFake(function (
      this: Variable,
    ): number {
      return this.name === 'product' ? 0.75 : (getter.call(this) as number);
    });
    const s = state();
    s.modelContext = context((variables) => budget(variables, rational.one));
    expect(() => solver['glpk'](s)).toThrowError(/violates lower constraint/);
  });

  describe('model input and solution defenses', () => {
    it('converts finite rationals without losing nonzero values at the GLPK boundary', () => {
      expect(finiteNumber(rational.zero, 'fixture')).toBe(0);
      expect(finiteNumber(rational(7n, 4n), 'fixture')).toBe(1.75);
      expect(finiteNumber(rational(-7n, 4n), 'fixture')).toBe(-1.75);
      expect(finiteNumber(rational(1n, 10n ** 308n), 'fixture')).toBe(1e-308);
      expect(finiteNumber(rational(9007199254740991n), 'fixture')).toBe(
        Number.MAX_SAFE_INTEGER,
      );
      // Safe-integer restrictions apply to integer model rules, not this conversion.
      expect(finiteNumber(rational(9007199254740992n), 'fixture')).toBe(
        9007199254740992,
      );
      for (const value of [rational(10n ** 400n), rational(-(10n ** 400n))])
        expect(() => finiteNumber(value, 'fixture')).toThrowError(
          'Non-finite fixture',
        );
      for (const value of [
        // Rational.toNumber can underflow when its denominator overflows first.
        rational(1n, 10n ** 310n),
        rational(1n, 10n ** 400n),
        rational(-1n, 10n ** 400n),
      ])
        expect(() => finiteNumber(value, 'fixture')).toThrowError(
          'Unrepresentable fixture: numeric underflow',
        );
    });

    it('retains exact safe-integer bounds for integer model variables', () => {
      const bind = (upper: Rational): Variable => {
        const model = new Model();
        const variable = model.addVar({ name: 'r', lb: 0 });
        bindModelRules(
          model,
          context(() => ({ constraints: [], integers: [recipeRef('r')] })),
          [
            {
              variable,
              description: {
                ref: recipeRef('r'),
                recipeId: 'r',
              },
              upper,
            },
          ],
          [],
        );
        return variable;
      };
      expect(bind(rational(9007199254740991n)).ub).toBe(
        Number.MAX_SAFE_INTEGER,
      );
      expect(() => bind(rational(9007199254740992n))).toThrowError(
        /Integer upper bound.*exceeds safe numeric range/,
      );
    });

    it('rejects duplicate bindings of the same actual variable', () => {
      const model = new Model();
      const x = model.addVar({ lb: 0 });
      const binding = (id: string): ModelBinding => ({
        variable: x,
        description: { ref: recipeRef(id), recipeId: id },
      });
      expect(() =>
        bindModelRules(
          model,
          context(() => ({ constraints: [], integers: [] })),
          [binding('a'), binding('b')],
          [],
        ),
      ).toThrowError(/variable bound more than once/);
    });

    it('rejects a continuous machine cap that underflows', () => {
      const s = state([recipe('xiranite_enr_powder')]);
      s.modelContext = ovenContext(rational(1n, 10n ** 400n), {
        xiranite_enr_powder: ovenId,
      });
      expect(() => solver['glpk'](s)).toThrowError(
        /Unrepresentable upper bound/,
      );
    });

    it('rejects an unrepresentable derived fixed machine count', () => {
      const s = state([]);
      s.recipeObjectives = [
        objective(
          'derived-supply',
          recipe('supply'),
          rational(1n, 10n ** 400n),
        ),
      ];
      s.modelContext = context(() => ({ constraints: [], integers: [] }));
      expect(() => solver['glpk'](s)).toThrowError(
        /Unrepresentable bound of objective derived-supply/,
      );
    });

    it('checks the solved bounds of a continuous derived supply', () => {
      const getter = Object.getOwnPropertyDescriptor(
        Variable.prototype,
        'value',
      )?.get;
      if (!getter) throw new Error('Missing LP variable getter');
      let reported = 1;
      spyOnProperty(Variable.prototype, 'value', 'get').and.callFake(function (
        this: Variable,
      ): number {
        return this.name === 'derived-supply'
          ? reported
          : (getter.call(this) as number);
      });
      const solve = (): void => {
        const s = state([]);
        s.itemValues = {};
        s.recipeObjectives = [
          objective('derived-supply', recipe('supply'), rational.one),
        ];
        s.modelContext = context(() => ({ constraints: [], integers: [] }));
        solver['glpk'](s);
      };
      reported = 1 - 1e-8;
      expect(solve).not.toThrow();
      reported = 1 + 1e-8;
      expect(solve).not.toThrow();
      reported = 0.5;
      expect(solve).toThrowError(/violates lower bound: derived-supply/);
      reported = 1.5;
      expect(solve).toThrowError(/violates upper bound: derived-supply/);
    });

    it('rejects a missing derived column in a mixed oven solution', () => {
      const getter = Object.getOwnPropertyDescriptor(
        Model.prototype,
        'vars',
      )?.get;
      if (!getter) throw new Error('Missing model variables getter');
      spyOnProperty(Model.prototype, 'vars', 'get').and.callFake(function (
        this: Model,
      ): readonly Variable[] {
        return (getter.call(this) as readonly Variable[]).filter(
          (variable) => variable.name !== 'derived-supply',
        );
      });
      const s = state();
      s.recipeObjectives = [
        objective(
          'derived-supply',
          recipe('xiranite_enr_powder'),
          rational(1n, 2n),
          ObjectiveType.Output,
          ovenId,
        ),
      ];
      s.modelContext = ovenContext(rational(3n, 2n), { r: ovenId });
      expect(() => solver['glpk'](s)).toThrowError(
        'Missing checked model variable',
      );
    });

    it('validates a continuous oven limit against the LP solution', () => {
      const model = new Model({ sense: 'min' });
      const variable = model.addVar({ name: 'exception', lb: 0, obj: -1 });
      const rows: ModelRow[] = [];
      const bound = bindModelRules(
        model,
        ovenContext(rational.one),
        [
          {
            variable,
            description: {
              ref: recipeRef('exception'),
              recipeId: 'xiranite_enr_powder',
              machineId: ovenId,
            },
          },
        ],
        rows,
      );
      expect(bound.integerVariables.size).toBe(0);
      expect(model.simplex({ msgLevel: 'off' })).toBe('ok');
      expect(model.status).toBe('optimal');
      const value = spyOnProperty(Variable.prototype, 'value', 'get');
      value.and.returnValue(1 + 1e-8);
      expect(() =>
        validateModelSolution(model, rows, bound.integerVariables, [], false),
      ).not.toThrow();
      value.and.returnValue(1.1);
      expect(() =>
        validateModelSolution(model, rows, bound.integerVariables, [], false),
      ).toThrowError(/violates upper constraint/);
    });

    it('rejects overflow while checking a shared water budget', () => {
      const model = new Model();
      const variable = model.addVar({ name: 'water', lb: 0 });
      const rows: ModelRow[] = [];
      const bound = bindModelRules(
        model,
        context((variables) =>
          compileEndfieldRules(createEndfieldState(), variables, {
            transferRecipeIds: new Set(),
          }),
        ),
        [
          {
            variable,
            description: {
              ref: recipeRef('water'),
              recipeId: 'sewage-treat-export',
            },
          },
        ],
        rows,
      );
      expect(model.simplex({ msgLevel: 'off' })).toBe('ok');
      expect(model.status).toBe('optimal');
      spyOnProperty(Variable.prototype, 'value', 'get').and.returnValue(1e308);
      expect(() =>
        validateModelSolution(model, rows, bound.integerVariables, [], false),
      ).toThrowError(/Non-finite solution row: ef:water:shared/);
    });

    it('checks scaled maximization costs when oven rules are active', () => {
      for (const [weight, factor, error] of [
        [
          rational(-(10n ** 308n)),
          rational(10n ** 308n),
          /Non-finite maximize objective coefficient/,
        ],
        [
          rational(-1n, 10n ** 200n),
          rational(1n, 10n ** 200n),
          /Unrepresentable maximize objective coefficient/,
        ],
      ] as const) {
        const s = state();
        s.maximizeType = MaximizeType.Ratio;
        s.costs.maximize = weight;
        s.itemValues['product'].max = factor;
        s.modelContext = ovenContext(rational.one, { r: ovenId });
        expect(() => solver['glpk'](s)).toThrowError(error);
      }
    });

    it('decides fixed and empty upper budgets exactly before numeric conversion', () => {
      const run = (fixed: Rational | undefined, upper: Rational): boolean => {
        const s = state([]);
        s.itemValues = {};
        if (fixed !== undefined)
          s.recipeObjectives = [
            objective(
              'fixed',
              recipe('xiranite_enr_powder'),
              fixed,
              ObjectiveType.Output,
              ovenId,
            ),
          ];
        s.modelContext = ovenContext(upper);
        return solver['glpk'](s).error;
      };
      expect(run(rational(1n, 2n), rational(1n, 2n))).toBeFalse();
      expect(
        run(
          rational(1n, 2n),
          rational(49999999999999999n, 100000000000000000n),
        ),
      ).toBeTrue();
      for (const upper of [rational(10n ** 400n), rational(1n, 10n ** 400n)]) {
        expect(run(undefined, upper)).toBeFalse();
        expect(run(rational.zero, upper)).toBeFalse();
      }
    });

    it('rejects forged integer values below a fixed lower bound', () => {
      const getter = Object.getOwnPropertyDescriptor(
        Variable.prototype,
        'valueMIP',
      )?.get;
      if (!getter) throw new Error('Missing MIP variable getter');
      const spy = spyOnProperty(Variable.prototype, 'valueMIP', 'get');
      spy.and.callFake(function (this: Variable): number {
        return this.name === 'fixed' ? 0 : (getter.call(this) as number);
      });
      const fixed = state([]);
      fixed.itemValues = {};
      fixed.recipeObjectives = [
        objective('fixed', recipe('fixed'), rational.one),
      ];
      fixed.modelContext = context(() => ({
        constraints: [],
        integers: [objectiveRef('fixed')],
      }));
      expect(() => solver['glpk'](fixed)).toThrowError(
        /exact integer lower bound/,
      );
    });
  });
});
