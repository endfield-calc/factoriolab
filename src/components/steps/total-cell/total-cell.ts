import { KeyValue, KeyValuePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';

import { Icon } from '~/components/icon/icon';
import { Tooltip } from '~/components/tooltip/tooltip';
import { PRESENTATION_EXTENSION } from '~/extensions/presentation-extension';
import { TotalValue } from '~/state/objectives/total-value';
import { SettingsStore } from '~/state/settings/settings-store';

@Component({
  selector: 'td[labTotalCell], td[lab-total-cell]',
  exportAs: 'labTotalCell',
  imports: [Icon, KeyValuePipe, Tooltip],
  templateUrl: './total-cell.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TotalCell {
  readonly value = input.required<Record<string, TotalValue>>();
  protected readonly presentation = inject(PRESENTATION_EXTENSION);
  protected readonly settingsStore = inject(SettingsStore);

  protected itemName(id: string): string {
    return this.settingsStore.dataset().itemRecord[id]?.name ?? id;
  }

  sortByValue(
    a: KeyValue<string, TotalValue>,
    b: KeyValue<string, TotalValue>,
  ): number {
    return b.value.total.sub(a.value.total).toNumber();
  }
}
