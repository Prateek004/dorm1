'use strict';

require('dotenv').config();
const bcrypt         = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);

function buildSeedData() {
  const OWNER_EMAIL    = process.env.SEED_OWNER_EMAIL    || 'owner@dormbook.in';
  const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD || 'ChangeMe@123!';
  const OWNER_MOBILE   = process.env.SEED_OWNER_MOBILE   || '9999900001';
  const OWNER_NAME     = process.env.SEED_OWNER_NAME     || 'Property Owner';
  const PROPERTY_NAME  = process.env.SEED_PROPERTY_NAME  || 'Sunrise PG';
  const PROPERTY_CODE  = process.env.SEED_PROPERTY_CODE  || 'SUNR';
  const propertyId = uuidv4(); const ownerId = uuidv4();
  const floorId = uuidv4(); const room1Id = uuidv4(); const room2Id = uuidv4();
  const now = new Date().toISOString();
  return { OWNER_EMAIL, OWNER_PASSWORD, OWNER_MOBILE, OWNER_NAME, PROPERTY_NAME, PROPERTY_CODE, propertyId, ownerId, floorId, room1Id, room2Id, now };
}

function runSeed(db, data) {
  const { OWNER_EMAIL, OWNER_PASSWORD, OWNER_MOBILE, OWNER_NAME, PROPERTY_NAME, PROPERTY_CODE, propertyId, ownerId, floorId, room1Id, room2Id, now } = data;
  const passwordHash = bcrypt.hashSync(OWNER_PASSWORD, BCRYPT_ROUNDS);
  db.transaction(() => {
    db.prepare(`INSERT INTO properties (id,name,address,city,state,pincode,owner_id,whatsapp_number,property_code,refund_approval_threshold_paise,cleaning_timeout_minutes,booking_lock_hours,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,50000,120,24,?,?)`).run(propertyId, PROPERTY_NAME, '12 MG Road', 'Bengaluru', 'Karnataka', '560001', ownerId, `91${OWNER_MOBILE}`, PROPERTY_CODE, now, now);
    db.prepare(`INSERT INTO users (id,property_id,name,email,mobile,password_hash,role,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,'owner',1,?,?)`).run(ownerId, propertyId, OWNER_NAME, OWNER_EMAIL, OWNER_MOBILE, passwordHash, now, now);
    db.prepare(`INSERT INTO floors (id,property_id,floor_number,label,created_at) VALUES (?,?,1,'Ground Floor',?)`).run(floorId, propertyId, now);
    db.prepare(`INSERT INTO rooms (id,floor_id,property_id,room_number,room_type,created_at) VALUES (?,?,?,'101','shared',?)`).run(room1Id, floorId, propertyId, now);
    db.prepare(`INSERT INTO rooms (id,floor_id,property_id,room_number,room_type,created_at) VALUES (?,?,?,'102','private',?)`).run(room2Id, floorId, propertyId, now);
    ['A', 'B', 'C'].forEach(l => {
      db.prepare(`INSERT INTO beds (id,room_id,property_id,bed_label,status,created_at,updated_at) VALUES (?,?,?,?,'available',?,?)`).run(uuidv4(), room1Id, propertyId, `101-${l}`, now, now);
    });
    db.prepare(`INSERT INTO beds (id,room_id,property_id,bed_label,status,created_at,updated_at) VALUES (?,?,?,?,'available',?,?)`).run(uuidv4(), room2Id, propertyId, '102-A', now, now);
    [
      { name: 'Heater (Seasonal)', category: 'utilities', price: 50000, assignable: 1 },
      { name: 'Extra Key Deposit', category: 'deposit', price: 20000, assignable: 1 },
      { name: 'Late Checkout Fee', category: 'penalties', price: 25000, assignable: 0 },
      { name: 'Laundry (Monthly)', category: 'amenities', price: 15000, assignable: 0 },
    ].forEach(item => {
      db.prepare(`INSERT INTO addon_catalog (id,property_id,name,category,default_price_paise,is_assignable,is_active,created_at) VALUES (?,?,?,?,?,?,1,?)`).run(uuidv4(), propertyId, item.name, item.category, item.price, item.assignable, now);
    });
  })();
}

function autoSeedIfEmpty(db) {
  const count = db.prepare('SELECT COUNT(*) as n FROM users').get();
  if (count.n > 0) return;
  console.log('[SEED] Empty database detected — running auto-seed...');
  const data = buildSeedData();
  runSeed(db, data);
  console.log(`[SEED] ✅ Auto-seed complete`);
  console.log(`[SEED]    Email   : ${data.OWNER_EMAIL}`);
  console.log(`[SEED]    Password: ${data.OWNER_PASSWORD}`);
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
  const data = buildSeedData();
  runSeed(db, data);
  console.log('\n[SEED] Done!');
  db.close();
}
