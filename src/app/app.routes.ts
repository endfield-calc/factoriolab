import { Routes } from '@angular/router';

import { canActivateId } from './guards/id.guard';
import { canActivateRatio } from './guards/ratio.guard';
import { DEFAULT_MOD } from './models/constants';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: `${DEFAULT_MOD}/list`,
  },
  {
    path: ':id',
    canActivate: [canActivateId],
    loadComponent: () =>
      import('./routes/id.component').then((c) => c.IdComponent),
    children: [
      {
        path: 'ratio',
        canActivate: [canActivateRatio],
        children: [],
      },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'list',
      },
      {
        path: '',
        loadChildren: () =>
          import('./routes/main/main.routes').then((m) => m.routes),
      },
    ],
  },
  {
    path: '**',
    redirectTo: `${DEFAULT_MOD}/list`,
  },
];
