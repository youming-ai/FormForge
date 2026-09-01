#!/usr/bin/env python3
# 生成插件 logo：白色圆角方块底 + 黑色 # 号（简洁，代表表单/占位符）
# 用法：python3 icons/make_icons.py  → 输出 icons/icon{16,32,48,128,512}.png
import os
from PIL import Image, ImageDraw

SIZE = 512  # 母版尺寸，再缩小到各档，抗锯齿好
BLACK = (17, 24, 39)   # 近黑（与浮窗主按钮色一致）
WHITE = (255, 255, 255)

def rounded_mask(size, radius):
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m

def draw_logo():
    S = SIZE
    # 1) 白色圆角方块底
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=WHITE)

    # 2) 居中黑色 # 号：两竖 + 两斜横（线帽圆头，笔画粗一致）
    lw = int(S * 0.085)
    d.line([S * 0.40, S * 0.20, S * 0.32, S * 0.80], fill=BLACK, width=lw)   # 左竖（略斜）
    d.line([S * 0.68, S * 0.20, S * 0.60, S * 0.80], fill=BLACK, width=lw)   # 右竖（略斜）
    d.line([S * 0.22, S * 0.40, S * 0.82, S * 0.40], fill=BLACK, width=lw)   # 上横
    d.line([S * 0.18, S * 0.62, S * 0.78, S * 0.62], fill=BLACK, width=lw)   # 下横

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