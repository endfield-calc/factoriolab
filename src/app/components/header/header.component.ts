import {
  ChangeDetectionStrategy,
  Component,
  effect,
  HostBinding,
  inject,
  Input,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SplitButtonModule } from 'primeng/splitbutton';
import { TooltipModule } from 'primeng/tooltip';

import { APP } from '~/models/constants';
import { ObjectiveType } from '~/models/enum/objective-type';
import { isRecipeObjective } from '~/models/objective';
import { IconSmClassPipe } from '~/pipes/icon-class.pipe';
import { TranslatePipe } from '~/pipes/translate.pipe';
import { ContentService } from '~/services/content.service';
import { TranslateService } from '~/services/translate.service';
import { ObjectivesService } from '~/store/objectives.service';
import { PreferencesService } from '~/store/preferences.service';
import { SettingsService } from '~/store/settings.service';

interface MenuLink {
  label: string;
  icon: string;
  href: string;
}

@Component({
  selector: 'lab-header',
  standalone: true,
  imports: [
    RouterLink,
    ButtonModule,
    SplitButtonModule,
    TooltipModule,
    IconSmClassPipe,
    TranslatePipe,
  ],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  title = inject(Title);
  contentSvc = inject(ContentService);
  objectivesSvc = inject(ObjectivesService);
  preferencesSvc = inject(PreferencesService);
  settingsSvc = inject(SettingsService);
  translateSvc = inject(TranslateService);

  @HostBinding('class.sticky') @Input() sticky = false;
  @HostBinding('class.settings-xl-hidden') @Input() settingsXlHidden = false;

  gameInfo = this.settingsSvc.gameInfo;

  appName = toSignal(this.translateSvc.get('app.name'));

  links: MenuLink[] = [
    {
      label: 'header.source',
      icon: 'fa-brands fa-github',
      href: 'https://github.com/endfield-calc/factoriolab/',
    },
    {
      label: 'header.yituliu',
      icon: 'fa-solid fa-home',
      href: 'https://ef.yituliu.cn/',
    },
    // {
    //   label: 'header.discord',
    //   icon: 'fa-brands fa-discord',
    //   href: 'https://discord.gg/N4FKV687x2',
    // },
    // {
    //   label: 'header.support',
    //   icon: 'fa-solid fa-mug-hot',
    //   href: 'https://ko-fi.com/dcbroad3',
    // },
  ];

  constructor() {
    effect(() => {
      const objectives = this.objectivesSvc.baseObjectives();
      const data = this.settingsSvc.dataset();

      const name = objectives
        .map((o) => {
          if (o.type >= ObjectiveType.HideSep) return null;
          return isRecipeObjective(o)
            ? data.recipeEntities[o.targetId]?.name
            : data.itemEntities[o.targetId]?.name;
        })
        .find((n) => !!n);
      const appNameVal = this.appName() ?? APP;
      this.title.setTitle(name ? `${name} | ${appNameVal}` : appNameVal);
    });
  }

  cancelRouterLink(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }
}
