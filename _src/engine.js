const fs=require('fs');
const RAW=(()=>{const t=fs.readFileSync(__dirname+'/../data.js','utf8');return JSON.parse(t.slice(t.indexOf('=')+1).replace(/;\s*$/,''))})();
const CAL=RAW.cal, ASSETS=RAW.assets;
const CASH = '__CASH__';

/* ── 参数 ────────────────────────────────────────────────────── */
const P = {
  pool:['510880','159915','513100','518880'],
  w:{trend:100, mom:0, rs:0, lowvol:0, rev:0, eff:0},
  win:{trend:25, mom:60, vol:20, rev:5, eff:20},
  combine:'z',
  topK:1, freq:'D', nDays:20,
  absOn:false, absThresh:0, buffer:0,
  costBps:5, cashRate:1.5, exec:'next',
  awShare:0, awPool:['510300','511010','518880'], awMode:'rp', awFreq:'M', awVol:60,
  maWin:0, volTarget:0, volTgtWin:20, ddBrake:0, minHold:0, forceSellRank:0, corrCap:0, corrWin:60,
  tuShare:0, tuIn:20, tuOut:10, tuAtr:20, tuStop:2, tuRisk:0.5,
  switchGap:0, leverMax:100, marginRate:6,
  start:'2015-01-01', end:CAL[CAL.length-1].replace(/(\d{4})(\d\d)(\d\d)/,'$1-$2-$3'),
  bench:'510300', logY:true
};
const AW0={awShare:0, awPool:['510300','511010','518880'], awMode:'rp', awFreq:'M', awVol:60};
const RK0={maWin:0, volTarget:0, volTgtWin:20, ddBrake:0, minHold:0, forceSellRank:0, corrCap:0, corrWin:60,
           switchGap:0, leverMax:100, marginRate:6};
