'use strict';

const fetch = require('node-fetch');
const logger = require('../utils/logger');

const MODEL_PRICING = {
    'gpt-5.3-codex': { input: 15, output: 60 },
    'gpt-5.2': { input: 10, output: 30 },
    'gpt-4.1': { input: 2, output: 8 },
    'gpt-4.1-mini': { input: 0.4, output: 1.6 },
    'gpt-4.1-nano': { input: 0.1, output: 0.4 },
    'o3': { input: 10, output: 40 },
    'o4-mini': { input: 1.1, output: 4.4 },
    'gemini-3-pro': { input: 1.25, output: 5 },
    'gemini-3-flash': { input: 0.15, output: 0.6 },
    'gemini-2.5-pro': { input: 1.25, output: 10 },
    'gemini-2.5-flash': { input: 0.15, output: 0.6 },
    'claude-sonnet-4': { input: 3, output: 15 },
    'claude-4-opus': { input: 15, output: 75 },
    'claude-3.5-haiku': { input: 0.8, output: 4 },
    'deepseek-chat': { input: 0.14, output: 0.28 },
    'deepseek-reasoner': { input: 0.55, output: 2.19 },
    'minimax-m2.5': { input: 1.2, output: 1.2 },
    default: { input: 1, output: 3 },
};

let exchangeRateCache = { rate: 32.0, lastFetch: 0 };

function getModelPricing(modelName) {
    if (!modelName) return MODEL_PRICING.default;
    const lower = modelName.toLowerCase();
    if (MODEL_PRICING[lower]) return MODEL_PRICING[lower];
    for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
        if (key !== 'default' && lower.includes(key)) return pricing;
    }
    return MODEL_PRICING.default;
}

function calculateCost(inputTokens, outputTokens, cacheRead, modelName) {
    const pricing = getModelPricing(modelName);
    const cacheDiscount = 0.1;
    const freshInputTokens = Math.max(0, inputTokens - (cacheRead || 0));
    const cachedTokens = cacheRead || 0;
    const inputCost = (freshInputTokens / 1_000_000) * pricing.input;
    const cacheCost = (cachedTokens / 1_000_000) * pricing.input * cacheDiscount;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    return inputCost + cacheCost + outputCost;
}

function isToday(ms) {
    const d = new Date(ms);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isThisWeek(ms) {
    const d = new Date(ms);
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const startOfWeek = new Date(now.setDate(diff));
    startOfWeek.setHours(0, 0, 0, 0);
    return d >= startOfWeek;
}

function isThisMonth(ms) {
    const d = new Date(ms);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

async function getExchangeRate() {
    const now = Date.now();
    if (now - exchangeRateCache.lastFetch < 24 * 60 * 60 * 1000) {
        return exchangeRateCache.rate;
    }
    try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await res.json();
        if (data && data.rates && data.rates.TWD) {
            exchangeRateCache = { rate: data.rates.TWD, lastFetch: now };
            return data.rates.TWD;
        }
    } catch (e) {
        logger.error('exchange_rate_fetch_failed', { msg: e.message });
    }
    return exchangeRateCache.rate;
}

module.exports = {
    MODEL_PRICING,
    getModelPricing,
    calculateCost,
    isToday,
    isThisWeek,
    isThisMonth,
    getExchangeRate,
};
