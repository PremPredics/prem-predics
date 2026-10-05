import { supabase } from './supabase-client.js';
import { escapeHtml, leagueUrl, loadLeagueContext } from './league-context.js';
import { boundedRead } from './async-read.js';
import { buildAwards, championStandings } from './awards-model.js?v=20261005';

const grid = document.querySelector('[data-awards-grid]');
const status = document.querySelector('[data-status]');
const champions = document.querySelector('[data-champions]');
let league;
let pending;
let lastLoaded = 0;

const paths = {
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 5V3H3v13h2"/>',
  bolt: '<path d="m14 2-9 12h6l-1 8 9-12h-6Z"/>',
  shield: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z"/><path d="m9 9 6 6m0-6-6 6"/>',
  target: '<path d="M3 20V5h18v15M7 5v15M3 9h18M3 15h18"/><circle cx="16" cy="18" r="3"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="m12 7 5 4-2 6H9l-2-6Zm0 0V3m5 8 4-2m-6 8 3 3m-9-3-3 3m1-9L3 9"/>',
  moon: '<path d="M19 15A8 8 0 0 1 9 5a8 8 0 1 0 10 10Z"/><path d="m18 2 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"/>',
  diamond: '<path d="m3 8 4-5h10l4 5-9 13Zm0 0h18M7 3l5 18 5-18"/>',
  flag: '<path d="M5 22V3m0 1c5-4 9 4 15 0v10c-6 4-10-4-15 0"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6h14M5 18h14"/>',
  star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
};

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
      <div class="award-top"><span class="award-number">HONOUR ${String(award.number).padStart(2, '0')}</span><span class="award-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${paths[award.icon]}</svg></span></div>
      <h2>${award.title}</h2><p class="award-description">${award.description}</p>
      <div class="award-holders">${holders}</div>
      <p class="award-value">${award.key === 'entertainer' ? award.value.toFixed(2) : award.value}<small>${award.unit}</small></p>${notes}
    </article>`;
  }).join('');
  status.hidden = Boolean(awards.length);
  status.textContent = 'The honours are waiting to be claimed. Awards will appear as your league makes its mark.';
  const completed = Number(data.completed_gameweeks || 0);
  document.querySelector('[data-season-summary]').textContent = `${awards.length + (completed && members.length ? 1 : 0)} honours claimed · ${completed} completed Gameweek${completed === 1 ? '' : 's'}`;
  champions.hidden = !completed || !members.length;
  if (!champions.hidden) {
    const standings = championStandings(members);
    const limit = members.length === 2 ? 2 : 3;
    const ranks = [...new Set(standings.filter(row => row.rank <= limit).map(row => row.rank))];
    champions.innerHTML = `<p class="awards-eyebrow">THE WEEKLY CROWN</p><h2 id="champions-title">Gameweek Champion</h2>
      <p class="champions-copy">Most Gameweeks won · Highest weekly UC points<br>Tied weekly leaders each earn a win.</p>
      <div class="champions-podium" style="--podium-columns:${ranks.length}">${ranks.map(rank => {
        const holders = standings.filter(row => row.rank === rank);
        return `<div class="podium-place ${rank === 2 ? 'silver' : rank === 3 ? 'bronze' : 'gold'}"><div class="podium-medal" aria-label="Rank ${rank}">${rank}</div><div class="podium-holders">${holders.map(person).join('')}</div><div class="podium-count">${Number(holders[0].wins)}<small>Gameweek${Number(holders[0].wins) === 1 ? '' : 's'} won${holders.length > 1 ? ' · shared place' : ''}</small></div></div>`;
      }).join('')}</div>
      <details class="champions-all"><summary>View all ${members.length} members</summary>${standings.map(row => `<div class="champions-row"><span>${row.rank}</span>${person(row)}<strong>${Number(row.wins)} <span class="award-note">wins</span></strong></div>`).join('')}</details>`;
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
