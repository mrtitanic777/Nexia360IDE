/**
 * Nexia IDE Learning System
 * Tips, curriculum milestones, and achievements for Xbox 360 development.
 */

// ── Skill Levels ──
export type SkillLevel = 'beginner' | 'intermediate' | 'expert';

// ── User Profile ──
export interface UserProfile {
    skillLevel: SkillLevel;
    onboardingComplete: boolean;
    tipsEnabled: boolean;
    completedAchievements: string[];
    currentGoal: string | null;
    dismissedTips: string[];
    totalBuilds: number;
    totalDeploys: number;
    firstBuildDate: string | null;
}

export const DEFAULT_PROFILE: UserProfile = {
    skillLevel: 'beginner',
    onboardingComplete: false,
    tipsEnabled: true,
    completedAchievements: [],
    currentGoal: 'first-build',
    dismissedTips: [],
    totalBuilds: 0,
    totalDeploys: 0,
    firstBuildDate: null,
};

// ── Tips System ──
export interface Tip {
    id: string;
    title: string;
    body: string;
    category: 'ide' | 'xbox360' | 'cpp' | 'd3d' | 'build' | 'xam';
    minLevel: SkillLevel;  // minimum level to show this tip
    trigger: 'file-open' | 'build-success' | 'build-fail' | 'project-create' | 'editor-idle' | 'first-launch' | 'file-type';
    triggerMatch?: string;  // optional: file extension, error code, etc.
    icon: string;
}

const LEVEL_ORDER: Record<SkillLevel, number> = { beginner: 0, intermediate: 1, expert: 2 };

export function shouldShowTip(tip: Tip, userLevel: SkillLevel): boolean {
    return LEVEL_ORDER[userLevel] <= LEVEL_ORDER[tip.minLevel];
}

