"""카드 그림 -> 카드_인쇄.pdf (44×63mm, A4 1장에 16장, 앞면 다음 쪽이 뒷면),
군사 유닛 -> 군사유닛.pdf (A4 1장에 2팀).

실행: python 카드_만들기.py   (Pillow 필요: pip install pillow)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
CARDS = HERE.parent / "카드"
DPI = 300
A4 = (210, 297)  # 세로, mm
MARGIN = 10
CARD = (44, 63)  # 모든 카드 같은 크기 (미니 카드), mm
GRID = (4, 4)  # A4 1장에 4×4 = 16장
CARD_BG = "#15110D"  # 그림 비율이 달라 남는 부분 색
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
COPIES = 16  # 곡물·군사는 숫자마다 A4 1장(16장)

# 전술 카드: 계열마다 그림 1장(3×2), 카드 순서는 전술카드_프롬프트.md와 같다. 효과는 전술카드.md 표에서 읽는다.
TACTIC_FAMILIES = {
    "공격": ["정면 공격", "돌격", "기습", "일제 사격", "화공", "광전사"],
    "방어": ["방진", "농성", "후퇴", "방패벽", "참호", "산악 수비"],
    "책략": ["계략", "매복", "첩보", "위장 퇴각", "야습", "보급 차단"],
    "기동": ["측면 공격", "강행군", "도하", "기병 돌파", "해상 상륙", "우회"],
}
TACTIC_COLS = [(123, 533), (563, 973), (1003, 1413)]
TACTIC_ROWS = [(9, 503), (520, 1007)]
TACTIC_PLATE = (40, 410, 370, 475)  # 카드 안 빈 효과 칸, px

# 뒷면: (덱, 바탕색, 테두리색)
BACKS = {"곡물": ("#3B2A12", "#E8B84A"), "군사": ("#14224A", "#D9B45A"), "전술": ("#2A1630", "#D4AF37")}

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


def fit(crop):
    """그림을 카드 크기 안에 비율 유지하며 맞춘다. (그림, 배율)"""
    scale = min(px(CARD[0]) / crop.width, px(CARD[1]) / crop.height)
    return crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.LANCZOS), scale


def on_card(art):
    """카드 크기 바탕 가운데에 그림을 놓는다. 모든 카드 크기가 같아진다."""
    card = Image.new("RGB", (px(CARD[0]), px(CARD[1])), CARD_BG)
    card.paste(art, ((card.width - art.width) // 2, (card.height - art.height) // 2))
    return card


def tactic_effects():
    """전술카드.md 표에서 {카드 이름: 효과}를 읽는다."""
    effects = {}
    for line in (CARDS / "전술카드.md").read_text(encoding="utf-8").splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) == 3 and cells[1] in TACTIC_FAMILIES:
            effects[cells[0]] = cells[2]
    return effects


def write_effect(art, scale, text):
    """빈 효과 칸 안에 글씨를 맞춰 넣는다. 들어갈 때까지 글씨를 줄인다."""
    d = ImageDraw.Draw(art)
    x0, y0, x1, y1 = (round(v * scale) for v in TACTIC_PLATE)
    pad = round(6 * scale)
    w, h = x1 - x0 - 2 * pad, y1 - y0 - 2 * pad
    for size in range(round(28 * scale), 4, -1):
        f = ImageFont.truetype(FONT_BOLD, size)
        lines, cur = [], ""
        for word in text.split(" "):
            cand = (cur + " " + word).strip()
            if d.textlength(cand, font=f) <= w:
                cur = cand
            else:
                lines.append(cur)
                cur = word
        lines.append(cur)
        gap = round(size * 1.25)
        if len(lines) * gap <= h and all(d.textlength(l, font=f) <= w for l in lines):
            break
    top = (y0 + y1) / 2 - gap * (len(lines) - 1) / 2
    for i, l in enumerate(lines):
        d.text(((x0 + x1) / 2, top + i * gap), l, font=f, fill="#F5E6C8", anchor="mm")


def card_back(kind):
    bg, gold = BACKS[kind]
    w, h = px(CARD[0]), px(CARD[1])
    img = Image.new("RGB", (w, h), bg)
    d = ImageDraw.Draw(img)
    # 마름모 무늬
    step = px(4)
    for k in range(-h, w + h, step):
        d.line([(k, 0), (k + h, h)], fill=_mix(bg, gold, 0.12), width=2)
        d.line([(k, h), (k + h, 0)], fill=_mix(bg, gold, 0.12), width=2)
    m = px(1.5)
    d.rounded_rectangle([m, m, w - m, h - m], radius=px(2.5), outline=gold, width=px(0.8))
    d.rounded_rectangle([m + px(1.3), m + px(1.3), w - m - px(1.3), h - m - px(1.3)], radius=px(1.8),
                        outline=gold, width=px(0.25))
    r = px(13)
    cx, cy = w // 2, h // 2
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=bg, outline=gold, width=px(0.8))
    d.ellipse([cx - r + px(1.5), cy - r + px(1.5), cx + r - px(1.5), cy + r - px(1.5)], outline=gold, width=px(0.25))
    d.text((cx, cy - px(1)), kind, font=font(7.5), fill=gold, anchor="mm")
    d.text((cx, cy + px(6.5)), "카드", font=font(2.6), fill=gold, anchor="mm")
    return img


def _mix(a, b, t):
    a, b = [int(a[i:i + 2], 16) for i in (1, 3, 5)], [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def all_cards():
    """(덱, 이름, 카드 그림) 목록. 곡물·군사는 COPIES장씩, 전술은 1장씩."""
    out = []
    for fname, cards in SOURCES:
        src = Image.open(CARDS / fname).convert("RGB")
        for name, box, *label in cards:
            art, scale = fit(src.crop(box))
            if label:
                relabel(art, scale, *label)
            out += [(name.split()[0], name, on_card(art))] * COPIES
    effects = tactic_effects()
    for fam, names in TACTIC_FAMILIES.items():
        src = Image.open(CARDS / f"전술카드_{fam}.png").convert("RGB")
        for i, name in enumerate(names):
            (x0, x1), (y0, y1) = TACTIC_COLS[i % 3], TACTIC_ROWS[i // 3]
            art, scale = fit(src.crop((x0, y0, x1, y1)))
            write_effect(art, scale, effects[name])
            out.append(("전술", name, on_card(art)))
    return out


def card_pages():
    """앞면 쪽 다음에 뒷면 쪽. 뒷면은 좌우를 뒤집어 놓아 양면 인쇄(긴 쪽 넘기기)에서 맞는다."""
    cols, rows = GRID
    per = cols * rows
    ox, oy = (A4[0] - cols * CARD[0]) / 2, (A4[1] - rows * CARD[1]) / 2 + 3
    cards = all_cards()
    # 덱이 바뀌면 새 쪽에서 시작 (한 쪽의 뒷면이 모두 같은 덱이 되게)
    chunks, cur = [], []
    for c in cards:
        if cur and (len(cur) == per or cur[-1][0] != c[0]):
            chunks.append(cur)
            cur = []
        cur.append(c)
    chunks.append(cur)
    backs = {k: card_back(k) for k in BACKS}
    pages = []
    for n, chunk in enumerate(chunks, 1):
        names = sorted({name for _, name, _ in chunk}, key=[c[1] for c in chunk].index)
        title = names[0] if len(names) == 1 else f"{chunk[0][0]} 카드"
        for side in ("앞면", "뒷면"):
            img, d = page()
            d.text((px(MARGIN), px(MARGIN / 2 + 1)), f"{n}-{side}  {title}  ({len(chunk)}장)",
                   font=font(3.5), fill="#555555", anchor="lm")
            for i, (deck, _, card) in enumerate(chunk):
                r, c = divmod(i, cols)
                if side == "뒷면":
                    c, card = cols - 1 - c, backs[deck]
                x, y = px(ox + c * CARD[0]), px(oy + r * CARD[1])
                img.paste(card, (x, y))
                d.rectangle([x, y, x + card.width, y + card.height], outline="#9A9A9A", width=2)
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
    cards[0].save(HERE / "인쇄" / "카드_인쇄.pdf", save_all=True, append_images=cards[1:], resolution=DPI)
    units = unit_pages()
    units[0].save(HERE / "인쇄" / "군사유닛.pdf", save_all=True, append_images=units[1:], resolution=DPI)
    print(f"ok: 카드_인쇄.pdf {len(cards)}쪽 (앞·뒤), 군사유닛.pdf {len(units)}장")


if __name__ == "__main__":
    main()
