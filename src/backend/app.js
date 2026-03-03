const express = require('express');
const path = require('path');
const apiRoutes = require('./routes/api');

const app = express();

// Middlewares
/* istanbul ignore next */
app.use(express.static(path.join(__dirname, '../frontend/public'), {
    setHeaders: (res, path) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
}));
app.use(express.json());

// Routes
app.use('/api', apiRoutes);

// Fallback route for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

module.exports = app;
