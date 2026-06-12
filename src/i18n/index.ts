import { jaMessages, zhCnMessages, zhTwMessages } from './locales';
import { enMessages, localeNames, supportedLocales, type Messages, type SupportedLocale } from './messages';

export { localeNames, supportedLocales, type Messages, type SupportedLocale };

export const LANGUAGE_STORAGE_KEY = 'gsdf_language';

export const messagesByLocale: Record<SupportedLocale, Messages> = {
  en: enMessages,
  'zh-TW': zhTwMessages,
  'zh-CN': zhCnMessages,
  ja: jaMessages,
};

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && supportedLocales.includes(value as SupportedLocale);
}

export function resolveSystemLocale(languages: readonly string[] = []): SupportedLocale {
  for (const language of languages) {
    const normalized = language.toLowerCase();
    if (normalized.startsWith('ja')) {
      return 'ja';
    }
    if (normalized === 'zh-tw' || normalized === 'zh-hant' || normalized.includes('hant') || normalized.startsWith('zh-hk') || normalized.startsWith('zh-mo')) {
      return 'zh-TW';
    }
    if (normalized === 'zh-cn' || normalized === 'zh-hans' || normalized.includes('hans') || normalized.startsWith('zh-sg') || normalized.startsWith('zh')) {
      return 'zh-CN';
    }
    if (normalized.startsWith('en')) {
      return 'en';
    }
  }

  return 'en';
}

export function getInitialLocale(): SupportedLocale {
  const savedLocale = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (isSupportedLocale(savedLocale)) {
    return savedLocale;
  }

  const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return resolveSystemLocale(browserLanguages.filter(Boolean));
}
