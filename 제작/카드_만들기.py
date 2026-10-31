"""카드 그림 -> 카드_인쇄.pdf (카드마다 A4 1장, 9장씩), 군사 유닛 -> 군사유닛.pdf.

실행: python 카드_만들기.py   (Pillow 필요: pip install pillow)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
CARDS = HERE.parent / "카드"
DPI = 300
A4 = (210, 297)  # 세로, mm
MARGIN = 10
CARD = (63, 88)  # 일반 카드(포커) 크기, mm
UNIT = 7.5  # 군사 유닛 = 판 1칸, mm
FONT_BOLD = "C:/Windows/Fonts/malgunbd.ttf"

# (파일, 카드 이름, 그림 안 위치 (왼, 위, 오른, 아래) px)
SOURCES = [
    ("KakaoTalk_20261031_183629599.png", [
        ("곡물 10", (3, 2, 193, 339)), ("곡물 50", (203, 2, 391, 339)), ("곡물 100", (401, 2, 585, 339)),
        ("곡물 500", (595, 2, 783, 339)), ("곡물 1000", (791, 2, 981, 339))]),
    ("KakaoTalk_20261031_184153418.png", [
        ("군사 10", (159, 7, 520, 511)), ("군사 50", (586, 7, 948, 511)), ("군사 100", (1015, 7, 1377, 510)),
        ("군사 500", (366, 521, 734, 1001)), ("군사 1000", (815, 522, 1177, 1001))]),
]

# 군사 유닛: 칸 안 색 = 숫자, 테두리 색 = 팀
VALUES = [(1, "#FFFFFF", 30), (5, "#FFE45C", 20), (10, "#8FD3FF", 15), (50, "#FF9EC8", 10), (100, "#C0C0C0", 5)]
TEAMS = [("빨강 팀", "#D62828"), ("파랑 팀", "#1D3FBF"), ("초록 팀", "#1E8C3A"),
         ("검정 팀", "#111111"), ("주황 팀", "#F07800"), ("보라 팀", "#7B2CBF")]
BLOCK_COLS = 10


def px(mm):
    return round(mm * DPI / 25.4)


def font(mm):
    return ImageFont.truetype(FONT_BOLD, px(mm))


def page():
    img = Image.new("RGB", (px(A4[0]), px(A4[1])), "white")
    return img, ImageDraw.Draw(img)


def card_pages():
    pages = []
    cols, rows = 3, 3
    ox = (A4[0] - cols * CARD[0]) / 2
    oy = (A4[1] - rows * CARD[1]) / 2 + 3
    for fname, cards in SOURCES:
        src = Image.open(CARDS / fname).convert("RGB")
        for name, box in cards:
            crop = src.crop(box)
            # 비율 유지하며 카드 칸에 맞춤
            scale = min(px(CARD[0]) / crop.width, px(CARD[1]) / crop.height)
            art = crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.LANCZOS)
            img, d = page()
            d.text((px(MARGIN), px(MARGIN / 2 + 1)), f"{name}  (9장, 회색 선 따라 자르기)",
                   font=font(3.5), fill="#555555", anchor="lm")
            for r in range(rows):
                for c in range(cols):
                    sx = px(ox + c * CARD[0]) + (px(CARD[0]) - art.width) // 2
                    sy = px(oy + r * CARD[1]) + (px(CARD[1]) - art.height) // 2
                    img.paste(art, (sx, sy))
                    d.rectangle([sx, sy, sx + art.width, sy + art.height], outline="#999999", width=2)
            pages.append(img)
    return pages


def unit_page():
    img, d = page()
    d.text((px(MARGIN), px(MARGIN)), "군사 유닛 (한 칸 = 판 1칸, 7.5mm)", font=font(6), fill="black")
    # 범례
    y = MARGIN + 11
    d.text((px(MARGIN), px(y)), "숫자 색:", font=font(3.5), fill="black", anchor="lt")
    x = MARGIN + 18
    for v, color, _ in VALUES:
        d.rectangle([px(x), px(y - 0.5), px(x + 5), px(y + 4.5)], fill=color, outline="black", width=2)
        d.text((px(x + 6.5), px(y)), str(v), font=font(3.5), fill="black", anchor="lt")
        x += 22
    y += 7
    d.text((px(MARGIN), px(y)), "팀 테두리:", font=font(3.5), fill="black", anchor="lt")
    x = MARGIN + 18
    for name, color in TEAMS:
        d.rectangle([px(x), px(y - 0.5), px(x + 5), px(y + 4.5)], fill="white", outline=color, width=px(1))
        d.text((px(x + 6.5), px(y)), name, font=font(3.2), fill="black", anchor="lt")
        x += 28
    # 팀별 블록: 2열 x 3줄
    units = [(v, color) for v, color, n in VALUES for _ in range(n)]
    rows = -(-len(units) // BLOCK_COLS)
    bw, bh = BLOCK_COLS * UNIT, rows * UNIT
    gap_x = A4[0] - 2 * MARGIN - 2 * bw
    top = y + 12
    num_font = {len(str(v)): font(3.4 if len(str(v)) == 1 else 3.0 if len(str(v)) == 2 else 2.4) for v, _, _ in VALUES}
    for t, (name, team_color) in enumerate(TEAMS):
        bx = MARGIN + (t % 2) * (bw + gap_x)
        by = top + (t // 2) * (bh + 14)
        d.text((px(bx), px(by - 2)), f"{name} ({len(units)}개)", font=font(3.5), fill=team_color, anchor="lb")
        for i, (v, fill) in enumerate(units):
            x0, y0 = bx + (i % BLOCK_COLS) * UNIT, by + (i // BLOCK_COLS) * UNIT
            d.rectangle([px(x0), px(y0), px(x0 + UNIT), px(y0 + UNIT)], fill=team_color)
            d.rectangle([px(x0 + 1.1), px(y0 + 1.1), px(x0 + UNIT - 1.1), px(y0 + UNIT - 1.1)], fill=fill)
            d.text((px(x0 + UNIT / 2), px(y0 + UNIT / 2)), str(v), font=num_font[len(str(v))],
                   fill="black", anchor="mm")
        # 자르는 선
        for i in range(BLOCK_COLS + 1):
            d.line([px(bx + i * UNIT), px(by), px(bx + i * UNIT), px(by + bh)], fill="white", width=2)
        for j in range(rows + 1):
            d.line([px(bx), px(by + j * UNIT), px(bx + bw), px(by + j * UNIT)], fill="white", width=2)
    d.text((px(MARGIN), px(A4[1] - MARGIN)),
           "만드는 법: 실제 크기(100%)로 인쇄 → 두꺼운 종이에 붙이기 → 흰 선을 따라 자르기",
           font=font(3.2), fill="#444444", anchor="lb")
    return img


def main():
    cards = card_pages()
    cards[0].save(HERE / "카드_인쇄.pdf", save_all=True, append_images=cards[1:], resolution=DPI)
    unit_page().save(HERE / "군사유닛.pdf", resolution=DPI)
    print(f"ok: 카드_인쇄.pdf {len(cards)}장, 군사유닛.pdf 1장")


if __name__ == "__main__":
    main()
