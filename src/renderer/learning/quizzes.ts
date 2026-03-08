/**
 * Nexia IDE — Quiz & Study System + Code-Along Hints
 */

export type QuizMode = 'multiple-choice' | 'fill-in';

export interface QuizQuestion {
    id: string;
    category: string;
    question: string;
    options?: string[];       // for multiple-choice
    answer: string;           // correct answer text or option letter
    answerIndex?: number;     // for MC: 0-based index
    reference: string;        // explanation / learning material
    difficulty: 'beginner' | 'intermediate' | 'advanced';
}

export const QUIZ_BANK: QuizQuestion[] = [
    // ── Xbox 360 Basics ──
    {
        id: 'q-xtl', category: 'Xbox 360 Basics',
        question: 'On Xbox 360, which header replaces <windows.h>?',
        options: ['<xbox.h>', '<xtl.h>', '<x360.h>', '<xenon.h>'],
        answer: '<xtl.h>', answerIndex: 1, difficulty: 'beginner',
        reference: 'Xbox 360 uses <xtl.h> instead of <windows.h>. It provides all Win32-compatible APIs plus Xbox-specific extensions like XAM and Direct3D.',
    },
    {
        id: 'q-xex', category: 'Xbox 360 Basics',
        question: 'What is the file extension for Xbox 360 executables?',
        options: ['.exe', '.xbe', '.xex', '.xap'],
        answer: '.xex', answerIndex: 2, difficulty: 'beginner',
        reference: 'Xbox 360 uses .XEX (Xbox Executable) format. The build toolchain compiles to .exe first, then ImageXex converts it to .xex for the console.',
    },
    {
        id: 'q-endian', category: 'Xbox 360 Basics',
        question: 'The Xbox 360 CPU (Xenon) uses which byte order?',
        options: ['Little Endian', 'Big Endian', 'Mixed Endian', 'It depends on the mode'],
        answer: 'Big Endian', answerIndex: 1, difficulty: 'beginner',
        reference: 'The Xenon CPU is PowerPC, which is Big Endian. This means multi-byte values are stored most-significant byte first. Use _byteswap_ulong() when working with network data or PC file formats.',
    },
    {
        id: 'q-controllers', category: 'Xbox 360 Basics',
        question: 'How many controllers does Xbox 360 support simultaneously?',
        options: ['2', '4', '8', '16'],
        answer: '4', answerIndex: 1, difficulty: 'beginner',
        reference: 'Xbox 360 supports up to 4 wireless controllers. Use XInputGetState(0..3, &state) to read each one.',
    },
    {
        id: 'q-xinput', category: 'Xbox 360 Basics',
        question: 'Which XInput header should you use on Xbox 360?',
        options: ['<xinput.h>', '<xinput2.h>', '<xinput360.h>', '<xcontroller.h>'],
        answer: '<xinput2.h>', answerIndex: 1, difficulty: 'beginner',
        reference: 'Xbox 360 uses <xinput2.h>. The <xinput.h> header is for PC only and will not compile on the Xbox 360 SDK.',
    },
    {
        id: 'q-gamepath', category: 'Xbox 360 Basics',
        question: 'What path prefix refers to the root of your deployed game on Xbox 360?',
        options: ['C:\\', 'game:\\', 'xbox:\\', 'app:\\'],
        answer: 'game:\\', answerIndex: 1, difficulty: 'beginner',
        reference: 'game:\\ is the virtual drive that maps to your deployed game folder. Use paths like game:\\Content\\texture.png to load assets.',
    },
    {
        id: 'q-alignment-fill', category: 'Xbox 360 Basics',
        question: 'What happens if you perform an unaligned memory read on PowerPC?',
        answer: 'crash', difficulty: 'intermediate',
        reference: 'PowerPC requires strict memory alignment. Unaligned reads cause hardware exceptions (crashes). Use __declspec(align(16)) for SIMD data.',
    },

    // ── C++ & Patterns ──
    {
        id: 'q-pch', category: 'C++ & Build',
        question: 'What must be the FIRST line in every .cpp file when using precompiled headers?',
        options: ['#include <windows.h>', '#include "stdafx.h"', '#pragma once', '#include <xtl.h>'],
        answer: '#include "stdafx.h"', answerIndex: 1, difficulty: 'beginner',
        reference: 'The precompiled header include must be the first non-comment line. The compiler ignores everything before it when using /Yu (use PCH).',
    },
    {
        id: 'q-hresult', category: 'C++ & Build',
        question: 'Which macro checks if a COM/D3D function call failed?',
        options: ['IF_ERROR()', 'FAILED()', 'ISERROR()', 'CHECK_HR()'],
        answer: 'FAILED()', answerIndex: 1, difficulty: 'beginner',
        reference: 'FAILED(hr) returns true if the HRESULT indicates an error. Use SUCCEEDED(hr) for the opposite check. Always check D3D and COM return values.',
    },
    {
        id: 'q-release', category: 'C++ & Build',
        question: 'What must you call on every D3D/COM object when you are done with it?',
        options: ['delete obj', 'free(obj)', 'obj->Release()', 'obj->Dispose()'],
        answer: 'obj->Release()', answerIndex: 2, difficulty: 'beginner',
        reference: 'COM objects use reference counting. Release() decrements the count and frees memory when it hits zero. Always set the pointer to NULL after releasing.',
    },
    {
        id: 'q-zeromem-fill', category: 'C++ & Build',
        question: 'What function should you use to zero-initialize D3D structures before filling them?',
        answer: 'ZeroMemory', difficulty: 'beginner',
        reference: 'ZeroMemory(&struct, sizeof(struct)) sets all bytes to zero. This prevents crashes from uninitialized fields in structures like D3DPRESENT_PARAMETERS.',
    },
    {
        id: 'q-lnk2019', category: 'C++ & Build',
        question: 'Error LNK2019 "unresolved external symbol" usually means:',
        options: ['Syntax error in code', 'Missing #include', 'A .lib file is not linked', 'Out of memory'],
        answer: 'A .lib file is not linked', answerIndex: 2, difficulty: 'intermediate',
        reference: 'LNK2019 means the linker found a function declaration but not its implementation. This usually means you need to add the correct .lib file to your project.',
    },
    {
        id: 'q-debug-libs', category: 'C++ & Build',
        question: 'In Debug configuration, which D3D9 library should be linked?',
        options: ['d3d9.lib', 'd3d9d.lib', 'd3d9_debug.lib', 'd3d9x.lib'],
        answer: 'd3d9d.lib', answerIndex: 1, difficulty: 'intermediate',
        reference: 'Debug builds use d3d9d.lib (note the "d" suffix) which includes parameter validation and detailed error messages. Release uses d3d9.lib.',
    },

    // ── Direct3D ──
    {
        id: 'q-d3d-init', category: 'Direct3D',
        question: 'What is the first function called to initialize Direct3D 9?',
        options: ['CreateDevice()', 'D3DXInit()', 'Direct3DCreate9()', 'InitGraphics()'],
        answer: 'Direct3DCreate9()', answerIndex: 2, difficulty: 'beginner',
        reference: 'Direct3DCreate9(D3D_SDK_VERSION) creates the IDirect3D9 interface. Then you configure D3DPRESENT_PARAMETERS and call CreateDevice().',
    },
    {
        id: 'q-render-loop', category: 'Direct3D',
        question: 'What is the correct order of the D3D9 render loop?',
        options: [
            'BeginScene → Clear → Draw → EndScene → Present',
            'Clear → BeginScene → Draw → EndScene → Present',
            'Clear → Draw → Present',
            'BeginScene → Draw → Present → EndScene'
        ],
        answer: 'Clear → BeginScene → Draw → EndScene → Present', answerIndex: 1, difficulty: 'beginner',
        reference: 'Always Clear() first to reset the frame, then BeginScene/EndScene wraps your draw calls, and Present() swaps the buffer to screen.',
    },
    {
        id: 'q-clear-flags', category: 'Direct3D',
        question: 'Which flags should you pass to Clear() to reset both color and depth?',
        options: [
            'D3DCLEAR_TARGET',
            'D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER',
            'D3DCLEAR_ALL',
            'D3DCLEAR_ZBUFFER'
        ],
        answer: 'D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER', answerIndex: 1, difficulty: 'beginner',
        reference: 'D3DCLEAR_TARGET clears the color buffer and D3DCLEAR_ZBUFFER clears the depth buffer. Always clear both to prevent visual artifacts.',
    },
    {
        id: 'q-widescreen', category: 'Direct3D',
        question: 'Which function detects widescreen mode on Xbox 360?',
        options: ['GetDisplayMode()', 'XGetVideoMode()', 'D3DGetResolution()', 'XVideoGetFlags()'],
        answer: 'XGetVideoMode()', answerIndex: 1, difficulty: 'intermediate',
        reference: 'XGetVideoMode(&mode) fills an XVIDEO_MODE struct with display width, height, and interlaced flag. Use this to set your projection aspect ratio.',
    },
    {
        id: 'q-shader-model', category: 'Direct3D',
        question: 'What shader model does Xbox 360 support?',
        options: ['Shader Model 2.0', 'Shader Model 3.0', 'Shader Model 4.0', 'Shader Model 5.0'],
        answer: 'Shader Model 3.0', answerIndex: 1, difficulty: 'intermediate',
        reference: 'Xbox 360 GPU (Xenos) supports SM 3.0 with unified shaders. Compile with vs_3_0 and ps_3_0 profiles. The GPU shares shader units between vertex and pixel stages.',
    },
    {
        id: 'q-present-fill', category: 'Direct3D',
        question: 'What D3D function call swaps the back buffer to the screen?',
        answer: 'Present', difficulty: 'beginner',
        reference: 'IDirect3DDevice9::Present() flips the back buffer to the front, displaying the rendered frame. Call it once per frame after EndScene().',
    },
];

