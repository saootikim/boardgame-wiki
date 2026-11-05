// 보드게임: 나 1명 vs 컴퓨터 3명. 규칙은 노트(규칙/, 세계/, 카드/)를 따른다. 숫자는 rules.js.
"use strict";
const { W, H } = RULES;
const CELL = 20; // 화면 칸 크기 px (캔버스 안)
const COLORS = ["#e63946", "#3a86ff", "#2a9d3a", "#f4a20b"];
const NAMES = ["나", "컴퓨터 1", "컴퓨터 2", "컴퓨터 3"];
const T = DATA.terrain.map(r => r.split(""));
const key = (x, y) => y * W + x;
const xy = k => [k % W, Math.floor(k / W)];
const ter = k => T[Math.floor(k / W)][k % W];
const d6 = () => 1 + Math.floor(Math.random() * 6);
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const SEA = new Set([".", "D", "S", "B"]);
const CASTLE_OK = "LJRFMKUI"; // 성을 놓을 수 있는 땅
const sleep = ms => new Promise(r => setTimeout(r, G.fast ? 0 : ms));

// 전술 카드 효과 (전술카드.md 표를 옮김). s = 스탯 번호(0 지능,1 정복력,2 HP,3 공격력), v = 올리는 값
const TFX = {
  "정면 공격": { s: 3, v: 2 }, "돌격": { s: 3, v: 3, loseExtra: 5 }, "기습": { s: 3, v: 4, cond: "attacker" },
  "방진": { s: 2, v: 2 }, "농성": { s: 2, v: 4, cond: "defCastle" }, "후퇴": { s: 2, v: 0, halfLoss: true },
  "계략": { s: 0, v: 2 }, "매복": { s: 0, v: 4, cond: "jungleMountain" }, "첩보": { s: 0, v: 1, rerollOwn: true },
  "측면 공격": { s: 1, v: 2 }, "강행군": { s: 1, v: 1, extraCell: true }, "도하": { s: 1, v: 4, cond: "water" },
  "일제 사격": { s: 3, v: 1, oppHP: -1 }, "화공": { s: 3, v: 4, cond: "jungleFarm" }, "광전사": { s: 3, v: 4, ownHP: -2 },
  "방패벽": { s: 2, v: 3, noExtra: true }, "참호": { s: 2, v: 3, cond: "defOwnLand" }, "산악 수비": { s: 2, v: 4, cond: "defMountain" },
  "위장 퇴각": { s: 0, v: 1, halveOpp: true }, "야습": { s: 0, v: 2, oppReroll: true }, "보급 차단": { s: 0, v: 1, blockTrain: true },
  "기병 돌파": { s: 1, v: 3, loseExtra: 3 }, "해상 상륙": { s: 1, v: 4, cond: "seaToLand" }, "우회": { s: 1, v: 1 },
};
const TACT = Object.fromEntries(DATA.tactics.map(c => [c.name, c]));

const G = {
  year: 1, nations: [], owner: new Map(), demon: null, deadPool: 0, eventZombies: [], log: [],
  climate: null, effects: {}, nextEffects: {}, decks: {}, hegemon: null, fast: false, mode: null, over: false,
  forts: new Set(), pending: null, sel: null, reach: null, nextStackId: 1, islands: [], hover: null,
};

// ---------- 준비 ----------
function makeNation(i, race, human) {
  const r = RULES.races[race];
  const region = pick(RULES.regionCard);
  return {
    id: i, name: NAMES[i], race, human, color: COLORS[i], stats: r.slice(0, 4), grain: r[4] + region, region,
    track: RULES.trackStart, cells: new Set(), castle: null, stacks: [], hand: [], alive: true, falls: 0,
    demonSide: false, noTrainYear: 0, curses: [], ship: false,
  };
}
function newDecks() {
  G.decks.tactics = shuffle(DATA.tactics.map(c => c.name));
  G.decks.climate = shuffle(DATA.climate.slice());
  G.decks.disaster = shuffle(DATA.disaster.slice());
  G.decks.curses = [];
}
function draw(deck) {
  if (deck === "tactics" && !G.decks.tactics.length) G.decks.tactics = shuffle(DATA.tactics.map(c => c.name));
  if (deck === "climate" && !G.decks.climate.length) G.decks.climate = shuffle(DATA.climate.slice());
  if (deck === "disaster" && !G.decks.disaster.length) G.decks.disaster = shuffle(DATA.disaster.slice());
  if (deck === "curses" && !G.decks.curses.length) G.decks.curses = shuffle(DATA.curses.concat(DATA.curses).map(c => c.name));
  return G.decks[deck].pop();
}
function landCells() {
  const out = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ("LJRF".includes(T[y][x])) out.push(key(x, y));
  return out;
}
function dist(a, b) { const [ax, ay] = xy(a), [bx, by] = xy(b); return Math.abs(ax - bx) + Math.abs(ay - by); }
function neighbors(k) {
  const [x, y] = xy(k), out = [];
  if (x > 0) out.push(k - 1); if (x < W - 1) out.push(k + 1); if (y > 0) out.push(k - W); if (y < H - 1) out.push(k + W);
  return out;
}
function placeCastle(n, k) {
  n.castle = k; n.cells.add(k); G.owner.set(k, n.id);
}
function findIslands() {
  // 버뮤다에서 떠밀려 가는 섬 3개: 버뮤다에 가장 가까운 섬(작은 땅 덩어리) 칸
  const seen = new Set(), blobs = [];
  for (const k of landCells()) {
    if (seen.has(k)) continue;
    const q = [k], blob = []; seen.add(k);
    while (q.length) { const c = q.pop(); blob.push(c); for (const n of neighbors(c)) if (!seen.has(n) && !SEA.has(ter(n)) && ter(n) !== "U") { seen.add(n); q.push(n); } }
    if (blob.length <= 40) blobs.push(blob);
  }
  const center = DATA.terrain.join("").indexOf("S");
  blobs.sort((a, b) => dist(a[0], center) - dist(b[0], center));
  G.islands = blobs.slice(0, 3).map(b => b[0]);
}

// ---------- 기록·화면 ----------
function log(msg, cls = "") { G.log.push({ y: G.year, msg, cls }); renderLog(); }
const $ = id => document.getElementById(id);
const cv = $("map"), ctx = cv.getContext("2d");
cv.width = W * CELL; cv.height = H * CELL;
const mapImg = new Image(), mapCv = document.createElement("canvas"); // 지도를 한 번만 줄여 둠 (매번 큰 그림을 그리면 느림)
mapCv.width = cv.width; mapCv.height = cv.height;
mapImg.onload = () => { mapCv.getContext("2d").drawImage(mapImg, 0, 0, cv.width, cv.height); mapImg.ready = true; render(); };
mapImg.src = "assets/map.jpg";

function render() {
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (mapImg.ready) ctx.drawImage(mapCv, 0, 0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = key(x, y);
    if (T[y][x] === "X") { ctx.fillStyle = "rgba(20,20,20,.75)"; ctx.fillRect(x * CELL, y * CELL, CELL, CELL); }
    if (T[y][x] === "H") { ctx.fillStyle = "rgba(150,0,40,.45)"; ctx.fillRect(x * CELL, y * CELL, CELL, CELL); }
    const o = G.owner.get(k);
    if (o !== undefined) { ctx.globalAlpha = .45; ctx.fillStyle = G.nations[o].color; ctx.fillRect(x * CELL, y * CELL, CELL, CELL); ctx.globalAlpha = 1; }
  }
  if (G.reach) {
    for (const [k, kind] of G.reach) {
      const [x, y] = xy(k);
      ctx.fillStyle = kind === "fight" ? "rgba(255,60,60,.55)" : "rgba(255,235,59,.45)";
      ctx.fillRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4);
      if (kind === "fight") { ctx.strokeStyle = "#ff3b3b"; ctx.lineWidth = 3; ctx.strokeRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2); }
    }
  }
  if ((G.mode === "explore" || G.mode === "fort") && G.pending) {
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
    for (const k of G.pending) { const [x, y] = xy(k); ctx.strokeRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4); }
  }
  // 마계 이름표
  const hs = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (T[y][x] === "H") hs.push([x, y]);
  if (hs.length) {
    const cx = hs.reduce((a, p) => a + p[0], 0) / hs.length, cy = Math.min(...hs.map(p => p[1]));
    ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 4; ctx.strokeStyle = "#000"; ctx.fillStyle = "#ff8a8a";
    ctx.strokeText("마계", (cx + .5) * CELL, cy * CELL - 4); ctx.fillText("마계", (cx + .5) * CELL, cy * CELL - 4);
  }
  for (const k of G.forts) {
    const [x, y] = xy(k); ctx.fillStyle = "#ddd"; ctx.strokeStyle = "#333"; ctx.lineWidth = 2;
    ctx.fillRect(x * CELL + 4, y * CELL + 4, CELL - 8, CELL - 8); ctx.strokeRect(x * CELL + 4, y * CELL + 4, CELL - 8, CELL - 8);
  }
  for (const n of G.nations) if (n.castle !== null) {
    const [x, y] = xy(n.castle);
    ctx.fillStyle = n.alive ? n.color : "#333"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
    ctx.fillRect(x * CELL - 3, y * CELL - 3, CELL + 6, CELL + 6); ctx.strokeRect(x * CELL - 3, y * CELL - 3, CELL + 6, CELL + 6);
    ctx.fillStyle = "#fff"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(n.alive ? "城" : "✕", x * CELL + CELL / 2, y * CELL + CELL / 2 + 1);
  }
  const stacks = [];
  for (const n of G.nations) if (n.alive) for (const s of n.stacks) stacks.push([s, n.color, n.id]);
  if (G.demon) for (const s of G.demon.zombies) stacks.push([s, "#5b1a1a", "Z"]);
  for (const z of G.eventZombies) stacks.push([z, "#222", "E"]);
  for (const [s, color] of stacks) {
    const [x, y] = xy(s.pos), cx = x * CELL + CELL / 2, cy = y * CELL + CELL / 2;
    ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = G.sel === s ? 4 : 2; ctx.strokeStyle = G.sel === s ? "#ffeb3b" : "#fff"; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(s.n), cx, cy + 1);
  }
  if (G.hover !== null) {
    const [x, y] = xy(G.hover); ctx.strokeStyle = "#ffeb3b"; ctx.lineWidth = 2; ctx.strokeRect(x * CELL, y * CELL, CELL, CELL);
  }
  if (G.nations.length) renderPanel();
}

