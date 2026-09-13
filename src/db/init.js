'use strict';

const path     = require('path');
const fs       = require('fs');
const Database = require('better-sqlite3');

// Railway volumes mount at /data by convention.
// Fallback: ./data relative to project root (local dev).
const DB_DIR  = process.env.DB_DIR  || '/data';
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, 'dormbook.db');

function initDb() {
  try {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  } catch (err) {
    // /data may not be writable without a volume — fall back to ./data
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

  // Performance tuning
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  return db;
}

module.exports = { initDb, DB_PATH };
