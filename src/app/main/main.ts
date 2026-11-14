import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {
  faDatabase,
  faDiagramProject,
  faList,
} from '@fortawesome/free-solid-svg-icons';

import manifest from '/public/endfield/product.json';
import { TabData } from '~/components/tabs/tab-data';
import { Tabs } from '~/components/tabs/tabs';
import { Release } from '~/data/release';
import { EndfieldGuide } from '~/endfield/ui/guide';
import { EndfieldResources } from '~/endfield/ui/resources';
import { ObjectivesStore } from '~/state/objectives/objectives-store';
import { WorkspaceLifecycle } from '~/state/workspace-lifecycle';
import { TranslatePipe } from '~/translate/translate-pipe';

import { Header } from './header/header';
import { Objectives } from './objectives/objectives';
import { Preferences } from './preferences/preferences';
import { Settings } from './settings/settings';

@Component({
  selector: 'lab-main',
  imports: [
    RouterOutlet,
    EndfieldGuide,
    EndfieldResources,
    Header,
    Objectives,
    Preferences,
    Settings,
    Tabs,
    TranslatePipe,
  ],
  templateUrl: './main.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
})
export class Main {
  private readonly objectivesStore = inject(ObjectivesStore);
  protected readonly release = inject(Release);
  protected readonly lifecycle = inject(WorkspaceLifecycle);
  protected readonly product = manifest;

  protected readonly result = this.objectivesStore.matrixResult;
  protected readonly tabs: TabData[] = [
    { label: 'app.list', value: 'list', routerLink: 'list', faIcon: faList },
    {
      label: 'app.flow',
      value: 'flow',
      routerLink: 'flow',
      faIcon: faDiagramProject,
    },
    {
      label: 'app.data',
      value: 'data',
      routerLink: 'data',
      faIcon: faDatabase,
    },
  ];
}
