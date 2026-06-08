from PIL import Image, ImageDraw
import random, os
random.seed(7)
os.makedirs("textures", exist_ok=True)
S=512
img=Image.new("RGB",(S,S),(58,92,44))
d=ImageDraw.Draw(img)
# mottled base
for _ in range(9000):
    x=random.randint(0,S); y=random.randint(0,S); r=random.randint(2,9)
    g=random.randint(60,120); shade=(random.randint(28,70), g, random.randint(28,60))
    d.ellipse([x-r,y-r,x+r,y+r], fill=shade)
# blades (draw wrapped so it tiles)
for _ in range(14000):
    x=random.randint(0,S); y=random.randint(0,S)
    ln=random.randint(4,12); ang=random.uniform(-0.5,0.5)
    dx=int(ln*ang); dy=-ln
    g=random.randint(70,150); col=(random.randint(30,70), g, random.randint(25,55))
    for ox in (0,S,-S):
        for oy in (0,S,-S):
            d.line([x+ox,y+oy,x+dx+ox,y+dy+oy], fill=col, width=1)
# subtle dry tufts (small, blended)
for _ in range(900):
    x=random.randint(0,S); y=random.randint(0,S)
    ln=random.randint(3,8); dx=random.randint(-2,2)
    d.line([x,y,x+dx,y-ln], fill=(110,104,58), width=1)
img.save("textures/grass.jpg", quality=85)
print("wrote textures/grass.jpg")
