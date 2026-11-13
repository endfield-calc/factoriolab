import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import manifest from '/public/endfield/product.json';
import { AccordionModule } from '~/components/accordion/accordion-module';
import { Button } from '~/components/button/button';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { TranslatePipe } from '~/translate/translate-pipe';

@Component({
  selector: 'lab-endfield-guide',
  imports: [RouterLink, AccordionModule, Button, TranslatePipe],
  templateUrl: './guide.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class EndfieldGuide {
  protected readonly preferences = inject(PreferencesStore);
  protected readonly manifest = manifest;
  protected readonly examples = [
    {
      name: 'endfield.guide.exampleTundra',
      params: {
        z: 'eJw1yDEKgDAQBMDfXLEg5C5GbLYJCBaWVunEVrlGRHy9iLEbxpkLTDWJc0HqAhDFWWA9IjCIM8Da2gfU.p6hoa.fIL09ivNGfJnFmT5O4rxgdfeDQTZfmeWk6gNmmh4R',
        v: '11',
      },
    },
    {
      name: 'endfield.guide.exampleCoupons',
      params: {
        o: [
          'tundra_coupon***2',
          'originium_ore*560**3',
          'quartz_sand*240**3',
          'iron_ore*1080**3',
          'power_proc_battery_3*4*3**power_sta_1',
          'power_proc_battery_2**3',
        ],
        omt: '0',
        loc: 'B',
        v: '11',
      },
    },
    {
      name: 'endfield.guide.exampleJinlongLegacy',
      params: {
        z: 'eJxFzLEKAjEQhOG3SfGDupvLHVpsYQ5EC6sTBLvDxkJJoz6.ZI1YzccwTLE8M6iEYjNpLdCFYhdicgitObFpOpOWvSvf0Nja8cjg0NYx1cVE-h32oHW4R4WOWL37O7-IK3.NqGM8fK8XHo-nSbiXq23D21Q.U1UrIA__',
        v: '11',
      },
    },
  ];
  protected readonly topics = [
    'locations',
    'views',
    'power',
    'coupons',
    'limits',
    'objectives',
    'archives',
  ];
}
