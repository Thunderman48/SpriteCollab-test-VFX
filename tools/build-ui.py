"""Turn PMD: Origins UI art + bitmap fonts (downloaded by fetch-assets.mjs into assets/ui/raw)
into files the web page can use directly:

  assets/ui/window-{green,blue,pink}.png    24x24 9-slice window borders (CSS border-image, slice 8)
  assets/ui/portrait-{green,blue,pink}.png  12x12 9-slice portrait frames (slice 4)
  assets/ui/cursor.png, cursor-down.png     menu cursor arrows
  assets/ui/icon-dash.png, icon-switch-*.png touch / HUD control icons
  assets/ui/pmd-text.ttf                    the PMD text font (white pixels; shadow is added with CSS)
  assets/ui/types.png + types.json          PMD type orbs (glyphs E080-E092)
  assets/ui/banner.png + banner.json        PMD banner font atlas for canvas titles

Usage:  pip install pillow fonttools   then   python3 -I tools/build-ui.py
"""
import json
import os
import re
import sys

from PIL import Image
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
RAW = os.path.join(ROOT, 'assets', 'ui', 'raw')
OUT = os.path.join(ROOT, 'assets', 'ui')
COLORS = ['green', 'blue', 'pink']
TYPES = ['???', 'Bug', 'Dark', 'Dragon', 'Electric', 'Fairy', 'Fighting', 'Fire', 'Flying', 'Ghost',
         'Grass', 'Ground', 'Ice', 'Normal', 'Poison', 'Psychic', 'Rock', 'Steel', 'Water']


def rgba(path):
    return Image.open(path).convert('RGBA')


def slices():
    border = rgba(os.path.join(RAW, 'MenuBorder.png'))
    portrait = rgba(os.path.join(RAW, 'PortraitBorder.png'))
    for i, c in enumerate(COLORS):
        border.crop((0, i * 24, 24, i * 24 + 24)).save(os.path.join(OUT, f'window-{c}.png'))
        portrait.crop((0, i * 12, 12, i * 12 + 12)).save(os.path.join(OUT, f'portrait-{c}.png'))
    # Touch-control icons: fast-forward (dash/dodge) and blue/pink Poké Balls (switch).
    dash_icon().save(os.path.join(OUT, 'icon-dash.png'))
    balls = rgba(os.path.join(RAW, 'BattleFactors.png'))
    balls.crop((16, 0, 32, 16)).save(os.path.join(OUT, 'icon-switch-blue.png'))
    balls.crop((16, 16, 32, 32)).save(os.path.join(OUT, 'icon-switch-pink.png'))
    cur = rgba(os.path.join(RAW, 'Cursor.png'))
    cur.crop((0, 0, 11, 11)).save(os.path.join(OUT, 'cursor.png'))
    cur.crop((11, 0, 22, 11)).save(os.path.join(OUT, 'cursor-down.png'))


def is_fill(px):
    r, g, b, a = px
    return a > 0 and r > 128 and g > 128 and b > 128


def dash_icon():
    """16x16 white double chevron (>>) with a black outline, matching the PMD icon style."""
    im = Image.new('RGBA', (16, 16))
    fill = set()
    for x0 in (2, 8):
        for r in range(10):
            off = r if r < 5 else 9 - r
            for k in range(3):
                fill.add((x0 + off + k - 1, 3 + r))
    for (x, y) in fill:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if 0 <= x + dx < 16 and 0 <= y + dy < 16 and (x + dx, y + dy) not in fill:
                    im.putpixel((x + dx, y + dy), (0, 0, 0, 255))
    for (x, y) in fill:
        if 0 <= x < 16:
            im.putpixel((x, y), (248, 248, 248, 255))
    return im


