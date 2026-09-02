#!/usr/bin/env python3
# 生成插件 logo：白色圆角方块底 + 黑色 {F}（FormForge 标识，源自 forgecode.dev logo mark）
# 用法：python3 icons/make_icons.py  → 输出 icons/icon{16,32,48,128,512}.png
# {F} 矢量路径来自 forgecode.dev logo-dark.svg（去除文字，仅保留图形标记）
import os
from PIL import Image, ImageDraw

SIZE = 512  # 母版尺寸，再缩小到各档，抗锯齿好
BLACK = (17, 24, 39)   # 近黑（与浮窗主按钮色一致）
WHITE = (255, 255, 255)

# {F} 图形路径（从 forgecode.dev logo-dark.svg 提取，viewBox 0 0 100 95）
MARK_PATH = "M100 39.1107V49.114C96.135 49.114 92.9891 52.265 92.9891 56.1462V72.2649C92.9891 80.9477 85.9383 88 77.2795 88H55.447"

def rounded_mask(size, radius):
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m

def draw_logo():
    S = SIZE
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # 1) 白色圆角方块底
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=WHITE)

    # 2) 居中贴 {F} 标记（同目录 forge_mark_512.png，由 forge_mark.svg 经 Chrome 渲染，透明底黑图）
    pre = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'forge_mark_512.png')
    mark = Image.open(pre).convert('RGBA')
    mark = mark.resize((int(S * 0.72), int(S * 0.72)), Image.LANCZOS)
    img.alpha_composite(mark, ((S - mark.width) // 2, (S - mark.height) // 2))

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
