/**
 * cinematicLessonData.ts — Content for the Xbox 360 InitD3D lesson
 *
 * Ported from the proof-of-concept lesson-data.js into typed TypeScript.
 * This is the first cinematic lesson — a complete walkthrough of Direct3D
 * initialization on Xbox 360.
 *
 * The engine consumes these exports directly. Future lessons will follow
 * the same shape (Phase 3 unified lesson schema).
 */

// ── Types ──

export interface LessonLine {
    /** The text content of this line. Empty string = blank line. */
    t: string;
    /** Typing confidence 0–1. Low values trigger thinking dots. */
    c?: number;
    /** Token type hint for flash effects: 'fn', 'ty', 'se', 'dir', 'vr'. */
    tp?: string;
    /** Block-end flag — triggers block-complete sound. */
    be?: boolean;
}

export interface LessonBlock {
    /** Unique block identifier. */
    id: string;
    /** Section header text (shown as a divider above the block). */
    sec?: string;
    /** The lines of code in this block. */
    lines: LessonLine[];
    /** Internal: start index in the flat LINES array (set by processLesson). */
    _start?: number;
    /** Internal: end index in the flat LINES array (set by processLesson). */
    _end?: number;
}

export interface LessonExplanation {
    /** Display label for the explanation panel. */
    label: string;
    /** Type class for color coding: 'cm', 'fn', 'ty', 'vr', 'dir'. */
    tp: string;
    /** HTML description text. */
    desc: string;
}

export interface LessonConnection {
    /** Source line indices (0-based into flat LINES array). */
    src: number[];
    /** Destination line indices. */
    dst: number[];
    /** Arrow label text. */
    label: string;
    /** Popup description text. */
    desc?: string;
}

export interface TokenExplanation {
    /** The exact text of the token to highlight. */
    text: string;
    /** Plain-English description. */
    desc: string;
}

export interface TokenLine {
    /** Line offset within the block (0-based). */
    line: number;
    /** Tokens on this line. */
    tokens: TokenExplanation[];
}

export interface VisControl {
    /** Data key for the visualizer vals object. */
    key: string;
    /** Display label. */
    label: string;
    /** Control type. Defaults to 'range' if omitted. */
    type?: 'checkbox' | 'range';
    /** Min value (range only). */
    min?: number;
    /** Max value (range only). */
    max?: number;
    /** Default value. */
    val: number | boolean;
}

// ── Old Code (shown during erase phase) ──

export const LESSON_OLD: string[] = [
    '// TODO: Initialize Direct3D',
    '// placeholder — not implemented',
    'void InitD3D() {',
    '    // ...',
    '}',
];

// ── Code Blocks ──

