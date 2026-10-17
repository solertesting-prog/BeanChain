/**
 * PostgreSQL embebido para desarrollo en Windows (sin Docker ni instalaciones).
 * Paquete npm "embedded-postgres" → localhost:5433, usuario beanchain/beanchain, BD beanchain.
 * Uso: node infra/local-db.mjs   (deja esta ventana abierta mientras uses BeanChain)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PORT = 5433;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.local-db');
const DATA = path.join(ROOT, 'data');
const READY = path.join(ROOT, 'ready');
const isWin = process.platform === 'win32';
let pg = null;

const portBusy = (port) =>
  new Promise((res) => {
    const s = createConnection({ port, host: '127.0.0.1' });
    s.once('connect', () => (s.destroy(), res(true)));
    s.once('error', () => res(false));
  });

async function main() {
  mkdirSync(ROOT, { recursive: true });
  rmSync(READY, { force: true });
  if (await portBusy(PORT)) {
    console.log(`[bd] Ya hay una base de datos en el puerto ${PORT}; la reutilizo.`);
    writeFileSync(READY, 'ok');
    return;
  }
  const pkgDir = path.join(ROOT, 'node_modules', 'embedded-postgres');
  if (!existsSync(pkgDir)) {
    console.log('[bd] Instalando PostgreSQL embebido (sólo la primera vez, unos 100 MB)...');
    writeFileSync(path.join(ROOT, 'package.json'), JSON.stringify({ name: 'beanchain-local-db', private: true }));
    const r = spawnSync(isWin ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund', 'embedded-postgres'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: isWin,
    });
    if (r.status !== 0) throw new Error('No se pudo instalar embedded-postgres');
  }
  const pkg = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  const exp = typeof pkg.exports === 'string' ? pkg.exports : pkg.exports?.['.'];
  const entry = (typeof exp === 'string' ? exp : (exp?.import?.default ?? exp?.import ?? exp?.default)) ?? pkg.module ?? pkg.main ?? 'index.js';
  const mod = await import(pathToFileURL(path.join(pkgDir, entry)).href);
  const EmbeddedPostgres = mod.default ?? mod.EmbeddedPostgres;

  const databaseDir = path.join(DATA, 'postgres');
  pg = new EmbeddedPostgres({
    databaseDir,
    user: 'beanchain',
    password: 'beanchain',
    port: PORT,
    persistent: true,
    onLog: () => {},
    onError: (e) => console.error('[postgres]', e?.toString?.() ?? e),
  });
  if (!existsSync(path.join(databaseDir, 'PG_VERSION'))) {
    console.log('[bd] Creando la base de datos local...');
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase('beanchain');
  } catch {
    /* ya existe */
  }
  writeFileSync(READY, 'ok');
  console.log(`[bd] PostgreSQL listo en localhost:${PORT}. Deja esta ventana abierta; ciérrala para pararlo.`);
}

async function shutdown() {
  rmSync(READY, { force: true });
  if (pg) await pg.stop().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown);

main().catch((e) => {
  console.error(`\n[bd] ERROR: ${e.message}\n`);
  process.exit(1);
});