function score(n) {
  return n.cells.size * RULES.score.cell + n.falls * RULES.score.fall + (n.alive ? RULES.score.ownCastle : 0);
}
function army(n) { return n.stacks.reduce((a, s) => a + s.n, 0); }
function me() { return G.nations[0]; }

function renderPanel() {
  const m = me();
  const eff = Object.keys(G.effects).filter(k => G.effects[k]).map(effName).filter(Boolean);
  $("year").textContent = `${G.year}년 / ${RULES.yearCap}년`;
  $("climate").innerHTML = (G.climate ? `기후: <b>${G.climate.name}</b> — ${G.climate.text}` : "기후: 없음") +
    (eff.length ? `<br>재앙·효과: ${eff.join(", ")}` : "") + (G.hegemon !== null ? `<br>패권국: <b style="color:${G.nations[G.hegemon].color}">${G.nations[G.hegemon].name}</b>` : "");
  $("nations").innerHTML = G.nations.map(n => `
    <div class="nrow ${n.alive ? "" : "dead"}"><span class="sw" style="background:${n.color}"></span>
    <b>${n.name}</b> ${n.race}${n === G.demonPlayer ? " · 마왕" : n.demonSide ? " · 마왕 편" : !n.alive ? " · 멸망" : ""}
    <span class="nums">곡식 ${n.grain} · 땅 ${n.cells.size} · 군대 ${army(n)} · 승점 ${n.alive ? score(n) : "-"}</span></div>`).join("") +
    (G.demon ? `<div class="nrow"><span class="sw" style="background:#5b1a1a"></span><b>마왕</b> (${G.demonPlayer.name}) <span class="nums">좀비 ${G.demon.zombies.reduce((a, s) => a + s.n, 0)}</span></div>` : "");
  $("me").innerHTML = `<b style="color:${m.color}">${m.name} · ${m.race}</b> <span class="muted">${RULES.raceAbility[m.race]}</span><br>
    스탯 지능 ${m.stats[0]} · 정복력 ${m.stats[1]} · HP ${m.stats[2]} · 공격력 ${m.stats[3]}<br>
    곡식 <b>${m.grain}</b>${m.grain < 0 ? " (빚)" : ""} · 땅 ${m.cells.size}칸 · 군대 ${army(m)} · 승점 ${score(m)} · 배 ${m.ship || m.race === "심해족" ? "있음" : "없음"}<br>
    정복도 <span class="track">${[...Array(RULES.trackMax)].map((_, i) => `<i class="${i < m.track ? "on" : ""}"></i>`).join("")}</span> ${m.track}/${RULES.trackMax}`;
  $("hand").innerHTML = m.hand.length ? m.hand.map(c => cardImg(TACT[c], "small")).join("") : '<span class="muted">전술 카드 없음 (광산·상점·신전에서 얻음)</span>';
  $("curses").innerHTML = m.curses.length ? m.curses.map((c, i) => `<button class="curse" data-i="${i}">${c} 쓰기</button>`).join("") : "";
  $("curses").querySelectorAll(".curse").forEach(b => b.onclick = () => humanCurse(+b.dataset.i));
  $("acts").textContent = G.turn === m && G.actionsLeft > 0 ? `내 차례 · 남은 행동 ${G.actionsLeft}` : G.turn ? `${G.turn.name} 차례` : "";
  const myTurn = G.turn === m && G.actionsLeft > 0 && !G.busy;
  document.querySelectorAll("#actions button").forEach(b => b.disabled = !myTurn);
  if (myTurn && m === G.demonPlayer) document.querySelectorAll("#actions button:not([data-demon])").forEach(b => b.disabled = true);
  const ti = $("info");
  if (G.hover !== null) {
    const k = G.hover, t = ter(k), o = G.owner.get(k);
    const stack = stackAt(k);
    ti.textContent = `${xy(k)[0] + 1},${xy(k)[1] + 1} · ${RULES.terrain[t][0]}${o !== undefined ? " · " + G.nations[o].name + " 땅" : ""}${stack ? ` · 군대 ${stack.s.n} (${stack.owner})` : ""}`;
  }
}
function effName(k) {
  return { quake: "지진(전쟁·차지 금지)", volcano: "화산(산 금지)", heat: "폭염(탐사 +1)", cold: "한파(탐사 +1)", sloth: "나태(탐사 +1)", ice: "빙하기(연말 -5)", drought: "가뭄(연말 -3)", greed: "탐욕(상점·광산 금지)" }[k];
}
function cardImg(c, cls = "") {
  return `<figure class="card ${cls}"><img src="${c.img}" alt=""><figcaption><b>${c.name}</b><br>${c.text}</figcaption></figure>`;
}
function renderLog() {
  $("log").innerHTML = G.log.slice(-80).reverse().map(l => `<li class="${l.cls}"><span class="muted">${l.y}년</span> ${l.msg}</li>`).join("");
}

// ---------- 모달 ----------
function modal(html, buttons) {
  return new Promise(res => {
    $("modalBody").innerHTML = html;
    const bar = $("modalBtns"); bar.innerHTML = "";
    for (const [label, val, cls] of buttons) {
      const b = document.createElement("button"); b.textContent = label; if (cls) b.className = cls;
      b.onclick = () => { $("modal").hidden = true; res(val); }; bar.appendChild(b);
    }
    $("modal").hidden = false;
  });
}
async function showCard(c, title) {
  if (G.fast && !title.includes("나")) { log(`${title}: ${c.name} — ${c.text}`, "card"); return; }
  log(`${title}: ${c.name} — ${c.text}`, "card");
  await modal(`<h3>${title}</h3>${cardImg(c, "big")}`, [["확인", 1, "primary"]]);
}

