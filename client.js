/* Plain-JS client bundle; React is provided by the Harness module table. */
window.__ModuleLoader__.load({
  id: 'dsh-token-statistics',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'dsh-token-statistics';
    const zh = {
      title: 'Token统计', intro: '从历史对话看清每一天、每个月的模型消耗', refresh: '刷新统计', loading: '正在读取历史对话，首次统计可能需要一点时间…',
      retry: '重试', month: '日历 · 按日', year: '趋势 · 按月', allModels: '全部模型', today: '本月', prev: '上一个', next: '下一个',
      total: '总 Token', input: '输入 Token', output: '输出 Token', cacheRead: '缓存读取', cacheWrite: '缓存写入', reasoning: '推理 Token',
      requests: '模型调用', activeDays: '活跃天数', peak: '单日峰值', calendar: '每日消耗日历', calendarHint: '点击日期查看当日明细 · 颜色越深，消耗越高',
      low: '少', high: '多', selectedDay: '当日明细', monthSummary: '本月模型消耗', yearSummary: '全年模型消耗', dayModels: '当日模型消耗',
      model: '模型 / 提供商', share: '占比', empty: '这段时间没有已记录的 Token 消耗', clearDay: '查看整月', trend: '月度消耗趋势', trendHint: '点击月份进入日历',
      coverage: '历史会话', updated: '更新于', timezone: '统计时区', missing: '条调用缺少用量', failed: '个会话读取失败',
      rules: '统计口径', rulesText: '仅统计历史日志中模型返回的实际用量，包含子代理；fork 继承历史不重复统计。输入含缓存读取/写入，总量 = 输入 + 输出；缓存是输入的子项，推理是输出的子项，不重复相加。未上报的字段显示 —，部分上报的汇总标记 *，不做估算；未知用量不等于零。已删除的会话和未写入日志的请求无法统计。本页展示 Token 数量，不估算费用。',
      tokens: 'Token', noUsage: '用量未知', reported: '仅已上报', partial: '缓存/推理分项包含未上报字段：— 表示未知，* 表示仅部分调用已上报。', minimum: '条调用缺少完整总量；已计入其上报的 Token，汇总为已知消耗下限。', weekdays: '一,二,三,四,五,六,日', back: '返回对话', error: '统计读取失败',
    };
    const en = {
      title: 'Token statistics', intro: 'Explore daily and monthly model usage from your conversation history', refresh: 'Refresh', loading: 'Reading session history. The first scan may take a moment…',
      retry: 'Retry', month: 'Daily calendar', year: 'Monthly trends', allModels: 'All models', today: 'This month', prev: 'Previous', next: 'Next',
      total: 'Total tokens', input: 'Input tokens', output: 'Output tokens', cacheRead: 'Cache read', cacheWrite: 'Cache write', reasoning: 'Reasoning tokens',
      requests: 'Model calls', activeDays: 'Active days', peak: 'Peak day', calendar: 'Daily usage calendar', calendarHint: 'Select a day for details · Darker cells mean more tokens',
      low: 'Less', high: 'More', selectedDay: 'Day details', monthSummary: 'Models this month', yearSummary: 'Models this year', dayModels: 'Models this day',
      model: 'Model / provider', share: 'Share', empty: 'No recorded token usage in this period', clearDay: 'Show whole month', trend: 'Monthly usage', trendHint: 'Select a month to open its calendar',
      coverage: 'Historical sessions', updated: 'Updated', timezone: 'Time zone', missing: 'calls with unknown usage', failed: 'unreadable sessions',
      rules: 'How this is counted', rulesText: 'Actual model-reported usage in historical logs only, including subagents. Fork-inherited history is excluded. Input includes cache read/write; total = input + output. Cache is a subset of input, reasoning a subset of output, never added twice. Unreported fields show —; partial breakdowns are marked *. Values are not estimated; unknown usage is not zero. Deleted sessions and requests absent from logs cannot be counted. Token quantities, not estimated costs.',
      tokens: 'tokens', noUsage: 'Unknown usage', reported: 'Reported only', partial: 'Some cache/reasoning fields are unreported: — means unknown, * means only some calls reported this field.', minimum: 'legacy calls lack exact totals; reported counters are included, making the aggregate a known lower bound.', weekdays: 'Mon,Tue,Wed,Thu,Fri,Sat,Sun', back: 'Back to chat', error: 'Unable to read usage',
    };
    const CSS = `
.ts-page{box-sizing:border-box;height:100%;overflow:auto;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);padding:28px clamp(20px,4vw,48px) 48px;font-size:13px;line-height:1.5;container-type:inline-size}
.ts-wrap{max-width:1100px;margin:auto;display:flex;flex-direction:column;gap:24px}.ts-page *{box-sizing:border-box}.ts-page h1{font-size:20px;font-weight:500;line-height:28px;margin:0}.ts-page h2{font-size:14px;font-weight:500;margin:0}.ts-page p{margin:0}.ts-muted{color:var(--dsw-alias-label-secondary)}
.ts-head,.ts-row{display:flex;align-items:center;justify-content:space-between;gap:12px}.ts-head{align-items:flex-start}.ts-head p{margin-top:4px}.ts-controls{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.ts-page button,.ts-page select{font:inherit;color:inherit}.ts-btn,.ts-page select{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);padding:7px 12px;cursor:pointer;min-height:34px}.ts-page select{max-width:300px}.ts-btn:hover,.ts-page select:hover{background:var(--dsw-alias-bg-layer-2)}.ts-page button:focus-visible,.ts-page select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.ts-page button:disabled{opacity:.5;cursor:wait}.ts-tabs{display:flex;padding:3px;border-radius:10px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);gap:3px}.ts-tab{border:0;background:transparent;padding:6px 14px;border-radius:7px;cursor:pointer}.ts-tab[aria-pressed=true]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary)}.ts-spacer{flex:1}.ts-period{font-weight:500;min-width:130px;text-align:center;font-variant-numeric:tabular-nums}
.ts-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.ts-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:18px;background:var(--dsw-alias-bg-layer-1)}.ts-kpi strong{display:block;font-size:26px;font-weight:500;letter-spacing:-.6px;font-variant-numeric:tabular-nums;line-height:1.4;margin:6px 0}.ts-kpi:first-child{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 40%,var(--dsw-alias-border-l1))}.ts-kpi:first-child strong{color:var(--dsw-alias-brand-primary)}.ts-small{font-size:12px}.ts-calendar-head{margin-bottom:18px}.ts-calendar-head p{margin-top:4px}.ts-calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}.ts-weekday{text-align:center;padding:0 0 8px;font-size:12px;color:var(--dsw-alias-label-secondary)}.ts-day{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;min-height:76px;padding:10px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) var(--ts-heat,0%),var(--dsw-alias-bg-base));display:flex;flex-direction:column;align-items:flex-start;justify-content:space-between;cursor:pointer;font-variant-numeric:tabular-nums}.ts-day:hover{border-color:var(--dsw-alias-brand-primary)}.ts-day[aria-pressed=true]{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.ts-day[data-today=true] .ts-date{color:var(--dsw-alias-brand-primary);font-weight:700}.ts-day .ts-amount{font-size:12px;font-weight:500}.ts-day .ts-unknown{font-size:10px;color:var(--dsw-alias-label-secondary)}.ts-legend{display:flex;align-items:center;justify-content:flex-end;gap:6px;margin-top:12px;font-size:11px;color:var(--dsw-alias-label-secondary)}.ts-swatch{width:13px;height:13px;border-radius:3px;border:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb,var(--dsw-alias-brand-primary) var(--ts-heat),var(--dsw-alias-bg-base))}
.ts-details{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:16px}.ts-details strong{display:block;margin-top:4px;font-weight:500;font-size:16px;font-variant-numeric:tabular-nums}.ts-table-wrap{overflow:auto;margin-top:18px}.ts-table{border-collapse:collapse;width:100%;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.ts-table th{font-size:12px;font-weight:400;color:var(--dsw-alias-label-secondary);padding:0 12px 10px}.ts-table td{padding:14px 12px;border-top:1px solid var(--dsw-alias-border-l1)}.ts-table th:first-child,.ts-table td:first-child{text-align:left;padding-left:0;min-width:180px;white-space:normal;overflow-wrap:anywhere}.ts-table th:last-child,.ts-table td:last-child{padding-right:0}.ts-model-name{font-weight:500}.ts-share{height:4px;border-radius:3px;background:var(--dsw-alias-bg-layer-2);margin-top:6px;width:85px;display:inline-block;overflow:hidden}.ts-share span{display:block;height:100%;background:var(--dsw-alias-brand-primary)}.ts-empty{padding:32px;text-align:center;color:var(--dsw-alias-label-secondary)}.ts-note{border-radius:10px;border:1px solid var(--dsw-alias-border-l1);padding:12px 16px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary)}.ts-warning{border-color:var(--dsw-alias-state-warn-primary)}.ts-error{color:var(--dsw-alias-state-error-primary)}.ts-footer{display:flex;gap:6px 20px;flex-wrap:wrap;color:var(--dsw-alias-label-secondary);font-size:12px}.ts-rules summary{cursor:pointer;color:var(--dsw-alias-label-primary);font-weight:500}.ts-rules p{margin-top:8px;line-height:1.8}.ts-chart{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:10px;height:200px;margin-top:24px;align-items:end}.ts-bar-btn{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:8px;border:0;background:transparent;cursor:pointer;min-width:0;padding:0}.ts-bar-plot{flex:1;display:flex;align-items:flex-end;width:100%;justify-content:center}.ts-bar{width:70%;min-height:3px;border-radius:5px 5px 0 0;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 70%,var(--dsw-alias-bg-layer-2))}.ts-bar-btn:hover .ts-bar{background:var(--dsw-alias-brand-primary)}.ts-bar-value{font-size:10px;color:var(--dsw-alias-label-secondary)}
@container(max-width:740px){.ts-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.ts-day{min-height:64px;padding:6px}.ts-chart{gap:5px}.ts-bar-value{font-size:9px}.ts-controls .ts-spacer{display:none}.ts-controls select{max-width:220px}.ts-head{flex-wrap:wrap}}@container(max-width:420px){.ts-calendar{gap:3px}.ts-day{min-height:58px;padding:5px 3px}.ts-day .ts-amount{font-size:10px}.ts-kpi strong{font-size:22px}.ts-card{padding:12px}.ts-details{grid-template-columns:repeat(2,minmax(0,1fr))}.ts-period{min-width:100px}.ts-chart{gap:3px}.ts-bar-value{display:none}}
`;
    const fields = ['input','output','total','cacheRead','cacheWrite','reasoning','requests','missingUsage','subagentRequests','cacheReadReported','cacheWriteReported','reasoningReported'];
    function sum(rows) {
      const out = Object.fromEntries(fields.map(k => [k, 0]));
      for (const row of rows) for (const key of fields) out[key] += Number(row[key]) || 0;
      return out;
    }
    // K/M/B/T with three significant digits and no trailing zeros: 1.17B, 221M, 79.6K, 950.
    // Rounding may promote a unit (999,950 → 1M, never "1000K"). Exact values stay in titles.
    const UNITS = [[1e3,'K'],[1e6,'M'],[1e9,'B'],[1e12,'T']];
    function compact(n) {
      n = Math.round(Number(n));
      if (!Number.isFinite(n) || n <= 0) return '0';
      if (n < 1e3) return String(n);
      let i = UNITS.length - 1;
      while (i > 0 && n < UNITS[i][0]) i--;
      const scaled = n / UNITS[i][0];
      const rounded = Number(scaled.toFixed(scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2));
      if (rounded >= 1000 && i < UNITS.length - 1) return '1' + UNITS[i + 1][1];
      return rounded + UNITS[i][1];
    }
    function Icon({size = 20}) {
      // data-ts-panel marks the sidebar row this glyph renders into (see the toggle effect).
      return h('svg', {width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.6,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true,'data-ts-panel':''},
        h('rect',{x:3,y:5,width:18,height:16,rx:3}),h('path',{d:'M3 10h18M8 3v4M16 3v4M8 17v-3M12 17v-5M16 17v-1'}));
    }
    return {
      inject: ['slots','locale','layout'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'zh', zh));
        ctx.effect(() => ctx.locale.register(NS, 'en', en));
        const t = ctx.locale.bind(NS);
        function Page() {
          const locale = React.useSyncExternalStore(fn => ctx.locale.subscribe(fn), () => ctx.locale.getSnapshot());
          const lang = locale.active.startsWith('zh') ? 'zh-CN' : 'en-US';
          const now = new Date();
          const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
          const [period, setPeriod] = React.useState(today.slice(0,7));
          const [mode, setMode] = React.useState('month');
          const [selected, setSelected] = React.useState(null);
          const [model, setModel] = React.useState('');
          const [data, setData] = React.useState(null);
          const [loading, setLoading] = React.useState(true);
          const [error, setError] = React.useState('');
          const [revision, refresh] = React.useState(0);
          const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
          React.useEffect(() => {
            const controller = new AbortController();
            setLoading(true); setError('');
            fetch(`api/dsh-token-statistics?timeZone=${encodeURIComponent(zone)}`, {signal:controller.signal,credentials:'same-origin',cache:'no-store'})
              .then(async r => { const value = await r.json(); if (!r.ok) throw new Error(value.error || `HTTP ${r.status}`); return value; })
              .then(value => {if (!controller.signal.aborted) setData(value);})
              .catch(e => {if (!controller.signal.aborted) setError(e.message);})
              .finally(() => {if (!controller.signal.aborted) setLoading(false);});
            return () => controller.abort();
          }, [revision, zone]);
          const number = n => Number(n || 0).toLocaleString(lang);
          // Display uses K/M/B; `exact` gives the full grouped value for titles. Unreported
          // optional fields stay "—" in both, never a misleading 0.
          const metric = (row, key, exact = false) => {
            const reported = row[key + 'Reported'];
            const optional = ['cacheRead','cacheWrite','reasoning'].includes(key);
            if (optional && !reported) return '—';
            return (exact ? number(row[key]) : compact(row[key])) + (optional && reported < row.requests ? ' *' : '');
          };
          const year = Number(period.slice(0,4)), month = Number(period.slice(5));
          const periodLabel = mode === 'year' ? String(year) : new Date(year,month-1,1).toLocaleDateString(lang,{year:'numeric',month:'long'});
          const days = (data?.days || []).map(d => ({...d, models:d.models.filter(m => !model || m.key === model)}));
          const periodDays = days.filter(d => d.date.startsWith(mode === 'year' ? String(year) + '-' : period));
          const rows = periodDays.flatMap(d => d.models);
          const total = sum(rows);
          const activeDays = periodDays.filter(d => sum(d.models).requests > 0).length;
          const peak = Math.max(0,...periodDays.map(d => sum(d.models).total));
          const dayMap = new Map(days.map(d => [d.date,sum(d.models)]));
          const selectedRows = selected && mode === 'month' ? (days.find(d => d.date === selected)?.models || []) : rows;
          const groups = new Map();
          for (const row of selectedRows) {const prior = groups.get(row.key); groups.set(row.key,{...row,...sum(prior ? [prior,row] : [row])});}
          const models = [...groups.values()].sort((a,b) => b.total-a.total);
          const detail = sum(selectedRows);
          function move(delta) {
            const next = new Date(year + (mode === 'year' ? delta : 0),month-1 + (mode === 'month' ? delta : 0),1);
            setPeriod(`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}`); setSelected(null);
          }
          const button = (text,onClick,extra={}) => h('button',{type:'button',className:'ts-btn',onClick,...extra},text);
          const detailItem = (key,row) => h('div',{key},h('span',{className:'ts-muted ts-small'},t(key)),h('strong',{title:metric(row,key,true)},metric(row,key)));
          function modelTable() {
            if (!models.length) return h('div',{className:'ts-empty'},t('empty'));
            return h('div',{className:'ts-table-wrap'},h('table',{className:'ts-table'},
              h('thead',null,h('tr',null,...['model','input','output','cacheRead','total','share','requests'].map(k => h('th',{key:k,scope:'col'},t(k))))),
              h('tbody',null,...models.map(m => h('tr',{key:m.key},
                h('td',null,h('div',{className:'ts-model-name'},m.model),h('div',{className:'ts-muted ts-small'},m.provider)),
                ...['input','output','cacheRead','total'].map(k => h('td',{key:k,title:metric(m,k,true)},metric(m,k))),
                h('td',null,h('div',null,detail.total ? (m.total/detail.total*100).toFixed(1)+'%' : '—'),h('div',{className:'ts-share'},h('span',{style:{width:(detail.total ? m.total/detail.total*100 : 0)+'%'}}))),
                h('td',{title:number(m.requests)},compact(m.requests),m.missingUsage > 0 && h('div',{className:'ts-muted ts-small'},`${number(m.missingUsage)} ${t('noUsage')}`))
              )))
            ));
          }
          function calendar() {
            const length = new Date(year,month,0).getDate();
            const start = (new Date(year,month-1,1).getDay()+6)%7;
            const cells = t('weekdays').split(',').map(day => h('div',{className:'ts-weekday',key:day},day));
            for(let i=0;i<start;i++) cells.push(h('div',{key:'blank'+i,'aria-hidden':true}));
            for(let i=1;i<=length;i++) {
              const date = `${period}-${String(i).padStart(2,'0')}`;
              const usage = dayMap.get(date) || sum([]);
              const heat = usage.total && peak ? 8 + 38 * Math.sqrt(usage.total/peak) : 0;
              cells.push(h('button',{type:'button',key:date,className:'ts-day',style:{'--ts-heat':heat+'%'},'data-today':date===today,'aria-pressed':selected===date,'aria-label':`${date}: ${number(usage.total)} ${t('tokens')}, ${number(usage.requests)} ${t('requests')}`,title:`${date}\n${t('input')}: ${number(usage.input)}\n${t('output')}: ${number(usage.output)}\n${t('requests')}: ${number(usage.requests)}`,onClick:() => setSelected(selected === date ? null : date)},
                h('span',{className:'ts-date'},i),h('span',{className:'ts-amount'},usage.total ? compact(usage.total) : '—'),usage.missingUsage > 0 && h('span',{className:'ts-unknown'},t('noUsage'))));
            }
            return h('section',{className:'ts-card'},h('div',{className:'ts-calendar-head'},h('h2',null,t('calendar')),h('p',{className:'ts-muted ts-small'},t('calendarHint'))),
              h('div',{className:'ts-calendar'},...cells),h('div',{className:'ts-legend'},t('low'),...[0,10,22,34,46].map(n => h('span',{key:n,className:'ts-swatch',style:{'--ts-heat':n+'%'}})),t('high')));
          }
          function chart() {
            const months = Array.from({length:12},(_,i) => {const p=`${year}-${String(i+1).padStart(2,'0')}`; return {period:p,total:sum(days.filter(d=>d.date.startsWith(p)).flatMap(d=>d.models)).total};});
            const max = Math.max(1,...months.map(m=>m.total));
            return h('section',{className:'ts-card'},h('h2',null,t('trend')),h('p',{className:'ts-muted ts-small'},t('trendHint')),h('div',{className:'ts-chart'},...months.map((m,i)=>h('button',{type:'button',className:'ts-bar-btn',key:m.period,title:`${m.period}: ${number(m.total)} ${t('tokens')}`,'aria-label':`${m.period}: ${number(m.total)} ${t('tokens')}`,onClick:()=>{setPeriod(m.period);setMode('month');setSelected(null);}},h('span',{className:'ts-bar-value'},compact(m.total)),h('span',{className:'ts-bar-plot'},h('span',{className:'ts-bar',style:{height:(m.total/max*100)+'%'}})),h('span',{className:'ts-small ts-muted'},i+1)))));
          }
          const missing = (data?.coverage?.missingUsage || 0) + (data?.coverage?.attemptsWithoutUsage || 0);
          return h('div',{className:'ts-page'},h('style',null,CSS),h('div',{className:'ts-wrap'},
            h('header',{className:'ts-head'},h('div',null,h('h1',null,t('title')),h('p',{className:'ts-muted'},t('intro'))),h('div',{className:'ts-controls'},button('×',()=>ctx.layout.selectPanel(null),{'aria-label':t('back'),title:t('back')}),button(t('refresh'),()=>refresh(v=>v+1),{disabled:loading}))),
            h('div',{className:'ts-controls'},h('div',{className:'ts-tabs'},...['month','year'].map(m=>h('button',{type:'button',key:m,className:'ts-tab','aria-pressed':mode===m,onClick:()=>{setMode(m);setSelected(null);}},t(m)))),h('span',{className:'ts-spacer'}),
              h('div',{className:'ts-controls'},button('‹',()=>move(-1),{'aria-label':t('prev')}),h('span',{className:'ts-period'},periodLabel),button('›',()=>move(1),{'aria-label':t('next')})),button(t('today'),()=>{setPeriod(today.slice(0,7));setMode('month');setSelected(null);}),
              h('select',{'aria-label':t('model'),value:model,onChange:e=>{setModel(e.target.value);setSelected(null);}},h('option',{value:''},t('allModels')),...(data?.models || []).map(m=>h('option',{key:m.key,value:m.key},`${m.model} · ${m.provider}`)))),
            loading && h('p',{className:'ts-muted',role:'status'},t('loading')),
            error && h('div',{className:'ts-note ts-error',role:'alert'},t('error'),': ',error,' ',button(t('retry'),()=>refresh(v=>v+1))),
            data && h(React.Fragment,null,
              (missing > 0 || data.coverage.failedSessions > 0) && h('div',{className:'ts-note ts-warning',role:'status'},`${number(missing)} ${t('missing')} · ${number(data.coverage.failedSessions)} ${t('failed')} · ${t('reported')}`),
              data.coverage.reportedMinimum > 0 && h('div',{className:'ts-note ts-warning'},`${number(data.coverage.reportedMinimum)} ${t('minimum')}`),
              data.coverage.partialBreakdown > 0 && h('p',{className:'ts-muted ts-small'},t('partial')),
              h('section',{className:'ts-kpis'},
                ...[['total',total.total,`${compact(total.requests)} ${t('requests')}`,`${number(total.requests)} ${t('requests')}`],['input',total.input,`${t('cacheRead')}: ${metric(total,'cacheRead')}`,`${t('cacheRead')}: ${metric(total,'cacheRead',true)}`],['output',total.output,`${t('reasoning')}: ${metric(total,'reasoning')}`,`${t('reasoning')}: ${metric(total,'reasoning',true)}`],['activeDays',activeDays,`${t('peak')}: ${compact(peak)}`,`${t('peak')}: ${number(peak)}`]].map(([label,value,sub,subTitle])=>h('div',{className:'ts-card ts-kpi',key:label},h('span',{className:'ts-muted'},t(label)),h('strong',{title:number(value)},label==='activeDays'?number(value):compact(value)),h('span',{className:'ts-muted ts-small',title:subTitle},sub)))),
              mode === 'month' ? calendar() : chart(),
              h('section',{className:'ts-card'},h('div',{className:'ts-row'},h('h2',null,selected && mode==='month' ? `${selected} · ${t('dayModels')}` : t(mode==='month'?'monthSummary':'yearSummary')),selected && mode==='month' && button(t('clearDay'),()=>setSelected(null))),
                h('div',{className:'ts-details'},...['total','input','output','cacheRead','cacheWrite','reasoning'].map(k=>detailItem(k,detail))),modelTable()),
              h('footer',{className:'ts-footer'},h('span',null,`${t('coverage')}: ${number(data.coverage.sessions)}`),h('span',null,`${t('timezone')}: ${data.timeZone}`),h('span',null,`${t('updated')}: ${new Date(data.generatedAt).toLocaleString(lang)}`))
            ),
            h('details',{className:'ts-note ts-rules'},h('summary',null,t('rules')),h('p',null,t('rulesText')))
          ));
        }
        // Toggle: the sidebar row always calls layout.selectPanel(id), which only opens.
        // A second click on our row while the panel is open closes it instead. The
        // capture-phase listener runs before React's root listener, so stopping the
        // event here suppresses the row's own selectPanel(id) re-open.
        ctx.effect(() => {
          const onClick = event => {
            const row = event.target instanceof Element ? event.target.closest('button') : null;
            if (!row || !row.querySelector('svg[data-ts-panel]')) return;
            if (ctx.layout.panelInfo?.getSnapshot?.().activePanelId !== NS) return;
            event.preventDefault();
            event.stopPropagation();
            ctx.layout.selectPanel(null);
          };
          document.addEventListener('click', onClick, true);
          return () => document.removeEventListener('click', onClick, true);
        });
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({name:'sidebar.panellist',id:NS,order:-10,label:()=>t('title'),locale:NS},Icon));
        ctx.slots.inject('main', () => ctx.slots.register({name:'main',key:NS,locale:NS},Page));
      },
    };
  },
});
