import { inject } from '@angular/core';
import { RedirectFunction, Router, Routes } from '@angular/router';

import { DEFAULT_MOD } from '~/data/datasets';

// Old shortcuts carry the share parameters to the dataset route for decoding.
function redirectShortcut(...segments: string[]): RedirectFunction {
  return ({ queryParams }) =>
    inject(Router).createUrlTree([DEFAULT_MOD, ...segments], { queryParams });
}

export const shortcutRoutes: Routes = [
  ...['list', 'flow', 'data'].map((path) => ({
    path,
    pathMatch: 'full' as const,
    redirectTo: redirectShortcut(path),
  })),
  { path: 'wizard', pathMatch: 'full', redirectTo: redirectShortcut() },
  {
    path: `${DEFAULT_MOD}/wizard`,
    pathMatch: 'full',
    redirectTo: redirectShortcut(),
  },
];
