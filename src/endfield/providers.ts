import { Provider } from '@angular/core';

import { Adjustment } from '~/state/adjustment';
import { TRANSLATION_FALLBACK } from '~/translate/translate';

import { EndfieldAdjustment } from './adapters/calculation-extension';
import { endfieldTranslationFallback } from './adapters/translation-fallback';

export function provideEndfield(): Provider[] {
  return [
    { provide: Adjustment, useClass: EndfieldAdjustment },
    { provide: TRANSLATION_FALLBACK, useValue: endfieldTranslationFallback },
  ];
}
