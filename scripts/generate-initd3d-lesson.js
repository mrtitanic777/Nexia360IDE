/**
 * generate-initd3d-lesson.js
 * 
 * Run with: node scripts/generate-initd3d-lesson.js
 * 
 * Extracts the built-in InitD3D lesson from the TypeScript source files
 * and generates a v2 .lesson directory package.
 */

const fs = require('fs');
const path = require('path');

// We can't import TS directly, so we'll parse the data from the compiled JS
// or just build it manually from the source. Let's build it manually.

const outDir = path.join(__dirname, '..', 'initd3d.lesson');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'visualizers'), { recursive: true });

// ── Read the TS source and extract data ──
const dataFile = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/learning/cinematicLessonData.ts'), 'utf-8');
const visFile = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/learning/cinematicVisualizers.ts'), 'utf-8');

// Parse LESSON_OLD
const oldMatch = dataFile.match(/export const LESSON_OLD: string\[\] = \[([\s\S]*?)\];/);
const oldCode = oldMatch ? eval('[' + oldMatch[1] + ']') : [];

// Parse LESSON_BLOCKS — this is complex TS, we'll eval it
// First strip types
let blocksStr = dataFile.match(/export const LESSON_BLOCKS: LessonBlock\[\] = (\[[\s\S]*?\]);[\s]*\n\nexport/);
if (!blocksStr) {
    // Try alternate pattern
    blocksStr = dataFile.match(/export const LESSON_BLOCKS[^=]*= (\[[\s\S]*?\]);\s*\n\s*export/);
}

let blocks = [];
if (blocksStr) {
    try {
        blocks = eval(blocksStr[1]);
    } catch(e) {
        console.error('Failed to parse blocks:', e.message);
        // Fallback: extract manually
    }
}

// Parse LESSON_EXPL
const explMatch = dataFile.match(/export const LESSON_EXPL[^=]*= (\{[\s\S]*?\});[\s]*\n\nexport/);
let explanations = {};
if (explMatch) {
    try { explanations = eval('(' + explMatch[1] + ')'); } catch(e) { console.error('Failed to parse explanations:', e.message); }
}

// Parse LESSON_CONNECTIONS
const connMatch = dataFile.match(/export const LESSON_CONNECTIONS[^=]*= (\{[\s\S]*?\});[\s]*\n\nexport/);
let connections = {};
if (connMatch) {
    try { connections = eval('(' + connMatch[1] + ')'); } catch(e) { console.error('Failed to parse connections:', e.message); }
}

// Parse LESSON_VIS_CTRLS
const visCtrlMatch = dataFile.match(/export const LESSON_VIS_CTRLS[^=]*= (\{[\s\S]*?\});[\s]*\n\nexport/);
let visControls = {};
if (visCtrlMatch) {
    try { visControls = eval('(' + visCtrlMatch[1] + ')'); } catch(e) { console.error('Failed to parse visControls:', e.message); }
}

// Parse ANIMATED_VIS
const animMatch = dataFile.match(/export const ANIMATED_VIS = new Set\(\[(.*?)\]\)/);
let animatedVis = [];
if (animMatch) {
    try { animatedVis = eval('[' + animMatch[1] + ']'); } catch(e) {}
}

// Parse LESSON_TOKENS
const tokMatch = dataFile.match(/export const LESSON_TOKENS[^=]*= (\{[\s\S]*?\});[\s]*$/m);
let tokens = {};
if (tokMatch) {
    try { tokens = eval('(' + tokMatch[1] + ')'); } catch(e) { console.error('Failed to parse tokens:', e.message); }
}

// ── Convert blocks to v2 format ──
const v2Blocks = blocks.map(b => ({
    id: b.id,
    section: b.sec || null,
    lines: (b.lines || []).map(l => ({
        text: l.t || '',
        confidence: l.c ?? 1.0,
        type: l.tp || null,
        blockEnd: l.be || false,
    })),
}));

