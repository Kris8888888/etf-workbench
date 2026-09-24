/* update.js — ETF 净值增量更新模块（浏览器 / node 共用）
 *
 * 数据源：腾讯行情 web.ifzq.gtimg.cn 日线，不复权 + 后复权两条。
 * 腾讯的 hfq 是「加减现金」式复权，不是分红再投资，所以要自己还原：
 *   F = k·(P + Dcum)，k 在份额折算处会变 → 用局部滚动中位数估 k，
 *   当日分红 d = ΔF/k − ΔP，真实收益 r = (P_t + d)/P_{t−1} − 1。
 * 逻辑与 _src/recon_new.py 一致（那份是基线数据的生成脚本）。
 *
 * 用法
 *   浏览器：<script src="update.js"></script> 后 ETFUpdater.update(DATA) → Promise<{added,last,...}>
 *   node   ：node update.js            （读写同目录 data.js，有新数据才改文件）
 *            node update.js --to 20260916 （只更新到指定日，测试用）
 */
(function (root) {
  'use strict';

  const HOST = 'https://web.ifzq.gtimg.cn/appstock/app/';
  const WIN = 80;            // 估 k 的滚动窗口（交易日）
  const LOOKBACK = 400;      // 为了凑够窗口，往前多拉的自然日
  const CONCURRENCY = 4;

  const SYM = c => (c[0] === '5' ? 'sh' : 'sz') + c;
  const ymd = d => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  const iso = s => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const toDate = s => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
  const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
  const median = a => { const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };

  /* 北京时间 17:00 前不收当天：收盘后一两个小时内腾讯各节点的日线还不一致
   * （实测 15:20 同一标的一分钟内有时有当日行、有时没有）。*/
  const CUTOFF = 1700;
  const QUORUM = 0.9;        // 某日至少这么多比例的已上市标的有行，才收这一天
  function latestFinalDate(now) {
    const bj = new Date((now || Date.now()) + 8 * 3600e3);
    const hm = bj.getUTCHours() * 100 + bj.getUTCMinutes();
    const d = ymd(bj);
    return hm < CUTOFF ? addDays(d, -1) : d;
  }

  /* ── 传输层：浏览器走 JSONP（file:// 与 https 都通），node 走 fetch ── */
  let seq = 0;
  function getJSONP(url) {
    return new Promise((res, rej) => {
      const v = '__etfkd' + (++seq);
      const s = document.createElement('script');
      s.src = url.replace('_var=kd', '_var=' + v);
      const t = setTimeout(() => { fin(); rej(new Error('timeout')); }, 20000);
      function fin() { clearTimeout(t); s.remove(); }
      s.onload = () => { fin(); const d = root[v]; delete root[v]; d ? res(d) : rej(new Error('empty')); };
      s.onerror = () => { fin(); rej(new Error('network')); };
      document.head.appendChild(s);
    });
  }
  async function getFetch(url) {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://gu.qq.com/' } });
    if (!r.ok) throw new Error('http ' + r.status);
    const t = await r.text();
    return JSON.parse(t.slice(t.indexOf('=') + 1));
  }
  const get = typeof document !== 'undefined' ? getJSONP : getFetch;

  async function retry(fn, n = 3) {
    let err;
    for (let i = 0; i < n; i++) {
      try { return await fn(); } catch (e) { err = e; await new Promise(r => setTimeout(r, 1200 * (i + 1))); }
    }
    throw err;
  }

  /* 拉一只标的 [from,to] 的日收盘，返回 {yyyymmdd: close}。count 上限 800，按 3 年分段。*/
  async function kline(code, from, to, adj) {
    const s = SYM(code), out = {};
    for (let a = from; a <= to;) {
      let b = addDays(a, 3 * 365 - 1); if (b > to) b = to;
      const url = adj
        ? `${HOST}fqkline/get?_var=kd&param=${s},day,${iso(a)},${iso(b)},800,${adj}`
        : `${HOST}kline/kline?_var=kd&param=${s},day,${iso(a)},${iso(b)},800`;
      const j = await retry(() => get(url));
      if (!j || j.code !== 0) throw new Error(`${code} ${adj || 'nofq'}: ${j && j.msg || 'bad response'}`);
      const d = j.data && j.data[s];
      const rows = d ? (d[(adj || '') + 'day'] || d.day || []) : [];
      for (const r of rows) out[r[0].replace(/-/g, '')] = +r[2];
      a = addDays(b, 1);
    }
    return out;
  }

  /* 从 anchor（已有最后一日）之后逐日算真实收益。P 不复权、F 后复权，都是 {date: close}。*/
  function dailyReturns(P, F, anchor) {
    const ds = Object.keys(P).filter(d => d in F).sort();
    const n = ds.length;
    let i0 = -1; for (let i = 0; i < n; i++) if (ds[i] <= anchor) i0 = i;
    if (i0 < 0) return null;
    const dP = new Array(n).fill(0), dF = new Array(n).fill(0);
    for (let i = 1; i < n; i++) { dP[i] = P[ds[i]] - P[ds[i - 1]]; dF[i] = F[ds[i]] - F[ds[i - 1]]; }
    const ok = []; for (let i = 1; i < n; i++) if (Math.abs(dP[i]) > 0.003 * P[ds[i - 1]]) ok.push(i);
    const out = {};
    for (let i = i0 + 1; i < n; i++) {
      const a = ds[i - 1], b = ds[i];
      const rp = P[b] / P[a] - 1, rf = F[b] / F[a] - 1;
      let r = rp, note = '';
      if (Math.abs(rp) > 0.15 && Math.abs(rp - rf) > 0.10) { r = rf; note = 'split'; }
      else {
        const win = []; for (const j of ok) if (Math.abs(j - i) <= WIN) win.push(dF[j] / dP[j]);
        if (win.length >= 8) {
          const k = median(win);
          if (k > 0) {
            const d = dF[i] / k - dP[i];
            if (d > Math.max(0.004 * P[a], 0.0015 / k) && (rf - rp) > 0.002) { r = (P[b] + d) / P[a] - 1; note = 'div'; }
          }
        }
      }
      out[b] = { r, note };
    }
    return out;
  }

  async function pool(items, worker) {
    const q = items.slice(); const res = [];
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, q.length) }, async () => {
      while (q.length) { const it = q.shift(); res.push(await worker(it)); }
    }));
    return res;
  }

  /* 主入口：就地把新交易日追加进 DATA（{cal, assets:[{code,name,tag,px}]}）。
   * 任一标的拉取失败则整体不写，保证原子。
   * 返回 {added, last, notes:[{code,date,note}]}；added=0 表示没有新数据。*/
  async function update(DATA, opt) {
    opt = opt || {};
    const cal = DATA.cal, last = cal[cal.length - 1];
    const to = opt.to || latestFinalDate(opt.now);
    if (to <= last) return { added: 0, last, to };
    const from = addDays(last, -LOOKBACK);

    const rets = await pool(DATA.assets, async a => {
      const [P, F] = await Promise.all([kline(a.code, from, to, ''), kline(a.code, from, to, 'hfq')]);
      const listed = a.px[a.px.length - 1] > 0;
      const r = listed ? dailyReturns(P, F, last) : {};
      if (listed && !r) throw new Error(`${a.code}: 找不到锚点 ${last}`);
      return [a.code, r];
    });
    const byCode = Object.fromEntries(rets);

    /* 候选新日期 = 各标的返回日期的并集；某日覆盖不足 QUORUM 说明数据源还没出齐，
     * 从那天起（含之后）全部不收，留给下次。中间跳日会丢收益，所以必须连续截断。*/
    const cnt = {};
    let listedN = 0;
    for (const a of DATA.assets) {
      const r = byCode[a.code]; if (!Object.keys(r).length && !(a.px[a.px.length - 1] > 0)) continue;
      listedN++;
      for (const d in r) if (d > last && d <= to) cnt[d] = (cnt[d] || 0) + 1;
    }
    let nd = Object.keys(cnt).sort();
    const cutAt = nd.findIndex(d => cnt[d] < QUORUM * listedN);
    const dropped = cutAt >= 0 ? nd.slice(cutAt) : [];
    if (cutAt >= 0) nd = nd.slice(0, cutAt);
    if (!nd.length) return { added: 0, last, to, dropped };

    const notes = [];
    for (const a of DATA.assets) {
      const r = byCode[a.code]; let nav = a.px[a.px.length - 1];
      for (const d of nd) {
        if (nav > 0 && r[d]) {                 // 停牌日无行则 carry 前值
          nav = nav * (1 + r[d].r);
          if (r[d].note) notes.push({ code: a.code, date: d, note: r[d].note });
        }
        a.px.push(nav > 0 ? +nav.toFixed(6) : 0);
      }
    }
    cal.push(...nd);
    DATA.updated = new Date().toISOString();
    return { added: nd.length, last: nd[nd.length - 1], to, notes, dropped };
  }

  const api = { update, kline, dailyReturns, latestFinalDate, addDays };
  root.ETFUpdater = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  /* ── node 命令行：node update.js [--to YYYYMMDD] [--file path] ── */
  if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    const fs = require('fs'), path = require('path');
    const argv = process.argv.slice(2);
    const arg = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
    const file = arg('--file') || path.join(__dirname, 'data.js');
    const DATA = readDataJs(fs.readFileSync(file, 'utf8'));
    update(DATA, { to: arg('--to') }).then(r => {
      if (r.added > 0) {
        fs.writeFileSync(file, writeDataJs(DATA));
        console.log(`updated ${file}: +${r.added} days → ${r.last}` + (r.notes.length ? `  events: ${r.notes.map(n => `${n.code}@${n.date}:${n.note}`).join(' ')}` : ''));
      } else console.log(`no new data (have ${r.last}, target ${r.to})`);
      if (r.dropped && r.dropped.length) console.log(`held back (coverage < ${QUORUM * 100}%): ${r.dropped.join(',')}`);
    }).catch(e => { console.error('update failed:', e.message); process.exit(1); });
  }
  function readDataJs(txt) { return JSON.parse(txt.slice(txt.indexOf('=') + 1).replace(/;\s*$/, '')); }
  function writeDataJs(DATA) { return 'globalThis.ETF_DATA=' + JSON.stringify(DATA) + ';\n'; }
  api.readDataJs = readDataJs; api.writeDataJs = writeDataJs;
})(typeof globalThis !== 'undefined' ? globalThis : this);
