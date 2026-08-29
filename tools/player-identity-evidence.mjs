import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Read only the explicit name-evidence tuples. Never execute the source SQL;
// its historical roster/activation operations are NOT part of this repair.
export function readIdentityEvidence() {
  const source = readFileSync(new URL('../supabase/player-identity-nationality-update-2025-26.sql', import.meta.url), 'utf8');
  const values = source.slice(source.indexOf('\nvalues'), source.indexOf('-- Repair step:'));
  return values.split('\n').filter((line) => line.trim().startsWith('(')).map((line) => {
    const parts = [...line.matchAll(/'((?:''|[^'])*)'/g)].map((m) => m[1].replace(/''/g, "'"));
    if (parts.length !== 10) throw new Error('Unexpected identity-evidence row');
    return {
      source_key: `identity-2025-26:${parts[0]}:${parts[2]}`,
      nationality: parts[9],
      canonical_name: parts[4],
      names: [...new Set(parts.slice(2, 5))],
    };
  });
}

export function identityEvidenceSql() {
  const quote = (value) => `'${value.replace(/'/g, "''")}'`;
  return 'insert into pp_stats_identity_source (source_key, nationality, canonical_name, names) values\n'
    + readIdentityEvidence().map((row) => `  (${quote(row.source_key)}, ${quote(row.nationality)}, ${quote(row.canonical_name)}, array[${row.names.map(quote).join(', ')}])`).join(',\n') + ';';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rows = readIdentityEvidence();
  const start = Number(process.argv[2] || 0);
  const end = start + Number(process.argv[3] || rows.length);
  console.log(JSON.stringify({ total: rows.length, rows: rows.slice(start, end) }));
}
