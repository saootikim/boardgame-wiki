"""지도.txt -> 보드판.pdf (A4 가로 4장 + 범례 1장) + 보드판_미리보기.png.

실행: python 보드판_만들기.py   (Pillow 필요: pip install pillow)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
DPI = 300
CELL = 15  # mm
PAGE_W, PAGE_H = 297, 210  # A4 가로, mm
MARGIN = 10  # 프린터가 못 찍는 가장자리 여유, mm
FONT = "C:/Windows/Fonts/malgun.ttf"
FONT_BOLD = "C:/Windows/Fonts/malgunbd.ttf"

# 코드: (이름, 칸 색, 칸 안 표시, 효과 요약)
TERRAIN = {
    ".": ("바다", "#BFE3F5", "", "정복도 30. 배가 있으면 20. 배는 바닷가 땅이 있어야 지음"),
    "D": ("심해", "#6FA8D6", "심", "들어가면 바다의 신전이 펼쳐짐"),
    "S": ("바다의 신전", "#3F7FB8", "신전", "곡물을 바치면 그만큼 대가를 줌"),
    "B": ("버뮤다 삼각지대", "#A9B8E8", "버", "중립. 섬 3개를 낀 바다. 들어오면 배를 다른 곳으로 이동"),
    "I": ("섬", "#E8DCA0", "섬", "강·육지와 같음"),
    "U": ("미개발지", "#EEF2F5", "미", "원주민 있음. 들어가면 지역 카드로 성격 확인"),
    "L": ("육지", "#D8ECB8", "", "정복도 20"),
    "M": ("산", "#B7A58C", "▲", "정복도 30"),
    "R": ("강", "#7FC6E8", "강", "정복도 20. 다리가 있으면 그냥 건넘"),
    "J": ("정글", "#7DBA6A", "♣", "그냥 땅"),
    "H": ("마계", "#E0846A", "마", "용암지대. 종족 곡식을 추가로 내야 정복"),
    "F": ("곡창지대", "#F2D16B", "곡", "곡물 200 또는 자원으로 차지. 연말 1칸당 곡물 +50"),
    "K": ("광산", "#9C9C9C", "광산", "연말 정산마다 카드 1장"),
    "T": ("상인의 마을", "#F5A9C8", "상인", "중립. 연말에 주변 3칸까지 차지하면 스페셜 카드"),
}
ROW_NAMES = "ABCDEFGHIJKLMNOPQRSTUVW"


def px(mm):
    return round(mm * DPI / 25.4)


def font(size_mm, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT, px(size_mm))


def load_map():
    rows = [ln.rstrip("\n") for ln in (HERE / "지도.txt").read_text(encoding="utf-8").splitlines()
            if ln.strip() and not ln.startswith("#")]
    width = len(rows[0])
    for i, r in enumerate(rows):
        assert len(r) == width, f"{i + 1}번째 줄 길이 {len(r)}, {width}이어야 함"
        bad = set(r) - TERRAIN.keys()
        assert not bad, f"{i + 1}번째 줄에 모르는 글자 {bad}"
    assert len(rows) <= len(ROW_NAMES), "줄이 너무 많음"
    return rows


def draw_cell(d, x, y, code, size):
    name, color, mark, _ = TERRAIN[code]
    d.rectangle([x, y, x + size, y + size], fill=color, outline="#555555", width=max(1, size // 60))
    if mark:
        f = ImageFont.truetype(FONT_BOLD, int(size * (0.28 if len(mark) > 1 else 0.38)))
        d.text((x + size / 2, y + size / 2), mark, font=f, fill="#333333", anchor="mm")


def draw_grid(d, rows, c0, c1, r0, r1, ox, oy, size):
    for r in range(r0, r1):
        for c in range(c0, c1):
            draw_cell(d, ox + (c - c0) * size, oy + (r - r0) * size, rows[r][c], size)


def board_pages(rows):
    n_rows, n_cols = len(rows), len(rows[0])
    # 왼쪽/위 페이지가 칸을 하나 더 가져감 (홀수 칸 수)
    split_c, split_r = (n_cols + 1) // 2, (n_rows + 1) // 2
    max_w = PAGE_W - 2 * MARGIN
    max_h = PAGE_H - 2 * MARGIN
    assert split_c * CELL <= max_w and split_r * CELL <= max_h, "칸이 A4에 안 들어감: CELL을 줄일 것"
    pages = []
    quads = [(0, split_c, 0, split_r, "① 왼쪽 위"), (split_c, n_cols, 0, split_r, "② 오른쪽 위"),
             (0, split_c, split_r, n_rows, "③ 왼쪽 아래"), (split_c, n_cols, split_r, n_rows, "④ 오른쪽 아래")]
    lab = font(4)
    for c0, c1, r0, r1, title in quads:
        left, top = c0 == 0, r0 == 0
        gw, gh = (c1 - c0) * CELL, (r1 - r0) * CELL
        # 이어 붙이는 쪽(seam)은 여백 MARGIN, 바깥쪽은 남는 공간 전부 (좌표 글자용)
        gx = PAGE_W - MARGIN - gw if left else MARGIN
        gy = PAGE_H - MARGIN - gh if top else MARGIN
        img = Image.new("RGB", (px(PAGE_W), px(PAGE_H)), "white")
        d = ImageDraw.Draw(img)
        # 잘라낼 쪽 여백: 회색 + 안내
        cut = "#DDDDDD"
        small = font(3)
        if left:
            d.rectangle([px(gx + gw), 0, px(PAGE_W), px(PAGE_H)], fill=cut)
            d.text((px(gx + gw + MARGIN / 2), px(PAGE_H / 2)), "자\n르\n기", font=small, fill="#777777", anchor="mm")
        else:
            d.rectangle([0, 0, px(gx), px(PAGE_H)], fill=cut)
            d.text((px(gx / 2), px(PAGE_H / 2)), "자\n르\n기", font=small, fill="#777777", anchor="mm")
        if top:
            d.rectangle([0, px(gy + gh), px(PAGE_W), px(PAGE_H)], fill=cut)
            d.text((px(PAGE_W / 2), px(gy + gh + MARGIN / 2)), "자르기", font=small, fill="#777777", anchor="mm")
        else:
            d.rectangle([0, 0, px(PAGE_W), px(gy)], fill=cut)
            d.text((px(PAGE_W / 2), px(gy / 2)), "자르기", font=small, fill="#777777", anchor="mm")
        draw_grid(d, rows, c0, c1, r0, r1, px(gx), px(gy), px(CELL))
        d.rectangle([px(gx), px(gy), px(gx + gw), px(gy + gh)], outline="black", width=px(0.5))
        # 좌표: 열 번호(위/아래 바깥), 줄 알파벳(왼/오른 바깥)
        for c in range(c0, c1):
            cx = px(gx + (c - c0 + 0.5) * CELL)
            y = px(gy - 4) if top else px(gy + gh + 4)
            d.text((cx, y), str(c + 1), font=lab, fill="black", anchor="mm")
        for r in range(r0, r1):
            cy = px(gy + (r - r0 + 0.5) * CELL)
            x = px(gx - 4) if left else px(gx + gw + 4)
            d.text((x, cy), ROW_NAMES[r], font=lab, fill="black", anchor="mm")
        # 페이지 번호: 바깥 모서리
        tx = px(MARGIN) if left else px(PAGE_W - MARGIN)
        ty = px(MARGIN / 2 + 1) if top else px(PAGE_H - MARGIN / 2 - 1)
        d.text((tx, ty), f"보드판 {title}", font=font(3.5, True), fill="#444444", anchor=("lm" if left else "rm"))
        pages.append(img)
    return pages


def legend_page(rows):
    img = Image.new("RGB", (px(PAGE_W), px(PAGE_H)), "white")
    d = ImageDraw.Draw(img)
    d.text((px(MARGIN), px(MARGIN)), "보드판 범례", font=font(8, True), fill="black")
    n_rows, n_cols = len(rows), len(rows[0])
    d.text((px(MARGIN), px(MARGIN + 11)),
           f"{n_cols}칸 x {n_rows}줄, 한 칸 {CELL}mm, 다 붙이면 {n_cols * CELL} x {n_rows * CELL}mm. "
           f"칸 이름 = 줄 알파벳 + 열 번호 (예: 맨 왼쪽 위 칸 = A1, 맨 오른쪽 아래 칸 = {ROW_NAMES[n_rows - 1]}{n_cols})",
           font=font(3.5), fill="#333333")
    sw, y0, f_name, f_eff = 10, MARGIN + 20, font(4, True), font(3.3)
    for i, (code, (name, _, _, eff)) in enumerate(TERRAIN.items()):
        col, row = divmod(i, 7)
        x, y = MARGIN + col * 140, y0 + row * 15
        draw_cell(d, px(x), px(y), code, px(sw))
        d.text((px(x + sw + 3), px(y + 1)), name, font=f_name, fill="black")
        d.text((px(x + sw + 3), px(y + 6.5)), eff, font=f_eff, fill="#444444")
    steps = ["만드는 법",
             "1. 인쇄할 때 '실제 크기(100%)'로 인쇄. '페이지에 맞춤'이면 칸 크기가 어긋남.",
             "2. 각 장의 회색 '자르기' 부분을 검은 테두리 선을 따라 잘라냄.",
             "3. ①②③④ 순서대로 맞대고 뒷면에 테이프로 붙임.",
             "4. 지형을 바꾸고 싶으면 지도.txt를 고치고 보드판_만들기.py를 다시 실행."]
    for i, s in enumerate(steps):
        d.text((px(MARGIN), px(y0 + 7 * 15 + 4 + i * 6)), s, font=font(3.8, i == 0), fill="black")
    return img


def preview(rows, cell_px=40):
    n_rows, n_cols = len(rows), len(rows[0])
    pad = cell_px
    img = Image.new("RGB", (n_cols * cell_px + 2 * pad, n_rows * cell_px + 2 * pad), "white")
    d = ImageDraw.Draw(img)
    draw_grid(d, rows, 0, n_cols, 0, n_rows, pad, pad, cell_px)
    f = ImageFont.truetype(FONT, cell_px // 3)
    for c in range(n_cols):
        d.text((pad + (c + 0.5) * cell_px, pad / 2), str(c + 1), font=f, fill="black", anchor="mm")
    for r in range(n_rows):
        d.text((pad / 2, pad + (r + 0.5) * cell_px), ROW_NAMES[r], font=f, fill="black", anchor="mm")
    return img


def main():
    rows = load_map()
    pages = board_pages(rows) + [legend_page(rows)]
    pages[0].save(HERE / "보드판.pdf", save_all=True, append_images=pages[1:], resolution=DPI)
    preview(rows).save(HERE / "보드판_미리보기.png")
    print(f"ok: {len(rows[0])}x{len(rows)} 칸, 보드판.pdf {len(pages)}장, 보드판_미리보기.png")


if __name__ == "__main__":
    main()