// ---------- 지형·비용 ----------
function exploreCost(n, k) {
  const t = ter(k), base = RULES.terrain[t][1];
  if (base === null) return null;
  let c = base;
  if (SEA.has(t) && n.ship) c = 1;
  if (n.race === "비행족" && "MR".includes(t)) c = 0;
  if (n.race === "엘프" && t === "J") c = 0;
  if (n.race === "심해족" && SEA.has(t)) c = 0;
  if (G.climate?.name === "비" && t === "R") c += 1;
  if (G.climate?.name === "강풍" && SEA.has(t)) c += 1;
  if (G.climate?.name === "오로라" && t === "U") c = 0;
  for (const e of ["heat", "cold", "sloth"]) if (G.effects[e]) c += 1;
  if (G.effects.volcano && t === "M") return null;
  return c;
}
function exploreTargets(n) {
  if (G.effects.quake) return [];
  const out = new Set();
  for (const c of n.cells) for (const k of neighbors(c)) {
    if (G.owner.has(k)) continue;
    const cost = exploreCost(n, k);
    if (cost !== null && cost <= n.track && (ter(k) !== "F" || n.grain >= RULES.farmClaimCost)) out.add(k);
  }
  return [...out];
}
function stackAt(k) {
  for (const n of G.nations) if (n.alive) for (const s of n.stacks) if (s.pos === k) return { s, nation: n, owner: n.name };
  if (G.demon) for (const s of G.demon.zombies) if (s.pos === k) return { s, nation: "demon", owner: "마왕 좀비" };
  for (const s of G.eventZombies) if (s.pos === k) return { s, nation: "event", owner: "좀비사태" };
  return null;
}
function canStand(side, k) {
  const t = ter(k);
  if (t === "X") return false;
  if (t === "H") return side === "demon";
  if (G.effects.volcano && t === "M") return false;
  if (t === "S") return true;
  if (SEA.has(t)) return canSail(side); // 배가 있으면 바다 위에서 멈췄다가 다음 차례에 이어서 건넘
  return true;
}
function canSail(side) { return side !== "demon" && side !== "event" && (side.race === "심해족" || side.ship); }
function passable(k, side) {
  const t = ter(k);
  if (t === "X") return false;
  if (SEA.has(t) && t !== "S" && side !== undefined && !canSail(side)) return false;
  if (G.effects.volcano && t === "M") return false;
  return true;
}
function moveDice(side, stack) {
  let n = Math.min(stack.n, RULES.maxMoveDice);
  if (side.race === "동물족") n += 1;
  if (G.climate?.name === "눈") n -= 1;
  return Math.max(1, n);
}
// 이동 범위: 주사위 합만큼. 남의 군대가 있는 칸은 지나가지 못하고 그 칸에 멈추면 전투. 버뮤다에 들어가면 멈춤.
function reachable(side, stack, steps) {
  const out = new Map(), q = [[stack.pos, 0]], seen = new Set([stack.pos]);
  while (q.length) {
    const [c, d] = q.shift();
    if (d === steps) continue;
    for (const nb of neighbors(c)) {
      if (seen.has(nb) || !passable(nb, side)) continue;
      seen.add(nb);
      const other = stackAt(nb);
      const mine = other && other.nation === side;
      if (other && !mine) { if (!(G.effects.quake)) out.set(nb, "fight"); continue; }
      const castleOf = G.nations.find(n => n.alive && n.castle === nb && n !== side);
      if (castleOf) { if (!G.effects.quake) out.set(nb, "fight"); continue; } // 성은 비어 있어도 전투로만 함락
      if (ter(nb) === "B") { out.set(nb, "bermuda"); continue; }
      if (canStand(side, nb)) out.set(nb, "move");
      q.push([nb, d + 1]);
    }
  }
  return out;
}

// ---------- 전투 ----------
function cardFx(name, ctx, isAtt) {
  if (!name) return null;
  const fx = TFX[name];
  let ok = true;
  const t = ter(ctx.target), src = ter(ctx.from);
  if (fx.cond === "attacker") ok = isAtt;
  if (fx.cond === "defCastle") ok = !isAtt && (ctx.isCastle || G.forts.has(ctx.target));
  if (fx.cond === "defOwnLand") ok = !isAtt && ctx.defOwnsCell;
  if (fx.cond === "defMountain") ok = !isAtt && t === "M";
  if (fx.cond === "jungleMountain") ok = "JM".includes(t);
  if (fx.cond === "jungleFarm") ok = "JF".includes(t);
  if (fx.cond === "water") ok = "R".includes(t) || SEA.has(src) || src === "R";
  if (fx.cond === "seaToLand") ok = isAtt && SEA.has(src) && !SEA.has(t);
  return { ...fx, name, ok, family: TACT[name].family };
}
// side: {label, stats, n, human, nation, hand}
async function battle(att, def, ctx) {
  const rolls = [att, def].map(() => [d6(), d6(), d6(), d6()].sort((a, b) => a - b));
  const rr = [0, 0];
  rr[0] += att.n >= 2 * Math.max(def.n, 1) ? 2 : att.n > def.n ? 1 : 0;
  rr[1] += def.n >= 2 * Math.max(att.n, 1) ? 2 : def.n > att.n ? 1 : 0;
  if (G.hegemon !== null) { if (def.nation?.id === G.hegemon) rr[0]++; if (att.nation?.id === G.hegemon) rr[1]++; }
  if (G.climate?.name === "번개 치는") rr[1]++;
  if (att.nation?.race === "엘프" && ter(ctx.target) === "J") rr[0]++;
  for (const i of [0, 1]) { for (let j = 0; j < rr[i]; j++) rolls[i][j] = d6(); rolls[i].sort((a, b) => a - b); }
  // 전술 카드 (전투는 모두 소모전)
  const cards = [null, null];
  for (const [i, s] of [[0, att], [1, def]]) {
    if (!s.hand?.length) continue;
    if (s.human) cards[i] = await chooseCard(s, rolls, att, def, i === 0);
    else cards[i] = aiCard(s, ctx, i === 0);
    if (cards[i]) s.hand.splice(s.hand.indexOf(cards[i]), 1);
  }
  const fx = [cardFx(cards[0], ctx, true), cardFx(cards[1], ctx, false)];
  const st = [att.stats.slice(), def.stats.slice()];
  const fam = RULES.family;
  for (const i of [0, 1]) {
    const f = fx[i], o = fx[1 - i];
    if (!f) continue;
    let bonus = f.ok ? f.v : 0;
    if (o?.halveOpp && o.ok !== false) bonus = Math.floor(bonus / 2);
    if (o && fam.indexOf(o.family) === (fam.indexOf(f.family) + 1) % 4) bonus += RULES.counterBonus;
    st[i][f.s] += bonus;
    if (f.ok && f.ownHP) st[i][2] += f.ownHP;
    if (f.ok && f.oppHP) st[1 - i][2] += f.oppHP;
    if (f.ok && f.rerollOwn) { rolls[i][0] = d6(); rolls[i].sort((a, b) => a - b); }
    if (f.ok && f.oppReroll) { rolls[1 - i][3] = d6(); rolls[1 - i].sort((a, b) => a - b); }
  }
  // 주사위 배치
  const place = [null, null];
  for (const [i, s] of [[0, att], [1, def]]) {
    if (s.human) place[i] = await placeDice(s, rolls[i], st[i], st[1 - i], rolls[1 - i], cards, i);
    else place[i] = autoPlace(rolls[i], st[i]);
  }
  const score = [0, 1].map(i => place[i].reduce((a, d, j) => a + d * st[i][j], 0));
  const attWin = score[0] > score[1];
  const line = i => RULES.stat.map((nm, j) => `${nm} ${st[i][j]}×${place[i][j]}`).join(" + ") + ` = ${score[i]}`;
  const text = `${att.label}(${att.n}) vs ${def.label}(${def.n}) — ${attWin ? att.label : def.label} 승리 (${score[0]} : ${score[1]})`;
  log(text + (cards[0] || cards[1] ? ` · 카드 ${cards[0] || "없음"} / ${cards[1] || "없음"}` : ""), "fight");
  if (att.human || def.human) {
    await modal(`<h3>전투 결과</h3><p><b>${att.label}</b>${cards[0] ? ` [${cards[0]}]` : ""}<br>${line(0)}</p>
      <p><b>${def.label}</b>${cards[1] ? ` [${cards[1]}]` : ""}<br>${line(1)}</p><h3>${attWin ? att.label : def.label} 승리</h3>`, [["확인", 1, "primary"]]);
  }
  const loserFx = fx[attWin ? 1 : 0], winnerFx = fx[attWin ? 0 : 1];
  return { attWin, loserFx, winnerFx };
}
function lossOf(n, f) {
  let lost = Math.floor(n / 2);
  if (f?.halfLoss) lost = Math.floor(lost / 2);
  if (f?.loseExtra) lost += f.loseExtra;
  return Math.min(n, lost);
}
function autoPlace(roll, stats) {
  const order = [0, 1, 2, 3].sort((a, b) => stats[a] - stats[b]);
  const out = [0, 0, 0, 0];
  order.forEach((s, i) => out[s] = roll[i]);
  return out;
}
function aiCard(s, ctx, isAtt) {
  let best = null, bv = 0;
  for (const c of s.hand) { const f = cardFx(c, ctx, isAtt); const v = f.ok ? f.v : 0; if (v > bv) { bv = v; best = c; } }
  return best;
}
function chooseCard(s, rolls, att, def, isAtt) {
  return new Promise(res => {
    const html = `<h3>전술 카드 고르기 (뒤집어 낸 뒤 동시에 공개)</h3>
      <p>내 주사위 ${rolls[isAtt ? 0 : 1].join(" ")} · 상대 ${att.label === s.label ? def.label : att.label} 군대 ${isAtt ? def.n : att.n}</p>
      <div class="cards">${s.hand.map((c, i) => `<button class="cardbtn" data-i="${i}">${cardImg(TACT[c], "small")}</button>`).join("")}</div>`;
    $("modalBody").innerHTML = html;
    $("modalBtns").innerHTML = '<button id="noCard">안 냄</button>';
    $("modal").hidden = false;
    $("modalBody").querySelectorAll(".cardbtn").forEach(b => b.onclick = () => { $("modal").hidden = true; res(s.hand[+b.dataset.i]); });
    $("noCard").onclick = () => { $("modal").hidden = true; res(null); };
  });
}
function placeDice(s, roll, stats, oppStats, oppRoll, cards, i) {
  return new Promise(res => {
    const slots = [null, null, null, null]; let picked = null;
    const draw = () => {
      const used = new Set(slots.filter(v => v !== null));
      $("modalBody").innerHTML = `<h3>주사위 배치</h3>
        <p>카드: 나 <b>${cards[i] || "없음"}</b> / 상대 <b>${cards[1 - i] || "없음"}</b> (카드와 상성 보너스가 스탯에 들어가 있음)</p>
        <p>주사위를 누르고 스탯을 눌러 놓는다. 점수 = 스탯 × 주사위의 합.</p>
        <div class="dice">${roll.map((d, j) => `<button class="die ${used.has(j) ? "used" : ""} ${picked === j ? "pick" : ""}" data-j="${j}">${d}</button>`).join("")}</div>
        <div class="slots">${RULES.stat.map((nm, j) => `<button class="slot" data-s="${j}">${nm} ${stats[j]}<br><b>${slots[j] === null ? "?" : "×" + roll[slots[j]]}</b></button>`).join("")}</div>
        <p class="muted">상대 스탯 ${oppStats.join("/")} · 상대 주사위 ${oppRoll.join(" ")}</p>`;
      $("modalBody").querySelectorAll(".die").forEach(b => b.onclick = () => { if (!used.has(+b.dataset.j)) { picked = +b.dataset.j; draw(); } });
      $("modalBody").querySelectorAll(".slot").forEach(b => b.onclick = () => {
        const sIdx = +b.dataset.s;
        if (picked !== null) { slots[sIdx] = picked; picked = null; } else slots[sIdx] = null;
        draw();
      });
      const full = slots.every(v => v !== null);
      $("modalBtns").innerHTML = `<button id="autoP">자동 배치</button><button id="okP" class="primary" ${full ? "" : "disabled"}>확정</button>`;
      $("autoP").onclick = () => { const a = autoPlace(roll, stats); const idx = [0, 1, 2, 3]; a.forEach((v, j) => { const k = idx.findIndex(t => t !== null && roll[t] === v); slots[j] = idx[k]; idx[k] = null; }); draw(); };
      $("okP").onclick = () => { $("modal").hidden = true; res(slots.map(t => roll[t])); };
    };
    $("modal").hidden = false; draw();
  });
}
function sideOf(n, stack) {
  return { label: n.name, stats: n.stats, n: stack ? stack.n : 0, human: n.human && n.alive, nation: n, hand: n.hand };
}
function zombieSide(stack, ev) {
  const hum = !ev && G.demonPlayer?.human;
  return { label: ev ? "좀비사태" : "마왕 좀비", stats: ev ? RULES.eventZombie : RULES.zombie, n: stack.n, human: hum, nation: null, hand: hum ? G.demonPlayer.hand : [] };
}
function kill(n) {
  if (n <= 0) return;
  G.deadPool += n;
  if (G.demon) { addZombies(G.deadPool); G.deadPool = 0; }
}
function addZombies(n) {
  if (!G.demon || n <= 0) return;
  let s = G.demon.zombies.find(z => z.pos === G.demon.home);
  if (!s) { s = { id: G.nextStackId++, pos: G.demon.home, n: 0 }; G.demon.zombies.push(s); }
  s.n += n;
}
function removeStack(owner, s) {
  const arr = owner === "demon" ? G.demon.zombies : owner === "event" ? G.eventZombies : owner.stacks;
  const i = arr.indexOf(s); if (i >= 0) arr.splice(i, 1);
}
function retreat(n, s) {
  // 진 군대가 남으면 가까운 내 땅으로 물러남 (게임에서 정함)
  const opts = [...n.cells].filter(k => !stackAt(k) && canStand(n, k));
  if (!opts.length) { const c = n.stacks.find(t => t !== s && t.pos === n.castle); if (c) { c.n += s.n; removeStack(n, s); } return; }
  opts.sort((a, b) => dist(a, s.pos) - dist(b, s.pos));
  s.pos = opts[0];
}

