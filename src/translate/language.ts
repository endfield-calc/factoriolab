import { Option } from '~/option/option';

export type Language =
  | 'en'
  | 'zh'
  | 'de'
  | 'fr'
  | 'ru'
  | 'ja'
  | 'ko'
  | 'pt-BR'
  | 'es';

export const languageOptions: Option<Language>[] = [
  { label: 'English', value: 'en' },
  { label: '简体中文 (Chinese)', value: 'zh' },
  { label: 'Français (French)', value: 'fr' },
  { label: 'Deutsch (German)', value: 'de' },
  { label: '日本語 (Japanese)', value: 'ja' },
  { label: '한국어 (Korean)', value: 'ko' },
  { label: 'Português (Portuguese)', value: 'pt-BR' },
  { label: 'русский (Russian)', value: 'ru' },
  { label: 'Español (Spanish)', value: 'es' },
];

export function initialLanguage(
  production: boolean,
  browserLanguage: string,
): Language {
  if (!production) return 'en';
  const value = browserLanguage.toLowerCase();
  const languages = languageOptions.map((option) => option.value);
  return (
    languages.find((language) => language.toLowerCase() === value) ??
    languages.find(
      (language) =>
        language.toLowerCase().split('-')[0] === value.split('-')[0],
    ) ??
    'en'
  );
}
