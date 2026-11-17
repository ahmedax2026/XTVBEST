"""Render Arabic broadcast status artwork using the original XBEST server logo.
Development tool only (Pillow); customer builds ship the resulting PNG assets.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, features
import re

root = Path(__file__).resolve().parents[1]
out = root / 'server/src/resources/images'
font = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
bold = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

if not features.check('raqm'):
    raise RuntimeError('Arabic artwork requires Pillow with libraqm support')

def mark(size):
    return Image.open(root/'web/public/xbest.png').convert('RGBA').resize(
        (size, size), Image.Resampling.LANCZOS
    )

logo = Image.open(root/'web/public/xbest.png').convert('RGBA')
logo.save(out/'xbest-logo.png')
for name, title, subtitle in [
    ('bumper', 'لحظات ونبدأ', 'XBEST CHANNELS STUDIO'),
    ('offline', 'القناة متوقفة مؤقتًا', 'سيعود البث قريبًا.'),
    ('error', 'تعذر تشغيل المحتوى', 'جارٍ تجهيز محاولة جديدة للبث.'),
    ('loading', 'جارٍ تجهيز البث', 'يرجى الانتظار حتى يبدأ تشغيل القناة.'),
    ('music', 'يُعرض الآن', 'بث صوتي من XBEST'),
]:
    image = Image.new('RGB', (1920, 1080), '#0c0d12')
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((96, 86, 1824, 994), radius=28, outline='#252936', width=2)
    draw.line((96, 300, 96, 780), fill='#f02c45', width=4)
    icon = mark(240)
    image.paste(icon, (840, 220), icon)
    def center(text, y, file, size, color):
        face = ImageFont.truetype(file, size)
        draw.text((960, y), text, font=face, fill=color, anchor='mt',
                  direction='rtl' if re.search(r'[\u0600-\u06ff]', text) else 'ltr')
    center('XBEST', 484, bold, 26, '#f02c45')
    center(title, 544, bold, 55, '#eef1f4')
    center(subtitle, 634, font, 25, '#9aa3ae')
    draw.line((900, 704, 1020, 704), fill='#f02c45', width=3)
    image.save(out/f'xbest-{name}.png')
