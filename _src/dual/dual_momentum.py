# ETF 双动量轮动策略 · 独立复现（量化君也 2025-12-25 文章）
# 斜率动量 = 归一化收盘价回归斜率 × R²      （窗口 SLOPE_N=25）
# 效率动量 = 区间涨跌幅 × 效率系数(位移/路程)（窗口 EFF_N=20）
# 两个得分各自排名，加权求和成综合排名，每日选综合排名最好的 1 只
# 可选：最小持仓天数 MIN_HOLD + 强制卖出排名阈值 FORCE_RANK
import json, math, sys
import numpy as np

D=json.load(open(sys.argv[1] if len(sys.argv)>1 else '/private/tmp/claude-501/-Users-likang/2626b25f-000e-48f9-bb23-8123906af2d8/scratchpad/data_live.json'))
CAL=D['cal']; PX={a['code']:np.array([v if v else np.nan for v in a['px']],float) for a in D['assets']}
NAME={a['code']:a['name'] for a in D['assets']}
POOL=['510880','159915','513100','518880']

def slope_score(px,t,W):
    y=px[t-W+1:t+1]; 
    if np.isnan(y).any() or y[0]<=0: return np.nan
    y=y/y[0]; x=np.arange(1,W+1,dtype=float)
    xm,ym=x.mean(),y.mean(); Sxx=((x-xm)**2).sum(); Sxy=((x-xm)*(y-ym)).sum(); Syy=((y-ym)**2).sum()
    if Sxx<=0 or Syy<=1e-14: return 0.0
    b=Sxy/Sxx; r2=Sxy*Sxy/(Sxx*Syy); return 1e4*b*r2

def eff_score(px,t,N):
    seg=px[t-N:t+1]
    if np.isnan(seg).any() or seg[0]<=0: return np.nan
    path=np.abs(np.diff(seg)).sum(); disp=abs(seg[-1]-seg[0])
    er= disp/path if path>1e-12 else 0.0
    return (seg[-1]/seg[0]-1)*er

def rank_desc(vals):
    """得分高→排名小(1最好)；NaN 排最后；同分同名次(competition rank)"""
    order=sorted([(v,i) for i,v in enumerate(vals) if not np.isnan(v)],key=lambda z:-z[0])
    r=[np.nan]*len(vals); 
    for k,(v,i) in enumerate(order):
        r[i]= k+1 if k==0 or v!=order[k-1][0] else r[order[k-1][1]]
    return r

