/**
 * lessonLoader.ts — V2 Lesson Package Loader
 *
 * Loads directory-based .lesson packages into a unified LessonPackage
 * object that the cinematic engine consumes directly.
 *
 * The LessonPackage is the SINGLE SOURCE OF TRUTH.
 * The engine reads it and renders. No defaults, no fallbacks, no opinions.
 *
 * Package structure:
 *   my-lesson.lesson/
 *   ├── lesson.json        (manifest + all structured data)
 *   ├── thumbnail.png      (preview image)
 *   ├── assets/             (audio, images)
 *   └── visualizers/        (JS canvas rendering code)
 */

// ══════════════════════════════════════
//  V2 LESSON PACKAGE TYPES
// ══════════════════════════════════════

export interface LessonMeta {
    id: string;
    title: string;
    author: string;
    version: string;
    description: string;
    difficulty: string;
    duration: number;
    prerequisites: string[];
    tags: string[];
    thumbnail: string | null;
    language: string;
    created: string;
    updated: string;
}

export interface SyntaxDef {
    keywords: string[];
    types: string[];
    directives: string[];
    semantics: string[];
    macroPrefixes: string[];
    lineComment: string;
    stringDelim: string;
    colors: Record<string, string>;
}

export interface ErasePhase {
    lines: string[];
    timing: {
        lineAppearDelay: number;
        swipePause: number;
        removePause: number;
        settlePause: number;
    };
}

export interface BlockLine {
    text: string;
    confidence: number;
    type: string | null;
    blockEnd: boolean;
}

export interface LessonBlock {
    id: string;
    section: string | null;
    lines: BlockLine[];
    // Internal — set by engine during processing
    _start?: number;
    _end?: number;
}

export interface Explanation {
    label: string;
    type: string;
    description: string;
    narration: string | null;
}

export interface Connection {
    src: number[];
    dst: number[];
    label: string;
    description: string;
}

export interface TokenExplanation {
    text: string;
    description: string;
}

export interface TokenLine {
    line: number;
    tokens: TokenExplanation[];
}

export interface VisualizerDef {
    source: string;
    function: string;
    animated: boolean;
    controls: VisualizerControl[];
}

export interface VisualizerControl {
    key: string;
    label: string;
    type: 'checkbox' | 'range';
    min?: number;
    max?: number;
    default: number | boolean;
}

export interface TokenVisualizerDef {
    source: string;
    function: string;
}

export interface LayoutRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface BlockLayout {
    spotlight: LayoutRect;
    panel: LayoutRect;
}

export interface TokenLayoutEntry {
    spotlight: LayoutRect;
    panel: LayoutRect;
}

export interface ConnectionLayoutEntry {
    srcSpotlight: LayoutRect;
    dstSpotlight: LayoutRect;
}

export interface LayoutDef {
    canvas: { width: number; height: number };
    blocks: Record<string, BlockLayout>;
    tokens: Record<string, TokenLayoutEntry[]>;
    connections: Record<string, ConnectionLayoutEntry[]>;
}

export interface TimingDef {
    typing: {
        charDelayBase: number;
        charDelayJitter: number;
        spaceDelay: number;
        punctDelay: number;
        punctChars: string;
        lowConfidenceMultiplier: number;
        lowConfidenceThreshold: number;
    };
    pauses: {
        interLine: number;
        emptyLine: number;
        thinkDotsLong: number;
        thinkDotsShort: number;
        thinkDotsThreshold: number;
        sectionDivider: number;
        blockGap: number;
        autoAdvance: number;
    };
    animations: {
        scrollReset: number;
        arrowScrollPause: number;
        arrowSourcePause: number;
        arrowDualPause: number;
        arrowFade: number;
        arrowHold: number;
        explainEntry: number;
        tokenStep: number;
        tokenScroll: number;
    };
}

export interface AudioDef {
    keystroke: { frequency: number; duration: number; volume: number; pitchVariation: number };
    blockComplete: { frequency: number; duration: number; volume: number };
    linkChime: { frequencies: number[]; duration: number; volume: number; stagger: number };
}

export interface SpotlightStyle {
    borderColor: string;
    borderWidth: number;
    borderRadius: number;
    glowColor: string;
    glowSize: number;
}

