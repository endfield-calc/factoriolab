import { computed, inject, Service } from '@angular/core';

import { AdjustedRecipe } from '~/data/schema/recipe';
import {
  CALCULATION_EXTENSION,
  RecipeCostInput,
  upstreamCalculation,
} from '~/extensions/calculation-extension';
import { immutableValue } from '~/extensions/immutable';
import { STATE_EXTENSION } from '~/extensions/state-extension';
import { Rational, rational } from '~/rational/rational';
import { ObjectiveSettings } from '~/state/objectives/objective';
import { spread } from '~/utils/object';

import { Adjustment } from '../adjustment';
import { ItemsStore } from '../items/items-store';
import { MachineState } from '../machines/machine-state';
import { MachinesStore } from '../machines/machines-store';
import { Dataset } from '../settings/dataset';
import { Settings } from '../settings/settings';
import { SettingsStore } from '../settings/settings-store';
import { RecordStore } from '../store';
import { RecipeSettings } from './recipe-settings';
import { RecipeState } from './recipe-state';

@Service()
export class RecipesStore extends RecordStore<RecipeState> {
  private readonly adjustment = inject(Adjustment);
  private readonly itemsStore = inject(ItemsStore);
  private readonly machinesStore = inject(MachinesStore);
  private readonly settingsStore = inject(SettingsStore);
  private readonly calculation = inject(CALCULATION_EXTENSION);
  private readonly extension = inject(STATE_EXTENSION);

  readonly settings = computed(() =>
    this.computeRecipesSettings(
      this.state(),
      this.machinesStore.settings(),
      this.settingsStore.settings(),
      this.settingsStore.dataset(),
    ),
  );

  readonly adjustedDataset = computed(() => {
    const recipesState = this.settings();
    const itemsState = this.itemsStore.settings();
    const settings = this.settingsStore.settings();
    const data = this.settingsStore.dataset();

    const adjusted = this.adjustment.adjustDataset(
      recipesState,
      itemsState,
      settings,
      data,
    );
    if (this.calculation === upstreamCalculation) return adjusted;
    const context = immutableValue({
      data: adjusted,
      settings,
      extension: this.extension.snapshot(),
    });
    const adjustedRecipe = Object.fromEntries(
      Object.keys(adjusted.adjustedRecipe).map((id) => [
        id,
        this.overrideCost(
          id,
          adjusted.adjustedRecipe[id],
          recipesState[id],
          context,
        ),
      ]),
    );
    return { ...adjusted, adjustedRecipe };
  });

  private readonly costContext = computed(() =>
    immutableValue({
      data: this.adjustedDataset(),
      settings: this.settingsStore.settings(),
      extension: this.extension.snapshot(),
    }),
  );

  /** Apply the same cost policy to independently adjusted recipe objectives. */
  applyObjectiveCost(objective: ObjectiveSettings): ObjectiveSettings {
    if (this.calculation === upstreamCalculation || objective.recipe == null)
      return objective;
    return {
      ...objective,
      recipe: this.overrideCost(
        objective.targetId,
        objective.recipe,
        objective,
        this.costContext(),
      ),
    };
  }

  private overrideCost(
    id: string,
    recipe: AdjustedRecipe,
    recipeSettings: RecipeSettings,
    context: Pick<RecipeCostInput, 'data' | 'settings' | 'extension'>,
  ): AdjustedRecipe {
    const input = Object.freeze({
      ...context,
      ...immutableValue({ adjusted: recipe, recipeSettings }),
      raw: context.data.recipeRecord[id],
    });
    return { ...recipe, cost: this.calculation.cost(input) };
  }

  readonly inserterSpeed = computed(() => {
    const data = this.adjustedDataset();
    const options = this.settingsStore.options();
    const dispRateInfo = this.settingsStore.displayRateInfo();

    return (
      options.inserters
        .map((opt) => opt.value)
        .map<[string, Rational]>((id) => {
          // Calculate items/s for each inserter
          const inserter = data.adjustedInserter[id];
          const rotationsPerSec = inserter.speed.div(rational(360n));
          const speed = rotationsPerSec
            .mul(inserter.stack)
            .mul(dispRateInfo.value);
          return [id, speed];
        })
        // Sort inserter id/speed tuples
        .sort(([_aKey, aSpd], [_bKey, bSpd]) => aSpd.sub(bSpd).toNumber())
        // Map to tuples into record after sorting
        .reduce<Record<string, Rational>>((result, [id, speed]) => {
          result[id] = speed;
          return result;
        }, {})
    );
  });

  /** Prepare a restoration snapshot without changing live store state. */
  prepareSettings(
    state: Record<string, RecipeState>,
    machines: Record<string, MachineState>,
    settings: Settings,
    data: Dataset,
  ): Record<string, RecipeSettings> {
    return this.computeRecipesSettings(state, machines, settings, data);
  }

  private computeRecipesSettings(
    state: Record<string, RecipeState>,
    machines: Record<string, MachineState>,
    settings: Settings,
    data: Dataset,
  ): Record<string, RecipeSettings> {
    return data.recipeIds
      .map((i) => data.recipeRecord[i])
      .reduce<Record<string, RecipeSettings>>((rec, recipe) => {
        const s: RecipeSettings = spread(state[recipe.id]);
        this.adjustment.computeRecipeSettings(
          s,
          recipe,
          machines,
          settings,
          data,
        );

        rec[recipe.id] = s;
        return rec;
      }, {});
  }
}
