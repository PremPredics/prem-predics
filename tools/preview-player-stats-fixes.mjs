// Local-only visual QA: real app HTML/modules + synthetic data, never Supabase.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
const root = process.cwd();
const lock = new Date(Date.now() + 7200000).toISOString();
const kick = new Date(Date.now() + 12600000).toISOString();
const leagues = [1, 2].map((n) => ({ id: `league${n}`, name: n === 1 ? 'PREVIEW PREMIER LEAGUE' : 'Friends League', season_id: 's', starts_gameweek_id: 100 }));
const tables = {
  profiles: [{ id: 'preview', display_name: 'Preview User', profile_image_url: null }],
  seasons: [{ id: 's', name: 'Current', is_active: true, starts_on: '2026-08-01' }],
  teams: [{ id: 'city', name: 'Manchester City' }, { id: 'other', name: 'Arsenal' }],
  gameweeks: [{ id: 100, season_id: 's', number: 1, star_man_locks_at: lock }],
  gameweek_deadlines: [{ gameweek_id: 100, season_id: 's', gameweek_number: 1, first_fixture_kickoff_at: kick, star_man_locks_at: lock }],
  fixtures: [{ id: 'f1', season_id: 's', gameweek_id: 100, home_team_id: 'city', away_team_id: 'other', kickoff_at: kick, prediction_locks_at: lock, status: 'scheduled' }],
  players: [{ id: 'foden', display_name: 'Phil Foden', first_name: 'Phil', last_name: 'Foden', team_id: 'city', is_active: true },
    { id: 'cherki', display_name: 'Rayan Cherki', first_name: 'Rayan', last_name: 'Cherki', team_id: 'city', is_active: true },
    { id: 'old-foden', display_name: 'Philip Walter Foden', team_id: 'city', is_active: false }],
  player_name_aliases: [{ player_id: 'foden', name: 'Philip Walter Foden' }],
  player_team_assignments: ['foden', 'cherki', 'old-foden'].map((player_id) => ({ id: player_id, season_id: 's', player_id, team_id: 'city', starts_gameweek_id: 100, ends_gameweek_id: null })),
  competition_members: leagues.map((competitions) => ({ user_id: 'preview', competition_id: competitions.id, competitions, joined_at: '2026-08-01' })),
  game_card_rounds: leagues.map((league) => ({ id: `round-${league.id}`, competition_id: league.id, season_id: 's', start_gameweek_id: 100, end_gameweek_id: 100 })),
  predictions: [], star_man_picks: [], game_card_predictions: [], card_definitions: [], player_fixture_stats: [], player_gameweek_stats: [], match_results: [], fixture_game_stats: [],
};
const fakeClient = `import { fakeSupabase } from '/tests/support/fake-supabase.mjs';
export const supabase = fakeSupabase(${JSON.stringify(tables)}, {
  user: { id: 'preview', email: 'preview@example.invalid', user_metadata: { display_name: 'Preview User' } },
  handler: (q) => {
    if (new URLSearchParams(location.search).has('testFailure') && q.table === 'game_card_predictions') {
      return { data: null, error: { code: 'PGRST999', message: 'Simulated test failure' } };
    }
  }
});
window.premPredicsSupabase = supabase;`;
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:4187');
  if (url.pathname === '/assets/js/supabase-client.js') {
    res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
    res.end(fakeClient); return;
  }
  if (url.pathname === '/service-worker.js') {
    res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
    res.end('// No service worker caching in this isolated QA preview.'); return;
  }
  const path = resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
  if (!path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(4187, '127.0.0.1', () => console.log('Synthetic QA only: http://127.0.0.1:4187 (no live database connections)'));
