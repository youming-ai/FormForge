#!/usr/bin/env python3
# 生成插件 logo：纯色蓝圆角方块 + 白色对勾（简洁，代表「自动填写完成」）
# 用法：python3 icons/make_icons.py  → 输出 icons/icon{16,32,48,128,512}.png
import os
from PIL import Image, ImageDraw

SIZE = 512  # 母版尺寸，再缩小到各档，抗锯齿好
BLUE = (22, 93, 255)   # 与浮窗主色同系
WHITE = (255, 255, 255)

def rounded_mask(size, radius):
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m

def draw_logo():
    S = SIZE
    # 1) 纯色圆角方块底
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BLUE)

    # 2) 居中白色对勾（两段粗线）
    lw = int(S * 0.11)
    # 对勾范围：中心偏下一点
    x0, y0 = S * 0.26, S * 0.50
    x1, y1 = S * 0.44, S * 0.68
    x2, y2 = S * 0.76, S * 0.34
    d.line([x0, y0, x1, y1], fill=WHITE, width=lw)
    d.line([x1, y1, x2, y2], fill=WHITE, width=lw)

    # 3) 圆角裁切
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    out.paste(img, (0, 0), rounded_mask(S, int(S * 0.22)))
    return out

if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    master = draw_logo()
    master.save(os.path.join(here, 'icon512.png'))
    for s in (16, 32, 48, 128):
        master.resize((s, s), Image.LANCZOS).save(os.path.join(here, f'icon{s}.png'))
    print('done:', sorted(os.listdir(here)))
