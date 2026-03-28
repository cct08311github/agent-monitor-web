'use strict';

const sseClients = new Set();

function addClient(res) {
    sseClients.add(res);
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

module.exports = { addClient, removeClient, broadcast, broadcastAlert, getClientCount };
