from PIL import Image, ImageDraw, ImageFont
import os, math

os.makedirs("icons", exist_ok=True)

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i]-a[i])*t) for i in range(3))

def make(size, maskable=False):
    img = Image.new("RGBA", (size, size), (0,0,0,0))
    d = ImageDraw.Draw(img)
    # diagonal gradient background
    top = (26, 17, 64)     # deep purple
    bot = (5, 6, 10)       # near black
    for y in range(size):
        d.line([(0,y),(size,y)], fill=lerp(top, bot, y/size))
    # rounded square mask (no rounding for maskable so the platform crops)
    if not maskable:
        r = int(size*0.22)
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0,0,size-1,size-1], radius=r, fill=255)
        img.putalpha(mask)
        d = ImageDraw.Draw(img)
    # gold coin
    pad = size*0.30 if maskable else size*0.20
    cx, cy = size/2, size/2
    cr = (size/2 - pad)
    # outer ring
    d.ellipse([cx-cr, cy-cr, cx+cr, cy+cr], fill=(255, 211, 77, 255), outline=(255,160,40,255), width=max(2,int(size*0.02)))
    ir = cr*0.78
    d.ellipse([cx-ir, cy-ir, cx+ir, cy+ir], outline=(180,120,20,255), width=max(2,int(size*0.012)))
    # "TC" text
    try:
        font = ImageFont.truetype("arialbd.ttf", int(cr*1.05))
    except Exception:
        try:
            font = ImageFont.truetype("DejaVuSans-Bold.ttf", int(cr*1.05))
        except Exception:
            font = ImageFont.load_default()
    text = "TC"
    bbox = d.textbbox((0,0), text, font=font)
    tw, th = bbox[2]-bbox[0], bbox[3]-bbox[1]
    d.text((cx - tw/2 - bbox[0], cy - th/2 - bbox[1]), text, font=font, fill=(60, 28, 8, 255))
    return img

for s in (192, 512):
    make(s).save(f"icons/icon-{s}.png")
make(512, maskable=True).save("icons/icon-512-maskable.png")
make(180).save("icons/apple-touch-icon.png")
make(32).save("icons/favicon-32.png")
print("icons written:", os.listdir("icons"))