export const TIPS_DATABASE: Tip[] = [
    // ── IDE Tips ──
    {
        id: 'tip-save-shortcut', title: 'Quick Save', icon: '💾',
        body: 'Press Ctrl+S to save the current file, or Ctrl+Shift+S to save all open files at once.',
        category: 'ide', minLevel: 'beginner', trigger: 'first-launch',
    },
    {
        id: 'tip-build-shortcut', title: 'Build Shortcuts', icon: '🔨',
        body: 'Press F7 or Ctrl+B to build your project. Ctrl+Shift+B does a full rebuild. All files are auto-saved before building.',
        category: 'ide', minLevel: 'beginner', trigger: 'project-create',
    },
    {
        id: 'tip-goto-line', title: 'Go to Line', icon: '🔢',
        body: 'Press Ctrl+G to jump to a specific line number. Great for navigating to compiler errors!',
        category: 'ide', minLevel: 'beginner', trigger: 'editor-idle',
    },
    {
        id: 'tip-find-replace', title: 'Find & Replace', icon: '🔍',
        body: 'Ctrl+F opens Find, Ctrl+H opens Find & Replace. Works with regex too — click the .* button.',
        category: 'ide', minLevel: 'beginner', trigger: 'editor-idle',
    },
    {
        id: 'tip-zoom', title: 'Zoom the Editor', icon: '🔎',
        body: 'Use Ctrl+Scroll or Ctrl+=/- to zoom in and out. Ctrl+0 resets to 100%.',
        category: 'ide', minLevel: 'beginner', trigger: 'editor-idle',
    },
    {
        id: 'tip-context-menu', title: 'Right-Click Menus', icon: '📋',
        body: 'Right-click files and tabs for quick actions like Rename, Delete, Copy Path, and Reveal in Explorer.',
        category: 'ide', minLevel: 'beginner', trigger: 'editor-idle',
    },
    {
        id: 'tip-multiple-tabs', title: 'Working with Tabs', icon: '📑',
        body: 'Click files in the Explorer to open them in tabs. Right-click a tab for Close Others and Close All.',
        category: 'ide', minLevel: 'beginner', trigger: 'editor-idle',
    },

    // ── Xbox 360 Tips ──
    {
        id: 'tip-stdafx', title: 'Precompiled Headers', icon: '⚡',
        body: 'stdafx.h is a precompiled header — put commonly used #includes there to speed up compilation. Every .cpp file must #include "stdafx.h" as its first line.',
        category: 'xbox360', minLevel: 'beginner', trigger: 'file-open', triggerMatch: '.h',
    },
    {
        id: 'tip-xtl', title: 'xtl.h — The Xbox Header', icon: '🎮',
        body: 'On Xbox 360, you include <xtl.h> instead of <windows.h>. It provides all the Win32-compatible APIs plus Xbox-specific extensions.',
        category: 'xbox360', minLevel: 'beginner', trigger: 'file-open', triggerMatch: '.cpp',
    },
    {
        id: 'tip-xex', title: 'What is a .XEX?', icon: '📦',
        body: 'Xbox 360 executables are .XEX files (Xbox Executable). The build system compiles your code to a .EXE, then the ImageXex tool converts it to .XEX format that the Xbox 360 can run.',
        category: 'xbox360', minLevel: 'beginner', trigger: 'build-success',
    },
    {
        id: 'tip-game-path', title: 'The game:\\ Path', icon: '📂',
        body: 'On Xbox 360, game:\\ refers to the root of your deployed game folder. Use paths like "game:\\Content\\texture.png" to load assets.',
        category: 'xbox360', minLevel: 'beginner', trigger: 'file-open', triggerMatch: '.cpp',
    },
    {
        id: 'tip-xinput', title: 'Xbox 360 Controller Input', icon: '🎮',
        body: 'Use XInputGetState() to read controller input. The Xbox 360 supports up to 4 controllers. Include <xinput2.h> (not xinput.h — that is PC only!).',
        category: 'xbox360', minLevel: 'beginner', trigger: 'editor-idle',
    },
    {
        id: 'tip-big-endian', title: 'PowerPC is Big Endian', icon: '🔄',
        body: 'The Xbox 360 CPU (Xenon) is PowerPC Big Endian. If you are working with binary data, network packets, or file formats, remember to byte-swap! Use _byteswap_ulong() and _byteswap_ushort().',
        category: 'xbox360', minLevel: 'intermediate', trigger: 'editor-idle',
    },
    {
        id: 'tip-ppc-alignment', title: 'Memory Alignment Matters', icon: '⚠',
        body: 'PowerPC requires strict memory alignment. Unaligned reads/writes will crash. Use __declspec(align(16)) for SIMD data and ensure structures are properly padded.',
        category: 'xbox360', minLevel: 'intermediate', trigger: 'editor-idle',
    },
    {
        id: 'tip-devkit', title: 'Deploying to a Dev Kit', icon: '📡',
        body: 'Use the Deploy button or Build > Deploy to Devkit to send your compiled .XEX to a connected development kit over the network. Make sure your devkit IP is configured in Settings.',
        category: 'xbox360', minLevel: 'beginner', trigger: 'build-success',
    },

    // ── C++ Tips ──
    {
        id: 'tip-nullptr', title: 'NULL vs nullptr', icon: '🔗',
        body: 'The Xbox 360 SDK uses NULL (which is 0). In modern C++ you would use nullptr, but the SDK headers expect NULL. Both work, just be consistent.',
        category: 'cpp', minLevel: 'beginner', trigger: 'file-open', triggerMatch: '.cpp',
    },
    {
        id: 'tip-release', title: 'Always Release COM Objects', icon: '🧹',
        body: 'Direct3D uses COM objects. Always call ->Release() on objects you created (textures, buffers, shaders, devices) to avoid memory leaks. Set pointers to NULL after releasing.',
        category: 'cpp', minLevel: 'beginner', trigger: 'file-open', triggerMatch: '.cpp',
    },
    {
        id: 'tip-failed-macro', title: 'The FAILED() Macro', icon: '✅',
        body: 'Xbox 360 APIs return HRESULT codes. Wrap calls in FAILED() to check for errors: if (FAILED(hr)) { /* handle error */ }. The SUCCEEDED() macro checks for success.',
        category: 'cpp', minLevel: 'beginner', trigger: 'editor-idle',
    },
    {
        id: 'tip-zeromemory', title: 'ZeroMemory for Structs', icon: '📝',
        body: 'Always ZeroMemory() structures before filling them in — especially D3DPRESENT_PARAMETERS. Uninitialized fields cause mysterious crashes.',
        category: 'cpp', minLevel: 'beginner', trigger: 'editor-idle',
    },

    // ── D3D Tips ──
    {
        id: 'tip-d3d-init', title: 'D3D9 Initialization Pattern', icon: '🖥',
        body: 'The standard D3D9 init flow is: Direct3DCreate9() → set up D3DPRESENT_PARAMETERS → CreateDevice(). Always check return values with FAILED().',
        category: 'd3d', minLevel: 'beginner', trigger: 'file-open', triggerMatch: '.cpp',
    },
    {
        id: 'tip-d3d-clear', title: 'Clear Before Rendering', icon: '🎨',
        body: 'Always call Clear() before BeginScene(). Clear both D3DCLEAR_TARGET (color buffer) and D3DCLEAR_ZBUFFER (depth buffer) to prevent visual artifacts.',
        category: 'd3d', minLevel: 'beginner', trigger: 'editor-idle',
    },
    {
        id: 'tip-d3d-present', title: 'Present Shows the Frame', icon: '📺',
        body: 'Present() swaps the back buffer to the screen. Your render loop should be: Clear → BeginScene → Draw → EndScene → Present.',
        category: 'd3d', minLevel: 'beginner', trigger: 'editor-idle',
    },
    {
        id: 'tip-d3d-widescreen', title: 'Widescreen Detection', icon: '📐',
        body: 'Use XGetVideoMode() to detect if the user is running 16:9 or 4:3. Adjust your projection matrix aspect ratio accordingly so things do not look stretched.',
        category: 'd3d', minLevel: 'intermediate', trigger: 'editor-idle',
    },
    {
        id: 'tip-d3d-shaders', title: 'Vertex & Pixel Shaders', icon: '✨',
        body: 'Xbox 360 uses shader model 3.0. Compile shaders with D3DXCompileShader() using profiles "vs_3_0" and "ps_3_0". The GPU has unified shaders — vertex and pixel shaders share the same hardware.',
        category: 'd3d', minLevel: 'intermediate', trigger: 'file-open', triggerMatch: '.hlsl',
    },

    // ── Build Tips ──
    {
        id: 'tip-debug-config', title: 'Debug vs Release', icon: '🐛',
        body: 'Debug builds include extra error checking and symbols for debugging but run slower. Release builds are optimized for performance. Profile builds have optimizations with debug symbols.',
        category: 'build', minLevel: 'beginner', trigger: 'project-create',
    },
    {
        id: 'tip-build-errors', title: 'Reading Build Errors', icon: '❌',
        body: 'Build errors show as file(line): error Cxxxx: message. Click errors in the Problems panel to jump directly to the problem line in your code.',
        category: 'build', minLevel: 'beginner', trigger: 'build-fail',
    },
    {
        id: 'tip-linker-errors', title: 'Linker Errors (LNK)', icon: '🔗',
        body: 'LNK2019 "unresolved external" means you are calling a function that exists in a library you have not linked. Check that the right .lib files are included in your project config.',
        category: 'build', minLevel: 'intermediate', trigger: 'build-fail',
    },
    {
        id: 'tip-pch-first', title: 'PCH Must Be First', icon: '⚡',
        body: 'Every .cpp file must have #include "stdafx.h" as its FIRST line (before any other code or includes). The compiler will error if anything appears before it.',
        category: 'build', minLevel: 'beginner', trigger: 'build-fail',
    },
];

