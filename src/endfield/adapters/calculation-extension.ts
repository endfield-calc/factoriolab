import { inject, Service } from '@angular/core';

import { Recipe } from '~/data/schema/recipe';
import { CalculationExtension } from '~/extensions/calculation-extension';
import { Adjustment } from '~/state/adjustment';
import { ItemSettings } from '~/state/items/item-settings';
import { MachineSettings } from '~/state/machines/machine-settings';
import {
  ObjectiveSettings,
  ObjectiveState,
} from '~/state/objectives/objective';
import { RecipeSettings } from '~/state/recipes/recipe-settings';
import { CostSettings } from '~/state/settings/cost-settings';
import { AdjustedDataset, Dataset } from '~/state/settings/dataset';
import { Settings } from '~/state/settings/settings';

import { calculateEndfieldRecipeCost } from '../domain/cost';
import { EndfieldState } from '../domain/model';
import {
  compileEndfieldRules,
  deriveEndfieldObjectives,
} from '../domain/rules';
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
    const electric = this.endfieldStore.snapshot().electric;
    for (const recipe of Object.values(adjustedRecipe)) {
      const recipeSettings = recipes[recipe.id];
      recipe.cost = calculateEndfieldRecipeCost({
        raw: data.recipeRecord[recipe.id],
        recipeSettings,
        machine:
          recipeSettings.machineId == null
            ? undefined
            : data.machineRecord[recipeSettings.machineId],
        costs,
        electric,
      });
    }
  }

  override adjustObjective(
    objective: ObjectiveState,
    items: Record<string, ItemSettings>,
    recipes: Record<string, RecipeSettings>,
    machines: Record<string, MachineSettings>,
    settings: Settings,
    data: AdjustedDataset,
  ): ObjectiveSettings {
    const result = super.adjustObjective(
      objective,
      items,
      recipes,
      machines,
      settings,
      data,
    );
    if (result.recipe != null) {
      result.recipe.cost = calculateEndfieldRecipeCost({
        raw: data.recipeRecord[result.targetId],
        recipeSettings: result,
        machine:
          result.machineId == null
            ? undefined
            : data.machineRecord[result.machineId],
        costs: settings.costs,
        electric: this.endfieldStore.snapshot().electric,
      });
    }
    return result;
  }
}

/** Derivation and rule compilation consume the caller's immutable values. */
export const endfieldCalculation: CalculationExtension = {
  derive: ({ extension, objectives }) => {
    const state = extension as EndfieldState;
    if (
      !objectives.length &&
      !state.resourceLimits.enabled &&
      !state.machineLimits.enabled &&
      !state.transfer.enabled
    )
      return [];
    return deriveEndfieldObjectives(state);
  },
  rules: ({ extension, settings, data }, variables) =>
    compileEndfieldRules(extension as EndfieldState, variables, {
      recipeIds: settings.availableRecipeIds,
      machineIds: new Set(
        Object.entries(data.machineRecord)
          .filter(
            ([id, machine]) =>
              settings.availableItemIds.has(id) &&
              (machine.locations == null ||
                machine.locations.some((location) =>
                  settings.locationIds.has(location),
                )),
          )
          .map(([id]) => id),
      ),
    }),
};
