/**
 * useSEO - Hook untuk mengatur meta tags dan title per halaman
 * Membantu SEO agar setiap halaman tampil tepat di hasil pencarian Google
 */
import { useEffect } from "react";

export function useSEO({ title, description, keywords, canonical, ogImage }) {
  useEffect(() => {
    // Set document title
    if (title) {
      document.title = title;
    }

    // Helper to set/create meta tag
    const setMeta = (selector, content) => {
      if (!content) return;
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement("meta");
        const attr = selector.startsWith('[name')
          ? "name"
          : selector.startsWith('[property')
          ? "property"
          : "name";
        const val = selector.match(/["']([^"']+)["']/)?.[1];
        if (attr && val) el.setAttribute(attr, val);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    setMeta('[name="description"]', description);
    setMeta('[name="keywords"]', keywords);
    setMeta('[property="og:title"]', title);
    setMeta('[property="og:description"]', description);
    if (ogImage) setMeta('[property="og:image"]', ogImage);
    if (canonical) {
      let link = document.querySelector('link[rel="canonical"]');
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "canonical");
        document.head.appendChild(link);
      }
      link.setAttribute("href", canonical);
    }

    // Cleanup: restore default title when navigating away (optional)
    return () => {
      document.title = "Fremio - Photo Booth Online & Photobox Virtual Indonesia";
    };
  }, [title, description, keywords, canonical, ogImage]);
}

export default useSEO;
