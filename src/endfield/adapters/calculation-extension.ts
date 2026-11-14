import { inject, Service } from '@angular/core';

import { Recipe } from '~/data/schema/recipe';
import { Rational, rational } from '~/rational/rational';
import { Adjustment } from '~/state/adjustment';
import {
  ObjectiveSettings,
  ObjectiveState,
} from '~/state/objectives/objective';
import { ObjectiveType } from '~/state/objectives/objective-type';
import { ObjectiveUnit } from '~/state/objectives/objective-unit';
import { RecipeSettings } from '~/state/recipes/recipe-settings';
import { CostSettings } from '~/state/settings/cost-settings';
import { Dataset } from '~/state/settings/dataset';

import { calculateEndfieldRecipeCost } from '../domain/cost';
import {
  EndfieldState,
  resourceIds,
  resourceLimitId,
  resourceObjectiveId,
  resourceRecipes,
} from '../domain/model';
import { EndfieldStore } from '../state/endfield-store';

/** Apply product costs at the upstream adjustment points. */
@Service()
export class EndfieldAdjustment extends Adjustment {
  private readonly endfieldStore = inject(EndfieldStore);

  override adjustCosts(
    adjustedRecipe: Record<string, Recipe>,
    recipes: Record<string, RecipeSettings>,
    costs: CostSettings,
    data: Dataset,
  ): void {
    const electric = this.endfieldStore.electric();
    for (const recipe of Object.values(adjustedRecipe)) {
      const recipeSettings = recipes[recipe.id];
      const raw = data.recipeRecord[recipe.id];
      const machine =
        recipeSettings.machineId == null
          ? undefined
          : data.machineRecord[recipeSettings.machineId];
      recipe.cost = calculateEndfieldRecipeCost({
        declaredCost: raw.cost,
        overrideCost: recipeSettings.cost,
        usage: machine?.usage,
        area:
          recipeSettings.cost == null &&
          raw.cost == null &&
          costs.footprint.nonzero() &&
          machine?.size != null
            ? rational(machine.size[0]).mul(rational(machine.size[1]))
            : undefined,
        recycling: raw.flags.has('recycling'),
        weights: costs,
        electric,
      });
    }
  }
}

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

/** Prepare native objectives while preserving source rates in physical units. */
export function prepareEndfieldObjectives(
  state: EndfieldState,
  adjust: (objective: ObjectiveState) => ObjectiveSettings,
  displayFactor: Rational,
): ObjectiveSettings[] {
  const result: ObjectiveSettings[] = [];
  if (state.resourceLimits.enabled) {
    for (const id of resourceIds) {
      const targetId = resourceRecipes[id];
      result.push(
        adjust({
          id: resourceLimitId(id),
          targetId,
          value: rational.zero,
          unit: ObjectiveUnit.Machines,
          type: ObjectiveType.Limit,
        }),
      );
      const rate = state.resourceLimits.rates[id];
      if (rate.gt(rational.zero)) {
        const settings = state.resourceRecipeSettings[id];
        const objective = adjust({
          ...settings,
          id: resourceObjectiveId(id),
          targetId,
          value: rational.zero,
          unit: ObjectiveUnit.Machines,
          type: ObjectiveType.Output,
        });
        const output = objective.recipe?.output[id];
        if (!output?.gt(rational.zero))
          throw new Error('Derived supply has no positive adjusted output');
        result.push({ ...objective, value: rate.div(output) });
      }
    }
  }

  if (state.transfer.enabled) {
    result.push(
      adjust({
        id: 'ef:transfer:tundra:input',
        targetId: transferKey,
        value: hourlyTransfer.mul(displayFactor),
        unit: ObjectiveUnit.Items,
        type: ObjectiveType.Input,
      }),
    );
  }
  const transferLimit = state.transfer.enabled ? hourlyTransfer : rational.zero;
  result.push(
    adjust({
      id: 'ef:transfer:tundra:limit',
      targetId: transferKey,
      value: transferLimit.mul(displayFactor),
      unit: ObjectiveUnit.Items,
      type: ObjectiveType.Limit,
    }),
  );
  return result;
}
