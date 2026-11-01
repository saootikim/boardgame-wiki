"""AI끼리 자동 대전 시뮬레이션. 규칙 노트의 임시값으로 여러 판을 돌려 통계를 낸다.

실행: python 시뮬레이션.py [판 수=200] [플레이어 수=4] [--log]
  --log  첫 판의 해마다 기록을 출력
  --html 판 수만큼 새로 치고 시뮬레이션_보기.html 을 만든다 (기본 20판)

단순화 (규칙과 다른 점):
- 지도는 제작/지도.txt (35x23). 한 칸 = 실제 판 약 2x2칸이라 이동 거리는 주사위 합 / 2.
- 군대는 나라마다 한 덩어리. 배·항구·다리·요새·동맹·외교·상점·이념·원주민·기후는 안 넣음.
- 바다 탐사(차지)는 심해족만. 군대 이동은 배가 있다고 보고 바다를 지나감.
- 전쟁은 전부 소모전 (진 쪽 군대 절반 손실). 전술 카드는 계열만 무작위로 뽑아 +2, 상성 +2.
- 재앙은 3년마다 몇 가지만 (전염병, 빙하기, 소행성, 화산).
"""
import random
import sys
from collections import deque
from pathlib import Path

MAP = [l for l in (Path(__file__).parent / "지도.txt").read_text(encoding="utf-8").splitlines()
       if l and not l.startswith("#")]
H, W = len(MAP), len(MAP[0])
LAND = set("LMRJFKIUH")
SEA = set(".DSB")
NEUTRAL = set("TH")  # 상인의 마을, 마계는 나라가 못 차지

# 종족: (지능, 정복력, HP, 공격력, 처음 곡식)
RACES = {"인간": (5, 5, 5, 5, 10), "마족": (3, 6, 4, 7, 10), "동물족": (2, 5, 6, 7, 10),
         "드워프": (7, 2, 7, 4, 8), "엘프": (8, 1, 2, 9, 7), "비행족": (3, 7, 4, 6, 8),
         "고대종": (-1, 7, 7, 7, 8), "심해족": (2, 6, 6, 6, 8)}  # 엘프 7, 심해족 8, 고대종 8 (시뮬레이션으로 맞춘 임시값)
ZOMBIE = (3, 3, 3, 3)
TRAIN_COST = {"마족": 1.7, "고대종": 2}  # 기본 2
FAMILY = ["공격", "책략", "기동", "방어"]  # 앞이 뒤를 이김 (방어 > 공격)
FAMILY_STAT = {"공격": 3, "책략": 0, "기동": 1, "방어": 2}
YEAR_CAP = 20  # 20년 제한 규칙


def neighbors(p):
    y, x = p
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        if 0 <= y + dy < H and 0 <= x + dx < W:
            yield (y + dy, x + dx)


def passable(race, c):
    return MAP[c[0]][c[1]] in LAND or (race == "심해족" and MAP[c[0]][c[1]] in SEA)


def explore_cost(race, c):
    t = MAP[c[0]][c[1]]
    if race == "비행족" and t in "MR":
        return 0
    if race == "엘프" and t == "J":
        return 0
    if race == "심해족" and t in SEA:
        return 0
    return 2 if t in "M" or t in SEA else 1


class Nation:
    def __init__(self, name, race, castle, region):
        self.name, self.race, self.castle = name, race, castle
        s = RACES[race]
        self.stats = list(s[:4])
        self.grain = s[4] + region
        self.track = 5
        self.army = 0
        self.cells = {castle}
        self.alive = True


