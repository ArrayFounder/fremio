import { createContext, useCallback, useContext, useMemo, useState } from "react";

const HeaderBrandingContext = createContext(null);

export function HeaderBrandingProvider({ children }) {
  const [branding, setBranding] = useState(null);

  // useCallback keeps clearBranding stable across renders so effects
  // that list it as a dependency don't re-run on every branding change.
  const clearBranding = useCallback(() => setBranding(null), []);

  const api = useMemo(() => {
    return {
      branding,
      setBranding,
      clearBranding,
    };
  }, [branding, clearBranding]);

  return (
    <HeaderBrandingContext.Provider value={api}>
      {children}
    </HeaderBrandingContext.Provider>
  );
}

export function useHeaderBranding() {
  const value = useContext(HeaderBrandingContext);
  if (!value) {
    return {
      branding: null,
      setBranding: () => {},
      clearBranding: () => {},
    };
  }
  return value;
}
