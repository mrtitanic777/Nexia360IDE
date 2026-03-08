/**
 * searchPanel.ts — Find in Files
 *
 * Extracted from app.ts during Phase 5 decomposition.
 * Project-wide text search with regex support.
 */

import { $, $$, escHtml, ctx, fn } from '../appContext';
const nodeFs = require('fs');
const nodePath = require('path');

let searchDebounceTimer: any = null;


const SEARCH_BINARY_EXT = new Set([
    '.exe', '.xex', '.dll', '.obj', '.o', '.pdb', '.lib', '.xbe',
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.dds', '.tga',
    '.wav', '.mp3', '.ogg', '.xma', '.wma',
    '.zip', '.rar', '.7z', '.cab',
    '.xbf', '.xuiobj',
]);

const SEARCH_MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const SEARCH_MAX_RESULTS = 5000;

interface SearchMatch {
    file: string;
    relPath: string;
    line: number;
    column: number;
    lineText: string;
    matchStart: number;
    matchEnd: number;
}

function getSearchableFiles(dir: string, includeGlobs: string[]): string[] {
    const files: string[] = [];
    const walk = (d: string) => {
        try {
            const entries = nodeFs.readdirSync(d, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = nodePath.join(d, entry.name);
                if (entry.isDirectory()) {
                    // Skip common non-source dirs
                    if (['node_modules', '.git', 'out', 'obj', 'Debug', 'Release', 'Profile', '.vs'].includes(entry.name)) continue;
                    walk(fullPath);
                } else if (entry.isFile()) {
                    const ext = nodePath.extname(entry.name).toLowerCase();
                    if (SEARCH_BINARY_EXT.has(ext)) continue;
                    try {
                        const stat = nodeFs.statSync(fullPath);
                        if (stat.size > SEARCH_MAX_FILE_SIZE) continue;
                    } catch { continue; }

                    // Apply include filter
                    if (includeGlobs.length > 0) {
                        const matchesInclude = includeGlobs.some(g => {
                            // Simple glob: *.cpp → endsWith .cpp
                            if (g.startsWith('*.')) return entry.name.endsWith(g.slice(1));
                            return entry.name === g || entry.name.includes(g);
                        });
                        if (!matchesInclude) continue;
                    }

                    files.push(fullPath);
                }
            }
        } catch {}
    };
    walk(dir);
    return files;
}

function searchInFiles(query: string, caseSensitive: boolean, useRegex: boolean, includeFilter: string): SearchMatch[] {
    if (!ctx.currentProject || !query) return [];

    const includeGlobs = includeFilter.split(',').map(s => s.trim()).filter(Boolean);
    const files = getSearchableFiles(ctx.currentProject.path, includeGlobs);
    const results: SearchMatch[] = [];

    let re: RegExp;
    try {
        const flags = caseSensitive ? 'g' : 'gi';
        re = useRegex ? new RegExp(query, flags) : new RegExp(escapeRegExp(query), flags);
    } catch {
        return []; // Invalid regex
    }

    for (const file of files) {
        if (results.length >= SEARCH_MAX_RESULTS) break;
        try {
            const content = nodeFs.readFileSync(file, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (results.length >= SEARCH_MAX_RESULTS) break;
                re.lastIndex = 0;
                let match: RegExpExecArray | null;
                while ((match = re.exec(lines[i])) !== null) {
                    results.push({
                        file,
                        relPath: nodePath.relative(ctx.currentProject.path, file),
                        line: i + 1,
                        column: match.index + 1,
                        lineText: lines[i],
                        matchStart: match.index,
                        matchEnd: match.index + match[0].length,
                    });
                    if (!re.global) break;
                    // Prevent infinite loop on zero-length matches
                    if (match[0].length === 0) re.lastIndex++;
                }
            }
        } catch {}
    }
    return results;
}

