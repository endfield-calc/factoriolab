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
import {
  CostKey,
  costKeys,
  CostSettings,
} from '~/state/settings/cost-settings';
import { initialSettingsState } from '~/state/settings/settings-state';
import { SettingsStore } from '~/state/settings/settings-store';
import { WorkspaceLifecycle } from '~/state/workspace-lifecycle';
import { TranslatePipe } from '~/translate/translate-pipe';

interface CostDraft {
  costs: CostSettings;
  electric: Rational;
}

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
  protected readonly ready = inject(WorkspaceLifecycle).ready;
  private readonly endfieldStore = inject(EndfieldStore);
  private readonly settingsStore = inject(SettingsStore);

  private readonly committedCosts = computed(
    () => this.settingsStore.state().costs,
  );
  private readonly committedElectric = computed(
    () => this.endfieldStore.state().electric,
    { equal: (a, b) => a.eq(b) },
  );
  private readonly draft = linkedSignal<
    CostDraft & { ready: boolean },
    CostDraft
  >({
    source: () => ({
      costs: this.committedCosts(),
      electric: this.committedElectric(),
      ready: this.ready(),
    }),
    computation: ({ costs, electric, ready }, previous) =>
      !ready && previous ? previous.value : { costs, electric },
  });
  protected readonly editValue = computed(() => this.draft().costs);
  protected readonly editElectric = computed(() => this.draft().electric);
  protected readonly modified = computed(() => {
    const edit = this.editValue();
    const init = initialSettingsState.costs;
    const keys = Object.keys(init) as CostKey[];
    return (
      keys.some((k) => !init[k].eq(edit[k])) ||
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
    if (!this.ready()) return;
    this.draft.set({
      costs: { ...initialSettingsState.costs },
      electric: rational.one,
    });
  }

  save(): void {
    if (!this.ready()) return;
    const { costs, electric } = this.draft();
    if (
      !(electric instanceof Rational) ||
      electric.lt(rational.zero) ||
      costKeys.some((key) => !(costs[key] instanceof Rational))
    )
      return;
    this.settingsStore.apply({ costs });
    this.endfieldStore.set({ ...this.endfieldStore.state(), electric });
    this.dialogRef.close();
  }
}
