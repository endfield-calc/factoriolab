import { ModData } from '~/data/schema/mod-data';
import { WorkspaceState } from '~/extensions/state-extension';
import { Rational, rational } from '~/rational/rational';
import { ObjectiveType } from '~/state/objectives/objective-type';
import { ObjectiveUnit } from '~/state/objectives/objective-unit';
import { displayRateOptions } from '~/state/settings/display-rate';
import { maximizeTypeOptions } from '~/state/settings/maximize-type';
import { Preset } from '~/state/settings/preset';

import { invalid, validateEntity, validateRecipeReferences } from './codec';

/** Validate current workspace fields before publishing any of the candidate. */
export function validateCurrentWorkspace(
  state: WorkspaceState,
  data: ModData,
): void {
  const itemIds = new Set(data.items.map((item) => item.id));
  const recipeIds = new Set(data.recipes.map((recipe) => recipe.id));
  for (const [id, settings] of Object.entries(state.itemsState ?? {})) {
    if (!itemIds.has(id)) invalid(`items.${id}`, `Unknown item ID: ${id}`);
    if (settings.beltId != null)
      validateEntity(data, settings.beltId, 'belt', `items.${id}.beltId`);
    if (settings.wagonId != null)
      validateEntity(data, settings.wagonId, 'wagon', `items.${id}.wagonId`);
  }
  for (const [id, settings] of Object.entries(state.recipesState ?? {})) {
    if (!recipeIds.has(id))
      invalid(`recipes.${id}`, `Unknown recipe ID: ${id}`);
    validateRecipeReferences(settings, data, `recipes.${id}`, id);
  }
  for (const [id, settings] of Object.entries(state.machinesState ?? {})) {
    validateEntity(data, id, 'machine', `machines.${id}`);
    validateRecipeReferences(settings, data, `machines.${id}`);
  }
  const settings = state.settingsState;
  if (
    settings?.displayRate != null &&
    !displayRateOptions.some((option) => option.value === settings.displayRate)
  )
    invalid('settings.displayRate', 'Unknown display rate');
  if (
    settings?.maximizeType != null &&
    !maximizeTypeOptions.some(
      (option) => option.value === settings.maximizeType,
    )
  )
    invalid('settings.maximizeType', 'Unknown maximize type');
  if (settings?.preset != null) {
    const presets =
      data.defaults != null && 'presets' in data.defaults
        ? data.defaults.presets.map((preset) => preset.id)
        : [Preset.Minimum, Preset.Modules, Preset.Beacon8, Preset.Beacon12];
    if (!Number.isFinite(settings.preset) || !presets.includes(settings.preset))
      invalid('settings.preset', 'Unknown preset');
  }
  const table = state.tableState;
  if (table?.page != null && (!Number.isInteger(table.page) || table.page < 0))
    invalid('table.page', 'Expected a nonnegative integer page');
  if (table?.rows != null && (!Number.isInteger(table.rows) || table.rows <= 0))
    invalid('table.rows', 'Expected a positive integer row count');
  for (const key of ['checkedItemIds', 'excludedItemIds'] as const)
    for (const id of settings?.[key] ?? [])
      if (!itemIds.has(id))
        invalid(`settings.${key}`, `Unknown item ID: ${id}`);
  for (const key of ['checkedRecipeIds', 'excludedRecipeIds'] as const)
    for (const id of settings?.[key] ?? [])
      if (!recipeIds.has(id))
        invalid(`settings.${key}`, `Unknown recipe ID: ${id}`);
  for (const [key, kind] of [
    ['beltRankIds', 'belt'],
    ['wagonRankIds', 'wagon'],
    ['machineRankIds', 'machine'],
    ['fuelRankIds', 'fuel'],
    ['moduleRankIds', 'module'],
  ] as const)
    for (const id of settings?.[key] ?? [])
      validateEntity(data, id, kind, `settings.${key}`);
  for (const id of settings?.locationIds ?? [])
    if (!data.locations?.some((location) => location.id === id))
      invalid('settings.locationIds', `Unknown location ID: ${id}`);
  for (const id of settings?.researchedTechnologyIds ?? [])
    if (!data.items.some((item) => item.id === id && item.technology != null))
      invalid(
        'settings.researchedTechnologyIds',
        `Unknown technology ID: ${id}`,
      );
  if (settings?.proliferatorSprayId)
    validateEntity(
      data,
      settings.proliferatorSprayId,
      'module',
      'settings.proliferatorSprayId',
    );
  if (settings != null)
    validateRecipeReferences(
      { beacons: settings.beacons, overclock: settings.overclock },
      data,
      'settings',
    );

  for (const [id, objective] of Object.entries(state.objectivesState ?? {})) {
    switch (objective.type) {
      case ObjectiveType.Output:
      case ObjectiveType.Input:
      case ObjectiveType.Maximize:
      case ObjectiveType.Limit:
        break;
      default:
        continue;
    }
    const field = `objectives.${id}`;
    if (
      ![
        ObjectiveUnit.Items,
        ObjectiveUnit.Belts,
        ObjectiveUnit.Wagons,
        ObjectiveUnit.Machines,
      ].includes(objective.unit)
    )
      invalid(
        `${field}.unit`,
        `Unknown objective unit: ${String(objective.unit)}`,
      );
    const isRecipe = objective.unit === ObjectiveUnit.Machines;
    if (!(isRecipe ? recipeIds : itemIds).has(objective.targetId))
      invalid(
        `${field}.targetId`,
        `Unknown objective target: ${objective.targetId}`,
      );
    if (!(objective.value instanceof Rational))
      invalid(`${field}.value`, 'Expected a rational objective value');
    if (isRecipe && objective.value.lt(rational.zero))
      invalid(
        `${field}.value`,
        `Expected a nonnegative rational at ${field}.value`,
      );
    validateRecipeReferences(
      objective,
      data,
      field,
      isRecipe ? objective.targetId : undefined,
    );
  }
}
