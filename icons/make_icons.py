#!/usr/bin/env python3
# 生成插件 logo：白色 {F}（FormForge 标识，源自 forgecode.dev logo mark）+ 透明底
# 与浮窗内 logo（白标）保持一致；Chrome 深浅工具栏下均以 glyph 本体呈现。
# 用法：python3 icons/make_icons.py  → 输出 icons/icon{16,32,48,128}.png
# {F} 矢量路径来自 forgecode.dev logo-dark.svg（去除文字，仅保留图形标记）
import os
from PIL import Image

SIZE = 512  # 母版尺寸，再缩小到各档，抗锯齿好
WHITE = (255, 255, 255, 255)

# {F} 图形路径（从 forgecode.dev logo-dark.svg 提取，viewBox 0 0 100 95）
MARK_PATH = "M100 39.1107V49.114C96.135 49.114 92.9891 52.265 92.9891 56.1462V72.2649C92.9891 80.9477 85.9383 88 77.2795 88H55.447"

def draw_logo():
    S = SIZE
    # 底图：forge_mark_512.png 是透明底黑标，用其 alpha 通道套出白色 glyph（描边抗锯齿保留）
    pre = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'forge_mark_512.png')
    mark = Image.open(pre).convert('RGBA')
    white = Image.new('RGBA', mark.size, WHITE)
    white.putalpha(mark.split()[3])
    side = int(S * 0.8)  # 四周留白 10%，小尺寸下不顶边
    white = white.resize((side, side), Image.LANCZOS)
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    out.alpha_composite(white, ((S - side) // 2, (S - side) // 2))
    return out

if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    master = draw_logo()
    for s in (16, 32, 48, 128):
        master.resize((s, s), Image.LANCZOS).save(os.path.join(here, f'icon{s}.png'))
    print('done:', sorted(os.listdir(here)))
