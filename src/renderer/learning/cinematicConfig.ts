/**
 * cinematicConfig.ts — Every tunable value in one place
 *
 * Ported from the proof-of-concept config.js into a typed TypeScript module.
 * The engine imports CFG and SYNTAX from here. Lesson files can override
 * SYNTAX per-lesson (Phase 3 of the platform plan).
 */

// ── Engine Configuration ──

export const CFG = {
    // Layout
    gutterW: 52,
    codePad: 14,
    spotLeftDefault: 50,
    spotPadSingle: 6,
    spotPadRange: 8,
    lineWidthExtra: 50,
    minLineWidth: 100,
    epPadding: 16,
    ecBorder: 1,

    // Timing (ms)
    charDelayBase: 22,
    charDelayJitter: 14,
    spaceDelay: 10,
    punctDelay: 30,
    lowConfMult: 1.4,
    lowConfThreshold: 0.8,
    interLinePause: 80,
    emptyLinePause: 40,
    thinkDotsLong: 800,
    thinkDotsShort: 500,
    thinkDotsThreshold: 0.75,
    sectionDividerPause: 600,
    blockGapPause: 300,
    autoAdvanceMs: 30000,
    eraseLinePause: 80,
    eraseSwipePause: 500,
    eraseRemovePause: 120,
    eraseSettlePause: 400,
    scrollResetMs: 3000,
    arrowScrollPause: 500,
    arrowSourcePause: 1000,
    arrowDualPause: 600,
    arrowFadeMs: 300,
    arrowHoldMs: 5000,
    explainEntryDelay: 500,
    tokenStepDelay: 200,
    tokenScrollDelay: 300,

    // Audio
    ksFreqBase: 700,
    ksFreqRange: 800,
    ksDur: 0.035,
    ksVol: 0.012,
    bksFreq: 480,
    bksDur: 0.18,
    bksVol: 0.025,
    lksFreqs: [420, 530, 640] as number[],
    lksDur: 0.12,
    lksVol: 0.018,
    lksStagger: 0.04,

    // Spotlight
    tokenPadPx: 8,
    arrowDotRadius: 5,
    expArrowDotRadius: 4,

    // Panels
    panelMinW: 280,
    panelMaxW: 480,
    panelGap: 20,
    panelCompactThresh: 340,
    panelMediumThresh: 420,
    miniExpMinW: 240,
    miniExpMaxW: 380,

    // Token explain
    tokShrinkMaxPasses: 5,
    tokCanvasMinH: 50,
    tokFontMin: 10,

    // Flash effect: token type → [CSS class to add, selector to find targets]
    flashMap: {
        fn: ['ct-ff', '.ct-sf'],
        ty: ['ct-ft', '.ct-st,.ct-se'],
        se: ['ct-ft', '.ct-st,.ct-se'],
        dir: ['ct-fk', '.ct-sd'],
    } as Record<string, string[]>,

    // Punctuation chars that get slower typing
    punctChars: '{}();,',
} as const;

// ── Syntax Highlighter Configuration ──

export interface SyntaxConfig {
    keywords: Set<string>;
    types: Set<string>;
    directives: string[];
    semantics: Set<string>;
    macroPrefixes: string[];
    lineComment: string;
    stringDelim: string;
    numberStart: RegExp;
    numberContinue: RegExp;
    classMap: Record<string, string>;
}

export const SYNTAX: SyntaxConfig = {
    keywords: new Set('void return if else for while struct const static true false nullptr TRUE FALSE'.split(' ')),
    types: new Set('int float double char bool HRESULT DWORD IDirect3D9 IDirect3DDevice9 IDirect3DVertexBuffer9 IDirect3DTexture9 D3DPRESENT_PARAMETERS float4 float2'.split(' ')),
    directives: ['#include', '#define'],
    semantics: new Set('POSITION TEXCOORD0 COLOR SV_POSITION'.split(' ')),
    macroPrefixes: ['D3D', 'SCREEN', 'E_'],
    lineComment: '//',
    stringDelim: '"',
    numberStart: /\d/,
    numberContinue: /[\d.xXfF]/,
    classMap: {
        keyword: 'ct-sk',
        type: 'ct-st',
        semantic: 'ct-se',
        function: 'ct-sf',
        directive: 'ct-sd',
        string: 'ct-ss',
        number: 'ct-sn',
        comment: 'ct-sc',
        macro: 'ct-sm',
    },
};
