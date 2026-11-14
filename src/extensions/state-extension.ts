import { ItemState } from '~/state/items/item-state';
import { MachineState } from '~/state/machines/machine-state';
import { ObjectiveState } from '~/state/objectives/objective';
import { RecipeState } from '~/state/recipes/recipe-state';
import { PartialSettingsState } from '~/state/settings/settings-state';
import { TableState } from '~/state/table/table-state';

export interface WorkspaceState {
  objectivesState?: Record<string, ObjectiveState>;
  itemsState?: Record<string, ItemState>;
  recipesState?: Record<string, RecipeState>;
  machinesState?: Record<string, MachineState>;
  settingsState?: PartialSettingsState;
  tableState?: Partial<TableState>;
}

export interface RestoreDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly field?: string;
  readonly severity: 'warning' | 'error';
}

export class WorkspaceRestoreError extends Error {
  constructor(readonly diagnostics: readonly RestoreDiagnostic[]) {
    super(diagnostics.map((d) => d.message).join('\n'));
  }
}
