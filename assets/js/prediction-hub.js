import { leagueUrl, loadLeagueContext } from './league-context.js';
import { loadActiveGameweek } from './gameweek-context.js';

const title = document.querySelector('[data-prediction-hub-title]');
const copy = document.querySelector('[data-prediction-hub-copy]');
const makeLink = document.querySelector('[data-make-predictions]');
const viewLink = document.querySelector('[data-view-predictions]');
const backLink = document.querySelector('[data-league-back]');

const context = await loadLeagueContext();

if (context.error) {
  title.textContent = 'Predictions unavailable';
  copy.textContent = context.error;
  makeLink.hidden = true;
  viewLink.hidden = true;
} else {
  const { league } = context;
  makeLink.href = leagueUrl('predictions.html', league.id);
  viewLink.href = leagueUrl('all-predictions.html', league.id);
  backLink.href = leagueUrl('league.html', league.id);

  try {
    const { activeGameweek } = await loadActiveGameweek(league);
    if (activeGameweek) {
      title.textContent = `Gameweek ${activeGameweek.gameweek_number} Predictions`;
      copy.textContent = 'Make your picks, or view locked predictions from the league.';
    }
  } catch {
    copy.textContent = 'Choose what you want to do.';
  }
}
