#!/usr/bin/env python3
"""
Patch creator files for studio compatibility:
- Fix asset imports (PNG) in CanvasPreview.jsx
- Fix relative path imports (../../config -> @/config, etc.)
- Replace import.meta.env.DEV with false
"""
import os, re

DST = "/Users/salwa/Documents/fremio copy/studio/src"

# ─── CanvasPreview.jsx ────────────────────────────────────────────────────────
f = f"{DST}/components/creator/CanvasPreview.jsx"
with open(f) as fh:
    c = fh.read()

# Replace PNG imports with public path string constants
png_replacements = [
    ('import trashIcon from "../../assets/create-icon/create-trash.png";',    'const trashIcon = "/create-icon/create-trash.png";'),
    ('import duplicateIcon from "../../assets/create-icon/create-duplicate.png";', 'const duplicateIcon = "/create-icon/create-duplicate.png";'),
    ('import lockIcon from "../../assets/create-icon/create-lock.png";',       'const lockIcon = "/create-icon/create-lock.png";'),
    ('import unlockIcon from "../../assets/create-icon/create-unlock.png";',   'const unlockIcon = "/create-icon/create-unlock.png";'),
    ('import rotateIcon from "../../assets/create-icon/rotate.png";',          'const rotateIcon = "/create-icon/rotate.png";'),
]
for old, new in png_replacements:
    c = c.replace(old, new)

# Fix relative config/constants imports
c = c.replace('from "../../constants/layers.js"',           'from "@/constants/layers"')
c = c.replace("from '../../constants/layers.js'",           "from '@/constants/layers'")
c = c.replace('from "../../config/editorFonts.js"',         'from "@/config/editorFonts"')
c = c.replace("from '../../config/editorFonts.js'",         "from '@/config/editorFonts'")
c = c.replace('from "../../config/stickerCatalog.js"',      'from "@/config/stickerCatalog"')
c = c.replace("from '../../config/stickerCatalog.js'",      "from '@/config/stickerCatalog'")
c = c.replace('from "./canvasConstants.js"',                'from "./canvasConstants"')
c = c.replace("from './canvasConstants.js'",                "from './canvasConstants'")
c = c.replace('from "../../components/creator/canvasConstants.js"', 'from "@/components/creator/canvasConstants"')
c = c.replace("from '../../components/creator/canvasConstants.js'", "from '@/components/creator/canvasConstants'")

with open(f, 'w') as fh:
    fh.write(c)
print("✅ CanvasPreview.jsx patched")

# ─── PropertiesPanel.jsx ──────────────────────────────────────────────────────
f = f"{DST}/components/creator/PropertiesPanel.jsx"
with open(f) as fh:
    c = fh.read()

c = c.replace('from "../../config/editorFonts.js"',    'from "@/config/editorFonts"')
c = c.replace("from '../../config/editorFonts.js'",    "from '@/config/editorFonts'")
c = c.replace('from "../../config/stickerCatalog.js"', 'from "@/config/stickerCatalog"')
c = c.replace("from '../../config/stickerCatalog.js'", "from '@/config/stickerCatalog'")
c = c.replace('from "./ColorPicker.jsx"',              'from "./ColorPicker"')
c = c.replace("from './ColorPicker.jsx'",              "from './ColorPicker'")
# Remove .css import - handled via globals
c = c.replace('import "./PropertiesPanel.css";', '// import "./PropertiesPanel.css";')
c = c.replace("import './PropertiesPanel.css';", "// import './PropertiesPanel.css';")

with open(f, 'w') as fh:
    fh.write(c)
print("✅ PropertiesPanel.jsx patched")

# ─── ColorPicker.jsx ──────────────────────────────────────────────────────────
f = f"{DST}/components/creator/ColorPicker.jsx"
with open(f) as fh:
    c = fh.read()
c = c.replace('import "./ColorPicker.css";', '// import "./ColorPicker.css";')
c = c.replace("import './ColorPicker.css';", "// import './ColorPicker.css';")
with open(f, 'w') as fh:
    fh.write(c)
print("✅ ColorPicker.jsx patched")

# ─── useCreatorStore.js ───────────────────────────────────────────────────────
f = f"{DST}/store/useCreatorStore.js"
with open(f) as fh:
    c = fh.read()
c = c.replace('from "../components/creator/canvasConstants.js"', 'from "@/components/creator/canvasConstants"')
c = c.replace("from '../components/creator/canvasConstants.js'", "from '@/components/creator/canvasConstants'")
c = c.replace('from "../constants/layers.js"', 'from "@/constants/layers"')
c = c.replace("from '../constants/layers.js'", "from '@/constants/layers'")
# Replace import.meta.env.DEV
c = c.replace('import.meta?.env?.DEV', 'false')
c = c.replace('import.meta.env.DEV', 'false')
with open(f, 'w') as fh:
    fh.write(c)
print("✅ useCreatorStore.js patched")

print("\nAll files patched successfully!")