def fight(rng, a_stats, a_army, d_stats, d_army, a_race="", terrain=""):
    """전투 판정. 공격 쪽이 이기면 True."""
    rolls = []
    for army, other in ((a_army, d_army), (d_army, a_army)):
        dice = sorted(rng.randint(1, 6) for _ in range(4))
        rerolls = 2 if army >= 2 * max(other, 1) else 1 if army > other else 0
        for i in range(rerolls):  # 제일 낮은 주사위를 다시 굴림
            dice[i] = rng.randint(1, 6)
        rolls.append(sorted(dice))
    if a_race == "엘프" and terrain == "J":
        rolls[0][0] = max(rolls[0][0], rng.randint(1, 6))
    st = [list(a_stats), list(d_stats)]
    fam = [rng.choice(FAMILY), rng.choice(FAMILY)]
    for i in (0, 1):
        st[i][FAMILY_STAT[fam[i]]] += 2
        if FAMILY.index(fam[1 - i]) == (FAMILY.index(fam[i]) + 1) % 4:  # 상성 이김
            st[i][FAMILY_STAT[fam[i]]] += 2
    # 큰 주사위를 큰 스탯에 놓는 게 항상 최선
    score = [sum(s * d for s, d in zip(sorted(st[i]), rolls[i])) for i in (0, 1)]
    return score[0] > score[1]


def bfs_dist(race, sources, target):
    seen, q = set(sources), deque((s, 0) for s in sources)
    while q:
        c, d = q.popleft()
        if c == target:
            return d
        for n in neighbors(c):
            if n not in seen and (MAP[n[0]][n[1]] in LAND | SEA or n == target):  # 이동은 배가 있다고 보고 바다도 지나감
                seen.add(n)
                q.append((n, d + 1))
    return 999


