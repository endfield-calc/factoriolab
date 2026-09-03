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

import { environment } from '../../environments';
import { Store } from './store';

export interface PreferencesState {
  states: Record<string, Entities>;
  columns: ColumnsState;
  language: Language;
  powerUnit: PowerUnit;
  theme: Theme;
  bypassLanding: boolean;
  showTechLabels: boolean;
  hideDuplicateIcons: boolean;
  rows: number;
  disablePaginator: boolean;
  paused: boolean;
  convertObjectiveValues: boolean;
  flowSettings: FlowSettings;
}

export const initialPreferencesState: PreferencesState = {
  states: {},
  columns: initialColumnsState,
  language: DEFAULT_LANGUAGE,
  powerUnit: PowerUnit.kW,
  theme: Theme.Light,
  bypassLanding: false,
  showTechLabels: false,
  hideDuplicateIcons: true,
  rows: 50,
  disablePaginator: false,
  paused: false,
  convertObjectiveValues: false,
  flowSettings: {
    diagram: FlowDiagram.BoxLine,
    linkSize: LinkValue.Items,
    linkText: LinkValue.Items,
    sankeyAlign: SankeyAlign.Justify,
    hideExcluded: false,
  },
};
// istanbul ignore if: Don't test auto change default language
if (environment.production) {
  const supportedLangs = Object.values(Language) as string[];
  function isSupportedLanguage(value: string): value is Language {
    return supportedLangs.includes(value);
  }
  const userLang = navigator.language.toLowerCase();
  const langPrefix = userLang.split('-')[0];
  if (isSupportedLanguage(userLang)) {
    // 1. 精确匹配（如 'en' 或 'zh'）
    initialPreferencesState.language = userLang;
  } else if (isSupportedLanguage(langPrefix)) {
    // 2. 前缀匹配（如 'zh-CN' 匹配 'zh'）
    initialPreferencesState.language = langPrefix;
  }
  // 都不匹配时保持默认English
}

@Injectable({
  providedIn: 'root',
})
export class PreferencesService extends Store<PreferencesState> {
  analyticsSvc = inject(AnalyticsService);
  translateSvc = inject(TranslateService);

  stored = storedSignal('preferences');

  bypassLanding = this.select('bypassLanding');
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
    super(initialPreferencesState, ['states', 'flowSettings']);
    const stored = this.stored();
    if (stored) {
      try {
        const storedState = JSON.parse(stored) as PreferencesState;
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
