import {
  ChangeDetectionStrategy,
  Component,
  inject,
  model,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { faSliders, faUserGear } from '@fortawesome/free-solid-svg-icons';

import { Button } from '~/components/button/button';
import { Tooltip } from '~/components/tooltip/tooltip';
import { SettingsStore } from '~/state/settings/settings-store';
import { TranslatePipe } from '~/translate/translate-pipe';

import { headerLinks } from './links';

@Component({
  selector: 'header[labHeader], header[lab-header]',
  exportAs: 'labHeader',
  imports: [RouterLink, Button, Tooltip, TranslatePipe],
  templateUrl: './header.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'top-0 z-4 flex min-h-19 flex-wrap items-center justify-between border-b border-gray-600 px-1 backdrop-blur-md sm:px-3 md:min-h-16 lg:px-6 xl:flex-nowrap',
  },
})
export class Header {
  protected readonly settingsStore = inject(SettingsStore);

  readonly preferencesOpen = model.required<boolean>();
  readonly settingsOpen = model.required<boolean>();
  readonly settingsXlHidden = model.required<boolean>();

  protected readonly faSliders = faSliders;
  protected readonly faUserGear = faUserGear;
  protected readonly game = this.settingsStore.game;
  protected readonly gameInfo = this.settingsStore.gameInfo;
  protected readonly headerLinks = headerLinks;

  togglePreferences(): void {
    this.preferencesOpen.update((o) => !o);
  }

  toggleSettings(): void {
    this.settingsOpen.update((o) => !o);
  }
}
