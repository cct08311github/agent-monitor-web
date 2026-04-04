'use strict';

const sseClients = new Set();
const MAX_SSE_CLIENTS = 20;

function addClient(res) {
    if (sseClients.size >= MAX_SSE_CLIENTS) {
        return false;
    }
    sseClients.add(res);
    return true;
}

function removeClient(res) {
    sseClients.delete(res);
}

function broadcast(data) {
    if (sseClients.size === 0) return;
    const dataStr = `data: ${JSON.stringify(data)}\n\n`;
    sseClients.forEach((res) => {
        try { res.write(dataStr); } catch (e) { sseClients.delete(res); }
    });
}

function broadcastAlert(alerts) {
    if (sseClients.size === 0 || !alerts || alerts.length === 0) return;
    const alertStr = `event: alert\ndata: ${JSON.stringify({ alerts })}\n\n`;
    sseClients.forEach((client) => {
        try { client.write(alertStr); } catch (e) { sseClients.delete(client); }
    });
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
        sseClients.forEach((res) => {
            try { res.write(heartbeat); } catch (e) { sseClients.delete(res); }
        });
    }, HEARTBEAT_INTERVAL_MS);
    heartbeatTimer.unref();
}

function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
}

module.exports = { addClient, removeClient, broadcast, broadcastAlert, getClientCount, startHeartbeat, stopHeartbeat };
