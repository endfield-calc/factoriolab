import {
  ChangeDetectionStrategy,
  Component,
  inject,
  linkedSignal,
} from '@angular/core';

import { Button } from '~/components/button/button';
import { FormField } from '~/components/form-field/form-field';
import { InputNumber } from '~/components/input-number/input-number';
import { Rational } from '~/rational/rational';
import { TranslatePipe } from '~/translate/translate-pipe';

import { EndfieldCoordinator } from '../state/coordinator';

@Component({
  selector: 'lab-endfield-electric-cost',
  imports: [Button, FormField, InputNumber, TranslatePipe],
  templateUrl: './electric-cost.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class EndfieldElectricCost {
  protected readonly coordinator = inject(EndfieldCoordinator);
  protected readonly value = linkedSignal(
    () => this.coordinator.state().electric,
  );
  protected updateValue(value: Rational | undefined): void {
    if (value != null) this.value.set(value);
  }
}
