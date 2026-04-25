// src/backend/services/optimizeHistoryService.js
'use strict';
const fs = require('fs');
const path = require('path');
const { getOptimizeConfig } = require('../config');

/**
 * Regex that valid plan filenames must satisfy.
 * Format: YYYY-MM-DD-auto-optimize.md
 */
const VALID_FILENAME_RE = /^\d{4}-\d{2}-\d{2}-auto-optimize\.md$/;

/**
 * Returns the plans directory path from config.
 * @returns {string}
 */
function getPlansDir() {
    return getOptimizeConfig().plansDir;
}

/**
 * Lists all auto-optimize plan files, sorted descending by filename.
 * @returns {Promise<Array<{filename: string, date: string, size_bytes: number}>>}
 */
async function listHistory() {
    const plansDir = getPlansDir();

    let entries;
    try {
        entries = await fs.promises.readdir(plansDir);
    } catch (err) {
        // Directory may not exist yet — return empty list
        if (err.code === 'ENOENT') return [];
        throw err;
    }

    const results = [];
    for (const filename of entries) {
        if (!VALID_FILENAME_RE.test(filename)) continue;

        let size_bytes = 0;
        try {
            const stat = await fs.promises.stat(path.join(plansDir, filename));
            size_bytes = stat.size;
        } catch (_) {
            // If stat fails, still include the entry with size 0
        }

        results.push({
            filename,
            date: filename.slice(0, 10),
            size_bytes,
        });
    }

    // Sort descending (newest first)
    results.sort((a, b) => b.filename.localeCompare(a.filename));
    return results;
}

/**
 * Reads the content of a single plan file.
 *
 * Returns null if the file does not exist.
 * Throws an error with code 'invalid_filename' if the filename fails validation.
 * Throws other errors for read failures.
 *
 * @param {string} filename
 * @returns {Promise<string | null>}
 */
async function readPlan(filename) {
    if (!filename || !VALID_FILENAME_RE.test(filename)) {
        const err = new Error('invalid_filename');
        err.code = 'invalid_filename';
        throw err;
    }

    const plansDir = getPlansDir();
    // Use path.join — never resolve user-supplied input directly
    const filepath = path.join(plansDir, filename);

    try {
        return await fs.promises.readFile(filepath, 'utf8');
    } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
}

module.exports = { getPlansDir, listHistory, readPlan };
