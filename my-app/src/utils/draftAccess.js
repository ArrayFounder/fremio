export const FREE_DRAFT_LIMIT = 5;

const getDraftTimestamp = (draft) =>
  new Date(draft?.updatedAt || draft?.createdAt || 0).getTime();

export const splitDraftsByMembershipAccess = (
  drafts = [],
  hasAccess = false,
  freeDraftLimit = FREE_DRAFT_LIMIT
) => {
  const sortedDrafts = [...(Array.isArray(drafts) ? drafts : [])].sort(
    (a, b) => getDraftTimestamp(b) - getDraftTimestamp(a)
  );

  if (hasAccess) {
    return {
      accessibleDrafts: sortedDrafts,
      lockedDrafts: [],
      lockedDraftsCount: 0,
    };
  }

  const safeLimit = Math.max(0, Number(freeDraftLimit) || 0);
  const accessibleDrafts = sortedDrafts.slice(0, safeLimit);
  const lockedDrafts = sortedDrafts.slice(safeLimit);

  return {
    accessibleDrafts,
    lockedDrafts,
    lockedDraftsCount: lockedDrafts.length,
  };
};