const {backtest}=require('./engine.js');
const AW0={awShare:0,awPool:['510300','511010','518880'],awMode:'rp',awFreq:'M',awVol:60};
const RK0={maWin:0,volTarget:0,volTgtWin:20,ddBrake:0,minHold:0,corrCap:0,corrWin:60,switchGap:0,leverMax:100,marginRate:6};
const TU0={tuShare:0,tuIn:20,tuOut:10,tuAtr:20,tuStop:2,tuRisk:0.5};
const base={nDays:10,cashRate:1.5,costBps:5,exec:'next',bench:'510300',
            start:'2015-01-01',end:'2026-09-16',...AW0,...RK0,...TU0,buffer:1,absOn:false};
const A=['510880','159915','513100','518880','511010'];
const B=[...A,'159985'];
const C=[...A,'159985','159980','159981'];
const TV2={trend:50,mom:0,rs:0,lowvol:50,rev:0}, TV={trend:65,mom:0,rs:0,lowvol:35,rev:0};
const CAND=[
 ['B TV2 wt15 K3 W', {pool:B,w:TV2,win:{trend:15,mom:60,vol:20,rev:5},topK:3,freq:'W',switchGap:0.5,minHold:5}],
 ['B TV2 wt15 K3 N10',{pool:B,w:TV2,win:{trend:15,mom:60,vol:20,rev:5},topK:3,freq:'N',switchGap:0.5,minHold:5}],
 ['B TV  wt15 K3 W', {pool:B,w:TV ,win:{trend:15,mom:60,vol:20,rev:5},topK:3,freq:'W',switchGap:0.5,minHold:5}],
 ['C TV2 wt15 K3 W', {pool:C,w:TV2,win:{trend:15,mom:60,vol:20,rev:5},topK:3,freq:'W',switchGap:0.5,minHold:5}],
 ['C TV2 wt15 K4 W', {pool:C,w:TV2,win:{trend:15,mom:60,vol:20,rev:5},topK:4,freq:'W',switchGap:0.5,minHold:5}],
];
const spans=[['2015-01-01','全期'],['2016-01-01','2016起'],['2019-01-01','2019起']];
const rows=[];
for(const [nm,cfg] of CAND)
 for(const vt of [8,10,13,16,20])
  for(const lm of [100,130,150,170,200])
   for(const mr of [6]){
  const p={...base,...cfg,volTarget:vt,leverMax:lm,marginRate:mr};
  const rs=spans.map(([s])=>backtest({...p,start:s}));
  if(rs.some(r=>r.err)) continue;
  const r=rs[0];
  rows.push({nm:`${nm} vt${vt} 杠杆${lm}%`, c:r.S.cagr,d:r.S.mdd,s:r.S.sharpe,k:r.S.calmar,t:r.turnPerYr,e:r.avgExpo,
    sub:rs.slice(1).map(x=>({c:x.S.cagr,d:x.S.mdd,k:x.S.calmar})), p});
}
const f=r=>`${r.nm.padEnd(28)} 年化 ${(r.c*100).toFixed(1).padStart(5)}  回撤 ${(r.d*100).toFixed(1).padStart(5)}  夏普 ${r.s.toFixed(2)}  卡玛 ${r.k.toFixed(2)}  敞口 ${(r.e*100).toFixed(0)}%  换手 ${r.t.toFixed(1)}`;
console.log('组合数',rows.length);
const hit=rows.filter(r=>r.c>=0.20&&r.d<0.10);
console.log('\n★★ 全期达标（年化≥20% 且 回撤<10%）：'+hit.length+' 个');
hit.sort((a,b)=>b.k-a.k).forEach(r=>{
  console.log(f(r)+'   |分段 '+r.sub.map(x=>`${(x.c*100).toFixed(1)}/${(x.d*100).toFixed(1)}/${x.k.toFixed(2)}`).join('  '));
});
console.log('\n== 三段区间都达标的 ==');
rows.filter(r=>r.c>=0.20&&r.d<0.10&&r.sub.every(x=>x.c>=0.20&&x.d<0.10))
    .sort((a,b)=>b.k-a.k).forEach(r=>console.log(f(r)));
console.log('\n== 卡玛 top10 ==');
rows.slice().sort((a,b)=>b.k-a.k).slice(0,10).forEach(r=>console.log(f(r)));
console.log('\n== 年化>=20% 里回撤最小 top10 ==');
rows.filter(r=>r.c>=0.20).sort((a,b)=>a.d-b.d).slice(0,10).forEach(r=>console.log(f(r)));
