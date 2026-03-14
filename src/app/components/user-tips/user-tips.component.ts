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
      name: '武陵毕业示例(需谷地传输致密源石粉末)',
      url: 'aef/flow?z=eJxFzLEKAjEQhOG3SfGDupvLHVpsYQ5EC6sTBLvDxkJJoz6.ZI1YzccwTLE8M6iEYjNpLdCFYhdicgitObFpOpOWvSvf0Nja8cjg0NYx1cVE-h32oHW4R4WOWL37O7-IK3.NqGM8fK8XHo-nSbiXq23D21Q.U1UrIA__&v=11',
    },
    {
      name: '武陵理论最高调度券(超出需求)',
      url: 'aef/flow?z=eJzLt3VK1NLSMlLLt03UMrEw0NIyVsu3jdIyMgEzDLSgIiFallBWuJaJnimY5ZShZWgEFXX21TIDMwyhYlrBIBXBWhBznD0hyizBVG6JrYFaTn6yraNama2hIQDwqh8.&v=11',
    },
  ];
}