// 이동 후 전투. mover: 나라 또는 "demon"/"event"
async function attack(mover, stack, target) {
  const def = stackAt(target);
  const defNation = def ? def.nation : G.nations[G.owner.get(target)];
  const ctx = { target, from: stack.pos, isCastle: defNation?.castle === target, defOwnsCell: defNation && defNation !== "demon" && defNation !== "event" && G.owner.get(target) === defNation.id };
  const A = mover === "demon" ? zombieSide(stack, false) : mover === "event" ? zombieSide(stack, true) : sideOf(mover, stack);
  let D;
  if (def) D = def.nation === "demon" ? zombieSide(def.s, false) : def.nation === "event" ? zombieSide(def.s, true) : sideOf(def.nation, def.s);
  else D = sideOf(defNation, null);
  G.lastGuard = def ? def.s.n : 0;
  const r = await battle(A, D, ctx);
  if (r.attWin) {
    if (def) {
      if (mover === "demon" && def.nation !== "demon" && def.nation !== "event") { stack.n += def.s.n; removeStack(def.nation, def.s); }
      else { const lost = lossOf(def.s.n, r.loserFx); def.s.n -= lost; if (def.nation !== "demon" && def.nation !== "event") kill(lost); if (def.s.n <= 0) removeStack(def.nation, def.s); else if (def.nation !== "demon" && def.nation !== "event") retreat(def.nation, def.s); else removeStack(def.nation, def.s); }
    }
    stack.pos = target;
    if (defNation && defNation !== "demon" && defNation !== "event") {
      if (defNation.castle === target) await fallCastle(mover, defNation);
      else if (G.owner.get(target) === defNation.id) { defNation.cells.delete(target); G.owner.delete(target); if (mover !== "demon" && mover !== "event") claim(mover, target); }
    }
    if (mover !== "demon" && mover !== "event" && r.winnerFx?.extraCell && r.winnerFx.ok && !r.loserFx?.noExtra) {
      const ex = neighbors(target).find(k => !G.owner.has(k) && RULES.terrain[ter(k)][1] !== null && !SEA.has(ter(k)));
      if (ex !== undefined) claim(mover, ex);
    }
    if (r.winnerFx?.blockTrain && r.winnerFx.ok && defNation?.noTrainYear !== undefined) defNation.noTrainYear = G.year + 1;
  } else {
    const lost = lossOf(stack.n, r.loserFx);
    stack.n -= lost;
    if (mover !== "demon" && mover !== "event") kill(lost);
    if (stack.n <= 0) removeStack(mover, stack);
    if (r.winnerFx?.blockTrain && r.winnerFx.ok && mover.noTrainYear !== undefined) mover.noTrainYear = G.year + 1;
  }
  render();
}
function claim(n, k) { G.owner.set(k, n.id); n.cells.add(k); }
function coastal(n) { return [...n.cells].some(c => neighbors(c).some(k => ter(k) === ".")); }
function buildCost(n, what) { return what === "fort" ? (n.race === "드워프" ? RULES.fortCost / 2 : RULES.fortCost) : RULES.shipCost; }

async function fallCastle(winner, loser) {
  loser.alive = false;
  const wNation = winner !== "demon" && winner !== "event" ? winner : null;
  const guard = G.lastGuard ?? 1;
  log(`${loser.name}(${loser.race})의 성이 함락됐다! ← ${wNation ? wNation.name : winner === "demon" ? "마왕" : "좀비사태"}${guard === 0 ? " (성에 지키는 군대가 없었음)" : ""}`, "big");
  for (const c of loser.cells) { G.owner.delete(c); if (wNation) claim(wNation, c); }
  loser.cells.clear();
  const rest = army(loser);
  if (wNation) {
    wNation.grain += Math.max(loser.grain, 0); wNation.falls++;
    const s = wNation.stacks.find(t => t.pos === loser.castle) || wNation.stacks[0];
    if (s) s.n += Math.floor(rest / 2);
    kill(rest - Math.floor(rest / 2));
  } else kill(rest);
  loser.stacks = [];
  loser.grain = 0;
  if (!G.demon) {
    const home = DATA.terrain.join("").indexOf("H");
    G.demon = { zombies: [], home: home >= 0 ? home : loser.castle };
    G.demonPlayer = loser;
    log(`${loser.name}은(는) 마왕이 되어 마계에서 다시 플레이한다.`, "big");
    addZombies(G.deadPool); G.deadPool = 0;
    if (loser.human) await modal(`<h3>나라가 망했다</h3><p>마왕이 되어 마계에서 다시 플레이한다. 죽은 군대는 좀비로 부활한다 (1:1). 행동 2번으로 좀비를 움직여 남은 나라의 성을 모두 부수면 이긴다. 매년 저주 카드 ${RULES.curseCardsPerYear}장을 쓴다.</p>`, [["계속", 1, "primary"]]);
  } else {
    loser.demonSide = true;
    log(`${loser.name}은(는) 마왕 편이 된다.`, "big");
    if (loser.human) await modal(`<h3>나라가 망했다</h3><p>마왕 편이 되어 매년 저주 카드 ${RULES.curseCardsPerYear}장을 쓴다. 마왕이 이기면 함께 이긴다.</p>`, [["계속", 1, "primary"]]);
  }
}

