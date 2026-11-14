import { isDevMode, Provider } from '@angular/core';

import {
  cloneDefaults,
  EFFECTIVE_DEFAULTS,
  EffectiveDefaults,
  initialDefaults,
  PINNED_MOD_ID,
} from '~/extensions/defaults';
import { immutableValue } from '~/extensions/immutable';
import { rational } from '~/rational/rational';
import { FlowDiagram } from '~/state/preferences/flow-diagram';
import { PowerUnit } from '~/state/preferences/power-unit';
import { Language, languageOptions } from '~/translate/language';

function initialLanguage(
  production: boolean,
  browserLanguage: string,
): Language {
  if (!production) return 'en';
  const value = browserLanguage.toLowerCase();
  const languages = languageOptions.map((option) => option.value);
  return (
    languages.find((language) => language.toLowerCase() === value) ??
    languages.find(
      (language) =>
        language.toLowerCase().split('-')[0] === value.split('-')[0],
    ) ??
    'en'
  );
}

export function createEndfieldDefaults(
  production: boolean,
  browserLanguage: string,
): EffectiveDefaults {
  const result = cloneDefaults(initialDefaults);
  result.settings.costs.surplus = rational.one;
  result.preferences.language = initialLanguage(production, browserLanguage);
  result.preferences.powerUnit = PowerUnit.kW;
  result.preferences.theme = 'light';
  result.preferences.flowSettings.diagram = FlowDiagram.BoxLine;
  return immutableValue(result);
}

export function provideEndfieldDefaults(): Provider[] {
  return [
    { provide: PINNED_MOD_ID, useValue: 'aef' },
    {
      provide: EFFECTIVE_DEFAULTS,
      useFactory: () =>
        createEndfieldDefaults(!isDevMode(), navigator.language),
    },
  ];
}
