import { Rational, rational } from '~/rational/rational';

import type { ActivityModes } from './game-data';

/** Resource IDs are also the stable keys of supply settings and owners. */
export const resourceRecipes = {
  originium_ore: 'originium_ore',
  quartz_sand: 'quartz_sand',
  iron_ore: 'iron_ore',
  copper_ore: 'copper_ore-liquid_water',
  gas_xiranite: 'gas_xiranite',
  gas_inert: 'gas_inert',
} as const;

export type ResourceId = keyof typeof resourceRecipes;
export const resourceIds: readonly ResourceId[] = Object.keys(
  resourceRecipes,
) as ResourceId[];
export const ovenId = 'xiranite_oven_1';
export interface SourceRecipeSettings {
  readonly machineId?: string;
  readonly overclock?: Rational;
}

export interface EndfieldState {
  readonly activityModes: ActivityModes;
  readonly resourceLimits: {
    readonly enabled: boolean;
    /** Physical output rates in items per second. */
    readonly rates: Readonly<Record<ResourceId, Rational>>;
  };
  readonly machineLimits: {
    readonly enabled: boolean;
    /** Physical machine counts, not rates. */
    readonly limits: Readonly<Record<typeof ovenId, Rational>>;
  };
  readonly transferEnabled: boolean;
  readonly transferSource: string;
  readonly electric: Rational;
  readonly resourceRecipeSettings: Readonly<
    Partial<Record<ResourceId, SourceRecipeSettings>>
  >;
  readonly checkedDerived: ReadonlySet<ResourceId>;
}

export function resourceObjectiveId(id: ResourceId): string {
  return `ef:resource:${id}`;
}

/** Only the six resource supply objectives own source settings. */
export function resourceFromObjectiveId(id?: string): ResourceId | undefined {
  return resourceIds.find((resource) => resourceObjectiveId(resource) === id);
}

export function resourceLimitId(id: ResourceId): string {
  return `ef:limit:${id}`;
}

export function createEndfieldState(): EndfieldState {
  return {
    activityModes: {},
    resourceLimits: {
      enabled: false,
      rates: {
        originium_ore: rational.zero,
        quartz_sand: rational.zero,
        iron_ore: rational.zero,
        copper_ore: rational.zero,
        gas_xiranite: rational.zero,
        gas_inert: rational.zero,
      },
    },
    machineLimits: { enabled: false, limits: { [ovenId]: rational(16) } },
    transferEnabled: false,
    transferSource: 'tundra',
    electric: rational.one,
    resourceRecipeSettings: {},
    checkedDerived: new Set(),
  };
}