// ── Code-Along Hints ──
// Context-aware hints triggered by cursor position and file content
export interface CodeHint {
    id: string;
    trigger: 'line-content' | 'function-name' | 'include';
    pattern: RegExp;
    title: string;
    body: string;
    snippet?: string;  // insertable code
    icon: string;
}

export const CODE_HINTS: CodeHint[] = [
    // Includes
    {
        id: 'hint-xtl', trigger: 'include', icon: '📦',
        pattern: /#include\s*<xtl\.h>/,
        title: 'Xbox 360 Base Header',
        body: 'This is the master Xbox 360 header. It replaces <windows.h> and includes core Win32-compatible types, memory functions, and threading APIs.',
    },
    {
        id: 'hint-d3d9', trigger: 'include', icon: '🎨',
        pattern: /#include\s*<d3d9\.h>/,
        title: 'Direct3D 9 Header',
        body: 'Provides the IDirect3D9, IDirect3DDevice9, and all D3D types. This is the core graphics API for Xbox 360 rendering.',
    },
    {
        id: 'hint-xinput', trigger: 'include', icon: '🎮',
        pattern: /#include\s*<xinput2\.h>/,
        title: 'XInput Controller Header',
        body: 'Provides XInputGetState() and related functions for reading controller input. Supports up to 4 controllers.',
        snippet: '// Read controller 0\nXINPUT_STATE state;\nZeroMemory(&state, sizeof(XINPUT_STATE));\nif (XInputGetState(0, &state) == ERROR_SUCCESS) {\n    // Controller is connected\n    float lx = state.Gamepad.sThumbLX / 32768.0f;\n    float ly = state.Gamepad.sThumbLY / 32768.0f;\n}',
    },
    {
        id: 'hint-xam', trigger: 'include', icon: '📱',
        pattern: /#include\s*<xam\.h>/,
        title: 'XAM System Header',
        body: 'Xbox Application Manager — provides user profiles, achievements, notifications, Guide UI, marketplace, and system-level features.',
    },

    // D3D Patterns
    {
        id: 'hint-create-device', trigger: 'function-name', icon: '🖥',
        pattern: /Direct3DCreate9/,
        title: 'Creating the D3D Device',
        body: 'This creates the main Direct3D interface. After this, set up D3DPRESENT_PARAMETERS and call CreateDevice() to get your rendering device.',
        snippet: 'IDirect3D9* pD3D = Direct3DCreate9(D3D_SDK_VERSION);\nif (!pD3D) return E_FAIL;\n\nD3DPRESENT_PARAMETERS d3dpp;\nZeroMemory(&d3dpp, sizeof(d3dpp));\nd3dpp.BackBufferWidth = 1280;\nd3dpp.BackBufferHeight = 720;\nd3dpp.BackBufferFormat = D3DFMT_A8R8G8B8;\nd3dpp.SwapEffect = D3DSWAPEFFECT_DISCARD;\nd3dpp.PresentationInterval = D3DPRESENT_INTERVAL_ONE;\n\nIDirect3DDevice9* pDevice = NULL;\npD3D->CreateDevice(0, D3DDEVTYPE_HAL, NULL,\n    D3DCREATE_HARDWARE_VERTEXPROCESSING, &d3dpp, &pDevice);',
    },
    {
        id: 'hint-clear', trigger: 'function-name', icon: '🎨',
        pattern: /->Clear\s*\(/,
        title: 'Clearing the Frame',
        body: 'Clear() resets the render target and/or depth buffer. Always clear before drawing to prevent leftover pixels from the previous frame.',
        snippet: 'pDevice->Clear(0, NULL,\n    D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER,\n    D3DCOLOR_XRGB(100, 149, 237), // Cornflower blue\n    1.0f, 0);',
    },
    {
        id: 'hint-beginscene', trigger: 'function-name', icon: '🎬',
        pattern: /BeginScene/,
        title: 'Begin/End Scene',
        body: 'BeginScene() marks the start of a frame\'s draw calls. All rendering must happen between BeginScene() and EndScene(). Call Present() after EndScene().',
    },
    {
        id: 'hint-vertex-buffer', trigger: 'function-name', icon: '📐',
        pattern: /CreateVertexBuffer/,
        title: 'Creating a Vertex Buffer',
        body: 'Vertex buffers store geometry data in GPU memory. Lock the buffer to write vertices, then Unlock when done.',
        snippet: 'IDirect3DVertexBuffer9* pVB = NULL;\npDevice->CreateVertexBuffer(\n    numVertices * sizeof(Vertex),\n    0, D3DFVF_XYZ | D3DFVF_TEX1,\n    D3DPOOL_DEFAULT, &pVB, NULL);\n\nVertex* pVerts = NULL;\npVB->Lock(0, 0, (void**)&pVerts, 0);\n// Fill vertex data here...\npVB->Unlock();',
    },
    {
        id: 'hint-texture-load', trigger: 'function-name', icon: '🖼',
        pattern: /D3DXCreateTextureFromFile/,
        title: 'Loading a Texture',
        body: 'Loads an image file (PNG, BMP, DDS) as a D3D texture. Remember paths use game:\\ on Xbox 360.',
        snippet: 'IDirect3DTexture9* pTexture = NULL;\nHRESULT hr = D3DXCreateTextureFromFile(\n    pDevice, "game:\\\\Content\\\\texture.png", &pTexture);\nif (FAILED(hr)) {\n    // Handle error - file not found?\n}',
    },
    {
        id: 'hint-compile-shader', trigger: 'function-name', icon: '✨',
        pattern: /D3DXCompileShader/,
        title: 'Compiling Shaders',
        body: 'Compiles HLSL source code into shader bytecode at runtime. Use vs_3_0 for vertex shaders and ps_3_0 for pixel shaders.',
        snippet: 'ID3DXBuffer* pCode = NULL;\nID3DXBuffer* pErrors = NULL;\nHRESULT hr = D3DXCompileShader(\n    shaderSource, strlen(shaderSource),\n    NULL, NULL, "main", "vs_3_0",\n    0, &pCode, &pErrors, NULL);\nif (FAILED(hr) && pErrors) {\n    OutputDebugStringA((char*)pErrors->GetBufferPointer());\n}',
    },

    // Common patterns
    {
        id: 'hint-main-loop', trigger: 'line-content', icon: '🔄',
        pattern: /for\s*\(\s*;\s*;\s*\)/,
        title: 'Main Game Loop',
        body: 'This infinite loop is your game\'s heartbeat. Each iteration processes input, updates game state, and renders a frame. On Xbox 360, there\'s no window message pump — just loop and render.',
    },
    {
        id: 'hint-d3dcolor', trigger: 'line-content', icon: '🎨',
        pattern: /D3DCOLOR_XRGB/,
        title: 'D3D Color Macro',
        body: 'D3DCOLOR_XRGB(r, g, b) creates a color with full alpha. Values are 0-255. Use D3DCOLOR_ARGB(a, r, g, b) if you need transparency.',
    },
    {
        id: 'hint-xvideo', trigger: 'function-name', icon: '📺',
        pattern: /XGetVideoMode/,
        title: 'Video Mode Detection',
        body: 'Detects the display resolution and whether widescreen is active. Use this to set your backbuffer size and projection aspect ratio correctly.',
        snippet: 'XVIDEO_MODE videoMode;\nZeroMemory(&videoMode, sizeof(videoMode));\nXGetVideoMode(&videoMode);\nBOOL isWidescreen = videoMode.fIsWideScreen;\nDWORD width = videoMode.dwDisplayWidth;\nDWORD height = videoMode.dwDisplayHeight;',
    },
];

// ── Helper Functions ──
export function getQuizByCategory(category?: string): QuizQuestion[] {
    if (!category) return [...QUIZ_BANK];
    return QUIZ_BANK.filter(q => q.category === category);
}

export function getQuizCategories(): string[] {
    return [...new Set(QUIZ_BANK.map(q => q.category))];
}

export function shuffleArray<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export function getHintsForLine(lineContent: string): CodeHint[] {
    return CODE_HINTS.filter(h => h.pattern.test(lineContent));
}