function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderSearchResults(results: SearchMatch[]) {
    const container = $('search-results');
    const summary = $('search-summary');
    container.innerHTML = '';

    if (results.length === 0) {
        const query = ($('search-query') as HTMLInputElement).value;
        if (query) {
            summary.textContent = 'No results found';
        } else {
            summary.textContent = '';
        }
        return;
    }

    // Group by file
    const groups = new Map<string, SearchMatch[]>();
    for (const r of results) {
        const arr = groups.get(r.file) || [];
        arr.push(r);
        groups.set(r.file, arr);
    }

    const fileCount = groups.size;
    const matchCount = results.length;
    summary.textContent = `${matchCount}${matchCount >= SEARCH_MAX_RESULTS ? '+' : ''} result${matchCount !== 1 ? 's' : ''} in ${fileCount} file${fileCount !== 1 ? 's' : ''}`;

    for (const [file, matches] of groups) {
        const group = document.createElement('div');
        group.className = 'search-file-group';

        const relPath = matches[0].relPath;
        const fileName = nodePath.basename(file);
        const dirPart = nodePath.dirname(relPath);

        // File header
        const header = document.createElement('div');
        header.className = 'search-file-header';
        header.innerHTML = `<span class="search-file-arrow">▼</span><span>📄 ${fileName}</span><span style="color:var(--text-dim);font-weight:normal;font-size:10px;margin-left:4px;">${dirPart !== '.' ? dirPart : ''}</span><span class="search-file-count">${matches.length}</span>`;

        const matchesContainer = document.createElement('div');
        matchesContainer.className = 'search-file-matches';

        header.addEventListener('click', () => {
            header.classList.toggle('collapsed');
            matchesContainer.style.display = header.classList.contains('collapsed') ? 'none' : 'block';
        });

        // Match lines
        for (const m of matches) {
            const line = document.createElement('div');
            line.className = 'search-match-line';

            const lineNum = document.createElement('span');
            lineNum.className = 'search-line-num';
            lineNum.textContent = String(m.line);

            const lineText = document.createElement('span');
            lineText.className = 'search-line-text';

            // Trim and highlight
            const text = m.lineText;
            const trimStart = Math.max(0, m.matchStart - 40);
            const trimEnd = Math.min(text.length, m.matchEnd + 80);
            const prefix = (trimStart > 0 ? '…' : '') + escapeHtml(text.slice(trimStart, m.matchStart));
            const matched = escapeHtml(text.slice(m.matchStart, m.matchEnd));
            const suffix = escapeHtml(text.slice(m.matchEnd, trimEnd)) + (trimEnd < text.length ? '…' : '');
            lineText.innerHTML = `${prefix}<span class="search-highlight">${matched}</span>${suffix}`;

            line.appendChild(lineNum);
            line.appendChild(lineText);
            line.addEventListener('click', () => {
                jumpToError({ file: m.file, line: m.line, column: m.column });
            });
            matchesContainer.appendChild(line);
        }

        group.appendChild(header);
        group.appendChild(matchesContainer);
        container.appendChild(group);
    }
}

export function triggerSearch() {
    const query = ($('search-query') as HTMLInputElement).value;
    const caseSensitive = ($('search-case') as HTMLInputElement).checked;
    const useRegex = ($('search-regex') as HTMLInputElement).checked;
    const include = ($('search-include') as HTMLInputElement).value;

    if (!query || !ctx.currentProject) {
        $('search-results').innerHTML = '';
        $('search-summary').textContent = '';
        return;
    }

    const results = searchInFiles(query, caseSensitive, useRegex, include);
    renderSearchResults(results);
}

// Debounced search on input
$('search-query').addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(triggerSearch, 300);
});

// Re-search when options change
$('search-case').addEventListener('change', triggerSearch);
$('search-regex').addEventListener('change', triggerSearch);
$('search-include').addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(triggerSearch, 400);
});

// Enter in search box triggers immediate search
$('search-query').addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
        clearTimeout(searchDebounceTimer);
        triggerSearch();
    }
    if (e.key === 'Escape') {
        ($('search-query') as HTMLInputElement).blur();
    }
});

// Toggle replace input
$('search-show-replace').addEventListener('change', () => {
    const show = ($('search-show-replace') as HTMLInputElement).checked;
    $('search-replace').classList.toggle('hidden', !show);
});

export function openFindInFiles() {
    // Show sidebar if hidden
    if (!sidebarVisible) toggleSidebar();
    // Switch to search tab
    const tab = document.querySelector('.sidebar-tab[data-panel="search"]') as HTMLElement;
    if (tab) tab.click();
    // Focus search input and select all text
    setTimeout(() => {
        const input = $('search-query') as HTMLInputElement;
        input.focus();
        input.select();
    }, 50);
}

// ══════════════════════════════════════
