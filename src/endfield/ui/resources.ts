import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { saveAs } from 'file-saver';

import { AccordionModule } from '~/components/accordion/accordion-module';
import { Button } from '~/components/button/button';
import { Checkbox } from '~/components/checkbox/checkbox';
import { FormField } from '~/components/form-field/form-field';
import { InputNumber } from '~/components/input-number/input-number';
import { Select } from '~/components/select/select';
import { WorkspaceLifecycle } from '~/extensions/workspace-lifecycle';
import { Rational, rational } from '~/rational/rational';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { TranslatePipe } from '~/translate/translate-pipe';

import { ovenId, ResourceId, resourceIds } from '../domain/model';
import { waterRecipeIds } from '../domain/presets';
import { EndfieldCoordinator } from '../state/coordinator';
import { EndfieldDisplayPreferences } from '../state/display-preferences';

/** The resource model stores physical rates per second; the editor uses per minute. */
export function perMinute(value: Rational): Rational {
  return value.mul(rational(60));
}
export function perSecond(value: Rational): Rational {
  return value.div(rational(60));
}

interface RecoveryBackup {
  key: string;
  value: string;
}

@Component({
  selector: 'lab-endfield-resources',
  imports: [
    RouterLink,
    AccordionModule,
    Button,
    Checkbox,
    FormField,
    InputNumber,
    Select,
    TranslatePipe,
  ],
  templateUrl: './resources.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class EndfieldResources {
  protected readonly coordinator = inject(EndfieldCoordinator);
  protected readonly lifecycle = inject(WorkspaceLifecycle);
  protected readonly preferences = inject(PreferencesStore);
  protected readonly displayPreferences = inject(EndfieldDisplayPreferences);
  protected readonly warnings = computed(() => [
    ...this.preferences.migrationWarnings,
    ...this.displayPreferences.migrationWarnings(),
  ]);
  protected readonly resources = resourceIds;
  protected readonly ovenId = ovenId;
  protected readonly perMinute = perMinute;
  protected readonly sourceOptions = [
    { value: 'tundra', label: 'endfield.resources.tundra' },
  ];
  protected readonly waterDisabled = computed(() =>
    waterRecipeIds.every((id) =>
      this.coordinator.settings().excludedRecipeIds.has(id),
    ),
  );
  protected readonly onlyTundra = computed(() => {
    const locations = this.coordinator.settings().locationIds;
    return locations.size === 1 && locations.has('tundra');
  });
  protected readonly backups = this.readBackups();

  protected resourceName(id: string): string {
    return this.coordinator.data().itemRecord[id]?.name ?? id;
  }

  protected updateRate(id: ResourceId, value: Rational | undefined): void {
    if (value == null) return;
    this.coordinator.dispatch({
      type: 'resourceRate',
      id,
      value: perSecond(value),
    });
  }

  protected updateMachineLimit(value: Rational | undefined): void {
    if (value != null)
      this.coordinator.dispatch({ type: 'machineLimit', id: ovenId, value });
  }

  protected download(name: string, value: string): void {
    saveAs(new Blob([value], { type: 'text/plain;charset=utf-8' }), name);
  }

  private readBackups(): RecoveryBackup[] {
    const result: RecoveryBackup[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key == null ||
          !/^preferences\.recovery(?:\.endfield\.presentation)?(?:\.\d+)?$/.test(
            key,
          )
        )
          continue;
        const value = localStorage.getItem(key);
        if (value != null) result.push({ key, value });
      }
    } catch {
      // A readable original can still be exported if enumerating backups fails.
    }
    const stored = this.preferences.stored();
    if (
      this.preferences.migrationWarnings.length &&
      stored &&
      !result.some((backup) => backup.value === stored)
    )
      result.push({ key: 'preferences', value: stored });
    if (
      this.displayPreferences
        .migrationWarnings()
        .includes('endfield.recovery.displayBackupFailed')
    ) {
      try {
        const value = localStorage.getItem('endfield.presentation');
        if (value != null && !result.some((backup) => backup.value === value))
          result.push({ key: 'endfield.presentation', value });
      } catch {
        // The stored value is untouched but cannot be read for export.
      }
    }
    return result.sort((a, b) => a.key.localeCompare(b.key));
  }
}
