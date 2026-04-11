'use strict';

const sseClients = new Map(); // res → ip (or null)
const MAX_SSE_CLIENTS = 20;
const MAX_SSE_PER_IP = 5;
const clientIpCount = new Map(); // ip → count

function _decrementIp(ip) {
    if (!ip) return;
    const current = clientIpCount.get(ip) || 0;
    if (current <= 1) {
        clientIpCount.delete(ip);
    } else {
        clientIpCount.set(ip, current - 1);
    }
}

function _evictFailed(failed) {
    for (const res of failed) {
        const ip = sseClients.get(res);
        sseClients.delete(res);
        _decrementIp(ip);
    }
}

function addClient(res, ip) {
    if (sseClients.size >= MAX_SSE_CLIENTS) {
        return false;
    }
    // Per-IP limit to prevent a single client from exhausting all slots
    if (ip) {
        const current = clientIpCount.get(ip) || 0;
        if (current >= MAX_SSE_PER_IP) {
            return false;
        }
        clientIpCount.set(ip, current + 1);
    }
    sseClients.set(res, ip || null);
    return true;
}

function removeClient(res) {
    const ip = sseClients.get(res);
    sseClients.delete(res);
    _decrementIp(ip);
}

function broadcast(data) {
    if (sseClients.size === 0) return;
    const dataStr = `data: ${JSON.stringify(data)}\n\n`;
    const failed = [];
    sseClients.forEach((_ip, res) => {
        try { res.write(dataStr); } catch (e) { failed.push(res); }
    });
    _evictFailed(failed);
}

function broadcastAlert(alerts) {
    if (sseClients.size === 0 || !alerts || alerts.length === 0) return;
    const alertStr = `event: alert\ndata: ${JSON.stringify({ alerts })}\n\n`;
    const failed = [];
    sseClients.forEach((_ip, client) => {
        try { client.write(alertStr); } catch (e) { failed.push(client); }
    });
    _evictFailed(failed);
}

function getClientCount() {
    return sseClients.size;
}

// Heartbeat: send comment every 20s to keep connections alive and let clients detect stale connections
const HEARTBEAT_INTERVAL_MS = 20_000;
let heartbeatTimer = null;

function startHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(() => {
        if (sseClients.size === 0) return;
        const heartbeat = `: heartbeat ${Date.now()}\n\n`;
        const failed = [];
        sseClients.forEach((_ip, res) => {
            try { res.write(heartbeat); } catch (e) { failed.push(res); }
        });
        _evictFailed(failed);
    }, HEARTBEAT_INTERVAL_MS);
    heartbeatTimer.unref();
}

function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
}

/**
 * Gracefully close all SSE connections.
 * Sends a server-shutdown event so clients can show a maintenance notice
 * instead of treating the TCP reset as an unexpected disconnect.
 */
function closeAll() {
    stopHeartbeat();
    const shutdownEvent = `event: server-shutdown\ndata: ${JSON.stringify({ reason: 'server_restart' })}\n\n`;
    sseClients.forEach((_ip, res) => {
        try {
            res.write(shutdownEvent);
            res.end();
        } catch (_) { /* already gone */ }
    });
    sseClients.clear();
    clientIpCount.clear();
}

module.exports = { addClient, removeClient, broadcast, broadcastAlert, getClientCount, startHeartbeat, stopHeartbeat, closeAll };
