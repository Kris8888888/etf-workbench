s=open('/Users/likang/Desktop/ETF轮动记录台/index.html',encoding='utf-8').read()
a=s.index("const CASH = "); b=s.index("/* ── 曲线可见性")
h=("const fs=require('fs');\nconst RAW=(()=>{const t=fs.readFileSync(__dirname+'/../data.js','utf8');return JSON.parse(t.slice(t.indexOf('=')+1).replace(/;\s*$/,''))})();\n"
   "const CAL=RAW.cal, ASSETS=RAW.assets;\nconst fmtD = s => s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8);\n"
   + s[a:b] + "\nmodule.exports={backtest, byCode, P, CAL, ASSETS};\n")
h="\n".join(l for l in h.split("\n") if 'getComputedStyle' not in l and 'CSS(' not in l)
i=h.index("const fmtD",5)
if h.count("const fmtD")>1:
    j=h.index("\n",i)+1; h=h[:i]+h[j:]
open('/Users/likang/Desktop/ETF轮动记录台/_src/engine.js','w',encoding='utf-8').write(h)
print('engine rebuilt')
