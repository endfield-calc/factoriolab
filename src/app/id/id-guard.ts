import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { DEFAULT_MOD } from '~/data/datasets';

export const idGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  const id = route.params['id'] as string | undefined;

  switch (id) {
    case 'list':
    case 'wizard':
    case 'flow':
    case 'data': {
      return router.createUrlTree([DEFAULT_MOD, id], {
        queryParams: route.queryParams,
      });
    }
  }

  return id === DEFAULT_MOD ? true : router.createUrlTree([DEFAULT_MOD]);
};

export const editorGuard: CanActivateFn = () =>
  inject(Router).createUrlTree([DEFAULT_MOD]);
