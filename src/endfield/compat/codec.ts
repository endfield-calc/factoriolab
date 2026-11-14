import { ModData } from '~/data/schema/mod-data';
import {
  createEndfieldState,
  EndfieldState,
  ovenId,
  ResourceId,
  resourceIds,
  resourceOwner,
  resourceRecipes,
  SourceRecipeSettings,
} from '~/endfield/domain/model';
import { Rational, rational } from '~/rational/rational';
import { RecipeState } from '~/state/recipes/recipe-state';

export function invalid(message: string): never {
  throw new Error(message);
}

function record(
  value: unknown,
  field: string,
  keys: readonly string[],
): Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value))
    return invalid(`Expected an object at ${field}`);
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj))
    if (!keys.includes(key)) invalid(`Unknown field ${field}.${key}`);
  return obj;
}

function bool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') invalid(`Expected a boolean at ${field}`);
  return value;
}

/** Parse without the floating-point conversion in Rational.fromString. */
function parseSignedRational(value: unknown, field: string): Rational {
  if (typeof value !== 'string')
    invalid(`Expected a rational string at ${field}`);
  const fraction = /^([+-]?\d+)\/(\d+)$/.exec(value);
  const decimal = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value);
  const parts = fraction ?? decimal;
  if (!parts) return invalid(`Invalid rational at ${field}`);
  const exponent = fraction
    ? 0
    : Number(parts[4] ?? 0) - (parts[3]?.length ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 10000)
    return invalid(`Decimal shift exceeds the supported range at ${field}`);
  try {
    const numerator = BigInt(
      fraction ? parts[1] : `${parts[1]}${parts[2]}${parts[3] ?? ''}`,
    );
    if (fraction) return new Rational(numerator, BigInt(parts[2]));
    return exponent >= 0
      ? new Rational(numerator * 10n ** BigInt(exponent))
      : new Rational(numerator, 10n ** BigInt(-exponent));
  } catch {
    return invalid(`Invalid rational at ${field}`);
  }
}

export function parseNonnegative(value: unknown, field: string): Rational {
  const result = parseSignedRational(value, field);
  if (result.lt(rational.zero))
    invalid(`Expected a nonnegative rational at ${field}`);
  return result;
}

function rationalString(value: Rational): string {
  return value.q === 1n ? value.p.toString() : `${value.p}/${value.q}`;
}

type EntityKind = 'machine' | 'fuel' | 'module' | 'beacon' | 'belt' | 'wagon';

export function validateEntity(
  data: ModData,
  id: unknown,
  kind: EntityKind,
  field: string,
): void {
  // Upstream represents an intentionally empty module slot with this sentinel.
  if (kind === 'module' && id === '') return;
  if (
    typeof id !== 'string' ||
    !data.items.some((item) => item.id === id && item[kind] != null)
  )
    invalid(`Unknown ${kind} ID at ${field}: ${String(id)}`);
}

/** Validate actual entity references for either ordinary or derived settings. */
export function validateRecipeReferences(
  settings: RecipeState,
  data: ModData,
  field: string,
  recipeId?: string,
): void {
  if (
    settings.overclock != null &&
    (!(settings.overclock instanceof Rational) ||
      !settings.overclock.gt(rational.zero))
  )
    invalid('Recipe overclock must be positive');
  if (settings.machineId != null) {
    validateEntity(data, settings.machineId, 'machine', `${field}.machineId`);
    const recipe = data.recipes.find((entry) => entry.id === recipeId);
    if (recipeId != null && !recipe?.producers?.includes(settings.machineId))
      invalid(`Machine is not a producer of ${recipeId}`);
  }
  if (settings.fuelId != null)
    validateEntity(data, settings.fuelId, 'fuel', `${field}.fuelId`);
  settings.modules?.forEach((entry, i) => {
    if (entry.id != null)
      validateEntity(data, entry.id, 'module', `${field}.modules.${i}.id`);
  });
  settings.beacons?.forEach((entry, i) => {
    if (entry.id != null)
      validateEntity(data, entry.id, 'beacon', `${field}.beacons.${i}.id`);
    entry.modules?.forEach((module, j) => {
      if (module.id != null)
        validateEntity(
          data,
          module.id,
          'module',
          `${field}.beacons.${i}.modules.${j}.id`,
        );
    });
  });
}

function recipeSettings(
  value: unknown,
  data: ModData,
  id: ResourceId,
  field: string,
): SourceRecipeSettings {
  const obj = record(value, field, ['machineId', 'overclock']);
  const result: { machineId?: string; overclock?: Rational } = {};
  if ('machineId' in obj) {
    validateEntity(data, obj['machineId'], 'machine', `${field}.machineId`);
    result.machineId = obj['machineId'] as string;
  }
  if ('overclock' in obj)
    result.overclock = parseNonnegative(obj['overclock'], `${field}.overclock`);
  validateRecipeReferences(result, data, field, resourceRecipes[id]);
  return result;
}

function encodeRecipe(value: SourceRecipeSettings): object {
  return {
    ...(value.machineId == null ? {} : { machineId: value.machineId }),
    ...(value.overclock == null
      ? {}
      : { overclock: rationalString(value.overclock) }),
  };
}

