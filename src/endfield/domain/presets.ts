import type { ReadonlyValue } from '~/extensions/immutable';
import { Rational, rational } from '~/rational/rational';
import { RecipeState } from '~/state/recipes/recipe-state';

import {
  copyResourceRecipeSettings,
  createEndfieldState,
  EndfieldState,
  ovenId,
  ResourceId,
  resourceIds,
  resourceOwner,
} from './model';

export const waterRecipeIds = ['sewage-treat', 'sewage-treat-export'] as const;
export type ResourcePreset = 'tundra' | 'jinlong';

export type EndfieldAction =
  | { readonly type: 'preset'; readonly preset: ResourcePreset }
  | { readonly type: 'clear' }
  | { readonly type: 'resourceEnabled'; readonly enabled: boolean }
  | {
      readonly type: 'resourceRate';
      readonly id: ResourceId;
      readonly value: Rational;
    }
  | { readonly type: 'machineEnabled'; readonly enabled: boolean }
  | {
      readonly type: 'machineLimit';
      readonly id: string;
      readonly value: Rational;
    }
  | {
      readonly type: 'transfer';
      readonly enabled: boolean;
      readonly source: 'tundra';
    }
  | { readonly type: 'waterDisabled'; readonly disabled: boolean }
  | { readonly type: 'electric'; readonly value: Rational }
  | {
      readonly type: 'resourceRecipeSettings';
      readonly id: ResourceId;
      readonly value?: ReadonlyValue<RecipeState>;
    }
  | {
      readonly type: 'derivedChecked';
      readonly owner: string;
      readonly checked: boolean;
    }
  | { readonly type: 'clearDerivedChecked' };

export interface EndfieldSettingsSnapshot {
  readonly defaultLocationIds: ReadonlySet<string>;
  readonly excludedRecipeIds: ReadonlySet<string>;
}

export interface EndfieldActionDiagnostic {
  readonly code:
    | 'invalid-id'
    | 'invalid-value'
    | 'invalid-preset'
    | 'invalid-source';
  readonly field: string;
  readonly message: string;
}

/** An omitted settings property means it must be left unchanged. */
export interface EndfieldActionResult {
  readonly state: EndfieldState;
  readonly settings: {
    readonly locationIds?: ReadonlySet<string>;
    readonly excludedRecipeIds?: ReadonlySet<string>;
  };
  readonly diagnostics: readonly EndfieldActionDiagnostic[];
}

const presetRates: Record<ResourcePreset, Record<ResourceId, number>> = {
  tundra: {
    originium_ore: 560,
    quartz_sand: 240,
    iron_ore: 1080,
    copper_ore: 0,
    gas_xiranite: 0,
    gas_inert: 0,
  },
  jinlong: {
    originium_ore: 540,
    quartz_sand: 0,
    iron_ore: 120,
    copper_ore: 510,
    gas_xiranite: 150,
    gas_inert: 460,
  },
};

function waterExclusions(
  original: ReadonlySet<string>,
  disabled: boolean,
): Set<string> {
  const excluded = new Set(original);
  for (const id of waterRecipeIds) {
    if (disabled) excluded.add(id);
    else excluded.delete(id);
  }
  return excluded;
}

function invalid(
  state: EndfieldState,
  code: EndfieldActionDiagnostic['code'],
  field: string,
  message: string,
): EndfieldActionResult {
  return { state, settings: {}, diagnostics: [{ code, field, message }] };
}

function nonnegative(value: Rational): boolean {
  return value instanceof Rational && value.gte(rational.zero);
}

function validResourceId(id: string): id is ResourceId {
  return resourceIds.some((resourceId) => resourceId === id);
}

