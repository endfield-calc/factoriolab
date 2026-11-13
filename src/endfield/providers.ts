import { inject, Provider } from '@angular/core';

import { CALCULATION_EXTENSION } from '~/extensions/calculation-extension';
import { PRESENTATION_EXTENSION } from '~/extensions/presentation-extension';

import { endfieldCalculation } from './adapters/calculation-extension';
import { createEndfieldPresentation } from './adapters/presentation-extension';
import { provideEndfieldStateExtension } from './adapters/state-extension';

import { provideEndfieldProduct } from './product/product';
import { EndfieldDisplayPreferences } from './state/display-preferences';
import { EndfieldStore } from './state/endfield-store';

/** The only application composition point for the four independent contracts. */
export function provideEndfield(): Provider[] {
  return [
    provideEndfieldProduct(),
    ...provideEndfieldStateExtension(),
    { provide: CALCULATION_EXTENSION, useValue: endfieldCalculation },

    {
      provide: PRESENTATION_EXTENSION,
      useFactory: () =>
        createEndfieldPresentation(
          inject(EndfieldStore),
          inject(EndfieldDisplayPreferences),
        ),
    },
  ];
}
