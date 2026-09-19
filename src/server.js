'use strict';

const path    = require('path');
const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const morgan  = require('morgan');

const { initDb, DB_PATH } = require('./db/init');
const { setDb }           = require('./db/connection');
const routes              = require('./routes');
const { startScheduler }  = require('./services/scheduler');

const app  = express();
const PORT = process.env.PORT || 8080;
const ENV  = process.env.NODE_ENV || 'development';

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:    ["'self'"],
      scriptSrc:     ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:      ["'self'", "'unsafe-inline'"],
      imgSrc:        ["'self'", 'data:', 'blob:'],
      connectSrc:    ["'self'"],
    },
  },
}));

// ── General middleware ────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan(ENV === 'production' ? 'combined' : 'dev'));

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/v1', routes);

// ── SPA catch-all ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.message, err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
  try {
    const db = initDb();
    setDb(db);
    startScheduler();
    app.listen(PORT, () => {
      console.log(`[SERVER] DormBook v3.0 on port ${PORT} (${ENV})`);
      console.log(`[SERVER] DB: ${DB_PATH}`);
    });
  } catch (err) {
    console.error('[BOOT ERROR]', err.message);
    process.exit(1);
  }
})();