def run(pool=POOL, slope_n=25, eff_n=20, w_slope=0.5, w_eff=0.5, min_hold=0, force_rank=0,
        start='20150101', end='20251224', exec_mode='same', cost_bps=0.0, tie='keep'):
    idx=[i for i,d in enumerate(CAL) if start<=d<=end]
    t0,t1=idx[0],idx[-1]
    n=len(pool); px={c:PX[c] for c in pool}
    nav=1.0; navs=[]; dates=[]; hold=None; held_since=None; trades=0; trade_pl=[]; entry_nav=None
    pend=None; daily=[]
    for t in range(t0,t1+1):
        # 结算：先用昨天收盘的信号成交（next 模式），再算今天持仓收益
        # 当日收益：持仓 c 的 px[t]/px[t-1]-1
        if hold is not None:
            r=px[hold][t]/px[hold][t-1]-1 if not np.isnan(px[hold][t]) and not np.isnan(px[hold][t-1]) else 0.0
        else: r=0.0
        nav*=1+r; daily.append(r)
        # 信号（用截至今天收盘的数据）
        s=[slope_score(px[c],t,slope_n) for c in pool]; e=[eff_score(px[c],t,eff_n) for c in pool]
        rs,re_=rank_desc(s),rank_desc(e)
        comb=[ (w_slope*rs[i]+w_eff*re_[i]) if not(np.isnan(rs[i]) or np.isnan(re_[i])) else np.nan for i in range(n)]
        live=[i for i in range(n) if not np.isnan(comb[i])]
        target=hold
        if live:
            best=min(comb[i] for i in live); cands=[i for i in live if comb[i]==best]
            if hold is not None and pool.index(hold) in cands and tie=='keep': tgt_i=pool.index(hold)
            elif tie=='slope': tgt_i=max(cands,key=lambda i:s[i])
            else: tgt_i=max(cands,key=lambda i:e[i])
            cand=pool[tgt_i]
            if hold is None: target=cand
            elif cand!=hold:
                hi=pool.index(hold)
                in_cool = min_hold>0 and held_since is not None and (t-held_since)<min_hold
                # 综合排名（competition rank of comb）
                comb_rank=rank_desc([-x if not np.isnan(x) else np.nan for x in comb])[hi]
                forced = force_rank>0 and not np.isnan(comb_rank) and comb_rank>=force_rank
                if (not in_cool) or forced: target=cand
        # 成交
        def do_switch(new, at_t):
            nonlocal hold,nav,trades,held_since,entry_nav
            if new==hold: return
            if hold is not None:
                trade_pl.append(nav/entry_nav-1); nav*=1-cost_bps/1e4
            nav*=1-cost_bps/1e4
            hold=new; held_since=at_t; entry_nav=nav; trades+=1
        if exec_mode=='same':
            do_switch(target,t)
        else:
            if pend is not None: pass
            # next 模式：今天的信号明天收盘成交 → 明天先按旧持仓吃明天的收益再换
            # 实现：记录 pend，在下一轮循环收益结算后执行
            pend=target
        if exec_mode=='next' and t>t0:
            pass
        navs.append(nav); dates.append(CAL[t])
        if exec_mode=='next':
            # 把 pend 延后一天：用一个小技巧，在下一次迭代开头执行。这里直接处理：
            # 因为收益已按 hold 结算完，现在切换等价于「明日开盘前换好」≈ 次日收盘成交的近似有偏差；
            # 更严格：下一轮先结算 r(hold_old) 再切换。用 queue 实现：
            pass
    return finish(navs,dates,daily,trades,trade_pl,pool)

def run_next(pool=POOL, **kw):
    """次日收盘成交版：t 日收盘出信号，t+1 日按 t+1 收盘价换仓（t+1 当天收益归旧持仓）"""
    slope_n=kw.get('slope_n',25); eff_n=kw.get('eff_n',20); w_slope=kw.get('w_slope',.5); w_eff=kw.get('w_eff',.5)
    min_hold=kw.get('min_hold',0); force_rank=kw.get('force_rank',0); start=kw.get('start','20150101'); end=kw.get('end','20251224')
    cost_bps=kw.get('cost_bps',0.0); tie=kw.get('tie','keep')
    idx=[i for i,d in enumerate(CAL) if start<=d<=end]; t0,t1=idx[0],idx[-1]
    n=len(pool); px={c:PX[c] for c in pool}
    nav=1.0; navs=[]; dates=[]; hold=None; held_since=None; trades=0; trade_pl=[]; entry_nav=None; pend=None; daily=[]
    for t in range(t0,t1+1):
        r=0.0
        if hold is not None and not np.isnan(px[hold][t]) and not np.isnan(px[hold][t-1]): r=px[hold][t]/px[hold][t-1]-1
        nav*=1+r; daily.append(r)
        if pend is not None and pend!=hold:
            if hold is not None: trade_pl.append(nav/entry_nav-1); nav*=1-cost_bps/1e4
            nav*=1-cost_bps/1e4; hold=pend; held_since=t; entry_nav=nav; trades+=1
        pend=None
        s=[slope_score(px[c],t,slope_n) for c in pool]; e=[eff_score(px[c],t,eff_n) for c in pool]
        rs,re_=rank_desc(s),rank_desc(e)
        comb=[(w_slope*rs[i]+w_eff*re_[i]) if not(np.isnan(rs[i]) or np.isnan(re_[i])) else np.nan for i in range(n)]
        live=[i for i in range(n) if not np.isnan(comb[i])]
        if live:
            best=min(comb[i] for i in live); cands=[i for i in live if comb[i]==best]
            if hold is not None and pool.index(hold) in cands and tie=='keep': tgt_i=pool.index(hold)
            elif tie=='slope': tgt_i=max(cands,key=lambda i:s[i])
            else: tgt_i=max(cands,key=lambda i:e[i])
            cand=pool[tgt_i]
            if hold is None: pend=cand
            elif cand!=hold:
                hi=pool.index(hold)
                in_cool = min_hold>0 and held_since is not None and (t-held_since)<min_hold
                comb_rank=rank_desc([-x if not np.isnan(x) else np.nan for x in comb])[hi]
                forced = force_rank>0 and not np.isnan(comb_rank) and comb_rank>=force_rank
                if (not in_cool) or forced: pend=cand
        navs.append(nav); dates.append(CAL[t])
    return finish(navs,dates,daily,trades,trade_pl,pool)

