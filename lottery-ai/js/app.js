import { GAME, HISTORY } from './data.js';
import { analyze, generatePick, prizeInfo } from './engine.js';

const $ = sel => document.querySelector(sel);
const state = {
  game: 'ssq',
  view: 'analysis',
  windowSize: 50,
  strategy: 'smart',
  picks: [],
  favs: load('favs_ssq'),
  manual: {},
  must: {},
  ban: {},
  filterMode: 'must',
  stats: loadStats('stats_ssq')
};

function resetManual() {
  state.manual = {};
  resetFilters();
  game().areas.forEach(a => { state.manual[a.key] = []; });
}

function resetFilters() {
  state.must = {};
  state.ban = {};
  game().areas.forEach(a => {
    state.must[a.key] = [];
    state.ban[a.key] = [];
  });
}

function manualComplete() {
  return game().areas.every(a => state.manual[a.key].length === a.pick);
}

function load(key, fallback = []) {
  try {
    const v = JSON.parse(localStorage.getItem('ai_lot_' + key));
    return v === null || v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}
function loadStats(key) {
  const v = load(key, null);
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    return { count: 0, win: 0, best: null };
  }
  return {
    count: Number.isFinite(v.count) ? v.count : 0,
    win: Number.isFinite(v.win) ? v.win : 0,
    best: typeof v.best === 'string' ? v.best : null
  };
}
function save(key, val) {
  localStorage.setItem('ai_lot_' + key, JSON.stringify(val));
}

const pad = n => String(n).padStart(2, '0');
function game() { return GAME[state.game]; }

function ballHtml(n, cls, sm = false, extra = '') {
  return `<span class="ball ${cls} ${sm ? 'sm' : ''} ${extra}">${pad(n)}</span>`;
}

function pickHtml(pick, sm = false) {
  const g = game();
  let html = '';
  g.areas.forEach((area, i) => {
    if (i > 0) html += `<span class="ball plus sm">+</span>`;
    pick.areas[area.key].forEach(n => { html += ballHtml(n, area.cls, sm); });
  });
  return html;
}

function pickText(pick) {
  const g = game();
  return g.areas.map(a => pick.areas[a.key].map(pad).join(' ')).join(' + ');
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 1600);
}

/* ---------- 分析面板 ---------- */

