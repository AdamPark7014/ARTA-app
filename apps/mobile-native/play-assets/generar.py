"""Ícono de ARTA (iOS y Android) y gráficos de la ficha de Google Play.

El ícono es la «a» redondeada del logo de Arta (`apps/web/public/brand/arta-logo-ink.png`) en dorado
degradado sobre negro con un brillo suave. Este script es la fuente: todo lo de abajo se regenera aquí.

  ios/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png   ícono de iOS (cuadrado, sin alfa)
  android/app/src/main/res/drawable-nodpi/ic_launcher_background.png  capa de fondo del ícono adaptable
  android/app/src/main/res/drawable-nodpi/ic_launcher_foreground.png  capa de la «a» (zona segura de 66 dp)
  android/app/src/main/res/drawable-nodpi/ic_launcher_monochrome.png  capa para íconos con tema (Android 13+)
  play-assets/icon-512.png                                            ícono 512×512 de Play
  play-assets/feature-graphic-1024x500.png                            gráfico destacado 1024×500

Uso:  python apps/mobile-native/play-assets/generar.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
MOBILE = HERE.parent
ROOT = HERE.parents[2]
LOGO_INK = ROOT / "apps/web/public/brand/arta-logo-ink.png"
LOGO = ROOT / "apps/web/public/brand/arta-logo.png"
APP_ICON = MOBILE / "ios/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png"
ANDROID_RES = MOBILE / "android/app/src/main/res/drawable-nodpi"

BG = (10, 10, 11)
BG_GLOW = (38, 34, 28)
GOLD = (201, 169, 98)
GOLD_TOP = (222, 190, 120)
GOLD_BOTTOM = (176, 138, 62)
INK = (244, 239, 228)
MUTED = (185, 178, 163)

# Capa del ícono adaptable: 108 dp a xxxhdpi (4×).
ADAPTIVE = 432


def font(names, size):
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def glyph_mask() -> Image.Image:
    """La primera letra del logotipo (la «a»), recortada a su caja, como máscara L."""
    rgba = np.array(Image.open(LOGO_INK).convert("RGBA"))
    ink = (rgba[:, :, 3] > 128) & (rgba[:, :, :3].mean(axis=2) < 128)
    band = ink[: int(ink.shape[0] * 0.75)]  # sin «PRODUCCIONES»
    has = band.any(axis=0)
    x0 = int(np.argmax(has))
    x1 = x0
    while x1 < band.shape[1] and has[x1]:
        x1 += 1
    letter = band[:, x0:x1]
    ys = np.where(letter.any(axis=1))[0]
    letter = letter[ys[0] : ys[-1] + 1]
    return Image.fromarray((letter * 255).astype(np.uint8), "L")


def radial(size, inner, outer, center=(0.5, 0.42), radius=0.75) -> Image.Image:
    yy, xx = np.mgrid[0:size, 0:size]
    d = np.sqrt((xx / size - center[0]) ** 2 + (yy / size - center[1]) ** 2) / radius
    d = np.clip(d, 0, 1)[..., None]
    return Image.fromarray((np.array(inner) * (1 - d) + np.array(outer) * d).astype(np.uint8), "RGB")


def vertical(w, h, top, bottom) -> Image.Image:
    t = np.linspace(0, 1, h)[:, None, None]
    col = (np.array(top) * (1 - t) + np.array(bottom) * t).astype(np.uint8)
    return Image.fromarray(np.repeat(col, w, axis=1), "RGB")


def draw_glyph(canvas: Image.Image, mask: Image.Image, height: float, cy: float, shadow=True):
    """Pinta la «a» dorada centrada; `height` y `cy` son fracciones del lienzo."""
    size = canvas.size[0]
    gh = int(size * height)
    gw = int(mask.width * gh / mask.height)
    m = mask.resize((gw, gh), Image.LANCZOS)
    x = (size - gw) // 2
    y = int(size * cy - gh / 2)
    if shadow:
        sh = Image.new("L", canvas.size, 0)
        sh.paste(m, (x, y + int(size * 0.012)))
        sh = sh.filter(ImageFilter.GaussianBlur(size * 0.02)).point(lambda v: int(v * 0.55))
        canvas.paste(Image.new(canvas.mode, canvas.size, (0, 0, 0) + ((255,) if canvas.mode == "RGBA" else ())), (0, 0), sh)
    gold = vertical(gw, gh, GOLD_TOP, GOLD_BOTTOM)
    canvas.paste(gold, (x, y), m)
    return canvas


def app_icon(mask):
    icon = draw_glyph(radial(1024, BG_GLOW, BG), mask, 0.50, 0.52)
    icon.save(APP_ICON, optimize=True)  # RGB: App Store rechaza íconos con alfa
    icon.resize((512, 512), Image.LANCZOS).save(HERE / "icon-512.png", optimize=True)
    return icon


def android_layers(mask):
    ANDROID_RES.mkdir(parents=True, exist_ok=True)
    radial(ADAPTIVE, BG_GLOW, BG).save(ANDROID_RES / "ic_launcher_background.png", optimize=True)
    # La «a» cabe en el círculo seguro de 66 dp: alto 46 dp de 108.
    fg = Image.new("RGBA", (ADAPTIVE, ADAPTIVE), (0, 0, 0, 0))
    draw_glyph(fg, mask, 46 / 108, 0.52)
    fg.save(ANDROID_RES / "ic_launcher_foreground.png", optimize=True)
    mono = Image.new("RGBA", (ADAPTIVE, ADAPTIVE), (0, 0, 0, 0))
    gh = int(ADAPTIVE * 46 / 108)
    gw = int(mask.width * gh / mask.height)
    m = mask.resize((gw, gh), Image.LANCZOS)
    mono.paste(Image.new("RGBA", (gw, gh), (255, 255, 255, 255)), ((ADAPTIVE - gw) // 2, int(ADAPTIVE * 0.52 - gh / 2)), m)
    mono.save(ANDROID_RES / "ic_launcher_monochrome.png", optimize=True)


def feature_graphic(icon):
    w, h = 1024, 500
    img = Image.new("RGB", (w, h), BG)
    draw = ImageDraw.Draw(img)

    # Ícono a la izquierda con las esquinas redondeadas, como se ve en el teléfono.
    side = 300
    tile = icon.resize((side, side), Image.LANCZOS)
    rounded = Image.new("L", (side, side), 0)
    ImageDraw.Draw(rounded).rounded_rectangle([0, 0, side - 1, side - 1], radius=int(side * 0.225), fill=255)
    img.paste(tile, (90, 100), rounded)

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
    a = glyph_mask()
    ios_icon = app_icon(a)
    android_layers(a)
    feature_graphic(ios_icon)
    print("listo: AppIcon-1024, capas del ícono adaptable, icon-512 y feature graphic")
