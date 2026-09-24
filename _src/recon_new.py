import json, statistics as st
from datetime import date
HF=json.load(open('new_hfq.json')); NF=json.load(open('new_nofq.json'))
def sym(c): return ('sh' if c[0]=='5' else 'sz')+c
def dt(s): return date(int(s[:4]),int(s[4:6]),int(s[6:]))

def reconstruct(code, W=80, verbose=False):
    """F(加减式后复权)=k*(P+Dcum)，k 在份额折算处会变 → 滚动局部 k"""
    P=dict(zip(NF[sym(code)]['dates'], NF[sym(code)]['close']))
    F=dict(zip(HF[code]['dates'],       HF[code]['close']))
    ds=sorted(set(P)&set(F)); n=len(ds)
    dP=[0.0]*n; dF=[0.0]*n
    for i in range(1,n):
        dP[i]=P[ds[i]]-P[ds[i-1]]; dF[i]=F[ds[i]]-F[ds[i-1]]
    ok=[i for i in range(1,n) if abs(dP[i])>0.003*P[ds[i-1]]]
    rets=[0.0]; divs=[]; splits=[]
    for i in range(1,n):
        a,b=ds[i-1],ds[i]
        rp=P[b]/P[a]-1; rf=F[b]/F[a]-1
        if abs(rp)>0.15 and abs(rp-rf)>0.10:
            rets.append(rf); splits.append((b,round(rp*100,1),round(rf*100,1))); continue
        win=[dF[j]/dP[j] for j in ok if abs(j-i)<=W]
        if len(win)<8: rets.append(rp); continue
        k=st.median(win)
        if k<=0: rets.append(rp); continue
        d=dF[i]/k-dP[i]
        if d>max(0.004*P[a], 0.0015/k) and (rf-rp)>0.002:
            rets.append((P[b]+d)/P[a]-1); divs.append((b,round(d,4),round(d/P[a]*100,2)))
        else:
            rets.append(rp)
    nav=[1.0]
    for r in rets[1:]: nav.append(nav[-1]*(1+r))
    if verbose: print(f"   分红 {len(divs)} 次 折算 {len(splits)} 次", splits)
    return ds, nav

out={}
print(f"{'code':8}{'name':14}{'起始':>10}{'年化':>8}{'不复权年化':>11}{'股息':>7}")
for c,v in HF.items():
    ds,nav=reconstruct(c)
    y=(dt(ds[-1])-dt(ds[0])).days/365.25
    ah=nav[-1]**(1/y)-1
    P=dict(zip(NF[sym(c)]['dates'],NF[sym(c)]['close']))
    ap=(P[ds[-1]]/P[ds[0]])**(1/y)-1
    print(f"{c:8}{v['name']:14}{ds[0]:>10}{ah*100:7.2f}%{ap*100:10.2f}%{(ah-ap)*100:6.2f}%")
    out[c]={"dates":ds,"nav":[round(x,6) for x in nav],"name":v['name'],"tag":v['tag']}
json.dump(out,open('recon_new.json','w'),ensure_ascii=False,separators=(',',':'))
print('saved',len(out))
