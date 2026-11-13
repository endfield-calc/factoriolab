import { inject, Provider, Service } from '@angular/core';

import { encodeEndfield } from '~/endfield/compat/codec';
import {
  decodeWorkspace,
  preflightWorkspace,
  prepareEndfield,
} from '~/endfield/compat/restore';
import { EndfieldState } from '~/endfield/domain/model';
import { EndfieldStore } from '~/endfield/state/endfield-store';
import { STATE_EXTENSION, StateExtension } from '~/extensions/state-extension';

/** Only the independent store is injected; decoding never reads live stores. */
@Service()
export class EndfieldStateExtension implements StateExtension {
  private readonly store = inject(EndfieldStore);
  readonly strictImports = true;

  snapshot(): EndfieldState {
    return this.store.snapshot();
  }
  encode(snapshot: unknown): { ef: string } {
    return { ef: encodeEndfield(snapshot as EndfieldState) };
  }
  prepare = prepareEndfield;
  preflight = preflightWorkspace;
  decode = decodeWorkspace;
  commit(snapshot: unknown): void {
    this.store.set(snapshot as EndfieldState);
  }
  reset(): void {
    this.store.reset();
  }
}

export function provideEndfieldStateExtension(): Provider[] {
  return [
    EndfieldStore,
    EndfieldStateExtension,
    { provide: STATE_EXTENSION, useExisting: EndfieldStateExtension },
  ];
}