export const LESSON_BLOCKS: LessonBlock[] = [
    {
        id: 'comment', sec: 'Documentation',
        lines: [
            { t: '/**' },
            { t: ' * Xbox 360 Minecraft Spinning Block Demo' },
            { t: ' * Direct3D init with vertex/pixel shaders' },
            { t: ' */' },
        ],
    },
    {
        id: 'preproc', sec: 'Includes & Defines',
        lines: [
            { t: '#include "stdafx.h"', tp: 'dir' },
            { t: '' },
            { t: '#define SCREEN_W  1280', tp: 'dir' },
            { t: '#define SCREEN_H  720', tp: 'dir' },
        ],
    },
    {
        id: 'globals', sec: 'Global Objects',
        lines: [
            { t: '' },
            { t: '// ── Global D3D objects ──' },
            { t: 'IDirect3D9*             g_pD3D     = nullptr;', c: 0.95, tp: 'vr' },
            { t: 'IDirect3DDevice9*       g_pDevice  = nullptr;', c: 0.95, tp: 'vr' },
            { t: 'IDirect3DVertexBuffer9* g_pVB      = nullptr;', c: 0.95, tp: 'vr' },
            { t: 'IDirect3DTexture9*      g_pTexture = nullptr;', c: 0.95, tp: 'vr' },
        ],
    },
    {
        id: 'vertex', sec: 'Vertex Format',
        lines: [
            { t: '' },
            { t: '// ── Vertex format ──' },
            { t: 'struct Vertex {', tp: 'ty' },
            { t: '    float4   pos   : POSITION;', c: 0.8, tp: 'se' },
            { t: '    float2   uv    : TEXCOORD0;', c: 0.8, tp: 'se' },
            { t: '};', be: true },
        ],
    },
    {
        id: 'fn_open',
        lines: [
            { t: '' },
            { t: 'HRESULT InitD3D(void)', c: 0.7, tp: 'fn' },
            { t: '{' },
        ],
    },
    {
        id: 'create9',
        lines: [
            { t: '    g_pD3D = Direct3DCreate9(D3D_SDK_VERSION);', c: 0.8, tp: 'fn' },
            { t: '    if (!g_pD3D) return E_FAIL;', c: 0.9 },
        ],
    },
    {
        id: 'pp', sec: 'Presentation Config',
        lines: [
            { t: '' },
            { t: '    D3DPRESENT_PARAMETERS pp;', tp: 'ty' },
            { t: '    ZeroMemory(&pp, sizeof(pp));', tp: 'fn' },
            { t: '    pp.BackBufferWidth        = SCREEN_W;', c: 0.9 },
            { t: '    pp.BackBufferHeight       = SCREEN_H;', c: 0.9 },
            { t: '    pp.BackBufferFormat       = D3DFMT_A8R8G8B8;', c: 0.85, tp: 'ty' },
            { t: '    pp.EnableAutoDepthStencil = TRUE;' },
            { t: '    pp.AutoDepthStencilFormat = D3DFMT_D24S8;', c: 0.85 },
            { t: '    pp.SwapEffect             = D3DSWAPEFFECT_DISCARD;' },
            { t: '    pp.PresentationInterval   = D3DPRESENT_INTERVAL_ONE;' },
        ],
    },
    {
        id: 'createdev', sec: 'Device Creation',
        lines: [
            { t: '' },
            { t: '    return g_pD3D->CreateDevice(', c: 0.7, tp: 'fn' },
            { t: '        0, D3DDEVTYPE_HAL, NULL;', c: 0.75 },
            { t: '        D3DCREATE_HARDWARE_VERTEXPROCESSING,', c: 0.75, tp: 'ty' },
            { t: '        &pp, &g_pDevice);', c: 0.8, tp: 'fn' },
            { t: '}', be: true },
        ],
    },
];

// ── Block Explanations ──