/** Stable keys and exact fractions; UTF-8 is encoded once, without padding. */
export function encodeEndfield(state: EndfieldState): string {
  const settings = Object.fromEntries(
    resourceIds
      .map((id) => [id, state.resourceRecipeSettings[id]] as const)
      .flatMap(([id, value]) =>
        value == null ? [] : [[id, encodeRecipe(value)]],
      ),
  );
  const payload = {
    version: state.version,
    resourceLimits: {
      enabled: state.resourceLimits.enabled,
      rates: Object.fromEntries(
        resourceIds.map((id) => [
          id,
          rationalString(state.resourceLimits.rates[id]),
        ]),
      ),
    },
    machineLimits: {
      enabled: state.machineLimits.enabled,
      limits: { [ovenId]: rationalString(state.machineLimits.limits[ovenId]) },
    },
    transfer: {
      enabled: state.transfer.enabled,
      source: state.transfer.source,
    },
    electric: rationalString(state.electric),
    resourceRecipeSettings: settings,
    checkedDerived: Array.from(state.checkedDerived).sort(),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function decodeEndfield(encoded: unknown, data: ModData): EndfieldState {
  if (encoded == null) return createEndfieldState();
  if (
    typeof encoded !== 'string' ||
    !encoded ||
    !/^[A-Za-z0-9_-]+$/.test(encoded) ||
    encoded.length % 4 === 1
  )
    invalid('Invalid ef encoding');
  let parsed: unknown;
  try {
    const binary = atob(
      encoded.replace(/-/g, '+').replace(/_/g, '/') +
        '='.repeat((4 - (encoded.length % 4)) % 4),
    );
    if (
      btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '') !== encoded
    )
      return invalid('Noncanonical ef encoding');
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    parsed = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    );
  } catch {
    return invalid('Invalid ef encoding');
  }
  const obj = record(parsed, 'ef', [
    'version',
    'resourceLimits',
    'machineLimits',
    'transfer',
    'electric',
    'resourceRecipeSettings',
    'checkedDerived',
  ]);
  if (typeof obj['version'] !== 'number' || !Number.isInteger(obj['version']))
    invalid('Invalid ef version');
  if (obj['version'] !== 1)
    invalid(`Unsupported ef version: ${String(obj['version'])}`);
  const defaults = createEndfieldState();
  let resourceLimits = defaults.resourceLimits;
  if ('resourceLimits' in obj) {
    const input = record(obj['resourceLimits'], 'ef.resourceLimits', [
      'enabled',
      'rates',
    ]);
    const rates = { ...defaults.resourceLimits.rates };
    if ('rates' in input) {
      const values = record(
        input['rates'],
        'ef.resourceLimits.rates',
        resourceIds,
      );
      for (const id of resourceIds)
        if (id in values)
          rates[id] = parseNonnegative(
            values[id],
            `ef.resourceLimits.rates.${id}`,
          );
    }
    resourceLimits = {
      enabled:
        'enabled' in input
          ? bool(input['enabled'], 'ef.resourceLimits.enabled')
          : defaults.resourceLimits.enabled,
      rates,
    };
  }
  let machineLimits = defaults.machineLimits;
  if ('machineLimits' in obj) {
    const input = record(obj['machineLimits'], 'ef.machineLimits', [
      'enabled',
      'limits',
    ]);
    const limits = { ...defaults.machineLimits.limits };
    if ('limits' in input) {
      const values = record(input['limits'], 'ef.machineLimits.limits', [
        ovenId,
      ]);
      if (ovenId in values)
        limits[ovenId] = parseNonnegative(
          values[ovenId],
          `ef.machineLimits.limits.${ovenId}`,
        );
    }
    machineLimits = {
      enabled:
        'enabled' in input
          ? bool(input['enabled'], 'ef.machineLimits.enabled')
          : defaults.machineLimits.enabled,
      limits,
    };
  }
  let transfer = defaults.transfer;
  if ('transfer' in obj) {
    const input = record(obj['transfer'], 'ef.transfer', ['enabled', 'source']);
    if ('source' in input && input['source'] !== 'tundra')
      invalid('Unknown transfer source');
    transfer = {
      enabled:
        'enabled' in input
          ? bool(input['enabled'], 'ef.transfer.enabled')
          : defaults.transfer.enabled,
      source: defaults.transfer.source,
    };
  }
  const resourceRecipeSettings: Partial<
    Record<ResourceId, SourceRecipeSettings>
  > = {};
  if ('resourceRecipeSettings' in obj) {
    const input = record(
      obj['resourceRecipeSettings'],
      'ef.resourceRecipeSettings',
      resourceIds,
    );
    for (const id of resourceIds)
      if (id in input)
        resourceRecipeSettings[id] = recipeSettings(
          input[id],
          data,
          id,
          `ef.resourceRecipeSettings.${id}`,
        );
  }
  const checkedDerived = new Set<string>();
  if ('checkedDerived' in obj) {
    const input = obj['checkedDerived'];
    if (!Array.isArray(input)) invalid('Expected an array of resource owners');
    for (const owner of input) {
      if (
        typeof owner !== 'string' ||
        !resourceIds.some((id) => resourceOwner(id) === owner) ||
        checkedDerived.has(owner)
      )
        invalid(`Invalid derived owner: ${String(owner)}`);
      checkedDerived.add(owner);
    }
  }
  return {
    ...defaults,
    resourceLimits,
    machineLimits,
    transfer,
    electric:
      'electric' in obj
        ? parseNonnegative(obj['electric'], 'ef.electric')
        : defaults.electric,
    resourceRecipeSettings,
    checkedDerived,
  };
}
