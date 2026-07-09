from PIL import Image, ImageDraw

def make_icon(size, path):
    img = Image.new("RGB", (size, size), (15, 27, 36))  # deep navy bg
    d = ImageDraw.Draw(img)
    gold = (201, 162, 39)
    teal = (47, 111, 99)
    # outer ring
    m = size*0.06
    d.ellipse([m, m, size-m, size-m], outline=gold, width=max(2,int(size*0.02)))
    # fortress gate shape (arch) centered
    w = size*0.5
    h = size*0.55
    x0 = (size-w)/2
    y0 = size*0.62
    # gate body rectangle
    d.rectangle([x0, y0-h*0.5, x0+w, y0+h*0.42], fill=gold)
    # arch top
    d.pieslice([x0, y0-h*0.5-w/2, x0+w, y0-h*0.5+w/2], 180, 360, fill=gold)
    # doorway cut (dark)
    dw = w*0.34
    dh = h*0.62
    dx0 = x0 + (w-dw)/2
    dy0 = y0 + h*0.42 - dh
    d.rectangle([dx0, dy0, dx0+dw, y0+h*0.42], fill=(15,27,36))
    d.pieslice([dx0, dy0-dw/2, dx0+dw, dy0+dw/2], 180, 360, fill=(15,27,36))
    # crenellations on top of wall (5 merlons, representing 5 fortresses)
    merlon_w = w/9
    top_y = y0-h*0.5-w/2
    for i in range(5):
        mx = x0 + (i*2+0.5)*merlon_w
        d.rectangle([mx, top_y-size*0.06, mx+merlon_w, top_y+size*0.01], fill=teal)
    img.save(path)

make_icon(512, "icons/icon-512.png")
make_icon(192, "icons/icon-192.png")
make_icon(180, "icons/apple-touch-icon.png")
print("done")
