import rawData from '/public/data/aef/data.json';
import { ModData } from '~/data/schema/mod-data';
import { parseRecipe } from '~/data/schema/recipe';
import { tundraTransferRecipeIds } from '~/endfield/adapters/calculation-extension';
import { Rational, rational } from '~/rational/rational';
import type {
  CalculationVariable,
  LinearRule,
  ModelRules,
} from '~/solver/model-extension';

import { createEndfieldState, EndfieldState, ovenId } from './model';
import { compileEndfieldRules as compileRules } from './rules';

const transferIds = tundraTransferRecipeIds(
  Object.fromEntries(
    (rawData as unknown as ModData).recipes.map((raw) => [
      raw.id,
      parseRecipe(raw),
    ]),
  ),
);

function compileEndfieldRules(
  state: EndfieldState,
  variables: readonly CalculationVariable[],
  availability?: {
    readonly recipeIds: ReadonlySet<string>;
    readonly machineIds: ReadonlySet<string>;
  },
): ModelRules {
  return compileRules(state, variables, {
    transferRecipeIds: transferIds,
    availability,
  });
}

function variable(
  kind: 'recipe' | 'objective',
  id: string,
  recipeId: string,
  machineId?: string,
): CalculationVariable {
  return {
    ref: { kind, id },
    recipeId,
    machineId,
  };
}

function rule(rules: ModelRules, id: string): LinearRule {
  const value = rules.constraints.find((constraint) => constraint.id === id);
  if (value == null) throw new Error(`Missing rule ${id}`);
  return value;
}

function total(
  constraint: LinearRule,
  values: Readonly<Record<string, Rational>>,
): Rational {
  return constraint.terms.reduce(
    (sum, term) =>
      sum.add((values[term.ref.id] ?? rational.zero).mul(term.coefficient)),
    rational.zero,
  );
}

