import { InjectionToken } from '@angular/core';

import {
  initialPreferencesState,
  PreferencesState,
} from '~/state/preferences/preferences-state';
import {
  initialSettingsState,
  SettingsState,
} from '~/state/settings/settings-state';

import { immutableValue, mutableValue, ReadonlyValue } from './immutable';

export interface EffectiveDefaults {
  readonly settings: ReadonlyValue<SettingsState>;
  readonly preferences: ReadonlyValue<PreferencesState>;
}

export const initialDefaults: EffectiveDefaults = immutableValue({
  settings: initialSettingsState,
  preferences: initialPreferencesState,
});

export function cloneDefaults(defaults: EffectiveDefaults): {
  settings: SettingsState;
  preferences: PreferencesState;
} {
  return {
    settings: mutableValue<SettingsState>(defaults.settings),
    preferences: mutableValue<PreferencesState>(defaults.preferences),
  };
}

export const EFFECTIVE_DEFAULTS = new InjectionToken<EffectiveDefaults>(
  'EFFECTIVE_DEFAULTS',
  {
    factory: (): EffectiveDefaults => initialDefaults,
  },
);

/** The published application pins its dataset; native data tools remain reusable. */
export const PINNED_MOD_ID = new InjectionToken<string | undefined>(
  'PINNED_MOD_ID',
  { factory: (): string | undefined => undefined },
);
