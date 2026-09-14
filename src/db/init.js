'use strict';

const path     = require('path');
const fs       = require('fs');
const Database = require('better-sqlite3');

const DB_DIR  = process.env.DB_DIR  || '/data';
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, 'dormbook.db');

function initDb() {
  try {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  } catch (err) {
    const fallback = path.join(__dirname, '..', '..', 'data');
    console.warn(`[DB] Cannot write to ${DB_DIR} (${err.message}), falling back to ${fallback}`);
    if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
    return openDb(path.join(fallback, 'dormbook.db'));
  }
  return openDb(DB_PATH);
}

function openDb(dbPath) {
  console.log(`[DB] Opening database at: ${dbPath}`);
  const db     = new Database(dbPath);
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  runMigrations(db);
  return db;
}

function runMigrations(db) {
  const getColumns = (table) =>
    db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all().map(c => c.name);

  const bedCols = getColumns('beds');
  if (!bedCols.includes('base_rate_paise')) {
    db.exec("ALTER TABLE beds ADD COLUMN base_rate_paise INTEGER NOT NULL DEFAULT 0");
    console.log('[MIGRATION] Added beds.base_rate_paise');
  }
  console.log('[DB] Migrations complete');
}

module.exports = { initDb, DB_PATH };