// ── Convert overlay ──
const v2Explanations = {};
for (const [id, ex] of Object.entries(explanations)) {
    v2Explanations[id] = {
        label: ex.label,
        type: ex.tp,
        description: ex.desc,
        narration: null,
    };
}

const v2Connections = {};
for (const [id, conns] of Object.entries(connections)) {
    v2Connections[id] = conns.map(c => ({
        src: c.src,
        dst: c.dst,
        label: c.label,
        description: c.desc || '',
    }));
}

const v2Tokens = {};
for (const [id, tlines] of Object.entries(tokens)) {
    v2Tokens[id] = tlines.map(tl => ({
        line: tl.line,
        tokens: tl.tokens.map(t => ({
            text: t.text,
            description: t.desc,
        })),
    }));
}

// Build visualizer refs
const v2Visualizers = {};
for (const blockId of Object.keys(explanations)) {
    // Check if this block has a visualizer in the vis file
    if (visFile.includes(`${blockId}(c,`) || visFile.includes(`${blockId}(c ,`) || visFile.includes(`    ${blockId}(`)) {
        v2Visualizers[blockId] = {
            source: 'visualizers/blocks.js',
            function: blockId,
            animated: animatedVis.includes(blockId),
            controls: (visControls[blockId] || []).map(c => ({
                key: c.key,
                label: c.label,
                type: c.type || 'range',
                min: c.min,
                max: c.max,
                default: c.val,
            })),
        };
    }
}

const v2TokenVisualizers = {};
// Extract token visualizer function names from the vis file
const tokVisMatch = visFile.match(/export const LESSON_TOK_VIS[^{]*\{([\s\S]*)\};[\s]*$/);
if (tokVisMatch) {
    // Find all function names like 'ZeroMemory'(c, w, h) or 'D3DFMT_A8R8G8B8'(c, w, h)
    const fnPattern = /'([^']+)'\s*\(/g;
    let m;
    while ((m = fnPattern.exec(tokVisMatch[1])) !== null) {
        v2TokenVisualizers[m[1]] = {
            source: 'visualizers/tokens.js',
            function: m[1].replace(/[^a-zA-Z0-9_]/g, '_'),
        };
    }
}

