import { computed, inject, Provider } from '@angular/core';

import { Release } from '~/data/release';
import { CALCULATION_EXTENSION } from '~/extensions/calculation-extension';
import { PRESENTATION_EXTENSION } from '~/extensions/presentation-extension';
import { PRODUCT_PROFILE } from '~/extensions/product-profile';
import { Adjustment } from '~/state/adjustment';
import { TRANSLATION_FALLBACK } from '~/translate/translate';

import {
  EndfieldAdjustment,
  endfieldCalculation,
} from './adapters/calculation-extension';
import { createEndfieldPresentation } from './adapters/presentation-extension';
import { provideEndfieldStateExtension } from './adapters/state-extension';
import { endfieldTranslationFallback } from './adapters/translation-fallback';
import { provideEndfieldProduct } from './product/product';
import { EndfieldStore } from './state/endfield-store';
import { EndfieldGuide } from './ui/guide';
import { EndfieldResources } from './ui/resources';

/** Adapt the public release view without changing the upstream resource loader. */
class EndfieldRelease extends Release {
  private readonly product = inject(PRODUCT_PROFILE);
  override readonly version = computed(() => {
    const config = this.config.value();
    return config == null
      ? ''
      : `${this.product.name} ${config.version || '(dev)'}`;
  });
}

/** The only application composition point for the four independent contracts. */
export function provideEndfield(): Provider[] {
  return [
    provideEndfieldProduct(),
    { provide: Adjustment, useClass: EndfieldAdjustment },
    { provide: Release, useFactory: () => new EndfieldRelease() },
    ...provideEndfieldStateExtension(),
    { provide: CALCULATION_EXTENSION, useValue: endfieldCalculation },
    { provide: TRANSLATION_FALLBACK, useValue: endfieldTranslationFallback },
    {
      provide: PRESENTATION_EXTENSION,
      useFactory: () =>
        createEndfieldPresentation(inject(EndfieldStore), [
          EndfieldResources,
          EndfieldGuide,
        ]),
    },
  ];
}