function renderAnalysis() {
  const g = game();
  const analysis = analyze(state.game, state.windowSize);
  const main = analysis[g.main];
  const latest = HISTORY[state.game][0];

  $('#latestTitle').textContent = `最新一期（模拟） · ${latest.issue}`;
  $('#latestDraw').innerHTML = pickHtml(latest);

  $('#hotBox').innerHTML = main.hot.map(n =>
    `<span class="omission-tag"><b>${pad(n)}</b><span class="muted">${main.freq[n]} 次</span></span>`).join('')
    || '<span class="muted small">暂无明显热号</span>';
  $('#coldBox').innerHTML = main.cold.map(n =>
    `<span class="omission-tag"><b>${pad(n)}</b><span class="muted">遗漏 ${main.omission[n]}</span></span>`).join('')
    || '<span class="muted small">暂无明显冷号</span>';

  $('#omissionBox').innerHTML = main.maxOmissionNums.map(n =>
    `<span class="omission-tag"><b>${pad(n)}</b><span class="muted">遗漏 ${main.omission[n]}</span></span>`).join('');
  const special = analysis[g.special];
  $('#omissionMeta').textContent = `${g.main === 'red' ? '红球' : '前区'}平均遗漏约 ${main.gap.toFixed(1)} 期 · ${g.special === 'blue' ? '蓝球' : '后区'}最深遗漏 ${Math.max(...special.omission.slice(1))} 期`;

  $('#freqMeta').textContent = `统计窗口 ${main.window} 期`;
  analysisCache.main = main;
  drawFreqChart(main);
  drawSumChart(main);
}

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  if (!canvas.dataset.logicalHeight) {
    canvas.dataset.logicalHeight = canvas.getAttribute('height') || '150';
  }
  const height = Number(canvas.dataset.logicalHeight);
  const width = Math.max(canvas.clientWidth || canvas.parentElement.clientWidth || 300, 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = '100%';
  canvas.style.height = height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function drawFreqChart(a) {
  const canvas = $('#freqChart');
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  const area = a.area;
  const pool = area.max - area.min + 1;
  const padL = 26, padB = 16, padT = 8;
  const chartW = width - padL - 4;
  const chartH = height - padB - padT;
  const maxF = Math.max(...a.freq.slice(1));
  const bw = chartW / pool;

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.fillStyle = '#8a93a8';
  ctx.font = '10px sans-serif';
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + chartH);
  ctx.lineTo(padL + chartW, padT + chartH);
  ctx.stroke();

  for (let n = area.min; n <= area.max; n++) {
    const f = a.freq[n];
    const h = maxF > 0 ? (f / maxF) * chartH : 0;
    const x = padL + (n - area.min) * bw;
    const grad = ctx.createLinearGradient(0, padT + chartH - h, 0, padT + chartH);
    const isHot = a.hot.includes(n);
    const isCold = a.cold.includes(n);
    if (isHot) { grad.addColorStop(0, '#ff8a8a'); grad.addColorStop(1, '#c92a2a'); }
    else if (isCold) { grad.addColorStop(0, '#74c0fc'); grad.addColorStop(1, '#1864ab'); }
    else { grad.addColorStop(0, 'rgba(108,140,255,0.85)'); grad.addColorStop(1, 'rgba(108,140,255,0.25)'); }
    ctx.fillStyle = grad;
    const gap = bw > 8 ? 2 : 0.5;
    ctx.fillRect(x + gap / 2, padT + chartH - h, bw - gap, h);
    if (pool <= 35 && (n - area.min) % Math.ceil(pool / 12) === 0) {
      ctx.fillStyle = '#8a93a8';
      ctx.fillText(n, x, height - 4);
    }
  }
  ctx.fillStyle = '#8a93a8';
  ctx.fillText(`${maxF}`, 4, padT + 8);
}

function drawSumChart(a) {
  const canvas = $('#sumChart');
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  const data = [...a.sumSeries].reverse();
  const padL = 30, padR = 6, padT = 10, padB = 16;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const minV = Math.min(...data) - 4;
  const maxV = Math.max(...data) + 4;
  const x = i => padL + (i / (data.length - 1)) * chartW;
  const y = v => padT + chartH - ((v - minV) / (maxV - minV)) * chartH;

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + chartH);
  ctx.lineTo(padL + chartW, padT + chartH);
  ctx.stroke();

  const [lo, hi] = game().sumIdeal;
  ctx.fillStyle = 'rgba(108,140,255,0.08)';
  ctx.fillRect(padL, y(hi), chartW, y(lo) - y(hi));

  const grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
  grad.addColorStop(0, 'rgba(176,108,255,0.9)');
  grad.addColorStop(1, 'rgba(108,140,255,0.9)');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.forEach((v, i) => i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v)));
  ctx.stroke();

  const lastX = x(data.length - 1), lastY = y(data[data.length - 1]);
  ctx.fillStyle = '#b06cff';
  ctx.beginPath();
  ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#8a93a8';
  ctx.font = '10px sans-serif';
  ctx.fillText(maxV, 4, padT + 8);
  ctx.fillText(minV, 4, padT + chartH);
  ctx.fillText(`均值带 ${lo}-${hi}`, padL + 4, y(hi) - 3);
}

/* ---------- 生成结果 ---------- */

function renderPicks() {
  const card = $('#resultCard');
  if (state.picks.length === 0) { card.hidden = true; return; }
  card.hidden = false;
  $('#pickList').innerHTML = state.picks.map((p, i) => {
    const scoreChip = p.score !== null && p.score !== undefined
      ? `<span class="pick-meta-chip">智能评分 ${(p.score * 100).toFixed(0)}</span>` : '';
    const favChip = isFav(p) ? `<span class="pick-meta-chip" style="color:#ffd43b">已收藏</span>` : '';
    return `<div class="pick-row">
      <div class="balls-row">${pickHtml(p)}</div>
      <div class="actions">
        ${scoreChip}${favChip}
        <button class="ghost" data-copy="${i}">复制</button>
        <button class="ghost" data-fav="${i}">${isFav(p) ? '取消收藏' : '收藏'}</button>
      </div>
    </div>`;
  }).join('');
  const strategies = { smart: '智能平衡', hot: '追热', cold: '追冷', omission: '遗漏回补', random: '纯随机' };
  $('#pickMeta').textContent = `${game().name} · ${strategies[state.strategy]} · ${state.picks.length} 注 · 生成于 ${new Date(state.picks[0].ts).toLocaleTimeString()}`;
}