def build_font():
    """Each white pixel of a glyph becomes a 100x100 unit square. Glyph PNGs are top-aligned
    with the baseline under row 8, so 1 px = 100 units, ascent 900, descent 300 (12 px em)."""
    text_dir = os.path.join(RAW, 'text')
    xml = open(os.path.join(text_dir, 'FontData.xml'), encoding='utf-8-sig').read()
    space = int(re.search(r'<SpaceWidth>(\d+)', xml).group(1))
    U, ASC, DESC = 100, 900, 300
    names = ['.notdef', 'space']
    cmap = {0x20: 'space', 0xA0: 'space'}
    glyphs = {}
    metrics = {}

    empty = TTGlyphPen(None)
    glyphs['.notdef'] = empty.glyph()
    metrics['.notdef'] = (space * U, 0)
    glyphs['space'] = TTGlyphPen(None).glyph()
    metrics['space'] = (space * U, 0)

    for f in sorted(os.listdir(text_dir)):
        m = re.fullmatch(r'([0-9A-F]{4})\.png', f)
        if not m:
            continue
        cp = int(m.group(1), 16)
        if 0xE000 <= cp <= 0xF8FF:
            continue  # coloured icons are handled separately
        im = rgba(os.path.join(text_dir, f))
        w, h = im.size
        pen = TTGlyphPen(None)
        for y in range(h):
            x = 0
            while x < w:
                if is_fill(im.getpixel((x, y))):
                    x0 = x
                    while x < w and is_fill(im.getpixel((x, y))):
                        x += 1
                    top = ASC - y * U
                    bot = top - U
                    # clockwise outer contour
                    pen.moveTo((x0 * U, bot))
                    pen.lineTo((x0 * U, top))
                    pen.lineTo((x * U, top))
                    pen.lineTo((x * U, bot))
                    pen.closePath()
                else:
                    x += 1
        name = f'uni{cp:04X}'
        names.append(name)
        cmap[cp] = name
        glyphs[name] = pen.glyph()
        metrics[name] = (w * U, 0)

    fb = FontBuilder(12 * U, isTTF=True)
    fb.setupGlyphOrder(names)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=ASC, descent=-DESC)
    fb.setupNameTable({'familyName': 'PMD', 'styleName': 'Regular'})
    fb.setupOS2(sTypoAscender=ASC, sTypoDescender=-DESC, sTypoLineGap=0, usWinAscent=ASC, usWinDescent=DESC)
    fb.setupPost()
    path = os.path.join(OUT, 'pmd-text.ttf')
    fb.save(path)
    return len(cmap), os.path.getsize(path)


def build_types():
    text_dir = os.path.join(RAW, 'text')
    ims = [rgba(os.path.join(text_dir, f'{0xE080 + i:04X}.png')) for i in range(len(TYPES))]
    cell = max(max(i.size) for i in ims)
    sheet = Image.new('RGBA', (cell * len(ims), cell))
    meta = {'cell': cell, 'types': {}}
    for i, (t, im) in enumerate(zip(TYPES, ims)):
        sheet.alpha_composite(im, (i * cell + (cell - im.size[0]) // 2, (cell - im.size[1]) // 2))
        meta['types'][t] = i
    sheet.save(os.path.join(OUT, 'types.png'))
    json.dump(meta, open(os.path.join(OUT, 'types.json'), 'w'), indent=1)


def build_banner():
    bdir = os.path.join(RAW, 'banner')
    xml = open(os.path.join(bdir, 'FontData.xml'), encoding='utf-8-sig').read()
    space = int(re.search(r'<SpaceWidth>(\d+)', xml).group(1))
    chars = []
    for f in sorted(os.listdir(bdir)):
        m = re.fullmatch(r'([0-9A-F]{4})\.png', f)
        if m:
            chars.append((chr(int(m.group(1), 16)), rgba(os.path.join(bdir, f))))
    h = max(im.size[1] for _, im in chars)
    sheet = Image.new('RGBA', (sum(im.size[0] + 1 for _, im in chars), h))
    meta = {'height': h, 'space': space, 'glyphs': {}}
    x = 0
    for ch, im in chars:
        sheet.alpha_composite(im, (x, 0))
        meta['glyphs'][ch] = [x, im.size[0], im.size[1]]
        x += im.size[0] + 1
    sheet.save(os.path.join(OUT, 'banner.png'))
    json.dump(meta, open(os.path.join(OUT, 'banner.json'), 'w'))


if __name__ == '__main__':
    if not os.path.isdir(RAW):
        sys.exit('Run tools/fetch-assets.mjs first (assets/ui/raw missing).')
    slices()
    n, size = build_font()
    build_types()
    build_banner()
    print(f'UI built: font with {n} characters ({size} bytes), {len(TYPES)} type orbs, banner atlas.')