def finish(navs,dates,daily,trades,trade_pl,pool):
    navs=np.array(navs); yrs=(len(navs))/252
    cagr=navs[-1]**(1/yrs)-1
    peak=np.maximum.accumulate(navs); mdd=((navs/peak)-1).min()
    d=np.array(daily); sharpe=d.mean()/d.std()*math.sqrt(252) if d.std()>0 else 0
    win=np.mean([1 if x>0 else 0 for x in trade_pl]) if trade_pl else float('nan')
    # 分年
    yr={}
    for i in range(1,len(navs)):
        y=dates[i][:4]; yr.setdefault(y,[navs[i-1],navs[i]]); yr[y][1]=navs[i]
    yearly={y:v[1]/v[0]-1 for y,v in yr.items()}
    return dict(nav=navs[-1],cagr=cagr,mdd=mdd,sharpe=sharpe,trades=trades,win=win,yearly=yearly,navs=navs,dates=dates)

def show(tag,R):
    print(f"{tag:<34} 净值{R['nav']:6.2f}  年化{R['cagr']*100:6.2f}%  回撤{R['mdd']*100:7.2f}%  夏普{R['sharpe']:5.2f}  开仓{R['trades']:4d}  胜率{R['win']*100:5.1f}%")

if __name__=='__main__':
    print("== 文章口径对账：2015-01-01 → 2025-12-24，四只池，零成本 ==")
    print("文章：斜率 28.05%/-31.30%/夏普1.00/160次 · 效率 39.21%/-26.05%/1.39/347次 · 双动量 35.49%/-27.84%/1.22/277次 · +冷却 32.47%/-26.49%/1.11/235次")
    for mode,fn in (('当日收盘成交',run),('次日收盘成交',run_next)):
        print(f"-- {mode} --")
        show('斜率动量(25)',            fn(w_slope=1,w_eff=0))
        show('效率动量(20)',            fn(w_slope=0,w_eff=1))
        show('双动量 等权排名',          fn())
        show('双动量 +最小持3天/强卖排名3', fn(min_hold=3,force_rank=3))
    print("\n== 同分处理敏感性（当日收盘·双动量）==")
    for tie in ('keep','slope','eff'): show(f'tie={tie}', run(tie=tie))
    print("\n== 到最新数据 2026-09-23，次日收盘＋单边5bp（诚实口径）==")
    for tag,kw in (('斜率',dict(w_slope=1,w_eff=0)),('效率',dict(w_slope=0,w_eff=1)),('双动量',{}),('双动量+冷却',dict(min_hold=3,force_rank=3))):
        R=run_next(end='20260923',cost_bps=5,**kw); show(tag,R)
    R=run_next(end='20260923',cost_bps=5,min_hold=3,force_rank=3)
    print("分年(双动量+冷却)：", {y:f"{v*100:.1f}%" for y,v in R['yearly'].items()})
