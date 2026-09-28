# 给 index.html 加：效率动量因子 / 排名合成模式 / 冷却期强制卖出 / 三套双动量预设
# 幂等：已打过补丁就跳过。所有替换锚点必须唯一。
import sys
path='/Users/likang/Desktop/ETF轮动记录台/index.html'
s=open(path,encoding='utf-8').read()
if 'forceSellRank' in s:
    print('already patched'); sys.exit(0)
def sub1(old,new):
    global s
    n=s.count(old); assert n==1, ('anchor count %d: %s'%(n,old[:70]))
    s=s.replace(old,new)

# ── 参数默认值 ──
sub1("  w:{trend:100, mom:0, rs:0, lowvol:0, rev:0},\n  win:{trend:25, mom:60, vol:20, rev:5},",
     "  w:{trend:100, mom:0, rs:0, lowvol:0, rev:0, eff:0},\n  win:{trend:25, mom:60, vol:20, rev:5, eff:20},\n  combine:'z',")
sub1("  maWin:0, volTarget:0, volTgtWin:20, ddBrake:0, minHold:0, corrCap:0, corrWin:60,\n  tuShare:0,",
     "  maWin:0, volTarget:0, volTgtWin:20, ddBrake:0, minHold:0, forceSellRank:0, corrCap:0, corrWin:60,\n  tuShare:0,")
sub1("const RK0={maWin:0, volTarget:0, volTgtWin:20, ddBrake:0, minHold:0, corrCap:0, corrWin:60,\n           switchGap:0, leverMax:100, marginRate:6};",
     "const RK0={maWin:0, volTarget:0, volTgtWin:20, ddBrake:0, minHold:0, forceSellRank:0, corrCap:0, corrWin:60,\n           switchGap:0, leverMax:100, marginRate:6};\n"
     "// 老预设的 w / win 里没有 eff，套用后补齐默认值，滑块和引擎才不会拿到 undefined\n"
     "function fillP(){ P.w.eff??=0; P.win.eff??=20; P.combine??='z'; P.forceSellRank??=0; }")

# ── 三套双动量预设：插在「原文＋真实摩擦」之后 ──
anchor_preset="  {n:'第二篇·降回撤版',"
new_presets = r"""  {n:'第三篇·双动量', d:'斜率动量排名 50% ＋ 效率动量排名 50%，综合排名第一的那只 · 当日收盘 · 不计成本',
   ex:{q:'第三篇文章（2025-12-25）问：斜率动量稳但钝、效率动量灵但碎，非要二选一吗？作者的答案是把两个排名加权合成。',
       h:'效率动量 = 20 日涨跌幅 × 效率系数。效率系数是考夫曼自适应均线里的概念，等于「位移 ÷ 路程」：单边直上接近 1，来回震荡接近 0。每天给池内每只 ETF 分别算斜率动量名次和效率动量名次，两个名次各 50% 加起来，综合名次最小的那只全仓持有。合成方式在「因子」组里切到「排名合成」，这就是它跟 z 分加权的区别：只看名次，不看差多少。',
       c:'文章给的是年化 35.49%、回撤 27.84%、11 年开平仓 277 次。四只标的两个名次相加很容易打平（1+2 对 2+1），文章源码在付费社群拿不到，这里同名次先留在手的、再看 z 分谁高，换手比文章少，收益略低。回撤依旧三成上下 —— 双动量没有改变全仓押一只的性质。'},
   p:{pool:['510880','159915','513100','518880'], w:{trend:50,mom:0,rs:0,lowvol:0,rev:0,eff:50},
      win:{trend:25,mom:60,vol:20,rev:5,eff:20}, combine:'rank', topK:1, freq:'D', nDays:20,
      absOn:false, absThresh:0, buffer:0, costBps:0, cashRate:1.5, exec:'same', ...AW0, ...RK0, ...TU0}},

  {n:'第三篇·双动量＋冷却期', d:'同上，买进至少持 3 个交易日；综合排名跌到第 3 名就不等了',
   ex:{q:'双动量比纯效率动量少换了两成手，但每天都可能换仓，震荡期还是来回打脸。群友建议加个冷却期。',
       h:'两道配套：「最小持有期」3 个交易日，没到期不卖；「冷却期强制卖出」设为第 3 名，在手的综合排名跌到第 3 或更差时，即使没持满 3 天也立刻换掉。文章原参数就是 3 和 3。',
       c:'文章给的是年化 32.47%、回撤 26.49%、235 次，比不加冷却期少赚 3 个点。我这边的数据上冷却期反而略有帮助，说明这 2~3 个点本来就在噪音范围里。别把这套参数的收益差当规律。'},
   p:{pool:['510880','159915','513100','518880'], w:{trend:50,mom:0,rs:0,lowvol:0,rev:0,eff:50},
      win:{trend:25,mom:60,vol:20,rev:5,eff:20}, combine:'rank', topK:1, freq:'D', nDays:20,
      absOn:false, absThresh:0, buffer:0, costBps:0, cashRate:1.5, exec:'same', ...AW0, ...RK0, ...TU0,
      minHold:3, forceSellRank:3}},

  {n:'双动量＋真实摩擦', d:'冷却期版改成次日收盘成交＋单边 5bp，这是双动量诚实的基线',
   ex:{q:'上面两套跟文章一样按当日收盘价成交、不计成本，实盘做不到。',
       h:'规则不变，只换执行口径：当日收盘算信号、次日收盘成交，按换手金额收单边 5bp。',
       c:'跟纯斜率版的「原文＋真实摩擦」放一起比：双动量多赚 2~3 个点，换手接近，回撤没有改善。它是纯斜率版的一个略好的替代，不是另一种风险特征。'},
   p:{pool:['510880','159915','513100','518880'], w:{trend:50,mom:0,rs:0,lowvol:0,rev:0,eff:50},
      win:{trend:25,mom:60,vol:20,rev:5,eff:20}, combine:'rank', topK:1, freq:'D', nDays:20,
      absOn:false, absThresh:0, buffer:0, costBps:5, cashRate:1.5, exec:'next', ...AW0, ...RK0, ...TU0,
      minHold:3, forceSellRank:3}},

"""
sub1(anchor_preset, new_presets+anchor_preset)