function isFav(p) {
  return state.favs.some(f => pickText(f) === pickText(p));
}

function renderFavs() {
  const list = $('#favList');
  $('#favCount').textContent = `共 ${state.favs.length} 注`;
  if (state.favs.length === 0) {
    list.innerHTML = '<div class="fav-empty">还没有收藏，生成号码后点击「收藏」保存到这里。</div>';
    return;
  }
  list.innerHTML = state.favs.map((f, i) =>
    `<div class="fav-item">
      <div class="balls-row">${pickHtml(f)}</div>
      <div class="actions">
        <button class="ghost" data-favcopy="${i}">复制</button>
        <button class="ghost" data-favdel="${i}">移除</button>
      </div>
    </div>`).join('');
}

function renderHistory() {
  const g = game();
  $('#historyList').innerHTML = HISTORY[state.game].slice(0, 8).map(d =>
    `<div class="history-item">
      <span class="issue">${d.issue}</span>
      <div class="balls-row">${pickHtml(d, true)}</div>
    </div>`).join('');
}

/* ---------- 手选号码 ---------- */

function renderManualBoard() {
  const board = $('#manualBoard');
  board.innerHTML = game().areas.map(area => {
    const nums = [];
    for (let n = area.min; n <= area.max; n++) nums.push(n);
    const selected = state.manual[area.key];
    return `<div class="manual-area">
      <div class="sub-title">${area.label} <span class="muted">已选 ${selected.length} / ${area.pick}</span></div>
      <div class="ball-grid">
        ${nums.map(n => {
          const picked = selected.includes(n);
          return `<span class="ball ${area.cls} pickable ${picked ? 'picked' : ''}" data-area="${area.key}" data-n="${n}">${pad(n)}</span>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  const done = manualComplete();
  $('#manualFav').disabled = !done;
  $('#manualStatus').textContent = done
    ? '已选满一注，可收藏或参与模拟开奖'
    : `还需选择 ${game().areas.reduce((s, a) => s + (a.pick - state.manual[a.key].length), 0)} 个号码`;
}

function toggleManual(areaKey, n) {
  const area = game().areas.find(a => a.key === areaKey);
  const list = state.manual[areaKey];
  const idx = list.indexOf(n);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    if (list.length >= area.pick) {
      toast(`${area.label}最多选 ${area.pick} 个`);
      return;
    }
    list.push(n);
    list.sort((a, b) => a - b);
  }
  renderManualBoard();
}

function fillManualRandom() {
  game().areas.forEach(area => {
    const list = state.manual[area.key];
    const remaining = [];
    for (let n = area.min; n <= area.max; n++) {
      if (!list.includes(n)) remaining.push(n);
    }
    while (list.length < area.pick && remaining.length > 0) {
      const i = Math.floor(Math.random() * remaining.length);
      list.push(remaining.splice(i, 1)[0]);
    }
    list.sort((a, b) => a - b);
  });
  renderManualBoard();
  toast('已随机补全');
}

/* ---------- 定胆 / 杀号 ---------- */

function renderFilterBoard() {
  const board = $('#filterBoard');
  document.querySelectorAll('.filter-tools .mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === state.filterMode);
  });

  board.innerHTML = game().areas.map(area => {
    const nums = [];
    for (let n = area.min; n <= area.max; n++) nums.push(n);
    const must = state.must[area.key];
    const ban = state.ban[area.key];
    return `<div class="filter-area">
      <div class="sub-title">${area.label} <span class="muted">定胆 ${must.length} · 杀号 ${ban.length}</span></div>
      <div class="ball-grid">
        ${nums.map(n => {
          const isMust = must.includes(n);
          const isBan = ban.includes(n);
          const blocked = state.filterMode === 'must' && isBan;
          const cls = isMust ? 'must-mark' : isBan ? 'ban-mark' : '';
          return `<span class="ball ${area.cls} pickable ${cls} ${blocked ? 'disabled' : ''}" data-filter-area="${area.key}" data-n="${n}">${pad(n)}</span>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  const totalMust = game().areas.reduce((s, a) => s + state.must[a.key].length, 0);
  const totalBan = game().areas.reduce((s, a) => s + state.ban[a.key].length, 0);
  $('#mustBanStatus').textContent = totalMust + totalBan === 0
    ? '定胆必含，杀号排除'
    : `定胆 ${totalMust} 个 · 杀号 ${totalBan} 个（下次生成生效）`;
}

function toggleFilterMark(areaKey, n) {
  const area = game().areas.find(a => a.key === areaKey);
  if (state.filterMode === 'must') {
    const ban = state.ban[areaKey];
    const must = state.must[areaKey];
    const bi = ban.indexOf(n);
    if (bi >= 0) ban.splice(bi, 1);
    const mi = must.indexOf(n);
    if (mi >= 0) {
      must.splice(mi, 1);
    } else {
      if (must.length >= area.pick) {
        toast(`${area.label}定胆最多 ${area.pick} 个`);
        return;
      }
      must.push(n);
      must.sort((a, b) => a - b);
    }
  } else {
    const must = state.must[areaKey];
    const ban = state.ban[areaKey];
    const mi = must.indexOf(n);
    if (mi >= 0) must.splice(mi, 1);
    const bi = ban.indexOf(n);
    if (bi >= 0) {
      ban.splice(bi, 1);
    } else {
      const remain = area.max - area.min + 1 - state.must[areaKey].length - ban.length;
      if (remain <= area.pick) {
        toast(`${area.label}杀号过多，剩余号码不足`);
        return;
      }
      ban.push(n);
      ban.sort((a, b) => a - b);
    }
  }
  renderFilterBoard();
}

/* ---------- 战绩统计 / 批量检票 ---------- */

function renderDrawStats() {
  const s = state.stats;
  const rate = s.count > 0 ? ((s.win / s.count) * 100).toFixed(1) : '0.0';
  $('#drawStats').innerHTML = `
    <div class="stat-cell"><div class="v">${s.count}</div><div class="k">模拟摇号次数</div></div>
    <div class="stat-cell"><div class="v win">${s.win}</div><div class="k">命中奖级次数</div></div>
    <div class="stat-cell"><div class="v">${rate}%</div><div class="k">命中率</div></div>
    <div class="stat-cell"><div class="v">${s.best ? s.best : '—'}</div><div class="k">最佳奖级</div></div>`;
}

function recordStats(prize) {
  const s = state.stats;
  s.count++;
  if (prize !== '未中奖') {
    s.win++;
    const rank = { '一等奖': 1, '二等奖': 2, '三等奖': 3, '四等奖': 4, '五等奖': 5, '六等奖': 6 };
    if (!s.best || rank[prize] < rank[s.best]) s.best = prize;
  }
  save('stats_' + state.game, s);
  renderDrawStats();
}

function runFavCheck() {
  const box = $('#favCheck');
  if (state.favs.length === 0) {
    box.innerHTML = '<div class="fav-check-result muted">收藏夹为空，先收藏几注再检票。</div>';
    return;
  }
  const g = game();
  const drawn = generatePick(state.game, 'random', { windowSize: 0, sumRange: false, oddEven: false, zoneBalance: false, noTripleRun: false }, Date.now() & 0xffffffff ^ 0x9e3779b9);
  let rows = '';
  let winCount = 0;
  state.favs.forEach((f, i) => {
    const mainHit = f.areas[g.main].filter(n => drawn.areas[g.main].includes(n)).length;
    const specialHit = f.areas[g.special].filter(n => drawn.areas[g.special].includes(n)).length;
    const prize = prizeInfo(state.game, mainHit, specialHit);
    const won = prize !== '未中奖';
    if (won) winCount++;
    rows += `<div class="ck-row">
      <span class="muted">${String(i + 1).padStart(2, '0')}</span>
      ${pickHtml(f, true)}
      <span class="${won ? 'hit-txt' : 'muted'}">${g.main === 'red' ? '红' : '前'}${mainHit} · ${g.special === 'blue' ? '蓝' : '后'}${specialHit} → ${prize}</span>
    </div>`;
  });
  box.innerHTML = `<div class="fav-check-result">
    <div class="ck-row" style="border-bottom:1px dashed var(--card-border);padding-bottom:8px">
      <span class="muted">本次摇出：</span>${pickHtml(drawn, true)}
    </div>
    ${rows}
    <div class="ck-row" style="padding-top:8px"><b>共 ${state.favs.length} 注，命中 ${winCount} 注</b><span class="muted">（模拟检票，仅供娱乐）</span></div>
  </div>`;
}

/* ---------- 模拟开奖 ---------- */

function renderDrawCompare(comparePick, drawn) {
  const g = game();
  const mainArea = g.areas.find(a => a.key === g.main);
  const specialArea = g.areas.find(a => a.key === g.special);
  const drawnMain = drawn.areas[g.main];
  const drawnSpecial = drawn.areas[g.special];
  const mainHit = comparePick.areas[g.main].filter(n => drawnMain.includes(n)).length;
  const specialHit = comparePick.areas[g.special].filter(n => drawnSpecial.includes(n)).length;

  $('#drawCompare').innerHTML = `<div class="compare-row">
    <span>你的号码：</span>${pickHtml(comparePick, true)}
  </div>`;

  const mainHtml = drawnMain.map(n =>
    ballHtml(n, mainArea.cls, false, comparePick.areas[g.main].includes(n) ? 'hit' : 'dim')).join('');
  const specialHtml = drawnSpecial.map(n =>
    ballHtml(n, specialArea.cls, false, comparePick.areas[g.special].includes(n) ? 'hit' : 'dim')).join('');

  const prize = prizeInfo(state.game, mainHit, specialHit);
  const won = prize !== '未中奖';
  $('#drawResult').innerHTML =
    `<div>${g.main === 'red' ? '红球' : '前区'}命中 <b style="color:#ffd43b">${mainHit}</b> 个 · ${g.special === 'blue' ? '蓝球' : '后区'}命中 <b style="color:#ffd43b">${specialHit}</b> 个</div>
     <div class="${won ? 'prize' : 'miss'}">${won ? `恭喜，模拟中出「${prize}」` : '很遗憾，模拟未中奖'}（仅供娱乐）</div>`;
  return { mainHtml, specialHtml };
}

function randInt(area) {
  return area.min + Math.floor(Math.random() * (area.max - area.min + 1));
}

function runDraw() {
  const btn = $('#drawBtn');
  const mode = $('#compareSelect').value;
  if (mode === 'manual' && !manualComplete()) {
    toast('请先在手选号码中选满一注');
    return;
  }
  btn.disabled = true;
  const startGame = state.game;
  const g = game();
  let comparePick;
  if (mode === 'manual') {
    comparePick = { areas: JSON.parse(JSON.stringify(state.manual)) };
  } else if (mode === 'latest' && state.picks.length > 0) {
    comparePick = state.picks[0];
  } else {
    comparePick = generatePick(startGame, 'random', readOpts(), Math.floor(Math.random() * 0xffffffff));
  }
  const drawn = generatePick(startGame, 'random', { windowSize: 0, sumRange: false, oddEven: false, zoneBalance: false, noTripleRun: false }, (Math.floor(Math.random() * 0xffffffff) >>> 0) ^ 0x85ebca6b);

  $('#drawCompare').innerHTML = '';
  $('#drawResult').innerHTML = '';

  const stage = $('#drawBalls');
  const mainArea = g.areas[0];
  const specialArea = g.areas[1];
  const mainList = drawn.areas[g.main];
  const specialList = drawn.areas[g.special];

  stage.innerHTML = '';
  stage.classList.add('running');
  const slots = [];

  const mkSlot = (area, finalN, dim) => {
    const el = document.createElement('span');
    el.className = `ball ${area.cls} slot spinning`;
    el.textContent = pad(randInt(area));
    if (dim) el.style.opacity = '0.45';
    stage.appendChild(el);
    const slot = { el, area, final: finalN };
    slots.push(slot);
    return slot;
  };

  const mainSlots = mainList.map(n => mkSlot(mainArea, n));

  const plusEl = document.createElement('span');
  plusEl.className = 'ball plus';
  plusEl.textContent = '+';
  plusEl.style.visibility = 'hidden';
  stage.appendChild(plusEl);

  const specialSlots = specialList.map(n => mkSlot(specialArea, n));

  const spinTimer = setInterval(() => {
    slots.forEach(s => {
      if (s.el.classList.contains('spinning')) {
        s.el.textContent = pad(randInt(s.area));
      }
    });
  }, 70);

  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const freeze = slot => {
    slot.el.classList.remove('spinning');
    slot.el.classList.add('locked');
    slot.el.textContent = pad(slot.final);
    slot.el.style.opacity = '1';
  };

  const FREEZE_GAP = 420;
  let t = 800;
  mainSlots.forEach(slot => {
    later(() => freeze(slot), t);
    t += FREEZE_GAP;
  });
  later(() => { plusEl.style.visibility = 'visible'; }, t - 120);
  specialSlots.forEach(slot => {
    later(() => freeze(slot), t);
    t += FREEZE_GAP;
  });

  later(() => {
    clearInterval(spinTimer);
    timers.forEach(clearTimeout);
    stage.classList.remove('running');
    if (state.game !== startGame) { btn.disabled = false; return; }
    renderDrawCompare(comparePick, drawn);
    const mainHit = comparePick.areas[g.main].filter(n => drawn.areas[g.main].includes(n)).length;
    const specialHit = comparePick.areas[g.special].filter(n => drawn.areas[g.special].includes(n)).length;
    recordStats(prizeInfo(startGame, mainHit, specialHit));
    btn.disabled = false;
  }, t + 200);
}

/* ---------- 选项与事件 ---------- */

function readOpts() {
  return {
    windowSize: state.windowSize,
    sumRange: $('#fSum').checked,
    oddEven: $('#fOdd').checked,
    zoneBalance: $('#fZone').checked,
    noTripleRun: $('#fRun').checked,
    must: state.must,
    exclude: state.ban
  };
}

const STRATEGY_DESC = {
  smart: '综合冷热搭配、和值、奇偶、区间均衡多维打分，从大量候选中择优',
  hot: '近期出现频率高的号码获得更高权重',
  cold: '长期未开出的冷号获得更高权重，博冷回补',
  omission: '聚焦当前遗漏接近或超过平均遗漏周期的号码',
  random: '均匀随机机选，等概率覆盖全部号码'
};

function switchGame(id) {
  state.game = id;
  state.picks = [];
  state.favs = load('favs_' + id);
  state.stats = loadStats('stats_' + id);
  resetManual();
  document.querySelectorAll('#gameTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.game === id));
  renderAll();
}

function renderAll() {
  $('#dataCount').textContent = HISTORY[state.game].length;
  renderAnalysis();
  renderPicks();
  renderFavs();
  renderHistory();
  renderManualBoard();
  renderFilterBoard();
  renderDrawStats();
}

function switchView(view) {
  state.view = view;
  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('active', p.id === 'page-' + view);
  });
  document.querySelectorAll('#bottomNav .nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  if (view === 'analysis') {
    requestAnimationFrame(() => {
      drawFreqChart(analysisCache.main);
      drawSumChart(analysisCache.main);
    });
  }
}

let analysisCache = { main: null };

function bindEvents() {
  $('#gameTabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (btn) switchGame(btn.dataset.game);
  });

  $('#bottomNav').addEventListener('click', e => {
    const btn = e.target.closest('.nav-item');
    if (btn) switchView(btn.dataset.view);
  });

  window.addEventListener('resize', () => {
    if (state.view === 'analysis' && analysisCache.main) {
      drawFreqChart(analysisCache.main);
      drawSumChart(analysisCache.main);
    }
  });

  $('#windowSelect').addEventListener('change', e => {
    state.windowSize = Number(e.target.value);
    renderAnalysis();
  });

  $('#strategyRow').addEventListener('click', e => {
    const btn = e.target.closest('.strategy');
    if (!btn) return;
    state.strategy = btn.dataset.strategy;
    document.querySelectorAll('.strategy').forEach(b => b.classList.toggle('active', b === btn));
    $('#strategyDesc').textContent = STRATEGY_DESC[state.strategy];
  });
  $('#strategyDesc').textContent = STRATEGY_DESC[state.strategy];

  $('#genBtn').addEventListener('click', () => {
    const count = Number($('#pickCount').value);
    const opts = readOpts();
    const picks = [];
    try {
      for (let i = 0; i < count; i++) {
        picks.push(generatePick(state.game, state.strategy, opts, (Date.now() * 31 + i * 7 + Math.floor(Math.random() * 1e9)) >>> 0));
      }
    } catch (err) {
      toast(err.message || '定胆或杀号设置冲突，请调整后再试');
      return;
    }
    state.picks = picks;
    renderPicks();
    $('#resultCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });  });

  $('#pickList').addEventListener('click', e => {
    const copyBtn = e.target.closest('[data-copy]');
    const favBtn = e.target.closest('[data-fav]');
    if (copyBtn) {
      const p = state.picks[Number(copyBtn.dataset.copy)];
      copyText(pickText(p));
    }
    if (favBtn) {
      const p = state.picks[Number(favBtn.dataset.fav)];
      toggleFav(p);
    }
  });

  $('#copyAllBtn').addEventListener('click', () => {
    copyText(state.picks.map(pickText).join('\n'), `${state.picks.length} 注已复制`);
  });

  $('#favList').addEventListener('click', e => {
    const cp = e.target.closest('[data-favcopy]');
    const dl = e.target.closest('[data-favdel]');
    if (cp) copyText(pickText(state.favs[Number(cp.dataset.favcopy)]));
    if (dl) {
      state.favs.splice(Number(dl.dataset.favdel), 1);
      save('favs_' + state.game, state.favs);
      renderFavs();
      renderPicks();
    }
  });

  $('#drawBtn').addEventListener('click', runDraw);

  $('#manualBoard').addEventListener('click', e => {
    const ball = e.target.closest('.ball.pickable');
    if (ball) toggleManual(ball.dataset.area, Number(ball.dataset.n));
  });
  $('#manualClear').addEventListener('click', () => {
    resetManual();
    renderManualBoard();
  });
  $('#manualFill').addEventListener('click', fillManualRandom);
  $('#manualFav').addEventListener('click', () => {
    if (!manualComplete()) return;
    toggleFav({ areas: JSON.parse(JSON.stringify(state.manual)) });
  });

  $('#filterBoard').addEventListener('click', e => {
    const ball = e.target.closest('.ball.pickable');
    if (!ball || ball.classList.contains('disabled')) return;
    toggleFilterMark(ball.dataset.filterArea, Number(ball.dataset.n));
  });
  document.querySelectorAll('.filter-tools .mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.filterMode = btn.dataset.mode;
      renderFilterBoard();
    });
  });
  $('#filterClear').addEventListener('click', () => {
    resetFilters();
    renderFilterBoard();
  });

  $('#favCheckBtn').addEventListener('click', runFavCheck);
  $('#statsClearBtn').addEventListener('click', () => {
    state.stats = { count: 0, win: 0, best: null };
    save('stats_' + state.game, state.stats);
    renderDrawStats();
    toast('战绩已清空');
  });
}

function copyText(text, msg = '已复制到剪贴板') {
  navigator.clipboard.writeText(text).then(() => toast(msg)).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast(msg);
  });
}

function toggleFav(p) {
  const idx = state.favs.findIndex(f => pickText(f) === pickText(p));
  if (idx >= 0) {
    state.favs.splice(idx, 1);
    toast('已取消收藏');
  } else {
    state.favs.unshift({ areas: p.areas, game: state.game, ts: Date.now() });
    toast('已加入收藏');
  }
  save('favs_' + state.game, state.favs);
  renderFavs();
  renderPicks();
}

resetManual();
bindEvents();
renderAll();
switchView(state.view);