// ── Achievements ──
export interface Achievement {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: 'milestone' | 'learning' | 'mastery';
    check: (profile: UserProfile, context?: any) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
    // ── Milestones ──
    {
        id: 'first-project', name: 'Hello World', icon: '🌱',
        description: 'Create your first Xbox 360 project.',
        category: 'milestone',
        check: (p) => p.totalBuilds >= 0 && p.onboardingComplete,
    },
    {
        id: 'first-build', name: 'It Compiles!', icon: '🔨',
        description: 'Successfully build a project for the first time.',
        category: 'milestone',
        check: (p) => p.totalBuilds >= 1,
    },
    {
        id: 'ten-builds', name: 'Build Machine', icon: '🏗',
        description: 'Complete 10 successful builds.',
        category: 'milestone',
        check: (p) => p.totalBuilds >= 10,
    },
    {
        id: 'fifty-builds', name: 'Compile Veteran', icon: '⚙',
        description: 'Complete 50 successful builds.',
        category: 'milestone',
        check: (p) => p.totalBuilds >= 50,
    },
    {
        id: 'hundred-builds', name: 'Master Builder', icon: '🏆',
        description: 'Complete 100 successful builds.',
        category: 'milestone',
        check: (p) => p.totalBuilds >= 100,
    },
    {
        id: 'first-deploy', name: 'On the Box', icon: '📡',
        description: 'Deploy to a dev kit for the first time.',
        category: 'milestone',
        check: (p) => p.totalDeploys >= 1,
    },

