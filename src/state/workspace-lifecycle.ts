import { Service, signal } from '@angular/core';

/** Shared readiness without a dependency on RouterSync or any calculation store. */
@Service()
export class WorkspaceLifecycle {
  private generation = 0;
  private readonly _ready = signal(true);
  private readonly _errors = signal<readonly string[]>([]);
  private readonly _originalInput = signal('');
  readonly ready = this._ready.asReadonly();
  readonly errors = this._errors.asReadonly();
  readonly originalInput = this._originalInput.asReadonly();

  begin(originalInput: string): number {
    this.generation++;
    this._ready.set(false);
    this._errors.set([]);
    this._originalInput.set(originalInput);
    return this.generation;
  }

  current(ticket: number): boolean {
    return this.generation === ticket;
  }

  complete(ticket: number): boolean {
    if (!this.current(ticket) || this._errors().length) return false;
    this._errors.set([]);
    this._ready.set(true);
    return true;
  }

  fail(ticket: number, errors: readonly string[]): void {
    if (!this.current(ticket)) return;
    this._errors.set(errors);
    this._ready.set(false);
  }
}
