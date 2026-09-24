import sys
tpl=open('app.tpl.html',encoding='utf-8').read()
data=open('data.json',encoding='utf-8').read()
open('/Users/likang/Desktop/ETF轮动记录台/ETF轮动记录台.html','w',encoding='utf-8').write(tpl.replace('__DATA__',data))
print('built', len(tpl)+len(data))
