// Presentation only: every destination keeps the existing league-scoped URL.
const paths={
 predictions:'M5 4h14v16H5zM8 8h8M8 12h3m3 0h2M8 16h8',
 star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z',
 cards:'m8 3 12 3-4 15-12-3zM9 8l6 2M8 12l4 1',
 game:'M4 6h16v14H4zM8 3v6m8-6v6M4 11h16m-12 4h2m4 0h2',
 table:'M4 20V10h4v10m2 0V4h4v16m2 0V14h4v6M2 20h20',
 chart:'M4 4v16h17M7 15l4-5 4 3 5-7',
 score:'M3 5h18v14H3zM12 5v14M6 10h3v4H6zm9 0h3v4h-3z',
 curse:'m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7zM12 8v5m0 3h.01',
 medal:'m8 3 4 6 4-6M6 3l4 7m8-7-4 7M12 10a5 5 0 1 0 0 10 5 5 0 0 0 0-10',
 trophy:'M8 3h8v6a4 4 0 0 1-8 0zM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 1v5m-4 3h8m-6-3h4',
};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
export function renderHubNavigation(pages,leagueId,gameweek,leagueUrl,escapeHtml) {
 const url=page=>escapeHtml(leagueUrl(page,leagueId));
 const primary=pages.filter(p=>p.menu).map(p=>{
  const prediction=p.menu==='predictions';
  return `<article class="hub-pick ${prediction?'hub-pick-predictions':'hub-pick-star'}">
   <div class="hub-pick-top"><span class="hub-icon">${icon(prediction?'predictions':'star')}</span><span class="hub-week-tag">GW ${escapeHtml(gameweek)}</span></div>
   <h3>${escapeHtml(p.title)}</h3><p>${prediction?'Every score. Your call.':'One player. Make it count.'}</p>
   <a class="hub-submit" href="${url(p.options[0].page)}"><span>${prediction?'Make Predictions':'Pick Star Man'}</span><span aria-hidden="true">↗</span></a>
   <a class="hub-history-link" href="${url(p.options[1].page)}">${prediction?'All Player Predictions':'All Player Star Men'}<span aria-hidden="true">→</span></a>
  </article>`;
 }).join('');
 const tile=(page,title,description,type,extra='')=>`<a class="hub-route ${extra}" href="${url(page)}"><span class="hub-icon">${icon(type)}</span><span class="hub-route-copy"><strong>${title}</strong><small>${description}</small></span><span class="hub-route-arrow" aria-hidden="true">↗</span></a>`;
 return `<section class="hub-play-section" aria-labelledby="hub-play-title"><div class="hub-section-label"><h2 id="hub-play-title">Your next move</h2><span>PLAY YOUR GAME</span></div>
  <div class="hub-picks">${primary}</div><div class="hub-card-routes">
  ${tile('power-cards.html','Power Cards','Your hand. Your advantage.','cards','hub-route-power')}
  ${tile('game-card.html','Game Cards','Five weeks. One challenge.','game','hub-route-game')}</div></section>
  <section class="hub-explore-section" aria-labelledby="hub-explore-title"><div class="hub-section-label"><h2 id="hub-explore-title">Inside your league</h2><span>THE BIG PICTURE</span></div>
  <a class="hub-standings" href="${url('leaderboard.html')}"><span class="hub-standings-art" aria-hidden="true">${icon('table')}</span><span><small>THE RACE TO THE TOP</small><strong>Leaderboard</strong><span>Standings, weekly moves & season progress</span></span><span class="hub-standings-arrow" aria-hidden="true">↗</span></a>
  <div class="hub-explore-grid">
  ${tile('correct-scores.html','Correct Scores','The perfect predictions','score')}
  ${tile('statistics.html','Statistics','The numbers behind the league','chart')}
  ${tile('live-curses.html','Live Curses',`The curse board · GW ${escapeHtml(gameweek)}`,'curse','hub-route-curses')}
  ${tile('medals.html','Medals','Milestones & rewards','medal','hub-route-medals')}</div>
  <a class="hub-awards" href="${url('awards.html')}"><span class="hub-icon">${icon('trophy')}</span><span><small>LEAGUE LEGENDS</small><strong>The Awards</strong></span><span class="hub-awards-copy">A season worth celebrating</span><span aria-hidden="true">↗</span></a>
 </section>`;
}
