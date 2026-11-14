import { DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  Signal,
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
import { PRESENTATION_EXTENSION } from '~/extensions/presentation-extension';
import {
  cloneDefaults,
  EFFECTIVE_DEFAULTS,
} from '~/extensions/product-profile';
import { WorkspaceLifecycle } from '~/extensions/workspace-lifecycle';
import { Rational, rational } from '~/rational/rational';
import {
  CostKey,
  costKeys,
  CostSettings,
} from '~/state/settings/cost-settings';
import { SettingsStore } from '~/state/settings/settings-store';
import { TranslatePipe } from '~/translate/translate-pipe';

interface CostDraft {
  costs: CostSettings;
  additional: Rational | undefined;
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
  protected readonly presentation = inject(PRESENTATION_EXTENSION);
  protected readonly ready = inject(WorkspaceLifecycle).ready;
  private readonly settingsStore = inject(SettingsStore);
  private readonly defaults = inject(EFFECTIVE_DEFAULTS);

  private readonly committedCosts = computed(
    () => this.settingsStore.state().costs,
  );
  private readonly additionalCost = ((): Signal<Rational> | undefined => {
    const cost = this.presentation.additionalCost;
    return cost == null
      ? undefined
      : computed(() => cost.value(), { equal: (a, b) => a.eq(b) });
  })();
  private readonly draft = linkedSignal<
    CostDraft & { ready: boolean },
    CostDraft
  >({
    source: () => ({
      costs: this.committedCosts(),
      additional: this.additionalCost?.(),
      ready: this.ready(),
    }),
    computation: ({ costs, additional, ready }, previous) =>
      !ready && previous ? previous.value : { costs, additional },
  });
  protected readonly editValue = computed(() => this.draft().costs);
  protected readonly editAdditionalCost = computed(
    () => this.draft().additional,
  );
  protected readonly modified = computed(() => {
    const edit = this.editValue();
    const init = this.defaults.settings.costs;
    const keys = Object.keys(init) as CostKey[];
    const additional = this.presentation.additionalCost;
    const additionalValue = this.editAdditionalCost();
    return (
      keys.some((k) => !init[k].eq(edit[k])) ||
      (additional != null &&
        additionalValue != null &&
        !additional.defaultValue.eq(additionalValue))
    );
  });

  protected readonly costKeys = costKeys;
  protected readonly faCheck = faCheck;
  protected readonly faRotateLeft = faRotateLeft;
  protected readonly faXmark = faXmark;
  readonly header = 'costs.header';
  protected readonly rational = rational;

  apply(key: CostKey, value: Rational): void {
    this.draft.update((draft) => ({
      ...draft,
      costs: { ...draft.costs, [key]: value },
    }));
  }

  applyAdditionalCost(value: Rational | undefined): void {
    if (value?.gte(rational.zero))
      this.draft.update((draft) => ({ ...draft, additional: value }));
  }

  reset(): void {
    if (!this.ready()) return;
    this.draft.set({
      costs: cloneDefaults(this.defaults).settings.costs,
      additional: this.presentation.additionalCost?.defaultValue,
    });
  }

  save(): void {
    if (!this.ready()) return;
    const { costs, additional } = this.draft();
    this.settingsStore.apply({ costs });
    if (additional != null) this.presentation.additionalCost?.save(additional);
    this.dialogRef.close();
  }
}
