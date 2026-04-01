const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const apiRoutes = require('./routes/api');
const errorHandler = require('./middlewares/errorHandler');
const requestContext = require('./middlewares/requestContext');
const requestLogger = require('./middlewares/requestLogger');
const { securityHeaders } = require('./middlewares/securityHeaders');
const { apiLimiter } = require('./middlewares/rateLimiter');

const app = express();

const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');
const staticDir = path.join(__dirname, '../frontend/public');
const staticOpts = {
    setHeaders: (res) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
};

// Security headers (helmet)
app.use(securityHeaders);

// Rate limiting for all API routes
app.use('/api', apiLimiter);
if (BASE_PATH) app.use(BASE_PATH + '/api', apiLimiter);

// Middlewares
/* istanbul ignore next */
app.use(express.static(staticDir, staticOpts));
if (BASE_PATH) app.use(BASE_PATH, express.static(staticDir, staticOpts));
app.use(express.json({ limit: '1mb' })); // Prevent DoS via large payloads
app.use(cookieParser());
app.use(requestContext);
app.use(requestLogger);

// Routes
app.use('/api', apiRoutes);
if (BASE_PATH) app.use(BASE_PATH + '/api', apiRoutes);

// Fallback route for SPA
const indexFile = path.join(staticDir, 'index.html');
app.get('*', (req, res) => {
    res.sendFile(indexFile);
});

app.use(errorHandler);

module.exports = app;