// ---------- 행동 ----------
function endAction(n, explore) {
  if (!explore) n.track = Math.min(RULES.trackMax, n.track + RULES.trackGain);
  G.actionsLeft--;
  render();
}
async function doExplore(n, k) {
  const cost = exploreCost(n, k);
  n.track -= cost;
  if (ter(k) === "F") n.grain -= RULES.farmClaimCost;
  if (ter(k) === "U") {
    const kind = pick(["상인", "공격적", "친근함"]);
    log(`${n.name}: 미개발지 원주민 — ${kind}`);
    if (kind === "상인") {
      if (n.grain < RULES.nativeMerchantCost) { log(`${n.name}: 곡식이 모자라 차지 못함`); return; }
      n.grain -= RULES.nativeMerchantCost;
    } else if (kind === "공격적") {
      const s = n.stacks.slice().sort((a, b) => dist(a.pos, k) - dist(b.pos, k))[0];
      const A = sideOf(n, s || { n: 0 });
      const r = await battle(A, { label: "원주민", stats: RULES.native, n: RULES.nativeArmy, human: false, hand: [] }, { target: k, from: k });
      if (!r.attWin) { if (s) { const l = lossOf(s.n, r.loserFx); s.n -= l; kill(l); if (s.n <= 0) removeStack(n, s); } return; }
    } else n.grain += RULES.nativeFriendlyGrain;
  }
  claim(n, k);
  log(`${n.name}: ${RULES.terrain[ter(k)][0]} 칸 차지`);
}
function doTrain(n, count) {
  const cost = count * RULES.trainCost;
  n.grain -= cost;
  const total = count + (n.race === "마족" ? Math.floor(count / RULES.majokBonusEvery) : 0);
  let s = n.stacks.find(t => t.pos === n.castle);
  if (!s) { s = { id: G.nextStackId++, pos: n.castle, n: 0 }; n.stacks.push(s); }
  s.n += total;
  log(`${n.name}: 군대 ${total}명 양성 (곡식 -${cost})`);
}
function canTrain(n) { return n.grain >= RULES.trainCost && n.noTrainYear !== G.year && !stackAtEnemy(n.castle, n); }
function stackAtEnemy(k, n) { const s = stackAt(k); return s && s.nation !== n; }
function shopOpen(n) {
  if (G.effects.greed) return false;
  for (const c of n.cells) for (const k of neighbors(c)) if (ter(k) === "T") return true;
  return false;
}
function shopPrice() { return Math.max(1, RULES.shopPrice - (G.climate?.name === "지중해성" ? 1 : 0)); }
async function doMove(n, stack, steps, dest) {
  const kind = G.reach.get(dest);
  if (n.human && stack.pos === n.castle && !n.stacks.some(t => t !== stack && t.pos === n.castle))
    log("주의: 성이 비었다. 적이 성 칸에서 이기면 바로 멸망한다.", "big");
  G.reach = null;
  if (kind === "fight") { await attack(n, stack, dest); return; }
  if (kind === "bermuda") {
    const i = Math.floor((d6() - 1) / 2);
    const to = G.islands[i] ?? stack.pos;
    log(`${n.name}: 버뮤다 삼각지대에 휩쓸려 섬으로 떠밀려 감`);
    stack.pos = stackAt(to) ? stack.pos : to;
  } else stack.pos = dest;
  // 같은 칸의 내 군대는 합침
  const other = n.stacks.find(t => t !== stack && t.pos === stack.pos);
  if (other) { other.n += stack.n; removeStack(n, stack); }
  // 빈 적 땅에 들어가면 그 칸을 빼앗음
  const o = G.owner.get(stack.pos);
  if (o !== undefined && o !== n.id && !G.effects.quake) {
    const on = G.nations[o];
    if (on.castle === stack.pos) await fallCastle(n, on);
    else { on.cells.delete(stack.pos); claim(n, stack.pos); log(`${n.name}: ${on.name}의 빈 땅을 빼앗음`); }
  }
}
async function doTemple(n, stack, amount) {
  n.grain -= amount;
  const r = d6();
  let msg = `${n.name}: 신전에 곡식 ${amount}을 바침, 주사위 ${r} — `;
  if (r <= 2) msg += "아무 일 없음";
  else if (r <= 4) { n.grain += amount; const c = draw("tactics"); n.hand.push(c); msg += `곡식을 돌려받고 전술 카드 ${n.human ? c : "1장"}`; }
  else { const g = amount * 2 * (n.race === "심해족" ? 2 : 1); n.grain += g; msg += `곡식 ${g}을 받음`; }
  log(msg);
}

// ---------- 사람 차례 ----------
function humanAction(id) {
  const n = me();
  if (G.turn !== n || G.actionsLeft <= 0 || G.busy) return;
  cancelMode();
  if (n === G.demonPlayer) {
    if (id === "move") {
      if (!G.demon.zombies.length) return log("움직일 좀비가 없다.", "hint");
      G.mode = "moveSel"; G.demonMove = true;
      if (G.demon.zombies.length === 1) return rollMove(G.demon.zombies[0]);
      banner("움직일 좀비 무리를 누르세요");
    }
    if (id === "rest") { G.actionsLeft--; render(); }
    return;
  }
  if (id === "explore") {
    const t = exploreTargets(n);
    if (!t.length) return log("탐사할 수 있는 칸이 없다 (정복도 부족 또는 지진).", "hint");
    G.mode = "explore"; G.pending = new Set(t); banner("흰 테두리 칸 중 탐사할 칸을 누르세요 · Esc = 취소"); render();
  } else if (id === "train") {
    if (n.grain < 0) return log("빚이 있어서 군대를 뽑을 수 없다.", "hint");
    if (!canTrain(n)) return log("지금은 군대를 뽑을 수 없다 (곡식 부족, 보급 차단, 또는 성에 적이 있음).", "hint");
    const max = Math.floor(n.grain / RULES.trainCost);
    modal(`<h3>군대 양성</h3><p>1명 = 곡식 ${RULES.trainCost}. 최대 ${max}명. ${n.race === "마족" ? "마족은 5명마다 1명 공짜." : ""}</p>
      <input id="trainN" type="number" min="1" max="${max}" value="${max}">`, [["취소", 0], ["뽑기", 1, "primary"]]).then(ok => {
      const v = Math.max(1, Math.min(max, +$("trainN").value || 0));
      if (ok) { doTrain(n, v); endAction(n, false); }
    });
  } else if (id === "move") {
    if (!n.stacks.length) return log("움직일 군대가 없다.", "hint");
    G.mode = "moveSel"; G.demonMove = false;
    if (n.stacks.length === 1) return rollMove(n.stacks[0]);
    banner("움직일 내 군대(숫자 동그라미)를 누르세요");
  } else if (id === "temple") {
    const s = n.stacks.find(t => ter(t.pos) === "S");
    if (!s) return log("신전 칸에 내 군대가 있어야 한다.", "hint");
    if (n.grain < 1) return log("바칠 곡식이 없다.", "hint");
    const max = Math.min(RULES.templeMax, n.grain);
    modal(`<h3>바다의 신전</h3><p>곡식 1~${max}을 바치고 주사위: 1~2 없음, 3~4 돌려받고 전술 카드, 5~6 2배.</p><input id="tN" type="number" min="1" max="${max}" value="${max}">`,
      [["취소", 0], ["바치기", 1, "primary"]]).then(async ok => { if (ok) { await doTemple(n, s, Math.max(1, Math.min(max, +$("tN").value || 1))); endAction(n, false); } });
  } else if (id === "shop") {
    if (!shopOpen(n)) return log("상인의 마을 옆 칸을 차지해야 상점을 쓸 수 있다.", "hint");
    if (n.grain < shopPrice()) return log("곡식이 모자란다.", "hint");
    n.grain -= shopPrice(); const c = draw("tactics"); n.hand.push(c); log(`나: 상점에서 ${c} 구입`); endAction(n, false);
  } else if (id === "ship") {
    if (n.ship || n.race === "심해족") return log(n.race === "심해족" ? "심해족은 배 없이 바다로 다닌다." : "이미 배가 있다.", "hint");
    if (!coastal(n)) return log("바닷가 내 땅이 있어야 배를 지을 수 있다.", "hint");
    if (n.grain < buildCost(n, "ship")) return log("곡식이 모자란다.", "hint");
    n.grain -= buildCost(n, "ship"); n.ship = true; log(`나: 배·항구 건설 (곡식 -${buildCost(n, "ship")}). 이제 군대가 바다를 건널 수 있다.`); endAction(n, false);
  } else if (id === "fort") {
    if (n.grain < buildCost(n, "fort")) return log(`곡식이 모자란다 (요새 ${buildCost(n, "fort")}).`, "hint");
    G.mode = "fort"; G.pending = new Set([...n.cells].filter(c => !G.forts.has(c) && c !== n.castle));
    banner(`요새를 지을 내 땅을 누르세요 (곡식 ${buildCost(n, "fort")}) · Esc = 취소`); render();
  } else if (id === "rest") { log("나: 쉼"); endAction(n, false); }
}
function cancelMode() {
  if (G.splitFrom && G.sel) { G.splitFrom.n += G.sel.n; removeStack(G.demonMove ? "demon" : me(), G.sel); } // 나눈 걸 취소하면 다시 합침
  G.splitFrom = null; G.mode = null; G.pending = null; G.reach = null; G.sel = null; banner(null); render(); }