export const LESSON_EXPL: Record<string, LessonExplanation> = {
    comment: {
        label: 'Documentation', tp: 'cm',
        desc: 'This is a comment block (called a "doc comment") — it doesn\'t run as code. We write these so that anyone reading this file later (including future you!) immediately understands what the program does without reading every line. Good comments save hours of confusion down the road.',
    },
    preproc: {
        label: 'Preprocessor Setup', tp: 'dir',
        desc: 'We start by including a header file ("stdafx.h") — this is like opening a toolbox that gives us access to all the Xbox 360 functions we\'ll need. Without it, the compiler wouldn\'t know what Direct3D is.<br><br>Then we define our screen size as constants ("#define") so we can reuse these values everywhere without typing the numbers over and over. If we ever want to change the resolution, we only change it here. 1280\u00d7720 is 720p HD — the standard the Xbox 360 outputs to your TV.',
    },
    globals: {
        label: 'Global D3D Objects', tp: 'vr',
        desc: 'We create these four variables at the top (called "global pointers") because they need to exist for the entire life of the program — not just inside one function. They start empty ("nullptr" means pointing at nothing).<br><br>Why four? Rendering needs a chain: first a connection to the graphics system (IDirect3D9), then a handle to the actual GPU chip (IDirect3DDevice9), then a place to store our cube\'s 3D shape in video memory (VertexBuffer), and finally the dirt texture image (Texture). Each one depends on the one before it.',
    },
    vertex: {
        label: 'Vertex Structure', tp: 'ty',
        desc: 'A "vertex" is a corner point of a 3D shape — our cube has 8 of them. The GPU needs to know what data each corner carries, so we define a blueprint (called a "struct").<br><br>Each vertex has a position in 3D space (x, y, z, w) and UV coordinates that tell the GPU which part of the dirt texture to paint on that face. Without UVs, the cube would be a solid color — texture mapping is what makes it actually look like a Minecraft block.',
    },
    fn_open: {
        label: 'Function Signature', tp: 'fn',
        desc: 'This is where we declare our initialization function. "HRESULT" is the return type — it\'s a special code that tells whoever called this function whether it succeeded or failed.<br><br>"InitD3D" is the name we chose — it means "Initialize Direct3D." Everything inside this function will set up the GPU so we can start drawing. "(void)" means it takes no inputs — it handles everything internally using the global variables we created above. The opening brace "{" marks where the function body begins.',
    },
    create9: {
        label: 'Creating the D3D Object', tp: 'fn',
        desc: 'This is our very first real Direct3D call! "Direct3DCreate9" is a system function that opens the door to the graphics system and gives us back an interface object.<br><br>We store the result in our "g_pD3D" global pointer — remember that empty parking spot from earlier? It just got filled! But what if it failed? That\'s why the next line checks: "if (!g_pD3D)" means "if the pointer is still empty." If it is, we bail out immediately with "return E_FAIL" — there\'s no point continuing if we can\'t even connect to the graphics system.',
    },
    pp: {
        label: 'Presentation Config', tp: 'ty',
        desc: 'Before we can draw anything, we tell the GPU exactly HOW to display it. This settings block ("D3DPRESENT_PARAMETERS") answers critical questions:<br><br>\u2022 How big is the screen? (1280\u00d7720)<br>\u2022 How many colors? (A8R8G8B8 = 32-bit, 16 million colors)<br>\u2022 Should closer objects block farther ones? (Yes — that\'s what the "depth buffer" does)<br>\u2022 What happens to the old frame? ("DISCARD" — throw it away, fastest option)<br>\u2022 Should we sync to the TV refresh? (Yes — "VSync" prevents ugly screen tearing)',
    },
    createdev: {
        label: 'Device Creation', tp: 'fn',
        desc: 'This is the big moment — everything above was setup, now we actually create our link to the GPU! We call CreateDevice() and pass in all our settings.<br><br>If it works (returns "S_OK"), we get back a device object — our direct control line to the Xbox 360\'s graphics chip (the Xenos GPU). Every single draw call, texture load, and frame render goes through this device. If it fails, nothing else can work, which is why we check for errors and bail out with "E_FAIL" if something goes wrong.',
    },
};

// ── Block Connections (arrows between related code) ──

export const LESSON_CONNECTIONS: Record<string, LessonConnection[]> = {
    create9: [
        {
            src: [10], dst: [23, 24],
            label: 'This empty slot gets filled here \u2193',
            desc: 'Remember that empty "g_pD3D" parking spot we created? Direct3DCreate9 is what actually fills it. The variable was declared global so it lives long enough for every function to use it — and here\'s where it first gets a real value.',
        },
    ],
    pp: [
        {
            src: [6, 7], dst: [28, 29],
            label: 'Screen size values flow down here \u2193',
            desc: 'This is why we used #define! Instead of typing "1280" and "720" again (and risking a typo), we reuse SCREEN_W and SCREEN_H. If you ever want 1080p, you change two lines at the top and every reference updates automatically.',
        },
    ],
    createdev: [
        {
            src: [10], dst: [36],
            label: 'Uses the graphics connection from above \u2191',
            desc: 'CreateDevice needs the D3D interface we got earlier — it\'s like showing your membership card to get into the club. g_pD3D is our "connection to the graphics system," and we use it here to request an actual GPU device.',
        },
        {
            src: [11], dst: [39],
            label: 'Saves the GPU device into this slot \u2191',
            desc: 'The second empty parking spot gets filled! CreateDevice writes the new GPU handle directly into g_pDevice using the "&" (address-of) operator. After this call, g_pDevice is our direct control line to the Xenos GPU chip.',
        },
    ],
};

// ── Visualizer Control Configs ──

export const LESSON_VIS_CTRLS: Record<string, VisControl[]> = {
    preproc: [
        { key: 'sw', label: 'Width', min: 640, max: 1920, val: 1280 },
        { key: 'sh', label: 'Height', min: 480, max: 1080, val: 720 },
    ],
    pp: [
        { key: 'vsync', label: 'VSync', type: 'checkbox', val: true },
    ],
};