    // ── Learning ──
    {
        id: 'learn-pch', name: 'Precompiled Pro', icon: '⚡',
        description: 'Open and examine the stdafx.h precompiled header.',
        category: 'learning',
        check: () => false, // triggered by opening stdafx.h
    },
    {
        id: 'learn-shader', name: 'Shader Apprentice', icon: '✨',
        description: 'Open or create an HLSL shader file.',
        category: 'learning',
        check: () => false, // triggered by opening .hlsl
    },
    {
        id: 'learn-multiple-files', name: 'Code Organizer', icon: '📁',
        description: 'Have 3 or more source files in a single project.',
        category: 'learning',
        check: () => false, // triggered by file count
    },
    {
        id: 'learn-texture', name: 'Texture Artist', icon: '🖼',
        description: 'Add an image file to the Content folder.',
        category: 'learning',
        check: () => false, // triggered by adding .png/.dds to Content
    },

    // ── Mastery ──
    {
        id: 'master-clean-build', name: 'Zero Warnings', icon: '✅',
        description: 'Complete a build with zero errors and zero warnings.',
        category: 'mastery',
        check: () => false, // triggered by clean build result
    },
    {
        id: 'master-all-configs', name: 'Triple Threat', icon: '🎯',
        description: 'Successfully build in Debug, Release, and Profile configurations.',
        category: 'mastery',
        check: () => false, // tracked separately
    },
    {
        id: 'master-explorer', name: 'IDE Explorer', icon: '🗺',
        description: 'Use all IDE features: build, deploy, SDK tools, themes, and keyboard shortcuts.',
        category: 'mastery',
        check: () => false,
    },
];

// ── Curriculum Goals ──
export interface CurriculumGoal {
    id: string;
    title: string;
    description: string;
    icon: string;
    order: number;
    steps: string[];
    requiredAchievements: string[];  // achievements that must be earned
    unlocksAchievement: string;  // achievement earned on completion
}

