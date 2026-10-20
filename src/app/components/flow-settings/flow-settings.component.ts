import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { MultiSelectModule } from 'primeng/multiselect';
import { TooltipModule } from 'primeng/tooltip';

import { DropdownTranslateDirective } from '~/directives/dropdown-translate.directive';
import { spread } from '~/helpers';
import { FlowDiagram, flowDiagramOptions } from '~/models/enum/flow-diagram';
import { sankeyAlignOptions } from '~/models/enum/sankey-align';
import { FlowSettings } from '~/models/settings/flow-settings';
import { IconSmClassPipe } from '~/pipes/icon-class.pipe';
import { TranslatePipe } from '~/pipes/translate.pipe';
import {
  initialPreferencesState,
  PreferencesService,
} from '~/store/preferences.service';
import { SettingsService } from '~/store/settings.service';

import { DialogComponent } from '../modal';

const initialValue = initialPreferencesState.flowSettings;

@Component({
  selector: 'lab-flow-settings',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    CheckboxModule,
    DialogModule,
    DropdownModule,
    MultiSelectModule,
    TooltipModule,
    DropdownTranslateDirective,
    TranslatePipe,
    IconSmClassPipe,
  ],
  templateUrl: './flow-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowSettingsComponent extends DialogComponent {
  preferencesSvc = inject(PreferencesService);
  settingsSvc = inject(SettingsService);

  linkValueOptions = this.settingsSvc.linkValueOptions;
  publicSupplyOptions = computed(() => {
    const data = this.settingsSvc.dataset();
    return data.itemIds.map((id) => ({ id, name: data.itemEntities[id].name }));
  });

  editValue = {
    ...initialValue,
    publicSupplyItemIds: [...initialValue.publicSupplyItemIds],
  };

  flowDiagramOptions = flowDiagramOptions;
  sankeyAlignOptions = sankeyAlignOptions;

  FlowDiagram = FlowDiagram;

  get modified(): boolean {
    return (Object.keys(this.editValue) as (keyof FlowSettings)[]).some((k) =>
      k === 'publicSupplyItemIds'
        ? this.editValue[k].length !== initialValue[k].length ||
          this.editValue[k].some((id) => !initialValue[k].includes(id))
        : this.editValue[k] !== initialValue[k],
    );
  }

  initEdit(value: FlowSettings): void {
    this.editValue = spread(value, {
      publicSupplyItemIds: [...value.publicSupplyItemIds],
    });
  }

  open(value: FlowSettings): void {
    this.initEdit(value);
    this.show();
  }

  reset(): void {
    this.initEdit(initialValue);
  }

  save(): void {
    const flowSettings = this.editValue;
    this.preferencesSvc.apply({ flowSettings });
  }
}
