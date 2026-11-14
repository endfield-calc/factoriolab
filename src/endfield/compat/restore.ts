import { ModData } from '~/data/schema/mod-data';
import { ModHash } from '~/data/schema/mod-hash';
import {
  copyResourceRecipeSettings,
  createEndfieldState,
  EndfieldState,
  ovenId,
  resourceIds,
  resourceOwner,
  resourceRecipes,
} from '~/endfield/domain/model';
import { immutableValue } from '~/extensions/immutable';
import {
  DecodedWorkspace,
  RestoreDiagnostic,
  RestoreInput,
  RestorePlan,
  StateExtension,
  WorkspaceState,
} from '~/extensions/state-extension';
import { Rational, rational } from '~/rational/rational';
import { ObjectiveState } from '~/state/objectives/objective';
import { ObjectiveUnit } from '~/state/objectives/objective-unit';
import { RecipeState } from '~/state/recipes/recipe-state';

import {
  decodeEndfield,
  historicalCostDefaults,
  invalid,
  parseNonnegative,
  validateEntity,
  validateRecipeReferences,
} from './codec';
import legacyDatasets from './legacy-datasets.json';
import legacyHash from './legacy-hash.json';

interface EndfieldRestoreContext {
  readonly legacy: boolean;
  readonly useHistoricalCostDefaults: boolean;
}

const frozenHash = immutableValue(legacyHash) as unknown as ModHash;
const frozenDatasets = immutableValue(
  legacyDatasets,
) as unknown as RestorePlan['legacyModHashes'];

export function prepareEndfield(input: RestoreInput): RestorePlan {
  const raw = input.params['v'];
  if (raw != null && typeof raw !== 'string')
    invalid('v', 'Invalid workspace version');
  const hasUrlState = Object.keys(input.params).length > 0;
  const legacy =
    raw == null ? hasUrlState : /^\d+$/.test(raw) && Number(raw) <= 11;
  const useHistoricalCostDefaults =
    hasUrlState && (raw == null || /^(?:[0-9]|1[0-2])$/.test(raw));
  return {
    ...input,
    context: {
      legacy,
      useHistoricalCostDefaults,
    } satisfies EndfieldRestoreContext,
    ...(legacy
      ? {
          hash: frozenHash,
          legacyModHashes: frozenDatasets,
          prepareObjectives: input.params['ef'] == null,
        }
      : {}),
  };
}

function validateOrdinarySettings(state: WorkspaceState, data: ModData): void {
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
}

function recipePart(objective: ObjectiveState): RecipeState {
  const { machineId, fuelId, modules, beacons, overclock, cost, productivity } =
    objective;
  return copyResourceRecipeSettings({
    ...(machineId == null ? {} : { machineId }),
    ...(fuelId == null ? {} : { fuelId }),
    ...(modules == null ? {} : { modules }),
    ...(beacons == null ? {} : { beacons }),
    ...(overclock == null ? {} : { overclock }),
    ...(cost == null ? {} : { cost }),
    ...(productivity == null ? {} : { productivity }),
  });
}

function requireNonnegative(value: Rational, field: string): void {
  if (!(value instanceof Rational) || value.lt(rational.zero))
    invalid(field, `Expected a nonnegative rational at ${field}`);
}

/** Validate values used by upstream's detached recipe preparation first. */
export function preflightWorkspace(
  input: Parameters<StateExtension['preflight']>[0],
): readonly string[] {
  const { state, plan, data } = input;
  const rawEf = plan.params['ef'];
  if (rawEf != null) decodeEndfield(rawEf, data);
  validateOrdinarySettings(state, data);
  if (
    rawEf != null ||
    (plan.context as EndfieldRestoreContext | undefined)?.legacy !== true
  )
    return [];
  const selected: string[] = [];
  for (const [id, objective] of Object.entries(state.objectivesState ?? {})) {
    const type: number = objective.type;
    if (
      type !== 12 ||
      objective.unit !== ObjectiveUnit.Machines ||
      !resourceIds.some(
        (resource) => resourceRecipes[resource] === objective.targetId,
      )
    )
      continue;
    const field = `objectives.${id}`;
    requireNonnegative(objective.value, `${field}.value`);
    validateRecipeReferences(
      recipePart(objective),
      data,
      field,
      objective.targetId,
    );
    selected.push(id);
  }
  return selected;
}