# ── 引擎：因子 ──
sub1("                    : {trend:1,mom:0,rs:0,lowvol:0,rev:0};",
     "                    : {trend:1,mom:0,rs:0,lowvol:0,rev:0,eff:0};")
sub1("  const use={trend: wn.trend>0 || p.absOn, mom: wn.mom>0 || wn.rs>0,\n             vol: wn.lowvol>0 || wn.rs>0, rev: wn.rev>0};\n  if(!use.trend && !use.mom && !use.vol && !use.rev) use.trend=true;\n  const maxW=Math.max(use.trend?W.trend:1, use.mom?W.mom+1:1, use.vol?W.vol+1:1, use.rev?W.rev+1:1,",
     "  const Weff=W.eff||20;\n  const use={trend: wn.trend>0 || p.absOn, mom: wn.mom>0 || wn.rs>0,\n             vol: wn.lowvol>0 || wn.rs>0, rev: wn.rev>0, eff: (wn.eff||0)>0};\n  if(!use.trend && !use.mom && !use.vol && !use.rev && !use.eff) use.trend=true;\n  const maxW=Math.max(use.trend?W.trend:1, use.mom?W.mom+1:1, use.vol?W.vol+1:1, use.rev?W.rev+1:1, use.eff?Weff+1:1,")
sub1("    const trend=new Array(M).fill(NaN), mom=[...trend], vol=[...trend], rs=[...trend], rev=[...trend];\n    for(let t=0;t<M;t++){\n      if(use.trend && has(c,t,W.trend)) trend[t]=regScore(a,t,W.trend);",
     "    const trend=new Array(M).fill(NaN), mom=[...trend], vol=[...trend], rs=[...trend], rev=[...trend], eff=[...trend];\n    for(let t=0;t<M;t++){\n      if(use.trend && has(c,t,W.trend)) trend[t]=regScore(a,t,W.trend);\n"
     "      // 效率动量 = 区间涨跌幅 × 效率系数(位移÷路程)。单边直上系数接近 1，来回震荡接近 0\n"
     "      if(use.eff && has(c,t,Weff+1)){ let path=0; for(let k=0;k<Weff;k++) path+=Math.abs(a[t-k]-a[t-k-1]);\n"
     "        const er = path>1e-12 ? Math.abs(a[t]-a[t-Weff])/path : 0; eff[t]=(a[t]/a[t-Weff]-1)*er; }")
