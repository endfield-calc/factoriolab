import local from '/public/endfield/i18n/en.json';
import english from '/public/i18n/en.json';
import { LangData } from '~/translate/translate';

/** The same source overlays used by the asset generator, available even offline. */
export function mergeTranslation(base: LangData, overlay: LangData): LangData {
  const result = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const original = result[key];
    result[key] =
      typeof value === 'string'
        ? value
        : mergeTranslation(typeof original === 'object' ? original : {}, value);
  }
  return result;
}

export const endfieldTranslationFallback = mergeTranslation(english, local);