/** Decode only after upstream has resolved all target and checked-objective IDs. */
export function decodeWorkspace(
  input: Parameters<StateExtension['decode']>[0],
): DecodedWorkspace {
  const { state, params, plan, data, preparedObjectives } = input;
  const context = plan.context as EndfieldRestoreContext | undefined;
  const legacy = context?.legacy === true;
  let settingsState = state.settingsState;
  if (context?.useHistoricalCostDefaults)
    settingsState = {
      ...settingsState,
      costs: { ...historicalCostDefaults, ...settingsState?.costs },
    };
  const rawEf = (params as Record<string, unknown>)['ef'];
  const hasEf = rawEf != null;
  let extension: EndfieldState = hasEf
    ? decodeEndfield(rawEf, data)
    : createEndfieldState();
  const rawCet = (params as Record<string, unknown>)['cet'];
  const diagnostics: RestoreDiagnostic[] = [];
  let ignoredLegacy = false;
  if (rawCet != null) {
    if (hasEf) ignoredLegacy = true;
    else if (legacy)
      extension = { ...extension, electric: parseNonnegative(rawCet, 'cet') };
    else invalid('cet', 'Legacy electric weight requires a legacy workspace');
  }
  validateOrdinarySettings(state, data);
  const ordinary: Record<string, ObjectiveState> = {};
  const checked = settingsState?.checkedObjectiveIds;
  const checkedOrdinary = new Set<string>();
  const checkedDerived = new Set(extension.checkedDerived);
  const rates = { ...extension.resourceLimits.rates };
  const resourceSettings = { ...extension.resourceRecipeSettings };
  const limits = { ...extension.machineLimits.limits };
  let resourceEnabled = extension.resourceLimits.enabled;
  let machineEnabled = extension.machineLimits.enabled;
  let transfer = extension.transfer;
  const seen = new Set<string>();
  const duplicate = (key: string, field: string): void => {
    if (seen.has(key))
      diagnostics.push({
        code: 'duplicate-legacy-objective',
        field,
        message: `Duplicate legacy objective ${key}; the last value is used`,
        severity: 'warning',
      });
    seen.add(key);
  };
  for (const [oldId, value] of Object.entries(state.objectivesState ?? {})) {
    let objective = value;
    const field = `objectives.${oldId}`;
    const type: number = objective.type;
    if (type >= 0 && type <= 3 && Number.isInteger(type)) {
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
      if (
        legacy &&
        objective.unit === ObjectiveUnit.Machines &&
        objective.targetId === 'xiranite_powder'
      )
        objective = { ...objective, targetId: 'xiranite_powder-carbon_enr' };
      const exists =
        objective.unit === ObjectiveUnit.Machines
          ? data.recipes.some((recipe) => recipe.id === objective.targetId)
          : data.items.some((item) => item.id === objective.targetId);
      if (!exists)
        invalid(
          `${field}.targetId`,
          `Unknown objective target: ${objective.targetId}`,
        );
      if (!(objective.value instanceof Rational))
        invalid(`${field}.value`, 'Expected a rational objective value');
      validateRecipeReferences(
        objective,
        data,
        field,
        objective.unit === ObjectiveUnit.Machines
          ? objective.targetId
          : undefined,
      );
      const id = String(Object.keys(ordinary).length + 1);
      ordinary[id] = { ...objective, id };
      if (checked?.has(oldId)) checkedOrdinary.add(id);
      continue;
    }
    if (![11, 12, 13, 14].includes(type))
      invalid(
        `${field}.type`,
        `Unknown special objective type: ${String(type)}`,
      );
    if (hasEf) {
      ignoredLegacy = true;
      continue;
    }
    if (!legacy)
      invalid(
        `${field}.type`,
        'Legacy special objective requires a legacy workspace',
      );
    requireNonnegative(objective.value, `${field}.value`);
    if (type === 11 || type === 12) {
      if (objective.unit !== ObjectiveUnit.Machines)
        invalid(`${field}.unit`, 'Legacy resource objective must use machines');
      const id = resourceIds.find(
        (resource) => resourceRecipes[resource] === objective.targetId,
      );
      if (id == null)
        invalid(
          `${field}.targetId`,
          `Unknown legacy resource recipe: ${objective.targetId}`,
        );
      duplicate(`${type}:${id}`, field);
      resourceEnabled = true;
      if (type === 11 && !objective.value.eq(rational.zero))
        invalid(`${field}.value`, 'Legacy resource limit must be zero');
      if (type === 12) {
        const settings = recipePart(objective);
        validateRecipeReferences(settings, data, field, objective.targetId);
        const output = preparedObjectives?.[oldId]?.recipe?.output[id];
        if (!(output instanceof Rational) || !output.gt(rational.zero))
          invalid(
            `${field}.recipe.output.${id}`,
            `Missing adjusted resource output for ${oldId}`,
          );
        rates[id] = output.mul(objective.value);
        if (Object.keys(settings).length) resourceSettings[id] = settings;
        else delete resourceSettings[id];
      }
      if (checked?.has(oldId)) checkedDerived.add(resourceOwner(id));
    } else if (type === 13) {
      if (
        objective.unit !== ObjectiveUnit.Items ||
        objective.targetId !== ovenId
      )
        invalid(
          `${field}.targetId`,
          `Unknown legacy machine limit: ${objective.targetId}`,
        );
      duplicate(`machine:${ovenId}`, field);
      machineEnabled = true;
      limits[ovenId] = objective.value;
    } else {
      if (
        objective.unit !== ObjectiveUnit.Items ||
        objective.targetId !== 'domain_key_tundra'
      )
        invalid(
          `${field}.targetId`,
          `Unknown legacy transfer source: ${objective.targetId}`,
        );
      duplicate('transfer:tundra', field);
      transfer = { enabled: true, source: 'tundra' };
    }
  }
  if (ignoredLegacy)
    diagnostics.push({
      code: 'ignored-legacy-extension',
      field: 'ef',
      message: 'Legacy extension fields were ignored because ef is present',
      severity: 'warning',
    });
  if (!hasEf)
    extension = {
      ...extension,
      resourceLimits: { enabled: resourceEnabled, rates },
      machineLimits: { enabled: machineEnabled, limits },
      transfer,
      resourceRecipeSettings: resourceSettings,
      checkedDerived,
    };
  return {
    state: {
      ...state,
      ...(state.objectivesState == null ? {} : { objectivesState: ordinary }),
      ...(settingsState == null
        ? {}
        : {
            settingsState: {
              ...settingsState,
              ...(checked == null
                ? {}
                : { checkedObjectiveIds: checkedOrdinary }),
            },
          }),
    },
    extension,
    diagnostics,
  };
}