export interface StyleDef {
    background: string;
    editorBackground: string;
    editorBorder: string;
    editorBorderRadius: number;
    gutterBackground: string;
    gutterTextColor: string;
    gutterWidth: number;
    codePadding: number;
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    spotlight: SpotlightStyle;
    vignette: { color: string; enabled: boolean };
    cursor: { color: string; glowColor: string; width: number; blinkSpeed: number };
    activeLine: { background: string; borderColor: string; borderWidth: number };
    sectionDivider: { textColor: string; lineGradientStart: string; lineGradientEnd: string };
    explanationPanel: {
        background: string; borderColor: string; borderRadius: number;
        shadowColor: string; backdropBlur: number;
        labelColors: Record<string, string>;
    };
    tokenHighlight: { background: string; glowColor: string; borderRadius: number; pulseAnimation: boolean };
    miniExplanation: { background: string; borderColor: string; borderRadius: number; backdropBlur: number };
    arrows: { strokeColor: string; strokeWidth: number; dotRadius: number; labelFont: string; labelSize: number; labelColor: string };
    progressBar: { trackColor: string; fillColor: string; height: number };
}

export interface Overlay {
    explanations: Record<string, Explanation>;
    connections: Record<string, Connection[]>;
    tokens: Record<string, TokenLine[]>;
    visualizers: Record<string, VisualizerDef>;
    tokenVisualizers: Record<string, TokenVisualizerDef>;
}

/** The complete, loaded lesson package — single source of truth for the engine. */
export interface LessonPackage {
    format: string;
    meta: LessonMeta;
    syntax: SyntaxDef;
    erasePhase: ErasePhase | null;
    blocks: LessonBlock[];
    overlay: Overlay;
    layout: LayoutDef | null;
    timing: TimingDef;
    audio: AudioDef;
    style: StyleDef;
    // Runtime: loaded visualizer functions
    _blockVisualizers: Record<string, (ctx: CanvasRenderingContext2D, w: number, h: number, vals?: Record<string, any>) => void>;
    _tokenVisualizers: Record<string, (ctx: CanvasRenderingContext2D, w: number, h: number) => void>;
    // Runtime: base path for resolving asset references
    _basePath: string;
}

// ══════════════════════════════════════
//  DEFAULTS (used ONLY for v1 → v2 conversion)
// ══════════════════════════════════════

export const DEFAULT_TIMING: TimingDef = {
    typing: { charDelayBase: 22, charDelayJitter: 14, spaceDelay: 10, punctDelay: 30, punctChars: '{}();,', lowConfidenceMultiplier: 1.4, lowConfidenceThreshold: 0.8 },
    pauses: { interLine: 80, emptyLine: 40, thinkDotsLong: 800, thinkDotsShort: 500, thinkDotsThreshold: 0.75, sectionDivider: 600, blockGap: 300, autoAdvance: 30000 },
    animations: { scrollReset: 3000, arrowScrollPause: 500, arrowSourcePause: 1000, arrowDualPause: 600, arrowFade: 300, arrowHold: 5000, explainEntry: 500, tokenStep: 200, tokenScroll: 300 },
};

export const DEFAULT_AUDIO: AudioDef = {
    keystroke: { frequency: 1100, duration: 0.035, volume: 0.012, pitchVariation: 0.6 },
    blockComplete: { frequency: 480, duration: 0.18, volume: 0.025 },
    linkChime: { frequencies: [420, 530, 640], duration: 0.12, volume: 0.018, stagger: 0.04 },
};

export const DEFAULT_STYLE: StyleDef = {
    background: '#0d0d0f', editorBackground: '#13131a', editorBorder: '#1e1e28', editorBorderRadius: 12,
    gutterBackground: '#0f0f14', gutterTextColor: '#555566', gutterWidth: 52, codePadding: 14,
    fontFamily: "'JetBrains Mono', monospace", fontSize: 13, lineHeight: 22,
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
};

export const DEFAULT_SYNTAX: SyntaxDef = {
    keywords: 'void return if else for while struct const static true false nullptr TRUE FALSE'.split(' '),
    types: 'int float double char bool HRESULT DWORD IDirect3D9 IDirect3DDevice9 IDirect3DVertexBuffer9 IDirect3DTexture9 D3DPRESENT_PARAMETERS float4 float2'.split(' '),
    directives: ['#include', '#define'],
    semantics: 'POSITION TEXCOORD0 COLOR SV_POSITION'.split(' '),
    macroPrefixes: ['D3D', 'SCREEN', 'E_'],
    lineComment: '//',
    stringDelim: '"',
    colors: {
        keyword: '#c678dd', type: '#61afef', function: '#56d4f5', directive: '#e06c75',
        string: '#98c379', number: '#d19a66', comment: '#5c6370', macro: '#e5c07b', semantic: '#e5c07b', text: '#c8c8d0',
    },
};

// ══════════════════════════════════════
//  LOADER
// ══════════════════════════════════════

