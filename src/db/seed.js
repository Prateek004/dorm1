'use strict';

const bcrypt         = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);

/**
 * Seeds only the super-admin user.
 * PG owners create their own accounts via /api/v1/auth/register.
 */
function autoSeedIfEmpty(db) {
  const count = db.prepare("SELECT COUNT(*) as n FROM users WHERE role = 'superadmin'").get();
  if (count.n > 0) return;

  const ADMIN_EMAIL    = process.env.SUPERADMIN_EMAIL    || 'admin@dormbook.in';
  const ADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'SuperAdmin@123!';
  const ADMIN_MOBILE   = process.env.SUPERADMIN_MOBILE   || '9999999999';
  const now            = new Date().toISOString();
  const adminId        = uuidv4();

  db.prepare(`
    INSERT INTO users (id, account_id, property_id, name, email, mobile, password_hash, role, is_active, created_at, updated_at)
    VALUES (?, NULL, NULL, 'Super Admin', ?, ?, ?, 'superadmin', 1, ?, ?)
  `).run(adminId, ADMIN_EMAIL, ADMIN_MOBILE, bcrypt.hashSync(ADMIN_PASSWORD, BCRYPT_ROUNDS), now, now);

  console.log('[SEED] ✅ Super-admin created');
  console.log(`[SEED]    Email   : ${ADMIN_EMAIL}`);
  console.log(`[SEED]    Password: ${ADMIN_PASSWORD}`);
}

module.exports = { autoSeedIfEmpty };
