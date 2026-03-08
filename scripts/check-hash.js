/**
 * check-hash.js — Check if a file has changed since last build
 * Usage: node check-hash.js <file> [file2] [file3] ...
 * 
 * Computes MD5 of all input files combined.
 * Compares against stored hash in dist/.build-cache/
 * Outputs "changed" or "same" to stdout.
 * Updates the stored hash if changed.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const files = process.argv.slice(2);
if (files.length === 0) { process.stdout.write('changed'); process.exit(0); }

const cacheDir = path.join(__dirname, '..', 'dist', '.build-cache');
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

// Build a cache key from filenames
const key = files.map(f => path.basename(f)).join('_').replace(/[^a-zA-Z0-9_.-]/g, '');
const hashFile = path.join(cacheDir, key + '.md5');

// Compute combined hash
const hasher = crypto.createHash('md5');
for (const f of files) {
    try { hasher.update(fs.readFileSync(f)); } catch { process.stdout.write('changed'); process.exit(0); }
}
const hash = hasher.digest('hex');

// Compare
try {
    const stored = fs.readFileSync(hashFile, 'utf8').trim();
    if (stored === hash) {
        process.stdout.write('same');
    } else {
        fs.writeFileSync(hashFile, hash);
        process.stdout.write('changed');
    }
} catch {
    fs.writeFileSync(hashFile, hash);
    process.stdout.write('changed');
}
