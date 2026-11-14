import { Provider } from '@angular/core';

import { Adjustment } from '~/state/adjustment';
import { TRANSLATION_FALLBACK } from '~/translate/translate';

import { EndfieldAdjustment } from './adapters/calculation-extension';
import { endfieldTranslationFallback } from './adapters/translation-fallback';
import { provideEndfieldDefaults } from './product/product';

export function provideEndfield(): Provider[] {
  return [
    ...provideEndfieldDefaults(),
    { provide: Adjustment, useClass: EndfieldAdjustment },
    { provide: TRANSLATION_FALLBACK, useValue: endfieldTranslationFallback },
  ];
}