sub1("    F[c]={trend, mom, rs, lowvol:vol.map(v=>-v), rev};",
     "    F[c]={trend, mom, rs, lowvol:vol.map(v=>-v), rev, eff};")

# ── 引擎：合成方式（z 分加权 / 排名加权）──
sub1("""    for(const c of codes){
      let tot=0, ok=true;
      for(const k of keys) if(wn[k]){ const z=zs[c][k][t]; if(!isFinite(z)){ ok=false; break; } tot+=wn[k]*z; }
      score[c][t] = ok ? tot : NaN;
    }
  }
""","""    // 排名合成（第三篇的做法）：每个因子只看名次（1 最好，同分同名次），加权求和，名次和越小越好。
    // 得分取负数让「越大越好」的约定不变；再加极小的 z 分尾数，让完全打平的名次和有个确定的先后。
    const rk={};
    if(p.combine==='rank') for(const k of keys){
      if(!wn[k]) continue;
      const live=codes.filter(c=>isFinite(F[c][k][t])).sort((a,b)=>F[b][k][t]-F[a][k][t]);
      rk[k]={}; live.forEach((c,i)=>{ rk[k][c] = (i>0 && F[c][k][t]===F[live[i-1]][k][t]) ? rk[k][live[i-1]] : i+1; });
    }
    for(const c of codes){
      let tot=0, rsum=0, ok=true;
      for(const k of keys) if(wn[k]){ const z=zs[c][k][t]; if(!isFinite(z)){ ok=false; break; } tot+=wn[k]*z;
        if(p.combine==='rank') rsum+=wn[k]*rk[k][c]; }
      score[c][t] = !ok ? NaN : (p.combine==='rank' ? -rsum + 1e-6*tot : tot);
    }
  }
""")

# ── 引擎：最小持有期 + 冷却期强制卖出；排名合成下同分留在手的 ──
sub1("""    if(lastTgt && p.minHold>0 && (t-heldSince)<p.minHold) return {w:{...lastTgt.w}, pick:lastTgt.pick.slice(), hold:true};
    const rank = codes.filter(c=>isFinite(score[c][t])).sort((a,b)=>score[b][t]-score[a][t]);
    if(!rank.length) return {w:{[CASH]:1}, pick:[]};""",
"""    const rank = codes.filter(c=>isFinite(score[c][t])).sort((a,b)=>score[b][t]-score[a][t]);
    if(lastTgt && p.minHold>0 && (t-heldSince)<p.minHold){
      // 冷却期内照旧端着 —— 除非开了「强制卖出排名」且在手的名次已跌到阈值或更差
      const forced = p.forceSellRank>0 && lastTgt.pick.some(c=>{ const i=rank.indexOf(c); return i<0 || i+1>=p.forceSellRank; });
      if(!forced) return {w:{...lastTgt.w}, pick:lastTgt.pick.slice(), hold:true};
    }
    if(!rank.length) return {w:{[CASH]:1}, pick:[]};""")
sub1("""    const bar = rank.length>=p.topK ? score[rank[p.topK-1]][t] : -Infinity;
    const chosen = pick.filter(c=>rank.indexOf(c)>-1 &&
                       (rank.indexOf(c)<keepLim ||
                        (p.switchGap>0 && bar - score[c][t] <= p.switchGap)))""",
"""    const bar = rank.length>=p.topK ? score[rank[p.topK-1]][t] : -Infinity;
    // 排名合成下名次和打平（只差 z 分尾数）视为同分，在手的不换；真正的名次差至少 0.05
    const gap = p.switchGap>0 ? p.switchGap : (p.combine==='rank' ? 1e-5 : 0);
    const chosen = pick.filter(c=>rank.indexOf(c)>-1 &&
                       (rank.indexOf(c)<keepLim ||
                        (gap>0 && bar - score[c][t] <= gap)))""")

# ── 打分面板数据 ──
sub1("      trend:F[c].trend[lastT], mom:F[c].mom[lastT], vol:-F[c].lowvol[lastT]}))",
     "      trend:F[c].trend[lastT], mom:F[c].mom[lastT], vol:-F[c].lowvol[lastT], eff:F[c].eff[lastT]}))")
