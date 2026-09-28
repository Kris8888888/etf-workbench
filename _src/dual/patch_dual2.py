# 补丁 2：排名合成模式下，打分面板改成「名次和」的读法（不再显示 −1.00 这种负数）
import sys
path='/Users/likang/Desktop/ETF轮动记录台/index.html'
s=open(path,encoding='utf-8').read()
if 'scoreNote' in s: print('already patched 2'); sys.exit(0)
def sub1(old,new):
    global s
    n=s.count(old); assert n==1, ('anchor count %d: %s'%(n,old[:70]))
    s=s.replace(old,new)
sub1('<p class="note">总分＝加权z分</p>','<p class="note" id="scoreNote">总分＝加权z分</p>')
sub1("""  const half=(W-PADL-PADR)/2;
  svg.appendChild(el('line',{x1:mid,x2:mid,y1:6,y2:H-10,stroke:RULE2}));
  const held=Object.keys(R.lastHold||{});
  R.board.forEach((b,i)=>{
    const y=10+i*rowH, w=Math.abs(b.score)/mx*half, x=b.score>=0?mid:mid-w;""",
"""  const half=(W-PADL-PADR)/2;
  // 排名合成：得分是「负的名次和」，画成从左起的条，名次和越小条越长；读数直接给名次和
  const rankMode=P.combine==='rank', nB=R.board.length;
  const note=document.getElementById('scoreNote');
  if(note) note.textContent = rankMode ? '总分＝加权名次和，越小越靠前' : '总分＝加权z分';
  if(!rankMode) svg.appendChild(el('line',{x1:mid,x2:mid,y1:6,y2:H-10,stroke:RULE2}));
  const held=Object.keys(R.lastHold||{});
  R.board.forEach((b,i)=>{
    const y=10+i*rowH;
    let w,x;
    if(rankMode){ w=Math.max(1,(nB+1+b.score)/nB*(W-PADL-PADR)); x=PADL; }
    else { w=Math.abs(b.score)/mx*half; x=b.score>=0?mid:mid-w; }""")
sub1("""    svg.appendChild(txt(W-PADR+8, y+15, (b.score>=0?'+':'−')+Math.abs(b.score).toFixed(2),
      {fill:INK2,'font-size':11,'font-family':'var(--num)'}));""",
"""    svg.appendChild(txt(W-PADR+8, y+15, rankMode ? (-b.score).toFixed(2) : (b.score>=0?'+':'−')+Math.abs(b.score).toFixed(2),
      {fill:INK2,'font-size':11,'font-family':'var(--num)'}));""")
sub1("    : (ks.length? `最高分 ${byCode[top.code].name} ${top.score>=0?'+':'−'}${Math.abs(top.score).toFixed(2)}` : '');",
     "    : (ks.length? (P.combine==='rank' ? `名次和最小 ${byCode[top.code].name} ${(-top.score).toFixed(2)}` : `最高分 ${byCode[top.code].name} ${top.score>=0?'+':'−'}${Math.abs(top.score).toFixed(2)}`) : '');")
open(path,'w',encoding='utf-8').write(s); print('patched 2')
