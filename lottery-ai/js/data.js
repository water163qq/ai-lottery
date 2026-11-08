const GAME = {
  ssq: {
    id: 'ssq',
    name: '双色球',
    areas: [
      { key: 'red', label: '红球', min: 1, max: 33, pick: 6, cls: 'ball-red', zones: 3 },
      { key: 'blue', label: '蓝球', min: 1, max: 16, pick: 1, cls: 'ball-blue', zones: 1 }
    ],
    main: 'red',
    special: 'blue',
    sumIdeal: [90, 150],
    oddIdeal: [2, 4]
  },
  dlt: {
    id: 'dlt',
    name: '大乐透',
    areas: [
      { key: 'front', label: '前区', min: 1, max: 35, pick: 5, cls: 'ball-front', zones: 3 },
      { key: 'back', label: '后区', min: 1, max: 12, pick: 2, cls: 'ball-back', zones: 1 }
    ],
    main: 'front',
    special: 'back',
    sumIdeal: [70, 130],
    oddIdeal: [2, 3]
  }
};

function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleUniform(rng, min, max, k) {
  const pool = [];
  for (let n = min; n <= max; n++) pool.push(n);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, k).sort((a, b) => a - b);
}

function buildDraws(gameId, count, seed) {
  const game = GAME[gameId];
  const rng = mulberry32(seed);
  const draws = [];
  let issueSeq = 148;
  let year = 2025;
  for (let i = 0; i < count; i++) {
    const areas = {};
    game.areas.forEach(area => {
      areas[area.key] = sampleUniform(rng, area.min, area.max, area.pick);
    });
    draws.push({
      issue: `${year}${String(issueSeq).padStart(3, '0')}`,
      areas
    });
    issueSeq--;
    if (issueSeq <= 0) {
      issueSeq = 150;
      year--;
    }
  }
  return draws;
}

const HISTORY = {
  ssq: buildDraws('ssq', 1200, 20260101),
  dlt: buildDraws('dlt', 1200, 20260202)
};

export { GAME, HISTORY, mulberry32 };