// 老预设的 w / win 里没有 eff，套用后补齐默认值，滑块和引擎才不会拿到 undefined
function fillP(){ P.w.eff??=0; P.win.eff??=20; P.combine??='z'; P.forceSellRank??=0; }
const TU0={tuShare:0, tuIn:20, tuOut:10, tuAtr:20, tuStop:2, tuRisk:0.5};
const PRESETS = [
  {g:'复现与改进'},

  {n:'原文的改进版 2', d:'趋势得分 100% · 25 日窗口 · 只持 1 只 · 每日调仓 · 当日收盘成交 · 不计成本',
   ex:{q:'原文初版按「最近 N 日涨幅」排序，同样涨 10%，一路走上去和大起大落后涨上去被当成一样强。',
       h:'把排序规则换成趋势得分：取最近 25 天收盘价，先除以区间首日做归一化（不然不同价位的 ETF 斜率没法比），再对时间做一元线性回归，得分＝斜率 × R² × 10000。斜率管「涨得多快」，R² 管「涨得有多顺」，两者相乘才是又快又顺。每天重排，只留得分最高的一只，四只标的分别代表价值、成长、外盘、商品。',
       c:'这一套是用来对齐原文数字的，不是拿来实盘的：当日收盘价算信号、同一个收盘价成交，且完全不计佣金和滑点。年化里有一部分是这个口径送的，回撤也在三成上下，全部身家押一只。'},
   p:{pool:['510880','159915','513100','518880'], w:{trend:100,mom:0,rs:0,lowvol:0,rev:0},
      win:{trend:25,mom:60,vol:20,rev:5}, topK:1, freq:'D', nDays:20,
      absOn:false, absThresh:0, buffer:0, costBps:0, cashRate:1.5, exec:'same', ...AW0, ...RK0, ...TU0}},

  {n:'原文＋真实摩擦', d:'同上，改成次日收盘成交＋单边 5bp。摩擦一年吃掉约 2 个点',
   ex:{q:'上一套的成交假设做不到 —— 收盘价出来的那一刻，收盘已经结束了。',
       h:'规则一个字不改，只换执行口径：当日收盘算信号、次日收盘成交，并按换手金额收单边 5bp（佣金＋滑点）。',
       c:'年化被摩擦削掉约 2 个百分点，这就是这套策略诚实的基线。一年换手 15 倍多，回撤三成出头 —— 数字好看，但真金白银拿着的时候，连续几个月净值腰斩的滋味不是人人受得住。'},
   p:{pool:['510880','159915','513100','518880'], w:{trend:100,mom:0,rs:0,lowvol:0,rev:0},
      win:{trend:25,mom:60,vol:20,rev:5}, topK:1, freq:'D', nDays:20,
      absOn:false, absThresh:0, buffer:0, costBps:5, cashRate:1.5, exec:'next', ...AW0, ...RK0, ...TU0}},

  {n:'第三篇·双动量', d:'斜率动量排名 50% ＋ 效率动量排名 50%，综合排名第一的那只 · 当日收盘 · 不计成本',
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

  {n:'第二篇·降回撤版', d:'同样四只池、同样趋势得分，加「换仓得分阈值」和「波动降仓」，不融资',
   ex:{q:'第二篇文章（WWY 版）指出：原版基本是「全仓＋第一名切换」，排名一变就换，且不管市场颠不颠仓位都拉满。',
       h:'两道减震：① 新第一名必须明显领先在手的才换（得分差阈值，不是排名缓冲）；② 波动高时主动降仓，上限 100%。文章原文是 9:50 执行，这里只能用次日收盘近似。',
       c:'文章给的是年化 29.09%、回撤 15.80%；我这边用还原后的分红再投数据、次日收盘成交，跑出来收益低一截、回撤高一截。差异主要来自数据口径（聚宽前复权会高估红利 ETF 的收益）和执行时点。'},
   p:{pool:['518880','513100','159915','510880'], w:{trend:100,mom:0,rs:0,lowvol:0,rev:0},
      win:{trend:25,mom:60,vol:20,rev:5}, topK:1, freq:'D', nDays:20,
      absOn:false, absThresh:0, buffer:0, costBps:5, cashRate:1.5, exec:'next', ...AW0, ...RK0, ...TU0,
      switchGap:0.5, volTarget:16, volTgtWin:20}},

  {n:'第二篇·融资增强版', d:'在降回撤版之上，低波动时允许融资到 2 倍',
   ex:{q:'降回撤版把回撤砍了一半，但收益也掉了。文章的第三步：不是无脑加杠杆，而是「安静时借一点力」。',
       h:'把敞口上限从 100% 放到 200%：当实际波动明显低于目标时，目标仓位才会超过 100%；波动一起来就自动收回 1 倍甚至更低。超出部分按 6% 年利率计息。',
       c:'文章给的是年化 35.71%、回撤 16.79%（只比不融资版高不到 1 个点）。我这边复刻出来杠杆是帮倒忙的 —— 它在平静期加仓，而这个池子的平静期后面常跟着急跌。同一个机制换到「低回撤王」那个底子上才是正收益，见下面那组。'},
   p:{pool:['518880','513100','159915','510880'], w:{trend:100,mom:0,rs:0,lowvol:0,rev:0},
      win:{trend:25,mom:60,vol:20,rev:5}, topK:1, freq:'D', nDays:20,
      absOn:false, absThresh:0, buffer:0, costBps:5, cashRate:1.5, exec:'next', ...AW0, ...RK0, ...TU0,
      switchGap:0.5, volTarget:16, volTgtWin:20, leverMax:200, marginRate:6}},

  {n:'双持仓＋空仓保护', d:'趋势 80%／低波 20% · 持 2 只 · 缓冲 1 名 · 趋势转负那份走现金',
   ex:{q:'只持一只的回撤太大，而且四只标的全线下跌时策略还是满仓 —— 它只会挑「跌得最少的」，不会走人。',
       h:'四件事一起上：① 同时持 2 只各 50%，分掉单只的运气成分；② 打分里掺 20% 低波动因子（年化波动的相反数），同分情况下偏向走得稳的；③ 加 1 名换手缓冲带 —— 在手的标的掉出前 2 名、但仍在前 3 名内就不换，省掉大量在名次边缘反复横跳的无效换手；④ 空仓保护：入选标的的趋势得分转负时，那一份仓位换成现金。',
       c:'回撤砍掉一半，代价是年化也降了不少。分仓和空仓保护在单边牛市里都会拖后腿 —— 涨得最猛的那只只占一半仓，而空仓保护偶尔会在反弹起点把你踢出场。'},
   p:{pool:['510880','159915','513100','518880'], w:{trend:80,mom:0,rs:0,lowvol:20,rev:0},
      win:{trend:25,mom:60,vol:20,rev:5}, topK:2, freq:'D', nDays:20,
      absOn:true, absThresh:0, buffer:1, costBps:5, cashRate:1.5, exec:'next', ...AW0, ...RK0, ...TU0}},

  {n:'三持仓＋低换手', d:'趋势 65%／低波 35% · 池加国债 · 持 3 只 · 每周调仓 · 年换手降到 4 倍上下',
   ex:{q:'日频调仓一年换手十几倍，摩擦、盯盘、心态成本都不低；而且池子里没有一个真正的避险去处 —— 股跌的时候只能挑另一只股。',
       h:'池子里加进国债 ETF 五年，让策略在股票普跌时有地方可去；同时持 3 只各三分之一；低波权重提到 35%；趋势窗口收短到 15 天（周频下反应会变慢，窗口收短来补）；调仓改成每周最后一个交易日。',
       c:'年换手从十几倍降到四倍出头，回撤和卡玛都更好。代价是周内出事只能等到周末才动，急跌那几天只能干看着。'},
   p:{pool:['510880','159915','513100','518880','511010'], w:{trend:65,mom:0,rs:0,lowvol:35,rev:0}, win:{trend:15,mom:60,vol:20,rev:5}, topK:3, freq:'W', nDays:10,
      absOn:false, absThresh:0, buffer:1, costBps:5, cashRate:1.5, exec:'next', ...AW0, ...RK0, ...TU0}},

  {n:'波动目标＋最小持有', d:'在上一套之上加波动率目标 22% 和 5 日最小持有期。纯轮动里卡玛最高的一套',
   ex:{q:'上一套始终满仓 —— 市场安静的时候满仓，市场开始剧烈晃动的时候也还是满仓。另外周频下仍有一部分换手是「换了又换回来」。',
       h:'加两层：① 波动率目标 22% —— 每天用组合最近 20 天的实际年化波动跟目标比，超了就按「目标 ÷ 实际」的比例降敞口，降下来的钱拿现金，上限 100%（不加杠杆，只会减仓不会加杠杆）；② 最小持有期 5 天 —— 买进去至少端一周，压掉来回打脸的换手。',
       c:'两段区间之外还在 2016 起、2019 起分别验过，卡玛都是同类里最高的。但要清楚：波动率目标本质是「事后降仓」，用的是已经发生的波动，急跌第一天照样吃满；实测平均敞口 99%，说明它大部分时间没在起作用，这一套的提升其实主要来自最小持有期。'},
   p:{pool:['510880','159915','513100','518880','511010'], w:{trend:65,mom:0,rs:0,lowvol:35,rev:0}, win:{trend:15,mom:60,vol:20,rev:5}, topK:3, freq:'W', nDays:10,
      absOn:false, absThresh:0, buffer:1, costBps:5, cashRate:1.5, exec:'next', ...AW0, ...RK0, ...TU0,
      volTarget:22, minHold:5}},

  {n:'广池＋分散约束', d:'七只标的（加小盘、港股） · 相关系数超 0.7 的不同时持 · 波动目标 22%',
   ex:{q:'池子一宽就容易撞上高度相关的两只 —— 创业板和中证1000、纳指和标普500 都是一涨一起涨。名义上持了 3 只、分散了，实际是同一个风险敞口下两注。',
       h:'池子扩到七只（加中证1000、恒生）；开分散约束 —— 挑第二、第三只时，只要跟已选标的近 60 日相关系数超过 0.7 就跳过，宁可名额空着放现金；配上波动率目标 22%。',
       c:'回撤是全部方案里最小的，三段区间也最稳。代价是约束经常让仓位凑不满，长期少赚一截；另外池子越宽，「哪只该进池」这个纯主观的选择对结果的影响就越大。'},
   p:{pool:['510880','159915','513100','518880','511010','512100','159920'],
      w:{trend:65,mom:0,rs:0,lowvol:35,rev:0}, win:{trend:15,mom:60,vol:20,rev:5}, topK:3, freq:'W', nDays:10, absOn:false, absThresh:0, buffer:1,
      costBps:5, cashRate:1.5, exec:'next', ...AW0, ...RK0, ...TU0, corrCap:0.7, corrWin:60, volTarget:22}},

  {g:'低回撤优先'},

  {n:'低回撤王（不融资）', d:'核心五只＋豆粕 · 趋势50／低波50 · 持 3 只 · 周频 · 得分差阈值 0.5 · 波动目标 10%',
   ex:{q:'前面几套的回撤都在一成以上。如果把「回撤尽量小」当第一目标，不加杠杆能做到什么程度？',
       h:'三处一起改：① 池子里加进豆粕 ETF —— 它跟核心五只的相关系数只有 0.02~0.14，是这个市场上少有的真正独立的品种；② 低波因子权重提到 50%，跟趋势得分平起平坐；③ 换仓改成看得分差（挑战者要领先 0.5 分才换），再叠一层 10% 的波动率目标。',
       c:'这是全工具不加杠杆时卡玛最高的一套，回撤压到六个多点。代价是年化只有十四个点上下 —— 低波因子权重一半，本质上是主动少赚波动大的那部分钱。'},
   p:{pool:['510880','159915','513100','518880','511010','159985'], w:{trend:50,mom:0,rs:0,lowvol:50,rev:0}, win:{trend:15,mom:60,vol:20,rev:5}, topK:3, freq:'W', nDays:10,
      absOn:false, absThresh:0, buffer:1, costBps:5, cashRate:1.5, exec:'next', ...AW0, ...RK0, ...TU0,
      volTarget:10, volTgtWin:20, minHold:5, switchGap:0.5}},

  {n:'最稳三袖（不融资）', d:'上一套 70%＋海龟 30%，波动目标 8%。全工具回撤最小、卡玛最高',
   ex:{q:'低回撤王已经很稳，但单一逻辑总有失灵的时候。',
       h:'在低回撤王的基础上分 30% 仓位给海龟腿（破 20 日新高进、破 10 日新低出），每月末重置比例；波动率目标收到 8%。',
       c:'回撤只剩四个多点，卡玛 2.5 上下，是全工具最高的。但年化也压到了十一二个点 —— 这套的定位是「几乎不会让你难受」，不是「赚得多」。'},
   p:{pool:['510880','159915','513100','518880','511010','159985'], w:{trend:50,mom:0,rs:0,lowvol:50,rev:0}, win:{trend:15,mom:60,vol:20,rev:5}, topK:3, freq:'W', nDays:10,
      absOn:false, absThresh:0, buffer:1, costBps:5, cashRate:1.5, exec:'next', ...AW0, ...RK0,
      volTarget:8, volTgtWin:20, minHold:5, switchGap:0.5,
      tuShare:30, tuIn:20, tuOut:10, tuAtr:20, tuStop:2, tuRisk:0.5}},

  {n:'贴近 20%（1.5 倍融资）', d:'低回撤王换 60 日波动窗口、目标 12%，敞口上限放到 150%。全期 19%／回撤 9.6%',
   ex:{q:'目标是年化 20% 且回撤小于 10%。不加杠杆的极限是 14% 年化，差得远 —— 但底子的卡玛有 2.2，说明它「每承受一分回撤换来的收益」很高，缺的只是仓位。',
       h:'把波动观测窗口从 20 日拉到 60 日（敞口更稳、换手更低），波动目标定 12%，敞口上限从 100% 放到 150%：市场安静时自动融资到 1.3~1.5 倍，一颠就收回来。超过 100% 的部分按 6% 年利率计融资成本。',
       c:'全期年化 19.0%、回撤 9.6%，离「20% 且小于 10%」只差最后一个百分点 —— 全期范围内我没找到能同时满足的组合。2019 年起这套是 22.1%／−9.6%，是达标的。融资会同时放大亏损，实盘还有融资额度、标的名单、利率浮动的问题，这些回测里都没有。'},
   p:{pool:['510880','159915','513100','518880','511010','159985'], w:{trend:50,mom:0,rs:0,lowvol:50,rev:0}, win:{trend:15,mom:60,vol:20,rev:5}, topK:3, freq:'W', nDays:10,
      absOn:false, absThresh:0, buffer:1, costBps:5, cashRate:1.5, exec:'next', ...AW0, ...RK0, ...TU0,
      volTarget:12, volTgtWin:60, minHold:5, switchGap:0.5, leverMax:150, marginRate:6}},

  {g:'多策略融合'},

  {n:'纯海龟（20进／10出）', d:'不做轮动，只看海龟腿：破 20 日新高进、破 10 日新低出、2 倍 ATR 止损、按 ATR 定头寸',
   ex:{q:'轮动是横向比较 —— 永远在池子里选相对最强的，哪怕全都在跌。海龟是完全另一套逻辑：每只标的各自判断，不跟别人比。',
       h:'经典唐奇安通道：收盘价创 20 日新高就买入，跌破 10 日新低就清掉，另加 2 倍 ATR 止损（从入场价往下两个 ATR 就砍）。头寸不是等权，而是按「风险预算 0.5% × 价格 ÷ ATR」定、上限 1/n —— 一个 ATR 的波动最多亏掉净值的 0.5%，所以波动大的标的自动买得少。手上只有收盘价，ATR 用日间绝对涨跌近似真实波幅。',
       c:'参数上 20 进／10 出明显优于经典的 55 进／20 出（后者在这个 ETF 池上只有 5.8% 年化、22.5% 回撤）。但海龟单独跑并不划算：收益不高，换手却有 11 倍 —— A 股 ETF 的假突破太多。它真正的价值在下一套。'},
   p:{pool:['510880','159915','513100','518880','511010'], w:{trend:65,mom:0,rs:0,lowvol:35,rev:0}, win:{trend:15,mom:60,vol:20,rev:5}, topK:3, freq:'W', nDays:10,
      absOn:false, absThresh:0, buffer:1, costBps:5, cashRate:1.5, exec:'next', ...AW0, ...RK0, ...TU0,
      tuShare:100}},

  {n:'轮动＋海龟五五开', d:'一半仓位跑轮动，一半仓位跑海龟。两套的进出时点很不一样，混起来回撤明显更小',
   ex:{q:'轮动和海龟都能赚钱，但赚钱和亏钱的时点不一样：轮动看「谁比谁强」，在震荡市里会不停换来换去；海龟看「自己破不破位」，在震荡市里会大量止损、但在单边行情里咬得住。两者的回撤往往不在同一段时间。',
       h:'一半仓位跑第 5 套轮动（含波动目标和最小持有），一半跑上面那套海龟，每月最后一个交易日把两边比例重置回 50/50（不重置的话赢家会越滚越大，等于自动加仓已经涨过的那套）。',
       c:'回撤从一成一降到七个多点，卡玛升到 1.60。典型的用收益换平滑 —— 年化比纯轮动低了近五个点。换手也升到近 8 倍，因为两套都在各自换。'},
   p:{pool:['510880','159915','513100','518880','511010'], w:{trend:65,mom:0,rs:0,lowvol:35,rev:0}, win:{trend:15,mom:60,vol:20,rev:5}, topK:3, freq:'W', nDays:10,
      absOn:false, absThresh:0, buffer:1, costBps:5, cashRate:1.5, exec:'next', ...AW0, ...RK0, ...TU0,
      volTarget:22, minHold:5, tuShare:50}},

  {n:'纯全天候底仓', d:'不做轮动，只看风险平价组合本身长什么样',
   ex:{q:'前面每一套都在择时。这一套不择时，纯粹看「不预测、只配置」能做到什么程度 —— 桥水全天候的核心思路。',
       h:'沪深300、国债五年、黄金三条腿，按各自近 60 日年化波动的倒数配权：波动小的配得多，让三条腿对组合的风险贡献大致相等（这就是风险平价，不是等权）。每月再平衡一次，把涨多了的那条腿削回去。',
       c:'回撤只有四五个点，非常好睡。但风险平价必然把大头压给债券，所以收益天花板很低；而且它对利率环境的依赖比看上去大 —— 过去十年债券的这段长牛未必再来。'},
   p:{pool:['510880','159915','513100','518880'], w:{trend:100,mom:0,rs:0,lowvol:0,rev:0},
      win:{trend:25,mom:60,vol:20,rev:5}, topK:1, freq:'D', nDays:20,
      absOn:false, absThresh:0, buffer:0, costBps:5, cashRate:1.5, exec:'next', ...RK0, ...TU0,
      awShare:100, awPool:['510300','511010','518880'], awMode:'rp', awFreq:'M', awVol:60}},

  {n:'动量＋全天候五五开', d:'一半仓位跑轮动，一半仓位做风险平价底仓（股／债／金），每月再平衡',
   ex:{q:'轮动是进攻性的、集中的；全天候是防守性的、分散的。把两者对半放，看能不能各取所长。',
       h:'一半仓位跑第 3 套轮动（双持仓＋空仓保护），一半做上面那套风险平价底仓，每月末重置两边比例。',
       c:'底仓收益低，所以混得越多年化越低 —— 底仓从 0 加到 75% 的过程中，夏普从 0.95 一路升到 1.14，年化一路降。这一套要的是睡得着，不是赚得多。'},
   p:{pool:['510880','159915','513100','518880'], w:{trend:80,mom:0,rs:0,lowvol:20,rev:0},
      win:{trend:25,mom:60,vol:20,rev:5}, topK:2, freq:'D', nDays:20,
      absOn:true, absThresh:0, buffer:1, costBps:5, cashRate:1.5, exec:'next', ...RK0, ...TU0,
      awShare:50, awPool:['510300','511010','518880'], awMode:'rp', awFreq:'M', awVol:60}},

  {n:'三袖均衡 40／30／30', d:'轮动 40%＋海龟 30%＋全天候 30%。三段区间实测下来卡玛最高、回撤最小的一套',
   ex:{q:'既然轮动、海龟、全天候三套的赚亏时点都不同步，那就不要二选一。',
       h:'轮动 40%（第 5 套，含波动目标和最小持有）＋海龟 30%＋风险平价底仓 30%，每月最后一个交易日把三边比例重置回 40/30/30。三套各自在自己的仓位里独立运行、独立计成本。',
       c:'夏普和卡玛都是整个工具里最高的，回撤只有六个点，年换手五倍出头。但年化只有一成，跑不赢单跑轮动 —— 而且实盘要同时维护三套逻辑，执行复杂度最高，任何一套走样都会拖累整体。'},
   p:{pool:['510880','159915','513100','518880','511010'], w:{trend:65,mom:0,rs:0,lowvol:35,rev:0}, win:{trend:15,mom:60,vol:20,rev:5}, topK:3, freq:'W', nDays:10,
      absOn:false, absThresh:0, buffer:1, costBps:5, cashRate:1.5, exec:'next', ...RK0, ...TU0,
      volTarget:22, minHold:5, tuShare:30, awShare:30, awPool:['510300','511010','518880'], awMode:'rp', awFreq:'M', awVol:60}}
];


/* ── 小工具 ──────────────────────────────────────────────────── */
const fmtD = s => s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8);
const pct = (v,d=2) => (v>=0?'':'\u2212')+Math.abs(v*100).toFixed(d)+'%';
const sPct = (v,d=2) => (v>=0?'+':'−')+Math.abs(v*100).toFixed(d)+'%';
const num = (v,d=2) => v.toFixed(d);
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const byCode = {}; ASSETS.forEach((a,i)=>byCode[a.code]={...a, slot:i});
const colorOf = code => code===CASH ? INK3 : SERIES[P.pool.indexOf(code) % 8];