// ── Build lesson.json ──
const lesson = {
    format: 'nexia-lesson-v2',
    meta: {
        id: 'initd3d',
        title: 'Xbox 360 Direct3D Initialization',
        author: 'Nexia IDE',
        version: '1.0.0',
        description: 'Learn how to initialize Direct3D on the Xbox 360 — from creating the D3D interface to getting a GPU device handle.',
        difficulty: 'beginner',
        duration: 8,
        prerequisites: [],
        tags: ['xbox360', 'd3d', 'graphics', 'xenos'],
        thumbnail: null,
        language: 'cpp',
        created: '2025-03-05T00:00:00Z',
        updated: '2025-03-05T00:00:00Z',
    },
    syntax: {
        keywords: 'void return if else for while struct const static true false nullptr TRUE FALSE'.split(' '),
        types: 'int float double char bool HRESULT DWORD IDirect3D9 IDirect3DDevice9 IDirect3DVertexBuffer9 IDirect3DTexture9 D3DPRESENT_PARAMETERS float4 float2'.split(' '),
        directives: ['#include', '#define'],
        semantics: 'POSITION TEXCOORD0 COLOR SV_POSITION'.split(' '),
        macroPrefixes: ['D3D', 'SCREEN', 'E_'],
        lineComment: '//',
        stringDelim: '"',
        colors: {
            keyword: '#c678dd',
            type: '#61afef',
            function: '#56d4f5',
            directive: '#e06c75',
            string: '#98c379',
            number: '#d19a66',
            comment: '#5c6370',
            macro: '#e5c07b',
            semantic: '#e5c07b',
            text: '#c8c8d0',
        },
    },
    erasePhase: oldCode.length > 0 ? {
        lines: oldCode,
        timing: {
            lineAppearDelay: 80,
            swipePause: 500,
            removePause: 120,
            settlePause: 400,
        },
    } : null,
    blocks: v2Blocks,
    overlay: {
        explanations: v2Explanations,
        connections: v2Connections,
        tokens: v2Tokens,
        visualizers: v2Visualizers,
        tokenVisualizers: v2TokenVisualizers,
    },
    layout: null,
    timing: {
        typing: { charDelayBase: 22, charDelayJitter: 14, spaceDelay: 10, punctDelay: 30, punctChars: '{}();,', lowConfidenceMultiplier: 1.4, lowConfidenceThreshold: 0.8 },
        pauses: { interLine: 80, emptyLine: 40, thinkDotsLong: 800, thinkDotsShort: 500, thinkDotsThreshold: 0.75, sectionDivider: 600, blockGap: 300, autoAdvance: 30000 },
        animations: { scrollReset: 3000, arrowScrollPause: 500, arrowSourcePause: 1000, arrowDualPause: 600, arrowFade: 300, arrowHold: 5000, explainEntry: 500, tokenStep: 200, tokenScroll: 300 },
    },
    audio: {
        keystroke: { frequency: 1100, duration: 0.035, volume: 0.012, pitchVariation: 0.6 },
        blockComplete: { frequency: 480, duration: 0.18, volume: 0.025 },
        linkChime: { frequencies: [420, 530, 640], duration: 0.12, volume: 0.018, stagger: 0.04 },
    },
    style: {
        background: '#0d0d0f',
        editorBackground: '#13131a',
        editorBorder: '#1e1e28',
        editorBorderRadius: 12,
        gutterBackground: '#0f0f14',
        gutterTextColor: '#555566',
        gutterWidth: 52,
        codePadding: 14,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 13,
        lineHeight: 22,
        spotlight: { borderColor: '#4ec9b0', borderWidth: 2, borderRadius: 10, glowColor: 'rgba(78,201,176,0.3)', glowSize: 16 },
        vignette: { color: 'rgba(0,0,0,0.78)', enabled: true },
        cursor: { color: '#6fffe9', glowColor: '#4ec9b0', width: 2, blinkSpeed: 0.7 },
        activeLine: { background: 'rgba(97,175,239,0.12)', borderColor: '#61afef', borderWidth: 3 },
        sectionDivider: { textColor: '#4ec9b0', lineGradientStart: '#4ec9b0', lineGradientEnd: 'transparent' },
        explanationPanel: {
            background: 'rgba(10,10,16,0.94)', borderColor: 'rgba(78,201,176,0.15)', borderRadius: 18,
            shadowColor: 'rgba(0,0,0,0.7)', backdropBlur: 20,
            labelColors: { concept: '#5c6370', api: '#56d4f5', pattern: '#61afef', warn: '#e06c75', var: '#e5c07b' },
        },
        tokenHighlight: { background: 'rgba(86,212,245,0.25)', glowColor: 'rgba(86,212,245,0.3)', borderRadius: 3, pulseAnimation: true },
        miniExplanation: { background: 'rgba(10,10,16,0.95)', borderColor: 'rgba(86,212,245,0.2)', borderRadius: 12, backdropBlur: 16 },
        arrows: { strokeColor: 'rgba(255,255,255,0.75)', strokeWidth: 2.5, dotRadius: 5, labelFont: "'Outfit', sans-serif", labelSize: 11, labelColor: 'rgba(255,255,255,0.9)' },
        progressBar: { trackColor: '#1e1e28', fillColor: '#4ec9b0', height: 3 },
    },
};

fs.writeFileSync(path.join(outDir, 'lesson.json'), JSON.stringify(lesson, null, 2));
console.log('Generated lesson.json with:');
console.log('  Blocks:', v2Blocks.length);
console.log('  Explanations:', Object.keys(v2Explanations).length);
console.log('  Connections:', Object.keys(v2Connections).length);
console.log('  Tokens:', Object.keys(v2Tokens).length);
console.log('  Block Visualizers:', Object.keys(v2Visualizers).length);
console.log('  Token Visualizers:', Object.keys(v2TokenVisualizers).length);
console.log('  Old Code Lines:', oldCode.length);
console.log('Output:', outDir);
