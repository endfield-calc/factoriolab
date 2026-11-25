import { isDevMode } from '@angular/core';

import { Theme } from '~/state/preferences/theme';
import { Language, languageOptions } from '~/translate/language';

import { StepDetailSection } from '../objectives/step-detail-section';
import { ColumnsState, initialColumnsState } from './columns-state';
import { FlowSettings, initialFlowSettings } from './flow-settings';
import { GlpkAlgorithm } from './glpk-algorithm';
import { PowerUnit } from './power-unit';

export interface PreferencesState {
  states: Record<string, Record<string, string>>;
  columns: ColumnsState;
  language: Language;
  powerUnit: PowerUnit;
  hue: number;
  chroma: number;
  backgroundLightness?: number;
  theme: Theme;
  bypassLanding: boolean;
  showTechLabels: boolean;
  pinObjectives: boolean;
  paused: boolean;
  convertObjectiveValues: boolean;
  glpkAlgorithm: GlpkAlgorithm;
  flowSettings: FlowSettings;
  sections: Record<StepDetailSection, boolean>;
}

export const initialPreferencesState: PreferencesState = {
  states: {},
  columns: initialColumnsState,
  language: initialLanguage(!isDevMode(), navigator.language),
  powerUnit: PowerUnit.kW,
  hue: 256,
  chroma: 100,
  theme: 'light',
  bypassLanding: false,
  showTechLabels: false,
  pinObjectives: false,
  paused: false,
  convertObjectiveValues: false,
  glpkAlgorithm: 'simplex',
  flowSettings: initialFlowSettings,
  sections: {
    sources: true,
    destinations: true,
    depletion: true,
    inputs: true,
    outputs: true,
  },
};

export function initialLanguage(
  production: boolean,
  browserLanguage: string,
): Language {
  if (!production) return 'en';
  const locale = browserLanguage.toLowerCase();
  const primary = locale.split('-')[0];
  return (
    languageOptions.find(({ value }) => value.toLowerCase() === locale)
      ?.value ??
    languageOptions.find(
      ({ value }) => value.toLowerCase().split('-')[0] === primary,
    )?.value ??
    'en'
  );
}
