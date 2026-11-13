import { inject, Service, signal } from '@angular/core';

import { WorkspaceLifecycle } from '~/extensions/workspace-lifecycle';
import { SettingsStore } from '~/state/settings/settings-store';

import {
  applyEndfieldAction,
  EndfieldAction,
  EndfieldActionDiagnostic,
} from '../domain/presets';
import { EndfieldStore } from './endfield-store';

/** The only UI command boundary that coordinates resource and upstream settings. */
@Service()
export class EndfieldCoordinator {
  private readonly store = inject(EndfieldStore);
  private readonly settingsStore = inject(SettingsStore);
  private readonly lifecycle = inject(WorkspaceLifecycle);
  private readonly _diagnostics = signal<readonly EndfieldActionDiagnostic[]>(
    [],
  );
  readonly diagnostics = this._diagnostics.asReadonly();
  readonly state = this.store.state;
  readonly settings = this.settingsStore.settings;
  readonly data = this.settingsStore.dataset;
  readonly ready = this.lifecycle.ready;

  dispatch(action: EndfieldAction): boolean {
    if (!this.ready()) return false;
    const settings = this.settings();
    const result = applyEndfieldAction(this.store.snapshot(), action, {
      defaultLocationIds: settings.defaultLocationIds,
      excludedRecipeIds: settings.excludedRecipeIds,
    });
    this._diagnostics.set(result.diagnostics);
    if (result.diagnostics.length) return false;
    // Signal effects run after this synchronous command, so consumers see one snapshot.
    const patch = {
      ...(result.settings.locationIds == null
        ? {}
        : { locationIds: new Set(result.settings.locationIds) }),
      ...(result.settings.excludedRecipeIds == null
        ? {}
        : { excludedRecipeIds: new Set(result.settings.excludedRecipeIds) }),
    };
    this.store.set(result.state);
    if (Object.keys(patch).length) this.settingsStore.apply(patch);
    return true;
  }
}
