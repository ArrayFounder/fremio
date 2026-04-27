#!/usr/bin/env python3
"""
Patch Create.jsx → studio/src/app/(editor)/frames/editor/CreateStudio.jsx
- Fixes all imports for Next.js/studio
- Replaces react-router-dom with next/navigation
- Replaces useAuth with studio AuthContext
- Replaces navigate("/take-moment") with window.close()
- Adds "Simpan ke Library Fremio" button behavior (saves to studio API)
"""
import os, re, shutil

SRC = "/Users/salwa/Documents/fremio copy/my-app/src/pages/Create.jsx"
DST_DIR = "/Users/salwa/Documents/fremio copy/studio/src/app/(editor)/frames/editor"
DST = f"{DST_DIR}/CreateStudio.jsx"

os.makedirs(DST_DIR, exist_ok=True)
shutil.copy(SRC, DST)

with open(DST) as fh:
    c = fh.read()

# ── 1. Add "use client" at top ───────────────────────────────────────────────
c = '"use client";\n' + c

# ── 2. Replace react-router-dom ──────────────────────────────────────────────
c = c.replace(
    'import { useLocation, useNavigate } from "react-router-dom";',
    'import { useRouter as useRouterHook, useSearchParams } from "next/navigation";'
)
c = c.replace(
    "import { useLocation, useNavigate } from 'react-router-dom';",
    "import { useRouter as useRouterHook, useSearchParams } from 'next/navigation';"
)

# ── 3. Fix relative imports → @/ aliases ─────────────────────────────────────
path_map = {
    'from "../components/creator/CanvasPreview.jsx"':   'from "@/components/creator/CanvasPreview"',
    "from '../components/creator/CanvasPreview.jsx'":   "from '@/components/creator/CanvasPreview'",
    'from "../components/creator/PropertiesPanel.jsx"': 'from "@/components/creator/PropertiesPanel"',
    "from '../components/creator/PropertiesPanel.jsx'": "from '@/components/creator/PropertiesPanel'",
    'from "../components/creator/ColorPicker.jsx"':     'from "@/components/creator/ColorPicker"',
    "from '../components/creator/ColorPicker.jsx'":     "from '@/components/creator/ColorPicker'",
    'from "../store/useCreatorStore.js"':               'from "@/store/useCreatorStore"',
    "from '../store/useCreatorStore.js'":               "from '@/store/useCreatorStore'",
    'from "../constants/layers.js"':                    'from "@/constants/layers"',
    "from '../constants/layers.js'":                    "from '@/constants/layers'",
    'from "../components/creator/canvasConstants.js"':  'from "@/components/creator/canvasConstants"',
    "from '../components/creator/canvasConstants.js'":  "from '@/components/creator/canvasConstants'",
    'from "../utils/draftStorage.js"':                  'from "@/utils/draftStorage"',
    "from '../utils/draftStorage.js'":                  "from '@/utils/draftStorage'",
    'from "../services/draftService.js"':               'from "@/services/draftService"',
    "from '../services/draftService.js'":               "from '@/services/draftService'",
    'from "../services/paymentService"':                'from "@/services/paymentService"',
    "from '../services/paymentService'":                "from '@/services/paymentService'",
    'from "../utils/draftHelpers.js"':                  'from "@/utils/draftHelpers"',
    "from '../utils/draftHelpers.js'":                  "from '@/utils/draftHelpers'",
    'from "../utils/safeStorage.js"':                   'from "@/utils/safeStorage"',
    "from '../utils/safeStorage.js'":                   "from '@/utils/safeStorage'",
    'from "../utils/userStorage.js"':                   'from "@/utils/userStorage"',
    "from '../utils/userStorage.js'":                   "from '@/utils/userStorage'",
    'from "../utils/frameProvider.js"':                 'from "@/utils/frameProvider"',
    "from '../utils/frameProvider.js'":                 "from '@/utils/frameProvider'",
    'from "../contexts/AuthContext.jsx"':               'from "@/contexts/AuthContext"',
    "from '../contexts/AuthContext.jsx'":               "from '@/contexts/AuthContext'",
    'from "../utils/frameCacheCleaner.js"':             'from "@/utils/frameCacheCleaner"',
    "from '../utils/frameCacheCleaner.js'":             "from '@/utils/frameCacheCleaner'",
    'from "../config/editorFonts.js"':                  'from "@/config/editorFonts"',
    "from '../config/editorFonts.js'":                  "from '@/config/editorFonts'",
    # dynamic imports inside handleSaveTemplate / handleUseThisFrame
    'await import("../utils/draftHelpers.js")':         'await import("@/utils/draftHelpers")',
    "await import('../utils/draftHelpers.js')":         "await import('@/utils/draftHelpers')",
    'await import("../utils/indexedDBStorage.js")':     'await import("@/utils/indexedDBStorage")',
    "await import('../utils/indexedDBStorage.js')":     "await import('@/utils/indexedDBStorage')",
}
for old, new in path_map.items():
    c = c.replace(old, new)

