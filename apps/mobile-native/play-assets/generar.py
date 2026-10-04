"""Gráficos de la ficha de Google Play de ARTA (mismos tamaños que NEXARA).

  icon-512.png                  ícono 512×512 (del AppIcon de iOS, misma marca que la app)
  feature-graphic-1024x500.png  gráfico destacado 1024×500

Uso:  python apps/mobile-native/play-assets/generar.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
APP_ICON = ROOT / "apps/mobile-native/ios/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png"
LOGO = ROOT / "apps/web/public/brand/arta-logo.png"

BG = (10, 10, 11)
GOLD = (201, 169, 98)
INK = (244, 239, 228)
MUTED = (185, 178, 163)


def font(names, size):
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def icon_512():
    icon = Image.open(APP_ICON).convert("RGBA").resize((512, 512), Image.LANCZOS)
    icon.save(HERE / "icon-512.png", optimize=True)


def feature_graphic():
    w, h = 1024, 500
    img = Image.new("RGB", (w, h), BG)
    draw = ImageDraw.Draw(img)

    # Ícono a la izquierda.
    icon = Image.open(APP_ICON).convert("RGB").resize((300, 300), Image.LANCZOS)
    img.paste(icon, (90, 100))

    # Logo de ARTA (blanco sobre transparente) teñido de dorado.
    x0 = 450
    logo = Image.open(LOGO).convert("RGBA")
    scale = 300 / logo.width
    logo = logo.resize((300, int(logo.height * scale)), Image.LANCZOS)
    tinted = Image.new("RGBA", logo.size, GOLD + (0,))
    tinted.putalpha(logo.getchannel("A"))
    img.paste(tinted, (x0, 120), tinted)
    y = 120 + logo.height + 28

    title = font(["georgiab.ttf", "georgia.ttf", "DejaVuSerif-Bold.ttf"], 40)
    body = font(["segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"], 26)
    draw.text((x0, y), "Producción de eventos", font=title, fill=INK)
    draw.text((x0, y + 58), "Tareas · Chat · Aprobaciones · Anticipos", font=body, fill=MUTED)
    img.save(HERE / "feature-graphic-1024x500.png", optimize=True)


if __name__ == "__main__":
    icon_512()
    feature_graphic()
    print("listo:", HERE / "icon-512.png", HERE / "feature-graphic-1024x500.png")
