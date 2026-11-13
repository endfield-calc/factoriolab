import { TestBed } from '@angular/core/testing';
import { loadModule, Model, Variable } from 'glpk-ts';

import { AdjustedRecipe } from '~/data/schema/recipe';
import {
  CalculationModelContext,
  CalculationVariable,
  LinearRule,
  ModelRules,
  ModelVariableRef,
} from '~/extensions/calculation-extension';
import { Rational, rational } from '~/rational/rational';
import { RecipeObjective } from '~/state/objectives/objective';
import { ObjectiveType } from '~/state/objectives/objective-type';
import { ObjectiveUnit } from '~/state/objectives/objective-unit';
import { AdjustedDataset } from '~/state/settings/dataset';
import { MaximizeType } from '~/state/settings/maximize-type';
import { Settings } from '~/state/settings/settings';
import { initialSettingsState } from '~/state/settings/settings-state';

import { SIMPLEX_CONFIG } from './simplex-config';
import { SimplexState } from './simplex-state';
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
        source: 'fixture',
        terms: selected.map(({ ref }) => ({ ref, coefficient: rational.one })),
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

    it(`normalizes signed rational rows without losing integer points using ${algorithm}`, () => {
      const x = recipe('x');
      const y = recipe('y');
      const solve = (second: Rational): boolean => {
        const s = state([]);
        s.glpkAlgorithm = algorithm;
        s.itemValues = {};
        s.recipeObjectives = [
          objective('x', x, rational.one),
          objective('y', y, second),
        ];
        s.modelContext = context(() => ({
          integers: [objectiveRef('x'), objectiveRef('y')],
          constraints: [
            {
              id: 'signed',
              source: 'fixture',
              terms: [
                { ref: objectiveRef('x'), coefficient: rational(-2n, 3n) },
                { ref: objectiveRef('y'), coefficient: rational(4n, 9n) },
              ],
              lower: rational(-7n, 9n),
              upper: rational(-5n, 9n),
            },
          ],
        }));
        return solver['glpk'](s).error;
      };
      // LCM 9 and GCD 2 give the exact row -3*x + 2*y = -3.
      expect(solve(rational.zero)).toBeFalse();
      expect(solve(rational.one)).toBeTrue();
    });
  }

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

  it('uses prepared selected machines and passes immutable snapshots to the compiler', () => {
    const r = recipe('r');
    const s = state([r]);
    s.recipeObjectives = [
      objective('external', r, rational.one, ObjectiveType.Output, 'other'),
    ];
    s.itemValues['product'].out = rational.one;
    let descriptions: readonly CalculationVariable[] = [];
    s.modelContext = context((variables) => {
      descriptions = variables;
      expect(Object.isFrozen(variables)).toBeTrue();
      expect(Object.isFrozen(variables[0].recipe)).toBeTrue();
      expect(Object.isFrozen(variables[0].ref)).toBeTrue();
      return budget(variables, rational.zero);
    });
    const result = solver['glpk'](s);
    expect(result.error).toBeFalse();
    expect(result.recipes['r']).toBeUndefined();
    expect(result.cost).toEqual(rational.zero);
    expect(
      descriptions.map((v) => [v.ref.kind, v.ref.id, v.recipeId, v.machineId]),
    ).toEqual([
      ['recipe', 'r', 'r', 'limited'],
      ['objective', 'external', 'r', 'other'],
    ]);
    expect(r.producers).toContain('limited');
  });

  it('allows a selected continuous exception while including it in the budget', () => {
    const s = state();
    s.modelContext = context((variables) =>
      budget(variables, rational.one, false),
    );
    const result = solver['glpk'](s);
    expect(result.error).toBeFalse();
    expect(result.recipes['r']).toEqual(rational(1n, 2n));

    const limited = state();
    limited.modelContext = context((variables) =>
      budget(variables, rational(1n, 4n), false),
    );
    expect(solver['glpk'](limited).error).toBeTrue();
  });

  it('keeps a fractional exception in a mixed-integer shared budget', () => {
    const integral = recipe('integral', rational(2));
    const fractional = recipe('fractional');
    const rules = (
      variables: readonly CalculationVariable[],
      cap: Rational,
    ): ModelRules => ({
      ...budget(variables, cap, false),
      integers: variables
        .filter(({ recipeId }) => recipeId === 'integral')
        .map(({ ref }) => ref),
    });
    const s = state([integral, fractional]);
    s.modelContext = context((variables) => rules(variables, rational.one), {
      integral: 'limited',
      fractional: 'limited',
    });
    const result = solver['glpk'](s);
    expect(result.error).toBeFalse();
    expect(result.recipes['integral']).toBeUndefined();
    expect(result.recipes['fractional']).toEqual(rational(1n, 2n));
    expect(result.cost).toEqual(rational(1n, 2n));

    const limited = state([integral, fractional]);
    limited.modelContext = context(
      (variables) => rules(variables, rational(1n, 4n)),
      { integral: 'limited', fractional: 'limited' },
    );
    expect(solver['glpk'](limited).error).toBeTrue();
  });

  it('projects mixed bounds without excluding a valid fractional exception', () => {
    const x = recipe('fixed');
    x.out = {};
    x.output = {};
    x.produces = new Set();
    const exception = recipe('exception');
    const compile = (
      variables: readonly CalculationVariable[],
      cap: Rational,
    ): ModelRules => ({
      constraints: [
        {
          id: 'mixed',
          source: 'fixture',
          upper: cap,
          terms: variables.map(({ ref }) => ({
            ref,
            coefficient: rational.one,
          })),
        },
      ],
      integers: [objectiveRef('fixed')],
    });
    const s = state([exception]);
    s.recipeObjectives = [objective('fixed', x, rational.one)];
    s.modelContext = context(
      (variables) => compile(variables, rational(3n, 2n)),
      { exception: 'limited' },
    );
    const result = solver['glpk'](s);
    expect(result.error).toBeFalse();
    expect(result.recipes['exception']).toEqual(rational(1n, 2n));
    expect(result.cost).toEqual(rational(1n, 2n));

    const tooSmall = state([exception]);
    tooSmall.itemValues = {};
    tooSmall.recipeObjectives = [objective('fixed', x, rational.one)];
    tooSmall.modelContext = context(
      (variables) =>
        compile(variables, rational(99999999999999999n, 100000000000000000n)),
      { exception: 'limited' },
    );
    const rejected = solver['glpk'](tooSmall);
    expect(rejected.error).toBeTrue();
    expect(rejected.status).not.toBe('optimal');
  });

  it('moves fixed continuous terms exactly before normalizing integer rows', () => {
    const x = recipe('x');
    const exception = recipe('exception');
    const solve = (cap: Rational): boolean => {
      const s = state([]);
      s.itemValues = {};
      s.recipeObjectives = [
        objective('x', x, rational.one),
        objective('fraction', exception, rational(1n, 2n)),
      ];
      s.modelContext = context(() => ({
        constraints: [
          {
            id: 'mixed-fixed',
            source: 'fixture',
            upper: cap,
            terms: [
              { ref: objectiveRef('x'), coefficient: rational.one },
              { ref: objectiveRef('fraction'), coefficient: rational.one },
            ],
          },
        ],
        integers: [objectiveRef('x')],
      }));
      return solver['glpk'](s).error;
    };
    expect(solve(rational(3n, 2n))).toBeFalse();
    expect(
      solve(rational(149999999999999999n, 100000000000000000n)),
    ).toBeTrue();
  });

  it('does not invent a bound for a negative unbounded continuous contribution', () => {
    const x = recipe('fixed');
    x.out = {};
    x.output = {};
    x.produces = new Set();
    const exception = recipe('exception');
    const compile = (): ModelRules => ({
      constraints: [
        {
          id: 'negative',
          source: 'fixture',
          upper: rational.zero,
          terms: [
            { ref: objectiveRef('fixed'), coefficient: rational.one },
            { ref: recipeRef('exception'), coefficient: rational(-1) },
          ],
        },
      ],
      integers: [objectiveRef('fixed')],
    });
    const s = state([exception]);
    s.itemValues['product'].out = rational.one;
    s.recipeObjectives = [objective('fixed', x, rational.one)];
    s.modelContext = context(compile, { exception: 'limited' });
    const result = solver['glpk'](s);
    expect(result.error).toBeFalse();
    expect(result.recipes['exception']).toEqual(rational.one);

    const limited = state([exception]);
    limited.itemValues['product'].out = rational.one;
    limited.recipeObjectives = [objective('fixed', x, rational.one)];
    limited.recipeLimits['exception'] = rational(1n, 2n);
    limited.modelContext = context(compile, { exception: 'limited' });
    expect(solver['glpk'](limited).error).toBeTrue();
  });

  it('matches exact enumeration for mixed rows with a bounded continuous variable', () => {
    const x = recipe('x');
    const y = recipe('y');
    const exception = recipe('exception', rational.zero);
    const coeffs = [-3n, -2n, -1n, 1n, 2n, 3n];
    for (let index = 0; index < 36; index++) {
      const xValue = rational(index % 3);
      const yValue = rational(Math.floor(index / 3) % 3);
      const a = rational(coeffs[index % coeffs.length], 3n);
      const b = rational(coeffs[Math.floor(index / 6)], 3n);
      const c = rational(index % 2 ? 1n : -1n, 2n);
      const lower = rational(BigInt((index % 7) - 3), 2n);
      const upper = lower.add(rational(1n, 2n));
      const base = a.mul(xValue).add(b.mul(yValue));
      const extreme = c.mul(rational(2));
      const min = base.add(extreme.lt(rational.zero) ? extreme : rational.zero);
      const max = base.add(extreme.gt(rational.zero) ? extreme : rational.zero);
      const expectedFeasible = min.lte(upper) && max.gte(lower);
      for (const algorithm of ['simplex', 'exact'] as const) {
        const s = state([exception]);
        s.itemValues = {};
        s.glpkAlgorithm = algorithm;
        s.recipeLimits['exception'] = rational(2);
        s.recipeObjectives = [
          objective('x', x, xValue),
          objective('y', y, yValue),
        ];
        s.modelContext = context(
          () => ({
            integers: [objectiveRef('x'), objectiveRef('y')],
            constraints: [
              {
                id: 'enumerated',
                source: 'fixture',
                lower,
                upper,
                terms: [
                  { ref: objectiveRef('x'), coefficient: a },
                  { ref: objectiveRef('y'), coefficient: b },
                  { ref: recipeRef('exception'), coefficient: c },
                ],
              },
            ],
          }),
          { exception: 'limited' },
        );
        const result = solver['glpk'](s);
        expect(!result.error)
          .withContext(`case ${index}, ${algorithm}`)
          .toBe(expectedFeasible);
      }
    }
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
            source: 'fixture',
            terms: variables.map(({ ref, recipeId }) => ({
              ref,
              coefficient: rational(recipeId === 'remote' ? 3 : 1),
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
            source: 'fixture',
            terms: variables.map(({ ref }) => ({
              ref,
              coefficient: rational.one,
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
    const empty: LinearRule = {
      id: 'empty',
      source: 'fixture',
      terms: [],
      lower: rational.one,
    };
    const s = state();
    s.modelContext = context(() => ({ constraints: [empty], integers: [] }));
    expect(solver['glpk'](s).status).toBe('no_feasible');
    expect(() =>
      run({ constraints: [], integers: [recipeRef('missing')] }),
    ).toThrowError(/Missing model binding/);
    expect(() =>
      run({
        constraints: [
          {
            ...empty,
            terms: [
              { ref: recipeRef('r'), coefficient: rational.one },
              { ref: recipeRef('r'), coefficient: rational.one },
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
            terms: [
              { ref: objectiveRef('missing'), coefficient: rational.zero },
            ],
          },
        ],
        integers: [],
      }),
    ).toThrowError(/Missing model binding/);
    expect(() =>
      run({
        constraints: [
          {
            ...empty,
            terms: [
              { ref: recipeRef('r'), coefficient: rational(10n ** 400n) },
            ],
          },
        ],
        integers: [],
      }),
    ).toThrowError(/Non-finite/);
    expect(() =>
      run({
        constraints: [{ ...empty, lower: rational(2), upper: rational.one }],
        integers: [],
      }),
    ).toThrowError(/Inverted bounds/);
    expect(() =>
      run({
        constraints: [{ ...empty, lower: null as unknown as Rational }],
        integers: [],
      }),
    ).toThrowError(/Invalid lower bound/);

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

  it('reads maximize, unproduceable, excluded and input values from the MIP solution', () => {
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
    expect(s.itemValues['input'].in).toEqual(rational(1n, 2n));
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
    const s = state();
    s.modelContext = context((variables) =>
      budget(variables, rational(1n, 2n)),
    );
    const result = solver['glpk'](s);
    expect(result.error).toBeTrue();
    expect(result.status).not.toBe('optimal');
  });

  it('fails closed if the reported MIP objective differs from the variable values', () => {
    spyOnProperty(Model.prototype, 'valueMIP', 'get').and.returnValue(999);
    const s = state();
    s.modelContext = context((variables) => budget(variables, rational.one));
    expect(() => solver['glpk'](s)).toThrowError(/objective does not match/);
  });

  it('uses the same normalized integer in validation, cost and displayed quantities', () => {
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

  it('rejects integer rows whose normalized coefficients or bounds are unsafe', () => {
    const s = state([recipe('x'), recipe('y')]);
    s.itemValues = {};
    const refs = [recipeRef('x'), recipeRef('y')];
    s.modelContext = context(
      () => ({
        integers: refs,
        constraints: [
          {
            id: 'unsafe-coefficient',
            source: 'fixture',
            upper: rational.one,
            terms: [
              { ref: refs[0], coefficient: rational(9007199254740992n) },
              { ref: refs[1], coefficient: rational.one },
            ],
          },
        ],
      }),
      { x: 'limited', y: 'limited' },
    );
    expect(() => solver['glpk'](s)).toThrowError(/safe numeric range/);

    const t = state();
    t.modelContext = context(() => ({
      integers: [recipeRef('r')],
      constraints: [
        {
          id: 'unsafe-bound',
          source: 'fixture',
          upper: rational(9007199254740992n),
          terms: [{ ref: recipeRef('r'), coefficient: rational.one }],
        },
      ],
    }));
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
});
