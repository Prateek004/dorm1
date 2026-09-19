'use strict';

const path    = require('path');
const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const morgan  = require('morgan');

const { setDb } = require('./db/connection');
const { initDb: openDb } = require('./db/init');
const { autoSeedIfEmpty } = require('./db/seed');
const routes        = require('./routes');
const { startScheduler } = require('./services/scheduler');

const app  = express();
const PORT = process.env.PORT || 8080;
const ENV  = process.env.NODE_ENV || 'development';

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

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan(ENV === 'production' ? 'combined' : 'dev'));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api/v1', routes);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.message, err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

(async () => {
  try {
    const db = openDb();
    setDb(db);
    autoSeedIfEmpty(db);
    startScheduler();
    app.listen(PORT, () => {
      console.log(`[SERVER] DormBook v4.0 on port ${PORT} (${ENV})`);
    });
  } catch (err) {
    console.error('[BOOT ERROR]', err.message, err.stack);
    process.exit(1);
  }
})();
