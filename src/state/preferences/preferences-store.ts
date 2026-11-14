import { DOCUMENT, effect, inject, Service, signal } from '@angular/core';

import { cloneDefaults, EFFECTIVE_DEFAULTS } from '~/extensions/defaults';
import { Store } from '~/state/store';
import { languageOptions } from '~/translate/language';
import { applyBackgroundLightness, applyHue } from '~/utils/color';
import { log } from '~/utils/log';
import { spread } from '~/utils/object';
import { getStoredValue, storeValue } from '~/utils/stored-signal';

import { StepDetailSection } from '../objectives/step-detail-section';
import { initialPreferencesState, PreferencesState } from './preferences-state';

function object(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/** Validate one current document before loading any of its fields. */
function currentPreferences(value: unknown): Partial<PreferencesState> {
  const fail = (): never => {
    throw new Error('Invalid preferences');
  };
  if (!object(value)) return fail();
  for (const [key, entry] of Object.entries(value)) {
    if (
      key !== 'backgroundLightness' &&
      !Object.hasOwn(initialPreferencesState, key)
    )
      return fail();
    switch (key) {
      case 'language':
        if (!languageOptions.some((option) => option.value === entry)) fail();
        break;
      case 'powerUnit':
        if (![0, 1, 2, 3].includes(entry as number)) fail();
        break;
      case 'theme':
        if (!['system', 'light', 'dark'].includes(entry as string)) fail();
        break;
      case 'glpkAlgorithm':
        if (entry !== 'simplex' && entry !== 'exact') fail();
        break;
      case 'hue':
      case 'chroma':
      case 'backgroundLightness':
        if (typeof entry !== 'number' || !Number.isFinite(entry)) fail();
        break;
      case 'states':
        if (
          !object(entry) ||
          Object.values(entry).some(
            (archives) =>
              !object(archives) ||
              Object.values(archives).some((url) => typeof url !== 'string'),
          )
        )
          fail();
        break;
      case 'columns':
        if (!object(entry)) return fail();
        for (const [column, settings] of Object.entries(entry)) {
          if (
            !Object.hasOwn(initialPreferencesState.columns, column) ||
            !object(settings)
          )
            return fail();
          if (
            Object.keys(settings).some(
              (field) => field !== 'show' && field !== 'precision',
            ) ||
            typeof settings['show'] !== 'boolean' ||
            (settings['precision'] !== null &&
              !(
                typeof settings['precision'] === 'number' &&
                Number.isInteger(settings['precision']) &&
                settings['precision'] >= 0 &&
                settings['precision'] <= 100
              ))
          )
            fail();
        }
        break;
      case 'flowSettings':
        if (!object(entry)) return fail();
        for (const [field, setting] of Object.entries(entry)) {
          const valid =
            field === 'diagram'
              ? [0, 1].includes(setting as number)
              : field === 'linkSize' || field === 'linkText'
                ? [0, 1, 2, 3, 4, 5].includes(setting as number)
                : field === 'sankeyAlign'
                  ? [0, 1, 2, 3].includes(setting as number)
                  : field === 'hideExcluded'
                    ? typeof setting === 'boolean'
                    : field === 'elkAlgorithm' &&
                      ['layered', 'force', 'stress'].includes(
                        setting as string,
                      );
          if (!valid) fail();
        }
        break;
      case 'sections':
        if (
          !object(entry) ||
          Object.entries(entry).some(
            ([section, show]) =>
              !Object.hasOwn(initialPreferencesState.sections, section) ||
              typeof show !== 'boolean',
          )
        )
          fail();
        break;
      default:
        if (typeof entry !== 'boolean') fail();
    }
  }
  return value;
}

@Service()
export class PreferencesStore extends Store<PreferencesState> {
  private readonly document = inject(DOCUMENT);
  private readonly defaults = inject(EFFECTIVE_DEFAULTS);
  readonly restoreError = signal<string | undefined>(undefined);
  private readonly canPersist = signal(true);

  readonly stored = signal(getStoredValue('preferences'));

  readonly bypassLanding = this.select('bypassLanding');
  readonly columns = this.select('columns');
  readonly convertObjectiveValues = this.select('convertObjectiveValues');
  readonly flowSettings = this.select('flowSettings');
  readonly language = this.select('language');
  readonly paused = this.select('paused');
  readonly powerUnit = this.select('powerUnit');
  readonly showTechLabels = this.select('showTechLabels');
  readonly states = this.select('states');
  readonly theme = this.select('theme');
  readonly hue = this.select('hue');
  readonly chroma = this.select('chroma');
  readonly backgroundLightness = this.select('backgroundLightness');
  readonly pinObjectives = this.select('pinObjectives');
  readonly glpkAlgorithm = this.select('glpkAlgorithm');

  constructor() {
    super(cloneDefaults(inject(EFFECTIVE_DEFAULTS)).preferences, [
      'states',
      'flowSettings',
    ]);
    const stored = this.stored();
    if (stored != null) {
      try {
        const restored = currentPreferences(JSON.parse(stored));
        const defaults = cloneDefaults(inject(EFFECTIVE_DEFAULTS)).preferences;
        this.set({
          ...defaults,
          ...restored,
          columns: { ...defaults.columns, ...restored.columns },
          flowSettings: { ...defaults.flowSettings, ...restored.flowSettings },
          sections: { ...defaults.sections, ...restored.sections },
        });
      } catch (ex) {
        console.warn('Failed to restore stored preferences', ex);
        this.restoreError.set('Invalid preferences');
        this.canPersist.set(false);
      }
    }

    effect(() => {
      if (this.canPersist())
        storeValue('preferences', JSON.stringify(this.state()));
    });

    effect(() => {
      const theme = this.theme();
      if (
        theme === 'light' ||
        (theme === 'system' &&
          window.matchMedia('(prefers-color-scheme: light)').matches)
      ) {
        this.document.documentElement.setAttribute('data-theme', 'light');
      } else {
        this.document.documentElement.removeAttribute('data-theme');
      }
    });

    effect(() => {
      const hue = this.hue();
      const chroma = this.chroma();
      applyHue(hue, chroma, 'brand', this.document.documentElement);
      applyHue(hue + 180, chroma, 'complement', this.document.documentElement);
    });

    effect(() => {
      applyBackgroundLightness(
        this.backgroundLightness(),
        this.document.documentElement,
      );
    });

    effect(() => {
      log('set_lang', this.language());
    });
  }

  resetPreferences(preserveStates = true): void {
    const defaults = cloneDefaults(this.defaults).preferences;
    this.set({
      ...defaults,
      ...(preserveStates ? { states: this.states() } : {}),
    });
    this.restoreError.set(undefined);
    this.canPersist.set(true);
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

  setSectionDefault(section: StepDetailSection, value: boolean): void {
    this.update((state) => {
      return spread(state, {
        sections: spread(state.sections, { [section]: value }),
      });
    });
  }
}
