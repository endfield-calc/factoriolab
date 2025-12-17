import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AccordionModule } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';

import { Language } from '~/models/enum/language';
import { TranslatePipe } from '~/pipes/translate.pipe';
import { PreferencesService } from '~/store/preferences.service';

import { environment } from '../../../environments';

@Component({
  selector: 'lab-user-tips',
  standalone: true,
  imports: [AccordionModule, ButtonModule, TranslatePipe],
  templateUrl: './user-tips.component.html',
  styleUrl: './user-tips.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserTipsComponent {
  protected readonly environment = environment;
  protected readonly Language = Language;

  preferencesSvc = inject(PreferencesService);
  language = this.preferencesSvc.language;

  protected readonly examples: { name: string; url: string }[] = [
    {
      name: '四号谷地毕业示例',
      url: 'aef/flow?z=eJwtxqEKgEAQBNC.2TAg7N15YpmyyWA02cSqTBGDXy.ivfTEWAFkEzfUwYFioiP3rQuSj-0dKgowmfigfA0T69.ZdF50O7Qz7GZKL9NzFbY_&v=11',
    },
    {
      name: '武陵毕业示例',
      url: 'aef/list?o=jinlong_coupon***2&o=originium_ore*360**3&o=quartz_sand*0**3&o=iron_ore*90**3&o=xiranite_powder*2*3*3*xiranite_oven_1&o=power_proc_battery_4*2*3**power_sta_1&omt=0&loc=A&v=11',
    },
  ];
}