cv.addEventListener("mousemove", e => {
  const r = cv.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / r.width * W), y = Math.floor((e.clientY - r.top) / r.height * H);
  if (x >= 0 && y >= 0 && x < W && y < H) { G.hover = key(x, y); render(); }
});
cv.addEventListener("mouseleave", () => { G.hover = null; render(); });
cv.addEventListener("click", async e => {
  const r = cv.getBoundingClientRect();
  const k = key(Math.floor((e.clientX - r.left) / r.width * W), Math.floor((e.clientY - r.top) / r.height * H));
  const n = me();
  if (G.mode === "castle") {
    // 땅 칸이면 어디든 놓는다. 바다 등을 누르면 가장 가까운 땅 칸으로 맞춘다.
    const ok = c => CASTLE_OK.includes(ter(c));
    let best = ok(k) ? k : null;
    if (best === null) for (let r = 1; r <= 3 && best === null; r++) best = [...Array(W * H).keys()].find(c => ok(c) && dist(c, k) === r) ?? null;
    if (best === null) return log("땅 칸을 눌러야 성을 놓을 수 있다.", "hint");
    G.mode = null; $("banner").hidden = true; G.castleResolve(best); return;
  }
  if (G.mode === "fort" && G.pending?.has(k)) {
    G.mode = null; G.pending = null; banner(null);
    n.grain -= buildCost(n, "fort"); G.forts.add(k); log(`나: 요새 건설 (곡식 -${buildCost(n, "fort")})`); endAction(n, false); return;
  }
  if (G.mode === "explore" && G.pending?.has(k)) {
    G.mode = null; G.pending = null; G.busy = true; banner(null); await doExplore(n, k); G.busy = false; endAction(n, true); return;
  }
  if (G.mode === "moveSel") {
    const arr = G.demonMove ? G.demon.zombies : n.stacks;
    const s = arr.slice().sort((a, b) => dist(a.pos, k) - dist(b.pos, k)).find(t => dist(t.pos, k) <= 2);
    if (!s) return banner("내 군대(숫자 동그라미) 근처를 누르세요");
    rollMove(s); return;
  }
  if (G.mode === "moveTo" && !G.reach?.has(k)) return banner("밝은 칸 중에서 고르세요 · 빨간 테두리 = 전투 · Esc = 취소");
  if (G.mode === "moveTo" && G.reach?.has(k)) {
    const s = G.sel; G.mode = null; G.sel = null; G.splitFrom = null; G.busy = true; banner(null);
    if (G.demonMove) await demonMoveTo(s, k); else await doMove(n, s, G.steps, k);
    G.busy = false; G.reach = null;
    if (G.demonMove) { G.actionsLeft--; render(); } else endAction(n, false);
  }
});
function banner(text) { const b = $("banner"); b.hidden = !text; if (text) b.textContent = text; }
async function rollMove(s) {
  const n = me();
  // 군대 나누기: 보낼 수를 고르고 나머지는 제자리에 남는다
  if (s.n > 1) {
    const v = await modal(`<h3>보낼 군대 수</h3><p>이 칸의 군대 ${s.n}명 중 몇 명을 보낼까? 나머지는 이 칸에 남는다. 이동 주사위는 보내는 군대 수만큼(최대 ${RULES.maxMoveDice}개).</p>
      <input id="splitN" type="number" min="1" max="${s.n}" value="${s.n}"> <span class="muted">/ ${s.n}명</span>`, [["취소", 0], ["보내기", 1, "primary"]]);
    if (!v) { G.mode = null; banner(null); return; }
    const k = Math.max(1, Math.min(s.n, Math.floor(+$("splitN").value) || s.n));
    if (k < s.n) {
      const arr = G.demonMove ? G.demon.zombies : n.stacks;
      const part = { id: G.nextStackId++, pos: s.pos, n: k };
      s.n -= k; arr.push(part); G.splitFrom = s; s = part;
    }
  }
  {
    const dice = [...Array(moveDice(G.demonMove ? { race: "" } : n, s))].map(d6);
    const steps = dice.reduce((a, b) => a + b, 0);
    G.sel = s; G.reach = reachable(G.demonMove ? "demon" : n, s, steps); G.mode = "moveTo"; G.steps = steps;
    log(`이동 주사위 ${dice.join("+")} = ${steps}칸.`, "hint");
    banner(`주사위 ${dice.join("+")} = ${steps}칸 · 밝은 칸을 눌러 이동 · 빨간 테두리 = 전투 · Esc = 취소`);
    render();
  }
}
document.addEventListener("keydown", e => { if (e.key === "Escape") cancelMode(); });

async function humanTurn(n) {
  G.turn = n; G.actionsLeft = RULES.actionsPerYear; render();
  await new Promise(res => {
    const check = setInterval(() => { if (G.actionsLeft <= 0 && !G.busy) { clearInterval(check); res(); } }, 100);
  });
  G.turn = null;
}

// ---------- 컴퓨터 ----------
async function aiTurn(n) {
  G.turn = n; render();
  for (let a = 0; a < RULES.actionsPerYear && n.alive; a++) {
    await sleep(350);
    await aiAct(n);
    render();
  }
  G.turn = null;
}
async function aiAct(n) {
  const enemies = G.nations.filter(o => o.alive && o !== n);
  // 1) 공격
  for (const s of n.stacks.slice().sort((a, b) => b.n - a.n)) {
    if (s.n < 3 || G.effects.quake) break;
    const steps = [...Array(moveDice(n, s))].map(d6).reduce((a, b) => a + b, 0);
    const reach = reachable(n, s, steps);
    let best = null, bv = -1;
    for (const [k, kind] of reach) {
      const o = G.owner.get(k), st = stackAt(k);
      if (kind === "fight") {
        const dn = st ? st.s.n : 0; if (dn >= s.n) continue;
        const isCastle = G.nations.some(o => o.alive && o.castle === k);
        const v = isCastle ? 100 : 20 - dn / 10;
        if (v > bv) { bv = v; best = k; }
      } else if (kind === "move" && o !== undefined && o !== n.id) {
        const on = G.nations[o]; const v = on.castle === k ? 120 : 10;
        if (v > bv) { bv = v; best = k; }
      }
    }
    if (best !== null) { G.reach = reach; await doMove(n, s, steps, best); G.reach = null; return endAction(n, false); }
  }
  // 2) 탐사
  const t = exploreTargets(n);
  const want = 3 + Math.floor(G.year / 2);
  if (t.length && (army(n) >= want || n.grain < RULES.trainCost * 2)) {
    t.sort((a, b) => ("FKU".indexOf(ter(b)) - "FKU".indexOf(ter(a))) || Math.random() - .5);
    await doExplore(n, t[0]); return endAction(n, true);
  }
  // 3) 배: 3년째부터, 바닷가 땅이 있으면
  if (!n.ship && n.race !== "심해족" && G.year >= 3 && coastal(n) && n.grain >= buildCost(n, "ship") + 4) {
    n.grain -= buildCost(n, "ship"); n.ship = true; log(`${n.name}: 배·항구 건설`); return endAction(n, false);
  }
  // 4) 양성
  if (canTrain(n) && n.grain >= RULES.trainCost * 2 && n.grain >= 0) {
    doTrain(n, Math.max(1, Math.floor(n.grain * 0.6 / RULES.trainCost))); return endAction(n, false);
  }
  // 5) 상점
  if (shopOpen(n) && n.grain >= shopPrice() + 4 && n.hand.length < 3) { n.grain -= shopPrice(); n.hand.push(draw("tactics")); log(`${n.name}: 상점에서 전술 카드 구입`); return endAction(n, false); }
  // 5) 큰 군대를 가장 가까운 적 쪽으로
  const s = n.stacks.slice().sort((a, b) => b.n - a.n)[0];
  if (s && enemies.length) {
    const goal = enemies.map(o => o.castle).sort((a, b) => dist(a, s.pos) - dist(b, s.pos))[0];
    const steps = [...Array(moveDice(n, s))].map(d6).reduce((a, b) => a + b, 0);
    const reach = reachable(n, s, steps);
    let best = null;
    for (const [k, kind] of reach) if (kind === "move" && (best === null || dist(k, goal) < dist(best, goal))) best = k;
    if (best !== null && dist(best, goal) < dist(s.pos, goal)) { G.reach = reach; await doMove(n, s, steps, best); G.reach = null; return endAction(n, false); }
  }
  log(`${n.name}: 쉼`); endAction(n, false);
}

