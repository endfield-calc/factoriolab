import { InjectionToken } from '@angular/core';

import { ModData } from '~/data/schema/mod-data';
import { ModHash } from '~/data/schema/mod-hash';
import { ItemState } from '~/state/items/item-state';
import { MachineState } from '~/state/machines/machine-state';
import {
  ObjectiveSettings,
  ObjectiveState,
} from '~/state/objectives/objective';
import { RecipeState } from '~/state/recipes/recipe-state';
import { LabParams } from '~/state/router/lab-params';
import { Params } from '~/state/router/params';
import { PartialSettingsState } from '~/state/settings/settings-state';
import { TableState } from '~/state/table/table-state';

import { ReadonlyValue } from './immutable';

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

export interface RestoreInput {
  readonly modId?: string;
  readonly params: Params;
}

export interface RestorePlan extends RestoreInput {
  readonly context?: unknown;
  readonly hash?: ModHash;
  readonly legacyModHashes?: {
    readonly modHash: (string | null)[];
    readonly modHashV0: (string | null)[];
  };
  readonly prepareObjectives?: boolean;
}

export interface DecodedWorkspace {
  readonly state: WorkspaceState;
  readonly extension?: unknown;
  readonly diagnostics: readonly RestoreDiagnostic[];
}

/** Only the independent extension state may be read or committed by a provider. */
export interface StateExtension {
  readonly strictImports: boolean;
  snapshot(): unknown;
  encode(snapshot: unknown): Params;
  prepare(input: RestoreInput): RestorePlan;
  /** Validate detached values before upstream preparation and select required objectives. */
  preflight(input: {
    readonly state: WorkspaceState;
    readonly plan: RestorePlan;
    readonly data: ModData;
  }): readonly string[];
  decode(input: {
    readonly state: WorkspaceState;
    readonly params: LabParams;
    readonly plan: RestorePlan;
    readonly data: ModData;
    readonly hash: ModHash;
    readonly preparedObjectives?: ReadonlyValue<
      Record<string, ObjectiveSettings>
    >;
  }): DecodedWorkspace;
  commit(snapshot: unknown): void;
  reset(): void;
}

export const upstreamState: StateExtension = {
  strictImports: false,
  snapshot: () => undefined,
  encode: () => ({}),
  prepare: (input) => input,
  preflight: () => [],
  decode: ({ state }) => ({ state, diagnostics: [] }),
  commit: () => undefined,
  reset: () => undefined,
};
export const STATE_EXTENSION = new InjectionToken<StateExtension>(
  'STATE_EXTENSION',
  { factory: (): StateExtension => upstreamState },
);
