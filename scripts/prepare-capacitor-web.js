import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
  'terms.html',
  'privacy.html',
  'cookies.html',
  'game-rules.html',
  'contact.html',
  'account-deletion.html',
  'global-admin.html',
  'offline.html',
  'manifest.webmanifest',
  'service-worker.js',
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

const capacitorScript = '<script type="module" src="assets/js/capacitor-app.js"></script>';

for (const item of itemsToCopy.filter((name) => name.endsWith('.html'))) {
  const target = path.join(distDir, item);
  if (!existsSync(target)) {
    continue;
  }

  const html = await readFile(target, 'utf8');
  if (html.includes('assets/js/capacitor-app.js') || !html.includes('</body>')) {
    continue;
  }

  await writeFile(target, html.replace('</body>', `${capacitorScript}\n</body>`));
}

console.log('Prepared static web files for Capacitor in dist/.');
