import { AsyncPipe } from '@angular/common';
import { Component, inject, NgZone } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { first } from 'rxjs';

import { TranslateService } from '~/services/translate.service';

import { ContentComponent } from './components/content/content.component';
import { versionStr } from './helpers';
import { TranslatePipe } from './pipes/translate.pipe';
import { AnalyticsService } from './services/analytics.service';
import { ContentService } from './services/content.service';
import { DataService } from './services/data.service';
import { ThemeService } from './services/theme.service';
import { SettingsService } from './store/settings.service';

@Component({
  selector: 'lab-root',
  standalone: true,
  imports: [
    AsyncPipe,
    RouterOutlet,
    ButtonModule,
    DialogModule,
    ContentComponent,
    TranslatePipe,
  ],
  templateUrl: './app.component.html',
})
export class AppComponent {
  ngZone = inject(NgZone);
  router = inject(Router);
  analyticsSvc = inject(AnalyticsService);
  contentSvc = inject(ContentService);
  dataSvc = inject(DataService);
  settingsSvc = inject(SettingsService);
  themeSvc = inject(ThemeService);
  translateSvc = inject(TranslateService);
  swUpdate = inject(SwUpdate);

  constructor() {
    this.dataSvc.config$.pipe(first()).subscribe((c) => {
      console.log(versionStr(c.version));
      if (c.version) this.analyticsSvc.event('version', c.version);
    });
    // istanbul ignore next: don't test swUpdate event emit
    this.swUpdate.versionUpdates.subscribe((event) => {
      this.handleSwUpdateEvent(event);
    });
  }

  reset(): void {
    this.dataSvc.error$.next(undefined);
    void this.router.navigate(['/']);
    this.reload();
  }

  // istanbul ignore next: Helper to call browser location function
  reload(): void {
    setTimeout(() => {
      location.reload();
    });
  }

  handleSwUpdateEvent(event: VersionEvent): void {
    switch (event.type) {
      case 'VERSION_DETECTED':
        this.showSwUpdateToast('info', 'detect', 5000);
        break;
      case 'VERSION_READY':
        this.showSwUpdateToast('success', 'ready');
        break;
      case 'VERSION_INSTALLATION_FAILED':
        this.showSwUpdateToast('error', 'installationFail');
        break;
    }
  }

  showSwUpdateToast(
    severity: string,
    langKey: string,
    lifeTime?: number,
  ): void {
    this.translateSvc
      .multi([
        `app.swUpdate.${langKey}Summary`,
        `app.swUpdate.${langKey}Detail`,
      ])
      .pipe(first())
      .subscribe(([summary, detail]) => {
        this.contentSvc.showToast$.next({
          severity: severity,
          summary: summary,
          detail: detail,
          life: lifeTime,
          sticky: !lifeTime,
        });
      });
  }
}
