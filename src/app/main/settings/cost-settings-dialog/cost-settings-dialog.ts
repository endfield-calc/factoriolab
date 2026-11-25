import { DialogRef } from '@angular/cdk/dialog';
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
import { FormField } from '~/components/form-field/form-field';
import { InputNumber } from '~/components/input-number/input-number';
import { Tooltip } from '~/components/tooltip/tooltip';
import { EndfieldStore } from '~/endfield/state/endfield-store';
import { Rational, rational } from '~/rational/rational';
import { CostKey, costKeys } from '~/state/settings/cost-settings';
import { initialSettingsState } from '~/state/settings/settings-state';
import { SettingsStore } from '~/state/settings/settings-store';
import { TranslatePipe } from '~/translate/translate-pipe';

@Component({
  selector: 'lab-cost-settings-dialog',
  imports: [
    FormsModule,
    Button,
    FormField,
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
  private readonly endfieldStore = inject(EndfieldStore);
  private readonly settingsStore = inject(SettingsStore);

  private readonly committedCosts = computed(
    () => this.settingsStore.state().costs,
  );
  private readonly draft = linkedSignal(() => ({
    costs: this.committedCosts(),
    electric: this.endfieldStore.electric(),
  }));
  protected readonly editValue = computed(() => this.draft().costs);
  protected readonly editElectric = computed(() => this.draft().electric);
  protected readonly modified = computed(() => {
    const edit = this.editValue();
    const init = initialSettingsState.costs;
    return (
      costKeys.some((k) => !init[k].eq(edit[k])) ||
      !rational.one.eq(this.editElectric())
    );
  });

  protected readonly costKeys = costKeys;
  protected readonly faCheck = faCheck;
  protected readonly faRotateLeft = faRotateLeft;
  protected readonly faXmark = faXmark;
  readonly header = 'costs.header';
  protected readonly rational = rational;

  apply(key: CostKey, value: Rational | undefined): void {
    if (!(value instanceof Rational)) return;
    this.draft.update((draft) => ({
      ...draft,
      costs: { ...draft.costs, [key]: value },
    }));
  }

  applyElectric(value: Rational | undefined): void {
    if (value?.gte(rational.zero))
      this.draft.update((draft) => ({ ...draft, electric: value }));
  }

  reset(): void {
    this.draft.set({
      costs: initialSettingsState.costs,
      electric: rational.one,
    });
  }

  save(): void {
    const { costs, electric } = this.draft();
    this.settingsStore.apply({ costs });
    this.endfieldStore.set({ ...this.endfieldStore.state(), electric });
    this.dialogRef.close();
  }
}
