"use client";

import {
  DEFAULT_LANGUAGE,
  dictionary,
  interpolate,
  type Language,
} from "@/shared/lib/dictionary";
import { useLanguageStore } from "@/store/useLanguageStore";
import { useHydrated } from "@/hooks/useHydrated";

/**
 * Cách dùng trong component:
 *   const { t, format, language } = useTranslation();
 *   <h1>{t.home.heroTitle}</h1>
 *   <p>{format(t.product.available, { count: 5 })}</p>
 */
export function useTranslation() {
  const stored = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const hydrated = useHydrated();

  // Trước khi hydrate luôn dùng ngôn ngữ mặc định để HTML server và client khớp nhau
  const language: Language = hydrated ? stored : DEFAULT_LANGUAGE;

  return {
    t: dictionary[language],
    language,
    setLanguage,
    format: interpolate,
  };
}
