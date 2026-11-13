import { DialogRef } from '@angular/cdk/dialog';
import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  faCheck,
  faRotateLeft,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';

import { Button } from '~/components/button/button';
import { DialogData } from '~/components/dialog/dialog';
import { InputNumber } from '~/components/input-number/input-number';
import { Tooltip } from '~/components/tooltip/tooltip';
import { PRESENTATION_EXTENSION } from '~/extensions/presentation-extension';
import {
  cloneDefaults,
  EFFECTIVE_DEFAULTS,
} from '~/extensions/product-profile';
import { WorkspaceLifecycle } from '~/extensions/workspace-lifecycle';
import { Rational, rational } from '~/rational/rational';
import { CostKey, costKeys } from '~/state/settings/cost-settings';
import { SettingsStore } from '~/state/settings/settings-store';
import { TranslatePipe } from '~/translate/translate-pipe';

@Component({
  selector: 'lab-cost-settings-dialog',
  imports: [
    FormsModule,
    NgComponentOutlet,
    Button,
    InputNumber,
    Tooltip,
    TranslatePipe,
  ],
  templateUrl: './cost-settings-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'flex w-sm max-w-full flex-col gap-3 overflow-hidden p-3 pt-0 sm:gap-6 sm:p-6 sm:pt-0',
  },
})
export class CostSettingsDialog implements DialogData {
  protected readonly dialogRef = inject(DialogRef);
  protected readonly presentation = inject(PRESENTATION_EXTENSION);
  protected readonly ready = inject(WorkspaceLifecycle).ready;
  private readonly settingsStore = inject(SettingsStore);
  private readonly defaults = inject(EFFECTIVE_DEFAULTS);

  protected readonly editValue = linkedSignal(
    () => this.settingsStore.settings().costs,
  );
  protected readonly modified = computed(() => {
    const edit = this.editValue();
    const init = this.defaults.settings.costs;
    const keys = Object.keys(init) as CostKey[];
    return (
      keys.some((k) => !init[k].eq(edit[k])) ||
      this.presentation.costsModified()
    );
  });

  protected readonly costKeys = costKeys;
  protected readonly faCheck = faCheck;
  protected readonly faRotateLeft = faRotateLeft;
  protected readonly faXmark = faXmark;
  readonly header = 'costs.header';
  protected readonly rational = rational;

  apply(key: CostKey, value: Rational): void {
    this.editValue.update((e) => ({ ...e, ...{ [key]: value } }));
  }

  reset(): void {
    if (!this.ready()) return;
    this.editValue.set(cloneDefaults(this.defaults).settings.costs);
    this.presentation.resetCosts();
  }

  save(): void {
    if (!this.ready()) return;
    const costs = this.editValue();
    this.settingsStore.apply({ costs });
    this.dialogRef.close();
  }
}
