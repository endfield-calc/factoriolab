import { CalculationExtension } from '~/extensions/calculation-extension';

import { calculateEndfieldRecipeCost } from '../domain/cost';
import { EndfieldState } from '../domain/model';
import {
  compileEndfieldRules,
  deriveEndfieldObjectives,
} from '../domain/rules';

/** No injected services: all three phases consume the caller's immutable values. */
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
  cost: ({ raw, recipeSettings, settings, data, extension }) =>
    calculateEndfieldRecipeCost({
      raw,
      recipeSettings,
      machine:
        recipeSettings.machineId == null
          ? undefined
          : data.machineRecord[recipeSettings.machineId],
      costs: settings.costs,
      electric: (extension as EndfieldState).electric,
    }),
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
