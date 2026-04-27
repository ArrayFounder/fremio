// draftService stub — no cloud sync needed in studio
const draftService = {
  saveDraftToCloud: async () => ({ success: true }),
  getDraftsFromCloud: async () => ({ success: true, drafts: [] }),
  deleteDraftFromCloud: async () => ({ success: true }),
  syncLocalDraftsToCloud: async () => ({ success: true }),
};
export default draftService;