// ── Which block visualizers need continuous animation? ──

export const ANIMATED_VIS = new Set(['preproc', 'fn_open', 'create9', 'createdev']);

// ── Token-Level Explanations ──

export const LESSON_TOKENS: Record<string, TokenLine[]> = {
    comment: [
        { line: 0, tokens: [{ text: '/**', desc: 'This opens a "doc comment" — a special comment that documentation tools can read. The double asterisk makes it different from a regular /* comment.' }] },
        { line: 3, tokens: [{ text: '*/', desc: 'This closes the comment block. Everything between /** and */ is ignored by the compiler — it\'s purely for human readers.' }] },
    ],
    preproc: [
        { line: 0, tokens: [
            { text: '#include', desc: 'A command that says "copy-paste the contents of another file right here." It runs before the actual code compiles (that\'s why it\'s called a "preprocessor" directive).' },
            { text: '"stdafx.h"', desc: 'This is a "precompiled header" — a big bundle of Xbox 360 system code already processed and ready to go. Using it makes compiling much faster instead of re-reading thousands of lines every time.' },
        ] },
        { line: 2, tokens: [
            { text: '#define', desc: 'Another preprocessor command — this one creates a text replacement rule. Everywhere the compiler sees the name after this, it swaps in the value. Think of it like a nickname.' },
            { text: 'SCREEN_W', desc: 'The name we\'re creating. ALL_CAPS is a convention that tells other programmers "this is a constant — a value that never changes." The W stands for Width.' },
            { text: '1280', desc: 'The value — 1280 pixels wide. This is the horizontal resolution. Combined with 720 tall, it gives us 720p HD, which is the standard output resolution for Xbox 360 games.' },
        ] },
        { line: 3, tokens: [
            { text: '#define', desc: 'Same command again — creating another text replacement.' },
            { text: 'SCREEN_H', desc: 'H stands for Height. Together with SCREEN_W, these two values define our entire screen area.' },
            { text: '720', desc: '720 pixels tall. 1280\u00d7720 = 921,600 pixels total that the GPU has to draw every single frame, 60 times per second.' },
        ] },
    ],
    globals: [
        { line: 2, tokens: [
            { text: 'IDirect3D9*', desc: 'This is a "type" — it says what kind of data this variable holds. IDirect3D9 is the main entry point to the Direct3D graphics system. The * means it\'s a "pointer" — it holds the address of the object in memory, not the object itself.' },
            { text: 'g_pD3D', desc: 'The variable name. The "g_" prefix means "global" (accessible everywhere), and "p" means "pointer." So g_pD3D = "global pointer to our D3D object." This naming convention helps you instantly know what a variable is.' },
            { text: 'nullptr', desc: 'This means "pointing at nothing" — the parking spot is empty. We set it to nullptr now and fill it later when we actually create the D3D object. Trying to use a nullptr would crash the program.' },
        ] },
        { line: 3, tokens: [
            { text: 'IDirect3DDevice9*', desc: 'The "Device" is your direct handle to the GPU hardware. Once created, every draw call, every texture load, every frame render goes through this object. It\'s the most important pointer in any D3D program.' },
            { text: 'g_pDevice', desc: '"Global pointer to our Device." This will become our main tool for talking to the Xbox 360\'s Xenos GPU chip.' },
            { text: 'nullptr', desc: 'Empty for now — gets filled when CreateDevice() succeeds later in InitD3D().' },
        ] },
        { line: 4, tokens: [
            { text: 'IDirect3DVertexBuffer9*', desc: 'A "Vertex Buffer" is a block of GPU memory that stores the corner points (vertices) of our 3D shape. Putting geometry in video memory lets the GPU access it super fast instead of copying it every frame.' },
            { text: 'g_pVB', desc: '"Global pointer to our Vertex Buffer." This will hold the 8 corners and 36 vertices that make up our cube\'s 6 faces.' },
        ] },
        { line: 5, tokens: [
            { text: 'IDirect3DTexture9*', desc: 'A "Texture" is an image that gets painted onto the surface of a 3D object. Ours will be the dirt block texture — brown sides with a green grass top, just like Minecraft.' },
            { text: 'g_pTexture', desc: '"Global pointer to our Texture." Gets loaded from a file or created in memory later.' },
        ] },
    ],
    vertex: [
        { line: 2, tokens: [
            { text: 'struct', desc: 'Short for "structure" — a way to bundle multiple pieces of data together under one name. It\'s like creating a custom form with specific fields that all belong together.' },
            { text: 'Vertex', desc: 'The name of our structure. A "vertex" is a corner point of a 3D shape. We\'re defining what information each corner carries. Every 3D game uses vertex structures.' },
            { text: '{', desc: 'The opening brace — everything between { and } defines what\'s inside this structure. Each vertex in our cube will have exactly this data layout.' },
        ] },
        { line: 3, tokens: [
            { text: 'float4', desc: 'A bundle of 4 floating-point numbers — these hold decimal values like 1.5 or -3.7. Four of them together can represent a position in 3D space (x, y, z) plus a "w" component used for math.' },
            { text: 'pos', desc: 'Short for "position" — this tells the GPU where this corner point sits in 3D space. Without a position, the GPU wouldn\'t know where to put this vertex on screen.' },
            { text: ': POSITION', desc: 'This is an HLSL "semantic" — a label that tells the GPU\'s vertex shader which input to connect this data to. POSITION means "this is the 3D coordinate." The colon : means "bind to."' },
        ] },
        { line: 4, tokens: [
            { text: 'float2', desc: 'Two floating-point numbers — enough to represent a point on a flat 2D surface, which is exactly what a texture is.' },
            { text: 'uv', desc: '"UV coordinates" — they map a point on the 3D surface to a point on the 2D texture image. U goes left-right (0.0 to 1.0), V goes top-bottom. It\'s how the dirt image gets wrapped around the cube.' },
            { text: ': TEXCOORD0', desc: 'Another semantic — this one tells the shader "these are texture coordinates, use them for texture sampling." The 0 means it\'s the first (and only) set of texture coords.' },
        ] },
    ],
    fn_open: [
        { line: 1, tokens: [
            { text: 'HRESULT', desc: 'The return type — HRESULT is a special code the function sends back to say if it worked or failed. "S_OK" means success, anything else means something went wrong. Almost every DirectX function uses HRESULT.' },
            { text: 'InitD3D', desc: 'The function name we chose — "Initialize Direct3D." This function will set up everything the GPU needs before we can draw anything. Good function names describe what the function does.' },
            { text: '(void)', desc: '"void" means this function takes no inputs — it doesn\'t need any information from the caller. It handles everything internally using the global variables we defined above.' },
        ] },
        { line: 2, tokens: [
            { text: '{', desc: 'The opening brace of the function body. Everything between this { and the closing } at the end is the code that runs when InitD3D() is called.' },
        ] },
    ],
    create9: [
        { line: 0, tokens: [
            { text: 'g_pD3D', desc: 'Remember our empty parking spot from earlier? We\'re about to fill it. This is the global pointer that was set to nullptr — now it\'s going to point to something real.' },
            { text: '=', desc: 'The assignment operator — it takes the value from the right side and stores it in the variable on the left. After this line, g_pD3D will no longer be nullptr.' },
            { text: 'Direct3DCreate9', desc: 'A system function provided by Microsoft that creates the main Direct3D object. This is the very first D3D call in any program — it opens the door to the graphics system. It\'s like getting the key to the building.' },
            { text: 'D3D_SDK_VERSION', desc: 'A version number that makes sure your program matches the version of DirectX installed. If there\'s a mismatch, the function will fail. It\'s a safety check built into the system.' },
        ] },
        { line: 1, tokens: [
            { text: 'if', desc: 'A conditional check — the code inside only runs IF the condition in parentheses is true. We\'re checking if something went wrong before continuing.' },
            { text: '(!g_pD3D)', desc: 'The ! means "not" — so this reads "if g_pD3D is NOT valid." If Direct3DCreate9 failed, g_pD3D would still be nullptr (empty), and this check catches that. Never assume things worked — always check.' },
            { text: 'return E_FAIL', desc: '"Get out of this function immediately and tell the caller it failed." E_FAIL is a standard error code. We bail out early because there\'s no point continuing if we can\'t even create the base D3D object.' },
        ] },
    ],
    pp: [
        { line: 1, tokens: [
            { text: 'D3DPRESENT_PARAMETERS', desc: 'A pre-defined structure (like a form) with about 20 fields that describe how the GPU should present frames to the screen. We need to fill it out before creating the device.' },
            { text: 'pp', desc: 'Our local variable name — short for "present parameters." Short names are fine for local variables that are only used nearby.' },
        ] },
        { line: 2, tokens: [
            { text: 'ZeroMemory', desc: 'A helper function that fills the entire structure with zeros. This is important — without it, the fields would contain random garbage data left in memory, which could cause unpredictable behavior or crashes.' },
            { text: '&pp', desc: 'The & means "the address of" — we\'re telling ZeroMemory where in memory our pp variable lives so it can go zero it out. Functions often need addresses to modify data.' },
            { text: 'sizeof(pp)', desc: '"sizeof" calculates how many bytes our structure takes up in memory. ZeroMemory needs to know how much to zero — we don\'t want it erasing too much or too little.' },
        ] },
        { line: 3, tokens: [
            { text: 'pp.BackBufferWidth', desc: 'The width of the off-screen image (the "back buffer") where the GPU draws the next frame. We set this to our SCREEN_W constant.' },
            { text: 'SCREEN_W', desc: 'Remember our #define from earlier? The compiler swaps this out for 1280 before the code runs. This is why we used a constant — change it once at the top, it updates everywhere.' },
        ] },
        { line: 5, tokens: [
            { text: 'D3DFMT_A8R8G8B8', desc: 'The color format — each pixel gets 8 bits for Alpha (transparency), Red, Green, and Blue. That\'s 32 bits per pixel, giving us over 16 million possible colors. The A8 means we also get transparency support.' },
        ] },
        { line: 8, tokens: [
            { text: 'D3DSWAPEFFECT_DISCARD', desc: '"DISCARD" means once a frame is shown on screen, throw away the back buffer contents. This is the fastest swap mode because the GPU doesn\'t waste time preserving old data. For games, speed matters more than keeping old frames.' },
        ] },
        { line: 9, tokens: [
            { text: 'D3DPRESENT_INTERVAL_ONE', desc: 'This enables VSync — the GPU waits for the TV\'s vertical blank signal before flipping to the next frame. Without this, you\'d see "screen tearing" where the top half shows one frame and the bottom shows another. The trade-off is a locked 60fps cap.' },
        ] },
    ],
    createdev: [
        { line: 1, tokens: [
            { text: 'return', desc: 'This function returns whatever CreateDevice gives us — an HRESULT success/failure code. The caller can check this to know if initialization worked.' },
            { text: 'g_pD3D->CreateDevice', desc: 'The -> operator accesses a function through a pointer. We\'re calling CreateDevice() on our D3D object. This is the moment where we actually request a GPU device from the system.' },
        ] },
        { line: 2, tokens: [
            { text: '0', desc: 'The adapter number — 0 means "the default/primary graphics adapter." On the Xbox 360 there\'s only one GPU, so this is always 0.' },
            { text: 'D3DDEVTYPE_HAL', desc: '"Hardware Abstraction Layer" — this tells DirectX to use the real GPU hardware for rendering. The alternative is D3DDEVTYPE_REF which uses slow software emulation. Always use HAL for real games.' },
        ] },
        { line: 3, tokens: [
            { text: 'D3DCREATE_HARDWARE_VERTEXPROCESSING', desc: 'Tells the GPU to handle vertex transformations (moving, rotating, projecting 3D points) in hardware. This is much faster than doing it on the CPU. On Xbox 360, the GPU\'s vertex shaders are specifically designed for this.' },
        ] },
        { line: 4, tokens: [
            { text: '&pp', desc: 'We pass the address of our filled-out presentation parameters structure. CreateDevice reads all our settings from it — screen size, color format, VSync, everything we configured above.' },
            { text: '&g_pDevice', desc: 'We pass the address of our empty device pointer. If CreateDevice succeeds, it fills this pointer with our new GPU device handle. This is how the function "returns" the device to us — by writing it into our variable.' },
        ] },
    ],
};
