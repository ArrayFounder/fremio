from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os, math

W, H = 1200, 630

# Salem brand palette
BG      = (248, 240, 237)   # #f8f0ed  - cream
ROSE    = (234, 214, 207)   # #ead6cf
SALMON  = (222, 182, 169)   # #deb6a9
PEACH   = (227, 196, 184)   # #e3c4b8
TEXT    = (90,  55,  45)    # warm dark brown
TEXT2   = (160, 110, 90)    # muted warm brown for tagline

# ── Canvas ────────────────────────────────────────────────────────────────
img = Image.new("RGBA", (W, H), BG + (255,))

# ── Soft blob background (like reference image 2) ─────────────────────────
# Large blurred circles composited onto the background
blobs = [
    # (cx,   cy,   r,    color,  alpha)  — very light, barely-there
    (  -60, -60,  380, SALMON,  38),   # top-left
    ( 1260, -60,  360, ROSE,    34),   # top-right
    (  -60,  690, 340, PEACH,   32),   # bottom-left
    ( 1260,  690, 380, SALMON,  30),   # bottom-right
    (  600,  -90, 280, ROSE,    18),   # top-center, very faint
    (  600,  720, 260, PEACH,   16),   # bottom-center, very faint
]

for (cx, cy, r, col, alpha) in blobs:
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col + (alpha,))
    layer = layer.filter(ImageFilter.GaussianBlur(radius=90))
    img = Image.alpha_composite(img, layer)

draw = ImageDraw.Draw(img)

# ── Fonts ──────────────────────────────────────────────────────────────────
font_candidates = [
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]

def best_font(size):
    for p in font_candidates:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()

font_tagline = best_font(36)
font_dot     = best_font(22)

def cx_text(draw_obj, text, font, y, fill):
    try:
        bb = draw_obj.textbbox((0, 0), text, font=font)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
    except Exception:
        tw, th = len(text) * 18, 36
    draw_obj.text(((W - tw) // 2, y), text, font=font, fill=fill)
    return tw, th

# ── logo-salem.png ─────────────────────────────────────────────────────────
logo_path = "/Users/salwa/Documents/fremio/backend/public/logo-salem.png"
logo_target_w = 720
logo_y = 145

if os.path.exists(logo_path):
    logo = Image.open(logo_path).convert("RGBA")
    logo_h = int(logo.height * logo_target_w / logo.width)
    logo = logo.resize((logo_target_w, logo_h), Image.LANCZOS)
    paste_x = (W - logo_target_w) // 2
    img.paste(logo, (paste_x, logo_y), logo)
    bottom_of_logo = logo_y + logo_h
else:
    bottom_of_logo = 360

# ── Decorative dots row ────────────────────────────────────────────────────
dot_y = bottom_of_logo + 28
dot_r = 4
dot_gap = 16
num_dots = 5
total_dots_w = num_dots * dot_r * 2 + (num_dots - 1) * dot_gap
dot_x0 = (W - total_dots_w) // 2
for i in range(num_dots):
    dx = dot_x0 + i * (dot_r * 2 + dot_gap)
    alpha = 200 if i == 2 else 130   # centre dot brighter
    draw.ellipse([dx, dot_y, dx + dot_r*2, dot_y + dot_r*2], fill=SALMON + (alpha,))

# ── Tagline ────────────────────────────────────────────────────────────────
tagline = "Jadikan setiap momen berarti"
cx_text(draw, tagline, font_tagline, dot_y + dot_r * 2 + 14, TEXT2 + (220,))

# ── Save ───────────────────────────────────────────────────────────────────
final = img.convert("RGB")
out1 = "/Users/salwa/Documents/fremio/backend/public/og-image-v6.png"
out2 = "/Users/salwa/Documents/fremio/my-app/public/og-image-v6.png"
final.save(out1, "PNG")
final.save(out2, "PNG")
print("✅ Saved:", out1)
print("✅ Saved:", out2)
