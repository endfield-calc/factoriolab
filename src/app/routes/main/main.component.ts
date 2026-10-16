import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { CardModule } from 'primeng/card';
import { MessagesModule } from 'primeng/messages';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TabMenuModule } from 'primeng/tabmenu';
import { filter, map } from 'rxjs';

import { HeaderComponent } from '~/components/header/header.component';
import { ObjectivesComponent } from '~/components/objectives/objectives.component';
import { ResourceInputComponent } from '~/components/resource-input/resource-input.component';
import { SettingsComponent } from '~/components/settings/settings.component';
import { UserTipsComponent } from '~/components/user-tips/user-tips.component';
import { SimplexResultType } from '~/models/enum/simplex-result-type';
import { TranslatePipe } from '~/pipes/translate.pipe';
import { ContentService } from '~/services/content.service';
import { TranslateService } from '~/services/translate.service';
import { ObjectivesService } from '~/store/objectives.service';
import { SettingsService } from '~/store/settings.service';

@Component({
  selector: 'lab-main',
  standalone: true,
  imports: [
    AsyncPipe,
    RouterOutlet,
    CardModule,
    ProgressSpinnerModule,
    TabMenuModule,
    MessagesModule,
    HeaderComponent,
    ObjectivesComponent,
    SettingsComponent,
    UserTipsComponent,
    ResourceInputComponent,
    TranslatePipe,
  ],
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainComponent {
  router = inject(Router);
  contentSvc = inject(ContentService);
  objectivesSvc = inject(ObjectivesService);
  settingsSvc = inject(SettingsService);
  translateSvc = inject(TranslateService);

  mod = this.settingsSvc.mod;
  result = this.objectivesSvc.matrixResult;
  isCustomRecipeEditor = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => this.isCustomRecipeUrl(event.urlAfterRedirects)),
    ),
    { initialValue: this.isCustomRecipeUrl(this.router.url) },
  );

  tabItems$ = this.translateSvc
    .multi(['app.list', 'app.flow', 'app.data'])
    .pipe(
      map(([list, flow, data]): MenuItem[] => [
        {
          label: list,
          icon: 'fa-solid fa-list',
          routerLink: 'list',
          queryParamsHandling: 'preserve',
        },
        {
          label: flow,
          icon: 'fa-solid fa-diagram-project',
          routerLink: 'flow',
          queryParamsHandling: 'preserve',
        },
        {
          label: data,
          icon: 'fa-solid fa-database',
          routerLink: 'data',
          queryParamsHandling: 'preserve',
        },
      ]),
    );

  SimplexResultType = SimplexResultType;

  private isCustomRecipeUrl(url: string): boolean {
    return url.split('?')[0].endsWith('/custom-recipes');
  }
}
