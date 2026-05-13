// ============================================
// UNIFIED FRAME SERVICE
// Switches between Firebase and VPS based on config
// ============================================

import { isVPSMode, VPS_API_URL, getUploadsBaseUrl } from '../config/backend';

// Import Firebase service (will be used in Firebase mode)
let firebaseFrameService = null;

// Lazy load Firebase frame service only when needed
const getFirebaseService = async () => {
  if (!firebaseFrameService) {
    const module = await import('./customFrameService');
    firebaseFrameService = module.default || module;
  }
  return firebaseFrameService;
};

// VPS Frame Client
class VPSFrameClient {
  constructor() {
    this.baseUrl = VPS_API_URL;
  }

  toPublicUrl(pathOrUrl) {
    if (!pathOrUrl || typeof pathOrUrl !== 'string') return pathOrUrl;

    // data: URLs are fine as-is
    if (pathOrUrl.startsWith('data:')) return pathOrUrl;

    // Fix mixed-content: upgrade http -> https for known hosts.
    // Also handle the raw VPS IP by proxying through the frontend domain.
    if (pathOrUrl.startsWith('http://')) {
      // Proxy raw VPS IP (no TLS cert) via Cloudflare route.
      if (pathOrUrl.includes('72.61.210.203')) {
        const match = pathOrUrl.match(/72\.61\.210\.203(\/.*)/);
        if (match) return `https://fremio.id/proxy${match[1]}`;
      }
      return pathOrUrl.replace('http://', 'https://');
    }

    if (pathOrUrl.startsWith('https://')) {
      // Replace api.fremio.id with fremio.id for uploads to use nginx proxy
      if (pathOrUrl.includes('api.fremio.id/uploads/')) {
        return pathOrUrl.replace('https://api.fremio.id/', 'https://fremio.id/');
      }
      return pathOrUrl;
    }

    if (pathOrUrl.startsWith('/uploads/')) {
      return `${getUploadsBaseUrl()}${pathOrUrl}`;
    }
    return pathOrUrl;
  }

  normalizeFrameMedia(frame) {
    if (!frame || typeof frame !== 'object') return frame;
    const layout = frame.layout && typeof frame.layout === 'object' ? frame.layout : null;
    if (!layout || !Array.isArray(layout.elements)) return frame;

    const elements = layout.elements.map((el) => {
      if (!el || typeof el !== 'object') return el;
      const data = el.data && typeof el.data === 'object' ? el.data : null;
      if (!data) return el;
      return {
        ...el,
        data: {
          ...data,
          image: this.toPublicUrl(data.image),
          originalImage: this.toPublicUrl(data.originalImage),
        },
      };
    });

    return {
      ...frame,
      layout: {
        ...layout,
        elements,
      },
    };
  }

  getToken() {
    // Try both possible token keys
    const token = localStorage.getItem('fremio_token') || localStorage.getItem('auth_token');
    if (!token) {
      console.warn('🔑 No token found in localStorage. Keys available:', Object.keys(localStorage));
    }
    return token;
  }

