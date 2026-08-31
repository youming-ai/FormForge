#!/usr/bin/env python3
# 生成插件 logo：蓝色渐变底 + 白色申请表单 + agent 正在填写的行 + 勾选标记
# 用法：python3 icons/make_icons.py  → 输出 icons/icon{16,32,48,128}.png
import os
from PIL import Image, ImageDraw

SIZE = 512  # 母版尺寸，再缩小到各档，抗锯齿好

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def vertical_gradient(size, top, bottom):
    img = Image.new('RGB', (size, size))
    px = img.load()
    for y in range(size):
        c = lerp(top, bottom, y / (size - 1))
        for x in range(size):
            px[x, y] = c
    return img

def rounded_mask(size, radius):
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m

def draw_logo():
    S = SIZE
    # 1) 背景：科技蓝渐变（与浮窗主色 #165dff 同系）
    bg = vertical_gradient(S, (64, 133, 255), (22, 61, 190)).convert('RGBA')

    d = ImageDraw.Draw(bg)

    # 2) 白色申请表单卡片（居中，略偏上）
    cx = S / 2
    card_w, card_h = int(S * 0.56), int(S * 0.60)
    x0, y0 = cx - card_w / 2, S * 0.16
    x1, y1 = x0 + card_w, y0 + card_h
    r = int(S * 0.055)
    # 卡片投影
    shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [x0 + S * 0.015, y0 + S * 0.02, x1 + S * 0.015, y1 + S * 0.02], radius=r, fill=(0, 0, 0, 70))
    bg = Image.alpha_composite(bg, shadow.filter(__import__('PIL.ImageFilter', fromlist=['GaussianBlur'])
                                                   .GaussianBlur(S * 0.02)))
    d = ImageDraw.Draw(bg)
    d.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=(255, 255, 255, 255))

    # 3) 表单内容：标题条 + 若干待填行（灰）+ 一条正在被填的行（蓝）+ 勾选
    pad = int(S * 0.07)
    ty = y0 + pad
    # 标题条（较粗，深灰）
    d.rounded_rectangle([x0 + pad, ty, x0 + pad + card_w * 0.52, ty + S * 0.045],
                        radius=S * 0.012, fill=(52, 69, 115))
    # 待填行（浅灰圆角条）
    ly = ty + S * 0.10
    line_h = S * 0.038
    gap = S * 0.052
    grey = (217, 222, 232)
    for i, wf in enumerate((0.95, 0.75, 0.95)):
        yy = ly + i * gap
        d.rounded_rectangle([x0 + pad, yy, x0 + pad + card_w * wf, yy + line_h],
                            radius=line_h / 2, fill=grey)
    # 正在填写的行（品牌蓝 + 光标笔尖）
    fy = ly + 3 * gap
    blue = (22, 93, 255)
    d.rounded_rectangle([x0 + pad, fy, x0 + pad + card_w * 0.62, fy + line_h],
                       radius=line_h / 2, fill=blue)
    # 输入光标（白色竖条，模拟正在打字）
    cxr = x0 + pad + card_w * 0.62 + S * 0.015
    d.rounded_rectangle([cxr, fy - S * 0.008, cxr + S * 0.018, fy + line_h + S * 0.008],
                        radius=S * 0.009, fill=(255, 255, 255))
    # 最下一行：勾选框 + 勾
    cy = fy + gap
    bs = S * 0.052
    bx, by = x0 + pad, cy + (line_h - bs) / 2
    d.rounded_rectangle([bx, by, bx + bs, by + bs], radius=S * 0.012, outline=blue, width=int(S * 0.014))
    # 勾（两段线）
    lw = int(S * 0.022)
    d.line([bx + bs * 0.22, by + bs * 0.52, bx + bs * 0.44, by + bs * 0.76], fill=(0, 180, 42), width=lw)
    d.line([bx + bs * 0.44, by + bs * 0.76, bx + bs * 0.85, by + bs * 0.22], fill=(0, 180, 42), width=lw)
    d.line([bx + bs * 0.22, by + bs * 0.52, bx + bs * 0.44, by + bs * 0.76], fill=(0, 180, 42), width=lw)

    # 4) 右下角 agent 徽标（深色圆底 + 闪电/火花，代表 AI）
    ax, ay = S * 0.70, S * 0.72
    ar_ = S * 0.155
    d.ellipse([ax - ar_, ay - ar_, ax + ar_, ay + ar_], fill=(31, 35, 41))
    # 闪电 ⚡
    z = [(ax - S * 0.015, ay - ar_ * 0.62), (ax + S * 0.045, ay - ar_ * 0.62),
         (ax + S * 0.005, ay - S * 0.008), (ax + S * 0.05, ay - S * 0.008),
         (ax - S * 0.04, ay + ar_ * 0.66), (ax - S * 0.002, ay + S * 0.015),
         (ax - S * 0.045, ay + S * 0.015), (ax - S * 0.015, ay - ar_ * 0.62)]
    d.polygon(z, fill=(255, 200, 41))

    # 5) 裁成圆角（Chrome 图标通常自己再裁，但圆角更精致）
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    out.paste(bg, (0, 0), rounded_mask(S, int(S * 0.22)))
    return out

if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    master = draw_logo()
    master.save(os.path.join(here, 'icon512.png'))
    for s in (16, 32, 48, 128):
        master.resize((s, s), Image.LANCZOS).save(os.path.join(here, f'icon{s}.png'))
    print('done:', sorted(os.listdir(here)))