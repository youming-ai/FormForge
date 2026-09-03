#!/usr/bin/env python3
# 生成插件 logo：Zima Blue #0080ff 的 {F}（FormForge 标识，源自 forgecode.dev logo mark）+ 透明底
# 与浮窗内 logo 造型一致（颜色与旧版 HeroUI 主色同源）；Chrome 深浅工具栏下均以 glyph 本体呈现。
# 用法：python3 icons/make_icons.py  → 输出 icons/icon{16,32,48,128}.png
# {F} 矢量路径来自 forgecode.dev logo-dark.svg（去除文字，仅保留图形标记）
import os
from PIL import Image

SIZE = 512  # 母版尺寸，再缩小到各档，抗锯齿好
ZIMA = (0, 128, 255, 255)  # Zima Blue

# {F} 图形源自 forgecode.dev logo（去除文字，仅保留图形标记的位图 forge_mark_512.png）

def draw_logo():
    S = SIZE
    # 底图：forge_mark_512.png 是透明底黑标，用其 alpha 通道套出 Zima Blue glyph（描边抗锯齿保留）
    pre = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'forge_mark_512.png')
    mark = Image.open(pre).convert('RGBA')
    white = Image.new('RGBA', mark.size, ZIMA)
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