/**
 * Load a v2 lesson package from a directory path.
 * Reads lesson.json, loads visualizer JS files, resolves asset paths.
 */
export async function loadFromDirectory(dirPath: string): Promise<LessonPackage> {
    const fs = require('fs');
    const path = require('path');

    const jsonPath = path.join(dirPath, 'lesson.json');
    if (!fs.existsSync(jsonPath)) {
        throw new Error('Invalid .lesson package: missing lesson.json');
    }

    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    return parseRawLesson(raw, dirPath);
}

/**
 * Load a v2 lesson from a raw JSON object (e.g. from cloud API or embedded data).
 */
export function loadFromJSON(data: any, basePath: string = ''): LessonPackage {
    return parseRawLesson(data, basePath);
}

/**
 * Convert a v1 lesson (old format) to a v2 LessonPackage.
 * This allows the engine to consume old lessons without changes.
 */
export function convertV1ToV2(v1: any, blockVis?: Record<string, any>, tokenVis?: Record<string, any>): LessonPackage {
    const blocks: LessonBlock[] = (v1.blocks || []).map((b: any) => ({
        id: b.id,
        section: b.sec || null,
        lines: (b.lines || []).map((l: any) => ({
            text: l.t || '',
            confidence: l.c ?? 1.0,
            type: l.tp || null,
            blockEnd: l.be || false,
        })),
    }));

    const overlay: Overlay = {
        explanations: {},
        connections: {},
        tokens: {},
        visualizers: {},
        tokenVisualizers: {},
    };

    // Convert explanations
    if (v1.explanations) {
        for (const [id, ex] of Object.entries(v1.explanations as Record<string, any>)) {
            overlay.explanations[id] = {
                label: ex.label || '',
                type: ex.tp || 'concept',
                description: ex.desc || '',
                narration: null,
            };
        }
    }

    // Convert connections
    if (v1.connections) {
        for (const [id, conns] of Object.entries(v1.connections as Record<string, any[]>)) {
            overlay.connections[id] = conns.map(c => ({
                src: c.src || [],
                dst: c.dst || [],
                label: c.label || '',
                description: c.desc || '',
            }));
        }
    }

    // Convert tokens
    if (v1.tokens) {
        for (const [id, tlines] of Object.entries(v1.tokens as Record<string, any[]>)) {
            overlay.tokens[id] = tlines.map(tl => ({
                line: tl.line,
                tokens: (tl.tokens || []).map((t: any) => ({
                    text: t.text,
                    description: t.desc || '',
                })),
            }));
        }
    }

    // Layout
    let layout: LayoutDef | null = null;
    if (v1.layout && v1.layout.blocks && Object.keys(v1.layout.blocks).length > 0) {
        layout = {
            canvas: v1.layout.canvas || { width: 900, height: 600 },
            blocks: v1.layout.blocks || {},
            tokens: v1.layout.tokens || {},
            connections: v1.layout.connections || {},
        };
    }

    const pkg: LessonPackage = {
        format: 'nexia-lesson-v2',
        meta: {
            id: v1.meta?.id || 'unknown',
            title: v1.meta?.title || 'Untitled',
            author: v1.meta?.author || 'Unknown',
            version: v1.meta?.version || '1.0.0',
            description: v1.meta?.description || '',
            difficulty: v1.meta?.difficulty || 'beginner',
            duration: v1.meta?.duration || 0,
            prerequisites: v1.meta?.prerequisites || [],
            tags: v1.meta?.tags || [],
            thumbnail: null,
            language: v1.meta?.language || 'cpp',
            created: v1.meta?.created || new Date().toISOString(),
            updated: v1.meta?.updated || new Date().toISOString(),
        },
        syntax: { ...DEFAULT_SYNTAX },
        erasePhase: v1.oldCode && v1.oldCode.length > 0 ? {
            lines: v1.oldCode,
            timing: { lineAppearDelay: 80, swipePause: 500, removePause: 120, settlePause: 400 },
        } : null,
        blocks,
        overlay,
        layout,
        timing: { ...DEFAULT_TIMING },
        audio: { ...DEFAULT_AUDIO },
        style: { ...DEFAULT_STYLE },
        _blockVisualizers: blockVis || {},
        _tokenVisualizers: tokenVis || {},
        _basePath: '',
    };

    return pkg;
}

// ── Internal ──