  async request(endpoint, options = {}) {
    const token = this.getToken();
    
    if (!token && options.method && options.method !== 'GET') {
      console.error('⚠️ No auth token found for authenticated request:', endpoint);
      console.error('   Please login first at /admin/login');
      throw new Error('No token provided');
    }
    
    const headers = {
      ...(options.headers || {}),
      ...(token && { 'Authorization': `Bearer ${token}` })
    };

    // Don't set Content-Type for FormData
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers
      });

      // Handle network errors
      if (!response) {
        throw new Error('Network error: No response from server');
      }

      // Try to parse JSON response
      let data;
      try {
        data = await response.json();
      } catch (e) {
        // If response is not JSON, create a simple error object
        data = { error: `Server returned status ${response.status}` };
      }

      if (!response.ok) {
        console.error(`❌ Request failed (${response.status}):`, data);
        
        // Handle specific error codes
        if (response.status === 401) {
          // Token expired or invalid - could trigger re-login
          console.warn('🔒 Authentication failed - token may be expired');
        } else if (response.status === 403) {
          console.warn('🚫 Access denied - insufficient permissions');
        } else if (response.status === 404) {
          console.warn('🔍 Resource not found');
        } else if (response.status >= 500) {
          console.error('💥 Server error - please try again later');
        }
        
        throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (error) {
      // Handle network/fetch errors
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        console.error('🌐 Network error: Unable to connect to server');
        throw new Error('Tidak dapat terhubung ke server. Periksa koneksi internet Anda.');
      }
      throw error;
    }
  }

  // Get all frames
  async getAllFrames(options = {}) {
    try {
      const normalizeFrames = (frames) => {
        return (frames || []).map((frame) => {
          // Use imageUrl from backend if available, otherwise construct from image_path or imagePath
          const imagePath = frame.image_path || frame.imagePath;
          let imageUrl = frame.imageUrl;

          if (!imageUrl && imagePath) {
            imageUrl = imagePath.startsWith('http')
              ? imagePath
              : `${getUploadsBaseUrl()}${imagePath}`;
          }

          return {
            ...frame,
            imageUrl,
            // IMPORTANT: Many UI surfaces still use `imagePath` directly.
            // Ensure it is a public URL in VPS mode so assets don't 404 on the frontend origin.
            imagePath: imageUrl || imagePath,
            rawImagePath: imagePath,
            thumbnailUrl: imageUrl,
          };
        });
      };

      // Cache-bust list requests to avoid stale results (e.g., CDN/browser caching)
      const ts = String(Date.now());
      const includeHidden = !!options?.includeHidden;
      const source = typeof options?.source === 'string' ? options.source.trim().toLowerCase() : '';
      const category = typeof options?.category === 'string' ? options.category.trim() : '';

      // If backend supports pagination, fetch all pages so admin isn't capped at default page sizes.
      // Keep a conservative hard limit to avoid infinite loops if the backend reports bad pagination.
      const pageSize = Number.isFinite(options?.limit) ? options.limit : 500;
      const maxPages = 50;
      const maxItems = 10000;

      const allFrames = [];
      const seenIds = new Set();
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages && page <= maxPages && allFrames.length < maxItems) {
        const params = new URLSearchParams();
        params.set('ts', ts);
        params.set('page', String(page));
        params.set('limit', String(pageSize));
        if (includeHidden) params.set('includeHidden', 'true');
        if (source) params.set('source', source);
        if (category) params.set('category', category);

        const data = await this.request(`/frames?${params.toString()}`);

        // Handle both array and {frames, pagination} response
        const pageFramesRaw = Array.isArray(data) ? data : (data.frames || []);
        const pageFrames = normalizeFrames(pageFramesRaw).map((f) => this.normalizeFrameMedia(f));

        for (const frame of pageFrames) {
          const frameId = frame?.id != null ? String(frame.id) : null;
          if (frameId && seenIds.has(frameId)) continue;
          if (frameId) seenIds.add(frameId);
          allFrames.push(frame);
        }

        const pagination = (!Array.isArray(data) && data && data.pagination) ? data.pagination : null;
        const reportedTotalPages = pagination?.totalPages;
        totalPages = Number.isFinite(reportedTotalPages) && reportedTotalPages > 0 ? reportedTotalPages : 1;

        // If backend doesn't paginate (or returns everything), stop after first request.
        if (totalPages <= 1) break;
        page += 1;

        // If backend returns empty page, stop.
        if (!pageFramesRaw || pageFramesRaw.length === 0) break;
      }

      return allFrames;
    } catch (error) {
      console.error('Error getting frames:', error);
      if (options?.throwOnError) throw error;
      return [];
    }
  }

  // Get frame by ID
  async getFrameById(id) {
    try {
      const data = await this.request(`/frames/${id}`);
      const frame = data.frame || data;
      const rawImagePath = frame.image_path || frame.imagePath || frame.frameImage || null;
      const imageUrl = this.toPublicUrl(
        frame.imageUrl
        || frame.thumbnailUrl
        || rawImagePath
      );
      const normalized = {
        ...frame,
        imageUrl,
        imagePath: imageUrl || rawImagePath,
        rawImagePath,
        thumbnailUrl: this.toPublicUrl(frame.thumbnailUrl || imageUrl || rawImagePath),
      };
      return this.normalizeFrameMedia(normalized);
    } catch (error) {
      console.error('Error getting frame:', error);
      return null;
    }
  }

  // Get frame config for EditPhoto
  async getFrameConfig(id) {
    try {
      const data = await this.request(`/frames/${id}/config`);
      return data;
    } catch (error) {
      console.error('Error getting frame config:', error);
      return null;
    }
  }

  // Create frame (admin only)
  async createFrame(frameData, imageFile = null) {
    console.log('📤 [createFrame] ENTRY - frameData keys:', Object.keys(frameData));
    console.log('📤 [createFrame] ENTRY - frameData.layout exists:', !!frameData.layout);
    console.log('📤 [createFrame] ENTRY - frameData.layout type:', typeof frameData.layout);
    
    if (frameData.layout) {
      console.log('📤 [createFrame] ENTRY - layout keys:', Object.keys(frameData.layout));
      console.log('📤 [createFrame] ENTRY - layout.elements count:', frameData.layout.elements?.length || 0);
      
      // Log setiap element dengan detail
      if (Array.isArray(frameData.layout.elements)) {
        frameData.layout.elements.forEach((el, i) => {
          console.log(`  [${i}] type=${el.type}, id=${el.id}, hasImage=${!!el.data?.image}`);
          if (el.data?.image) {
            console.log(`      imageURL=${el.data.image.substring(0, 80)}...`);
          }
        });
      }
    }
    
    // Upload image first if provided
    if (imageFile) {
      try {
        const uploadResult = await this.uploadFrameImage(imageFile);
        if (uploadResult.imagePath) {
          frameData.imagePath = uploadResult.imagePath;
          frameData.image_path = uploadResult.imagePath;
        }
      } catch (err) {
        console.error('Error uploading frame image:', err);
      }
    }
    
    console.log('📤 [createFrame] AFTER UPLOAD - frameData.layout exists:', !!frameData.layout);
    
    // Ensure layout is properly included
    const bodyToSend = {
      ...frameData,
      layout: frameData.layout || { elements: [] }
    };
    
    console.log('📤 [createFrame] bodyToSend.layout:', bodyToSend.layout);
    console.log('📤 [createFrame] bodyToSend.layout.elements count:', bodyToSend.layout?.elements?.length);
    
    return await this.request('/frames', {
      method: 'POST',
      body: JSON.stringify(bodyToSend)
    });
  }

  // Update frame (admin only)
  async updateFrame(id, frameData, imageFile = null) {
    // Upload new image if provided
    if (imageFile) {
      try {
        const uploadResult = await this.uploadFrameImage(imageFile);
        if (uploadResult.imagePath) {
          frameData.imagePath = uploadResult.imagePath;
          frameData.image_path = uploadResult.imagePath;
        }
      } catch (err) {
        console.error('Error uploading frame image:', err);
      }
    }
    
    console.log('📤 [vpsClient.updateFrame] frameData.layout exists:', !!frameData.layout);
    console.log('📤 [vpsClient.updateFrame] frameData.layout.elements count:', frameData.layout?.elements?.length || 0);
    
    // Log setiap element dengan detail
    if (frameData.layout && Array.isArray(frameData.layout.elements)) {
      frameData.layout.elements.forEach((el, i) => {
        console.log(`  [${i}] type=${el.type}, id=${el.id}, hasImage=${!!el.data?.image}`);
        if (el.data?.image) {
          console.log(`      imageURL=${el.data.image.substring(0, 80)}...`);
        }
      });
    }
    
    return await this.request(`/frames/${id}`, {
      method: 'PUT',
      body: JSON.stringify(frameData)
    });
  }

  // Delete frame (admin only)
  async deleteFrame(id) {
    return await this.request(`/frames/${id}`, {
      method: 'DELETE'
    });
  }

  // Upload frame image (admin only)
  async uploadFrameImage(file, fileName = null) {
    const formData = new FormData();
    // Ensure file has proper name and type for multer validation
    const resolvedName = fileName || file.name || `frame_${Date.now()}.webp`;
    const fileType = file.type || 'image/webp';
    const blob = new Blob([file], { type: fileType });
    formData.append('image', blob, resolvedName);
    return await this.request('/upload/frame', {
      method: 'POST',
      body: formData
    });
  }

  // Save frame with image (admin only)
  async saveFrame(frameData, imageFile) {
    // Upload image first if provided
    if (imageFile) {
      const uploadResult = await this.uploadFrameImage(imageFile);
      frameData.imagePath = uploadResult.imagePath;
      frameData.image_path = uploadResult.imagePath;
    }

    console.log('📤 [saveFrame] frameData.layout exists:', !!frameData.layout);
    console.log('📤 [saveFrame] frameData.layout.elements:', frameData.layout?.elements?.length);

    const generatedId = frameData.id || `frame_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const resolvedMaxCaptures =
      frameData.maxCaptures || frameData.max_captures || frameData.slots?.length || 1;

    // Create frame - preserve studio booth metadata (source/is_template) and other optional flags.
    const payload = {
      ...frameData,
      id: generatedId,
      name: frameData.name,
      description: frameData.description || '',
      category: frameData.category || 'custom',
      categories: frameData.categories,
      image_path: frameData.imagePath || frameData.image_path,
      imagePath: frameData.imagePath || frameData.image_path,
      slots: frameData.slots || [],
      max_captures: resolvedMaxCaptures,
      maxCaptures: resolvedMaxCaptures,
      layout: frameData.layout || { elements: [] },
      canvasBackground: frameData.canvasBackground,
      canvasWidth: frameData.canvasWidth,
      canvasHeight: frameData.canvasHeight,
      createdBy: frameData.createdBy,
      duplicatePhotos: frameData.duplicatePhotos,
      source: frameData.source,
      is_template: frameData.is_template,
      is_hidden: frameData.is_hidden,
      is_premium: frameData.is_premium,
      isPremium: frameData.isPremium,
      tags: frameData.tags,
    };

    const result = await this.createFrame(payload);
    const resolvedFrame = result?.frame || null;
    const resolvedFrameId = resolvedFrame?.id || result?.id || generatedId;

    return {
      ...result,
      success: result?.success !== false,
      frame: resolvedFrame,
      frameId: resolvedFrameId,
    };
  }

  // Increment download/use count
  async incrementStats(id, stat = 'download') {
    try {
      await this.request(`/frames/${id}/${stat}`, { method: 'POST' });
    } catch (error) {
      console.error('Error incrementing stats:', error);
    }
  }

  // Upload overlay image (admin only)
  async uploadOverlayImage(file, fileName = null) {
    const formData = new FormData();
    const resolvedName = fileName || file.name || `overlay_${Date.now()}.png`;
    const resolvedType = file.type || 'image/png';
    const blob = new Blob([file], { type: resolvedType });
    formData.append('image', blob, resolvedName);
    return await this.request('/upload/overlay', {
      method: 'POST',
      body: formData,
    });
  }
}

// Create VPS client instance
const vpsClient = new VPSFrameClient();

// Unified frame service
const unifiedFrameService = {
  // Get all frames
  async getAllFrames(options = {}) {
    if (isVPSMode()) {
      return await vpsClient.getAllFrames(options);
    }
    const firebaseSvc = await getFirebaseService();
    return await firebaseSvc.getAllCustomFrames();
  },

  async uploadOverlayImage(file, fileName = null) {
    // Overlay uploads are only supported in VPS mode today.
    // (Firebase mode can be added later if needed.)
    return await vpsClient.uploadOverlayImage(file, fileName);
  },

  async uploadFrameImage(file, fileName = null) {
    return await vpsClient.uploadFrameImage(file, fileName);
  },

  // Alias for getAllFrames (compatibility)
  async getAllCustomFrames() {
    return await this.getAllFrames();
  },

  // Get frame by ID
  async getFrameById(id) {
    if (isVPSMode()) {
      return await vpsClient.getFrameById(id);
    }
    const firebaseSvc = await getFirebaseService();
    return await firebaseSvc.getCustomFrameById(id);
  },

  // Alias (compatibility)
  async getCustomFrameById(id) {
    return await this.getFrameById(id);
  },

  // Get frame config for EditPhoto
  async getFrameConfig(id) {
    if (isVPSMode()) {
      return await vpsClient.getFrameConfig(id);
    }
    const firebaseSvc = await getFirebaseService();
    return await firebaseSvc.getCustomFrameConfig(id);
  },

  // Alias (compatibility)
  async getCustomFrameConfig(id) {
    return await this.getFrameConfig(id);
  },

  // Save frame (admin)
  async saveFrame(frameData, imageFile = null) {
    if (isVPSMode()) {
      return await vpsClient.saveFrame(frameData, imageFile);
    }
    const firebaseSvc = await getFirebaseService();
    return await firebaseSvc.saveCustomFrame(frameData, imageFile);
  },

  // Alias (compatibility)
  async saveCustomFrame(frameData, imageFile = null) {
    return await this.saveFrame(frameData, imageFile);
  },

  // Create frame (admin) - alias for saveFrame
  async createFrame(frameData, imageFile = null) {
    return await this.saveFrame(frameData, imageFile);
  },

  // Update frame (admin)
  async updateFrame(id, updates, imageFile = null) {
    console.log('📤 [unified.updateFrame] updates.layout exists:', !!updates.layout);
    console.log('📤 [unified.updateFrame] updates.layout.elements:', updates.layout?.elements?.length);
    
    if (isVPSMode()) {
      if (imageFile) {
        const uploadResult = await vpsClient.uploadFrameImage(imageFile);
        updates.image_path = uploadResult.imagePath;
        updates.imagePath = uploadResult.imagePath;
      }
      return await vpsClient.updateFrame(id, updates);
    }
    const firebaseSvc = await getFirebaseService();
    return await firebaseSvc.updateCustomFrame(id, updates, imageFile);
  },

  // Alias (compatibility)
  async updateCustomFrame(id, updates, imageFile = null) {
    return await this.updateFrame(id, updates, imageFile);
  },

  // Delete frame (admin)
  async deleteFrame(id) {
    if (isVPSMode()) {
      return await vpsClient.deleteFrame(id);
    }
    const firebaseSvc = await getFirebaseService();
    return await firebaseSvc.deleteCustomFrame(id);
  },

  // Alias (compatibility)
  async deleteCustomFrame(id) {
    return await this.deleteFrame(id);
  },

  // Increment stats
  async incrementStats(id, stat = 'uses') {
    if (isVPSMode()) {
      return await vpsClient.incrementStats(id, stat === 'uses' ? 'download' : stat);
    }
    const firebaseSvc = await getFirebaseService();
    return await firebaseSvc.incrementFrameStats?.(id, stat);
  },

  // Alias (compatibility)
  async incrementFrameStats(id, stat = 'uses') {
    return await this.incrementStats(id, stat);
  },

  // Update display order for multiple frames
  async updateFramesOrder(frameOrders) {
    // frameOrders is an array of { id, displayOrder }
    if (isVPSMode()) {
      // Update each frame's displayOrder
      const results = await Promise.all(
        frameOrders.map(({ id, displayOrder }) => 
          vpsClient.updateFrame(id, { displayOrder })
        )
      );
      return { success: true, results };
    }
    // Firebase mode
    const firebaseSvc = await getFirebaseService();
    const results = await Promise.all(
      frameOrders.map(({ id, displayOrder }) => 
        firebaseSvc.updateCustomFrame(id, { displayOrder })
      )
    );
    return { success: true, results };
  },

  // Clear all frames (admin)
  async clearAllFrames() {
    if (isVPSMode()) {
      // VPS: Get all frames and delete each
      const frames = await vpsClient.getAllFrames();
      for (const frame of frames) {
        await vpsClient.deleteFrame(frame.id);
      }
      return { success: true };
    }
    const firebaseSvc = await getFirebaseService();
    return await firebaseSvc.clearAllCustomFrames?.();
  },

  // Get storage info
  getStorageInfo() {
    if (isVPSMode()) {
      return {
        totalMB: 'VPS',
        framesMB: 'VPS',
        availableMB: 'Unlimited',
        isNearLimit: false,
        isFull: false,
        isVPS: true
      };
    }
    return {
      totalMB: 'Cloud',
      framesMB: 'Cloud',
      availableMB: 'Unlimited',
      isNearLimit: false,
      isFull: false,
      isFirebase: true
    };
  },

  // Check mode
  isVPSMode() {
    return isVPSMode();
  }
};

export default unifiedFrameService;
export { VPSFrameClient };
