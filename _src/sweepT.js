const fs=require('fs');
const {backtest}=require('./engine.js');
const AW0={awShare:0,awPool:['510300','511010','518880'],awMode:'rp',awFreq:'M',awVol:60};
const RK0={maWin:0,volTarget:0,volTgtWin:20,ddBrake:0,minHold:0,corrCap:0,corrWin:60,switchGap:0,leverMax:100,marginRate:6};
const TU0={tuShare:0,tuIn:20,tuOut:10,tuAtr:20,tuStop:2,tuRisk:0.5};
const base={nDays:10,cashRate:1.5,costBps:5,exec:'next',bench:'510300',
            start:'2015-01-01',end:'2026-09-16',...AW0,...RK0,...TU0,buffer:1,absOn:false};
const A=['510880','159915','513100','518880','511010'];
const POOLS={
  A:A, B:[...A,'159985'], C:[...A,'159985','159980','159981'],
  D:[...A,'159985','159920'], E:[...A,'159985','159980','159981','511380','159920'],
  F:['510880','159915','513100','518880','511260','159985','159981'],
};
const WS={TV:{trend:65,mom:0,rs:0,lowvol:35,rev:0}, TV2:{trend:50,mom:0,rs:0,lowvol:50,rev:0},
          T:{trend:100,mom:0,rs:0,lowvol:0,rev:0}, TR:{trend:50,mom:0,rs:30,lowvol:20,rev:0}};
const out=[];
for(const pk in POOLS) for(const wk in WS) for(const wt of [10,15,20,25])
 for(const topK of [2,3,4]) for(const freq of ['W','N'])
  for(const vt of [0,10,13,16,20]) for(const mh of [0,5]) for(const sg of [0,0.5]){
  const pool=POOLS[pk]; if(topK>pool.length) continue;
  const p={...base,pool,w:WS[wk],win:{trend:wt,mom:60,vol:20,rev:5},topK,freq,
           volTarget:vt,minHold:mh,switchGap:sg};
  const r=backtest(p); if(r.err) continue;
  out.push({tag:`${pk} ${wk} wt${wt} K${topK} ${freq} vt${vt} mh${mh} sg${sg}`,
    c:r.S.cagr,d:r.S.mdd,s:r.S.sharpe,k:r.S.calmar,t:r.turnPerYr,cfg:{pool,w:WS[wk],wt,topK,freq,vt,mh,sg}});
}
out.sort((a,b)=>b.k-a.k);
fs.writeFileSync('sweepT.json', JSON.stringify(out.slice(0,300)));
const f=r=>`${r.tag.padEnd(30)} 年化 ${(r.c*100).toFixed(1).padStart(5)}  回撤 ${(r.d*100).toFixed(1).padStart(5)}  夏普 ${r.s.toFixed(2)}  卡玛 ${r.k.toFixed(2)}  换手 ${r.t.toFixed(1)}`;
console.log('组合数',out.length);
console.log('\n== 卡玛 top15（无杠杆）==');
out.slice(0,15).forEach(r=>console.log(f(r)));
console.log('\n== 回撤<9% 里年化最高 top15 ==');
out.filter(r=>r.d<0.09).sort((a,b)=>b.c-a.c).slice(0,15).forEach(r=>console.log(f(r)));
console.log('\n== 直接达标 年化>=20% 且 回撤<10% ==');
const hit=out.filter(r=>r.c>=0.20&&r.d<0.10);
console.log('个数',hit.length); hit.slice(0,10).forEach(r=>console.log(f(r)));
