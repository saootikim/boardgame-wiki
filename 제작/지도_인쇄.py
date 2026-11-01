"""세계/격자 진하게 지도 4장 -> 게임판_인쇄.pdf (A4 가로 4장, ①②③④).

지도를 A4 한 장에 꽉 채운다 (여백 없음). A4(1.41:1)와 지도(1.5:1) 비율이 달라서
세로로 조금 늘어난다: 한 칸 8.25 x 8.75mm. 프린터의 "테두리 없음" 인쇄로 뽑는다.

실행: python 지도_인쇄.py   (Pillow 필요: pip install pillow)
"""
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
MAPS = HERE.parent / "세계" / "격자 진하게"
DPI = 300
PAGE = (297, 210)  # A4 가로, mm

# PDF 쪽 순서 = 붙이는 자리: ① 왼쪽 위, ② 오른쪽 위, ③ 왼쪽 아래, ④ 오른쪽 아래
SHEETS = [
    "KakaoTalk_20261030_201538644_01.png",
    "KakaoTalk_20261030_201538644_03.png",
    "KakaoTalk_20261030_201538644_02.png",
    "KakaoTalk_20261030_201538644.png",
]


def px(mm):
    return round(mm * DPI / 25.4)


def main():
    size = (px(PAGE[0]), px(PAGE[1]))
    pages = [Image.open(MAPS / f).convert("RGB").resize(size, Image.LANCZOS) for f in SHEETS]
    pages[0].save(HERE / "인쇄" / "게임판_인쇄.pdf", save_all=True, append_images=pages[1:], resolution=DPI)
    print(f"ok: 게임판_인쇄.pdf 4장, 다 붙이면 {PAGE[0] * 2} x {PAGE[1] * 2} mm")


if __name__ == "__main__":
    main()