sub1("        <tr><td>年化波动</td><td>${isFinite(b.vol)?pct(b.vol,1):'—'}</td></tr></table>`;",
     "        <tr><td>年化波动</td><td>${isFinite(b.vol)?pct(b.vol,1):'—'}</td></tr>\n        ${P.w.eff>0?`<tr><td>${P.win.eff} 日效率动量</td><td>${isFinite(b.eff)?sPct(b.eff,2):'—'}</td></tr>`:''}</table>`;")

# ── 文案表 ──
sub1("const FLAB={trend:'趋势得分',mom:'区间动量',rs:'风险调整动量',lowvol:'低波动',rev:'短期反转'};",
     "const FLAB={trend:'趋势得分',mom:'区间动量',rs:'风险调整动量',lowvol:'低波动',rev:'短期反转',eff:'效率动量'};")
sub1("  rs:'区间涨幅 ÷ 同期年化波动',lowvol:'年化波动的相反数，偏好走得稳的',rev:'近期涨幅的相反数，追高时压一压'};",
     "  rs:'区间涨幅 ÷ 同期年化波动',lowvol:'年化波动的相反数，偏好走得稳的',rev:'近期涨幅的相反数，追高时压一压',\n  eff:'区间涨幅 × 效率系数（位移 ÷ 路程），走得直才算数，第三篇的另一半'};")
sub1("const FSHORT={trend:'趋势',mom:'动量',rs:'风调',lowvol:'低波',rev:'反转'};",
     "const FSHORT={trend:'趋势',mom:'动量',rs:'风调',lowvol:'低波',rev:'反转',eff:'效率'};")

# ── 侧栏：窗口列表加效率区间；因子组尾部加合成方式 ──
sub1("    ['vol','波动窗口','天'],['rev','反转窗口','天']\n  ].map(([k,l,u])=>`<div class=\"sld\"><div class=\"top\"><span class=\"lbl\">${l}</span>\n      <span class=\"val\">${P.win[k]} ${u}</span></div>\n      <input type=\"range\" min=\"${k==='rev'?2:5}\" max=\"${k==='mom'?250:120}\" step=\"${k==='rev'?1:5}\" value=\"${P.win[k]}\" data-win=\"${k}\"></div>`).join('');",
     "    ['vol','波动窗口','天'],['rev','反转窗口','天'],['eff','效率区间','天']\n  ].map(([k,l,u])=>`<div class=\"sld\"><div class=\"top\"><span class=\"lbl\">${l}</span>\n      <span class=\"val\">${P.win[k]} ${u}</span></div>\n      <input type=\"range\" min=\"${k==='rev'?2:5}\" max=\"${k==='mom'?250:120}\" step=\"${k==='rev'?1:5}\" value=\"${P.win[k]}\" data-win=\"${k}\"></div>`).join('')\n"
     "  + `<div class=\"fld\" style=\"margin-top:6px\"><label>多因子怎么合成</label>\n      <div class=\"seg\" id=\"segCombine\">\n        <button type=\"button\" data-cb=\"z\" aria-pressed=\"${P.combine==='z'}\">z 分加权</button>\n        <button type=\"button\" data-cb=\"rank\" aria-pressed=\"${P.combine==='rank'}\">排名加权</button>\n      </div>\n      <div class=\"sub\" style=\"margin-top:5px\">${P.combine==='rank'?'每个因子只看名次，加权求和，名次和最小的胜出。同名次时先留在手的。':'每个因子先在池内标准化成 z 分再加权，领先多少也算数。'}</div></div>`;")

# ── 风控组：最小持有期后面加冷却期强制卖出 ──
sub1("""      <div class="sub">买进去至少端这么久，压掉来回打脸的换手</div>
      <input type="range" min="0" max="60" step="1" value="${P.minHold}" data-mh="1"></div>""",
"""      <div class="sub">买进去至少端这么久，压掉来回打脸的换手</div>
      <input type="range" min="0" max="60" step="1" value="${P.minHold}" data-mh="1"></div>
    ${P.minHold>0?`<div class="sld"><div class="top"><span class="lbl">冷却期强制卖出</span>
      <span class="val">${off(P.forceSellRank)||('跌到第 '+P.forceSellRank+' 名就卖')}</span></div>
      <div class="sub">没持满也不硬扛：在手的排名跌到这个位置或更差，立刻换掉</div>
      <input type="range" min="0" max="${P.pool.length}" step="1" value="${Math.min(P.forceSellRank,P.pool.length)}" data-fs="1"></div>`:''}""")

