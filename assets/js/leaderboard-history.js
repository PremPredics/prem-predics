import {supabase} from './supabase-client.js';
import {escapeHtml} from './league-context.js';
import {boundedRead} from './async-read.js';
import {loadAllRows} from './load-all-rows.js';
import {rankingFields,buildLeaderboardHistory} from './leaderboard-history-model.js?v=20261028';

const palette=['#8ce5ff','#ffc86e','#ea9dff','#80ecac','#ff899d','#c1b1ff','#e8ec81','#64ddd3','#ffb58d','#c8ddff'];
export function createLeaderboardHistory() {
  const panel=document.querySelector('[data-leaderboard-history]');
  const content=panel.querySelector('[data-history-content]');
  const note=document.querySelector('[data-movement-note]');
  let state=null, generation=0, retry=null, all=false, metric='rank', selected=null, focusUser=null;
  function movementText(history) {
    if(history.weeks.length<2) return 'Arrows appear after two completed Gameweeks.';
    return 'Arrows: end of GW'+history.weeks.at(-1).number+' compared with end of GW'+history.weeks.at(-2).number+'.';
  }
  function updateArrows(history) {
    document.querySelectorAll('[data-rank-movement]').forEach(el=>{
      const change=history.movements.get(el.dataset.rankMovement);
      el.className='rank-movement'+(change>0?' is-up':change<0?' is-down':' is-level');
      const description=change===undefined?'Not enough completed Gameweeks to compare':
        change===0?'No position change':(change>0?'Up ':'Down ')+Math.abs(change)+' place'+(Math.abs(change)===1?'':'s');
      el.setAttribute('aria-label',description);
      el.title=description;
      el.innerHTML=change===undefined || change===0 ? '<span aria-hidden="true">—</span>' :
        '<span aria-hidden="true">'+(change>0?'▲':'▼')+' '+Math.abs(change)+'</span>';
    });
    note.textContent=movementText(history)+' The table itself shows live standings.';
  }
  function profile(member) {
    const url=member.profile_image_url;
    return '<span class="history-avatar">'+(url?.startsWith('data:image/')?'<img alt="" src="'+escapeHtml(url)+'">':escapeHtml((member.display_name||'P').charAt(0)))+'</span>';
  }
  function drawDetails() {
    if(!state?.history.weeks.length) return;
    const week=state.history.weeks.find(w=>w.number===selected)||state.history.weeks.at(-1);
    selected=week.number;
    content.querySelector('[data-history-step="-1"]').disabled=week.number===state.history.weeks[0].number;
    content.querySelector('[data-history-step="1"]').disabled=week.number===state.history.weeks.at(-1).number;
    const rows=all?week.rows:week.rows.filter(row=>row.user_id===state.userId);
    content.querySelector('[data-history-selected]').textContent='End of GW'+week.number;
    content.querySelector('[data-history-details]').innerHTML=rows.map(row=>{
      const member=state.members.find(m=>m.user_id===row.user_id);
      const colour=palette[state.members.indexOf(member)%palette.length];
      return '<div class="history-detail-row" style="--line-colour:'+colour+'">'+profile(member)+
        '<span class="history-member-name">'+escapeHtml(member.display_name)+'</span><strong>#'+row.rank+
        '</strong><span>'+Number(row.ultimate_champion_points).toLocaleString('en-GB')+' <small>UC pts</small></span></div>';
    }).join('');
    content.querySelectorAll('[data-history-week]').forEach(el=>el.setAttribute('aria-pressed',String(Number(el.dataset.historyWeek)===selected)));
    const marker=content.querySelector('[data-history-marker]');
    if(marker) { const x=48+(selected-1)*24; marker.setAttribute('x1',x); marker.setAttribute('x2',x); }
  }
  function render() {
    if(!state) return;
    const {history,members,userId}=state;
    if(!history.weeks.length) {
      content.innerHTML='<p class="history-empty">Your journey starts here. The chart will appear after the first Gameweek finishes.</p>';
      return;
    }
    selected=history.weeks.some(w=>w.number===selected)?selected:history.weeks.at(-1).number;
    const visible=all?members:members.filter(m=>m.user_id===userId);
    const values=history.weeks.flatMap(w=>w.rows.filter(r=>visible.some(m=>m.user_id===r.user_id)).map(r=>Number(r.ultimate_champion_points)));
    const low=Math.min(0,...values), high=Math.max(1,...values);
    const step=Math.max(1,Math.ceil((high-low)/5));
    const min=Math.floor(low/step)*step, max=Math.ceil(high/step)*step;
    const y=value=>metric==='rank'?30+(value-1)*(240/9):270-(value-min)*240/(max-min||1);
    const x=week=>48+(week-1)*24;
    const ticks=metric==='rank'?Array.from({length:10},(_,i)=>i+1):Array.from({length:6},(_,i)=>min+(max-min)*i/5);
    const grid=ticks.map(t=>'<line x1="48" x2="936" y1="'+y(t)+'" y2="'+y(t)+'" class="history-gridline"/><text x="36" y="'+(y(t)+4)+'" text-anchor="end">'+Math.round(t)+'</text>').join('');
    const labels=Array.from({length:38},(_,i)=>'<text x="'+x(i+1)+'" y="294" text-anchor="middle">'+(i+1)+'</text>').join('');
    const lines=visible.map(m=>{
      const colour=palette[members.indexOf(m)%palette.length];
      const points=history.weeks.map(w=>{const r=w.rows.find(row=>row.user_id===m.user_id);return {week:w.number,row:r,x:x(w.number),y:y(metric==='rank'?r.rank:r.ultimate_champion_points)};});
      // Gaps remain gaps: no invented values for a wholly postponed week.
      let path=''; points.forEach((p,i)=>{path+=(i&&points[i-1].week===p.week-1?'L':'M')+p.x+' '+p.y+' ';});
      const dim=all&&focusUser&&focusUser!==m.user_id;
      return '<g opacity="'+(dim?'.18':'1')+'"><path d="'+path+'" fill="none" stroke="'+colour+'" stroke-width="'+(m.user_id===userId?'3':'2')+'" stroke-linejoin="round"/>'+
        points.map(p=>'<circle cx="'+p.x+'" cy="'+p.y+'" r="3" fill="'+colour+'"><title>'+escapeHtml(m.display_name)+' · GW'+p.week+' · #'+p.row.rank+' · '+p.row.ultimate_champion_points+' UC pts</title></circle>').join('')+'</g>';
    }).join('');
    const weekButtons=history.weeks.map(w=>'<g role="button" tabindex="0" data-history-week="'+w.number+'" aria-label="View end of Gameweek '+w.number+'" aria-pressed="'+(w.number===selected)+'"><rect x="'+(x(w.number)-11)+'" y="16" width="22" height="264" fill="transparent"/></g>').join('');
    content.innerHTML='<div class="history-controls"><div class="history-metrics" role="group" aria-label="Chart metric"><button type="button" data-history-metric="rank" aria-pressed="'+(metric==='rank')+'">Position</button><button type="button" data-history-metric="points" aria-pressed="'+(metric==='points')+'">UC points</button></div>'+
      '<label class="history-league-toggle"><input type="checkbox" data-history-all '+(all?'checked':'')+'> Whole league</label></div>'+
      '<p class="history-caption">'+(all?'Whole league':'Your progress')+' · Completed Gameweeks only'+(metric==='rank'?' · 1st place at the top':' · Cumulative UC points')+'</p>'+
      '<div class="history-chart-scroll" tabindex="0" aria-label="Season progress chart. Scroll horizontally to explore all 38 Gameweeks."><svg viewBox="0 0 972 320" class="history-chart" role="group" aria-label="'+(metric==='rank'?'League position':'Total UC points')+' by Gameweek">'+
      grid+labels+'<text x="492" y="315" text-anchor="middle">GAMEWEEK</text>'+lines+'<line data-history-marker x1="'+x(selected)+'" x2="'+x(selected)+'" y1="16" y2="280" class="history-selected-line"/>'+weekButtons+'</svg></div>'+
      '<p class="history-chart-tip">Tap a week to see positions and points. Swipe the chart to explore the season.</p>'+
      (all?'<div class="history-legend" aria-label="Highlight a player">'+members.map((m,i)=>'<button type="button" data-history-user="'+escapeHtml(m.user_id)+'" aria-pressed="'+(focusUser===m.user_id)+'" style="--line-colour:'+palette[i%palette.length]+'">'+profile(m)+'<span>'+escapeHtml(m.display_name)+'</span></button>').join('')+'</div>':'')+
      '<div class="history-week-controls"><button type="button" data-history-step="-1" aria-label="Previous completed Gameweek">‹</button><strong data-history-selected></strong><button type="button" data-history-step="1" aria-label="Next completed Gameweek">›</button></div><div data-history-details aria-live="polite"></div>'+
      '<p class="history-footnote">Uses the same tiebreaks as the leaderboard. Tied players share a position. Corrected results and stats update the history.</p>';
    drawDetails();
  }
  panel.addEventListener('toggle',()=>{
    if(panel.open&&state) {
      render();
      const scroller=content.querySelector('.history-chart-scroll');
      if(scroller)scroller.scrollLeft=Math.max(0,(48+(selected-1)*24)*scroller.scrollWidth/972-scroller.clientWidth/2);
    }
  });
  content.addEventListener('change',event=>{if(event.target.matches('[data-history-all]')){
    const scroll=content.querySelector('.history-chart-scroll')?.scrollLeft||0;
    all=event.target.checked;focusUser=null;render();
    content.querySelector('[data-history-all]').focus({preventScroll:true});
    content.querySelector('.history-chart-scroll').scrollLeft=scroll;
  }});
  content.addEventListener('click',event=>{
    const el=event.target.closest('[data-history-metric],[data-history-user],[data-history-week],[data-history-step],[data-history-retry]');
    if(!el)return;
    const scroll=content.querySelector('.history-chart-scroll')?.scrollLeft||0;
    if(el.hasAttribute('data-history-retry')){retry?.();return;}
    if(el.dataset.historyMetric){metric=el.dataset.historyMetric;render();content.querySelector('[data-history-metric="'+metric+'"]').focus({preventScroll:true});}
    else if(el.dataset.historyUser){const id=el.dataset.historyUser;focusUser=focusUser===id?null:id;render();Array.from(content.querySelectorAll('[data-history-user]')).find(button=>button.dataset.historyUser===id)?.focus({preventScroll:true});}
    else if(el.dataset.historyWeek){selected=Number(el.dataset.historyWeek);drawDetails();}
    else if(el.dataset.historyStep){
      const i=state.history.weeks.findIndex(w=>w.number===selected);
      selected=state.history.weeks[Math.max(0,Math.min(state.history.weeks.length-1,i+Number(el.dataset.historyStep)))].number;
      drawDetails();
    }
    const scroller=content.querySelector('.history-chart-scroll');
    if(scroller)scroller.scrollLeft=scroll;
  });
  content.addEventListener('keydown',event=>{
    const target=event.target.closest('[data-history-week]');
    if(target&&['Enter',' '].includes(event.key)){event.preventDefault();selected=Number(target.dataset.historyWeek);drawDetails();}
  });
  async function update(context, rows, profiles) {
    const request=++generation;
    state=null;
    content.innerHTML='<p class="history-empty" role="status">Loading completed Gameweeks…</p>';
    note.textContent='Loading weekly position changes…';
    retry=()=>update(context,rows,profiles);
    const league=context.league;
    const load=(table,columns,configure)=>boundedRead(signal=>loadAllRows(first=>configure(supabase.from(table).select(columns,first?{count:'exact'}:{})).abortSignal(signal)),12000);
    try {
      const [weeklyStats,gameweeks,fixtures]=await Promise.all([
        load('user_gameweek_stats','gameweek_id,gameweek_number,user_id,'+rankingFields.join(','),q=>q.eq('competition_id',league.id).eq('season_id',league.season_id).order('gameweek_id').order('user_id')),
        load('gameweeks','id,number',q=>q.eq('season_id',league.season_id).order('number')),
        load('fixtures','id,gameweek_id,status,kickoff_at,match_results(fixture_id)',q=>q.eq('season_id',league.season_id).order('id')),
      ]);
      if(request!==generation)return;
      const members=rows.map(row=>({...row,...profiles.get(row.user_id)})).sort((a,b)=>String(a.user_id).localeCompare(String(b.user_id)));
      const history=buildLeaderboardHistory({gameweeks,fixtures,weeklyStats,members,startsGameweekId:league.starts_gameweek_id});
      state={history,members,userId:context.user.id};
      updateArrows(history);
      render();
    } catch(error) {
      if(request!==generation)return;
      note.textContent='Weekly position changes are temporarily unavailable.';
      content.innerHTML='<p class="history-empty">Could not load the history. Your live leaderboard is unaffected.</p><button class="history-retry" type="button" data-history-retry>Retry history</button>';
      console.warn('Leaderboard history unavailable:',error);
    }
  }
  return {update};
}