describe('Endfield model rules', () => {
  it('counts actual machines for ordinary and explicit variables and keeps the exception fractional', () => {
    const initial = createEndfieldState();
    const state = {
      ...initial,
      machineLimits: { enabled: true, limits: { [ovenId]: rational(4) } },
    };
    const variables = [
      variable('recipe', 'ordinary', 'a', ovenId),
      variable('objective', 'explicit', 'a', ovenId),
      variable('recipe', 'fractional', 'xiranite_enr_powder', ovenId),
      variable('recipe', 'other-machine', 'a', 'other'),
    ];
    const result = compileEndfieldRules(state, variables);
    const limit = rule(result, `ef:machine:${ovenId}`);
    expect(limit.terms.map((term) => term.ref.id)).toEqual([
      'ordinary',
      'explicit',
      'fractional',
    ]);
    expect(limit.upper).toEqual(rational(4));
    expect(
      total(limit, {
        ordinary: rational(2),
        explicit: rational(2),
        fractional: rational(1, 2),
        'other-machine': rational(100),
      }).gt(limit.upper!),
    ).toBeTrue();
    expect(result.integers).toEqual([variables[0].ref, variables[1].ref]);
    expect(compileEndfieldRules(initial, variables).integers).toEqual([]);
  });

  it('rejects unrecognized or missing machine limits rather than applying undefined integrality', () => {
    const initial = createEndfieldState();
    const water = variable(
      'recipe',
      'water',
      'sewage-treat',
      'liquid_clean_gate',
    );
    const unknown = {
      ...initial,
      machineLimits: {
        enabled: false,
        limits: { liquid_clean_gate: rational.one },
      },
    };
    expect(() => compileEndfieldRules(unknown, [water])).toThrowError(
      'Unknown machine limit ID: liquid_clean_gate',
    );
    const missing = {
      ...initial,
      machineLimits: { enabled: true, limits: {} },
    };
    expect(() => compileEndfieldRules(missing, [water])).toThrowError(
      `Missing machine limit: ${ovenId}`,
    );
    const enabled = {
      ...initial,
      machineLimits: { enabled: true, limits: { [ovenId]: rational(12) } },
    };
    expect(compileEndfieldRules(enabled, [water]).integers).toEqual([]);
  });

  it('applies transfer rules to identified recipe IDs rather than recipe names', () => {
    const ids = new Set(['renamed']);
    const result = compileRules(
      createEndfieldState(),
      [
        variable('recipe', 'real', 'renamed'),
        variable('objective', 'fake', 'transfer_tundra_fake'),
      ],
      { transferRecipeIds: ids },
    );
    expect(result.integers).toEqual([{ kind: 'recipe', id: 'real' }]);
    expect(
      rule(result, 'ef:transfer:tundra').terms.map((term) => term.ref.id),
    ).toEqual(['real']);
  });

  it('enforces every fixed transfer recipe as an integer with a shared enabled or disabled budget', () => {
    expect(transferIds.size).toBe(59);
    const variables = [...transferIds].map((id, index) =>
      variable(index % 2 ? 'objective' : 'recipe', `v${index}`, id),
    );
    variables.push(variable('recipe', 'unlisted', 'transfer_tundra_unlisted'));
    const initial = createEndfieldState();
    const enabled = compileEndfieldRules(
      { ...initial, transfer: { enabled: true, source: 'tundra' } },
      variables,
    );
    const budget = rule(enabled, 'ef:transfer:tundra');
    expect(budget.terms.length).toBe(59);
    expect(enabled.integers.length).toBe(59);
    expect(enabled.integers.some((ref) => ref.id === 'unlisted')).toBeFalse();
    expect(total(budget, { v0: rational(1, 2) }).lte(budget.upper!)).toBeTrue();
    expect(enabled.integers).toContain(variables[0].ref);
    expect(
      total(budget, { v0: rational.one, v1: rational.one }).gt(budget.upper!),
    ).toBeTrue();
    const disabled = compileEndfieldRules(initial, variables);
    expect(rule(disabled, 'ef:transfer:tundra').upper).toEqual(rational.zero);
    expect(disabled.integers.length).toBe(59);
  });

  it('applies the shared water limit to sparse and explicit variables without integrality', () => {
    const state = createEndfieldState();
    const local = variable('recipe', 'local', 'sewage-treat');
    const localExplicit = variable(
      'objective',
      'local-explicit',
      'sewage-treat',
    );
    const exported = variable('objective', 'export', 'sewage-treat-export');
    const both = compileEndfieldRules(state, [local, localExplicit, exported]);
    const shared = rule(both, 'ef:water:shared');
    expect(
      both.constraints.filter((row) => row.id.startsWith('ef:water:')),
    ).toEqual([shared]);
    expect(shared.upper).toEqual(rational(3));
    expect(shared.terms.map((term) => term.ref)).toEqual([
      local.ref,
      localExplicit.ref,
      exported.ref,
    ]);
    expect(shared.terms.map((term) => term.coefficient)).toEqual([
      rational.one,
      rational.one,
      rational(3),
    ]);
    expect(
      total(shared, {
        local: rational(2),
        'local-explicit': rational.one,
        export: rational(1, 10),
      }).gt(shared.upper!),
    ).toBeTrue();
    expect(both.integers).toEqual([]);

    const justExport = compileEndfieldRules(state, [exported]);
    expect(rule(justExport, 'ef:water:shared').terms[0].ref).toEqual(
      exported.ref,
    );
    expect(rule(justExport, 'ef:water:shared').terms[0].coefficient).toEqual(
      rational(3),
    );
    const justLocal = compileEndfieldRules(state, [local]);
    expect(rule(justLocal, 'ef:water:shared').terms[0].ref).toEqual(local.ref);
    expect(
      rule(compileEndfieldRules(state, []), 'ef:water:shared').terms,
    ).toEqual([]);
  });

  it('rejects negative and non-rational physical machine limits', () => {
    const state = createEndfieldState();
    for (const limit of [rational(-1), 'bad' as unknown as Rational]) {
      expect(() =>
        compileEndfieldRules(
          {
            ...state,
            machineLimits: { enabled: false, limits: { [ovenId]: limit } },
          },
          [],
        ),
      ).toThrowError(`Invalid machine limit: ${ovenId}`);
    }
  });

  it('blocks unavailable recipes or machines for automatic and explicit variables', () => {
    const state = createEndfieldState();
    const rows = [
      variable('recipe', 'automatic', 'iron_ore', 'miner'),
      variable('objective', 'explicit', 'iron_ore', 'miner'),
      variable('recipe', 'no-machine', 'iron_ore'),
      variable('objective', 'elsewhere', 'copper_ore', 'miner'),
    ];
    const availability = {
      recipeIds: new Set(['iron_ore']),
      machineIds: new Set(['miner']),
    };
    const sameRegion = compileEndfieldRules(
      state,
      rows,
      availability,
    ).constraints.filter((constraint) =>
      constraint.id.startsWith('ef:availability:'),
    );
    expect(sameRegion.map((constraint) => constraint.terms[0].ref.id)).toEqual([
      'elsewhere',
    ]);
    expect(sameRegion[0].upper).toEqual(rational.zero);
    const missingMachine = compileEndfieldRules(state, rows, {
      ...availability,
      machineIds: new Set(),
    }).constraints.filter((constraint) =>
      constraint.id.startsWith('ef:availability:'),
    );
    expect(
      missingMachine.map((constraint) => constraint.terms[0].ref.id),
    ).toEqual(['automatic', 'explicit', 'elsewhere']);
    const emptyRegion = compileEndfieldRules(state, rows, {
      recipeIds: new Set(),
      machineIds: new Set(),
    }).constraints.filter((constraint) =>
      constraint.id.startsWith('ef:availability:'),
    );
    expect(emptyRegion.length).toBe(4);
    expect(
      compileEndfieldRules(state, rows).constraints.some((constraint) =>
        constraint.id.startsWith('ef:availability:'),
      ),
    ).toBeFalse();
  });
});
