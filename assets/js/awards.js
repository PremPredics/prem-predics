import { supabase } from './supabase-client.js';
import { escapeHtml, leagueUrl, loadLeagueContext } from './league-context.js';
import { boundedRead } from './async-read.js';
import { buildAwards, championStandings } from './awards-model.js?v=20261005-polish';

const grid = document.querySelector('[data-awards-grid]');
const status = document.querySelector('[data-status]');
const champions = document.querySelector('[data-champions]');
let league;
let pending;
let lastLoaded = 0;

const awardEmblem = '<svg class="award-emblem" viewBox="0 0 48 48" focusable="false" aria-hidden="true"><path class="award-star" transform="translate(24 24) scale(1.16) translate(-24 -24)" d="M24 3.5 29.9 15.4 43 17.3l-9.5 9.3 2.2 13.1L24 33.5l-11.7 6.2 2.2-13.1L5 17.3l13.1-1.9Z"/><path class="award-trophy" d="M17 18h14v7.3a7 7 0 0 1-14 0V18Z"/><path class="award-trophy" d="M17 20h-3.5a4.5 4.5 0 0 0 4.5 5M31 20h3.5a4.5 4.5 0 0 1-4.5 5M24 32v6M18.5 39.5h11"/></svg>';

function avatar(member) {
  const url = String(member.profile_image_url || '');
  const image = /^(data:image\/(png|jpe?g|webp|gif);base64,|https:\/\/)/i.test(url);
  const initial = Array.from(String(member.display_name || 'P').trim())[0] || 'P';
  return `<span class="award-avatar">${image ? `<img src="${escapeHtml(url)}" alt="" loading="lazy">` : escapeHtml(initial)}</span>`;
}

function person(member) {
  return `<div class="award-person">${avatar(member)}<span class="award-person-name">${escapeHtml(member.display_name || 'Player')}</span></div>`;
}

function render(data) {
  const members = data.members || [];
  const memberById = new Map(members.map(m => [m.user_id, m]));
  const awards = buildAwards(data);
  grid.innerHTML = awards.map(award => {
    const holders = award.pairs
      ? award.pairs.map(pair => `<div class="award-pair">${[pair.user_a, pair.user_b].map(id => person(memberById.get(id))).join('')}</div>`).join('')
      : award.holders.map(person).join('');
    const notes = award.key === 'best' ? award.holders.map(holder => {
      const match = (data.best_predictions || []).find(row => row.user_id === holder.user_id && Number(row.goals) === award.value);
      return match ? `<span class="award-note">${escapeHtml(holder.display_name)} · GW${Number(match.gameweek_number)} · ${escapeHtml(match.home_team)} ${Number(match.home_goals)}–${Number(match.away_goals)} ${escapeHtml(match.away_team)}</span>` : '';
    }).join('') : '';
    return `<article class="award-card">
      <div class="award-top"><span class="award-corner award-corner-left">${awardEmblem}</span><span class="award-corner award-corner-right">${awardEmblem}</span></div>
      <h2>${award.title}</h2><p class="award-description">${award.description}</p>
      <div class="award-holders">${holders}</div>
      <p class="award-value">${award.key === 'entertainer' ? award.value.toFixed(2) : award.value}<small>${award.unit}</small></p>${notes}
    </article>`;
  }).join('');
  status.hidden = Boolean(awards.length);
  status.textContent = 'The awards are waiting to be claimed. They will appear as your league makes its mark.';
  const completed = Number(data.completed_gameweeks || 0);
  const remaining = Math.max(0, 38 - completed);
  document.querySelector('[data-season-summary]').textContent = `${remaining} Gameweek${remaining === 1 ? '' : 's'} to go...`;
  champions.hidden = !completed || !members.length;
  if (!champions.hidden) {
    const standings = championStandings(members);
    const limit = members.length === 2 ? 2 : 3;
    const ranks = [...new Set(standings.filter(row => row.rank <= limit).map(row => row.rank))];
    champions.innerHTML = `<div class="champions-corner champions-corner-left">${awardEmblem}</div><div class="champions-corner champions-corner-right">${awardEmblem}</div>
      <p class="awards-eyebrow">THE WEEKLY CROWN</p><h2 id="champions-title">Gameweek Champion</h2>
      <p class="champions-copy">Tied GW Winners all win the GW</p>
      <div class="champions-podium" style="--podium-columns:${ranks.length}">${ranks.map(rank => {
        const holders = standings.filter(row => row.rank === rank);
        const metal = rank === 2 ? 'silver' : rank === 3 ? 'bronze' : 'gold';
        return `<div class="podium-place ${metal}"><div class="podium-holders">${holders.map(person).join('')}</div><div class="podium-count">${Number(holders[0].wins)}<small>Gameweek${Number(holders[0].wins) === 1 ? '' : 's'} won${holders.length > 1 ? ' · shared place' : ''}</small></div></div>`;
      }).join('')}</div>
      <details class="champions-all" open><summary>All ${members.length} members</summary>${standings.map(row => `<div class="champions-row">${person(row)}<strong>${Number(row.wins)} <span class="award-note">wins</span></strong></div>`).join('')}</details>`;
  }
}

async function load() {
  if (pending) return pending;
  pending = (async () => {
    try {
      if (!league) {
        const context = await loadLeagueContext();
        if (!context.user) return;
        if (context.error) throw new Error(context.error);
        league = context.league;
        document.querySelector('[data-league-link]').href = leagueUrl('league.html', league.id);
        document.querySelector('[data-league-name]').textContent = league.name;
      }
      const response = await boundedRead(signal => supabase.rpc('get_league_awards', { target_competition_id: league.id }).abortSignal(signal), 12000);
      if (response.error) throw response.error;
      if (!response.data) throw new Error('League awards are not available for this account.');
      render(response.data);
      lastLoaded = Date.now();
    } catch (error) {
      console.warn('Awards could not load:', error);
      status.hidden = false;
      const missing = error.code === 'PGRST202' || error.code === '42883';
      status.textContent = missing ? 'The Awards collection is being prepared. Please check back soon.'
        : 'Could not refresh the awards. Please try again.';
      const retry = document.createElement('button');
      retry.type = 'button'; retry.textContent = 'Try again'; retry.addEventListener('click', load);
      status.append(retry);
    }
  })().finally(() => { pending = null; });
  return pending;
}

load();
const refresh = () => { if (!document.hidden && Date.now() - lastLoaded > 30000) load(); };
window.addEventListener('focus', refresh);
document.addEventListener('visibilitychange', refresh);
window.setInterval(refresh, 60000);
window.addEventListener('pageshow', refresh);