def play(rng, n_players=4, log=None, snap=None):
    """snap에 리스트를 주면 해마다 지도·나라 상태를 담는다 (HTML 보기용)."""
    land = [(y, x) for y in range(H) for x in range(W) if MAP[y][x] in "LJFKR"]
    races = rng.sample(list(RACES), n_players)
    nations, castles = [], []
    for i, race in enumerate(races):
        for _ in range(500):
            c = rng.choice(land)
            if all(abs(c[0] - o[0]) + abs(c[1] - o[1]) >= 10 for o in castles):
                break
        castles.append(c)
        nations.append(Nation(f"P{i + 1}", race, c, rng.choice([3, 0, -2])))
    owner = {n.castle: n for n in nations}
    demon, zombies, dead_pool = None, 0, 0
    stats = {"castle_falls": [], "debt_years": 0, "grain": [], "army": [], "cells": []}

    def kill(k):
        nonlocal dead_pool, zombies
        dead_pool += k
        if demon:
            zombies += dead_pool // 2
            dead_pool %= 2

    def fall(winner, loser, year):
        nonlocal demon
        loser.alive = False
        for c in loser.cells:
            owner[c] = winner
            if winner:
                winner.cells.add(c)
        if winner:
            winner.grain += max(loser.grain, 0)
        kill(loser.army)  # 망한 나라 남은 군대: 미정이라 일단 좀비로
        loser.army = 0
        stats["castle_falls"].append(year)
        if demon is None:
            demon = loser
        if log is not None:
            log.append(f"  {year}년: {loser.name}({loser.race}) 멸망" + (f" ← {winner.name}" if winner else " ← 마왕"))

    def shot(year):
        if snap is None:
            return
        grid = "".join(str(nations.index(owner[(y, x)])) if owner.get((y, x)) and owner[(y, x)].alive else "."
                       for y in range(H) for x in range(W))
        events = [e.strip() for e in log if e.startswith("  ")] if log is not None else []
        if log is not None:
            log.clear()
        snap.append({"year": year, "grid": grid, "zombies": zombies, "demon": nations.index(demon) if demon else -1,
                     "events": events, "nations": [{"grain": n.grain, "army": n.army, "cells": len(n.cells),
                                                    "alive": n.alive} for n in nations]})

    shot(0)
    for year in range(1, YEAR_CAP + 1):
        alive = [n for n in nations if n.alive]
        if len(alive) <= 1:
            year -= 1
            break
        rng.shuffle(alive)
        for me in alive:
            for _ in range(2):  # 행동 2번
                if not me.alive:
                    break
                cost = TRAIN_COST.get(me.race, 2)
                frontier = {n for c in me.cells for n in neighbors(c) if passable(me.race, n)}
                enemies = [o for o in nations if o.alive and o is not me]
                # 1) 공격: 이동 범위 안의 적 성 > 붙어 있는 적 땅
                target = None
                if me.army >= 3 and enemies:
                    dice = min(me.army, 6) + (1 if me.race == "동물족" else 0)
                    reach = sum(rng.randint(1, 6) for _ in range(dice)) // 2
                    for o in sorted(enemies, key=lambda o: o.army):
                        if me.army > o.army and bfs_dist(me.race, me.cells, o.castle) <= reach:
                            target = o.castle
                            break
                    if target is None:
                        near = [c for c in frontier if owner.get(c) not in (None, me) and owner[c].alive
                                and owner[c].army < me.army]
                        target = rng.choice(near) if near else None
                if target:
                    o = owner[target]
                    win = fight(rng, me.stats, me.army, o.stats, o.army, me.race, MAP[target[0]][target[1]])
                    if win:
                        lost = o.army // 2
                        o.army -= lost
                        kill(lost)
                        if target == o.castle:
                            fall(me, o, year)
                        else:
                            o.cells.discard(target)
                            owner[target] = me
                            me.cells.add(target)
                    else:
                        lost = me.army // 2
                        me.army -= lost
                        kill(lost)
                    me.track = min(5, me.track + 2)
                    continue
                # 2) 탐사: 정복도가 되면 빈 칸 차지 (곡창·광산 먼저)
                free = [c for c in frontier if c not in owner and MAP[c[0]][c[1]] not in NEUTRAL
                        and explore_cost(me.race, c) <= me.track]
                want_army = 3 + year // 3
                if free and (me.army >= want_army or me.grain < cost):
                    c = max(free, key=lambda c: (MAP[c[0]][c[1]] in "FK", rng.random()))
                    me.track -= explore_cost(me.race, c)
                    owner[c] = me
                    me.cells.add(c)
                    continue
                # 3) 군대 양성 (빚이면 못 함)
                if me.grain >= cost:
                    k = int(me.grain * 0.7 // cost) or 1
                    me.grain -= k * cost
                    me.army += k
                me.track = min(5, me.track + 2)
        # 마왕: 행동 2번, 좀비로 군대가 제일 약한 나라의 성을 친다
        if demon:
            for _ in range(2):
                alive = [n for n in nations if n.alive]
                if zombies < 3 or len(alive) == 0:
                    break
                o = min(alive, key=lambda o: o.army)
                if fight(rng, ZOMBIE, zombies, o.stats, o.army):
                    lost = o.army // 2
                    o.army -= lost
                    kill(lost)
                    fall(None, o, year)
                else:
                    zombies -= zombies // 2
        # 연말
        for n in nations:
            if not n.alive:
                continue
            income = len(n.cells) + 5 * sum(MAP[c[0]][c[1]] == "F" for c in n.cells)
            income += 3 if n.race == "인간" else 0  # 교역: 연말 곡식 +3
            if n.grain < 0:
                income = max(income, 3)
                stats["debt_years"] += 1
            n.grain += income
        if year % 3 == 0:  # 재앙
            d = rng.choice(["전염병", "빙하기", "소행성", "화산", "없음"])
            for n in nations:
                if not n.alive:
                    continue
                if d == "전염병":
                    lost = n.army * rng.choice([20, 30, 40, 50, 60, 70]) // 100
                    n.army -= lost
                    kill(lost)
                elif d == "빙하기":
                    n.grain -= int(len(n.cells) * 0.7)
                elif d == "소행성":
                    for c in rng.sample(sorted(n.cells - {n.castle}), min(4, len(n.cells) - 1)):
                        n.cells.discard(c)
                        owner.pop(c, None)
                elif d == "화산":
                    lost = min(n.army, 10)
                    n.army -= lost
                    kill(lost)
            if log is not None and d != "없음":
                log.append(f"  {year}년 연말 재앙: {d}")
        alive = [n for n in nations if n.alive]
        stats["grain"].append(sum(n.grain for n in alive) / max(len(alive), 1))
        stats["army"].append(sum(n.army for n in alive) / max(len(alive), 1))
        stats["cells"].append(sum(len(n.cells) for n in alive) / max(len(alive), 1))
        if log is not None:
            log.append(f"{year:>2}년 | " + " | ".join(
                f"{n.name} {n.race} 곡식{n.grain} 땅{len(n.cells)} 군대{n.army}" for n in alive)
                + (f" | 마왕 좀비{zombies}" if demon else ""))
        shot(year)
    if snap is not None and snap[-1]["year"] != year:
        shot(year)
    alive = [n for n in nations if n.alive]
    if len(alive) == 1:
        result = alive[0].race
    elif not alive:
        result = "마왕"
    else:  # 20년 제한: 땅, 그다음 곡식
        result = max(alive, key=lambda n: (len(n.cells), n.grain)).race
    if snap is not None:
        snap.insert(0, {"castles": [list(n.castle) for n in nations], "races": races, "result": result})
    return year, result, races, stats


def export_html(games=20, players=4):
    """시뮬레이션_보기.html 에 판 여러 개를 넣어 브라우저로 볼 수 있게 만든다."""
    import json
    rng = random.Random()
    data = {"map": MAP, "games": []}
    for _ in range(games):
        snap = []
        play(rng, players, [], snap)
        head = snap.pop(0)
        data["games"].append({**head, "years": snap})
    here = Path(__file__).parent
    html = (here / "시뮬레이션_보기_틀.html").read_text(encoding="utf-8")
    out = here / "시뮬레이션_보기.html"
    out.write_text(html.replace("/*DATA*/null", json.dumps(data, ensure_ascii=False)), encoding="utf-8")
    print(f"ok: {out.name} ({games}판)")


def main():
    if "--html" in sys.argv:
        args = [a for a in sys.argv[1:] if not a.startswith("--")]
        return export_html(int(args[0]) if args else 20, int(args[1]) if len(args) > 1 else 4)
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    games = int(args[0]) if args else 200
    players = int(args[1]) if len(args) > 1 else 4
    rng = random.Random(1)
    years, results, falls, debt = [], {}, 0, 0
    picked = {r: 0 for r in RACES}
    won = {r: 0 for r in RACES}
    curves = []
    for g in range(games):
        log = [] if (g == 0 and "--log" in sys.argv) else None
        y, res, races, st = play(rng, players, log)
        if log:
            print("\n".join(log), "\n")
        years.append(y)
        results[res] = results.get(res, 0) + 1
        falls += len(st["castle_falls"])
        debt += st["debt_years"]
        curves.append(st)
        for r in races:
            picked[r] += 1
        if res in won:
            won[res] += 1
    finished = [y for y, c in zip(years, curves) if y < YEAR_CAP]
    print(f"판 수 {games}, 플레이어 {players}명, 연도 상한 {YEAR_CAP}년")
    print(f"20년 전에 끝난 판: {len(finished)}/{games}. 끝난 판의 평균 {sum(finished) / max(len(finished), 1):.1f}년, "
          f"가장 짧은 {min(finished, default=0)}년, 가장 긴 {max(finished, default=0)}년")
    print("결과:", ", ".join(f"{k} {v}" for k, v in sorted(results.items(), key=lambda kv: -kv[1])))
    print("종족 승률 (이긴 판 / 나온 판):")
    for r in RACES:
        print(f"  {r}: {won[r]}/{picked[r]} = {won[r] / max(picked[r], 1):.0%}")
    print(f"한 판 평균 성 함락 {falls / games:.1f}번, 빚진 나라-해 {debt / games:.1f}번")
    for y in (1, 5, 10, 20, 40):
        rows = [c for c in curves if len(c["grain"]) >= y]
        if rows:
            avg = lambda k: sum(c[k][y - 1] for c in rows) / len(rows)
            print(f"  {y:>2}년째 나라 평균: 곡식 {avg('grain'):.0f}, 땅 {avg('cells'):.0f}칸, 군대 {avg('army'):.0f}")


if __name__ == "__main__":
    main()
