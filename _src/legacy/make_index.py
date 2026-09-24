# 把静态模板 app.tpl.html 改造成引用 data.js + update.js 的 index.html（一次性迁移脚本）
import re, sys
s=open('_src/app.tpl.html',encoding='utf-8').read()
def sub1(old,new):
    global s
    assert s.count(old)==1, ('anchor not unique/missing:', old[:60], s.count(old))
    s=s.replace(old,new)

# 1. CSS：状态行
sub1('@media (prefers-reduced-motion:reduce){*{transition:none !important; animation:none !important}}',
'''/* 行情更新状态行 —— 标题下一行安静的小字，只有圆点换色 */
.feed{display:flex; align-items:center; gap:7px; margin-top:9px; font-size:11.5px; color:var(--ink-3)}
.feed i{width:6px; height:6px; border-radius:50%; background:var(--rule-2); flex:none}
.feed[data-state=busy] i{background:var(--ink-3); animation:feedPulse 1.1s ease-in-out infinite}
.feed[data-state=fresh] i{background:var(--jade)}
.feed[data-state=fail] i{background:var(--vermilion)}
.feed button{appearance:none; border:0; background:none; padding:0; font:inherit; font-size:11.5px; color:var(--ink-2); text-decoration:underline; text-underline-offset:2px; cursor:pointer}
.feed button:hover{color:var(--ink)}
.feed button:focus-visible{outline:2px solid var(--vermilion); outline-offset:1px}
.feed[data-state=busy] button{visibility:hidden}
@keyframes feedPulse{50%{opacity:.25}}
@media (prefers-reduced-motion:reduce){*{transition:none !important; animation:none !important}}''')

# 2. 标题下加状态行
sub1('''      <p>在一池ETF里每期只留最强的那几个。左边改权重和区间，右边的净值、回撤、轮动轨迹立刻重算。</p>
    </div>''',
'''      <p>在一池ETF里每期只留最强的那几个。左边改权重和区间，右边的净值、回撤、轮动轨迹立刻重算。</p>
      <p class="feed" id="feed"><i></i><span id="feedText"></span><button type="button" id="feedBtn">重新拉取</button></p>
    </div>''')

# 3. 数据加载：data.js + update.js + 浏览器缓存合并
sub1('''<script>
"use strict";
const RAW = __DATA__;''',
'''<script src="data.js"></script>
<script src="update.js"></script>
<script>
/* 仓库里的 data.js 是基线；浏览器上次从腾讯补拉的几天存在 localStorage，开页先接上再启动 */
(function(){
  const D=globalThis.ETF_DATA; if(!D) return;
  globalThis.ETF_BASE_LAST=D.cal[D.cal.length-1];
  try{
    const c=JSON.parse(localStorage.getItem('etf-live-delta-v1')||'null');
    if(!c || c.base!==globalThis.ETF_BASE_LAST || !c.cal || !c.cal.length) return;
    if(!D.assets.every(a=>c.px[a.code] && c.px[a.code].length===c.cal.length)) return;
    D.cal.push(...c.cal);
    for(const a of D.assets) a.px.push(...c.px[a.code]);
  }catch(e){}
})();
</script>
<script>
"use strict";
const RAW = globalThis.ETF_DATA;''')

# 4. LAST 可变
sub1('const LAST=fmtD(CAL[CAL.length-1]), FIRST=fmtD(CAL[0]);',
     'let LAST=fmtD(CAL[CAL.length-1]); const FIRST=fmtD(CAL[0]);')

# 5. 启动后补拉
sub1('''buildRail(); run();
</script>
</body>''',
'''buildRail(); run();

/* ── 开页向腾讯补拉仓库数据之后的交易日 ─────────────────────────── */
const feed=document.getElementById('feed'), feedText=document.getElementById('feedText');
function setFeed(state,msg){ feed.dataset.state=state; feedText.textContent=msg; }
function cnDate(d){ return `${+d.slice(4,6)}月${+d.slice(6,8)}日`; }
let liveBusy=false;
async function liveUpdate(){
  if(liveBusy || !globalThis.ETFUpdater) return; liveBusy=true;
  const before=CAL[CAL.length-1], wasAtEnd=(P.end===LAST);
  setFeed('busy', `行情到 ${cnDate(before)}，正在向腾讯拉取之后的交易日`);
  try{
    const r=await ETFUpdater.update(RAW);
    if(r.added>0){
      try{
        const b=CAL.indexOf(globalThis.ETF_BASE_LAST)+1, px={};
        for(const a of ASSETS) px[a.code]=a.px.slice(b);
        localStorage.setItem('etf-live-delta-v1', JSON.stringify({base:globalThis.ETF_BASE_LAST, cal:CAL.slice(b), px, at:Date.now()}));
      }catch(e){}
      LAST=fmtD(CAL[CAL.length-1]);
      document.getElementById('dataEnd').textContent=LAST;
      if(wasAtEnd) P.end=LAST;
      buildRail(); run(); paintPresetStats(true);
      setFeed('fresh', `行情到 ${cnDate(r.last)}，刚从腾讯补了 ${r.added} 个交易日`);
    }else{
      setFeed('fresh', `行情到 ${cnDate(before)}，已是最新。交易日 17:00 后才有当天收盘`);
    }
  }catch(e){
    setFeed('fail', `行情到 ${cnDate(before)}，没连上腾讯行情，用的是已存的数据`);
  }
  liveBusy=false;
}
document.getElementById('feedBtn').onclick=liveUpdate;
setFeed('', `行情到 ${cnDate(CAL[CAL.length-1])}`);
liveUpdate();
</script>
</body>''')

assert '__DATA__' not in s
open('index.html','w',encoding='utf-8').write(s)
print('index.html written', len(s))