# ── 事件 ──
sub1("    else if(t.dataset.mh){ P.minHold=+t.value; label(t, +t.value>0?(t.value+' 个交易日'):'关'); schedule(); }",
     "    else if(t.dataset.mh){ const was=P.minHold>0; P.minHold=+t.value; label(t, +t.value>0?(t.value+' 个交易日'):'关'); schedule(was!==(P.minHold>0)); }\n"
     "    else if(t.dataset.fs){ P.forceSellRank=+t.value; label(t, +t.value>0?('跌到第 '+t.value+' 名就卖'):'关'); schedule(); }")
sub1("  document.getElementById('segExec').onclick=e=>{\n    const b=e.target.closest('button'); if(!b) return; unpick(); P.exec=b.dataset.e; buildRail(); run(); };",
     "  document.getElementById('segExec').onclick=e=>{\n    const b=e.target.closest('button'); if(!b) return; unpick(); P.exec=b.dataset.e; buildRail(); run(); };\n"
     "  document.getElementById('segCombine').onclick=e=>{\n    const b=e.target.closest('button'); if(!b) return; unpick(); P.combine=b.dataset.cb; buildRail(); run(); };")

# ── 摘要文案 ──
sub1("  return (parts.join('/')||'趋势 100')+' · '+P.win.trend+' 日';",
     "  return (parts.join('/')||'趋势 100')+' · '+P.win.trend+' 日'+(P.combine==='rank'?' · 排名合成':'');")
sub1("  if(P.minHold>0) a.push('最短持有 '+P.minHold+' 日');\n  if(P.corrCap>0) a.push('相关 ≤'+P.corrCap.toFixed(2));",
     "  if(P.minHold>0) a.push('最短持有 '+P.minHold+' 日'+(P.forceSellRank>0?'（跌到第 '+P.forceSellRank+' 名强卖）':''));\n  if(P.corrCap>0) a.push('相关 ≤'+P.corrCap.toFixed(2));")
sub1("    P.maWin>0&&(P.maWin+' 日均线过滤'), P.minHold>0&&('最小持有 '+P.minHold+' 日'),\n    P.corrCap>0&&('相关 ≤ '+P.corrCap.toFixed(2)), P.absOn&&'趋势转负走现金'].filter(Boolean);",
     "    P.maWin>0&&(P.maWin+' 日均线过滤'), P.minHold>0&&('最小持有 '+P.minHold+' 日'+(P.forceSellRank>0?'／跌到第 '+P.forceSellRank+' 名强卖':'')),\n    P.corrCap>0&&('相关 ≤ '+P.corrCap.toFixed(2)), P.absOn&&'趋势转负走现金'].filter(Boolean);")
sub1("    wActive.join('／')||'趋势 100%',\n    '持 '+P.topK+' 只',",
     "    (wActive.join('／')||'趋势 100%')+(P.combine==='rank'?'（排名合成）':''),\n    '持 '+P.topK+' 只',")
sub1("    `权重：${w}　窗口：趋势${P.win.trend}/动量${P.win.mom}/波动${P.win.vol}/反转${P.win.rev}`,",
     "    `权重：${w}　合成：${P.combine==='rank'?'排名加权':'z 分加权'}　窗口：趋势${P.win.trend}/动量${P.win.mom}/波动${P.win.vol}/反转${P.win.rev}/效率${P.win.eff}`,")
sub1("P.minHold>0&&('最小持有'+P.minHold+'日'), P.corrCap>0&&('相关≤'+P.corrCap.toFixed(2))].filter(Boolean).join('　')||'全关'}`,",
     "P.minHold>0&&('最小持有'+P.minHold+'日'+(P.forceSellRank>0?'(跌到第'+P.forceSellRank+'名强卖)':'')), P.corrCap>0&&('相关≤'+P.corrCap.toFixed(2))].filter(Boolean).join('　')||'全关'}`,")

# ── 预设套用后补默认值 ──
sub1("function buildRail(){\n  document.getElementById('presets').innerHTML=",
     "function buildRail(){\n  fillP();\n  document.getElementById('presets').innerHTML=")
sub1("function run(){\n  const t=performance.now();\n  const r=backtest(P);",
     "function run(){\n  fillP();\n  const t=performance.now();\n  const r=backtest(P);")

open(path,'w',encoding='utf-8').write(s)
print('patched', len(s))