# ── 4. Replace Create.css import with global import ──────────────────────────
c = c.replace('import "./Create.css";', 'import "@/app/(editor)/frames/editor/Create.css";')
c = c.replace("import './Create.css';", "import '@/app/(editor)/frames/editor/Create.css';")

# ── 5. Replace useLocation / useNavigate usage in component body ─────────────
c = c.replace(
    'const location = useLocation();',
    'const _searchParams = useSearchParams(); // replaces useLocation'
)
c = c.replace(
    "const location = useLocation();",
    "const _searchParams = useSearchParams(); // replaces useLocation"
)
c = c.replace(
    'const navigate = useNavigate();',
    'const _router = useRouterHook();'
)
c = c.replace(
    "const navigate = useNavigate();",
    "const _router = useRouterHook();"
)

# ── 6. Replace navigate() calls ──────────────────────────────────────────────
# navigate("/take-moment") → close tab or redirect to booths
c = c.replace('navigate("/take-moment");', 'window.close();')
c = c.replace("navigate('/take-moment');", "window.close();")

# navigate(location.pathname, { replace: true, state: null }) → no-op
c = c.replace(
    'navigate(location.pathname, { replace: true, state: null });',
    '/* navigate replaced: no-op in studio */'
)
c = c.replace(
    "navigate(location.pathname, { replace: true, state: null });",
    "/* navigate replaced: no-op in studio */"
)

# ── 7. Replace import.meta.env.DEV ───────────────────────────────────────────
c = c.replace('import.meta?.env?.DEV', 'false')
c = c.replace('import.meta.env.DEV', 'false')
c = c.replace('import.meta?.env?.VITE_', 'process.env.NEXT_PUBLIC_')
c = c.replace('import.meta.env.VITE_', 'process.env.NEXT_PUBLIC_')

# ── 8. After "tersimpan" toast, also save to studio frame library ─────────────
# Find the toast success line after savedDraft assignment
old_toast = '      showToast(\n        "success",\n        `${successTitle} tersimpan! Lihat di Profile \u2192 Drafts.`\n      );'
new_toast = '''      showToast(
        "success",
        `${successTitle} tersimpan! Lihat di Profile → Drafts.`
      );

      // ── STUDIO: also save/update frame in library ───────────────────────
      try {
        const photoSlots = (savedDraft.elements || []).filter(el => el.type === 'photo');
        const { width: cw, height: ch } = getCanvasDimensions(savedDraft.aspectRatio || canvasAspectRatio);
        const studioPayload = {
          name: savedDraft.title || draftTitle || 'Untitled Frame',
          category: 'CUSTOM',
          thumbnailUrl: thumbnailDataUrl || '',
          assetUrl: (savedDraft.elements || []).find(el => el.type === 'overlay')?.data?.src || '',
          aspectRatio: savedDraft.aspectRatio || canvasAspectRatio,
          canvasWidth: cw,
          canvasHeight: ch,
          isPremium: false,
          captureMode: 'MULTI',
          maxCaptures: photoSlots.length || 1,
          slots: photoSlots.map(s => ({
            top:    s.y / ch,
            left:   s.x / cw,
            width:  s.width / cw,
            height: s.height / ch,
            photoIndex: s.data?.slotIndex ?? 0,
            borderRadius: s.data?.borderRadius ?? 0,
          })),
          sortOrder: 0,
          studioDraftId: savedDraft.id,
        };
        const existingId = typeof window !== 'undefined' ? window.__studioFrameId : undefined;
        const apiUrl = existingId ? `/api/dashboard/frames/${existingId}` : '/api/dashboard/frames';
        const apiMethod = existingId ? 'PATCH' : 'POST';
        const apiRes = await fetch(apiUrl, {
          method: apiMethod,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(studioPayload),
        });
        const apiJson = await apiRes.json();
        if (apiJson.success && apiJson.data?.id) {
          if (typeof window !== 'undefined') window.__studioFrameId = apiJson.data.id;
          showToast('success', '✅ Frame tersimpan di Library Studio!', 2500);
        }
      } catch (studioErr) {
        console.warn('[Studio] Failed to save to frame library:', studioErr);
      }'''

c = c.replace(old_toast, new_toast)

with open(DST) as fh:
    existing = fh.read()

# Write patched file
with open(DST, 'w') as fh:
    fh.write(c)

print(f"✅ CreateStudio.jsx written to {DST}")
print(f"   Size: {len(c)} bytes")

# ── Copy Create.css to the same directory ────────────────────────────────────
src_css = "/Users/salwa/Documents/fremio copy/my-app/src/pages/Create.css"
dst_css = f"{DST_DIR}/Create.css"
shutil.copy(src_css, dst_css)
print(f"✅ Create.css copied to {dst_css}")
