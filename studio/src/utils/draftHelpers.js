// draftHelpers stub
export const computeDraftSignature = (draft) => {
  if (!draft) return "";
  try { return JSON.stringify(draft).length.toString(); } catch { return ""; }
};

export const sanitizeFrameConfigForStorage = (cfg) => cfg;
