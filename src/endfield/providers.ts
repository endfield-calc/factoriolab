import { inject, Provider } from '@angular/core';

import { CALCULATION_EXTENSION } from '~/extensions/calculation-extension';
import { PRESENTATION_EXTENSION } from '~/extensions/presentation-extension';
import { TRANSLATION_FALLBACK } from '~/translate/translate';

import { endfieldCalculation } from './adapters/calculation-extension';
import { createEndfieldPresentation } from './adapters/presentation-extension';
import { provideEndfieldStateExtension } from './adapters/state-extension';
import { endfieldTranslationFallback } from './adapters/translation-fallback';
import { provideEndfieldProduct } from './product/product';
import { EndfieldDisplayPreferences } from './state/display-preferences';
import { EndfieldStore } from './state/endfield-store';
import { EndfieldElectricCost } from './ui/electric-cost';
import { EndfieldGuide } from './ui/guide';
import { EndfieldResources } from './ui/resources';

/** The only application composition point for the four independent contracts. */
export function provideEndfield(): Provider[] {
  return [
    provideEndfieldProduct(),
    ...provideEndfieldStateExtension(),
    { provide: CALCULATION_EXTENSION, useValue: endfieldCalculation },
    { provide: TRANSLATION_FALLBACK, useValue: endfieldTranslationFallback },
    {
      provide: PRESENTATION_EXTENSION,
      useFactory: () =>
        createEndfieldPresentation(
          inject(EndfieldStore),
          inject(EndfieldDisplayPreferences),
          [EndfieldResources, EndfieldGuide],
          [EndfieldElectricCost],
        ),
    },
  ];
}
