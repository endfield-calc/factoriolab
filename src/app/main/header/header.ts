import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  model,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import {
  faChevronDown,
  faSliders,
  faUserGear,
} from '@fortawesome/free-solid-svg-icons';

import { Button } from '~/components/button/button';
import { Select } from '~/components/select/select';
import { Tooltip } from '~/components/tooltip/tooltip';
import { Game } from '~/data/game';
import { gameInfo } from '~/data/game-info';
import { PRODUCT_PROFILE } from '~/extensions/product-profile';
import { SettingsStore } from '~/state/settings/settings-store';
import { TranslatePipe } from '~/translate/translate-pipe';

import { headerLinks } from './links';

@Component({
  selector: 'header[labHeader], header[lab-header]',
  exportAs: 'labHeader',
  imports: [
    RouterLink,
    FaIconComponent,
    Button,
    Select,
    Tooltip,
    TranslatePipe,
  ],
  templateUrl: './header.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'top-0 z-4 flex min-h-19 flex-wrap items-center justify-between border-b border-gray-600 px-1 backdrop-blur-md sm:px-3 md:min-h-16 lg:px-6 xl:flex-nowrap',
  },
})
export class Header {
  private readonly router = inject(Router);
  protected readonly settingsStore = inject(SettingsStore);
  protected readonly product = inject(PRODUCT_PROFILE);

  readonly preferencesOpen = model.required<boolean>();
  readonly settingsOpen = model.required<boolean>();
  readonly settingsXlHidden = model.required<boolean>();

  protected readonly faChevronDown = faChevronDown;
  protected readonly faSliders = faSliders;
  protected readonly faUserGear = faUserGear;
  protected readonly game = this.settingsStore.game;
  protected readonly gameInfo = this.settingsStore.gameInfo;
  protected readonly headerLinks = headerLinks
    .map((link) =>
      link.text === 'header.source'
        ? { ...link, href: this.product.sourceUrl }
        : link,
    )
    .filter(
      (link) =>
        this.product.allowEditor ||
        !['header.editor', 'header.discord', 'header.sponsor'].includes(
          link.text,
        ),
    );

  protected readonly gameOptions = computed(() =>
    this.settingsStore.gameOptions.filter(
      (o) => o.value !== this.settingsStore.game(),
    ),
  );

  togglePreferences(): void {
    this.preferencesOpen.update((o) => !o);
  }

  toggleSettings(): void {
    this.settingsOpen.update((o) => !o);
  }

  setGame(game: Game): void {
    void this.router.navigate([gameInfo[game].modId]);
  }
}
