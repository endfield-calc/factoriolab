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
      url: 'aef/flow?z=eJwtxqEKgEAQBNC.2TAg7N15YpmyyWA02cSqTBGDXy.ivfTEWAFkEzfUwYFioiP3rQuSj-0dKgowmfigfA0T69.ZdF50O7Qz7GZKL9NzFbY_&v=11',
    },
    {
      name: '旧版本武陵毕业示例(需谷地传输铁零件)',
      url: 'aef/flow?z=eJxFzLsOQFAQBNC.2WIK7rWexRYkHoWOhOhES7YR3y-LRHdmJhmVakWUx6SyglMHMKks8DkYqEnF4StHFJ8mxEFie0Mq1YzI3JmHx4zhD68nJEXI7hl7K1pkIdvbcYqjXTcp6RLvb4p4IhA_&v=11',
    },
  ];
}
