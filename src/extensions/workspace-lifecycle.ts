import { Service, signal } from '@angular/core';

import { RestoreDiagnostic } from './state-extension';

/** Shared readiness without a dependency on RouterSync or any calculation store. */
@Service()
export class WorkspaceLifecycle {
  private generation = 0;
  private readonly _ready = signal(true);
  private readonly _diagnostics = signal<readonly RestoreDiagnostic[]>([]);
  private readonly _originalInput = signal('');
  readonly ready = this._ready.asReadonly();
  readonly diagnostics = this._diagnostics.asReadonly();
  readonly originalInput = this._originalInput.asReadonly();

  begin(originalInput: string): number {
    this.generation++;
    this._ready.set(false);
    this._diagnostics.set([]);
    this._originalInput.set(originalInput);
    return this.generation;
  }

  current(ticket: number): boolean {
    return this.generation === ticket;
  }

  complete(
    ticket: number,
    diagnostics: readonly RestoreDiagnostic[] = [],
  ): boolean {
    if (!this.current(ticket)) return false;
    if (diagnostics.some((d) => d.severity === 'error')) {
      this.fail(ticket, diagnostics);
      return false;
    }
    this._diagnostics.set(diagnostics);
    this._ready.set(true);
    return true;
  }

  fail(ticket: number, diagnostics: readonly RestoreDiagnostic[]): void {
    if (!this.current(ticket)) return;
    this._diagnostics.set(diagnostics);
    this._ready.set(false);
  }
}
