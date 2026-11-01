"""세계/격자 진하게 지도 4장 -> 게임판_인쇄.pdf (A4 가로 4장, ①②③④).

실행: python 지도_인쇄.py   (Pillow 필요: pip install pillow)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
MAPS = HERE.parent / "세계" / "격자 진하게"
DPI = 300
PAGE = (297, 210)  # A4 가로, mm
MARGIN = 6  # 프린터가 못 찍는 가장자리, mm
FONT = "C:/Windows/Fonts/malgunbd.ttf"

# (파일, 위치 이름, 왼쪽 열인가, 위쪽 줄인가)
SHEETS = [
    ("KakaoTalk_20261030_201538644_01.png", "① 왼쪽 위", True, True),
    ("KakaoTalk_20261030_201538644_03.png", "② 오른쪽 위", False, True),
    ("KakaoTalk_20261030_201538644_02.png", "③ 왼쪽 아래", True, False),
    ("KakaoTalk_20261030_201538644.png", "④ 오른쪽 아래", False, False),
]


def px(mm):
    return round(mm * DPI / 25.4)


def main():
    pages = []
    for fname, title, left, top in SHEETS:
        src = Image.open(MAPS / fname).convert("RGB")
        # 비율 유지하며 인쇄 가능 영역(가장자리 MARGIN 뺀 곳)에 맞춤
        scale = min(px(PAGE[0] - 2 * MARGIN) / src.width, px(PAGE[1] - 2 * MARGIN) / src.height)
        art = src.resize((round(src.width * scale), round(src.height * scale)), Image.LANCZOS)
        page = Image.new("RGB", (px(PAGE[0]), px(PAGE[1])), "white")
        d = ImageDraw.Draw(page)
        # 이어 붙이는 쪽에 그림을 붙이고, 그 바깥 여백을 회색 "자르기"로
        x = px(PAGE[0] - MARGIN) - art.width if left else px(MARGIN)
        y = px(PAGE[1] - MARGIN) - art.height if top else px(MARGIN)
        cut = "#DDDDDD"
        if left:
            d.rectangle([x + art.width, 0, page.width, page.height], fill=cut)
        else:
            d.rectangle([0, 0, x, page.height], fill=cut)
        if top:
            d.rectangle([0, y + art.height, page.width, page.height], fill=cut)
        else:
            d.rectangle([0, 0, page.width, y], fill=cut)
        page.paste(art, (x, y))
        d.rectangle([x, y, x + art.width, y + art.height], outline="black", width=2)
        f = ImageFont.truetype(FONT, px(3))
        tx = px(MARGIN) if left else page.width - px(MARGIN)
        ty = px(MARGIN / 2) if top else page.height - px(MARGIN / 2)
        d.text((tx, ty), f"게임판 {title}  (회색 쪽을 잘라 맞대기)", font=f, fill="#555555",
               anchor=("lm" if left else "rm"))
        pages.append(page)
    pages[0].save(HERE / "게임판_인쇄.pdf", save_all=True, append_images=pages[1:], resolution=DPI)
    w, h = art.width * 2 * 25.4 / DPI, art.height * 2 * 25.4 / DPI
    print(f"ok: 게임판_인쇄.pdf 4장, 다 붙이면 {w:.0f} x {h:.0f} mm")


if __name__ == "__main__":
    main()
