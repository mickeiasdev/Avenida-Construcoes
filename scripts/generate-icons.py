"""Gera os icones PNG do PWA a partir da cor da marca.

Uso:  python scripts/generate-icons.py "#f97316"
Gera public/icons/icon-192.png e public/icons/icon-512.png
(letra 'C' da loja desenhada como arco — troque pelo seu logo depois).
"""
import os
import sys

from PIL import Image, ImageDraw

COLOR = sys.argv[1] if len(sys.argv) > 1 else "#f97316"


def make(size, path):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # fundo arredondado na cor da marca
    radius = int(size * 0.22)
    draw.rounded_rectangle([0, 0, size, size], radius=radius, fill=COLOR)

    # 'C' desenhada com arco grosso branco
    inset = int(size * 0.28)
    width = int(size * 0.16)
    draw.arc([inset, inset, size - inset, size - inset], start=50, end=310, fill="white", width=width)

    img.save(path)
    print("ok:", path)


os.makedirs("public/icons", exist_ok=True)
make(192, "public/icons/icon-192.png")
make(512, "public/icons/icon-512.png")
