import { Provider } from '@angular/core';

import manifest from '/public/endfield/product.json';
import { createEndfieldState } from '~/endfield/domain/model';
import { environment } from '~/environments/environment';
import { immutableValue } from '~/extensions/immutable';
import {
  cloneDefaults,
  PreferenceRestore,
  PRODUCT_PROFILE,
  ProductProfile,
  upstreamProduct,
} from '~/extensions/product-profile';
import { rational } from '~/rational/rational';
import { ColumnKey, columnsInfo } from '~/state/preferences/columns-state';
import { FlowDiagram } from '~/state/preferences/flow-diagram';
import { PowerUnit } from '~/state/preferences/power-unit';
import { PreferencesState } from '~/state/preferences/preferences-state';
import { Language, languageOptions } from '~/translate/language';

import { endfieldCsv } from './csv';

const languages: readonly Language[] = ['en', 'zh', 'de', 'fr', 'ru', 'ja'];
const endfieldLanguageOptions = languageOptions.filter((option) =>
  languages.includes(option.value),
);

function initialLanguage(
  production: boolean,
  browserLanguage: string,
): Language {
  if (!production) return 'en';
  const value = browserLanguage.toLowerCase();
  return (
    languages.find((language) => language === value) ??
    languages.find((language) => language === value.split('-')[0]) ??
    'en'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/** Restore independent fields without losing valid archives or unknown legacy preferences. */
function migratePreferences(
  value: unknown,
  defaults: PreferencesState,
): PreferenceRestore {
  const warnings: string[] = [];
  if (!isRecord(value)) return { state: {}, warnings: ['Invalid preferences'] };

  const state: Record<string, unknown> = { ...value };
  const warn = (field: string): void => {
    warnings.push(`Invalid preferences.${field}`);
  };
  const scalar = (field: string, valid: (input: unknown) => boolean): void => {
    if (!(field in value)) return;
    if (!valid(value[field])) {
      delete state[field];
      warn(field);
    }
  };

  scalar(
    'language',
    (v) => typeof v === 'string' && languages.includes(v as Language),
  );
  scalar('powerUnit', (v) => [0, 1, 2, 3].includes(v as number));
  for (const key of [
    'bypassLanding',
    'showTechLabels',
    'pinObjectives',
    'paused',
    'convertObjectiveValues',
  ])
    scalar(key, (v) => typeof v === 'boolean');
  for (const key of ['hue', 'chroma', 'backgroundLightness'])
    scalar(key, (v) => typeof v === 'number' && Number.isFinite(v));
  scalar('glpkAlgorithm', (v) => v === 'simplex' || v === 'exact');
  if (value['theme'] === 'black') {
    state['theme'] = 'dark';
    warnings.push('Theme black was renamed dark');
  } else
    scalar('theme', (v) => v === 'system' || v === 'light' || v === 'dark');

  if ('states' in value) {
    const archives: Record<string, Record<string, string>> = {};
    if (isRecord(value['states'])) {
      for (const [mod, entries] of Object.entries(value['states'])) {
        if (!isRecord(entries)) {
          warn(`states.${mod}`);
          continue;
        }
        const validEntries: [string, string][] = [];
        for (const [name, url] of Object.entries(entries)) {
          if (typeof url === 'string') validEntries.push([name, url]);
          else warn(`states.${mod}.${name}`);
        }
        Object.defineProperty(archives, mod, {
          value: Object.fromEntries(validEntries),
          enumerable: true,
        });
      }
    } else warn('states');
    state['states'] = archives;
  }

  if ('columns' in value) {
    const columns = structuredClone(defaults.columns);
    if (isRecord(value['columns'])) {
      for (const [key, entry] of Object.entries(value['columns'])) {
        if (!Object.hasOwn(columnsInfo, key) || !isRecord(entry)) {
          warn(`columns.${key}`);
          continue;
        }
        const column = columns[key as ColumnKey];
        if ('show' in entry) {
          if (typeof entry['show'] === 'boolean') column.show = entry['show'];
          else warn(`columns.${key}.show`);
        }
        if ('precision' in entry) {
          const precision = entry['precision'];
          if (
            precision === null ||
            (typeof precision === 'number' &&
              Number.isInteger(precision) &&
              precision >= 0 &&
              precision <= 100)
          )
            column.precision = precision;
          else warn(`columns.${key}.precision`);
        }
      }
    } else warn('columns');
    state['columns'] = columns;
  }

  if ('flowSettings' in value) {
    const flow: Record<string, unknown> = { ...defaults.flowSettings };
    const validators: Record<string, (v: unknown) => boolean> = {
      diagram: (v) => v === 0 || v === 1,
      linkSize: (v) => [0, 1, 2, 3, 4, 5].includes(v as number),
      linkText: (v) => [0, 1, 2, 3, 4, 5].includes(v as number),
      sankeyAlign: (v) => [0, 1, 2, 3].includes(v as number),
      hideExcluded: (v) => typeof v === 'boolean',
      elkAlgorithm: (v) => v === 'layered' || v === 'force' || v === 'stress',
    };
    if (isRecord(value['flowSettings'])) {
      for (const [key, entry] of Object.entries(value['flowSettings'])) {
        if (Object.hasOwn(validators, key) && validators[key](entry))
          flow[key] = entry;
        else warn(`flowSettings.${key}`);
      }
    } else warn('flowSettings');
    state['flowSettings'] = flow;
  }

  if ('sections' in value) {
    const sections: Record<string, boolean> = { ...defaults.sections };
    if (isRecord(value['sections'])) {
      for (const [key, entry] of Object.entries(value['sections'])) {
        if (Object.hasOwn(sections, key) && typeof entry === 'boolean')
          sections[key] = entry;
        else warn(`sections.${key}`);
      }
    } else warn('sections');
    state['sections'] = sections;
  }

  return { state, warnings };
}

export function createEndfieldProduct(
  production: boolean,
  browserLanguage: string,
): ProductProfile {
  const defaults = cloneDefaults(upstreamProduct.defaults());
  defaults.settings.costs.unproduceable = rational(1000000);
  defaults.settings.costs.surplus = rational.one;
  defaults.settings.costs.recycling = rational(1000);
  defaults.preferences.language = initialLanguage(production, browserLanguage);
  defaults.preferences.powerUnit = PowerUnit.kW;
  defaults.preferences.theme = 'light';
  defaults.preferences.flowSettings.diagram = FlowDiagram.BoxLine;
  const snapshot = immutableValue({
    ...defaults,
    extension: createEndfieldState(),
  });

  return {
    name: manifest.name,
    exportPrefix: manifest.exportPrefix,
    csv: endfieldCsv,
    sourceUrl: manifest.sourceUrl,
    issuesUrl: manifest.issuesUrl,
    logo: manifest.logo,
    loadingLogo: manifest.loadingLogo,
    systemIcons: [
      {
        id: 'endfield',
        file: 'endfield/game.webp',
        x: 0,
        y: 0,
        color: '#d9bd4c',
      },
    ],
    allowedModIds: ['aef'],
    defaultModId: 'aef',
    allowEditor: false,
    analytics: false,
    languages: endfieldLanguageOptions,
    defaults: () => snapshot,
    loadGameI18n: (modId, language) =>
      modId === 'aef' && ['en', 'zh', 'ja', 'ru'].includes(language),
    gameMetadata: (
      modId,
      _language,
      i18n,
    ): { name?: string; version?: Record<string, string> } => {
      if (modId !== 'aef' || i18n == null) return {};
      const metadata = i18n as typeof i18n & {
        name?: unknown;
        version?: unknown;
      };
      return {
        ...(typeof metadata.name === 'string' ? { name: metadata.name } : {}),
        ...(isRecord(metadata.version) &&
        Object.values(metadata.version).every((v) => typeof v === 'string')
          ? { version: metadata.version as Record<string, string> }
          : {}),
      };
    },
    migratePreferences: (value) =>
      migratePreferences(value, defaults.preferences),
  };
}

export function provideEndfieldProduct(): Provider {
  return {
    provide: PRODUCT_PROFILE,
    useFactory: (): ProductProfile =>
      createEndfieldProduct(
        environment.production,
        environment.production ? navigator.language : '',
      ),
  };
}