/** Build both sides of a cross-store command without mutating either input. */
export function applyEndfieldAction(
  state: EndfieldState,
  action: EndfieldAction,
  settings: EndfieldSettingsSnapshot,
): EndfieldActionResult {
  const result = (next: EndfieldState): EndfieldActionResult => ({
    state: next,
    settings: {},
    diagnostics: [],
  });

  switch (action.type) {
    case 'preset': {
      if (action.preset !== 'tundra' && action.preset !== 'jinlong')
        return invalid(
          state,
          'invalid-preset',
          'preset',
          'Unknown resource preset',
        );
      const defaults = createEndfieldState();
      const rates = { ...defaults.resourceLimits.rates };
      for (const id of resourceIds)
        rates[id] = rational(presetRates[action.preset][id], 60);
      const jinlong = action.preset === 'jinlong';
      return {
        state: {
          ...defaults,
          electric: state.electric,
          resourceLimits: { enabled: true, rates },
          machineLimits: {
            enabled: jinlong,
            limits: { [ovenId]: rational(12) },
          },
          transfer: { enabled: jinlong, source: 'tundra' },
        },
        settings: {
          locationIds: new Set([action.preset]),
          ...(jinlong
            ? {
                excludedRecipeIds: waterExclusions(
                  settings.excludedRecipeIds,
                  false,
                ),
              }
            : {}),
        },
        diagnostics: [],
      };
    }
    case 'clear': {
      const defaults = createEndfieldState();
      return {
        state: { ...defaults, electric: state.electric },
        settings: {
          locationIds: new Set(settings.defaultLocationIds),
          excludedRecipeIds: waterExclusions(settings.excludedRecipeIds, false),
        },
        diagnostics: [],
      };
    }
    case 'resourceEnabled':
      return result({
        ...state,
        resourceLimits: { ...state.resourceLimits, enabled: action.enabled },
      });
    case 'resourceRate': {
      if (!validResourceId(action.id))
        return invalid(state, 'invalid-id', 'resource', 'Unknown resource ID');
      if (!nonnegative(action.value))
        return invalid(
          state,
          'invalid-value',
          'resourceRate',
          'Resource rate must be nonnegative',
        );
      return result({
        ...state,
        resourceLimits: {
          ...state.resourceLimits,
          rates: { ...state.resourceLimits.rates, [action.id]: action.value },
        },
      });
    }
    case 'machineEnabled':
      return result({
        ...state,
        machineLimits: { ...state.machineLimits, enabled: action.enabled },
      });
    case 'machineLimit': {
      if (action.id !== ovenId)
        return invalid(
          state,
          'invalid-id',
          'machine',
          'Unknown machine limit ID',
        );
      if (!nonnegative(action.value))
        return invalid(
          state,
          'invalid-value',
          'machineLimit',
          'Machine limit must be nonnegative',
        );
      return result({
        ...state,
        machineLimits: {
          ...state.machineLimits,
          limits: { ...state.machineLimits.limits, [action.id]: action.value },
        },
      });
    }
    case 'transfer':
      if (action.source !== 'tundra')
        return invalid(
          state,
          'invalid-source',
          'transfer',
          'Unknown transfer source',
        );
      return result({
        ...state,
        transfer: { enabled: action.enabled, source: action.source },
      });
    case 'waterDisabled':
      return {
        state,
        settings: {
          excludedRecipeIds: waterExclusions(
            settings.excludedRecipeIds,
            action.disabled,
          ),
        },
        diagnostics: [],
      };
    case 'electric':
      if (!nonnegative(action.value))
        return invalid(
          state,
          'invalid-value',
          'electric',
          'Electric weight must be nonnegative',
        );
      return result({ ...state, electric: action.value });
    case 'resourceRecipeSettings': {
      if (!validResourceId(action.id))
        return invalid(state, 'invalid-id', 'resource', 'Unknown resource ID');
      const next = { ...state.resourceRecipeSettings };
      if (action.value == null) delete next[action.id];
      else next[action.id] = copyResourceRecipeSettings(action.value);
      return result({ ...state, resourceRecipeSettings: next });
    }
    case 'derivedChecked': {
      if (!resourceIds.some((id) => resourceOwner(id) === action.owner))
        return invalid(
          state,
          'invalid-id',
          'owner',
          'Unknown derived resource owner',
        );
      const checkedDerived = new Set(state.checkedDerived);
      if (action.checked) checkedDerived.add(action.owner);
      else checkedDerived.delete(action.owner);
      return result({ ...state, checkedDerived });
    }
    case 'clearDerivedChecked':
      return result({ ...state, checkedDerived: new Set() });
  }
}
