import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  compareMainLeagueCriteria,
  gameCardMainLeaguePositions,
} from '../assets/js/game-card-awards.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const leaderboardJs = read('../assets/js/leaderboard.js');
const howToPlay = read('../how-to-play.html');
const migration = read('../supabase/main-leaderboard-tiebreak-order-2026-09-03.sql');

const base = {
  ultimate_champion_points: 100,
  correct_scores: 10,
  correct_results: 20,
  prediction_points: 70,
  star_man_points: 30,
  star_man_goals: 5,
  star_man_assists: 4,
  star_man_yellows: 2,
  star_man_reds: 0,
};

test('Main Leaderboard uses UC, Correct Scores, Correct Results, then Prediction points', () => {
  const moreCorrectScores = { ...base, user_id: 'scores', correct_scores: 11, prediction_points: 60 };
  const morePredictionPoints = { ...base, user_id: 'prediction', correct_scores: 10, prediction_points: 90 };
  assert.ok(compareMainLeagueCriteria(moreCorrectScores, morePredictionPoints) < 0);

  const moreCorrectResults = { ...base, user_id: 'results', correct_results: 21, prediction_points: 60 };
  assert.ok(compareMainLeagueCriteria(moreCorrectResults, morePredictionPoints) < 0);

  const positions = gameCardMainLeaguePositions([
    morePredictionPoints,
    moreCorrectScores,
    moreCorrectResults,
  ]);
  assert.equal(positions.scores, 1);
  assert.equal(positions.results, 2);
  assert.equal(positions.prediction, 3);
});

test('all nine equal criteria share a position', () => {
  const positions = gameCardMainLeaguePositions([
    { ...base, user_id: 'z-user' },
    { ...base, user_id: 'a-user' },
  ]);
  assert.equal(positions['a-user'], 1);
  assert.equal(positions['z-user'], 1);
});

test('visible leaderboard source uses the same nine-criterion order', () => {
  assert.match(
    leaderboardJs,
    /ultimate_champion_points\)[^]*correct_scores\)[^]*correct_results\)[^]*prediction_points\)[^]*star_man_points\)[^]*star_man_goals\)[^]*star_man_assists\)[^]*star_man_yellows\)[^]*star_man_reds\)/,
  );
});

test('How to Play publishes the corrected Main Leaderboard order', () => {
  assert.match(
    howToPlay,
    /Main Leaderboard ties:<\/strong> Positions are decided by most UC pts, most Correct Scores, most Correct Results, most Prediction points, most Star Man points, most Star Man goals, most Star Man assists, fewest Star Man yellow cards, then fewest Star Man red cards\./,
  );
});

test('frozen Game Card main-league positions use the corrected order', () => {
  assert.match(
    migration,
    /ultimate_champion_points desc,[^]*correct_scores desc,[^]*correct_results desc,[^]*prediction_points desc,[^]*star_man_points desc,[^]*star_man_goals desc,[^]*star_man_assists desc,[^]*star_man_yellows asc,[^]*star_man_reds asc/,
  );
});
