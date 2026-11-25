import { inject } from '@angular/core';
import { CanActivateFn, PRIMARY_OUTLET, Router } from '@angular/router';

import { DEFAULT_MOD } from '~/data/datasets';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { RouterSync } from '~/state/router/router-sync';

export const landingGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  // The fixed aef route has no :id, so params cannot distinguish it from root.
  const isRoot = route.parent?.routeConfig == null;
  const bypassLanding = inject(PreferencesStore).bypassLanding();
  if (bypassLanding) {
    // If navigating to root with no query params, use last known state
    if (isRoot && Object.keys(route.queryParams).length === 0) {
      const queryState = inject(RouterSync).stored();
      if (queryState) {
        const cached = router.parseUrl(queryState);
        const id = cached.root.children[PRIMARY_OUTLET]?.segments[0]?.path;
        if (id === DEFAULT_MOD) return cached;
      }
    }

    // Navigate to list, preserving query params from target route
    return router.createUrlTree([DEFAULT_MOD, 'list'], {
      queryParams: route.queryParams,
    });
  }

  // If we are at root, redirect to default mod
  if (isRoot)
    return router.createUrlTree([DEFAULT_MOD], {
      queryParams: route.queryParams,
    });

  return true;
};
