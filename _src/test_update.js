// 历史回放校验：砍掉最后 N 个交易日，让 update.js 重新拉取并还原，跟原始基线逐日对比。
const fs=require('fs'), path=require('path');
const U=require(path.join(__dirname,'..','update.js'));
const ORIG=U.readDataJs(fs.readFileSync(path.join(__dirname,'..','data.js'),'utf8'));
const N=+(process.argv[2]||40);
const cut=JSON.parse(JSON.stringify(ORIG));
cut.cal=cut.cal.slice(0,-N); for(const a of cut.assets) a.px=a.px.slice(0,-N);
const target=ORIG.cal[ORIG.cal.length-1];
console.log(`truncate ${N} days → have ${cut.cal[cut.cal.length-1]}, replay to ${target}`);
U.update(cut,{to:target}).then(r=>{
  console.log('added',r.added,'last',r.last,'notes',JSON.stringify(r.notes));
  let bad=0;
  if(cut.cal.length!==ORIG.cal.length || cut.cal.some((d,i)=>d!==ORIG.cal[i])){ console.log('CAL MISMATCH', cut.cal.slice(-N-1), ORIG.cal.slice(-N-1)); bad++; }
  for(const a of cut.assets){
    const o=ORIG.assets.find(x=>x.code===a.code);
    let mx=0, at='';
    for(let i=a.px.length-N;i<a.px.length;i++){ const e=Math.abs(a.px[i]/o.px[i]-1); if(e>mx){mx=e;at=cut.cal[i];} }
    const flag=mx>2e-4?'  <-- CHECK':'';
    if(flag) bad++;
    console.log(`${a.code} ${a.name.padEnd(8)} maxRelErr ${(mx*100).toFixed(4)}% @${at}${flag}`);
  }
  console.log(bad?`FAIL ${bad}`:'PASS');
  process.exit(bad?1:0);
}).catch(e=>{console.error('ERR',e);process.exit(2)});
