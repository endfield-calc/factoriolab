import { ModData } from '~/data/schema/mod-data';
import {
  createEndfieldState,
  EndfieldState,
  ovenId,
  ResourceId,
  resourceRecipes,
  SourceRecipeSettings,
} from '~/endfield/domain/model';
import { Rational, rational } from '~/rational/rational';

function invalid(message: string): never {
  throw new Error(message);
}

/** Decode the integer or fraction emitted by Rational.toFraction(false). */
function parseSignedRational(value: string, field: string): Rational {
  const parts = /^(-?\d+)(?:\/(\d+))?$/.exec(value);
  if (!parts) return invalid(`Invalid rational at ${field}`);
  try {
    return new Rational(BigInt(parts[1]), BigInt(parts[2] ?? '1'));
  } catch {
    return invalid(`Invalid rational at ${field}`);
  }
}

function parseNonnegative(value: string, field: string): Rational {
  const result = parseSignedRational(value, field);
  if (result.lt(rational.zero))
    invalid(`Expected a nonnegative rational at ${field}`);
  return result;
}

function validateSourceMachine(
  data: ModData,
  machineId: string,
  id: ResourceId,
  field: string,
): void {
  if (!data.items.some((item) => item.id === machineId && item.machine != null))
    invalid(`Unknown machine ID at ${field}: ${machineId}`);
  const recipeId = resourceRecipes[id];
  const recipe = data.recipes.find((entry) => entry.id === recipeId);
  if (!recipe?.producers?.includes(machineId))
    invalid(`Machine is not a producer of ${recipeId}`);
}

// These positions are part of the link format. Never reorder existing entries.
const wireResources: readonly ResourceId[] = [
  'originium_ore',
  'quartz_sand',
  'iron_ore',
  'copper_ore',
  'gas_xiranite',
  'gas_inert',
];

function trimFields(fields: string[], separator: string): string {
  while (fields.at(-1) === '') fields.pop();
  return fields.join(separator);
}

