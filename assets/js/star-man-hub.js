import { leagueUrl, loadLeagueContext } from './league-context.js';
import { loadActiveGameweek } from './gameweek-context.js';

const title = document.querySelector('[data-star-hub-title]');
const copy = document.querySelector('[data-star-hub-copy]');
const pickLink = document.querySelector('[data-pick-star-man]');
const viewLink = document.querySelector('[data-view-star-men]');
const backLink = document.querySelector('[data-league-back]');

const context = await loadLeagueContext();

if (context.error) {
  title.textContent = 'Star Man unavailable';
  copy.textContent = context.error;
  pickLink.hidden = true;
  viewLink.hidden = true;
} else {
  const { league } = context;
  pickLink.href = leagueUrl('star-man.html', league.id);
  viewLink.href = leagueUrl('all-star-men.html', league.id);
  backLink.href = leagueUrl('league.html', league.id);

  try {
    const { activeGameweek } = await loadActiveGameweek(league);
    if (activeGameweek) {
      title.textContent = `Gameweek ${activeGameweek.gameweek_number} Star Man`;
      copy.textContent = 'Pick your Star Man, or view locked Star Men from the league.';
    }
  } catch {
    copy.textContent = 'Choose what you want to do.';
  }
}