// ---------- 마왕 ----------
async function demonMoveTo(s, k) {
  const kind = G.reach.get(k); G.reach = null;
  if (kind === "fight") return attack("demon", s, k);
  s.pos = kind === "bermuda" ? s.pos : k;
  const other = G.demon.zombies.find(t => t !== s && t.pos === s.pos); if (other) { other.n += s.n; removeStack("demon", s); }
  const o = G.owner.get(s.pos);
  if (o !== undefined) { const on = G.nations[o]; if (on.castle === s.pos) await fallCastle("demon", on); else { on.cells.delete(s.pos); G.owner.delete(s.pos); } }
}
async function demonTurn() {
  if (!G.demon) return;
  const p = G.demonPlayer;
  if (p.human) {
    log("마왕 차례: [군대 이동]으로 좀비를 움직인다.", "hint");
    G.turn = p; G.actionsLeft = RULES.actionsPerYear; render();
    await new Promise(res => { const c = setInterval(() => { if (G.actionsLeft <= 0 && !G.busy) { clearInterval(c); res(); } }, 100); });
    G.turn = null; return;
  }
  G.turn = p;
  for (let a = 0; a < RULES.actionsPerYear; a++) {
    await sleep(350);
    const alive = G.nations.filter(n => n.alive);
    const s = G.demon.zombies.slice().sort((a, b) => b.n - a.n)[0];
    if (!s || !alive.length || s.n < 3) break;
    const steps = [...Array(Math.min(s.n, RULES.maxMoveDice))].map(d6).reduce((a, b) => a + b, 0) + (G.march ? RULES.curse.march : 0);
    const reach = reachable("demon", s, steps);
    let best = null, bv = -1;
    for (const [k, kind] of reach) {
      const st = stackAt(k), o = G.owner.get(k);
      let v = -1;
      const isCastle = G.nations.some(o => o.alive && o.castle === k);
      if (kind === "fight" && (!st || st.nation !== "event") && (st ? st.s.n : 0) < s.n) v = isCastle ? 100 : 30;
      if (kind === "move" && o !== undefined && G.nations[o].castle === k) v = 120;
      if (v > bv) { bv = v; best = k; }
    }
    if (best === null) {
      const goal = alive.map(n => n.castle).sort((a, b) => dist(a, s.pos) - dist(b, s.pos))[0];
      for (const [k, kind] of reach) if (kind === "move" && (best === null || dist(k, goal) < dist(best, goal))) best = k;
    }
    if (best === null) break;
    G.reach = reach; await demonMoveTo(s, best); G.reach = null; render();
  }
  G.turn = null;
}
function curseTargets() { return G.nations.filter(n => n.alive); }
async function playCurse(card, by, target) {
  const C = RULES.curse;
  if (card === "흉작의 저주") { target.harvestCut = (target.harvestCut || 0) + C.harvest; }
  else if (card === "역병") {
    const s = target.stacks.slice().sort((a, b) => b.n - a.n)[0];
    if (s) { const l = Math.min(s.n, C.plague); s.n -= l; kill(l); if (s.n <= 0) removeStack(target, s); }
  } else if (card === "무덤 깨우기") addZombies(C.grave);
  else if (card === "시체 행군") G.march = true;
  // 공포·배신의 속삭임: 이 게임에는 선전포고와 동맹이 없어서 효과 없음
  log(`${by.name}: 저주 [${card}]${["흉작의 저주", "역병"].includes(card) ? " → " + target.name : ""}${["공포", "배신의 속삭임"].includes(card) ? " (이 게임에서는 효과 없음)" : ""}`, "curse");
}
async function humanCurse(i) {
  const n = me(), card = n.curses[i];
  const targets = curseTargets();
  if (!targets.length) return;
  let target = targets[0];
  if (["흉작의 저주", "역병"].includes(card)) {
    target = await modal(`<h3>${card}</h3>${cardImg(DATA.curses.find(c => c.name === card), "small")}<p>대상 나라를 고른다.</p>`,
      targets.map(t => [t.name + " " + t.race, t]).concat([["취소", null]]));
    if (!target) return;
  }
  n.curses.splice(i, 1);
  await playCurse(card, n, target);
  render();
}
async function curseUpkeepStart() {
  G.march = false;
  for (const n of G.nations) {
    if (n.alive || !(n === G.demonPlayer || n.demonSide)) continue;
    n.curses = [];
    for (let i = 0; i < RULES.curseCardsPerYear; i++) n.curses.push(draw("curses"));
    if (!n.human) for (const c of n.curses.splice(0)) {
      const t = curseTargets().sort((a, b) => score(b) - score(a))[0];
      if (t) await playCurse(c, n, t);
    } else log(`저주 카드 ${n.curses.join(", ")} — 오른쪽 패널에서 쓴다 (그해 안에).`, "hint");
  }
}

// ---------- 좀비사태 ----------
async function eventZombiesTurn() {
  for (const z of G.eventZombies.slice()) {
    const alive = G.nations.filter(n => n.alive); if (!alive.length) return;
    const goal = alive.map(n => n.castle).sort((a, b) => dist(a, z.pos) - dist(b, z.pos))[0];
    const step = neighbors(z.pos).filter(k => passable(k, "event")).sort((a, b) => dist(a, goal) - dist(b, goal))[0];
    if (step === undefined) continue;
    const st = stackAt(step);
    const castle = G.nations.some(n => n.alive && n.castle === step);
    if ((st && st.nation !== "event" && st.nation !== "demon") || (!st && castle)) await attack("event", z, step);
    else if (st) continue;
    else {
      z.pos = step;
      const o = G.owner.get(step);
      if (o !== undefined) { const on = G.nations[o]; if (on.castle === step) await fallCastle("event", on); else { on.cells.delete(step); G.owner.delete(step); } }
    }
  }
}

