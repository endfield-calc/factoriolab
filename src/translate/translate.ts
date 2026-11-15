import { httpResource } from '@angular/common/http';
import {
  computed,
  inject,
  InjectionToken,
  Injector,
  linkedSignal,
  Service,
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, firstValueFrom } from 'rxjs';

import { PreferencesStore } from '~/state/preferences/preferences-store';

export interface LangData {
  [key: string]: LangData | string;
}
/** Optional bundled fallback, independent of a previously successful request. */
export const TRANSLATION_FALLBACK = new InjectionToken<LangData | undefined>(
  'TRANSLATION_FALLBACK',
  { factory: (): LangData | undefined => undefined },
);
export type TranslateData = Record<string, string | undefined>;
export type TranslateVal = string | number | null | undefined;
export type TranslateParams = Record<string, TranslateVal>;

interface ParseEntry {
  data: LangData;
  key: string;
  path: string;
}

@Service()
export class Translate {
  private readonly injector = inject(Injector);
  private readonly preferences = inject(PreferencesStore);
  private readonly fallback = inject(TRANSLATION_FALLBACK);

  private readonly templateMatcher = /{{\s?([^{}\s]*)\s?}}/g;

  private readonly httpData = httpResource<LangData>(
    () => `i18n/${this.preferences.language()}.json`,
  );

  private readonly safeHttpData = computed(() => {
    if (this.httpData.error()) return this.fallback;
    if (this.fallback != null && this.httpData.isLoading())
      return this.fallback;
    return this.httpData.value() ?? this.fallback;
  });

  readonly data = linkedSignal<LangData | undefined, TranslateData>({
    source: this.safeHttpData,
    computation: (data, previous) => {
      if (data == null && previous) return previous.value;
      return this.parseLangData(data);
    },
  });

  load(): Promise<boolean> {
    return firstValueFrom(
      toObservable(this.httpData.isLoading, { injector: this.injector }).pipe(
        filter((v) => v),
      ),
    );
  }

  get(key: string, params?: TranslateParams): string {
    const result = this.data()[key];
    if (result == null) return key;
    return this.interpolate(result, params);
  }

  private interpolate(value: string, params?: TranslateParams): string {
    if (params == null) return value;

    return value.replace(
      this.templateMatcher,
      (substring: string, b: string) => params[b]?.toString() ?? substring,
    );
  }

  private parseLangData(data: LangData | undefined): TranslateData {
    const result: TranslateData = {};
    if (data == null) return result;

    const entries = Object.keys(data).map(
      (key): ParseEntry => ({ data, key, path: key }),
    );
    while (entries.length) {
      const entry = entries.pop();
      /**
       * This if statement should be impossible to reach and only exists to
       * satisfy TypeScript
       */
      // istanbul ignore if
      if (entry == null) break;
      const data = entry.data[entry.key];
      if (typeof data === 'string') result[entry.path] = data;
      else {
        entries.push(
          ...Object.keys(data).map(
            (key): ParseEntry => ({
              data,
              key,
              path: `${entry.path}.${key}`,
            }),
          ),
        );
      }
    }

    return result;
  }
}
