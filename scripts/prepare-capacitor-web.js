import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');

const itemsToCopy = [
  'index.html',
  'login.html',
  'profile.html',
  'prediction-hub.html',
  'predictions.html',
  'correct-scores.html',
  'star-man-hub.html',
  'star-man.html',
  'all-star-men.html',
  'all-predictions.html',
  'leaderboard.html',
  'league.html',
  'leagues.html',
  'statistics.html',
  'medals.html',
  'power-cards.html',
  'game-card.html',
  'how-to-play.html',
  'faq.html',
  'global-admin.html',
  'logo-left.png',
  'assets'
];

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

for (const item of itemsToCopy) {
  const source = path.join(root, item);
  const target = path.join(distDir, item);

  if (!existsSync(source)) {
    console.warn(`Skipping missing item: ${item}`);
    continue;
  }

  await cp(source, target, { recursive: true });
}

console.log('Prepared static web files for Capacitor in dist/.');
