"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_LANGUAGE, type Language } from "@/shared/lib/dictionary";

import { isRecord } from "@/shared/lib/storage";

interface LanguageState {
  language: Language;
  setLanguage: (language: Language) => void;
}

/** Lưu ngôn ngữ (vi/en) vào localStorage, mặc định tiếng Việt */
export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: DEFAULT_LANGUAGE,
      setLanguage: (language) => set({ language }),
    }),
    {
      name: "multimart-language",
      partialize: (state) => ({ language: state.language }),
      merge: (persisted, current) => ({
        ...current,
        language: isRecord(persisted) && (persisted.language === "vi" || persisted.language === "en")
          ? persisted.language : DEFAULT_LANGUAGE,
      }),
    },
  ),
);
