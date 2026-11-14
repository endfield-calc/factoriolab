import { inject, Service } from '@angular/core';

import { Recipe } from '~/data/schema/recipe';
import { Adjustment } from '~/state/adjustment';
import { RecipeSettings } from '~/state/recipes/recipe-settings';
import { CostSettings } from '~/state/settings/cost-settings';
import { Dataset } from '~/state/settings/dataset';

import { calculateEndfieldRecipeCost } from '../domain/cost';
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
}
