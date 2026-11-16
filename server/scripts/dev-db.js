// Development-only PostgreSQL (no Docker needed). Production uses a real PostgreSQL server.
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.pgdata');
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: 'ebmis',
  password: 'ebmis_dev',
  port: 5433,
  persistent: true,
});
if (!fs.existsSync(path.join(dir, 'PG_VERSION'))) await pg.initialise();
await pg.start();
for (const db of ['ebmis', 'ebmis_test']) {
  try { await pg.createDatabase(db); } catch { /* already exists */ }
}
console.log('Dev PostgreSQL running on port 5433 (databases: ebmis, ebmis_test). Ctrl+C to stop.');
process.on('SIGINT', async () => { await pg.stop(); process.exit(0); });
