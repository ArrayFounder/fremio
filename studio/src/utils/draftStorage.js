// draftStorage stub — stores drafts in localStorage for studio
import safeStorage from "./safeStorage.js";

const KEY = "studio-creator-drafts";

const getAll = () => safeStorage.getJSON(KEY, []);
const saveAll = (drafts) => safeStorage.setJSON(KEY, drafts);

const draftStorage = {
  async saveDraft(draft) {
    const id = draft.id || `draft-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const withId = { ...draft, id };
    const drafts = getAll();
    const idx = drafts.findIndex((d) => d.id === id);
    const ts = Date.now();
    if (idx >= 0) { drafts[idx] = { ...drafts[idx], ...withId, updatedAt: ts }; }
    else { drafts.push({ ...withId, createdAt: ts, updatedAt: ts }); }
    saveAll(drafts);
    return { ...withId };
  },
  async getDraftById(id) {
    if (!id) return null;
    const drafts = getAll();
    return drafts.find((d) => d.id === id) || null;
  },
  async getAllDrafts() { return getAll(); },
  async deleteDraft(id) {
    saveAll(getAll().filter((d) => d.id !== id));
    return true;
  },
  async clearAll() { saveAll([]); return true; },
};

export default draftStorage;
