import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
} from '@angular/router';
import { from, map, switchMap } from 'rxjs';

import { coalesce } from '~/helpers';
import { DEFAULT_MOD } from '~/models/constants';
import { MigrationService } from '~/services/migration.service';
import { RouterService } from '~/services/router.service';

import { environment } from '../../environments';

const baseHref = environment.baseHref.replace('/', '');

export const canActivateId: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  _: RouterStateSnapshot,
) => {
  const router = inject(Router);
  const migrationSvc = inject(MigrationService);
  const routerSvc = inject(RouterService);
  const id = route.params['id'] as string | undefined;

  // istanbul ignore if: Don't test only allow aef
  if (environment.production) {
    if (id === 'aef' || id === baseHref) return true;
    return router.createUrlTree(['aef']);
  }

  // Migrate old states
  switch (id) {
    case 'list':
    case 'wizard':
    case 'flow':
    case 'data': {
      return from(routerSvc.unzipQueryParams(route.queryParams)).pipe(
        map((queryParams) => migrationSvc.migrate(undefined, queryParams)),
        switchMap(async ({ modId, params }) => {
          if (params.z) params = await routerSvc.getHashParams(params);
          return router.createUrlTree([coalesce(modId, '1.1'), id], {
            queryParams: params,
          });
        }),
      );
    }
    case 'factorio':
      return router.createUrlTree([DEFAULT_MOD]);
    case 'satisfactory':
      return router.createUrlTree(['sfy']);
    case 'techtonica':
      return router.createUrlTree(['tta']);
    case 'final-factory':
      return router.createUrlTree(['ffy']);
  }

  return true;
};
