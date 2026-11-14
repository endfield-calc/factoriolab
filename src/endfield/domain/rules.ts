import type { Recipe } from '~/data/schema/recipe';
import type {
  CalculationVariable,
  DerivedObjective,
  LinearRule,
  ModelRules,
  ModelVariableRef,
} from '~/extensions/calculation-extension';
import { Rational, rational } from '~/rational/rational';
import { ObjectiveType } from '~/state/objectives/objective-type';
import { ObjectiveUnit } from '~/state/objectives/objective-unit';

import {
  EndfieldState,
  ovenId,
  resourceIds,
  resourceLimitId,
  resourceObjectiveId,
  resourceRecipes,
} from './model';

const transferKey = 'domain_key_tundra';
const hourlyTransfer = rational(1, 3600);

/** Identify transfers from their original input, before recipe adjustment. */
export function tundraTransferRecipeIds(
  recipes: Readonly<Record<string, Pick<Recipe, 'id' | 'in'>>>,
): ReadonlySet<string> {
  return new Set(
    Object.values(recipes)
      .filter((recipe) => recipe.in[transferKey]?.gt(rational.zero))
      .map((recipe) => recipe.id),
  );
}

/** Values with fixedOutput are physical rates until the caller prepares the recipe. */
export function deriveEndfieldObjectives(
  state: EndfieldState,
): DerivedObjective[] {
  const result: DerivedObjective[] = [];
  if (state.resourceLimits.enabled) {
    for (const id of resourceIds) {
      const targetId = resourceRecipes[id];
      result.push({
        objective: {
          id: resourceLimitId(id),
          targetId,
          value: rational.zero,
          unit: ObjectiveUnit.Machines,
          type: ObjectiveType.Limit,
        },
      });
      const rate = state.resourceLimits.rates[id];
      if (rate.gt(rational.zero)) {
        const settings = state.resourceRecipeSettings[id];
        result.push({
          objective: {
            ...settings,
            id: resourceObjectiveId(id),
            targetId,
            value: rational.zero,
            unit: ObjectiveUnit.Machines,
            type: ObjectiveType.Output,
          },
          fixedOutput: { itemId: id, perSecond: rate },
        });
      }
    }
  }

  if (state.transfer.enabled) {
    result.push({
      objective: {
        id: 'ef:transfer:tundra:input',
        targetId: transferKey,
        value: hourlyTransfer,
        unit: ObjectiveUnit.Items,
        type: ObjectiveType.Input,
      },
      fixedRate: hourlyTransfer,
    });
  }
  const transferLimit = state.transfer.enabled ? hourlyTransfer : rational.zero;
  result.push({
    objective: {
      id: 'ef:transfer:tundra:limit',
      targetId: transferKey,
      value: transferLimit,
      unit: ObjectiveUnit.Items,
      type: ObjectiveType.Limit,
    },
    fixedRate: transferLimit,
  });
  return result;
}

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
    selected.map(({ ref }) => ({ ref, coefficient: rational.one }));

  if (availability != null) {
    for (const variable of variables) {
      if (
        !availability.recipeIds.has(variable.recipeId) ||
        (variable.machineId != null &&
          !availability.machineIds.has(variable.machineId))
      )
        constraints.push({
          id: `ef:availability:${variable.ref.kind}:${variable.ref.id}`,
          source: 'availability',
          terms: [{ ref: variable.ref, coefficient: rational.one }],
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
      source: 'machine-limit',
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
    source: 'transfer',
    terms: terms(transfer),
    upper: state.transfer.enabled ? rational.one : rational.zero,
  });

  const water = variables.filter(
    (variable) => variable.recipeId === 'sewage-treat',
  );
  const waterExport = variables.filter(
    (variable) => variable.recipeId === 'sewage-treat-export',
  );
  constraints.push(
    {
      id: 'ef:water:local',
      source: 'water',
      terms: terms(water),
      upper: rational(3),
    },
    {
      id: 'ef:water:export',
      source: 'water',
      terms: terms(waterExport),
      upper: rational.one,
    },
    {
      id: 'ef:water:shared',
      source: 'water',
      terms: [
        ...terms(water),
        ...waterExport.map(({ ref }) => ({ ref, coefficient: rational(3) })),
      ],
      upper: rational(3),
    },
  );
  return { constraints, integers };
}