/* ── 回测引擎 ────────────────────────────────────────────────── */
function regScore(px, t, W){                 // 归一化收盘价对时间回归：斜率×R²×10000
  const p0 = px[t-W+1]; if(!(p0>0)) return NaN;
  let sx=0,sy=0,sxx=0,sxy=0,syy=0;
  for(let k=0;k<W;k++){ const x=k+1, y=px[t-W+1+k]/p0;
    sx+=x; sy+=y; sxx+=x*x; sxy+=x*y; syy+=y*y; }
  const Sxx=sxx-sx*sx/W, Sxy=sxy-sx*sy/W, Syy=syy-sy*sy/W;
  if(Sxx<=0 || Syy<=1e-14) return 0;
  return 1e4*(Sxy/Sxx)*(Sxy*Sxy/(Sxx*Syy));
}

function backtest(p){
  const codes = p.pool.slice();
  const awOn = p.awShare>0 && p.awPool.length>0;
  const tuOn = p.tuShare>0;
  const need = codes.slice(); if(p.bench!=='EW' && !need.includes(p.bench)) need.push(p.bench);
  if(awOn) for(const c of p.awPool) if(!need.includes(c)) need.push(c);
  // 1. 交易日历：基准有价、且池子里至少两只有价的日子。
  //    标的按各自上市时间入池 —— 不再要求全池共同交易日，否则加一只 2020 年才上市的
  //    商品 ETF 就会把整段回测砍到 2020 年起。
  const benchCodes = p.bench==='EW' ? codes : [p.bench];
  const T=[];
  for(let i=0;i<CAL.length;i++){
    let bok=true; for(const c of benchCodes) if(!(byCode[c].px[i]>0)){ bok=false; break; }
    if(!bok) continue;
    let k=0; for(const c of codes) if(byCode[c].px[i]>0) k++;
    if(k>=Math.min(2,codes.length)) T.push(i);
  }
  if(T.length<60) return {err:'这组标的可用的交易日太少，换个基准或加几只上市早的标的。'};
  const M=T.length, dates=T.map(i=>CAL[i]);
  const px={}; for(const c of need) px[c]=T.map(i=>byCode[c].px[i]);   // 0 ＝ 当时还没上市
  const ret={}, runLen={};
  for(const c of need){
    const a=px[c], r=new Array(M).fill(0), L=new Array(M).fill(0);
    for(let t=0;t<M;t++){
      L[t] = a[t]>0 ? (t?L[t-1]:0)+1 : 0;
      if(t && a[t]>0 && a[t-1]>0) r[t]=a[t]/a[t-1]-1;
    }
    ret[c]=r; runLen[c]=L;
  }
  const has=(c,t,W)=>runLen[c][t]>=W;

  // 2. 权重归一（先算，才知道哪些因子真要算、要留多长的预热期）
  let wsum=0; for(const k in p.w) wsum+=p.w[k];
  const wn = wsum>0 ? Object.fromEntries(Object.entries(p.w).map(([k,v])=>[k,v/wsum]))
                    : {trend:1,mom:0,rs:0,lowvol:0,rev:0,eff:0};
  const W=p.win;
  const Weff=W.eff||20;
  const use={trend: wn.trend>0 || p.absOn, mom: wn.mom>0 || wn.rs>0,
             vol: wn.lowvol>0 || wn.rs>0, rev: wn.rev>0, eff: (wn.eff||0)>0};
  if(!use.trend && !use.mom && !use.vol && !use.rev && !use.eff) use.trend=true;
  const maxW=Math.max(use.trend?W.trend:1, use.mom?W.mom+1:1, use.vol?W.vol+1:1, use.rev?W.rev+1:1, use.eff?Weff+1:1,
                      (awOn && p.awMode==='rp') ? p.awVol+1 : 1,
                      p.maWin>0 ? p.maWin : 1, p.corrCap>0 ? p.corrWin+1 : 1,
                      tuOn ? Math.max(p.tuIn, p.tuOut, p.tuAtr)+1 : 1);

  // 3. 因子 + 横截面 z 分 → 总分
  const F={};
  for(const c of codes){
    const a=px[c], r=ret[c];
    const trend=new Array(M).fill(NaN), mom=[...trend], vol=[...trend], rs=[...trend], rev=[...trend], eff=[...trend];
    for(let t=0;t<M;t++){
      if(use.trend && has(c,t,W.trend)) trend[t]=regScore(a,t,W.trend);
      // 效率动量 = 区间涨跌幅 × 效率系数(位移÷路程)。单边直上系数接近 1，来回震荡接近 0
      if(use.eff && has(c,t,Weff+1)){ let path=0; for(let k=0;k<Weff;k++) path+=Math.abs(a[t-k]-a[t-k-1]);
        const er = path>1e-12 ? Math.abs(a[t]-a[t-Weff])/path : 0; eff[t]=(a[t]/a[t-Weff]-1)*er; }
      if(use.mom && has(c,t,W.mom+1)) mom[t]=a[t]/a[t-W.mom]-1;
      if(use.rev && has(c,t,W.rev+1)) rev[t]=-(a[t]/a[t-W.rev]-1);
      if(use.vol && has(c,t,W.vol+1)){ let m=0; for(let k=0;k<W.vol;k++) m+=r[t-k]; m/=W.vol;
        let s=0; for(let k=0;k<W.vol;k++){const d=r[t-k]-m; s+=d*d}
        vol[t]=Math.sqrt(s/(W.vol-1))*Math.sqrt(252);
        if(has(c,t,W.mom+1)) rs[t]= vol[t]>1e-6 ? mom[t]/vol[t] : 0;
      }
    }
    F[c]={trend, mom, rs, lowvol:vol.map(v=>-v), rev, eff};
  }
  const score={}, zs={}; for(const c of codes){ score[c]=new Array(M).fill(NaN); zs[c]={}; for(const k in wn) zs[c][k]=new Array(M).fill(NaN); }
  const keys=Object.keys(wn);
  for(let t=maxW;t<M;t++){
    for(const k of keys){
      if(wn[k]===0) continue;
      // 横截面统计只在「当天已经上市、且历史够长」的标的之间做，
      // 否则没上市的 NaN 会把均值和标准差污染成 NaN，所有得分一起归零。
      const live=codes.filter(c=>isFinite(F[c][k][t]));
      if(!live.length) continue;
      const v=live.map(c=>F[c][k][t]);
      const m=v.reduce((a,b)=>a+b,0)/v.length;
      let sd=0; for(const x of v) sd+=(x-m)*(x-m);
      sd=Math.sqrt(sd/v.length);
      live.forEach((c,i)=>{ zs[c][k][t] = sd>1e-12 ? (v[i]-m)/sd : 0; });
    }
    // 排名合成（第三篇的做法）：每个因子只看名次（1 最好，同分同名次），加权求和，名次和越小越好。
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

  // 3b. N 日均线（绝对趋势过滤用）
  const MA={};
  if(p.maWin>0) for(const c of codes){
    const a=px[c], m=new Array(M).fill(NaN);
    for(let t=0;t<M;t++){
      if(!has(c,t,p.maWin)) continue;
      let sum=0; for(let k=0;k<p.maWin;k++) sum+=a[t-k];
      m[t]=sum/p.maWin;
    }
    MA[c]=m;
  }
  // 3c. 两两相关系数（分散约束用）
  const corrAt=(c1,c2,t)=>{
    const A=ret[c1], B=ret[c2], n=p.corrWin;
    let ma=0,mb=0; for(let k=0;k<n;k++){ ma+=A[t-k]; mb+=B[t-k]; } ma/=n; mb/=n;
    let sa=0,sb=0,sab=0;
    for(let k=0;k<n;k++){ const x=A[t-k]-ma, y=B[t-k]-mb; sa+=x*x; sb+=y*y; sab+=x*y; }
    return (sa>1e-16&&sb>1e-16) ? sab/Math.sqrt(sa*sb) : 0;
  };

  // 4. 回测区间
  const s8=p.start.replace(/-/g,''), e8=p.end.replace(/-/g,'');
  let t0=maxW; while(t0<M && dates[t0]<s8) t0++;
  t0=Math.max(t0,maxW);
  let t1=M-1; while(t1>0 && dates[t1]>e8) t1--;
  if(t1-t0<40) return {err:'可用回测区间不足 40 个交易日，把起始日期往前调，或换掉上市较晚的标的。'};

  // 5. 调仓日
  const isRebal=new Array(M).fill(false);
  const wk = d => { const dt=new Date(+d.slice(0,4), +d.slice(4,6)-1, +d.slice(6,8));
    const day=(dt.getDay()+6)%7; dt.setDate(dt.getDate()-day); return dt.getTime(); };
  for(let t=t0;t<=t1;t++){
    if(p.freq==='D') isRebal[t]=true;
    else if(p.freq==='W') isRebal[t]= t===t1 || wk(dates[t])!==wk(dates[t+1]);
    else if(p.freq==='M') isRebal[t]= t===t1 || dates[t].slice(0,6)!==dates[t+1].slice(0,6);
    else if(p.freq==='N') isRebal[t]= ((t-t0) % Math.max(1,p.nDays))===0;
  }
  isRebal[t0]=true;

  // 6. 主循环
  const cashD = Math.pow(1+p.cashRate/100, 1/252)-1;
  const marginD = Math.pow(1+p.marginRate/100, 1/252)-1;
  const levCap = Math.max(1, (p.leverMax||100)/100);
  const fee = p.costBps/1e4;
  let cur={}, pick=[], pend=null, nav=1, turn=0, nRebal=0;
  let heldSince=-1e9, lastTgt=null;
  const navS=[1], holdS=[], sRet=[0], expoS=[1];
  // 缓冲带记的是「上期选中的标的」，哪怕那份仓位当时被空仓规则换成了现金
  const decide = t => {
    // 最小持有期：还没到期就原样端着
    const rank = codes.filter(c=>isFinite(score[c][t])).sort((a,b)=>score[b][t]-score[a][t]);
    if(lastTgt && p.minHold>0 && (t-heldSince)<p.minHold){
      // 冷却期内照旧端着 —— 除非开了「强制卖出排名」且在手的名次已跌到阈值或更差
      const forced = p.forceSellRank>0 && lastTgt.pick.some(c=>{ const i=rank.indexOf(c); return i<0 || i+1>=p.forceSellRank; });
      if(!forced) return {w:{...lastTgt.w}, pick:lastTgt.pick.slice(), hold:true};
    }
    if(!rank.length) return {w:{[CASH]:1}, pick:[]};
    const keepLim = Math.min(rank.length, p.topK + p.buffer);
    // 在手标的的保留条件：排名仍在缓冲带内，或者「挑战者没有明显领先我」
    const bar = rank.length>=p.topK ? score[rank[p.topK-1]][t] : -Infinity;
    // 排名合成下名次和打平（只差 z 分尾数）视为同分，在手的不换；真正的名次差至少 0.05
    const gap = p.switchGap>0 ? p.switchGap : (p.combine==='rank' ? 1e-5 : 0);
    const chosen = pick.filter(c=>rank.indexOf(c)>-1 &&
                       (rank.indexOf(c)<keepLim ||
                        (gap>0 && bar - score[c][t] <= gap)))
                       .sort((a,b)=>rank.indexOf(a)-rank.indexOf(b))
                       .slice(0, p.topK);
    for(const c of rank){
      if(chosen.length>=p.topK) break;
      if(chosen.includes(c)) continue;
      // 分散约束：跟已选的任何一只相关性过高就跳过
      if(p.corrCap>0 && has(c,t,p.corrWin+1)
         && chosen.some(o=>has(o,t,p.corrWin+1) && corrAt(c,o,t)>p.corrCap)) continue;
      chosen.push(c);
    }
    // 分散约束可能凑不满，剩下的名额放现金
    const w={}, unit=1/p.topK;
    for(const c of chosen){
      const okTrend = !p.absOn || (F[c].trend[t] > p.absThresh);
      const okMA    = p.maWin<=0 || !isFinite(MA[c][t]) || px[c][t] > MA[c][t];
      if(okTrend && okMA) w[c]=(w[c]||0)+unit; else w[CASH]=(w[CASH]||0)+unit;
    }
    const filled=chosen.length*unit;
    if(filled<1-1e-9) w[CASH]=(w[CASH]||0)+(1-filled);
    return {w, pick:chosen};
  };
  const settle = t => {
    if(!(pend && pend.at<=t)) return;
    const t0settle=t;
    const tgt=pend.w; let d=0;
    const all=new Set([...Object.keys(cur),...Object.keys(tgt)]);
    for(const c of all) d+=Math.abs((tgt[c]||0)-(cur[c]||0));
    if(d>1e-9){ turn+=d/2; nav*= (1-fee*d); }
    if(JSON.stringify(Object.keys(tgt).sort())!==JSON.stringify(Object.keys(cur).sort())) heldSince=t;
    cur=tgt; pick=pend.pick; lastTgt={w:{...tgt}, pick:pick.slice()}; pend=null;
  };
  let peakRot=1, braked=false, expoPrev=1, shNav=1, shPeak=1; const rawRet=[];
  for(let t=t0;t<t1;t++){
    settle(t);                                   // 昨日下单、今日收盘成交的先落地
    if(isRebal[t]){ const dc=decide(t); pend={w:dc.w, pick:dc.pick, at: p.exec==='same'? t : t+1}; nRebal++; }
    settle(t);                                   // 当日收盘成交的立即落地
    let rA=0; for(const c in cur) rA += cur[c]*(c===CASH? cashD : ret[c][t+1]);
    // 敞口调节只用 t 及之前的信息
    let expo=1;
    if(p.volTarget>0){
      const n=Math.min(rawRet.length, p.volTgtWin);
      if(n>=10){
        const seg=rawRet.slice(-n); const m=seg.reduce((a,b)=>a+b,0)/n;
        let v=0; for(const x of seg){ const d=x-m; v+=d*d; }
        const sd=Math.sqrt(v/(n-1))*Math.sqrt(252);
        // 市场越安静敞口越大，最高到 levCap；越颠越收缩。不开波动目标就不会上杠杆。
        if(sd>1e-6) expo=Math.min(levCap,(p.volTarget/100)/sd);
      }
    }
    if(p.ddBrake>0){
      // 用「始终满仓的影子净值」判回撤：刹停后它照样跟着市场走，才回得来
      const dd=1-shNav/shPeak;
      if(braked){ if(dd < p.ddBrake/200) braked=false; }
      else if(dd > p.ddBrake/100) braked=true;
      if(braked) expo=0;
    }
    const de=Math.abs(expo-expoPrev);
    if(de>1e-9){ turn+=de/2; nav*=(1-fee*de); }
    expoPrev=expo;
    // 敞口不足 100% 的部分吃现金利息，超过 100% 的部分付融资利息
    const r = expo*rA + (1-expo)*(expo>1 ? marginD : cashD);
    shNav*=1+rA; if(shNav>shPeak) shPeak=shNav;
    rawRet.push(rA); if(rawRet.length>400) rawRet.shift();
    nav*=1+r; if(nav>peakRot) peakRot=nav;
    navS.push(nav); sRet.push(r); holdS.push({...cur}); expoS.push(expo);
  }
  holdS.push({...cur});

  // 6b. 全天候底仓（风险平价／等权，按期再平衡，期间随价格漂移）
  const awRebal=new Array(M).fill(false);
  if(awOn){
    for(let t=t0;t<=t1;t++){
      const d=dates[t], nx=dates[t+1];
      if(t===t1){ awRebal[t]=true; continue; }
      if(p.awFreq==='M') awRebal[t]= d.slice(0,6)!==nx.slice(0,6);
      else if(p.awFreq==='Q') awRebal[t]= d.slice(0,6)!==nx.slice(0,6) && [3,6,9,12].includes(+d.slice(4,6));
      else if(p.awFreq==='Y') awRebal[t]= d.slice(0,4)!==nx.slice(0,4);
    }
    awRebal[t0]=true;
  }
  const awTarget = t => {
    const w={};
    const legs=p.awPool.filter(c=>has(c,t,p.awVol+1));
    if(!legs.length) return {[CASH]:1};
    if(p.awMode==='ew'){ for(const c of legs) w[c]=1/legs.length; return w; }
    let sum=0; const inv={};
    for(const c of legs){
      const r=ret[c]; let m=0; for(let k=0;k<p.awVol;k++) m+=r[t-k]; m/=p.awVol;
      let v=0; for(let k=0;k<p.awVol;k++){const d=r[t-k]-m; v+=d*d}
      const sd=Math.sqrt(v/(p.awVol-1))*Math.sqrt(252);
      inv[c]= sd>1e-6 ? 1/sd : 0; sum+=inv[c];
    }
    if(sum<=0){ for(const c of legs) w[c]=1/legs.length; return w; }
    for(const c of legs) w[c]=inv[c]/sum;
    return w;
  };
  const awNav=[1]; let awLast={}, awTurn=0;
  if(awOn){
    let hold={}, v=1;
    for(let t=t0;t<t1;t++){
      if(awRebal[t]){
        const tg=awTarget(t); let d=0;
        const all=new Set([...Object.keys(hold),...Object.keys(tg)]);
        for(const c of all) d+=Math.abs((tg[c]||0)-(hold[c]||0));
        if(d>1e-9){ awTurn+=d/2; v*=(1-fee*d); }
        hold={...tg}; awLast={...tg};
      }
      let r=0; for(const c in hold) r+=hold[c]*ret[c][t+1];
      // 权重随价格漂移
      const nh={}; let tot=0;
      for(const c in hold){ nh[c]=hold[c]*(1+ret[c][t+1]); tot+=nh[c]; }
      for(const c in nh) nh[c]/=tot;
      hold=nh; v*=1+r; awNav.push(v);
    }
  } else { for(let t=t0;t<t1;t++) awNav.push(1); }

  // 6b2. 海龟腿：唐奇安通道突破进、跌破出、ATR 定头寸
  const tuNav=[1]; let tuLast={}, tuTurn=0;
  if(tuOn){
    // 只有收盘价，ATR 用「日间绝对涨跌」近似真实波幅
    const ATR={};
    for(const c of codes){
      const a=px[c], m=new Array(M).fill(NaN);
      for(let t=1;t<M;t++){
        if(!has(c,t,p.tuAtr+1)) continue;
        let sum=0; for(let k=0;k<p.tuAtr;k++) sum+=Math.abs(a[t-k]-a[t-k-1]);
        m[t]=sum/p.tuAtr;
      }
      ATR[c]=m;
    }
    const st={}; for(const c of codes) st[c]={inPos:false, entry:0, atr0:0, w:0};
    const target = t => {
      const w={};
      const live=codes.filter(c=>has(c,t,Math.max(p.tuIn,p.tuOut,p.tuAtr)+1));
      const cap2=1/Math.max(1,live.length);
      for(const c of codes){
        const S=st[c];
        if(!live.includes(c)){ S.inPos=false; S.w=0; continue; }
        const a=px[c], atr=ATR[c][t];
        let hi=-Infinity, lo=Infinity;
        for(let k=1;k<=p.tuIn;k++) if(a[t-k]>hi) hi=a[t-k];
        for(let k=1;k<=p.tuOut;k++) if(a[t-k]<lo) lo=a[t-k];
        if(!S.inPos){
          if(a[t]>hi && isFinite(atr) && atr>1e-9){
            S.inPos=true; S.entry=a[t]; S.atr0=atr;
            S.w=Math.min(cap2, (p.tuRisk/100)*a[t]/atr);
          }
        } else {
          const stopHit = p.tuStop>0 && a[t] < S.entry - p.tuStop*S.atr0;
          if(a[t]<lo || stopHit){ S.inPos=false; S.w=0; }
        }
        if(S.inPos && S.w>0) w[c]=S.w;
      }
      let sum=0; for(const c in w) sum+=w[c];
      if(sum>1){ for(const c in w) w[c]/=sum; sum=1; }
      if(sum<1-1e-9) w[CASH]=1-sum;
      return w;
    };
    let hold={}, pending=null, v=1;
    for(let t=t0;t<t1;t++){
      const apply=()=>{
        if(!(pending && pending.at<=t)) return;
        let d=0; const all=new Set([...Object.keys(hold),...Object.keys(pending.w)]);
        for(const c of all) d+=Math.abs((pending.w[c]||0)-(hold[c]||0));
        if(d>1e-9){ tuTurn+=d/2; v*=(1-fee*d); }
        hold={...pending.w}; tuLast={...pending.w}; pending=null;
      };
      apply();
      pending={w:target(t), at: p.exec==='same'? t : t+1};
      apply();
      let r=0; for(const c in hold) r += hold[c]*(c===CASH? cashD : ret[c][t+1]);
      v*=1+r; tuNav.push(v);
    }
  } else { for(let t=t0;t<t1;t++) tuNav.push(1); }

  // 6c. 融合：轮动袖 + 全天候袖 + 海龟袖，每月末重置比例
  const sa=p.awShare/100, su=p.tuShare/100, sm=Math.max(0, 1-sa-su);
  const blend=[1], mixRet=[0];
  {
    let vm=sm, va=sa, vu=su;
    const nSleeve=(sm>0?1:0)+(sa>0?1:0)+(su>0?1:0);
    for(let i=1;i<navS.length;i++){
      const t=t0+i-1;
      const monthEnd = t<t1 && dates[t].slice(0,6)!==dates[t+1].slice(0,6);
      if(nSleeve>1 && monthEnd){
        const tot=vm+va+vu, nm=tot*sm, na=tot*sa, nu=tot*su;
        const d=(Math.abs(nm-vm)+Math.abs(na-va)+Math.abs(nu-vu))/Math.max(tot,1e-12);
        vm=nm; va=na; vu=nu;
        if(d>1e-9){ const c=1-fee*d; vm*=c; va*=c; vu*=c; }
      }
      vm*= navS[i]/navS[i-1];
      va*= awNav[i]/awNav[i-1];
      vu*= tuNav[i]/tuNav[i-1];
      const nv=vm+va+vu;
      mixRet.push(nv/blend[i-1]-1); blend.push(nv);
    }
  }

  // 7. 基准
  const bN=[1]; let bp=1;
  if(p.bench==='EW'){
    for(let t=t0;t<t1;t++){
      const live=codes.filter(c=>px[c][t]>0 && px[c][t+1]>0);
      let r=0; if(live.length) for(const c of live) r+=ret[c][t+1]/live.length;
      bp*=1+r; bN.push(bp);
    }
  } else {
    for(let t=t0;t<t1;t++){ bp*= px[p.bench][t+1]/px[p.bench][t]; bN.push(bp); }
  }

  // 8. 指标
  const dd = s => { let pk=s[0], m=0, mAt=0, cur=[];
    for(let i=0;i<s.length;i++){ if(s[i]>pk) pk=s[i]; const d=1-s[i]/pk; cur.push(-d); if(d>m){m=d;mAt=i} }
    return {series:cur, max:m, at:mAt}; };
  const stat = (s, rs) => {
    const days=(new Date(fmtD(dates[t1]))-new Date(fmtD(dates[t0])))/864e5;
    const yrs=days/365.25;
    const cagr=Math.pow(s[s.length-1], 1/yrs)-1;
    const n=rs.length-1, mu=rs.slice(1).reduce((a,b)=>a+b,0)/n;
    let v=0; for(let i=1;i<rs.length;i++){const d=rs[i]-mu; v+=d*d}
    const sd=Math.sqrt(v/(n-1)), av=sd*Math.sqrt(252);
    const D=dd(s);
    return {total:s[s.length-1]-1, cagr, vol:av, yrs,
      sharpe: av>0 ? (cagr - p.cashRate/100)/av : 0,
      mdd:D.max, mddAt:D.at, calmar: D.max>0? cagr/D.max : 0, ddS:D.series};
  };
  const bRet=[0]; for(let i=1;i<bN.length;i++) bRet.push(bN[i]/bN[i-1]-1);
  const S=stat(blend,mixRet), B=stat(bN,bRet);
  const rotS=stat(navS,sRet);
  const awRet=[0]; for(let i=1;i<awNav.length;i++) awRet.push(awNav[i]/awNav[i-1]-1);
  const awS=awOn?stat(awNav,awRet):null;
  const tuRet=[0]; for(let i=1;i<tuNav.length;i++) tuRet.push(tuNav[i]/tuNav[i-1]-1);
  const tuS=tuOn?stat(tuNav,tuRet):null;

  // 月胜率
  let mw=0, mt=0; { const key=i=>dates[t0+i].slice(0,6); let i0=0;
    for(let i=1;i<=blend.length;i++){
      if(i===blend.length || key(i)!==key(i0)){
        const a=blend[i-1]/blend[i0]-1, b=bN[i-1]/bN[i0]-1;
        mt++; if(a>b) mw++; i0=i;
      }
    } }
  // 持仓占比
  const occ={}; holdS.forEach(h=>{ for(const c in h) occ[c]=(occ[c]||0)+h[c]; });
  for(const c in occ) occ[c]/=holdS.length;
  // 分年度
  const years=[]; { let i0=0;
    for(let i=1;i<=blend.length;i++){
      if(i===blend.length || dates[t0+i].slice(0,4)!==dates[t0+i0].slice(0,4)){
        years.push({y:dates[t0+i0].slice(0,4), s:blend[i-1]/blend[i0]-1, b:bN[i-1]/bN[i0]-1,
          mdd:(()=>{let pk=0,m=0;for(let k=i0;k<i;k++){pk=Math.max(pk,blend[k]);m=Math.max(m,1-blend[k]/pk)}return m})()});
        i0=i;
      }
    } }

  // 池内两两相关系数（回测窗口内、两边都有价的日子）
  const corrMat=codes.map(a=>codes.map(b=>{
    if(a===b) return 1;
    let n=0,ma=0,mb=0;
    for(let t=t0+1;t<=t1;t++){ if(px[a][t]>0&&px[a][t-1]>0&&px[b][t]>0&&px[b][t-1]>0){ ma+=ret[a][t]; mb+=ret[b][t]; n++; } }
    if(n<120) return null;
    ma/=n; mb/=n;
    let sa=0,sb=0,sab=0;
    for(let t=t0+1;t<=t1;t++){ if(px[a][t]>0&&px[a][t-1]>0&&px[b][t]>0&&px[b][t-1]>0){
      const u=ret[a][t]-ma, v=ret[b][t]-mb; sa+=u*u; sb+=v*v; sab+=u*v; } }
    return (sa>0&&sb>0)? sab/Math.sqrt(sa*sb) : null;
  }));

  const lastT=t1;
  const board=codes.map(c=>({code:c, score:score[c][lastT],
      z:Object.fromEntries(keys.map(k=>[k, zs[c][k][lastT]])),
      trend:F[c].trend[lastT], mom:F[c].mom[lastT], vol:-F[c].lowvol[lastT], eff:F[c].eff[lastT]}))
    .sort((a,b)=>b.score-a.score);

  return {dates:dates.slice(t0,t1+1), navS:blend, rotNav:navS, awNav, awOn, awLast, awS, rotS,
    tuNav, tuOn, tuLast, tuS, sleeveW:{rot:sm, aw:sa, tu:su},
    bN, S, B, holdS, occ, years, board,
    codes, corrMat, monthWin: mt? mw/mt : 0, nRebal, expoS,
    avgExpo: expoS.reduce((a,b)=>a+b,0)/expoS.length,
    maxExpo: expoS.reduce((a,b)=>Math.max(a,b),0),
    expoVaries: expoS.some(v=>Math.abs(v-1)>0.005),
    turnPerYr: (sm*turn + sa*awTurn + su*tuTurn)/S.yrs,
    lastHold: holdS[holdS.length-1], t0d:dates[t0], t1d:dates[t1],
    assetNav: codes.map(c=>{
      const a=new Array(t1-t0+1).fill(null); let v=1, prev=0;
      for(let t=t0;t<=t1;t++){
        const q=px[c][t];
        if(!(q>0)){ prev=0; continue; }
        if(prev>0) v*=q/prev; else v=1;
        a[t-t0]=v; prev=q;
      }
      return {code:c, nav:a};
    }),
    calStart: dates[maxW], reqStart: s8};
}


module.exports={backtest, byCode, P, CAL, ASSETS};
