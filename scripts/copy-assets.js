/**
 * Copy static assets to dist/ that TypeScript doesn't handle.
 * Copies: HTML, CSS, and any other non-TS renderer files.
 */

const fs = require('fs');
const path = require('path');

function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) return;

    if (fs.statSync(src).isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src)) {
            // Skip .ts files — TypeScript handles those
            if (entry.endsWith('.ts')) continue;
            copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
    } else {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
    }
}

const root = path.join(__dirname, '..');

// Copy renderer static files (HTML, CSS)
copyRecursive(
    path.join(root, 'src', 'renderer'),
    path.join(root, 'dist', 'renderer')
);

console.log('  Static assets copied to dist/');
