'use strict';

require('dotenv').config();
const bcrypt         = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

function autoSeedIfEmpty(db) {
  const count = db.prepare('SELECT COUNT(*) as n FROM users').get();
  if (count.n > 0) return;

  const email    = process.env.SUPERADMIN_EMAIL    || 'superadmin@dormbook.in';
  const password = process.env.SUPERADMIN_PASSWORD || 'ChangeMe@Pilot1!';
  const mobile   = (process.env.SUPERADMIN_MOBILE  || '9999900000').replace(/\D/g, '');
  const name     = 'Super Admin';

  if (!process.env.SUPERADMIN_EMAIL) {
    console.warn('[SEED] SUPERADMIN_EMAIL not set — using default. Set env vars before production!');
  }

  const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const now  = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, account_id, property_id, name, email, mobile, password_hash, role, is_active, created_at, updated_at)
    VALUES (?, NULL, NULL, ?, ?, ?, ?, 'superadmin', 1, ?, ?)
  `).run(uuidv4(), name, email, mobile, hash, now, now);

  console.log('[SEED] ✅ Superadmin created');
  console.log(`[SEED]    Email   : ${email}`);
  console.log(`[SEED]    Mobile  : ${mobile}`);
  console.log(`[SEED]    Password: ${password}`);
}

module.exports = { autoSeedIfEmpty };

if (require.main === module) {
  const { initDb } = require('./init');
  const db = initDb();
  const count = db.prepare('SELECT COUNT(*) as n FROM users').get();
  if (count.n > 0 && process.env.FORCE !== 'true') {
    console.log('[SEED] Database already has users. Set FORCE=true to re-seed.');
    process.exit(0);
  }
  autoSeedIfEmpty(db);
  db.close();
}
