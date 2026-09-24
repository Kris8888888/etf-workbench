import json, time, urllib.request, os
for k in list(os.environ):
    if k.lower() in ('http_proxy','https_proxy','all_proxy'): os.environ.pop(k)
op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
op.addheaders=[('User-Agent','Mozilla/5.0'),('Referer','https://gu.qq.com/')]
NEW = [
 ("159985","豆粕ETF","商品·农产品"), ("159980","有色ETF","商品·有色"),
 ("159981","能化ETF","商品·能化"),   ("511380","可转债ETF","债券·可转债"),
 ("513520","日经ETF","海外·日本"),   ("512890","红利低波ETF","价值·低波"),
 ("513030","德国ETF","海外·德国"),   ("513050","中概互联ETF","海外·中概"),
 ("511090","30年国债ETF","债券·超长久期"), ("161226","白银LOF","商品·白银"),
 ("162411","华宝油气","海外·能源股"), ("164824","印度基金","海外·印度"),
]
RANGES=[("2013-01-01","2015-12-31"),("2016-01-01","2018-12-31"),
        ("2019-01-01","2021-12-31"),("2022-01-01","2024-12-31"),("2025-01-01","2026-12-31")]
def sym(c): return ('sh' if c[0]=='5' else 'sz')+c
def grab(url, key, s):
    for att in range(4):
        try:
            d=json.loads(op.open(url,timeout=25).read().decode('utf-8').split('=',1)[1])['data']
            if not isinstance(d,dict): return []
            return d.get(s,{}).get(key) or d.get(s,{}).get('day') or []
        except Exception:
            time.sleep(2)
    return []
hfq={}; nofq={}
for code,name,tag in NEW:
    s=sym(code); mh={}; mn={}
    for a,b in RANGES:
        for r in grab(f"https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?_var=kd&param={s},day,{a},{b},800,hfq",'hfqday',s): mh[r[0]]=float(r[2])
        time.sleep(0.4)
        for r in grab(f"https://web.ifzq.gtimg.cn/appstock/app/kline/kline?_var=kd&param={s},day,{a},{b},800",'day',s): mn[r[0]]=float(r[2])
        time.sleep(0.4)
    if len(mh)<250 or len(mn)<250:
        print(f"SKIP {code} {name} hfq={len(mh)} nofq={len(mn)}"); continue
    dh=sorted(mh); dn=sorted(mn)
    hfq[code]={"name":name,"tag":tag,"dates":[d.replace('-','') for d in dh],"close":[mh[d] for d in dh]}
    nofq[sym(code)]={"dates":[d.replace('-','') for d in dn],"close":[mn[d] for d in dn]}
    print(f"OK {code} {name} {dh[0]}~{dh[-1]} n={len(dh)}")
json.dump(hfq,open('new_hfq.json','w'),ensure_ascii=False,separators=(',',':'))
json.dump(nofq,open('new_nofq.json','w'),separators=(',',':'))
print('saved',len(hfq))