// ---------- 연말 ----------
function loseCells(n, count, filter) {
  const opts = shuffle([...n.cells].filter(c => c !== n.castle && filter(c)));
  for (const c of opts.slice(0, count)) { n.cells.delete(c); G.owner.delete(c); T[Math.floor(c / W)][c % W] = "X"; }
  return Math.min(count, opts.length);
}
function nearTerrain(k, set, r) {
  const [x, y] = xy(k);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < W && ny < H && set.has(T[ny][nx])) return true;
  }
  return false;
}
function destroyArea(x0, y0, w, h) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const k = key(x, y);
    if (G.nations.some(n => n.castle === k)) continue;
    const o = G.owner.get(k); if (o !== undefined) { G.nations[o].cells.delete(k); G.owner.delete(k); }
    T[y][x] = "X";
  }
}
async function applyDisaster(c) {
  const alive = G.nations.filter(n => n.alive);
  G.nextEffects = {};
  switch (c.name) {
    case "빙하기": G.nextEffects.ice = true; break;
    case "홍수": for (const n of alive) loseCells(n, 3, k => nearTerrain(k, new Set(["."]), 1)); break;
    case "산사태": for (const n of alive) loseCells(n, 3, k => nearTerrain(k, new Set(["M"]), 1)); break;
    case "전염병": for (const n of alive) { const s = n.stacks.slice().sort((a, b) => b.n - a.n)[0]; if (s) { const l = Math.min(s.n, d6() * 2); s.n -= l; kill(l); if (!s.n) removeStack(n, s); } } break;
    case "화산폭발": G.nextEffects.volcano = true; for (const n of alive) for (const s of n.stacks.slice()) if (nearTerrain(s.pos, new Set(["M"]), 1)) { const l = Math.min(5, s.n); s.n -= l; kill(l); if (!s.n) removeStack(n, s); } break;
    case "폭염": G.nextEffects.heat = true; break;
    case "한파": G.nextEffects.cold = true; break;
    case "좀비사태": {
      const land = landCells().filter(k => !G.owner.has(k) && !stackAt(k));
      for (let i = 0; i < G.nations.length; i++) G.eventZombies.push({ id: G.nextStackId++, pos: pick(land), n: 2 });
      break;
    }
    case "가뭄": G.nextEffects.drought = true; for (const n of alive) loseCells(n, 3, k => nearTerrain(k, new Set(["."]), 3)); break;
    case "소행성": for (const n of alive) loseCells(n, 4, () => true); break;
    case "레드문": {
      const r = d6(), s = DATA.sins[String(r)];
      await modal(`<h3>레드문: 7대죄 주사위 ${r}</h3><p><b>${s.name}</b> — ${s.text}</p>`, [["확인", 1, "primary"]]);
      log(`레드문 주사위 ${r}: ${s.name} — ${s.text}`, "card");
      if (r === 1) { for (const n of alive) n.hand = []; G.nextEffects.greed = true; }
      if (r === 2) for (const n of alive) { n.grain = n.grain > 0 ? Math.floor(n.grain / 2) : n.grain; n.appetite = G.year + 3; }
      if (r === 3) G.nextEffects.sloth = true;
      if (r === 4) { const [x, y] = xy(pick(landCells())); destroyArea(x - 1, y - 1, 3, 3); }
      if (r === 5) { destroyArea(0, 0, W, 3); destroyArea(0, H - 3, W, 3); destroyArea(0, 0, 3, H); destroyArea(W - 3, 0, 3, H); destroyArea(W / 2 - 1, H / 2 - 1, 3, 3); }
      if (r === 6) { for (const n of alive) { kill(army(n)); n.stacks = []; } }
      break;
    }
    case "지진": G.nextEffects.quake = true; break;
  }
}
async function yearEnd() {
  log(`— ${G.year}년 연말 —`, "big");
  for (const n of G.nations) {
    if (!n.alive) continue;
    // 유지비
    const fee = Math.floor(army(n) / RULES.upkeepPer);
    const paid = Math.min(fee, Math.max(n.grain, 0));
    n.grain -= paid;
    let disband = (fee - paid) * RULES.upkeepPer;
    for (const s of n.stacks.slice().sort((a, b) => b.n - a.n)) { const d = Math.min(s.n, disband); s.n -= d; disband -= d; if (!s.n) removeStack(n, s); }
    // 세금과 수확
    let inc = n.cells.size;
    if (G.climate?.name === "가뭄 기미") inc -= 2;
    if (G.effects.ice) inc -= 5;
    if (G.effects.drought) inc -= 3;
    inc = Math.max(0, inc);
    const farms = [...n.cells].filter(c => ter(c) === "F").length, jungle = [...n.cells].filter(c => ter(c) === "J").length;
    inc += farms * (RULES.farmIncome + (G.climate?.name === "비" ? 2 : 0) + (G.climate?.name === "풍년" ? 1 : 0));
    if (G.climate?.name === "풍년") inc += jungle;
    if (G.climate?.name === "화창함") inc += 2;
    if (n.race === "인간") inc += RULES.humanTrade;
    if (n.grain < 0) inc = Math.max(inc, RULES.debtMinIncome);
    inc -= n.harvestCut || 0; n.harvestCut = 0;
    if (n.appetite === G.year) inc += 10;
    n.grain += inc;
    // 광산
    if (!G.effects.greed) {
      const mines = [...n.cells].filter(c => ter(c) === "K").length * (n.race === "드워프" ? 2 : 1);
      for (let i = 0; i < mines; i++) n.hand.push(draw("tactics"));
      if (mines && n.human) log(`광산에서 전술 카드 ${mines}장`);
    }
  }
  // 패권국
  const ranked = G.nations.filter(n => n.alive).sort((a, b) => b.cells.size - a.cells.size);
  G.hegemon = ranked.length > 1 && ranked[0].cells.size >= RULES.hegemonRatio * ranked[1].cells.size ? ranked[0].id : null;
  if (G.hegemon !== null) log(`${G.nations[G.hegemon].name}이(가) 패권국이 됐다. 다음 해 모두가 패권국과 싸울 때 주사위 1개를 더 다시 굴린다.`);
  // 카드 뽑기: 기후 → 기후 → 재앙
  G.effects = {};
  if (G.year % 3 === 0) {
    const c = draw("disaster"); G.climate = null;
    await showCard(c, `${G.year}년 재앙`);
    await applyDisaster(c);
    G.effects = G.nextEffects;
  } else {
    const c = draw("climate"); G.climate = c;
    await showCard(c, `${G.year + 1}년 기후`);
    if (c.name === "붉은 하늘") { const next = G.decks.disaster[G.decks.disaster.length - 1] || null; if (next) log(`붉은 하늘: 다음 재앙은 ${next.name}`, "card"); }
  }
  render();
}

// ---------- 끝 ----------
function checkEnd(final) {
  const alive = G.nations.filter(n => n.alive);
  if (alive.length === 1 && !G.demon?.zombies.some(z => z.n > 0)) return { winner: alive[0], why: "혼자 남음" };
  if (alive.length === 1 && G.demon === null) return { winner: alive[0], why: "혼자 남음" };
  if (alive.length === 0) return { winner: G.demonPlayer, why: "마왕이 모든 나라의 성을 부숨", demon: true };
  if (final) { const w = alive.slice().sort((a, b) => score(b) - score(a) || b.grain - a.grain)[0]; return { winner: w, why: `20년 제한, 승점 ${score(w)}` }; }
  return null;
}
async function gameOver(r) {
  G.over = true;
  const youWin = r.demon ? me() === G.demonPlayer || me().demonSide : r.winner === me();
  log(`게임 끝: ${r.winner.name}${r.demon ? "(마왕)" : ""} 승리 — ${r.why}`, "big");
  const table = G.nations.map(n => `<tr><td style="color:${n.color}">${n.name}</td><td>${n.race}</td><td>${n.alive ? score(n) : "-"}</td><td>${n.cells.size}</td><td>${n.falls}</td></tr>`).join("");
  await modal(`<h2>${youWin ? "승리!" : "패배"}</h2><p>${r.winner.name}${r.demon ? " (마왕)" : ""} 승리 — ${r.why}</p>
    <table class="tbl"><tr><th>나라</th><th>종족</th><th>승점</th><th>땅</th><th>함락</th></tr>${table}</table>`, [["새 게임", 1, "primary"]]);
  location.reload();
}

// ---------- 진행 ----------
async function setup() {
  newDecks();
  const races = Object.keys(RULES.races);
  const race = await modal(`<h2>종족 고르기</h2><p>나 1명 vs 컴퓨터 3명. 20년 안에 혼자 남거나, 20년째 연말에 승점(땅 1, 성 함락 10, 지킨 자기 성 5)이 가장 높으면 이긴다.</p>
    <table class="tbl"><tr><th>종족</th><th>지능</th><th>정복력</th><th>HP</th><th>공격력</th><th>곡식</th><th>능력</th></tr>
    ${races.map(r => `<tr><td><b>${r}</b></td>${RULES.races[r].map(v => `<td>${v}</td>`).join("")}<td class="muted">${RULES.raceAbility[r]}</td></tr>`).join("")}</table>`,
    races.map(r => [r, r]));
  const others = shuffle(races.filter(r => r !== race)).slice(0, 3);
  G.nations = [makeNation(0, race, true), ...others.map((r, i) => makeNation(i + 1, r, false))];
  findIslands();
  log(`지역 카드: ${me().region > 0 ? "좋은 땅" : me().region < 0 ? "나쁜 땅" : "보통 땅"} (곡식 ${me().region >= 0 ? "+" : ""}${me().region})`);
  G.mode = "castle"; render();
  $("banner").textContent = "지도에서 성을 놓을 땅 칸을 누르세요"; $("banner").hidden = false;
  log("성을 놓을 칸(육지·정글·강·곡창)을 지도에서 누른다.", "hint");
  const ck = await new Promise(res => G.castleResolve = res);
  placeCastle(me(), ck);
  const land = landCells();
  for (const n of G.nations.slice(1)) {
    // 컴퓨터는 다른 성에서 가장 먼 칸 중 하나를 고른다 (후보 300개 중 최선)
    let best = null, bd = -1;
    for (let i = 0; i < 300; i++) {
      const k = pick(land), d = Math.min(...G.nations.filter(o => o.castle !== null).map(o => dist(o.castle, k)));
      if (d > bd) { bd = d; best = k; }
    }
    placeCastle(n, best);
  }
  render();
}
async function main() {
  await setup();
  while (!G.over) {
    await curseUpkeepStart();
    const order = shuffle(G.nations.filter(n => n.alive));
    log(`${G.year}년 차례: ${order.map(n => n.name).join(" → ")}`);
    for (const n of order) {
      if (!n.alive) continue;
      if (n.human) await humanTurn(n); else await aiTurn(n);
      const r = checkEnd(false); if (r) return gameOver(r);
    }
    await demonTurn();
    await eventZombiesTurn();
    let r = checkEnd(false); if (r) return gameOver(r);
    for (const n of G.nations) if (n.human && n.curses.length) { log("남은 저주 카드는 버려진다.", "hint"); n.curses = []; }
    await yearEnd();
    r = checkEnd(G.year >= RULES.yearCap); if (r) return gameOver(r);
    G.year++;
    render();
  }
}
document.querySelectorAll("#actions button").forEach(b => b.onclick = () => humanAction(b.dataset.a));
$("fast").onchange = e => { G.fast = e.target.checked; };
main();
