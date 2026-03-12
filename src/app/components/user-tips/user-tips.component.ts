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
      url: 'aef/flow?z=eJw1yDEKgDAQBMDfXLEg5C5GbLYJCBaWVunEVrlGRHy9iLEbxpkLTDWJc0HqAhDFWWA9IjCIM8Da2gfU.p6hoa.fIL09ivNGfJnFmT5O4rxgdfeDQTZfmeWk6gNmmh4R&v=11',
    },
    {
      name: '谷地理论最高调度券(超出需求)',
      url: 'aef/flow?o=tundra_coupon***2&o=originium_ore*560**3&o=quartz_sand*240**3&o=iron_ore*1080**3&o=power_proc_battery_3*4*3**power_sta_1&o=power_proc_battery_2**3&omt=0&loc=B&v=11',
    },
    {
      name: '武陵毕业示例(暂定)(需谷地传输蓝铁块)',
      url: 'aef/flow?z=eJxNjbEKAjEQRP9miyk0m-QOLbYwweMELSSKYnfYWKjbqN8vGyLYvZkd3qqkCT07UklPIMBjTyoT4sIBgVQu8BEBWJOKQysPWDY6Ic46uw-kUuA7gE12A.s2yTv0tjiSCrcaxUYFVW2cR7Cr.7eWhv-U3vBzM6UErpA35sBo3fmHj5c4uutVVvQR5i-dgTMN&v=11',
    },
    {
      name: '旧版本武陵毕业示例(需谷地传输铁零件)',
      url: 'aef/flow?z=eJxFzLsOQFAQBNC.2WIK7rWexRYkHoWOhOhES7YR3y-LRHdmJhmVakWUx6SyglMHMKks8DkYqEnF4StHFJ8mxEFie0Mq1YzI3JmHx4zhD68nJEXI7hl7K1pkIdvbcYqjXTcp6RLvb4p4IhA_&v=11',
    },
  ];
}
