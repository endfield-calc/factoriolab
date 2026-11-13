import { inject, Service } from '@angular/core';

import { ModData } from '~/data/schema/mod-data';
import { ModHash } from '~/data/schema/mod-hash';
import { Adjustment } from '~/state/adjustment';
import { ItemsStore } from '~/state/items/items-store';
import { MachinesStore } from '~/state/machines/machines-store';
import {
  isRecipeObjective,
  ObjectiveSettings,
} from '~/state/objectives/objective';
import { RecipesStore } from '~/state/recipes/recipes-store';
import { SettingsStore } from '~/state/settings/settings-store';

import { immutableValue, ReadonlyValue } from './immutable';
import { WorkspaceState } from './state-extension';

/** Reuse upstream preparation on detached restoration values, before commit. */
@Service()
export class WorkspacePreparation {
  private readonly settingsStore = inject(SettingsStore);
  private readonly itemsStore = inject(ItemsStore);
  private readonly machinesStore = inject(MachinesStore);
  private readonly recipesStore = inject(RecipesStore);
  private readonly adjustment = inject(Adjustment);

  prepareObjectives(
    workspace: WorkspaceState,
    modData: ModData,
    hash: ModHash,
    objectiveIds: readonly string[],
  ): ReadonlyValue<Record<string, ObjectiveSettings>> {
    const { settings, data } = this.settingsStore.prepareState(
      workspace.settingsState ?? {},
      modData,
      hash,
    );
    const items = this.itemsStore.prepareSettings(
      workspace.itemsState ?? {},
      settings,
      data,
    );
    const machines = this.machinesStore.prepareSettings(
      workspace.machinesState ?? {},
      settings,
      data,
    );
    const recipes = this.recipesStore.prepareSettings(
      workspace.recipesState ?? {},
      machines,
      settings,
      data,
    );
    const adjusted = this.adjustment.adjustDataset(
      recipes,
      items,
      settings,
      data,
    );
    const result: Record<string, ObjectiveSettings> = {};
    for (const id of objectiveIds) {
      const objective = workspace.objectivesState?.[id];
      // Compatibility validates missing/retired IDs before live objective filtering.
      if (
        objective != null &&
        isRecipeObjective(objective) &&
        data.recipeRecord[objective.targetId] != null
      )
        result[objective.id] = this.adjustment.adjustObjective(
          objective,
          items,
          recipes,
          machines,
          settings,
          adjusted,
        );
    }
    return immutableValue(result);
  }
}
