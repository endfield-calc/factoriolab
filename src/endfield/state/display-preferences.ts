import { effect, Service, signal } from '@angular/core';

import { immutableValue } from '~/extensions/immutable';

interface DisplayPreferences {
  readonly showNames: boolean;
  readonly hideDuplicateIcons: boolean;
}

const storageKey = 'endfield.presentation';
const recoveryKey = 'preferences.recovery.endfield.presentation';
const recoveryPattern =
  /^preferences\.recovery\.endfield\.presentation(?:\.\d+)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

@Service()
export class EndfieldDisplayPreferences {
  // read() can disable persistence, so this must be initialized first.
  private allowPersist = true;
  private readonly _migrationWarnings = signal<readonly string[]>(
    immutableValue([] as string[]),
  );
  readonly migrationWarnings = this._migrationWarnings.asReadonly();
  private readonly _state = signal<DisplayPreferences>(
    immutableValue(this.read()),
  );
  readonly state = this._state.asReadonly();

  constructor() {
    effect(() => {
      if (!this.allowPersist) return;
      try {
        localStorage.setItem(storageKey, JSON.stringify(this.state()));
      } catch (error) {
        console.warn('Failed to save display preferences', error);
      }
    });
  }

  toggleNames(): void {
    this._state.update((value) =>
      immutableValue({ ...value, showNames: !value.showNames }),
    );
  }

  private read(): DisplayPreferences {
    let legacy: Record<string, unknown> = {};
    let legacyRaw: string | null = null;
    try {
      legacyRaw = localStorage.getItem('preferences');
    } catch {
      this.allowPersist = false;
      this.warn('endfield.recovery.displayStorageUnavailable');
    }
    if (legacyRaw != null) {
      try {
        const parsed: unknown = JSON.parse(legacyRaw);
        if (isRecord(parsed)) legacy = parsed;
      } catch {
        // PreferencesStore reports and preserves its own damaged value.
      }
    }

    let raw: string | null = null;
    try {
      raw = localStorage.getItem(storageKey);
    } catch {
      this.allowPersist = false;
      this.warn('endfield.recovery.displayStorageUnavailable');
    }

    let stored: Record<string, unknown> = {};
    if (raw != null) {
      let damaged: boolean;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!isRecord(parsed)) damaged = true;
        else {
          stored = parsed;
          damaged = ['showNames', 'hideDuplicateIcons'].some(
            (field) =>
              Object.hasOwn(parsed, field) &&
              typeof parsed[field] !== 'boolean',
          );
        }
      } catch {
        damaged = true;
      }
      if (damaged) {
        this.warn('endfield.recovery.displayDamaged');
        if (!this.backup(raw)) {
          this.allowPersist = false;
          this.warn('endfield.recovery.displayBackupFailed');
        }
      }
    }

    return {
      showNames:
        typeof stored['showNames'] === 'boolean' ? stored['showNames'] : false,
      hideDuplicateIcons:
        typeof stored['hideDuplicateIcons'] === 'boolean'
          ? stored['hideDuplicateIcons']
          : typeof legacy['hideDuplicateIcons'] === 'boolean'
            ? legacy['hideDuplicateIcons']
            : true,
    };
  }

  private warn(key: string): void {
    this._migrationWarnings.update((warnings) =>
      warnings.includes(key) ? warnings : immutableValue([...warnings, key]),
    );
  }

  /** Preserve distinct originals even when older numbered slots have gaps. */
  private backup(raw: string): boolean {
    try {
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (
          key != null &&
          recoveryPattern.test(key) &&
          localStorage.getItem(key) === raw
        )
          return true;
      }
      let key = recoveryKey;
      let suffix = 0;
      while (localStorage.getItem(key) != null)
        key = `${recoveryKey}.${++suffix}`;
      localStorage.setItem(key, raw);
      return localStorage.getItem(key) === raw;
    } catch (error) {
      console.warn('Failed to back up display preferences', error);
      return false;
    }
  }
}
