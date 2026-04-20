// Draft Service - untuk cloud storage drafts

const getApiUrl = () => {
  // IMPORTANT: never default to production from localhost.
  // Prefer explicit VITE_API_URL; otherwise use same-origin /api (Vite should proxy this in dev).
  return import.meta.env.VITE_API_URL || '/api';
};

class DraftService {
  async getToken() {
    // Try JWT token first
    const jwtToken = localStorage.getItem('fremio_token') || localStorage.getItem('auth_token') || localStorage.getItem('token');
    if (jwtToken) {
      console.log('🔑 [DraftService] Using JWT token');
      return jwtToken;
    }

    // Fallback: Try to get Firebase ID token
    try {
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth();
      const currentUser = auth.currentUser;
      
      if (currentUser) {
        const firebaseToken = await currentUser.getIdToken();
        console.log('🔑 [DraftService] Using Firebase ID token');
        return firebaseToken;
      }
    } catch (error) {
      console.warn('⚠️ Could not get Firebase token:', error.message);
    }

    console.warn('⚠️ [DraftService] No token available');
    return null;
  }

  async getHeaders() {
    const token = await this.getToken();
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  }

  // Save draft to cloud (with auth fallback to public share)
  async saveDraftToCloud(draftData) {
    try {
      const API_URL = getApiUrl();
      
      // Parse frameData to check elements
      let parsedFrameData = null;
      try {
        parsedFrameData = JSON.parse(draftData.frameData);
      } catch (e) {
        console.warn('⚠️ Could not parse frameData for logging');
      }
      
      console.log('☁️ [DraftService] Saving draft to cloud:', {
        title: draftData.title,
        hasDraftId: !!draftData.draftId,
        frameDataSize: draftData.frameData?.length,
        parsedElements: parsedFrameData?.elements?.length,
        elementTypes: parsedFrameData?.elements?.map(el => el.type),
        hasBackground: parsedFrameData?.elements?.some(el => el.type === 'background-photo'),
        hasOverlay: parsedFrameData?.elements?.some(el => el.type === 'upload'),
      });

      // Try authenticated endpoint first
      const headers = await this.getHeaders();
      let response = await fetch(`${API_URL}/drafts`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(draftData)
      });

      // If auth fails, use public share endpoint
      if (response.status === 401 || response.status === 403) {
        console.log('🔄 [DraftService] Auth failed, using public share endpoint...');
        response = await fetch(`${API_URL}/drafts/public-share`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draftData)
        });
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save draft');
      }

      const result = await response.json();
      console.log('✅ [DraftService] Draft saved to cloud:', result.draft?.share_id);
      return result;
    } catch (error) {
      console.error('❌ [DraftService] Error saving draft:', error);
      throw error;
    }
  }

  // Get user's drafts from cloud
  async getCloudDrafts() {
    try {
      const API_URL = getApiUrl();
      const headers = await this.getHeaders();
      const response = await fetch(`${API_URL}/drafts`, {
        headers: headers
      });

      if (!response.ok) {
        throw new Error('Failed to fetch drafts');
      }

      const data = await response.json();
      return data.drafts || [];
    } catch (error) {
      console.error('❌ [DraftService] Error fetching cloud drafts:', error);
      return [];
    }
  }

  // Get draft by ID (for owner)
  async getDraftById(id) {
    try {
      const API_URL = getApiUrl();
      const headers = await this.getHeaders();
      const response = await fetch(`${API_URL}/drafts/by-id/${id}`, {
        headers: headers
      });

      if (!response.ok) {
        throw new Error('Draft not found');
      }

      const data = await response.json();
      return data.draft;
    } catch (error) {
      console.error('❌ [DraftService] Error fetching draft:', error);
      throw error;
    }
  }

  // Get shared draft by share ID (public - no auth)
  async getSharedDraft(shareId) {
    try {
      const API_URL = getApiUrl();
      console.log('🔗 [DraftService] Fetching shared draft:', shareId);
      
      const response = await fetch(`${API_URL}/drafts/share/${shareId}`);

      if (!response.ok) {
        throw new Error('Frame not found');
      }

      const data = await response.json();
      console.log('✅ [DraftService] Shared draft loaded:', data.draft?.title);
      return data.draft;
    } catch (error) {
      console.error('❌ [DraftService] Error fetching shared draft:', error);
      throw error;
    }
  }

  // Update draft visibility (public/private)
  async updateVisibility(id, isPublic) {
    try {
      const API_URL = getApiUrl();
      const headers = await this.getHeaders();
      const response = await fetch(`${API_URL}/drafts/${id}/visibility`, {
        method: 'PATCH',
        headers: headers,
        body: JSON.stringify({ isPublic })
      });

      if (!response.ok) {
        throw new Error('Failed to update visibility');
      }

      const data = await response.json();
      console.log('✅ [DraftService] Visibility updated:', isPublic ? 'public' : 'private');
      return data.draft;
    } catch (error) {
      console.error('❌ [DraftService] Error updating visibility:', error);
      throw error;
    }
  }

  // Delete draft from cloud
  async deleteDraftFromCloud(id) {
    try {
      const API_URL = getApiUrl();
      const headers = await this.getHeaders();
      const response = await fetch(`${API_URL}/drafts/${id}`, {
        method: 'DELETE',
        headers: headers
      });

      if (!response.ok) {
        throw new Error('Failed to delete draft');
      }

      return await response.json();
    } catch (error) {
      console.error('❌ [DraftService] Error deleting draft:', error);
      throw error;
    }
  }

  // Generate share URL
  getShareUrl(shareId) {
    const baseUrl = window.location.origin;
    return `${baseUrl}/s/${shareId}`;
  }
}

export const draftService = new DraftService();
export default draftService;
