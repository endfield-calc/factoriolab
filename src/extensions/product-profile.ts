import { inject, InjectionToken } from '@angular/core';

import { IconJson } from '~/data/schema/icon-data';
import { ModI18n } from '~/data/schema/mod-i18n';
import {
  initialPreferencesState,
  PreferencesState,
} from '~/state/preferences/preferences-state';
import {
  initialSettingsState,
  SettingsState,
} from '~/state/settings/settings-state';
import { Language, languageOptions } from '~/translate/language';

import { immutableValue, mutableValue, ReadonlyValue } from './immutable';

/** One protocol-specific default snapshot, shared by stores, codecs and resets. */
export interface EffectiveDefaults {
  readonly settings: ReadonlyValue<SettingsState>;
  readonly preferences: ReadonlyValue<PreferencesState>;
  readonly extension: unknown;
}

export interface PreferenceRestore {
  readonly state: Partial<PreferencesState>;
  readonly warnings: readonly string[];
}

export interface ProductProfile {
  readonly name: string;
  readonly exportPrefix: string;
  readonly csv?: {
    readonly entityNames: boolean;
    readonly bom: boolean;
    columnLabel(field: string, language: Language): string;
  };
  readonly sourceUrl: string;
  readonly issuesUrl: string;
  readonly logo: string;
  readonly loadingLogo: string;
  readonly systemIcons?: readonly (IconJson & { readonly file: string })[];
  readonly defaultModId?: string;
  readonly allowedModIds?: readonly string[];
  readonly allowEditor: boolean;
  readonly analytics: boolean;
  readonly languages: typeof languageOptions;
  defaults(): EffectiveDefaults;
  loadGameI18n(modId: string, language: Language): boolean;
  gameMetadata(
    modId: string,
    language: Language,
    i18n?: ModI18n,
  ): { name?: string; version?: Record<string, string> };
  migratePreferences(value: unknown): PreferenceRestore;
}

export function cloneDefaults(defaults: EffectiveDefaults): {
  settings: SettingsState;
  preferences: PreferencesState;
  extension: unknown;
} {
  return {
    settings: mutableValue<SettingsState>(defaults.settings),
    preferences: mutableValue<PreferencesState>(defaults.preferences),
    extension: mutableValue(defaults.extension),
  };
}

export const upstreamProduct: ProductProfile = {
  name: 'FactorioLab',
  exportPrefix: 'factoriolab',
  sourceUrl: 'https://github.com/factoriolab/factoriolab',
  issuesUrl: 'https://github.com/factoriolab/factoriolab/issues',
  logo: 'factoriolab.webp',
  loadingLogo: 'factoriolab-animate.webp',
  allowEditor: true,
  analytics: true,
  languages: languageOptions,
  defaults: () =>
    immutableValue({
      settings: initialSettingsState,
      preferences: initialPreferencesState,
      extension: undefined,
    }),
  loadGameI18n: (_modId, language) => language !== 'en',
  gameMetadata: () => ({}),
  migratePreferences: (value) => ({
    state: value as Partial<PreferencesState>,
    warnings: [],
  }),
};

export const PRODUCT_PROFILE = new InjectionToken<ProductProfile>(
  'PRODUCT_PROFILE',
  { factory: (): ProductProfile => upstreamProduct },
);
export const EFFECTIVE_DEFAULTS = new InjectionToken<EffectiveDefaults>(
  'EFFECTIVE_DEFAULTS',
  {
    factory: (): EffectiveDefaults =>
      immutableValue(inject(PRODUCT_PROFILE).defaults()),
  },
);
