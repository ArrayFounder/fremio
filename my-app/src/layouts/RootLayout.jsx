import { Outlet, useLocation } from "react-router-dom";
import Header from "../components/Header.jsx";
import Footer from "../components/Footer.jsx";
import { useEffect } from "react";
import {
  HeaderBrandingProvider,
  useHeaderBranding,
} from "../contexts/HeaderBrandingContext.jsx";

function LayoutContent() {
  const { hash, pathname, search } = useLocation();
  const { branding } = useHeaderBranding();
  const isStandaloneSharesEditor = pathname === "/shares" && new URLSearchParams(search).get("editor") === "1";
  const hideHeader = isStandaloneSharesEditor;
  const hideFooter =
    pathname.startsWith("/take-moment") ||
    pathname.startsWith("/edit-photo") ||
    isStandaloneSharesEditor ||
    Boolean(branding?.groupMode);

  useEffect(() => {
    // scroll ke anchor di homepage
    if (hash) {
      const id = hash.replace("#", "");
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      // tiap pindah halaman, mulai dari atas
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [hash, pathname]);

  return (
    <div className="app-shell">
      {!hideHeader && <Header />}
      <main className="app-main">
        <Outlet />
      </main>
      {!hideFooter && <Footer />}
    </div>
  );
}

export default function RootLayout() {
  return (
    <HeaderBrandingProvider>
      <LayoutContent />
    </HeaderBrandingProvider>
  );
}
