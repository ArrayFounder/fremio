import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import id from "./locales/id.json";
import en from "./locales/en.json";

// 1. Check manual override (via console: localStorage.setItem('fremio_lang','en'))
// 2. Fall back to browser/OS language
const savedLang = (() => { try { return localStorage.getItem("fremio_lang"); } catch { return null; } })();
const browserLang = navigator.language || "";
const lang = savedLang
  ? savedLang
  : browserLang.toLowerCase().startsWith("id") ? "id" : "en";

i18n
  .use(initReactI18next)
  .init({
    resources: {
      id: { translation: id },
      en: { translation: en },
    },
    lng: lang,
    fallbackLng: "id",
    interpolation: {
      escapeValue: false,
    },
  });

document.documentElement.lang = lang;

export default i18n;
