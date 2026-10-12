"""Ícono de ARTA (iOS y Android) y gráficos de la ficha de Google Play.

El ícono es la «a» redondeada del logo de Arta (`apps/web/public/brand/arta-logo-ink.png`) en tinta negra
sobre papel claro (opción «A · Papel», elegida por Adam el 11-10-2026 con el sistema visual de
`docs/diseno/SISTEMA-VISUAL.md`). Este script es la fuente: todo lo de abajo se regenera aquí.

  ios/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png   ícono de iOS (cuadrado, sin alfa)
  android/app/src/main/res/drawable-nodpi/ic_launcher_background.png  capa de fondo del ícono adaptable
  android/app/src/main/res/drawable-nodpi/ic_launcher_foreground.png  capa de la «a» (zona segura de 66 dp)
  android/app/src/main/res/drawable-nodpi/ic_launcher_monochrome.png  capa para íconos con tema (Android 13+)
  play-assets/icon-512.png                                            ícono 512×512 de Play
  play-assets/feature-graphic-1024x500.png                            gráfico destacado 1024×500
  web/public/icons/{apple-touch-icon,icon-192,icon-512,icon-maskable-512}.png   panel instalado (PWA)
  web/public/icons/badge-96.png                                       insignia blanca de los avisos web

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
WEB_ICONS = ROOT / "apps/web/public/icons"

PAPER_TOP = (255, 255, 255)
PAPER_BOTTOM = (238, 236, 231)
PAPER = (247, 246, 243)
INK = (12, 12, 13)
SECONDARY = (85, 85, 92)
LINE = (224, 222, 216)
NUNITO = MOBILE / "android/app/src/main/res/font/nunito.ttf"

# Capa del ícono adaptable: 108 dp a xxxhdpi (4×).
ADAPTIVE = 432


def nunito(size, weight=b"Regular"):
    f = ImageFont.truetype(str(NUNITO), size)
    f.set_variation_by_name(weight)
    return f


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


def vertical(w, h, top, bottom) -> Image.Image:
    t = np.linspace(0, 1, h)[:, None, None]
    col = (np.array(top) * (1 - t) + np.array(bottom) * t).astype(np.uint8)
    return Image.fromarray(np.repeat(col, w, axis=1), "RGB")


def paper(size) -> Image.Image:
    return vertical(size, size, PAPER_TOP, PAPER_BOTTOM)


def draw_glyph(canvas: Image.Image, mask: Image.Image, height: float, cy: float, shadow=True):
    """Pinta la «a» en tinta centrada; `height` y `cy` son fracciones del lienzo."""
    size = canvas.size[0]
    gh = int(size * height)
    gw = int(mask.width * gh / mask.height)
    m = mask.resize((gw, gh), Image.LANCZOS)
    x = (size - gw) // 2
    y = int(size * cy - gh / 2)
    if shadow:
        sh = Image.new("L", canvas.size, 0)
        sh.paste(m, (x, y + int(size * 0.012)))
        sh = sh.filter(ImageFilter.GaussianBlur(size * 0.022)).point(lambda v: int(v * 0.10))
        canvas.paste(Image.new(canvas.mode, canvas.size, INK + ((255,) if canvas.mode == "RGBA" else ())), (0, 0), sh)
    canvas.paste(Image.new(canvas.mode, (gw, gh), INK + ((255,) if canvas.mode == "RGBA" else ())), (x, y), m)
    return canvas


def app_icon(mask):
    icon = draw_glyph(paper(1024), mask, 0.46, 0.52)
    icon.save(APP_ICON, optimize=True)  # RGB: App Store rechaza íconos con alfa
    icon.resize((512, 512), Image.LANCZOS).save(HERE / "icon-512.png", optimize=True)
    return icon


def android_layers(mask):
    ANDROID_RES.mkdir(parents=True, exist_ok=True)
    paper(ADAPTIVE).save(ANDROID_RES / "ic_launcher_background.png", optimize=True)
    # La «a» cabe holgada en el círculo seguro de 66 dp: alto 40 dp de 108.
    fg = Image.new("RGBA", (ADAPTIVE, ADAPTIVE), (0, 0, 0, 0))
    draw_glyph(fg, mask, 40 / 108, 0.52)
    fg.save(ANDROID_RES / "ic_launcher_foreground.png", optimize=True)
    mono = Image.new("RGBA", (ADAPTIVE, ADAPTIVE), (0, 0, 0, 0))
    gh = int(ADAPTIVE * 40 / 108)
    gw = int(mask.width * gh / mask.height)
    m = mask.resize((gw, gh), Image.LANCZOS)
    mono.paste(Image.new("RGBA", (gw, gh), (255, 255, 255, 255)), ((ADAPTIVE - gw) // 2, int(ADAPTIVE * 0.52 - gh / 2)), m)
    mono.save(ANDROID_RES / "ic_launcher_monochrome.png", optimize=True)


def feature_graphic(icon):
    w, h = 1024, 500
    img = vertical(w, h, (251, 250, 248), (241, 239, 234))
    draw = ImageDraw.Draw(img)

    # Ícono a la izquierda con las esquinas redondeadas, como se ve en el teléfono, con sombra suave.
    side = 280
    x0, y0 = 104, (h - side) // 2
    tile = icon.resize((side, side), Image.LANCZOS)
    rounded = Image.new("L", (side, side), 0)
    ImageDraw.Draw(rounded).rounded_rectangle([0, 0, side - 1, side - 1], radius=int(side * 0.225), fill=255)
    sh = Image.new("L", (w, h), 0)
    sh.paste(rounded, (x0, y0 + 10))
    sh = sh.filter(ImageFilter.GaussianBlur(22)).point(lambda v: int(v * 0.16))
    img.paste(Image.new("RGB", (w, h), INK), (0, 0), sh)
    img.paste(tile, (x0, y0), rounded)
    border = Image.new("L", (side, side), 0)
    ImageDraw.Draw(border).rounded_rectangle([0, 0, side - 1, side - 1], radius=int(side * 0.225), outline=255, width=2)
    img.paste(Image.new("RGB", (side, side), LINE), (x0, y0), border)

    # Logo de ARTA en tinta y textos en Nunito.
    tx = 470
    logo = Image.open(LOGO_INK).convert("RGBA")
    lw = 290
    logo = logo.resize((lw, int(logo.height * lw / logo.width)), Image.LANCZOS)
    ly = 112
    img.paste(logo, (tx, ly), logo)
    y = ly + logo.height + 34
    draw.text((tx, y), "Producción de eventos", font=nunito(38, b"SemiBold"), fill=INK)
    draw.text((tx, y + 56), "Tareas · Chat · Aprobaciones · Anticipos", font=nunito(24), fill=SECONDARY)
    img.save(HERE / "feature-graphic-1024x500.png", optimize=True)


def web_icons(mask):
    """Íconos del panel instalado: los mismos que la app; el «maskable» deja la «a» en la zona segura (80 %)."""
    WEB_ICONS.mkdir(parents=True, exist_ok=True)
    big = draw_glyph(paper(1024), mask, 0.46, 0.52)
    for name, side in (("apple-touch-icon", 180), ("icon-192", 192), ("icon-512", 512)):
        big.resize((side, side), Image.LANCZOS).save(WEB_ICONS / f"{name}.png", optimize=True)
    draw_glyph(paper(1024), mask, 0.36, 0.52).resize((512, 512), Image.LANCZOS).save(
        WEB_ICONS / "icon-maskable-512.png", optimize=True
    )
    # Insignia de Android en avisos web: solo la silueta en blanco sobre transparente.
    side = 96
    gh = int(side * 0.62)
    gw = int(mask.width * gh / mask.height)
    m = mask.resize((gw, gh), Image.LANCZOS)
    badge = Image.new("RGBA", (side, side), (255, 255, 255, 0))
    badge.paste(Image.new("RGBA", (gw, gh), (255, 255, 255, 255)), ((side - gw) // 2, (side - gh) // 2), m)
    badge.save(WEB_ICONS / "badge-96.png", optimize=True)


if __name__ == "__main__":
    a = glyph_mask()
    ios_icon = app_icon(a)
    android_layers(a)
    feature_graphic(ios_icon)
    web_icons(a)
    print("listo: AppIcon-1024, capas del ícono adaptable, icon-512, feature graphic e íconos web")
