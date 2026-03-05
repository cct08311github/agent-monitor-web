#!/usr/bin/env node
// Usage: node scripts/hash-password.js <password>
// Outputs the bcrypt hash to copy into AUTH_PASSWORD_HASH in .env
'use strict';
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const password = process.argv[2];
if (!password) {
    console.error('Usage: node scripts/hash-password.js <password>');
    process.exit(1);
}

(async () => {
    const hash = await bcrypt.hash(password, 12);
    const secret = crypto.randomBytes(32).toString('hex');
    console.log('\n# Add these to your .env:\n');
    console.log(`AUTH_PASSWORD_HASH=${hash}`);
    console.log(`AUTH_SESSION_SECRET=${secret}`);
    console.log('');
})();