export const CURRICULUM: CurriculumGoal[] = [
    {
        id: 'goal-setup', title: 'Getting Started', icon: '🚀', order: 1,
        description: 'Set up your first Xbox 360 project and learn the IDE basics.',
        steps: [
            'Create a new project using File > New Project',
            'Explore the file tree — notice stdafx.h, stdafx.cpp, and main.cpp',
            'Open main.cpp and look through the code',
            'Try changing the background color in the Clear() call',
        ],
        requiredAchievements: [],
        unlocksAchievement: 'first-project',
    },
    {
        id: 'goal-first-build', title: 'Your First Build', icon: '🔨', order: 2,
        description: 'Compile your project into a real Xbox 360 executable.',
        steps: [
            'Make sure the SDK is detected (check status bar)',
            'Select Debug configuration from the dropdown',
            'Press F7 or click Build > Build to compile',
            'Check the Output panel for build results',
            'If there are errors, click them in the Problems panel to jump to the issue',
        ],
        requiredAchievements: ['first-project'],
        unlocksAchievement: 'first-build',
    },
    {
        id: 'goal-understand-code', title: 'Understanding the Code', icon: '📖', order: 3,
        description: 'Learn what each part of the template does.',
        steps: [
            'Open stdafx.h — this is your precompiled header with common includes',
            'In main.cpp, find InitD3D() — this sets up the graphics device',
            'Find the Render() function — this draws every frame',
            'Find the main loop — for(;;) runs Render() continuously',
            'Try changing D3DCOLOR_XRGB values and rebuild to see the difference',
        ],
        requiredAchievements: ['first-build'],
        unlocksAchievement: 'learn-pch',
    },
    {
        id: 'goal-add-content', title: 'Adding Content', icon: '🖼', order: 4,
        description: 'Add a texture and load it in your game.',
        steps: [
            'Find the Content folder in your project',
            'Add an image file (dirt.png, grass.png, etc.) to the Content folder',
            'In main.cpp, the template already loads from game:\\Content\\dirt.png',
            'Rename your texture or update the path in code to match',
            'Build and run — your texture should appear on the spinning cube!',
        ],
        requiredAchievements: ['learn-pch'],
        unlocksAchievement: 'learn-texture',
    },
    {
        id: 'goal-controller', title: 'Controller Input', icon: '🎮', order: 5,
        description: 'Read Xbox 360 controller input to make your game interactive.',
        steps: [
            'Add #include <xinput2.h> to stdafx.h (if not already there)',
            'In your Update() function, call XInputGetState(0, &state)',
            'Read the XINPUT_GAMEPAD struct for button presses and thumbstick values',
            'Try making the cube rotate based on the left thumbstick',
            'Add a button press check to change the background color',
        ],
        requiredAchievements: ['learn-texture'],
        unlocksAchievement: 'learn-multiple-files',
    },
    {
        id: 'goal-multiple-files', title: 'Organizing Your Code', icon: '📁', order: 6,
        description: 'Split your code into multiple files like a real project.',
        steps: [
            'Right-click the src folder > New File Here > "renderer.h"',
            'Move your D3D initialization code into renderer.h / renderer.cpp',
            'Create an "input.h" / "input.cpp" for controller handling',
            'Remember: every .cpp file needs #include "stdafx.h" as the first line',
            'Build to make sure everything still compiles',
        ],
        requiredAchievements: ['learn-multiple-files'],
        unlocksAchievement: 'learn-shader',
    },
    {
        id: 'goal-deploy', title: 'Deploy to Hardware', icon: '📡', order: 7,
        description: 'Run your game on real Xbox 360 hardware.',
        steps: [
            'Connect your Xbox 360 dev kit to your network',
            'Go to Settings > SDK Setup and configure the devkit IP',
            'Build your project in Debug configuration',
            'Click Deploy to Devkit in the toolbar',
            'Watch your game run on the actual console!',
        ],
        requiredAchievements: ['learn-shader'],
        unlocksAchievement: 'first-deploy',
    },
    {
        id: 'goal-release', title: 'Release Build', icon: '🏆', order: 8,
        description: 'Create an optimized release build.',
        steps: [
            'Switch configuration to Release',
            'Build the project — notice the optimization flags in the output',
            'Compare the .xex file size between Debug and Release',
            'Try Profile configuration for optimized builds with debug info',
            'Earn the Triple Threat achievement by building all three!',
        ],
        requiredAchievements: ['first-deploy'],
        unlocksAchievement: 'master-all-configs',
    },
];

// ── Helpers ──
export function getNextGoal(profile: UserProfile): CurriculumGoal | null {
    for (const goal of CURRICULUM) {
        const achieved = goal.unlocksAchievement;
        if (!profile.completedAchievements.includes(achieved)) {
            // Check prerequisites
            const prereqsMet = goal.requiredAchievements.every(
                a => profile.completedAchievements.includes(a)
            );
            if (prereqsMet) return goal;
        }
    }
    return null; // All goals complete!
}

export function getRandomTip(profile: UserProfile, trigger: string, match?: string): Tip | null {
    const candidates = TIPS_DATABASE.filter(tip => {
        if (profile.dismissedTips.includes(tip.id)) return false;
        if (!shouldShowTip(tip, profile.skillLevel)) return false;
        if (tip.trigger !== trigger) return false;
        if (tip.triggerMatch && match && tip.triggerMatch !== match) return false;
        return true;
    });
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

export function getCategoryTips(profile: UserProfile, category: string): Tip[] {
    return TIPS_DATABASE.filter(tip => {
        if (profile.dismissedTips.includes(tip.id)) return false;
        if (!shouldShowTip(tip, profile.skillLevel)) return false;
        return tip.category === category;
    });
}

export function getAchievementProgress(profile: UserProfile): { earned: Achievement[]; locked: Achievement[] } {
    const earned = ACHIEVEMENTS.filter(a => profile.completedAchievements.includes(a.id));
    const locked = ACHIEVEMENTS.filter(a => !profile.completedAchievements.includes(a.id));
    return { earned, locked };
}
