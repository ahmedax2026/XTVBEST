"""Generate XBest's code-native product marks and broadcast status artwork.
Development tool only (Pillow); customer builds ship the resulting PNG assets.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
out = root / 'server/src/resources/images'
font = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
bold = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

def mark(size):
    image = Image.new('RGBA', (size, size))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, size-1, size-1), radius=size//4, fill='#f02c45')
    for points in [[(16,16),(27,16),(48,48),(37,48)],[(37,16),(48,16),(27,48),(16,48)]]:
        draw.polygon([(x*size/64, y*size/64) for x,y in points], fill='white')
    return image

logo = mark(256)
logo.save(out/'xbest-logo.png')
logo.save(root/'web/public/xbest.png')
for name, title, subtitle in [
    ('offline', 'CHANNEL OFFLINE', 'Your channel will return shortly.'),
    ('error', 'PLAYBACK INTERRUPTED', 'The studio is preparing another attempt.'),
    ('loading', 'PREPARING YOUR STREAM', 'Please wait while the channel starts.'),
    ('music', 'NOW PLAYING', 'XBest audio broadcast'),
]:
    image = Image.new('RGB', (1920, 1080), '#0c0d12')
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((96, 86, 1824, 994), radius=28, outline='#252936', width=2)
    draw.line((96, 300, 96, 780), fill='#f02c45', width=4)
    icon = mark(128)
    image.paste(icon, (896, 256), icon)
    def center(text, y, file, size, color):
        face = ImageFont.truetype(file, size)
        draw.text((960, y), text, font=face, fill=color, anchor='mt')
    center('XBEST CHANNELS STUDIO', 436, bold, 26, '#f02c45')
    center(title, 516, bold, 55, '#eef1f4')
    center(subtitle, 610, font, 25, '#9aa3ae')
    draw.line((900, 704, 1020, 704), fill='#f02c45', width=3)
    image.save(out/f'xbest-{name}.png')
