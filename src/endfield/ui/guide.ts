import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import manifest from '/public/endfield/product.json';
import { AccordionModule } from '~/components/accordion/accordion-module';
import { Button } from '~/components/button/button';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { SettingsStore } from '~/state/settings/settings-store';
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
  private readonly settings = inject(SettingsStore);
  protected readonly activities = computed(() => {
    const windows = this.settings.endfieldData()?.activities;
    if (!windows) return [];
    const schedule = this.settings.activitySchedule();
    const modes = this.settings.activityModes();
    const language = this.preferences.language();
    const format = new Intl.DateTimeFormat(language, {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
    return Object.entries(windows)
      .sort(([, a], [, b]) => b.openTime - a.openTime)
      .map(([id, event]) => ({
        id,
        name:
          language === 'zh' || language === 'ja' || language === 'ru'
            ? event.name[language]
            : event.name.en,
        status: typeof schedule[id] === 'number' ? 'open' : schedule[id],
        mode: modes[id] ?? 'auto',
        stages: event.stageStarts.map((start, index) => ({
          number: index + 1,
          start,
          date: format.format(start),
        })),
        open: format.format(event.openTime),
        close: format.format(event.closeTime),
      }));
  });

  protected setActivityMode(id: string, value: string): void {
    const mode =
      value === 'auto' || value === 'disabled' ? value : Number(value);
    this.settings.setActivityMode(id, mode);
  }

  protected readonly manifest = manifest;
  protected readonly examples = [
    {
      name: 'endfield.guide.exampleTundra',
      params: {
        z: 'eJw1yDEKgDAQBMDfXLEg5C5GbLYJCBaWVunEVrlGRHy9iLEbxpkLTDWJc0HqAhDFWWA9IjCIM8Da2gfU.p6hoa.fIL09ivNGfJnFmT5O4rxgdfeDQTZfmeWk2gNmmx4S',
        v: '12',
      },
    },
    {
      name: 'endfield.guide.exampleCoupons',
      params: {
        z: 'eJzLt3WK0tLSMlLLt03UMjUz0NIyVsu3NdAyMoEyQ7QMDSygbF0tEy1jLS0PtXxbS7BIbomtgVpOfrKtk1qZraERALOeEks_',
        v: '12',
      },
    },
    {
      name: 'endfield.guide.exampleJinlong',
      params: {
        z: 'eJxFzLEKwjAUheG3yfCDmpumQYc7NIWig5OC4FZcHJQs1eeXXCNO5-MfTtE8k8S7ojNx66FzRa-EaPC0cmbXdCGue1O-I6HV8UgySGucak3E32EPUtMe8XSE6unv.CJs7DUjhvHwvV7ZPBf17lFuOri3SvgASZsrBQ__',
        v: '12',
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
