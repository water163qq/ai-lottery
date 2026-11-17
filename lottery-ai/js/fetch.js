const DRAW_LIMIT = 100;
const DLT_PAGES = 2;

function cleanNums(text) {
  const matched = String(text || '').match(/\d+/g);
  return matched ? matched.map(n => Number(n)) : [];
}

function fmtDate(text) {
  return String(text || '').split('(')[0].trim().slice(0, 10);
}

function isoNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function emptyPayload() {
  return { updatedAt: isoNow(), draws: { ssq: [], dlt: [] }, info: { ssq: null, dlt: null }, news: [] };
}

function androidGet(url) {
  const bridge = window.AndroidBridge;
  if (!bridge || typeof bridge.httpGet !== 'function') return null;
  const text = bridge.httpGet(url);
  if (text == null || text === '') throw new Error('empty');
  return text;
}

async function fetchText(url, timeout = 18000) {
  const fromAndroid = androidGet(url);
  if (fromAndroid !== null) return fromAndroid;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: ctrl.signal,
      headers: { Accept: '*/*' }
    });
    if (!res.ok) throw new Error(String(res.status));
    return res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, timeout = 18000) {
  const text = await fetchText(url, timeout);
  return JSON.parse(text);
}

function parseSsqPayload(payload) {
  const rows = payload && payload.result ? payload.result : [];
  const draws = [];
  for (const row of rows) {
    const red = cleanNums(row.red);
    const blue = cleanNums(row.blue);
    if (red.length !== 6 || blue.length !== 1) continue;
    draws.push({
      issue: String(row.code || '').trim(),
      date: fmtDate(row.date),
      areas: { red: red.slice().sort((a, b) => a - b), blue }
    });
  }
  draws.sort((a, b) => (a.issue < b.issue ? 1 : a.issue > b.issue ? -1 : 0));
  let info = null;
  if (rows[0]) {
    const top = rows[0];
    const grades = {};
    (top.prizegrades || []).forEach(g => { grades[g.type] = g; });
    const first = grades[1] || {};
    info = {
      issue: String(top.code || '').trim(),
      date: fmtDate(top.date),
      sales: top.sales || '',
      pool: top.poolmoney || '',
      content: top.content || '',
      firstCount: first.typenum || '',
      firstPrize: first.typemoney || ''
    };
  }
  return { draws, info };
}

function parseDltPage(payload) {
  const rows = payload && payload.value && payload.value.list ? payload.value.list : [];
  const draws = [];
  let info = null;
  for (const row of rows) {
    const nums = cleanNums(row.lotteryDrawResult);
    if (nums.length < 7) continue;
    draws.push({
      issue: String(row.lotteryDrawNum || '').trim(),
      date: fmtDate(row.lotteryDrawTime),
      areas: {
        front: nums.slice(0, 5).sort((a, b) => a - b),
        back: nums.slice(5, 7).sort((a, b) => a - b)
      }
    });
    if (!info) {
      const first = (row.prizeLevelList || []).find(p => p.prizeLevel === '一等奖') || {};
      info = {
        issue: String(row.lotteryDrawNum || '').trim(),
        date: fmtDate(row.lotteryDrawTime),
        sales: row.totalSaleAmount || '',
        pool: row.poolBalanceAfterdraw || '',
        firstCount: first.stakeCount || '',
        firstPrize: first.stakeAmount || '',
        content: ''
      };
    }
  }
  return { draws, info };
}

function parseNewsHtml(page, limit = 16) {
  const items = [];
  const seen = new Set();
  const re = /<a\s+href="(\/c\/(\d{4}-\d{2}-\d{2})\/\d+\.shtml)"[^>]*class="A"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(page)) && items.length < limit) {
    const href = m[1];
    if (seen.has(href)) continue;
    seen.add(href);
    const title = m[3].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
    if (!title) continue;
    items.push({
      title,
      url: 'https://www.zhcw.com' + href,
      date: m[2],
      source: '中彩网'
    });
  }
  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return items.slice(0, limit);
}

async function fetchSsqDirect() {
  const url = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=ssq&issueCount=${DRAW_LIMIT}&pageNo=1&pageSize=${DRAW_LIMIT}`;
  return parseSsqPayload(await fetchJson(url));
}

async function fetchDltDirect() {
  const draws = [];
  const seen = new Set();
  let info = null;
  for (let page = 1; page <= DLT_PAGES; page++) {
    const url = `https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=85&provinceId=0&pageSize=100&isVerify=1&pageNo=${page}`;
    const parsed = parseDltPage(await fetchJson(url));
    if (!info) info = parsed.info;
    for (const d of parsed.draws) {
      if (seen.has(d.issue)) continue;
      seen.add(d.issue);
      draws.push(d);
    }
    if (parsed.draws.length < 100) break;
  }
  draws.sort((a, b) => (a.issue < b.issue ? 1 : a.issue > b.issue ? -1 : 0));
  return { draws, info };
}

async function fetchNewsDirect() {
  const html = await fetchText('https://www.zhcw.com/xinwen/');
  return parseNewsHtml(html);
}

function isHttpApp() {
  return location.protocol === 'http:' || location.protocol === 'https:';
}

async function fetchViaProxy() {
  const payload = await fetchJson('/api/lottery?t=' + Date.now());
  if (!payload || typeof payload !== 'object') throw new Error('bad payload');
  return payload;
}

async function fetchDirect() {
  const data = emptyPayload();
  const tasks = [
    fetchSsqDirect().then(r => {
      data.draws.ssq = r.draws;
      data.info.ssq = r.info;
    }).catch(() => {}),
    fetchDltDirect().then(r => {
      data.draws.dlt = r.draws;
      data.info.dlt = r.info;
    }).catch(() => {}),
    fetchNewsDirect().then(items => {
      data.news = items;
    }).catch(() => {})
  ];
  await Promise.all(tasks);
  if ((data.draws.ssq || []).length < 20 && (data.draws.dlt || []).length < 20) {
    throw new Error('no draws');
  }
  return data;
}

async function loadLiveData() {
  if (window.AndroidBridge && typeof window.AndroidBridge.httpGet === 'function') {
    return fetchDirect();
  }
  if (isHttpApp()) {
    try {
      return await fetchViaProxy();
    } catch {
      return fetchDirect();
    }
  }
  return fetchDirect();
}

export { loadLiveData };
