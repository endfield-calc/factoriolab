import { Rational, rational } from '~/rational/rational';
import type {
  CalculationVariable,
  LinearRule,
  ModelRules,
  ModelVariableRef,
} from '~/solver/model-extension';

import { EndfieldState, ovenId } from './model';

/** Only variables actually present in the model can consume a shared budget. */
export function compileEndfieldRules(
  state: EndfieldState,
  variables: readonly CalculationVariable[],
  input: {
    readonly transferRecipeIds: ReadonlySet<string>;
    readonly availability?: {
      readonly recipeIds: ReadonlySet<string>;
      readonly machineIds: ReadonlySet<string>;
    };
  },
): ModelRules {
  const { availability, transferRecipeIds } = input;
  const constraints: LinearRule[] = [];
  const integers: ModelVariableRef[] = [];
  const integerKeys = new Set<string>();
  const addInteger = (ref: ModelVariableRef): void => {
    const key = JSON.stringify([ref.kind, ref.id]);
    if (!integerKeys.has(key)) {
      integers.push(ref);
      integerKeys.add(key);
    }
  };
  const terms = (
    selected: readonly CalculationVariable[],
  ): LinearRule['terms'] =>
    selected.map(({ ref }) => ({ ref, coefficient: 1 }));

  if (availability != null) {
    for (const variable of variables) {
      if (
        !availability.recipeIds.has(variable.recipeId) ||
        (variable.machineId != null &&
          !availability.machineIds.has(variable.machineId))
      )
        constraints.push({
          id: `ef:availability:${variable.ref.kind}:${variable.ref.id}`,
          terms: [{ ref: variable.ref, coefficient: 1 }],
          upper: rational.zero,
        });
    }
  }

  for (const [machineId, limit] of Object.entries(state.machineLimits.limits)) {
    if (machineId !== ovenId)
      throw new Error(`Unknown machine limit ID: ${machineId}`);
    if (!(limit instanceof Rational) || limit.lt(rational.zero))
      throw new Error(`Invalid machine limit: ${machineId}`);
  }
  if (state.machineLimits.enabled) {
    const limit = state.machineLimits.limits[ovenId];
    if (limit == null) throw new Error(`Missing machine limit: ${ovenId}`);
    const selected = variables.filter(
      (variable) => variable.machineId === ovenId,
    );
    constraints.push({
      id: `ef:machine:${ovenId}`,
      terms: terms(selected),
      upper: limit,
    });
    for (const variable of selected) {
      if (variable.recipeId !== 'xiranite_enr_powder') addInteger(variable.ref);
    }
  }

  const transfer = variables.filter((variable) =>
    transferRecipeIds.has(variable.recipeId),
  );
  for (const variable of transfer) addInteger(variable.ref);
  constraints.push({
    id: 'ef:transfer:tundra',
    terms: terms(transfer),
    upper: state.transfer.enabled ? rational.one : rational.zero,
  });

  const water = variables.filter(
    (variable) => variable.recipeId === 'sewage-treat',
  );
  const waterExport = variables.filter(
    (variable) => variable.recipeId === 'sewage-treat-export',
  );
  // All machine counts are nonnegative, so this also bounds local by 3 and
  // export by 1, including when either side has no variables.
  constraints.push({
    id: 'ef:water:shared',
    terms: [
      ...terms(water),
      ...waterExport.map(({ ref }) => ({ ref, coefficient: 3 as const })),
    ],
    upper: rational(3),
  });
  return { constraints, integers };
}
