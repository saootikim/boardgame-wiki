"""카드 그림 -> 카드_인쇄.pdf (카드마다 A4 1장, 9장씩), 군사 유닛 -> 군사유닛.pdf (A4 1장에 2팀).

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

FONT_NUM = "C:/Windows/Fonts/georgiaz.ttf"

# (파일, 카드 이름, 그림 안 위치 (왼, 위, 오른, 아래) px[, 새 숫자, 원래 왼쪽 위 숫자 너비 px])
# 곡물은 0 하나를 뗀 단위라 그림의 10~1000을 1~100으로 덮어 쓴다.
SOURCES = [
    ("KakaoTalk_20261031_183629599.png", [
        ("곡물 1", (3, 2, 193, 339), "1", 72), ("곡물 5", (203, 2, 391, 339), "5", 72),
        ("곡물 10", (401, 2, 585, 339), "10", 80), ("곡물 50", (595, 2, 783, 339), "50", 82),
        ("곡물 100", (791, 2, 981, 339), "100", 100)]),
    ("KakaoTalk_20261031_184153418.png", [
        ("군사 10", (159, 7, 520, 511)), ("군사 50", (586, 7, 948, 511)), ("군사 100", (1015, 7, 1377, 510)),
        ("군사 500", (366, 521, 734, 1001)), ("군사 1000", (815, 522, 1177, 1001))]),
]

# 군사 유닛: 칸 안 색 = 숫자, 테두리 색 = 팀
# (숫자, 안쪽 색, 글자 색, 팀당 개수)
VALUES = [(1, "#FFFFFF", "black", 40), (5, "#FFE45C", "black", 30), (10, "#8FD3FF", "black", 30),
          (50, "#FF9EC8", "black", 20), (100, "#C0C0C0", "black", 20), (500, "#A8E6A1", "black", 10),
          (1000, "#B8860B", "white", 10)]
TEAMS = [("빨강 팀", "#D62828"), ("파랑 팀", "#1D3FBF"), ("초록 팀", "#1E8C3A"),
         ("검정 팀", "#111111"), ("주황 팀", "#F07800"), ("보라 팀", "#7B2CBF")]
BLOCK_COLS = 16
TEAMS_PER_PAGE = 2


def px(mm):
    return round(mm * DPI / 25.4)


def font(mm):
    return ImageFont.truetype(FONT_BOLD, px(mm))


def page():
    img = Image.new("RGB", (px(A4[0]), px(A4[1])), "white")
    return img, ImageDraw.Draw(img)


def relabel(art, scale, number, old_w):
    """그림에 그려진 숫자(왼쪽 위, 아래 '×N')를 덮고 새 숫자를 쓴다."""
    d = ImageDraw.Draw(art)
    s = lambda v: round(v * scale)
    dark = (24, 18, 22)
    d.rounded_rectangle([s(4), s(8), s(old_w), s(62)], radius=s(14), fill=dark)
    d.text((s(10), s(36)), number, font=ImageFont.truetype(FONT_NUM, s(40)), fill="white",
           anchor="lm", stroke_width=s(1.5), stroke_fill="black")
    cx = art.width // 2
    d.rectangle([cx - s(52), s(301), cx + s(52), s(333)], fill=dark)
    d.text((cx, s(317)), f"×{number}", font=ImageFont.truetype(FONT_NUM, s(22)), fill="#F3E3C0", anchor="mm")


def card_pages():
    pages = []
    cols, rows = 3, 3
    ox = (A4[0] - cols * CARD[0]) / 2
    oy = (A4[1] - rows * CARD[1]) / 2 + 3
    for fname, cards in SOURCES:
        src = Image.open(CARDS / fname).convert("RGB")
        for name, box, *label in cards:
            crop = src.crop(box)
            # 비율 유지하며 카드 칸에 맞춤
            scale = min(px(CARD[0]) / crop.width, px(CARD[1]) / crop.height)
            art = crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.LANCZOS)
            if label:
                relabel(art, scale, *label)
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


def unit_pages():
    units = [(v, fill, ink) for v, fill, ink, n in VALUES for _ in range(n)]
    rows = -(-len(units) // BLOCK_COLS)
    bw, bh = BLOCK_COLS * UNIT, rows * UNIT
    size = {1: 3.4, 2: 3.0, 3: 2.4, 4: 1.9}
    pages = []
    for p0 in range(0, len(TEAMS), TEAMS_PER_PAGE):
        img, d = page()
        d.text((px(MARGIN), px(MARGIN)), "군사 유닛 (한 칸 = 판 1칸, 7.5mm)", font=font(6), fill="black")
        # 범례: 숫자 색
        y = MARGIN + 11
        d.text((px(MARGIN), px(y)), "숫자 색:", font=font(3.5), fill="black", anchor="lt")
        x = MARGIN + 18
        for v, fill, _, _ in VALUES:
            d.rectangle([px(x), px(y - 0.5), px(x + 5), px(y + 4.5)], fill=fill, outline="black", width=2)
            d.text((px(x + 6.5), px(y)), str(v), font=font(3.3), fill="black", anchor="lt")
            x += 23 if v >= 100 else 19
        top = y + 16
        for k, (name, team_color) in enumerate(TEAMS[p0:p0 + TEAMS_PER_PAGE]):
            bx = (A4[0] - bw) / 2
            by = top + k * (bh + 16)
            d.text((px(bx), px(by - 2)), f"{name} ({len(units)}개) - 테두리 색이 팀", font=font(3.8),
                   fill=team_color, anchor="lb")
            for i, (v, fill, ink) in enumerate(units):
                x0, y0 = bx + (i % BLOCK_COLS) * UNIT, by + (i // BLOCK_COLS) * UNIT
                d.rectangle([px(x0), px(y0), px(x0 + UNIT), px(y0 + UNIT)], fill=team_color)
                d.rectangle([px(x0 + 1.1), px(y0 + 1.1), px(x0 + UNIT - 1.1), px(y0 + UNIT - 1.1)], fill=fill)
                d.text((px(x0 + UNIT / 2), px(y0 + UNIT / 2)), str(v), font=font(size[len(str(v))]),
                       fill=ink, anchor="mm")
            # 자르는 선
            for i in range(BLOCK_COLS + 1):
                d.line([px(bx + i * UNIT), px(by), px(bx + i * UNIT), px(by + bh)], fill="white", width=2)
            for j in range(rows + 1):
                d.line([px(bx), px(by + j * UNIT), px(bx + bw), px(by + j * UNIT)], fill="white", width=2)
        d.text((px(MARGIN), px(A4[1] - MARGIN)),
               "만드는 법: 실제 크기(100%)로 인쇄 → 두꺼운 종이에 붙이기 → 흰 선을 따라 자르기",
               font=font(3.2), fill="#444444", anchor="lb")
        pages.append(img)
    return pages


def main():
    cards = card_pages()
    cards[0].save(HERE / "카드_인쇄.pdf", save_all=True, append_images=cards[1:], resolution=DPI)
    units = unit_pages()
    units[0].save(HERE / "군사유닛.pdf", save_all=True, append_images=units[1:], resolution=DPI)
    print(f"ok: 카드_인쇄.pdf {len(cards)}장, 군사유닛.pdf {len(units)}장")


if __name__ == "__main__":
    main()
