import { computed, inject, Provider } from '@angular/core';
import { CanActivateFn, PRIMARY_OUTLET, Router, Routes } from '@angular/router';

import { idGuard } from '~/app/id/id-guard';
import { landingGuard } from '~/app/landing/landing-guard';
import { DEFAULT_MOD } from '~/data/datasets';
import { Release } from '~/data/release';
import { CALCULATION_EXTENSION } from '~/extensions/calculation-extension';
import { PRESENTATION_EXTENSION } from '~/extensions/presentation-extension';
import { PRODUCT_PROFILE } from '~/extensions/product-profile';
import { Adjustment } from '~/state/adjustment';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { RouterSync } from '~/state/router/router-sync';
import { TRANSLATION_FALLBACK } from '~/translate/translate';

import {
  EndfieldAdjustment,
  endfieldCalculation,
} from './adapters/calculation-extension';
import { createEndfieldPresentation } from './adapters/presentation-extension';
import { provideEndfieldStateExtension } from './adapters/state-extension';
import { endfieldTranslationFallback } from './adapters/translation-fallback';
import { provideEndfieldProduct } from './product/product';
import { EndfieldDisplayPreferences } from './state/display-preferences';
import { EndfieldStore } from './state/endfield-store';
import { EndfieldElectricCost } from './ui/electric-cost';
import { EndfieldGuide } from './ui/guide';
import { EndfieldResources } from './ui/resources';

export const endfieldIdGuard: CanActivateFn = (route, state) => {
  const product = inject(PRODUCT_PROFILE);
  if (product.allowedModIds == null) return idGuard(route, state);

  const router = inject(Router);
  const defaultId = product.defaultModId ?? DEFAULT_MOD;
  const id = route.params['id'] as string | undefined;
  if (id && ['list', 'wizard', 'flow', 'data'].includes(id))
    return router.createUrlTree([defaultId, id], {
      queryParams: route.queryParams,
    });
  return id && product.allowedModIds.includes(id)
    ? true
    : router.createUrlTree([defaultId]);
};

export const endfieldLandingGuard: CanActivateFn = (route, state) => {
  const product = inject(PRODUCT_PROFILE);
  if (product.allowedModIds == null) return landingGuard(route, state);

  const router = inject(Router);
  const defaultId = product.defaultModId ?? DEFAULT_MOD;
  const bypassLanding = inject(PreferencesStore).bypassLanding();
  if (bypassLanding) {
    const queryState = inject(RouterSync).stored();
    if (
      queryState &&
      Object.keys(route.params).length === 0 &&
      Object.keys(route.queryParams).length === 0
    ) {
      const cached = router.parseUrl(queryState);
      const id = cached.root.children[PRIMARY_OUTLET]?.segments[0]?.path;
      if (id && product.allowedModIds.includes(id)) return cached;
    }

    const id = route.paramMap.get('id') ?? defaultId;
    return router.createUrlTree([id, 'list'], {
      queryParams: route.queryParams,
    });
  }

  if (route.params['id'] == null)
    return router.createUrlTree([defaultId], {
      queryParams: route.queryParams,
    });

  return true;
};

export const editorGuard: CanActivateFn = () => {
  const product = inject(PRODUCT_PROFILE);
  return (
    product.allowEditor ||
    inject(Router).createUrlTree([product.defaultModId ?? DEFAULT_MOD])
  );
};

/** Add product policy without changing or duplicating the upstream route table. */
export function configureEndfieldRoutes(routes: Routes): Routes {
  return routes.map((route) => {
    const canActivate = route.canActivate?.map((guard) => {
      if (guard === idGuard) return endfieldIdGuard;
      if (guard === landingGuard) return endfieldLandingGuard;
      return guard;
    });
    return {
      ...route,
      ...(canActivate == null ? {} : { canActivate }),
      ...(route.path === 'editor'
        ? { canActivate: [...(canActivate ?? []), editorGuard] }
        : {}),
      ...(route.children == null
        ? {}
        : { children: configureEndfieldRoutes(route.children) }),
    };
  });
}

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
        createEndfieldPresentation(
          inject(EndfieldStore),
          inject(EndfieldDisplayPreferences),
          [EndfieldResources, EndfieldGuide],
          [EndfieldElectricCost],
        ),
    },
  ];
}