function parseRawLesson(raw: any, basePath: string): LessonPackage {
    const fs = require('fs');
    const path = require('path');

    // Determine format version
    const isV2 = raw.format === 'nexia-lesson-v2';

    if (!isV2) {
        // Treat as v1 and convert
        return convertV1ToV2(raw);
    }

    const blocks: LessonBlock[] = (raw.blocks || []).map((b: any) => ({
        id: b.id,
        section: b.section || null,
        lines: (b.lines || []).map((l: any) => ({
            text: l.text || '',
            confidence: l.confidence ?? 1.0,
            type: l.type || null,
            blockEnd: l.blockEnd || false,
        })),
    }));

    const overlay: Overlay = {
        explanations: raw.overlay?.explanations || {},
        connections: raw.overlay?.connections || {},
        tokens: raw.overlay?.tokens || {},
        visualizers: raw.overlay?.visualizers || {},
        tokenVisualizers: raw.overlay?.tokenVisualizers || {},
    };

    let layout: LayoutDef | null = null;
    if (raw.layout && raw.layout.blocks && Object.keys(raw.layout.blocks).length > 0) {
        layout = raw.layout;
    }

    // Load visualizer JS files
    const blockVis: Record<string, any> = {};
    const tokenVis: Record<string, any> = {};

    if (basePath) {
        for (const [blockId, vDef] of Object.entries(overlay.visualizers as Record<string, VisualizerDef>)) {
            try {
                const jsPath = path.join(basePath, vDef.source);
                if (fs.existsSync(jsPath)) {
                    const code = fs.readFileSync(jsPath, 'utf-8');
                    const mod: Record<string, any> = {};
                    const loader = new Function('exports', code);
                    loader(mod);
                    if (mod[vDef.function]) {
                        blockVis[blockId] = mod[vDef.function];
                    }
                }
            } catch (err) {
                console.warn(`Failed to load block visualizer for ${blockId}:`, err);
            }
        }

        for (const [tokenText, tDef] of Object.entries(overlay.tokenVisualizers as Record<string, TokenVisualizerDef>)) {
            try {
                const jsPath = path.join(basePath, tDef.source);
                if (fs.existsSync(jsPath)) {
                    const code = fs.readFileSync(jsPath, 'utf-8');
                    const mod: Record<string, any> = {};
                    const loader = new Function('exports', code);
                    loader(mod);
                    if (mod[tDef.function]) {
                        tokenVis[tokenText] = mod[tDef.function];
                    }
                }
            } catch (err) {
                console.warn(`Failed to load token visualizer for "${tokenText}":`, err);
            }
        }
    }

    return {
        format: 'nexia-lesson-v2',
        meta: {
            id: raw.meta?.id || 'unknown',
            title: raw.meta?.title || 'Untitled',
            author: raw.meta?.author || 'Unknown',
            version: raw.meta?.version || '1.0.0',
            description: raw.meta?.description || '',
            difficulty: raw.meta?.difficulty || 'beginner',
            duration: raw.meta?.duration || 0,
            prerequisites: raw.meta?.prerequisites || [],
            tags: raw.meta?.tags || [],
            thumbnail: raw.meta?.thumbnail || null,
            language: raw.meta?.language || 'cpp',
            created: raw.meta?.created || '',
            updated: raw.meta?.updated || '',
        },
        syntax: raw.syntax ? { ...DEFAULT_SYNTAX, ...raw.syntax } : { ...DEFAULT_SYNTAX },
        erasePhase: raw.erasePhase || null,
        blocks,
        overlay,
        layout,
        timing: deepMerge(DEFAULT_TIMING, raw.timing || {}),
        audio: deepMerge(DEFAULT_AUDIO, raw.audio || {}),
        style: deepMerge(DEFAULT_STYLE, raw.style || {}),
        _blockVisualizers: blockVis,
        _tokenVisualizers: tokenVis,
        _basePath: basePath,
    };
}

function deepMerge(target: any, source: any): any {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(target[key] || {}, source[key]);
        } else {
            result[key] = source[key];
        }
    }
    return result;
}

/**
 * Export a LessonPackage to v2 JSON format (for saving to disk).
 */
export function exportToJSON(pkg: LessonPackage): any {
    return {
        format: pkg.format,
        meta: pkg.meta,
        syntax: pkg.syntax,
        erasePhase: pkg.erasePhase,
        blocks: pkg.blocks.map(b => ({
            id: b.id,
            section: b.section,
            lines: b.lines.map(l => ({
                text: l.text,
                confidence: l.confidence,
                type: l.type,
                blockEnd: l.blockEnd,
            })),
        })),
        overlay: pkg.overlay,
        layout: pkg.layout,
        timing: pkg.timing,
        audio: pkg.audio,
        style: pkg.style,
    };
}
