import { effect, inject, Injectable, untracked } from '@angular/core';

import { spread } from '~/helpers';
import { FlowDiagram } from '~/models/enum/flow-diagram';
import { DEFAULT_LANGUAGE, Language } from '~/models/enum/language';
import { LinkValue } from '~/models/enum/link-value';
import { PowerUnit } from '~/models/enum/power-unit';
import { SankeyAlign } from '~/models/enum/sankey-align';
import { Theme } from '~/models/enum/theme';
import {
  ColumnsState,
  initialColumnsState,
} from '~/models/settings/column-settings';
import { FlowSettings } from '~/models/settings/flow-settings';
import { storedSignal, storeValue } from '~/models/stored-signal';
import { Entities } from '~/models/utils';
import { AnalyticsService } from '~/services/analytics.service';
import { TranslateService } from '~/services/translate.service';

import { Store } from './store';

export type SettingsSection = 'saved' | 'recipes' | 'display' | 'other';

export interface PreferencesState {
  states: Record<string, Entities>;
  columns: ColumnsState;
  language: Language;
  powerUnit: PowerUnit;
  theme: Theme;
  showTechLabels: boolean;
  hideDuplicateIcons: boolean;
  rows: number;
  disablePaginator: boolean;
  paused: boolean;
  convertObjectiveValues: boolean;
  flowSettings: FlowSettings;
  settingsSections?: Partial<Record<SettingsSection, boolean>>;
}

export const initialPreferencesState: PreferencesState = {
  states: {},
  columns: initialColumnsState,
  language: DEFAULT_LANGUAGE,
  powerUnit: PowerUnit.kW,
  theme: Theme.Light,
  showTechLabels: false,
  hideDuplicateIcons: true,
  rows: 50,
  disablePaginator: false,
  paused: false,
  convertObjectiveValues: false,
  settingsSections: { saved: true, recipes: true },
  flowSettings: {
    diagram: FlowDiagram.BoxLine,
    linkSize: LinkValue.Items,
    linkText: LinkValue.Items,
    sankeyAlign: SankeyAlign.Justify,
    hideExcluded: false,
    localizePublicSupplies: true,
    publicSupplyItemIds: ['liquid_water'],
  },
};
@Injectable({
  providedIn: 'root',
})
export class PreferencesService extends Store<PreferencesState> {
  analyticsSvc = inject(AnalyticsService);
  translateSvc = inject(TranslateService);

  stored = storedSignal('preferences');

  columns = this.select('columns');
  convertObjectiveValues = this.select('convertObjectiveValues');
  flowSettings = this.select('flowSettings');
  language = this.select('language');
  paused = this.select('paused');
  powerUnit = this.select('powerUnit');
  showTechLabels = this.select('showTechLabels');
  states = this.select('states');
  theme = this.select('theme');

  constructor() {
    super(initialPreferencesState, [
      'states',
      'flowSettings',
      'settingsSections',
    ]);
    const stored = this.stored();
    if (stored) {
      try {
        const storedState = JSON.parse(stored) as Partial<PreferencesState> & {
          bypassLanding?: boolean;
        };
        delete storedState.bypassLanding;
        const sections = storedState.settingsSections as
          | Partial<
              Record<
                | SettingsSection
                | 'common'
                | 'more'
                | 'calculation'
                | 'interface',
                boolean
              >
            >
          | undefined;
        if (sections) {
          const {
            common,
            more,
            calculation,
            interface: interfaceSection,
            ...current
          } = sections;
          if (current.recipes == null && common != null)
            current.recipes = common;
          if (
            current.other == null &&
            [more, calculation].some((value) => value != null)
          ) {
            current.other = [more, calculation].some((value) => value === true);
          }
          if ([more, interfaceSection].some((value) => value != null)) {
            current.display = [current.display, more, interfaceSection].some(
              (value) => value === true,
            );
          }
          storedState.settingsSections = current;
        }
        this.load(storedState);
      } catch (ex) {
        console.warn('Failed to parse stored preferences', ex);
      }
    }

    effect(() => {
      storeValue('preferences', JSON.stringify(this.state()));
    });

    effect(() => {
      const lang = this.language();
      untracked(() => {
        this.translateSvc.use(lang);
      });
      this.analyticsSvc.event('set_lang', lang);
    });
  }

  saveState(modId: string, id: string, value: string): void {
    this.update((state) => {
      const gameStates = spread(state.states[modId], { [id]: value });
      const states = spread(state.states, { [modId]: gameStates });
      return { states };
    });
  }

  removeState(modId: string, id: string): void {
    this.update((state) => {
      const gameStates = this._removeEntry(state.states[modId], id);
      const states = spread(state.states, { [modId]: gameStates });
      return { states };
    });
  }
}