/** Escape IDs without %, &, or =: toParams also reads the unescaped z payload. */
function encodeId(id: string): string {
  if (!id) return invalid('Empty machine ID');
  return encodeURIComponent(id)
    .replace(
      /[!'()*~]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    )
    .replace(/%/g, '!');
}

function decodeId(value: string, field: string): string {
  if (!/^(?:[A-Za-z0-9._-]|![0-9A-F]{2})+$/.test(value))
    return invalid(`Invalid machine ID at ${field}`);
  try {
    const id = decodeURIComponent(value.replace(/!/g, '%'));
    if (encodeId(id) !== value)
      return invalid(`Invalid machine ID at ${field}`);
    return id;
  } catch {
    return invalid(`Invalid machine ID at ${field}`);
  }
}

/**
 * Fields: flags, resource rates, oven limit, electric cost, source settings, activity overrides, transfer source.
 * Flags hold the three enabled bits followed by one checked bit per resource.
 * Lists use fixed resource positions; source settings alternate machine/speed.
 * Empty and trailing fields take their defaults. Fractions are always exact.
 */
export function encodeEndfield(state: EndfieldState): string | undefined {
  const defaults = createEndfieldState();
  let flags =
    (state.resourceLimits.enabled ? 1 : 0) |
    (state.machineLimits.enabled ? 2 : 0) |
    (state.transferEnabled ? 4 : 0);
  wireResources.forEach((id, index) => {
    if (state.checkedDerived.has(id)) flags |= 1 << (index + 3);
  });

  const rates = wireResources.map((id) =>
    state.resourceLimits.rates[id].eq(defaults.resourceLimits.rates[id])
      ? ''
      : state.resourceLimits.rates[id].toFraction(false),
  );
  const sourceSettings = wireResources.flatMap((id) => {
    const settings = state.resourceRecipeSettings[id];
    return [
      settings?.machineId == null ? '' : encodeId(settings.machineId),
      settings?.overclock?.toFraction(false) ?? '',
    ];
  });
  const result = trimFields(
    [
      flags ? flags.toString(36) : '',
      trimFields(rates, '~'),
      state.machineLimits.limits[ovenId].eq(
        defaults.machineLimits.limits[ovenId],
      )
        ? ''
        : state.machineLimits.limits[ovenId].toFraction(false),
      state.electric.eq(defaults.electric)
        ? ''
        : state.electric.toFraction(false),
      trimFields(sourceSettings, '~'),
      Object.entries(state.activityModes)
        .sort(([a], [b]) => a.localeCompare(b, 'en'))
        .flatMap(([id, mode]) => [
          encodeId(id),
          mode === 'disabled' ? 'd' : String(mode),
        ])
        .join('~'),
      state.transferSource === defaults.transferSource
        ? ''
        : encodeId(state.transferSource),
    ],
    '*',
  );
  return result || undefined;
}

export function decodeEndfield(
  encoded: unknown,
  data?: ModData,
): EndfieldState {
  const defaults = createEndfieldState();
  if (encoded == null) return defaults;
  if (
    typeof encoded !== 'string' ||
    !encoded ||
    !/^[A-Za-z0-9._!~*/-]+$/.test(encoded)
  )
    return invalid('Invalid ef encoding');
  const fields = encoded.split('*');
  if (fields.length > 7 || fields.every((field) => !field))
    return invalid('Invalid ef fields');
  const [
    flagField,
    rateField,
    ovenField,
    electricField,
    sourceField,
    activityField,
    transferField,
  ] = fields;
  const modes = new Map<string, number | 'disabled'>();
  if (activityField) {
    const entries = activityField.split('~');
    for (let i = 0; i < entries.length; i += 2) {
      const id = decodeId(entries[i], 'ef.activityModes');
      const value = entries[i + 1];
      if (modes.has(id)) invalid('Duplicate activity ID');
      if (value === 'd') modes.set(id, 'disabled');
      else {
        const time = Number(value);
        if (!Number.isSafeInteger(time) || String(time) !== value)
          invalid('Invalid activity stage');
        modes.set(id, time);
      }
    }
  }
  let flags = 0;
  if (flagField) {
    if (!/^[1-9a-z][0-9a-z]?$/.test(flagField))
      return invalid('Invalid ef flags');
    flags = parseInt(flagField, 36);
    if (flags >= 1 << (wireResources.length + 3))
      return invalid('Unknown ef flags');
  }

  const rates = { ...defaults.resourceLimits.rates };
  if (rateField) {
    const entries = rateField.split('~');
    if (entries.length > wireResources.length)
      invalid('Too many resource rates');
    entries.forEach((value, index) => {
      if (value) {
        const id = wireResources[index];
        rates[id] = parseNonnegative(value, `ef.resourceLimits.rates.${id}`);
      }
    });
  }

  const resourceRecipeSettings: Partial<
    Record<ResourceId, SourceRecipeSettings>
  > = {};
  if (sourceField) {
    const entries = sourceField.split('~');
    if (entries.length > wireResources.length * 2)
      invalid('Too many resource recipe settings');
    wireResources.forEach((id, index) => {
      const machine = entries[index * 2];
      const speed = entries[index * 2 + 1];
      if (!machine && !speed) return;
      const field = `ef.resourceRecipeSettings.${id}`;
      const settings: { machineId?: string; overclock?: Rational } = {};
      if (machine) settings.machineId = decodeId(machine, `${field}.machineId`);
      if (speed) {
        settings.overclock = parseSignedRational(speed, `${field}.overclock`);
        if (!settings.overclock.gt(rational.zero))
          invalid('Recipe overclock must be positive');
      }
      if (settings.machineId != null) {
        if (data == null) invalid('Data is required to validate a machine ID');
        validateSourceMachine(
          data,
          settings.machineId,
          id,
          `${field}.machineId`,
        );
      }
      resourceRecipeSettings[id] = settings;
    });
  }
  const checkedDerived = new Set<ResourceId>();
  wireResources.forEach((id, index) => {
    if (flags & (1 << (index + 3))) checkedDerived.add(id);
  });
  return {
    ...defaults,
    activityModes: Object.fromEntries(modes),
    resourceLimits: { enabled: !!(flags & 1), rates },
    machineLimits: {
      enabled: !!(flags & 2),
      limits: {
        [ovenId]: ovenField
          ? parseNonnegative(ovenField, `ef.machineLimits.limits.${ovenId}`)
          : defaults.machineLimits.limits[ovenId],
      },
    },
    transferEnabled: !!(flags & 4),
    transferSource: transferField
      ? decodeId(transferField, 'ef.transferSource')
      : defaults.transferSource,
    electric: electricField
      ? parseSignedRational(electricField, 'ef.electric')
      : defaults.electric,
    resourceRecipeSettings,
    checkedDerived,
  };
}
