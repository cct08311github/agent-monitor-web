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

// Trust one proxy hop (Tailscale serve / Nginx) so req.ip reflects the real client
app.set('trust proxy', 1);

const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');

const staticDir = path.join(__dirname, '../../dist');

const staticOpts = {
    setHeaders: (res) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
};

// Security headers (helmet)
app.use(securityHeaders);

// Core sub-app: static files, body parsing, middleware, API routes
const core = express.Router();
core.use('/api', apiLimiter);
/* istanbul ignore next */
core.use(express.static(staticDir, staticOpts));
core.use(express.json({ limit: '1mb' })); // Prevent DoS via large payloads
core.use(cookieParser());
core.use(requestContext);
core.use(requestLogger);
core.use('/api', apiRoutes);

// Mount at root and optionally at BASE_PATH
app.use('/', core);
if (BASE_PATH) app.use(BASE_PATH, core);

// Fallback route for SPA
const indexFile = path.join(staticDir, 'index.html');
app.get('*', (req, res) => {
    res.sendFile(indexFile);
});

app.use(errorHandler);

module.exports = app;
