/**
 * Nexia IDE — Renderer Process
 */

// Node.js require works normally here — all captured before Monaco loads
const { ipcRenderer, shell } = require('electron');
const nodePath = require('path');
const nodeOs = require('os');
const nodeFs = require('fs');

const IPC = {
    SDK_DETECT: 'sdk:detect', SDK_CONFIGURE: 'sdk:configure',
    SDK_GET_PATHS: 'sdk:getPaths', SDK_GET_TOOLS: 'sdk:getTools',
    PROJECT_NEW: 'project:new', PROJECT_OPEN: 'project:open',
    PROJECT_SAVE: 'project:save', PROJECT_GET_CONFIG: 'project:getConfig',
    PROJECT_GET_TEMPLATES: 'project:getTemplates',
    PROJECT_EXPORT: 'project:export', PROJECT_IMPORT: 'project:import',
    FILE_READ: 'file:read', FILE_WRITE: 'file:write', FILE_LIST: 'file:list',
    FILE_CREATE: 'file:create', FILE_DELETE: 'file:delete', FILE_RENAME: 'file:rename',
    FILE_SELECT_DIR: 'file:selectDir', FILE_SELECT_FILE: 'file:selectFile',
    BUILD_RUN: 'build:run', BUILD_CLEAN: 'build:clean', BUILD_REBUILD: 'build:rebuild',
    BUILD_OUTPUT: 'build:output', BUILD_COMPLETE: 'build:complete',
    TOOL_COMPILE_SHADER: 'tool:compileShader', TOOL_BUILD_XEX: 'tool:buildXex',
    TOOL_ENCODE_AUDIO: 'tool:encodeAudio', TOOL_COMPILE_XUI: 'tool:compileXui',
    TOOL_INSPECT_BINARY: 'tool:inspectBinary', TOOL_COMPRESS: 'tool:compress',
    TOOL_LAUNCH_PIX: 'tool:launchPix', TOOL_RUN: 'tool:run', TOOL_LAUNCH: 'tool:launch', TOOL_OUTPUT: 'tool:output',
    EXT_LIST: 'ext:list', EXT_INSTALL_ZIP: 'ext:installZip', EXT_INSTALL_FOLDER: 'ext:installFolder',
    EXT_UNINSTALL: 'ext:uninstall', EXT_SET_ENABLED: 'ext:setEnabled',
    EXT_CREATE: 'ext:create', EXT_OPEN_DIR: 'ext:openDir',
    DEVKIT_CONNECT: 'devkit:connect', DEVKIT_DISCONNECT: 'devkit:disconnect',
    DEVKIT_SYSINFO: 'devkit:sysInfo', DEVKIT_STATUS: 'devkit:status',
    DEVKIT_VOLUMES: 'devkit:volumes',
    DEVKIT_DEPLOY: 'devkit:deploy', DEVKIT_LAUNCH: 'devkit:launch', DEVKIT_REBOOT: 'devkit:reboot',
    DEVKIT_SCREENSHOT: 'devkit:screenshot', DEVKIT_FILE_MANAGER: 'devkit:fileManager',
    EMU_LAUNCH: 'emu:launch', EMU_STOP: 'emu:stop', EMU_PAUSE: 'emu:pause',
    EMU_RESUME: 'emu:resume', EMU_STEP: 'emu:step', EMU_STEP_OVER: 'emu:stepOver',
    EMU_STATE: 'emu:state',
    EMU_REGISTERS: 'emu:registers', EMU_BREAKPOINT_SET: 'emu:bpSet',
    EMU_BREAKPOINT_REMOVE: 'emu:bpRemove', EMU_BREAKPOINT_LIST: 'emu:bpList',
    EMU_BACKTRACE: 'emu:backtrace',
    EMU_MEMORY_READ: 'emu:memRead', EMU_MEMORY_WRITE: 'emu:memWrite',
    EMU_CONFIGURE: 'emu:configure',
    EMU_GET_CONFIG: 'emu:getConfig', EMU_EVENT: 'emu:event',
    APP_GET_RECENT: 'app:getRecent', APP_REMOVE_RECENT: 'app:removeRecent', APP_SHOW_SETUP: 'app:showSetup',
    APP_READY: 'app:ready', APP_MINIMIZE: 'app:minimize',
    APP_MAXIMIZE: 'app:maximize', APP_CLOSE: 'app:close',
    DISCORD_GET_FEED: 'discord:getFeed', DISCORD_CONFIGURE: 'discord:configure',
    DISCORD_GET_CONFIG: 'discord:getConfig', DISCORD_GET_MESSAGES: 'discord:getMessages',
    DISCORD_GET_NEW_MESSAGES: 'discord:getNewMessages',
    DISCORD_CREATE_THREAD: 'discord:createThread', DISCORD_REPLY: 'discord:reply',
    DISCORD_DOWNLOAD: 'discord:download', DISCORD_AUTH_START: 'discord:authStart',
    DISCORD_AUTH_USER: 'discord:authUser', DISCORD_AUTH_LOGOUT: 'discord:authLogout',
    XEX_INSPECT: 'xex:inspect',
};

// ── State ──
let editor: any = null;
let monacoReady: Promise<void>;
let monacoResolve: () => void;
monacoReady = new Promise(r => { monacoResolve = r; });
let openTabs: { path: string; name: string; model: any; modified: boolean }[] = [];
let activeTab: string | null = null;
let currentProject: any = null;
let lastBuiltXex: string | null = null;
let defaultProjectsDir: string = '';
let bottomPanelVisible = true;
let sidebarVisible = true;

// ── Learning System ──
const learning = require('./learning');
const quizzes = require('./quizzes');
interface UserProfile {
    skillLevel: 'beginner' | 'intermediate' | 'expert';
    onboardingComplete: boolean;
    tipsEnabled: boolean;
    completedAchievements: string[];
    currentGoal: string | null;
    dismissedTips: string[];
    totalBuilds: number;
    totalDeploys: number;
    firstBuildDate: string | null;
}
const DEFAULT_PROFILE: UserProfile = {
    skillLevel: 'beginner', onboardingComplete: false, tipsEnabled: true,
    completedAchievements: [], currentGoal: 'first-build', dismissedTips: [],
    totalBuilds: 0, totalDeploys: 0, firstBuildDate: null,
};
let userProfile: UserProfile = { ...DEFAULT_PROFILE };
const PROFILE_FILE = nodePath.join(nodeOs.homedir(), '.nexia-ide-profile.json');

function loadProfile() {
    try {
        if (nodeFs.existsSync(PROFILE_FILE)) {
            const data = JSON.parse(nodeFs.readFileSync(PROFILE_FILE, 'utf-8'));
            userProfile = { ...DEFAULT_PROFILE, ...data };
        }
    } catch {}
}
function saveProfile() {
    try { nodeFs.writeFileSync(PROFILE_FILE, JSON.stringify(userProfile, null, 2)); } catch {}
}

let currentInlineTip: any = null;
let tipCooldown = false;

// ── Study System State ──
let quizQuestions: any[] = [];
let quizIndex = 0;
let quizAnswered = false;
let quizScore = { correct: 0, total: 0 };
let quizMode: 'multiple-choice' | 'fill-in' = 'multiple-choice';
let flashcards: { front: string; back: string }[] = [];
let fcIndex = 0;
let studyNotes: string = '';
let currentCodeHint: any = null;
let codeHelperDismissed: Set<string> = new Set();
let lastHintLine = -1;

// ── User Settings (persisted) ──
interface UserSettings {
    fontSize: number;
    accentColor: string;
    bgDark: string;
    bgMain: string;
    bgPanel: string;
    bgSidebar: string;
    editorBg: string;
    textColor: string;
    textDim: string;
    fancyEffects: boolean;
    // AI settings
    aiProvider: 'anthropic' | 'openai' | 'local' | 'custom';
    aiApiKey: string;
    aiEndpoint: string;
    aiModel: string;
    aiSystemPrompt: string;
    aiAutoErrors: boolean;
    aiInlineSuggest: boolean;
    aiFileContext: boolean;
}
const DEFAULT_SETTINGS: UserSettings = {
    fontSize: 14,
    accentColor: '#4ec9b0',
    bgDark: '#181818',
    bgMain: '#1e1e1e',
    bgPanel: '#1e1e1e',
    bgSidebar: '#252526',
    editorBg: '#1e1e1e',
    textColor: '#cccccc',
    textDim: '#858585',
    fancyEffects: true,
    aiProvider: 'anthropic',
    aiApiKey: '',
    aiEndpoint: '',
    aiModel: 'auto',
    aiSystemPrompt: '',
    aiAutoErrors: true,
    aiInlineSuggest: false,
    aiFileContext: true,
};
let userSettings: UserSettings = { ...DEFAULT_SETTINGS };
const SETTINGS_FILE = nodePath.join(nodeOs.homedir(), '.nexia-ide-prefs.json');

function loadUserSettings() {
    try {
        if (nodeFs.existsSync(SETTINGS_FILE)) {
            const data = JSON.parse(nodeFs.readFileSync(SETTINGS_FILE, 'utf-8'));
            userSettings = { ...DEFAULT_SETTINGS, ...data };
            // Migrate old default colors to new darker palette
            const OLD_DEFAULTS: Record<string, string> = {
                bgDark: '#0d0d1a', bgMain: '#1a1a2e', bgPanel: '#16213e',
                bgSidebar: '#0f1526', editorBg: '#1a1a2e', textDim: '#8888aa',
                // Also migrate v2 dark defaults
                // bgDark: '#06060f' etc already handled by spread with new DEFAULT_SETTINGS
            };
            let migrated = false;
            for (const [key, oldVal] of Object.entries(OLD_DEFAULTS)) {
                if ((userSettings as any)[key] === oldVal) {
                    (userSettings as any)[key] = (DEFAULT_SETTINGS as any)[key];
                    migrated = true;
                }
            }
            if (migrated) saveUserSettings();
        }
    } catch {}
}

function saveUserSettings() {
    try { nodeFs.writeFileSync(SETTINGS_FILE, JSON.stringify(userSettings, null, 2)); } catch {}
}

function applyThemeColors() {
    const r = document.documentElement.style;
    r.setProperty('--green', userSettings.accentColor);
    // Compute dim/bg variants from accent
    r.setProperty('--green-dark', shiftColor(userSettings.accentColor, -20));
    r.setProperty('--green-dim', shiftColor(userSettings.accentColor, -60));
    r.setProperty('--green-bright', shiftColor(userSettings.accentColor, 30));
    r.setProperty('--green-bg', userSettings.accentColor + '14');
    r.setProperty('--green-bg-hover', userSettings.accentColor + '26');
    r.setProperty('--green-glow', userSettings.accentColor + '28');
    r.setProperty('--green-glow-strong', userSettings.accentColor + '55');
    r.setProperty('--green-glow-soft', userSettings.accentColor + '10');
    r.setProperty('--bg-dark', userSettings.bgDark);
    r.setProperty('--bg-base', userSettings.bgMain);
    r.setProperty('--bg-main', userSettings.bgMain);
    r.setProperty('--bg-panel', userSettings.bgPanel);
    r.setProperty('--bg-sidebar', userSettings.bgSidebar);
    r.setProperty('--bg-titlebar', shiftColor(userSettings.bgMain, 20));
    r.setProperty('--bg-activitybar', shiftColor(userSettings.bgSidebar, 14));
    r.setProperty('--bg-tab', shiftColor(userSettings.bgMain, 15));
    r.setProperty('--bg-tab-active', userSettings.bgMain);
    r.setProperty('--bg-elevated', shiftColor(userSettings.bgMain, 15));
    r.setProperty('--bg-input', shiftColor(userSettings.bgMain, 20));
    r.setProperty('--bg-hover', shiftColor(userSettings.bgMain, 12));
    r.setProperty('--bg-active', shiftColor(userSettings.bgMain, 25));
    r.setProperty('--text', userSettings.textColor);
    r.setProperty('--text-bright', shiftColor(userSettings.textColor, 30));
    r.setProperty('--text-dim', userSettings.textDim);
    r.setProperty('--text-muted', shiftColor(userSettings.textDim, -40));

    // Update Monaco editor theme if loaded
    const monaco = (window as any).monaco;
    if (monaco && editor) {
        monaco.editor.defineTheme('nexia-dark', {
            base: 'vs-dark', inherit: true,
            rules: [
                { token: 'comment', foreground: '6a9955' },
                { token: 'keyword', foreground: '569cd6' },
                { token: 'string', foreground: 'ce9178' },
                { token: 'number', foreground: 'b5cea8' },
                { token: 'type', foreground: '4ec9b0' },
                { token: 'function', foreground: 'dcdcaa' },
                { token: 'variable', foreground: '9cdcfe' },
                { token: 'preprocessor', foreground: 'c586c0' },
            ],
            colors: {
                'editor.background': userSettings.editorBg,
                'editor.foreground': userSettings.textColor,
                'editorLineNumber.foreground': userSettings.textDim,
                'editorLineNumber.activeForeground': userSettings.accentColor,
                'editor.selectionBackground': '#264f78',
                'editor.lineHighlightBackground': shiftColor(userSettings.editorBg, 10),
                'editorCursor.foreground': userSettings.accentColor,
                'editorSuggestWidget.background': userSettings.bgPanel,
                'editorSuggestWidget.border': '#3c3c3c',
            },
        });
        monaco.editor.setTheme('nexia-dark');
    }
}

function applyFancyMode() {
    document.body.classList.toggle('fancy', userSettings.fancyEffects);
}

function shiftColor(hex: string, amount: number): string {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    const r = Math.max(0, Math.min(255, parseInt(hex.substring(0,2), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(hex.substring(2,4), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(hex.substring(4,6), 16) + amount));
    return '#' + [r,g,b].map(c => c.toString(16).padStart(2,'0')).join('');
}

// ── DOM ──
const $ = (id: string) => document.getElementById(id)!;
const $$ = (sel: string) => document.querySelectorAll(sel);

// ══════════════════════════════════════
//  TITLE BAR
// ══════════════════════════════════════
$('btn-minimize').addEventListener('click', () => ipcRenderer.send(IPC.APP_MINIMIZE));
$('btn-maximize').addEventListener('click', () => ipcRenderer.send(IPC.APP_MAXIMIZE));
$('btn-close').addEventListener('click', () => confirmUnsavedAndClose());

// ══════════════════════════════════════
//  MENU BAR
// ══════════════════════════════════════
let openMenu: HTMLElement | null = null;

function closeAllMenus() {
    $$('.menu-item').forEach(m => m.classList.remove('open'));
    openMenu = null;
}

$$('.menu-item').forEach(item => {
    const el = item as HTMLElement;
    el.querySelector('.menu-label')!.addEventListener('click', (e) => {
        e.stopPropagation();
        if (el.classList.contains('open')) {
            closeAllMenus();
        } else {
            closeAllMenus();
            el.classList.add('open');
            openMenu = el;
        }
    });
    // Hover to switch menus while one is open
    el.addEventListener('mouseenter', () => {
        if (openMenu && openMenu !== el) {
            closeAllMenus();
            el.classList.add('open');
            openMenu = el;
        }
    });
});

document.addEventListener('click', () => closeAllMenus());

// Wire up menu actions
function menuAction(id: string, fn: () => void) {
    $(id)?.addEventListener('click', () => { closeAllMenus(); fn(); });
}

menuAction('menu-new-project', () => showNewProjectDialog());
menuAction('menu-open-project', () => openProject());
menuAction('menu-new-file', () => { if (currentProject) inlineCreateItem('file'); else showNewFileDialog(); });
menuAction('menu-save', () => saveCurrentFile());
menuAction('menu-save-all', () => saveAllFiles());
menuAction('menu-close-tab', () => { if (activeTab) closeTab(activeTab); });
menuAction('menu-close-all', () => closeAllTabs());
menuAction('menu-exit', () => confirmUnsavedAndClose());
menuAction('menu-undo', () => { if (editor) editor.trigger('menu', 'undo', null); });
menuAction('menu-redo', () => { if (editor) editor.trigger('menu', 'redo', null); });
menuAction('menu-find', () => { if (editor) editor.trigger('menu', 'actions.find', null); });
menuAction('menu-find-files', () => openFindInFiles());
menuAction('menu-replace', () => { if (editor) editor.trigger('menu', 'editor.action.startFindReplaceAction', null); });
menuAction('menu-goto-line', () => showGoToLine());
menuAction('menu-build', () => doBuild());
menuAction('menu-rebuild', () => doRebuild());
menuAction('menu-clean', () => doClean());
menuAction('menu-deploy', () => $('btn-deploy').click());
menuAction('menu-toggle-sidebar', () => toggleSidebar());
menuAction('menu-toggle-output', () => toggleBottomPanel());
menuAction('menu-extensions', () => {
    // Switch to extensions sidebar tab
    const tab = document.querySelector('.sidebar-tab[data-panel="extensions"]') as HTMLElement;
    if (tab) tab.click();
});
menuAction('menu-sdk-tools', () => showSdkToolsDialog());
menuAction('menu-xex-inspector', () => openXexInspector());
menuAction('menu-settings', () => showSettingsPanel());

// ══════════════════════════════════════
//  SIDEBAR TABS
// ══════════════════════════════════════
$$('.sidebar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        $$('.sidebar-tab').forEach(t => t.classList.remove('active'));
        $$('.sidebar-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        $(`panel-${(tab as HTMLElement).dataset.panel}`).classList.add('active');
        // Refresh dynamic panels
        const panel = (tab as HTMLElement).dataset.panel;
        if (panel === 'study') renderStudyPanel();
        if (panel === 'learn') renderLearnPanel();
        if (panel === 'extensions') renderExtensionsPanel();
        if (panel === 'search') setTimeout(() => ($('search-query') as HTMLInputElement).focus(), 50);
    });
});

// ══════════════════════════════════════
//  BOTTOM PANEL TABS + CLOSE
// ══════════════════════════════════════
$$('.bottom-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        $$('.bottom-tab').forEach(t => t.classList.remove('active'));
        $$('.bottom-pane').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        $(`${(tab as HTMLElement).dataset.panel}-panel`).classList.add('active');
        // Refresh tips when switching to tips tab
        if ((tab as HTMLElement).dataset.panel === 'tips') renderTipsPanel();
    });
});

$('btn-close-bottom').addEventListener('click', () => toggleBottomPanel());
$('btn-clear-output').addEventListener('click', () => clearOutput());

function toggleBottomPanel() {
    bottomPanelVisible = !bottomPanelVisible;
    $('bottom-panel').classList.toggle('hidden', !bottomPanelVisible);
    $('bottom-resize').classList.toggle('hidden', !bottomPanelVisible);
    $('main').classList.toggle('bottom-hidden', !bottomPanelVisible);
    if (editor) editor.layout();
}

function showBottomPanel() {
    if (!bottomPanelVisible) toggleBottomPanel();
}

function toggleSidebar() {
    sidebarVisible = !sidebarVisible;
    $('sidebar').classList.toggle('hidden', !sidebarVisible);
    $('sidebar-resize').style.display = sidebarVisible ? '' : 'none';
    if (editor) editor.layout();
}

// ══════════════════════════════════════
//  RESIZE HANDLES
// ══════════════════════════════════════
{
    const handle = $('sidebar-resize');
    const sidebar = $('sidebar');
    let resizing = false;
    handle.addEventListener('mousedown', (e) => { resizing = true; document.body.style.cursor = 'col-resize'; e.preventDefault(); });
    document.addEventListener('mousemove', (e) => {
        if (!resizing) return;
        sidebar.style.width = Math.max(180, Math.min(500, e.clientX)) + 'px';
        if (editor) editor.layout();
    });
    document.addEventListener('mouseup', () => { resizing = false; document.body.style.cursor = ''; });
}
{
    const handle = $('bottom-resize');
    const panel = $('bottom-panel');
    let resizing = false;
    handle.addEventListener('mousedown', (e) => { resizing = true; document.body.style.cursor = 'row-resize'; e.preventDefault(); });
    document.addEventListener('mousemove', (e) => {
        if (!resizing) return;
        const h = Math.max(100, Math.min(500, window.innerHeight - e.clientY - 24));
        panel.style.height = h + 'px';
        document.documentElement.style.setProperty('--bottom-h', h + 'px');
        if (editor) editor.layout();
    });
    document.addEventListener('mouseup', () => { resizing = false; document.body.style.cursor = ''; });
}

// ══════════════════════════════════════
//  MONACO EDITOR
// ══════════════════════════════════════
function initMonaco() {
    let monacoBase = '';
    const candidates = [
        nodePath.join(__dirname, '..', '..', 'node_modules', 'monaco-editor', 'min', 'vs'),
        nodePath.join(__dirname, '..', 'node_modules', 'monaco-editor', 'min', 'vs'),
        nodePath.join(process.resourcesPath || '', 'app.asar', 'node_modules', 'monaco-editor', 'min', 'vs'),
        nodePath.join(process.resourcesPath || '', 'app', 'node_modules', 'monaco-editor', 'min', 'vs'),
    ];

    for (const c of candidates) {
        try { if (nodeFs.existsSync(nodePath.join(c, 'loader.js'))) { monacoBase = c; break; } } catch {}
    }

    if (!monacoBase) {
        appendOutput('Error: Monaco editor not found. Tried:\n' + candidates.join('\n') + '\n');
        monacoResolve();
        return;
    }

    appendOutput('Loading editor from: ' + monacoBase + '\n');
    const monacoUrl = monacoBase.replace(/\\/g, '/');

    // CRITICAL: Use ASSIGNMENT (not delete) to override Node.js globals.
    // delete silently fails on Electron's non-configurable properties.
    // All require() calls above have already executed so this is safe.
    const savedRequire = (window as any).require;
    const savedExports = (window as any).exports;
    const savedModule = (window as any).module;
    (window as any).require = undefined;
    (window as any).exports = undefined;
    (window as any).module = undefined;

    const script = document.createElement('script');
    script.src = `file:///${monacoUrl}/loader.js`;

    script.onload = () => {
        const amdRequire = (window as any).require;
        if (!amdRequire || !amdRequire.config) {
            appendOutput('Error: Monaco AMD loader failed. typeof require = ' + typeof (window as any).require + '\n');
            (window as any).require = savedRequire;
            (window as any).exports = savedExports;
            (window as any).module = savedModule;
            monacoResolve();
            return;
        }
        amdRequire.config({
            paths: { vs: `file:///${monacoUrl}` },
            'vs/nls': { availableLanguages: { '*': '' } }
        });
        amdRequire(['vs/editor/editor.main'], () => {
            appendOutput('Editor loaded successfully.\n');
            createEditor();
        }, (err: any) => {
            appendOutput('Error loading Monaco modules: ' + JSON.stringify(err) + '\n');
            monacoResolve();
        });
    };

    script.onerror = (e: any) => {
        appendOutput('Error: Failed to load Monaco loader script.\nURL: file:///' + monacoUrl + '/loader.js\n');
        (window as any).require = savedRequire;
        (window as any).exports = savedExports;
        (window as any).module = savedModule;
        monacoResolve();
    };

    document.head.appendChild(script);
}

function createEditor() {
    const monaco = (window as any).monaco;

    monaco.editor.defineTheme('nexia-dark', {
        base: 'vs-dark', inherit: true,
        rules: [
            { token: 'comment', foreground: '6a9955' },
            { token: 'keyword', foreground: '569cd6' },
            { token: 'string', foreground: 'ce9178' },
            { token: 'number', foreground: 'b5cea8' },
            { token: 'type', foreground: '4ec9b0' },
            { token: 'function', foreground: 'dcdcaa' },
            { token: 'variable', foreground: '9cdcfe' },
            { token: 'preprocessor', foreground: 'c586c0' },
        ],
        colors: {
            'editor.background': userSettings.editorBg,
            'editor.foreground': userSettings.textColor,
            'editorLineNumber.foreground': userSettings.textDim,
            'editorLineNumber.activeForeground': userSettings.accentColor,
            'editor.selectionBackground': '#264f78',
            'editor.lineHighlightBackground': shiftColor(userSettings.editorBg, 10),
            'editorCursor.foreground': userSettings.accentColor,
            'editorSuggestWidget.background': userSettings.bgPanel,
            'editorSuggestWidget.border': '#3c3c3c',
        },
    });

    editor = monaco.editor.create($('editor-container'), {
        value: '', language: 'cpp', theme: 'nexia-dark',
        fontSize: userSettings.fontSize, fontFamily: "'Cascadia Code', 'Consolas', monospace",
        lineNumbers: 'on', minimap: { enabled: true },
        scrollBeyondLastLine: false, automaticLayout: true,
        tabSize: 4, renderWhitespace: 'selection', wordWrap: 'off',
        suggestOnTriggerCharacters: true,
    });

    editor.onDidChangeCursorPosition((e: any) => {
        $('status-line').textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
    });

    editor.onDidChangeModelContent(() => {
        if (activeTab) {
            const tab = openTabs.find(t => t.path === activeTab);
            if (tab && !tab.modified) { tab.modified = true; renderTabs(); }
        }
    });

    // Editor font zoom
    let fontSize = userSettings.fontSize || 14;
    editor.updateOptions({ fontSize });
    $('status-zoom').textContent = `${Math.round((fontSize / 14) * 100)}%`;

    registerXbox360Completions(monaco);
    initCodeHelper();

    // ── AI integration with Monaco editor ──
    // Add right-click context menu actions
    editor.addAction({
        id: 'nexia-ai-ask',
        label: '🤖 Ask AI about this code',
        contextMenuGroupId: '9_ai',
        contextMenuOrder: 1,
        run: () => {
            const sel = editor.getModel()?.getValueInRange(editor.getSelection());
            switchToAIPanel();
            if (sel) setAIContext(sel);
            ($('ai-input') as HTMLTextAreaElement).focus();
        },
    });
    editor.addAction({
        id: 'nexia-ai-explain',
        label: '📖 Explain this code',
        contextMenuGroupId: '9_ai',
        contextMenuOrder: 2,
        precondition: 'editorHasSelection',
        run: () => {
            const sel = editor.getModel()?.getValueInRange(editor.getSelection());
            if (sel) { switchToAIPanel(); sendAIMessage('Explain this code in detail:', sel); }
        },
    });
    editor.addAction({
        id: 'nexia-ai-fix',
        label: '🔧 Fix / improve this code',
        contextMenuGroupId: '9_ai',
        contextMenuOrder: 3,
        precondition: 'editorHasSelection',
        run: () => {
            const sel = editor.getModel()?.getValueInRange(editor.getSelection());
            if (sel) { switchToAIPanel(); sendAIMessage('Fix any bugs and suggest improvements:', sel); }
        },
    });
    editor.addAction({
        id: 'nexia-ai-generate',
        label: '⚡ Generate code here',
        contextMenuGroupId: '9_ai',
        contextMenuOrder: 4,
        run: () => { switchToAIPanel(); switchAIMode('generate'); ($('ai-gen-prompt') as HTMLTextAreaElement).focus(); },
    });

    // Inline AI suggestions trigger (fires on content change with debounce)
    editor.onDidChangeModelContent(() => {
        if (userSettings.aiInlineSuggest) triggerInlineSuggestion();
    });

    appendOutput('Editor ready.\n');
    monacoResolve();
}

function registerXbox360Completions(monaco: any) {
    monaco.languages.registerCompletionItemProvider('cpp', {
        provideCompletionItems: () => {
            const s = [
                { label: 'XOVERLAPPED', kind: 6, insertText: 'XOVERLAPPED', detail: 'Xbox async op' },
                { label: 'XINPUT_STATE', kind: 6, insertText: 'XINPUT_STATE', detail: 'Gamepad state' },
                { label: 'XInputGetState', kind: 1, insertText: 'XInputGetState(${1:dwUserIndex}, ${2:&state})', insertTextRules: 4, detail: 'Get gamepad state' },
                { label: 'Direct3DCreate9', kind: 1, insertText: 'Direct3DCreate9(D3D_SDK_VERSION)', detail: 'Create D3D9' },
                { label: '#include <xtl.h>', kind: 14, insertText: '#include <xtl.h>', detail: 'Xbox Top-Level' },
                { label: '#include <xam.h>', kind: 14, insertText: '#include <xam.h>', detail: 'Xbox App Model' },
                { label: '#include <d3d9.h>', kind: 14, insertText: '#include <d3d9.h>', detail: 'Direct3D 9' },
                { label: '#include <d3dx9.h>', kind: 14, insertText: '#include <d3dx9.h>', detail: 'D3DX9 utility' },
                { label: '#include <xui.h>', kind: 14, insertText: '#include <xui.h>', detail: 'Xbox UI' },
                { label: '#include <xonline.h>', kind: 14, insertText: '#include <xonline.h>', detail: 'Xbox Live' },
            ];
            return { suggestions: s };
        },
    });
}

// ══════════════════════════════════════
//  FILE OPERATIONS
// ══════════════════════════════════════
async function openFile(filePath: string) {
    await monacoReady;

    if (!editor) {
        appendOutput('Editor not available. Cannot open file.\n');
        return;
    }

    const existing = openTabs.find(t => t.path === filePath);
    if (existing) { switchToTab(filePath); return; }

    try {
        const content = await ipcRenderer.invoke(IPC.FILE_READ, filePath);
        const ext = nodePath.extname(filePath).toLowerCase();
        const langMap: Record<string, string> = {
            '.cpp': 'cpp', '.c': 'cpp', '.cc': 'cpp', '.cxx': 'cpp',
            '.h': 'cpp', '.hpp': 'cpp', '.hxx': 'cpp',
            '.hlsl': 'hlsl', '.fx': 'hlsl', '.vsh': 'hlsl', '.psh': 'hlsl',
            '.xml': 'xml', '.xui': 'xml', '.xur': 'xml',
            '.json': 'json', '.md': 'markdown', '.txt': 'plaintext',
            '.bat': 'bat', '.cmd': 'bat', '.py': 'python',
            '.js': 'javascript', '.ts': 'typescript',
        };

        const lang = langMap[ext] || 'plaintext';
        const monaco = (window as any).monaco;
        const model = monaco.editor.createModel(content, lang);

        openTabs.push({ path: filePath, name: nodePath.basename(filePath), model, modified: false });
        switchToTab(filePath);
        $('status-language').textContent = lang.toUpperCase();
        onFileOpened(filePath);
    } catch (err: any) {
        appendOutput(`Error opening file: ${err.message}\n`);
    }
}

function switchToTab(filePath: string) {
    const tab = openTabs.find(t => t.path === filePath);
    if (!tab) return;
    activeTab = filePath;

    // Handle XEX Inspector tabs
    if (filePath.startsWith('__xex_inspector__:')) {
        $('editor-container').style.display = 'none';
        $('welcome-screen').style.display = 'none';
        if (xexInspectorContainer) xexInspectorContainer.style.display = 'block';
    } else {
        if (xexInspectorContainer) xexInspectorContainer.style.display = 'none';
        if (editor) editor.setModel(tab.model);
        $('editor-container').style.display = 'block';
        $('welcome-screen').style.display = 'none';
        updateBreadcrumb(filePath);
    }
    renderTabs();
}

function closeTab(filePath: string) {
    const idx = openTabs.findIndex(t => t.path === filePath);
    if (idx === -1) return;
    const tab = openTabs[idx];
    // Don't prompt save for XEX inspector tabs
    if (!filePath.startsWith('__xex_inspector__:') && tab.modified) {
        const save = confirm(`"${tab.name}" has unsaved changes. Save before closing?`);
        if (save) {
            ipcRenderer.invoke(IPC.FILE_WRITE, tab.path, tab.model.getValue());
        }
    }
    tab.model.dispose();
    openTabs.splice(idx, 1);
    if (activeTab === filePath) {
        // Hide XEX inspector if it was active
        if (xexInspectorContainer) xexInspectorContainer.style.display = 'none';
        if (openTabs.length > 0) {
            switchToTab(openTabs[Math.min(idx, openTabs.length - 1)].path);
        } else {
            activeTab = null;
            $('editor-container').style.display = 'none';
            $('welcome-screen').style.display = 'flex';
            updateBreadcrumb();
        }
    }
    renderTabs();
}

function closeAllTabs() {
    for (const tab of openTabs) tab.model.dispose();
    openTabs = [];
    activeTab = null;
    $('editor-container').style.display = 'none';
    if (xexInspectorContainer) xexInspectorContainer.style.display = 'none';
    $('welcome-screen').style.display = 'flex';
    updateBreadcrumb();
    renderTabs();
}

function renderTabs() {
    const bar = $('tab-bar');
    bar.innerHTML = '';
    for (const tab of openTabs) {
        const el = document.createElement('div');
        el.className = `editor-tab${tab.path === activeTab ? ' active' : ''}`;
        el.innerHTML = `<span class="${tab.modified ? 'tab-modified' : ''}">${tab.modified ? '● ' : ''}${tab.name}</span><button class="tab-close">✕</button>`;
        el.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).classList.contains('tab-close')) closeTab(tab.path);
            else switchToTab(tab.path);
        });
        bar.appendChild(el);
    }
}

// ══════════════════════════════════════
//  XEX INSPECTOR
// ══════════════════════════════════════
let xexInspectorContainer: HTMLElement | null = null;

async function openXexInspector(xexPath?: string) {
    try {
        const data = await ipcRenderer.invoke(IPC.XEX_INSPECT, xexPath || undefined);
        if (!data) return; // User cancelled
        showXexInspector(data);
    } catch (err: any) {
        appendOutput(`XEX Inspector error: ${err.message}\n`);
    }
}

function showXexInspector(data: any) {
    // Create or reuse the inspector container
    if (!xexInspectorContainer) {
        xexInspectorContainer = document.createElement('div');
        xexInspectorContainer.id = 'xex-inspector';
        $('editor-area').appendChild(xexInspectorContainer);
    }

    // Add as a pseudo-tab
    const tabPath = `__xex_inspector__:${data.filePath || 'xex'}`;
    const existing = openTabs.find(t => t.path === tabPath);
    if (existing) {
        switchToXexTab(tabPath, data);
        return;
    }

    // Create a dummy model (won't be used by Monaco)
    const monaco = (window as any).monaco;
    const model = monaco?.editor?.createModel?.('', 'plaintext') || { dispose: () => {}, getValue: () => '' };

    openTabs.push({ path: tabPath, name: `🔍 ${data.fileName || 'XEX Inspector'}`, model, modified: false });
    switchToXexTab(tabPath, data);
}

function switchToXexTab(tabPath: string, data: any) {
    activeTab = tabPath;
    // Hide Monaco editor, show XEX inspector
    $('editor-container').style.display = 'none';
    $('welcome-screen').style.display = 'none';
    if (xexInspectorContainer) {
        xexInspectorContainer.style.display = 'block';
        xexInspectorContainer.innerHTML = renderXexInspectorHtml(data);
        // Attach drag-drop handler
        setupXexDropZone();
    }
    renderTabs();
}

function setupXexDropZone() {
    const dropZone = document.getElementById('xex-drop-zone');
    if (!dropZone) return;
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('xex-drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('xex-drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('xex-drag-over');
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (file.path) openXexInspector(file.path);
        }
    });
}

function renderXexInspectorHtml(data: any): string {
    if (data.error && !data.valid) {
        return `
        <div class="xex-inspector-content">
            <div class="xex-header-bar">
                <h2>🔍 XEX Inspector</h2>
                <span class="xex-file-path">${escHtml(data.filePath || '')}</span>
            </div>
            <div id="xex-drop-zone" class="xex-drop-zone">
                <div class="xex-drop-icon">📦</div>
                <div class="xex-drop-text">Drop a .xex file here to inspect</div>
                <div class="xex-drop-hint">or use View → Inspect XEX...</div>
            </div>
            <div class="xex-error-box">⚠ ${escHtml(data.error)}</div>
        </div>`;
    }

    let html = `<div class="xex-inspector-content">`;

    // Header bar
    html += `<div class="xex-header-bar">
        <h2>🔍 XEX Inspector</h2>
        <div id="xex-drop-zone" class="xex-drop-zone xex-drop-zone-mini">
            <span>📦 Drop another .xex here</span>
        </div>
    </div>`;

    // File overview
    html += `<div class="xex-section">
        <div class="xex-section-title">📄 File Overview</div>
        <div class="xex-info-grid">
            <div class="xex-info-row"><span class="xex-label">File</span><span class="xex-value">${escHtml(data.fileName)}</span></div>
            <div class="xex-info-row"><span class="xex-label">Path</span><span class="xex-value xex-path">${escHtml(data.filePath)}</span></div>
            <div class="xex-info-row"><span class="xex-label">Size</span><span class="xex-value">${escHtml(data.fileSizeFormatted)} (${data.fileSize?.toLocaleString()} bytes)</span></div>
            <div class="xex-info-row"><span class="xex-label">Format</span><span class="xex-value xex-tag xex-tag-ok">${escHtml(data.header?.magic || '?')}</span></div>`;

    if (data.header?.originalPeName) {
        html += `<div class="xex-info-row"><span class="xex-label">Original PE</span><span class="xex-value">${escHtml(data.header.originalPeName)}</span></div>`;
    }
    if (data.header?.peTimestamp) {
        html += `<div class="xex-info-row"><span class="xex-label">PE Timestamp</span><span class="xex-value">${escHtml(data.header.peTimestamp)}</span></div>`;
    }
    if (data.header?.moduleFlagsDecoded?.length > 0) {
        html += `<div class="xex-info-row"><span class="xex-label">Module Flags</span><span class="xex-value">${data.header.moduleFlagsDecoded.map((f: string) => `<span class="xex-tag">${escHtml(f)}</span>`).join(' ')}</span></div>`;
    }
    html += `</div></div>`;

    // Execution info
    if (data.executionInfo && Object.keys(data.executionInfo).length > 0) {
        html += `<div class="xex-section">
            <div class="xex-section-title">⚡ Execution Info</div>
            <div class="xex-info-grid">`;
        if (data.executionInfo.titleId) html += `<div class="xex-info-row"><span class="xex-label">Title ID</span><span class="xex-value xex-mono">${escHtml(data.executionInfo.titleId)}</span></div>`;
        if (data.executionInfo.mediaId) html += `<div class="xex-info-row"><span class="xex-label">Media ID</span><span class="xex-value xex-mono">${escHtml(data.executionInfo.mediaId)}</span></div>`;
        if (data.executionInfo.version) html += `<div class="xex-info-row"><span class="xex-label">Version</span><span class="xex-value">${escHtml(data.executionInfo.version)}</span></div>`;
        if (data.executionInfo.baseVersion) html += `<div class="xex-info-row"><span class="xex-label">Base Version</span><span class="xex-value">${escHtml(data.executionInfo.baseVersion)}</span></div>`;
        if (data.executionInfo.entryPoint) html += `<div class="xex-info-row"><span class="xex-label">Entry Point</span><span class="xex-value xex-mono">${escHtml(data.executionInfo.entryPoint)}</span></div>`;
        if (data.executionInfo.imageBaseAddress) html += `<div class="xex-info-row"><span class="xex-label">Image Base</span><span class="xex-value xex-mono">${escHtml(data.executionInfo.imageBaseAddress)}</span></div>`;
        if (data.executionInfo.discNumber) html += `<div class="xex-info-row"><span class="xex-label">Disc</span><span class="xex-value">${data.executionInfo.discNumber} of ${data.executionInfo.discCount}</span></div>`;
        html += `</div></div>`;
    }

    // Sections
    if (data.sections?.length > 0) {
        html += `<div class="xex-section">
            <div class="xex-section-title">📦 PE Sections (${data.sections.length})</div>
            <table class="xex-table">
                <thead><tr><th>Name</th><th>Virtual Addr</th><th>Virtual Size</th><th>Raw Size</th><th>Characteristics</th></tr></thead>
                <tbody>`;
        for (const sec of data.sections) {
            const chars = sec.characteristics?.join(', ') || '';
            html += `<tr>
                <td class="xex-mono">${escHtml(sec.name)}</td>
                <td class="xex-mono">${escHtml(sec.virtualAddress)}</td>
                <td>${escHtml(sec.virtualSizeFormatted)}</td>
                <td>${escHtml(sec.rawDataSizeFormatted)}</td>
                <td><span class="xex-chars">${escHtml(chars)}</span></td>
            </tr>`;
        }
        html += `</tbody></table></div>`;
    }

    // Imports
    if (data.imports?.length > 0) {
        html += `<div class="xex-section">
            <div class="xex-section-title">📥 Import Libraries (${data.imports.length})</div>
            <div class="xex-imports-list">`;
        for (const imp of data.imports) {
            html += `<div class="xex-import-item"><span class="xex-mono">${escHtml(imp.library)}</span></div>`;
        }
        html += `</div></div>`;
    }

    // Resources
    if (data.resources?.length > 0) {
        html += `<div class="xex-section">
            <div class="xex-section-title">🗂 Resources (${data.resources.length})</div>
            <table class="xex-table">
                <thead><tr><th>Name</th><th>Address</th><th>Size</th></tr></thead>
                <tbody>`;
        for (const res of data.resources) {
            html += `<tr>
                <td class="xex-mono">${escHtml(res.name)}</td>
                <td class="xex-mono">${escHtml(res.address)}</td>
                <td>${escHtml(res.sizeFormatted)}</td>
            </tr>`;
        }
        html += `</tbody></table></div>`;
    }

    // Optional headers (collapsible raw view)
    if (data.optionalHeaders?.length > 0) {
        html += `<div class="xex-section">
            <div class="xex-section-title xex-collapsible" onclick="this.parentElement.classList.toggle('xex-collapsed')">
                ▶ Optional Headers (${data.optionalHeaders.length})
            </div>
            <table class="xex-table xex-collapsible-body">
                <thead><tr><th>ID</th><th>Name</th><th>Data</th></tr></thead>
                <tbody>`;
        for (const h of data.optionalHeaders) {
            const extra = h.value ? ` → ${typeof h.value === 'string' ? escHtml(h.value) : h.valueFormatted || h.value}` : '';
            html += `<tr>
                <td class="xex-mono">${escHtml(h.idHex)}</td>
                <td>${escHtml(h.name)}</td>
                <td class="xex-mono">${escHtml(h.dataHex)}${extra}</td>
            </tr>`;
        }
        html += `</tbody></table></div>`;
    }

    // Security info
    if (data.securityInfo?.imageSize) {
        html += `<div class="xex-section">
            <div class="xex-section-title">🔒 Security Info</div>
            <div class="xex-info-grid">
                <div class="xex-info-row"><span class="xex-label">Image Size</span><span class="xex-value">${escHtml(data.securityInfo.imageSizeFormatted)}</span></div>
            </div>
        </div>`;
    }

    html += `</div>`;
    return html;
}

function escHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ══════════════════════════════════════
//  SAVE
// ══════════════════════════════════════
async function saveCurrentFile() {
    if (!activeTab) return;
    const tab = openTabs.find(t => t.path === activeTab);
    if (!tab) return;
    await ipcRenderer.invoke(IPC.FILE_WRITE, tab.path, tab.model.getValue());
    tab.modified = false;
    renderTabs();
    appendOutput(`Saved: ${tab.name}\n`);
}

async function saveAllFiles(silent = false) {
    let saved = 0;
    for (const tab of openTabs) {
        if (tab.modified) {
            await ipcRenderer.invoke(IPC.FILE_WRITE, tab.path, tab.model.getValue());
            tab.modified = false;
            saved++;
        }
    }
    renderTabs();
    if (!silent && saved > 0) appendOutput(`Saved ${saved} file${saved > 1 ? 's' : ''}.\n`);
}

// ══════════════════════════════════════
//  FILE TREE
// ══════════════════════════════════════
async function refreshFileTree() {
    const tree = await ipcRenderer.invoke(IPC.FILE_LIST);
    const container = $('file-tree');
    container.innerHTML = '';

    if (!currentProject) {
        renderFileTree(tree, container, 0);
        return;
    }

    // ── Project root node (like VS Solution Explorer) ──
    const rootNode = document.createElement('div');
    rootNode.className = 'project-root-node';
    rootNode.innerHTML = `<span class="tree-arrow expanded">▶</span><span class="project-root-icon">🎮</span><span>${currentProject.name}</span>`;

    const rootChildren = document.createElement('div');
    rootChildren.className = 'tree-children open';

    rootNode.addEventListener('click', () => {
        rootChildren.classList.toggle('open');
        const arrow = rootNode.querySelector('.tree-arrow')!;
        arrow.classList.toggle('expanded');
    });

    // Right-click on project root
    rootNode.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, [
            { label: 'New File...', action: () => inlineCreateItem('file') },
            { label: 'New Folder...', action: () => inlineCreateItem('folder') },
            { label: '─', action: () => {} },
            { label: 'Add Existing File...', action: () => addExistingFile() },
            { label: 'Upload Document...', action: () => uploadDocument() },
            { label: '─', action: () => {} },
            { label: 'Refresh', action: () => refreshFileTree() },
            { label: '─', action: () => {} },
            { label: 'Open in Explorer', action: () => { shell.openPath(currentProject.path); } },
        ]);
    });

    container.appendChild(rootNode);

    // ── Build virtual "Header Files" and "Source Files" groups ──
    const HEADER_EXTS = new Set(['.h', '.hpp', '.hxx', '.inl']);
    const SOURCE_EXTS = new Set(['.cpp', '.c', '.cc', '.cxx']);
    const headerFiles: any[] = [];
    const sourceFiles: any[] = [];
    const otherNodes: any[] = [];

    // Collect all files recursively from the tree
    function collectFiles(nodes: any[], inSourceDir: boolean = false) {
        for (const node of nodes) {
            if (node.isDirectory) {
                const lname = node.name.toLowerCase();
                // Flatten include/ and src/ directories — their contents go into virtual groups
                if (lname === 'include' || lname === 'src' || inSourceDir) {
                    if (node.children) collectFiles(node.children, true);
                } else {
                    otherNodes.push(node);
                }
            } else {
                const ext = (node.extension || '').toLowerCase();
                if (HEADER_EXTS.has(ext)) {
                    headerFiles.push(node);
                } else if (SOURCE_EXTS.has(ext)) {
                    sourceFiles.push(node);
                } else {
                    otherNodes.push(node);
                }
            }
        }
    }
    collectFiles(tree);

    // Render "Header Files" virtual folder
    if (headerFiles.length > 0) {
        const vfolder = createVirtualFolder('Header Files', '📋', headerFiles, 1);
        rootChildren.appendChild(vfolder);
    }

    // Render "Source Files" virtual folder
    if (sourceFiles.length > 0) {
        const vfolder = createVirtualFolder('Source Files', '📄', sourceFiles, 1);
        rootChildren.appendChild(vfolder);
    }

    // Render remaining nodes normally
    renderFileTree(otherNodes, rootChildren, 1, false);

    container.appendChild(rootChildren);
}

function createVirtualFolder(name: string, icon: string, files: any[], depth: number): HTMLElement {
    const wrapper = document.createElement('div');
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    wrapper.className = `virtual-folder virtual-folder-${slug}`;

    const header = document.createElement('div');
    header.className = 'tree-item';
    header.style.paddingLeft = (8 + depth * 16) + 'px';
    header.innerHTML = `<span class="tree-arrow">▶</span><span class="tree-icon">${icon}</span><span class="tree-name">${name}</span>`;

    const children = document.createElement('div');
    children.className = 'tree-children';

    header.addEventListener('click', () => {
        children.classList.toggle('open');
        const arrow = header.querySelector('.tree-arrow')! as HTMLElement;
        if (children.classList.contains('open')) {
            arrow.textContent = '▼'; arrow.classList.add('expanded');
        } else {
            arrow.textContent = '▶'; arrow.classList.remove('expanded');
        }
    });

    // Right-click on virtual folder
    header.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, [
            { label: 'New File...', action: () => inlineCreateItem('file') },
            { label: '─', action: () => {} },
            { label: 'Add Existing File...', action: () => addExistingFile() },
        ]);
    });

    // Render files inside
    for (const file of files) {
        const fi = document.createElement('div');
        fi.className = 'tree-item';
        fi.style.paddingLeft = (8 + (depth + 1) * 16 + 20) + 'px';
        fi.innerHTML = `<span class="tree-icon">${getFileIcon(file.extension || '')}</span><span class="tree-name">${file.name}</span>`;
        fi.addEventListener('click', () => openFile(file.path));
        fi.addEventListener('contextmenu', (e: MouseEvent) => {
            e.preventDefault();
            showContextMenu(e.clientX, e.clientY, [
                { label: 'Open', action: () => openFile(file.path) },
                { label: '─', action: () => {} },
                { label: 'Rename...', action: () => renameFile(file.path) },
                { label: 'Delete', action: () => deleteFile(file.path) },
                { label: '─', action: () => {} },
                { label: 'Copy Path', action: () => { navigator.clipboard.writeText(file.path); } },
                { label: 'Reveal in Explorer', action: () => { shell.showItemInFolder(file.path); } },
            ]);
        });
        fi.draggable = true;
        fi.addEventListener('dragstart', (e: DragEvent) => {
            e.dataTransfer!.setData('nexia/filepath', file.path);
            e.dataTransfer!.setData('nexia/isdir', 'false');
            e.dataTransfer!.effectAllowed = 'move';
            fi.classList.add('dragging');
        });
        fi.addEventListener('dragend', () => { fi.classList.remove('dragging'); });
        children.appendChild(fi);
    }

    wrapper.appendChild(header);
    wrapper.appendChild(children);
    return wrapper;
}

// Explorer action buttons
$('explorer-new-file').addEventListener('click', () => {
    if (!currentProject) { appendOutput('Open a project first.\n'); return; }
    inlineCreateItem('file');
});
$('explorer-new-folder').addEventListener('click', () => {
    if (!currentProject) { appendOutput('Open a project first.\n'); return; }
    inlineCreateItem('folder');
});
$('explorer-refresh').addEventListener('click', () => refreshFileTree());
$('explorer-collapse').addEventListener('click', () => {
    $('file-tree').querySelectorAll('.tree-children.open').forEach((el: Element) => {
        el.classList.remove('open');
        const arrow = el.previousElementSibling?.querySelector('.tree-arrow');
        if (arrow) { arrow.textContent = '▶'; arrow.classList.remove('expanded'); }
    });
});

/**
 * Inline creation — inserts a temporary editable tree item in the explorer.
 * On Enter the file/folder is actually created. On Escape/blur it is cancelled.
 */
function inlineCreateItem(kind: 'file' | 'folder') {
    // Remove any existing inline editor first
    document.querySelectorAll('.tree-inline-new').forEach(el => el.remove());

    // Decide where to insert the inline item and ensure the container is open
    let container: HTMLElement | null = null;
    if (kind === 'file') {
        // Put it inside the "Source Files" virtual folder children
        container = $('file-tree').querySelector('.virtual-folder-source-files .tree-children') as HTMLElement;
        if (container) {
            container.classList.add('open');
            const arrow = container.previousElementSibling?.querySelector('.tree-arrow') as HTMLElement;
            if (arrow) { arrow.textContent = '▼'; arrow.classList.add('expanded'); }
        }
    }
    if (!container) {
        // Fallback: put it inside the root children
        const rootChildren = $('file-tree').querySelector('.tree-children') as HTMLElement;
        container = rootChildren || $('file-tree');
    }

    const defaultName = kind === 'file' ? 'NewFile.cpp' : 'NewFolder';
    const icon = kind === 'file' ? '<span class="ficon ficon-cpp">C++</span>' : '📁';
    const depth = kind === 'file' ? 2 : 1;

    // Create the temporary inline row
    const row = document.createElement('div');
    row.className = 'tree-item tree-inline-new';
    row.style.paddingLeft = (8 + depth * 16 + (kind === 'file' ? 20 : 0)) + 'px';
    row.innerHTML = `<span class="tree-icon">${icon}</span>`;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tree-inline-input';
    input.value = defaultName;
    input.spellcheck = false;
    row.appendChild(input);

    // Insert at the top of the container
    container.insertBefore(row, container.firstChild);
    input.focus();
    // Select just the name part (before extension for files)
    if (kind === 'file') {
        const dotIdx = defaultName.lastIndexOf('.');
        input.setSelectionRange(0, dotIdx > 0 ? dotIdx : defaultName.length);
    } else {
        input.select();
    }

    let committed = false;

    async function commit() {
        if (committed) return;
        committed = true;
        const name = input.value.trim();
        if (!name || !currentProject) {
            row.remove();
            return;
        }
        const srcDir = nodePath.join(currentProject.path, 'src');
        try {
            if (kind === 'file') {
                const filePath = nodePath.join(srcDir, name);
                let content = '';
                if (/\.(cpp|c|cc|cxx)$/i.test(name)) content = '#include "stdafx.h"\n\n';
                else if (/\.(h|hpp)$/i.test(name)) {
                    const guard = name.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_';
                    content = `#pragma once\n#ifndef ${guard}\n#define ${guard}\n\n\n\n#endif // ${guard}\n`;
                }
                await ipcRenderer.invoke(IPC.FILE_CREATE, filePath, content);
                await refreshFileTree();
                openFile(filePath);
                appendOutput(`Created: ${name}\n`);
            } else {
                const fullPath = nodePath.join(srcDir, name);
                nodeFs.mkdirSync(fullPath, { recursive: true });
                await refreshFileTree();
                appendOutput(`Created folder: ${name}\n`);
            }
        } catch (err: any) {
            appendOutput(`Create failed: ${err.message}\n`);
            row.remove();
        }
    }

    function cancel() {
        if (committed) return;
        committed = true;
        row.remove();
    }

    input.addEventListener('keydown', (e: KeyboardEvent) => {
        e.stopPropagation(); // Prevent editor shortcuts from firing
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', () => {
        // Small delay to let click on something else process first
        setTimeout(() => { if (!committed) commit(); }, 150);
    });
}

// Right-click on empty space in explorer
$('file-tree').addEventListener('contextmenu', (e: MouseEvent) => {
    // Only trigger if clicking empty space, not on a tree-item
    if ((e.target as HTMLElement).closest('.tree-item')) return;
    e.preventDefault();
    if (!currentProject) return;
    const srcDir = nodePath.join(currentProject.path, 'src');
    showContextMenu(e.clientX, e.clientY, [
        { label: 'New File...', action: () => inlineCreateItem('file') },
        { label: 'New Folder...', action: () => inlineCreateItem('folder') },
        { label: '─', action: () => {} },
        { label: 'Add Existing File...', action: () => addExistingFile() },
        { label: 'Upload Document...', action: () => uploadDocument() },
        { label: '─', action: () => {} },
        { label: 'Refresh', action: () => refreshFileTree() },
        { label: '─', action: () => {} },
        { label: 'Open in Explorer', action: () => { shell.openPath(currentProject.path); } },
    ]);
});

// Drop onto empty space in file tree → move to project root
$('file-tree').addEventListener('dragover', (e: DragEvent) => {
    if (!(e.target as HTMLElement).closest('.tree-item') && e.dataTransfer?.types.includes('nexia/filepath')) {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';
    }
});
$('file-tree').addEventListener('drop', async (e: DragEvent) => {
    if ((e.target as HTMLElement).closest('.tree-item')) return;
    e.preventDefault();
    if (!currentProject) return;
    const srcPath = e.dataTransfer!.getData('nexia/filepath');
    if (!srcPath) return;
    const fileName = nodePath.basename(srcPath);
    const destPath = nodePath.join(currentProject.path, 'src', fileName);
    if (srcPath === destPath) return;
    await moveFile(srcPath, destPath);
});

async function newFolderInProject() {
    if (!currentProject) { appendOutput('Open a project first.\n'); return; }
    const name = prompt('New folder name:');
    if (!name || !name.trim()) return;
    const fullPath = nodePath.join(currentProject.path, 'src', name.trim());
    try {
        nodeFs.mkdirSync(fullPath, { recursive: true });
        await refreshFileTree();
        appendOutput(`Created folder: src/${name.trim()}\n`);
    } catch (err: any) { appendOutput(`Create folder failed: ${err.message}\n`); }
}

async function addExistingFile() {
    if (!currentProject) { appendOutput('Open a project first.\n'); return; }
    const filePath = await ipcRenderer.invoke(IPC.FILE_SELECT_FILE);
    if (!filePath) return;
    const fileName = nodePath.basename(filePath);
    const srcDir = nodePath.join(currentProject.path, 'src');
    if (!nodeFs.existsSync(srcDir)) nodeFs.mkdirSync(srcDir, { recursive: true });
    const dest = nodePath.join(srcDir, fileName);
    try {
        nodeFs.copyFileSync(filePath, dest);
        await refreshFileTree();
        openFile(dest);
        appendOutput(`Added: ${fileName}\n`);
    } catch (err: any) { appendOutput(`Add file failed: ${err.message}\n`); }
}

function renderFileTree(nodes: any[], container: HTMLElement, depth: number, clear: boolean = true) {
    if (clear) container.innerHTML = '';
    for (const node of nodes) {
        const item = document.createElement('div');
        if (node.isDirectory) {
            const header = document.createElement('div');
            header.className = 'tree-item';
            header.style.paddingLeft = (8 + depth * 16) + 'px';
            header.innerHTML = `<span class="tree-arrow">▶</span><span class="tree-icon">📁</span><span class="tree-name">${node.name}</span>`;
            const children = document.createElement('div');
            children.className = 'tree-children';
            if (node.children) renderFileTree(node.children, children, depth + 1);
            header.addEventListener('click', () => {
                children.classList.toggle('open');
                const arrow = header.querySelector('.tree-arrow')! as HTMLElement;
                const icon = header.querySelector('.tree-icon')!;
                if (children.classList.contains('open')) {
                    arrow.textContent = '▼'; arrow.classList.add('expanded'); icon.textContent = '📂';
                } else {
                    arrow.textContent = '▶'; arrow.classList.remove('expanded'); icon.textContent = '📁';
                }
            });
            header.addEventListener('contextmenu', (e: MouseEvent) => {
                e.preventDefault();
                showContextMenu(e.clientX, e.clientY, [
                    { label: 'New File Here...', action: () => newFileInFolder(node.path) },
                    { label: '─', action: () => {} },
                    { label: 'Rename...', action: () => renameFile(node.path) },
                    { label: 'Delete Folder', action: () => deleteFile(node.path) },
                    { label: '─', action: () => {} },
                    { label: 'Copy Path', action: () => { navigator.clipboard.writeText(node.path); } },
                    { label: 'Open in Explorer', action: () => { shell.openPath(node.path); } },
                ]);
            });

            // --- Drag-and-drop: folders are drop targets ---
            // Also make folders draggable to move entire folders
            header.draggable = true;
            header.addEventListener('dragstart', (e: DragEvent) => {
                e.dataTransfer!.setData('nexia/filepath', node.path);
                e.dataTransfer!.setData('nexia/isdir', 'true');
                e.dataTransfer!.effectAllowed = 'move';
                header.classList.add('dragging');
            });
            header.addEventListener('dragend', () => { header.classList.remove('dragging'); });
            header.addEventListener('dragover', (e: DragEvent) => {
                // Accept drops of files/folders but not onto self
                const srcPath = e.dataTransfer?.types.includes('nexia/filepath') ? true : false;
                if (!srcPath) return;
                e.preventDefault();
                e.dataTransfer!.dropEffect = 'move';
                header.classList.add('drag-over');
            });
            header.addEventListener('dragleave', () => { header.classList.remove('drag-over'); });
            header.addEventListener('drop', async (e: DragEvent) => {
                e.preventDefault();
                header.classList.remove('drag-over');
                const srcPath = e.dataTransfer!.getData('nexia/filepath');
                if (!srcPath) return;
                const fileName = nodePath.basename(srcPath);
                const destPath = nodePath.join(node.path, fileName);
                // Don't drop onto self or into own subtree
                if (srcPath === destPath || srcPath === node.path) return;
                if (destPath.startsWith(srcPath + nodePath.sep)) return;
                await moveFile(srcPath, destPath);
            });

            item.appendChild(header);
            item.appendChild(children);
        } else {
            const fi = document.createElement('div');
            fi.className = 'tree-item';
            fi.style.paddingLeft = (8 + depth * 16 + 20) + 'px';
            fi.innerHTML = `<span class="tree-icon">${getFileIcon(node.extension || '')}</span><span class="tree-name">${node.name}</span>`;
            fi.addEventListener('click', () => openFile(node.path));
            fi.addEventListener('contextmenu', (e: MouseEvent) => {
                e.preventDefault();
                showContextMenu(e.clientX, e.clientY, [
                    { label: 'Open', action: () => openFile(node.path) },
                    { label: '─', action: () => {} },
                    { label: 'Rename...', action: () => renameFile(node.path) },
                    { label: 'Delete', action: () => deleteFile(node.path) },
                    { label: '─', action: () => {} },
                    { label: 'Copy Path', action: () => { navigator.clipboard.writeText(node.path); } },
                    { label: 'Reveal in Explorer', action: () => { shell.showItemInFolder(node.path); } },
                ]);
            });

            // --- Drag-and-drop: files are draggable ---
            fi.draggable = true;
            fi.addEventListener('dragstart', (e: DragEvent) => {
                e.dataTransfer!.setData('nexia/filepath', node.path);
                e.dataTransfer!.setData('nexia/isdir', 'false');
                e.dataTransfer!.effectAllowed = 'move';
                fi.classList.add('dragging');
            });
            fi.addEventListener('dragend', () => { fi.classList.remove('dragging'); });

            item.appendChild(fi);
        }
        container.appendChild(item);
    }
}

/**
 * Move a file or folder to a new path, updating any open tabs.
 */
async function moveFile(srcPath: string, destPath: string) {
    const name = nodePath.basename(srcPath);
    if (nodeFs.existsSync(destPath)) {
        if (!confirm(`"${name}" already exists in the destination. Overwrite?`)) return;
    }
    try {
        await ipcRenderer.invoke(IPC.FILE_RENAME, srcPath, destPath);
        // Update any open tabs that were inside the moved path
        for (const tab of openTabs) {
            if (tab.path === srcPath) {
                tab.path = destPath;
                tab.name = nodePath.basename(destPath);
                if (activeTab === srcPath) activeTab = destPath;
            } else if (tab.path.startsWith(srcPath + nodePath.sep)) {
                // File was inside a moved folder
                const rel = tab.path.substring(srcPath.length);
                tab.path = destPath + rel;
                if (activeTab === srcPath + rel) activeTab = tab.path;
            }
        }
        renderTabs();
        await refreshFileTree();
        appendOutput(`Moved: ${name} → ${nodePath.dirname(destPath)}\n`);
    } catch (err: any) {
        appendOutput(`Move failed: ${err.message}\n`);
    }
}

function getFileIcon(ext: string): string {
    const m: Record<string, string> = {
        '.cpp': '<span class="ficon ficon-cpp">C++</span>',
        '.c': '<span class="ficon ficon-c">C</span>',
        '.h': '<span class="ficon ficon-h">H</span>',
        '.hpp': '<span class="ficon ficon-h">H+</span>',
        '.hlsl': '🎨', '.fx': '🎨',
        '.xui': '🖼', '.xur': '🖼',
        '.wav': '🔊', '.xma': '🔊',
        '.json': '<span class="ficon ficon-json">{}</span>',
        '.xml': '<span class="ficon ficon-xml">&lt;&gt;</span>',
        '.xex': '🎮', '.exe': '⚙', '.dll': '📦',
        '.png': '🖼', '.dds': '🖼', '.bmp': '🖼', '.tga': '🖼',
        '.txt': '📝', '.md': '📝', '.log': '📝',
        '.bat': '⚡', '.cmd': '⚡',
        '.py': '🐍', '.js': '<span class="ficon ficon-js">JS</span>',
        '.ts': '<span class="ficon ficon-ts">TS</span>',
    };
    return m[ext] || '📄';
}

// ══════════════════════════════════════
//  OUTPUT
// ══════════════════════════════════════
/**
 * MSVC error/warning patterns:
 *   filepath(line): error CODE: message
 *   filepath(line,col): warning CODE: message
 *   LINK : fatal error LNKXXXX: message
 */
const MSVC_DIAG_RE = /^(.+?)\((\d+)(?:,(\d+))?\)\s*:\s*(error|warning|fatal error)\s+(\w+)\s*:\s*(.*)$/;
const LINK_ERROR_RE = /^(.+?\.obj)\s*:\s*(error|warning)\s+(\w+)\s*:\s*(.*)$/;

function appendOutput(text: string) {
    const el = $('output-text');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Don't add trailing newline for last empty split segment
        if (i === lines.length - 1 && line === '') {
            el.appendChild(document.createTextNode('\n'));
            continue;
        }

        const msvcMatch = line.match(MSVC_DIAG_RE);
        const linkMatch = !msvcMatch ? line.match(LINK_ERROR_RE) : null;

        if (msvcMatch) {
            const [, file, lineNum, col, severity, code, msg] = msvcMatch;
            const isError = severity.includes('error');

            // Clickable file:line link
            const link = document.createElement('span');
            link.className = isError ? 'output-error-link' : 'output-warn-link';
            link.textContent = `${file}(${lineNum}${col ? ',' + col : ''})`;
            link.title = 'Click to jump to this location';
            link.addEventListener('click', () => {
                jumpToError({ file, line: parseInt(lineNum), column: col ? parseInt(col) : 1 });
            });

            // Rest of line
            const rest = document.createElement('span');
            rest.className = isError ? 'output-error-msg' : 'output-warn-msg';
            rest.textContent = `: ${severity} ${code}: ${msg}`;

            el.appendChild(link);
            el.appendChild(rest);
            el.appendChild(document.createTextNode('\n'));
        } else if (linkMatch) {
            const [, file, severity, code, msg] = linkMatch;
            const isError = severity === 'error';
            const span = document.createElement('span');
            span.className = isError ? 'output-error-msg' : 'output-warn-msg';
            span.textContent = line;
            el.appendChild(span);
            el.appendChild(document.createTextNode('\n'));
        } else {
            el.appendChild(document.createTextNode(line + '\n'));
        }
    }
    // Scroll to bottom
    const pane = el.parentElement;
    if (pane) pane.scrollTop = pane.scrollHeight;
}

function clearOutput() { $('output-text').innerHTML = ''; }

// ══════════════════════════════════════
//  CONTEXT MENU
// ══════════════════════════════════════
interface CtxItem { label: string; action: () => void; }
function showContextMenu(x: number, y: number, items: CtxItem[]) {
    let menu = document.getElementById('context-menu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'context-menu';
        document.body.appendChild(menu);
    }
    menu.innerHTML = '';
    for (const item of items) {
        if (item.label === '─') {
            const sep = document.createElement('div');
            sep.className = 'ctx-separator';
            menu.appendChild(sep);
        } else {
            const el = document.createElement('div');
            el.className = 'ctx-item';
            el.textContent = item.label;
            el.addEventListener('click', () => { hideContextMenu(); item.action(); });
            menu.appendChild(el);
        }
    }
    // Position, keeping on screen
    menu.style.display = 'block';
    menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - items.length * 30) + 'px';
}
function hideContextMenu() {
    const menu = document.getElementById('context-menu');
    if (menu) menu.style.display = 'none';
}
document.addEventListener('click', hideContextMenu);
document.addEventListener('contextmenu', (e) => {
    // Only suppress default on our custom areas
    if ((e.target as HTMLElement).closest('.tree-item, .editor-tab')) return;
});

// ══════════════════════════════════════
//  FILE OPERATIONS (rename, delete, new in folder)
// ══════════════════════════════════════
async function renameFile(filePath: string) {
    const oldName = nodePath.basename(filePath);
    const newName = prompt('Rename to:', oldName);
    if (!newName || newName === oldName) return;
    try {
        await ipcRenderer.invoke(IPC.FILE_RENAME, filePath, nodePath.join(nodePath.dirname(filePath), newName));
        // Update tab if open
        const tab = openTabs.find(t => t.path === filePath);
        if (tab) {
            tab.path = nodePath.join(nodePath.dirname(filePath), newName);
            tab.name = newName;
            if (activeTab === filePath) activeTab = tab.path;
            renderTabs();
        }
        await refreshFileTree();
    } catch (err: any) { appendOutput(`Rename failed: ${err.message}\n`); }
}

async function deleteFile(filePath: string) {
    const name = nodePath.basename(filePath);
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
        await ipcRenderer.invoke(IPC.FILE_DELETE, filePath);
        // Close tab if open
        const tab = openTabs.find(t => t.path === filePath);
        if (tab) closeTab(filePath);
        await refreshFileTree();
    } catch (err: any) { appendOutput(`Delete failed: ${err.message}\n`); }
}

async function newFileInFolder(folderPath: string) {
    const name = prompt('New file name:', 'newfile.cpp');
    if (!name) return;
    const fullPath = nodePath.join(folderPath, name);
    try {
        // Default content based on extension
        let content = '';
        if (/\.(cpp|c|cc|cxx)$/i.test(name)) content = '#include "stdafx.h"\n\n';
        else if (/\.(h|hpp)$/i.test(name)) {
            const guard = name.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_';
            content = `#pragma once\n#ifndef ${guard}\n#define ${guard}\n\n\n\n#endif // ${guard}\n`;
        }
        await ipcRenderer.invoke(IPC.FILE_CREATE, fullPath, content);
        await refreshFileTree();
        openFile(fullPath);
    } catch (err: any) { appendOutput(`Create failed: ${err.message}\n`); }
}

// ══════════════════════════════════════
//  TAB CONTEXT MENU
// ══════════════════════════════════════
function initTabContextMenu() {
    $('tab-bar').addEventListener('contextmenu', (e: MouseEvent) => {
        const tabEl = (e.target as HTMLElement).closest('.editor-tab') as HTMLElement;
        if (!tabEl) return;
        e.preventDefault();
        const idx = Array.from($('tab-bar').children).indexOf(tabEl);
        if (idx < 0 || idx >= openTabs.length) return;
        const tab = openTabs[idx];
        showContextMenu(e.clientX, e.clientY, [
            { label: 'Close', action: () => closeTab(tab.path) },
            { label: 'Close Others', action: () => closeOtherTabs(tab.path) },
            { label: 'Close All', action: () => closeAllTabs() },
            { label: '─', action: () => {} },
            { label: 'Copy Path', action: () => { navigator.clipboard.writeText(tab.path); } },
            { label: 'Reveal in Explorer', action: () => { shell.showItemInFolder(tab.path); } },
        ]);
    });
}

function closeOtherTabs(keepPath: string) {
    const toClose = openTabs.filter(t => t.path !== keepPath);
    for (const tab of toClose) {
        tab.model.dispose();
    }
    openTabs = openTabs.filter(t => t.path === keepPath);
    if (!openTabs.find(t => t.path === activeTab)) {
        if (openTabs.length > 0) switchToTab(openTabs[0].path);
        else { activeTab = null; $('editor-container').style.display = 'none'; $('welcome-screen').style.display = 'flex'; }
    }
    renderTabs();
}

// ══════════════════════════════════════
//  GO TO LINE (Ctrl+G)
// ══════════════════════════════════════
function showGoToLine() {
    if (!editor || !activeTab) return;
    const lineCount = editor.getModel()?.getLineCount() || 1;
    const input = prompt(`Go to Line (1-${lineCount}):`);
    if (!input) return;
    const line = parseInt(input, 10);
    if (isNaN(line) || line < 1) return;
    const target = Math.min(line, lineCount);
    editor.revealLineInCenter(target);
    editor.setPosition({ lineNumber: target, column: 1 });
    editor.focus();
}

// ══════════════════════════════════════
//  UNSAVED CHANGES PROMPT
// ══════════════════════════════════════
function hasUnsavedChanges(): boolean {
    return openTabs.some(t => t.modified);
}

function confirmUnsavedAndClose() {
    if (hasUnsavedChanges()) {
        const choice = confirm('You have unsaved changes. Save all before closing?');
        if (choice) {
            saveAllFiles().then(() => ipcRenderer.send(IPC.APP_CLOSE));
            return;
        }
    }
    ipcRenderer.send(IPC.APP_CLOSE);
}

// ══════════════════════════════════════
//  BUILD
// ══════════════════════════════════════
async function doBuild() {
    if (!currentProject) { appendOutput('No project open.\n'); return; }
    await saveAllFiles(true);
    clearOutput(); showBottomPanel();
    setBuildStatus('building');
    try {
        const result = await ipcRenderer.invoke(IPC.BUILD_RUN, { configuration: ($('config-select') as HTMLSelectElement).value });
        setBuildStatus(result.success ? 'succeeded' : 'failed');
    } catch { setBuildStatus('failed'); }
}
async function doRebuild() {
    if (!currentProject) { appendOutput('No project open.\n'); return; }
    await saveAllFiles(true);
    clearOutput(); showBottomPanel();
    setBuildStatus('building');
    try {
        const result = await ipcRenderer.invoke(IPC.BUILD_REBUILD, { configuration: ($('config-select') as HTMLSelectElement).value });
        setBuildStatus(result.success ? 'succeeded' : 'failed');
    } catch { setBuildStatus('failed'); }
}
async function doClean() {
    if (!currentProject) { appendOutput('No project open.\n'); return; }
    clearOutput(); showBottomPanel();
    await ipcRenderer.invoke(IPC.BUILD_CLEAN);
    appendOutput('Clean complete.\n');
    setBuildStatus('ready');
}

function setBuildStatus(state: 'ready' | 'building' | 'succeeded' | 'failed') {
    const el = $('status-build');
    const labels: Record<string, string> = {
        ready: '● Ready', building: '⏳ Building...', succeeded: '✔ Build Succeeded', failed: '✗ Build Failed'
    };
    el.textContent = labels[state];
    el.className = 'status-build-' + state;
}

ipcRenderer.on(IPC.BUILD_OUTPUT, (_e: any, data: string) => appendOutput(data));
ipcRenderer.on(IPC.TOOL_OUTPUT, (_e: any, data: string) => appendOutput(data));
ipcRenderer.on(IPC.BUILD_COMPLETE, (_e: any, result: any) => {
    const list = $('problems-list');
    list.innerHTML = '';
    const errCount = (result.errors || []).length;
    const warnCount = (result.warnings || []).length;
    // Update problems tab label
    const problemsTab = document.querySelector('[data-panel="problems"]');
    if (problemsTab) problemsTab.textContent = `PROBLEMS${errCount + warnCount > 0 ? ` (${errCount + warnCount})` : ''}`;

    for (const err of result.errors || []) {
        const item = document.createElement('div');
        item.className = 'problem-item problem-error';
        const shortFile = nodePath.basename(err.file || '');
        item.innerHTML = `<span class="problem-icon">✗</span><span class="problem-text">${err.message}</span><span class="problem-loc">${shortFile}${err.line ? ':' + err.line : ''}</span>`;
        item.addEventListener('click', () => jumpToError(err));
        list.appendChild(item);
    }
    for (const w of result.warnings || []) {
        const item = document.createElement('div');
        item.className = 'problem-item problem-warning';
        const shortFile = nodePath.basename(w.file || '');
        item.innerHTML = `<span class="problem-icon">⚠</span><span class="problem-text">${w.message}</span><span class="problem-loc">${shortFile}${w.line ? ':' + w.line : ''}</span>`;
        item.addEventListener('click', () => jumpToError(w));
        list.appendChild(item);
    }
    // Auto-switch to problems tab if errors
    if (errCount > 0) {
        const probBtn = document.querySelector('[data-panel="problems"]') as HTMLElement;
        if (probBtn) probBtn.click();
    }
    // After successful build, show "Run in Emulator" in output
    if (errCount === 0 && result.outputPath) {
        appendOutput(`\n  ▶ Press F6 to run in Nexia 360 emulator\n`);
        lastBuiltXex = result.outputPath;
    }
    // Learning system hook
    onBuildComplete(result);
    // AI error analysis hook
    if (errCount > 0) {
        analyzeAIBuildErrors(result.errors || [], result.warnings || []);
    } else {
        // Clear AI errors view
        $('ai-errors-content').classList.add('hidden');
        $('ai-errors-empty').classList.remove('hidden');
    }
});

async function jumpToError(err: any) {
    if (!err.file) return;
    // Resolve absolute path
    let filePath = err.file;
    if (!nodePath.isAbsolute(filePath) && currentProject) {
        filePath = nodePath.join(currentProject.path, 'src', filePath);
        if (!nodeFs.existsSync(filePath)) filePath = nodePath.join(currentProject.path, err.file);
    }
    await openFile(filePath);
    if (editor && err.line) {
        editor.revealLineInCenter(err.line);
        editor.setPosition({ lineNumber: err.line, column: err.column || 1 });
        editor.focus();
        // Flash highlight
        const decs = editor.deltaDecorations([], [{
            range: new (window as any).monaco.Range(err.line, 1, err.line, 1),
            options: { isWholeLine: true, className: 'error-line-highlight' }
        }]);
        setTimeout(() => editor.deltaDecorations(decs, []), 3000);
    }
}

// ══════════════════════════════════════
//  PROJECT OPERATIONS
// ══════════════════════════════════════
async function openProject(dir?: string) {
    const project = await ipcRenderer.invoke(IPC.PROJECT_OPEN, dir);
    if (!project) return;
    currentProject = project;
    $('titlebar-project').textContent = `— ${project.name}`;
    await refreshFileTree();
    if (project.sourceFiles?.length > 0) {
        const mainFile = project.sourceFiles.find((f: string) => /main\.(cpp|c)$/i.test(f))
                      || project.sourceFiles[project.sourceFiles.length - 1];
        const f = nodePath.isAbsolute(mainFile) ? mainFile : nodePath.join(project.path, mainFile);
        openFile(f);
    }
    $('welcome-screen').style.display = 'none';
}

$('welcome-open').addEventListener('click', () => openProject());

// ══════════════════════════════════════
//  NEW PROJECT DIALOG
// ══════════════════════════════════════
$('welcome-new').addEventListener('click', showNewProjectDialog);
let selectedTemplate = 'hello-world';

async function showNewProjectDialog() {
    const templates = await ipcRenderer.invoke(IPC.PROJECT_GET_TEMPLATES);
    const container = $('np-templates');
    container.innerHTML = '';
    // Pre-fill location with default projects directory
    const locInput = $('np-location') as HTMLInputElement;
    if (!locInput.value && defaultProjectsDir) locInput.value = defaultProjectsDir;
    for (const t of templates) {
        const card = document.createElement('div');
        card.className = `template-card${t.id === selectedTemplate ? ' selected' : ''}`;
        card.innerHTML = `<span class="template-icon">${t.icon}</span><div class="template-info"><h4>${t.name}</h4><p>${t.description}</p></div>`;
        card.addEventListener('click', () => {
            container.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedTemplate = t.id;
        });
        container.appendChild(card);
    }
    $('new-project-overlay').classList.remove('hidden');
}

$('np-cancel').addEventListener('click', () => $('new-project-overlay').classList.add('hidden'));
$('np-browse').addEventListener('click', async () => {
    const dir = await ipcRenderer.invoke(IPC.FILE_SELECT_DIR);
    if (dir) ($('np-location') as HTMLInputElement).value = dir;
});
$('np-create').addEventListener('click', async () => {
    const name = ($('np-name') as HTMLInputElement).value.trim();
    const location = ($('np-location') as HTMLInputElement).value.trim();
    if (!name) { alert('Enter a project name.'); return; }
    if (!location) { alert('Choose a location.'); return; }
    try {
        const project = await ipcRenderer.invoke(IPC.PROJECT_NEW, name, location, selectedTemplate);
        currentProject = project;
        $('titlebar-project').textContent = `— ${project.name}`;
        $('new-project-overlay').classList.add('hidden');
        $('welcome-screen').style.display = 'none';
        await refreshFileTree();
        if (project.sourceFiles?.length > 0) {
            // Open main.cpp first, fallback to last source file
            const mainFile = project.sourceFiles.find((f: string) => /main\.(cpp|c)$/i.test(f))
                          || project.sourceFiles[project.sourceFiles.length - 1];
            openFile(nodePath.join(project.path, mainFile));
        }
        onProjectCreated();
    } catch (err: any) {
        alert('Failed to create project: ' + err.message);
    }
});

// ══════════════════════════════════════
//  NEW FILE DIALOG
// ══════════════════════════════════════
function showNewFileDialog() {
    if (!currentProject) { appendOutput('Open a project first.\n'); return; }
    ($('nf-name') as HTMLInputElement).value = '';
    $('new-file-overlay').classList.remove('hidden');
    setTimeout(() => ($('nf-name') as HTMLInputElement).focus(), 100);
}

async function createNewFile() {
    const name = ($('nf-name') as HTMLInputElement).value.trim();
    if (!name) { alert('Enter a file name.'); return; }
    if (!currentProject) { alert('No project open.'); return; }
    const filePath = nodePath.join(currentProject.path, 'src', name);
    // Default content based on extension
    let content = '';
    if (/\.(cpp|c|cc|cxx)$/i.test(name)) content = '#include "stdafx.h"\n\n';
    else if (/\.(h|hpp)$/i.test(name)) {
        const guard = name.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_';
        content = `#pragma once\n#ifndef ${guard}\n#define ${guard}\n\n\n\n#endif // ${guard}\n`;
    }
    try {
        await ipcRenderer.invoke(IPC.FILE_CREATE, filePath, content);
        $('new-file-overlay').classList.add('hidden');
        await refreshFileTree();
        openFile(filePath);
        appendOutput(`Created: ${name}\n`);
    } catch (err: any) {
        alert('Failed to create file: ' + err.message);
        appendOutput(`Create file failed: ${err.message}\n`);
    }
}

$('nf-cancel').addEventListener('click', () => $('new-file-overlay').classList.add('hidden'));
$('nf-create').addEventListener('click', createNewFile);
($('nf-name') as HTMLInputElement).addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); createNewFile(); }
    if (e.key === 'Escape') { $('new-file-overlay').classList.add('hidden'); }
});

// ══════════════════════════════════════
//  DEPLOY
// ══════════════════════════════════════
$('btn-deploy').addEventListener('click', async () => {
    if (!currentProject) { appendOutput('No project open.\n'); return; }
    const config = ($('config-select') as HTMLSelectElement).value;
    const xexPath = nodePath.join(currentProject.path, 'out', config, currentProject.name + '.xex');
    clearOutput(); showBottomPanel();
    try {
        await ipcRenderer.invoke(IPC.DEVKIT_DEPLOY, xexPath);
        onDeploy();
    }
    catch (err: any) { appendOutput(`Deploy failed: ${err.message}\n`); }
});

// ══════════════════════════════════════
//  SDK TOOLS DIALOG
// ══════════════════════════════════════
// ══════════════════════════════════════
//  SDK TOOLS DIALOG
// ══════════════════════════════════════

async function showSdkToolsDialog() {
    const tools = await ipcRenderer.invoke(IPC.SDK_GET_TOOLS);
    const grid = $('tools-grid');
    grid.innerHTML = '';
    if (tools.length === 0) {
        grid.innerHTML = '<p style="color:var(--text-dim);padding:16px;">No SDK tools found. Configure SDK path first.</p>';
    } else {
        const icons: Record<string, string> = { compiler:'⚙', linker:'🔗', shader:'🎨', audio:'🔊', xui:'🖼', utility:'📦', devkit:'📡', debug:'🔍', profiler:'📈', other:'📄' };
        let lastCategory = '';
        for (const tool of tools) {
            if (tool.category !== lastCategory) {
                lastCategory = tool.category;
                const header = document.createElement('div');
                header.className = 'tools-category-header';
                header.textContent = (icons[tool.category] || '📄') + ' ' + tool.category.toUpperCase();
                grid.appendChild(header);
            }
            const card = document.createElement('div');
            card.className = 'tool-card' + (tool.gui ? ' tool-gui' : ' tool-cli');
            card.title = tool.gui ? 'Click to launch (GUI application)' : 'Click to run (output in terminal)';
            card.innerHTML = `<span class="tool-category">${icons[tool.category]||'📄'}</span><div><div class="tool-name">${tool.name} <span class="tool-type-badge">${tool.gui ? 'GUI' : 'CLI'}</span></div><div class="tool-desc">${tool.description}</div></div>`;
            card.addEventListener('click', async () => {
                try {
                    if (!tool.gui) {
                        showBottomPanel();
                        appendOutput('\n─── ' + tool.name + ' ───\n');
                    }
                    await ipcRenderer.invoke(IPC.TOOL_LAUNCH, tool.name, tool.gui);
                } catch (err: any) {
                    showBottomPanel();
                    appendOutput('Error: ' + (err.message || err) + '\n');
                }
            });
            grid.appendChild(card);
        }
    }
    $('tools-overlay').classList.remove('hidden');
}
$('tools-close').addEventListener('click', () => $('tools-overlay').classList.add('hidden'));

// ══════════════════════════════════════
//  EXTENSIONS PANEL
// ══════════════════════════════════════

async function renderExtensionsPanel() {
    const panel = $('extensions-panel');
    const extensions = await ipcRenderer.invoke(IPC.EXT_LIST);
    const typeIcons: Record<string, string> = {
        tool: '🔧', template: '📋', snippet: '✂', theme: '🎨',
        library: '📚', plugin: '🔌',
    };

    let html = `
        <div style="padding:8px 12px;">
            <div style="display:flex;gap:6px;margin-bottom:12px;">
                <button class="devkit-btn" id="ext-import-btn" style="flex:1;">📦 Import</button>
                <button class="devkit-btn" id="ext-open-dir-btn" title="Open extensions folder">📁</button>
            </div>
    `;

    if (extensions.length === 0) {
        html += `
            <div style="text-align:center;padding:24px 12px;color:var(--text-dim);">
                <div style="font-size:32px;margin-bottom:12px;">🧩</div>
                <div style="margin-bottom:8px;">No extensions installed</div>
                <div style="font-size:12px;">Click <strong>Import</strong> to add extensions<br>from .zip files or folders.</div>
            </div>
        `;
    } else {
        for (const ext of extensions) {
            const m = ext.manifest;
            const icon = m.icon || typeIcons[m.type] || '📦';
            const badge = m.type.charAt(0).toUpperCase() + m.type.slice(1);
            const enabledClass = ext.enabled ? '' : ' style="opacity:0.5;"';
            html += `
                <div class="ext-card" data-ext-id="${m.id}"${enabledClass}>
                    <div style="display:flex;align-items:flex-start;gap:10px;">
                        <span style="font-size:24px;">${icon}</span>
                        <div style="flex:1;min-width:0;">
                            <div style="display:flex;align-items:center;gap:6px;">
                                <span style="font-weight:600;color:var(--text);">${m.name}</span>
                                <span class="tool-type-badge">${badge}</span>
                            </div>
                            <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">
                                v${m.version}${m.author ? ' · ' + m.author : ''}
                            </div>
                            <div style="font-size:12px;color:var(--text-dim);margin-top:4px;">
                                ${m.description || ''}
                            </div>
                        </div>
                    </div>
                    <div style="display:flex;gap:4px;margin-top:8px;justify-content:flex-end;">
                        <button class="ext-toggle-btn devkit-btn" data-ext-id="${m.id}" data-enabled="${ext.enabled}" class="btn-sm">
                            ${ext.enabled ? '⏸ Disable' : '▶ Enable'}
                        </button>
                        <button class="ext-remove-btn devkit-btn" data-ext-id="${m.id}" class="btn-sm btn-danger">
                            🗑
                        </button>
                    </div>
                </div>
            `;
        }
    }

    html += `</div>`;
    panel.innerHTML = html;

    // Wire up buttons
    const importBtn = $('ext-import-btn');
    if (importBtn) {
        importBtn.addEventListener('click', () => {
            $('ext-import-overlay').classList.remove('hidden');
        });
    }

    const openDirBtn = $('ext-open-dir-btn');
    if (openDirBtn) {
        openDirBtn.addEventListener('click', () => {
            ipcRenderer.invoke(IPC.EXT_OPEN_DIR);
        });
    }

    // Toggle buttons
    panel.querySelectorAll('.ext-toggle-btn').forEach((btn: Element) => {
        btn.addEventListener('click', async () => {
            const id = (btn as HTMLElement).dataset.extId!;
            const currentlyEnabled = (btn as HTMLElement).dataset.enabled === 'true';
            await ipcRenderer.invoke(IPC.EXT_SET_ENABLED, id, !currentlyEnabled);
            renderExtensionsPanel();
        });
    });

    // Remove buttons
    panel.querySelectorAll('.ext-remove-btn').forEach((btn: Element) => {
        btn.addEventListener('click', async () => {
            const id = (btn as HTMLElement).dataset.extId!;
            if (confirm(`Remove extension "${id}"? This cannot be undone.`)) {
                await ipcRenderer.invoke(IPC.EXT_UNINSTALL, id);
                appendOutput(`🗑 Extension removed: ${id}\n`);
                renderExtensionsPanel();
            }
        });
    });
}

// Import overlay buttons
$('ext-import-zip').addEventListener('click', async () => {
    $('ext-import-overlay').classList.add('hidden');
    const filePath = await ipcRenderer.invoke(IPC.FILE_SELECT_FILE);
    if (!filePath || !filePath.toLowerCase().endsWith('.zip')) {
        if (filePath) appendOutput('⚠ Please select a .zip file.\n');
        return;
    }
    try {
        const result = await ipcRenderer.invoke(IPC.EXT_INSTALL_ZIP, filePath);
        appendOutput(`✅ Installed extension: ${result.manifest.name} v${result.manifest.version}\n`);
        renderExtensionsPanel();
    } catch (err: any) {
        appendOutput(`❌ Import failed: ${err.message || err}\n`);
    }
});

$('ext-import-folder').addEventListener('click', async () => {
    $('ext-import-overlay').classList.add('hidden');
    const folderPath = await ipcRenderer.invoke(IPC.FILE_SELECT_DIR);
    if (!folderPath) return;
    try {
        const result = await ipcRenderer.invoke(IPC.EXT_INSTALL_FOLDER, folderPath);
        appendOutput(`✅ Installed extension: ${result.manifest.name} v${result.manifest.version}\n`);
        renderExtensionsPanel();
    } catch (err: any) {
        appendOutput(`❌ Import failed: ${err.message || err}\n`);
    }
});

$('ext-create-new').addEventListener('click', () => {
    $('ext-import-overlay').classList.add('hidden');
    $('ext-create-overlay').classList.remove('hidden');
});

$('ext-import-close').addEventListener('click', () => $('ext-import-overlay').classList.add('hidden'));

$('ext-create-cancel').addEventListener('click', () => $('ext-create-overlay').classList.add('hidden'));

$('ext-create-submit').addEventListener('click', async () => {
    const name = ($('ext-create-name') as HTMLInputElement).value.trim();
    const type = ($('ext-create-type') as HTMLSelectElement).value;
    if (!name) { alert('Enter a name for the extension.'); return; }
    try {
        const extDir = await ipcRenderer.invoke(IPC.EXT_CREATE, name, type);
        appendOutput(`📦 Created extension template: ${name}\n📁 ${extDir}\n`);
        $('ext-create-overlay').classList.add('hidden');
        renderExtensionsPanel();
    } catch (err: any) {
        appendOutput(`❌ Create failed: ${err.message || err}\n`);
    }
});

// Toolbar button opens extensions panel in sidebar
$('btn-extensions').addEventListener('click', () => {
    const tab = document.querySelector('.sidebar-tab[data-panel="extensions"]') as HTMLElement;
    if (tab) tab.click();
});

// ══════════════════════════════════════
//  DEVKIT PANEL
// ══════════════════════════════════════
let devkitConnected = false;
let devkitCurrentIp = '';

function initDevkitPanel() {
    $('devkit-panel').innerHTML = `
        <div class="devkit-section">
            <h4>CONSOLE</h4>
            <div class="devkit-status" id="devkit-status">
                <span class="devkit-status-dot disconnected"></span>
                <span id="devkit-status-text">Not connected</span>
            </div>
            <div class="devkit-input-row">
                <input type="text" id="devkit-ip" placeholder="192.168.1.100" value="">
                <button class="devkit-btn devkit-connect-btn" id="devkit-connect-btn">Connect</button>
            </div>
            <div class="devkit-info hidden" id="devkit-info"></div>
            <div class="devkit-actions" id="devkit-actions" style="display:none;">
                <button class="devkit-btn" id="devkit-reboot-btn">🔄 Reboot Console</button>
                <button class="devkit-btn" id="devkit-screenshot-btn">📷 Capture Screenshot</button>
                <button class="devkit-btn" id="devkit-files-btn">📁 Browse Files</button>
                <button class="devkit-btn" id="devkit-sysinfo-btn">ℹ System Info</button>
            </div>
        </div>
        <div class="devkit-section hidden" id="devkit-file-browser">
            <h4>FILE BROWSER</h4>
            <div class="devkit-path-row">
                <button class="devkit-btn devkit-path-up" id="devkit-path-up">↑</button>
                <input type="text" id="devkit-path" placeholder="HDD:\\" value="">
                <button class="devkit-btn" id="devkit-path-go">Go</button>
            </div>
            <div id="devkit-file-list" class="devkit-file-list"></div>
        </div>`;

    // Check if already connected
    ipcRenderer.invoke(IPC.DEVKIT_STATUS).then((status: any) => {
        if (status.connected) {
            devkitConnected = true;
            devkitCurrentIp = status.ip;
            ($('devkit-ip') as HTMLInputElement).value = status.ip;
            updateDevkitUI(true, status.ip);
        }
    });

    // Connect / Disconnect
    $('devkit-connect-btn')!.addEventListener('click', async () => {
        const btn = $('devkit-connect-btn') as HTMLButtonElement;
        const ip = ($('devkit-ip') as HTMLInputElement).value.trim();

        if (devkitConnected) {
            // Disconnect
            await ipcRenderer.invoke(IPC.DEVKIT_DISCONNECT);
            devkitConnected = false;
            devkitCurrentIp = '';
            updateDevkitUI(false);
            appendOutput('Disconnected from console.\n');
            return;
        }

        if (!ip) { appendOutput('Enter console IP address.\n'); return; }

        btn.textContent = 'Connecting...';
        btn.disabled = true;
        ($('devkit-status-text') as HTMLElement).textContent = `Connecting to ${ip}...`;

        try {
            const result = await ipcRenderer.invoke(IPC.DEVKIT_CONNECT, ip);
            if (result.connected) {
                devkitConnected = true;
                devkitCurrentIp = ip;
                updateDevkitUI(true, ip, result.type);
            } else {
                updateDevkitUI(false);
                appendOutput(`Connection failed: ${result.type || 'Unknown error'}\n`);
            }
        } catch (e: any) {
            updateDevkitUI(false);
            appendOutput(`Connection error: ${e.message}\n`);
        }

        btn.disabled = false;
    });

    // Reboot
    $('devkit-reboot-btn')?.addEventListener('click', async () => {
        if (!devkitConnected) { appendOutput('Not connected.\n'); return; }
        try {
            appendOutput('Sending reboot command...\n');
            await ipcRenderer.invoke(IPC.DEVKIT_REBOOT, 'cold', devkitCurrentIp);
            devkitConnected = false;
            updateDevkitUI(false);
            appendOutput('Reboot sent. Console will reconnect when ready.\n');
        } catch (e: any) { appendOutput(`Reboot failed: ${e.message}\n`); }
    });

    // Screenshot
    $('devkit-screenshot-btn')?.addEventListener('click', async () => {
        if (!devkitConnected) { appendOutput('Not connected.\n'); return; }
        const p = nodePath.join(nodeOs.homedir(), 'Desktop', `screenshot_${Date.now()}.bmp`);
        try {
            appendOutput('Capturing screenshot...\n');
            await ipcRenderer.invoke(IPC.DEVKIT_SCREENSHOT, p, devkitCurrentIp);
            appendOutput(`Screenshot saved: ${p}\n`);
        } catch (e: any) { appendOutput(`Screenshot failed: ${e.message}\n`); }
    });

    // System Info
    $('devkit-sysinfo-btn')?.addEventListener('click', async () => {
        if (!devkitConnected) { appendOutput('Not connected.\n'); return; }
        try {
            appendOutput('Fetching system info...\n');
            const info = await ipcRenderer.invoke(IPC.DEVKIT_SYSINFO, devkitCurrentIp);
            const infoEl = $('devkit-info');
            if (infoEl && info) {
                let html = '<div class="devkit-info-grid">';
                for (const [key, val] of Object.entries(info)) {
                    html += `<span class="devkit-info-key">${escapeHtml(key)}</span><span class="devkit-info-val">${escapeHtml(String(val))}</span>`;
                }
                html += '</div>';
                infoEl.innerHTML = html;
                infoEl.classList.remove('hidden');
                appendOutput('System info loaded.\n');
            }
        } catch (e: any) { appendOutput(`System info failed: ${e.message}\n`); }
    });

    // Browse Files
    $('devkit-files-btn')?.addEventListener('click', () => {
        if (!devkitConnected) { appendOutput('Not connected.\n'); return; }
        $('devkit-file-browser')?.classList.remove('hidden');
        showDevkitVolumes();
    });

    $('devkit-path-go')?.addEventListener('click', () => {
        const p = ($('devkit-path') as HTMLInputElement).value.trim();
        if (p) browseDevkitPath(p);
    });

    $('devkit-path-up')?.addEventListener('click', () => {
        const current = ($('devkit-path') as HTMLInputElement).value.trim();
        // If we're at a volume root like "HDD:\" or "HDD:", go back to volume list
        if (current.match(/^[A-Za-z0-9]+:[\\/]?$/) || !current.includes('\\')) {
            showDevkitVolumes();
            return;
        }
        const parts = current.replace(/\\/g, '/').split('/').filter(Boolean);
        if (parts.length > 1) {
            parts.pop();
            browseDevkitPath(parts.join('\\') + '\\');
        } else {
            showDevkitVolumes();
        }
    });

    ($('devkit-path') as HTMLInputElement)?.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
            const p = ($('devkit-path') as HTMLInputElement).value.trim();
            if (p) browseDevkitPath(p);
        }
    });
}

function updateDevkitUI(connected: boolean, ip?: string, consoleName?: string) {
    const dot = document.querySelector('.devkit-status-dot') as HTMLElement;
    const text = $('devkit-status-text') as HTMLElement;
    const btn = $('devkit-connect-btn') as HTMLButtonElement;
    const actions = $('devkit-actions') as HTMLElement;

    if (connected) {
        dot.className = 'devkit-status-dot connected';
        text.textContent = consoleName ? `${consoleName} (${ip})` : `Connected to ${ip}`;
        btn.textContent = 'Disconnect';
        btn.classList.add('disconnect');
        actions.style.display = '';
    } else {
        dot.className = 'devkit-status-dot disconnected';
        text.textContent = 'Not connected';
        btn.textContent = 'Connect';
        btn.classList.remove('disconnect');
        actions.style.display = 'none';
        $('devkit-info')?.classList.add('hidden');
        $('devkit-file-browser')?.classList.add('hidden');
    }
}

const XBOX_VOLUME_INFO: Record<string, { label: string; icon: string }> = {
    'HDD:': { label: 'Retail Hard Drive Emulation', icon: '💾' },
    'GAME:': { label: 'Active Title Media', icon: '🎮' },
    'D:': { label: 'Active Title Media', icon: '🎮' },
    'DVD:': { label: 'Volume', icon: '💿' },
    'CdRom0:': { label: 'Volume', icon: '💿' },
    'USB0:': { label: 'Volume', icon: '🔌' },
    'USB1:': { label: 'Volume', icon: '🔌' },
    'INTUSB:': { label: 'Volume', icon: '🔌' },
    'DASHUSER:': { label: 'Volume', icon: '📁' },
    'SysCache0:': { label: 'Volume', icon: '📁' },
    'SysCache1:': { label: 'Volume', icon: '📁' },
    'media:': { label: 'Volume', icon: '🎵' },
    'DEVKIT:': { label: 'Development Area', icon: '🛠' },
    'FLASH:': { label: 'NAND Flash', icon: '📁' },
};

async function showDevkitVolumes() {
    const listEl = $('devkit-file-list') as HTMLElement;
    const pathInput = $('devkit-path') as HTMLInputElement;
    if (!listEl) return;

    pathInput.value = '';
    listEl.innerHTML = '<div class="community-feed-loading">Querying volumes...</div>';

    let volumes: string[];
    try {
        volumes = await ipcRenderer.invoke(IPC.DEVKIT_VOLUMES, devkitCurrentIp);
    } catch {
        // Fallback to common volumes
        volumes = ['HDD:', 'GAME:', 'DVD:', 'USB0:', 'DASHUSER:'];
    }

    listEl.innerHTML = '';

    for (const vol of volumes) {
        const info = XBOX_VOLUME_INFO[vol] || { label: 'Volume', icon: '💾' };
        const entry = document.createElement('div');
        entry.className = 'devkit-file-entry dir';
        entry.innerHTML = `<span class="devkit-file-icon">${info.icon}</span><span class="devkit-file-name">${escapeHtml(vol)}</span><span class="devkit-file-size">${escapeHtml(info.label)}</span>`;
        entry.addEventListener('click', () => {
            browseDevkitPath(vol + '\\');
        });
        listEl.appendChild(entry);
    }

    if (volumes.length === 0) {
        listEl.innerHTML = '<div class="community-feed-placeholder"><p>No volumes found.</p></div>';
    }
}

async function browseDevkitPath(remotePath: string) {
    const listEl = $('devkit-file-list') as HTMLElement;
    const pathInput = $('devkit-path') as HTMLInputElement;
    if (!listEl) return;

    pathInput.value = remotePath;
    listEl.innerHTML = '<div class="community-feed-loading">Loading...</div>';

    try {
        const output = await ipcRenderer.invoke(IPC.DEVKIT_FILE_MANAGER, remotePath, devkitCurrentIp);
        listEl.innerHTML = '';

        if (!output || output.trim() === '') {
            listEl.innerHTML = '<div class="community-feed-placeholder"><p>Empty directory or no access.</p></div>';
            return;
        }

        // Parse xbdir output — lines like:
        // 12/25/2024  04:30 PM    <DIR>          Games
        // 12/25/2024  04:30 PM           123,456  default.xex
        const lines = output.split('\n').filter((l: string) => l.trim());
        for (const line of lines) {
            const dirMatch = line.match(/<DIR>\s+(.+)/);
            const fileMatch = line.match(/(\d[\d,]+)\s+(.+)/);

            if (dirMatch) {
                const name = dirMatch[1].trim();
                const entry = document.createElement('div');
                entry.className = 'devkit-file-entry dir';
                entry.innerHTML = `<span class="devkit-file-icon">📁</span><span class="devkit-file-name">${escapeHtml(name)}</span>`;
                entry.addEventListener('click', () => {
                    const sep = remotePath.endsWith('\\') || remotePath.endsWith(':') ? '' : '\\';
                    browseDevkitPath(remotePath + sep + name + '\\');
                });
                listEl.appendChild(entry);
            } else if (fileMatch) {
                const size = fileMatch[1].trim();
                const name = fileMatch[2].trim();
                if (!name || name === '.' || name === '..') continue;
                const entry = document.createElement('div');
                const isXex = name.toLowerCase().endsWith('.xex');
                const isXbe = name.toLowerCase().endsWith('.xbe');
                entry.className = 'devkit-file-entry file' + (isXex || isXbe ? ' executable' : '');
                const icon = isXex ? '🎮' : isXbe ? '🎮' : '📄';
                entry.innerHTML = `<span class="devkit-file-icon">${icon}</span><span class="devkit-file-name">${escapeHtml(name)}</span>${isXex || isXbe ? '<span class="devkit-file-run">▶ Run</span>' : ''}<span class="devkit-file-size">${size}</span>`;

                if (isXex || isXbe) {
                    // Double-click to launch
                    entry.addEventListener('dblclick', async () => {
                        const sep = remotePath.endsWith('\\') ? '' : '\\';
                        const fullPath = remotePath + sep + name;
                        entry.classList.add('launching');
                        const runLabel = entry.querySelector('.devkit-file-run') as HTMLElement;
                        if (runLabel) runLabel.textContent = '⏳ Launching...';
                        try {
                            await ipcRenderer.invoke(IPC.DEVKIT_LAUNCH, fullPath, devkitCurrentIp);
                            if (runLabel) runLabel.textContent = '✓ Launched';
                            appendOutput(`Launched: ${fullPath}\n`);
                        } catch (e: any) {
                            if (runLabel) runLabel.textContent = '▶ Run';
                            appendOutput(`Launch failed: ${e.message}\n`);
                        }
                        entry.classList.remove('launching');
                    });
                    // Single click on Run button
                    entry.querySelector('.devkit-file-run')?.addEventListener('click', async (e: Event) => {
                        e.stopPropagation();
                        const sep = remotePath.endsWith('\\') ? '' : '\\';
                        const fullPath = remotePath + sep + name;
                        const runLabel = entry.querySelector('.devkit-file-run') as HTMLElement;
                        if (runLabel) runLabel.textContent = '⏳ Launching...';
                        try {
                            await ipcRenderer.invoke(IPC.DEVKIT_LAUNCH, fullPath, devkitCurrentIp);
                            if (runLabel) runLabel.textContent = '✓ Launched';
                            appendOutput(`Launched: ${fullPath}\n`);
                        } catch (e: any) {
                            if (runLabel) runLabel.textContent = '▶ Run';
                            appendOutput(`Launch failed: ${(e as Error).message}\n`);
                        }
                    });
                }
                listEl.appendChild(entry);
            }
        }

        if (listEl.children.length === 0) {
            listEl.innerHTML = '<div class="community-feed-placeholder"><p>No entries found.</p></div>';
        }
    } catch (e: any) {
        listEl.innerHTML = `<div class="community-feed-placeholder"><p>Error: ${escapeHtml(e.message)}</p></div>`;
    }
}

// ══════════════════════════════════════
//  EMULATOR PANEL (Nexia 360)
// ══════════════════════════════════════
let emuState: 'stopped' | 'starting' | 'running' | 'paused' = 'stopped';

function initEmulatorPanel() {
    const panel = $('emulator-panel');
    if (!panel) return;

    panel.innerHTML = `
        <div class="emu-section">
            <h4>NEXIA 360 EMULATOR</h4>
            <div class="emu-status" id="emu-status">
                <span class="emu-status-dot stopped" id="emu-dot"></span>
                <span id="emu-status-text">Stopped</span>
            </div>

            <!-- Config -->
            <div class="emu-config" id="emu-config">
                <div class="devkit-input-row">
                    <input type="text" id="emu-path" placeholder="Path to Nexia360.exe">
                    <button class="devkit-btn" id="emu-browse-btn">...</button>
                </div>
                <button class="devkit-btn emu-btn-primary" id="emu-save-path" style="width:100%;margin-bottom:8px;">Save Path</button>
            </div>

            <!-- Launch -->
            <div class="emu-launch-row" id="emu-launch-row">
                <div class="devkit-input-row">
                    <input type="text" id="emu-xex-path" placeholder="XEX file to run...">
                    <button class="devkit-btn" id="emu-xex-browse">...</button>
                </div>
                <button class="emu-launch-btn" id="emu-launch-btn">▶ Launch in Emulator</button>
            </div>

            <!-- Controls (visible when running) -->
            <div class="emu-controls hidden" id="emu-controls">
                <div class="emu-control-bar">
                    <button class="emu-ctrl-btn" id="emu-pause-btn" title="Pause">⏸</button>
                    <button class="emu-ctrl-btn" id="emu-resume-btn" title="Resume">▶</button>
                    <button class="emu-ctrl-btn" id="emu-step-btn" title="Step">→</button>
                    <button class="emu-ctrl-btn" id="emu-step-over-btn" title="Step Over">↷</button>
                    <button class="emu-ctrl-btn emu-stop-btn" id="emu-stop-btn" title="Stop">⏹</button>
                </div>
            </div>
        </div>

        <!-- Breakpoints -->
        <div class="emu-section hidden" id="emu-bp-section">
            <h4>BREAKPOINTS</h4>
            <div class="devkit-input-row">
                <input type="text" id="emu-bp-addr" placeholder="0x82000000 or function name">
                <button class="devkit-btn" id="emu-bp-add">+ Add</button>
            </div>
            <div id="emu-bp-list" class="emu-bp-list"></div>
        </div>

        <!-- Call Stack -->
        <div class="emu-section hidden" id="emu-stack-section">
            <h4>CALL STACK</h4>
            <button class="devkit-btn" id="emu-stack-refresh" style="width:100%;margin-bottom:6px;">Refresh</button>
            <div id="emu-stack-list" class="emu-stack-list"></div>
        </div>

        <!-- Registers -->
        <div class="emu-section hidden" id="emu-reg-section">
            <h4>REGISTERS</h4>
            <button class="devkit-btn" id="emu-reg-refresh" style="width:100%;margin-bottom:6px;">Refresh Registers</button>
            <div id="emu-reg-grid" class="emu-reg-grid"></div>
        </div>

        <!-- Memory Inspector -->
        <div class="emu-section hidden" id="emu-mem-section">
            <h4>MEMORY</h4>
            <div class="devkit-input-row">
                <input type="text" id="emu-mem-addr" placeholder="0x82000000">
                <input type="number" id="emu-mem-size" value="256" style="width:60px;" min="16" max="4096" step="16">
                <button class="devkit-btn" id="emu-mem-read">Read</button>
            </div>
            <div id="emu-mem-dump" class="emu-mem-dump"></div>
        </div>`;

    // Load saved config
    ipcRenderer.invoke(IPC.EMU_GET_CONFIG).then((cfg: any) => {
        if (cfg.path) ($('emu-path') as HTMLInputElement).value = cfg.path;
    });

    // Browse for Nexia360.exe
    $('emu-browse-btn')?.addEventListener('click', async () => {
        const file = await ipcRenderer.invoke(IPC.FILE_SELECT_FILE, [{ name: 'Executable', extensions: ['exe'] }]);
        if (file) ($('emu-path') as HTMLInputElement).value = file;
    });

    // Save path
    $('emu-save-path')?.addEventListener('click', async () => {
        const p = ($('emu-path') as HTMLInputElement).value.trim();
        if (!p) { appendOutput('Enter path to Nexia360.exe\n'); return; }
        const result = await ipcRenderer.invoke(IPC.EMU_CONFIGURE, p);
        if (result.configured) {
            appendOutput('[Nexia 360] Emulator path saved.\n');
        } else {
            appendOutput('[Nexia 360] File not found at: ' + p + '\n');
        }
    });

    // Browse for XEX
    $('emu-xex-browse')?.addEventListener('click', async () => {
        const file = await ipcRenderer.invoke(IPC.FILE_SELECT_FILE, [{ name: 'Xbox Executable', extensions: ['xex'] }]);
        if (file) ($('emu-xex-path') as HTMLInputElement).value = file;
    });

    // Launch
    $('emu-launch-btn')?.addEventListener('click', async () => {
        const xex = ($('emu-xex-path') as HTMLInputElement).value.trim();
        if (!xex) { appendOutput('Select a XEX file to run.\n'); return; }
        const btn = $('emu-launch-btn') as HTMLButtonElement;
        btn.textContent = '⏳ Starting...';
        btn.disabled = true;
        const result = await ipcRenderer.invoke(IPC.EMU_LAUNCH, xex);
        if (result.success) {
            // Directly update UI — don't wait for events
            emuState = 'running';
            updateEmulatorUI();
        } else {
            appendOutput('[Nexia 360] ' + (result.error || 'Launch failed') + '\n');
            btn.textContent = '▶ Launch in Emulator';
            btn.disabled = false;
        }
    });

    // Controls — fetch debug data directly from the return values
    $('emu-pause-btn')?.addEventListener('click', async () => {
        const result = await ipcRenderer.invoke(IPC.EMU_PAUSE);
        if (result && result.paused) {
            emuState = 'paused';
            updateEmulatorUI();
            if (result.registers) updateRegisters(result.registers);
            if (result.backtrace) renderBacktrace(result.backtrace);
        }
    });
    $('emu-resume-btn')?.addEventListener('click', async () => {
        await ipcRenderer.invoke(IPC.EMU_RESUME);
        emuState = 'running';
        updateEmulatorUI();
    });
    $('emu-step-btn')?.addEventListener('click', async () => {
        const result = await ipcRenderer.invoke(IPC.EMU_STEP);
        if (result) {
            emuState = 'paused';
            updateEmulatorUI();
            if (result.registers) updateRegisters(result.registers);
            if (result.backtrace) renderBacktrace(result.backtrace);
        }
    });
    $('emu-step-over-btn')?.addEventListener('click', async () => {
        const result = await ipcRenderer.invoke(IPC.EMU_STEP_OVER);
        if (result) {
            emuState = 'paused';
            updateEmulatorUI();
            if (result.registers) updateRegisters(result.registers);
            if (result.backtrace) renderBacktrace(result.backtrace);
        }
    });
    $('emu-stop-btn')?.addEventListener('click', async () => {
        await ipcRenderer.invoke(IPC.EMU_STOP);
        emuState = 'stopped';
        updateEmulatorUI();
    });

    // Breakpoints
    $('emu-bp-add')?.addEventListener('click', () => {
        const addr = ($('emu-bp-addr') as HTMLInputElement).value.trim();
        if (!addr) return;
        ipcRenderer.invoke(IPC.EMU_BREAKPOINT_SET, addr);
        ($('emu-bp-addr') as HTMLInputElement).value = '';
        setTimeout(() => refreshBreakpointList(), 500);
    });
    ($('emu-bp-addr') as HTMLInputElement)?.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') $('emu-bp-add')?.click();
    });

    // Call Stack
    $('emu-stack-refresh')?.addEventListener('click', () => fetchDebugState());

    // Registers
    $('emu-reg-refresh')?.addEventListener('click', () => ipcRenderer.invoke(IPC.EMU_REGISTERS));

    // Memory read
    $('emu-mem-read')?.addEventListener('click', () => {
        const addr = ($('emu-mem-addr') as HTMLInputElement).value.trim();
        const size = parseInt(($('emu-mem-size') as HTMLInputElement).value) || 256;
        if (!addr) return;
        ipcRenderer.invoke(IPC.EMU_MEMORY_READ, addr, size);
    });

    // Listen for emulator events from main process
    ipcRenderer.on(IPC.EMU_EVENT, (_e: any, event: any) => {
        handleEmulatorEvent(event);
    });
}

function handleEmulatorEvent(event: any) {
    switch (event.event) {
        case 'state':
            emuState = event.state;
            updateEmulatorUI();
            break;

        case 'registers':
            if (event.registers) updateRegisters(event.registers);
            break;

        case 'memory':
            renderMemoryDump(event.addr, event.data);
            break;

        case 'breakpoints':
            renderBreakpoints(event.list || []);
            break;

        case 'breakpoint_hit':
            appendOutput(`[GDB] ● Breakpoint hit at ${event.addr}${event.func ? ' (' + event.func + ')' : ''}\n`);
            break;

        case 'backtrace':
            renderBacktrace(event.frames || []);
            break;

        case 'paused':
            emuState = 'paused';
            updateEmulatorUI();
            if (event.registers) updateRegisters(event.registers);
            if (event.backtrace) renderBacktrace(event.backtrace);
            break;

        case 'resumed':
            emuState = 'running';
            updateEmulatorUI();
            break;

        case 'stopped':
            emuState = 'stopped';
            updateEmulatorUI();
            break;

        case 'gdb_console':
            // GDB console output — show in output
            if (event.text) appendOutput(event.text);
            break;
    }
}

/**
 * Fetch registers and backtrace from GDB — called when paused or after step.
 */
async function fetchDebugState() {
    try {
        // Fetch registers (result comes back via EMU_EVENT)
        const regs = await ipcRenderer.invoke(IPC.EMU_REGISTERS);
        if (regs) updateRegisters(regs);

        // Fetch backtrace
        const bt = await ipcRenderer.invoke(IPC.EMU_BACKTRACE);
        if (bt && bt.length > 0) renderBacktrace(bt);

        // Fetch breakpoint list
        const bps = await ipcRenderer.invoke(IPC.EMU_BREAKPOINT_LIST);
        if (bps) renderBreakpoints(bps);
    } catch (err: any) {
        // GDB might not be attached
    }
}

function updateEmulatorUI() {
    const dot = $('emu-dot') as HTMLElement;
    const text = $('emu-status-text') as HTMLElement;
    const controls = $('emu-controls') as HTMLElement;
    const launchBtn = $('emu-launch-btn') as HTMLButtonElement;
    const bpSection = $('emu-bp-section') as HTMLElement;
    const stackSection = $('emu-stack-section') as HTMLElement;
    const regSection = $('emu-reg-section') as HTMLElement;
    const memSection = $('emu-mem-section') as HTMLElement;

    if (!dot) return;

    const running = emuState === 'running' || emuState === 'paused';

    dot.className = 'emu-status-dot ' + emuState;
    const labels: Record<string, string> = {
        stopped: 'Stopped', starting: 'Starting...', running: 'Running', paused: '⏸ Paused'
    };
    text.textContent = labels[emuState] || emuState;

    controls.classList.toggle('hidden', emuState === 'stopped');
    launchBtn.textContent = '▶ Launch in Emulator';
    launchBtn.disabled = running;

    const show = running ? 'remove' : 'add';
    bpSection?.classList[show]('hidden');
    stackSection?.classList[show]('hidden');
    regSection?.classList[show]('hidden');
    memSection?.classList[show]('hidden');

    // Pause/Resume button states
    const pauseBtn = $('emu-pause-btn') as HTMLButtonElement;
    const resumeBtn = $('emu-resume-btn') as HTMLButtonElement;
    if (pauseBtn) pauseBtn.disabled = emuState !== 'running';
    if (resumeBtn) resumeBtn.disabled = emuState !== 'paused';
}

function updateRegisters(regs: any) {
    const grid = $('emu-reg-grid');
    if (!grid) return;

    let html = '';
    // Special registers
    if (regs.pc) html += `<span class="emu-reg-name">PC</span><span class="emu-reg-val">${regs.pc}</span>`;
    if (regs.lr) html += `<span class="emu-reg-name">LR</span><span class="emu-reg-val">${regs.lr}</span>`;
    if (regs.ctr) html += `<span class="emu-reg-name">CTR</span><span class="emu-reg-val">${regs.ctr}</span>`;

    // All registers from GDB
    if (regs.gpr && regs.gpr.length > 0) {
        html += '<span class="emu-reg-divider" style="grid-column:1/-1;border-top:1px solid var(--border);margin:4px 0;"></span>';
        for (const reg of regs.gpr) {
            if (!reg.name) continue;
            html += `<span class="emu-reg-name">${escapeHtml(reg.name)}</span><span class="emu-reg-val">${escapeHtml(reg.value)}</span>`;
        }
    }

    grid.innerHTML = html;
}

function renderMemoryDump(addr: string, hexData: string) {
    const dump = $('emu-mem-dump');
    if (!dump || !hexData) return;

    const bytes = hexData.match(/.{1,2}/g) || [];
    const startAddr = parseInt(addr, 16) || 0;
    let html = '';

    for (let i = 0; i < bytes.length; i += 16) {
        const lineAddr = (startAddr + i).toString(16).toUpperCase().padStart(8, '0');
        const hexPart = bytes.slice(i, i + 16).map(b => b.toUpperCase()).join(' ');
        const asciiPart = bytes.slice(i, i + 16).map(b => {
            const code = parseInt(b, 16);
            return code >= 32 && code < 127 ? String.fromCharCode(code) : '.';
        }).join('');

        html += `<div class="emu-mem-line"><span class="emu-mem-addr">${lineAddr}</span> <span class="emu-mem-hex">${hexPart.padEnd(47)}</span> <span class="emu-mem-ascii">${asciiPart}</span></div>`;
    }

    dump.innerHTML = html;
}

async function refreshBreakpointList() {
    const list = await ipcRenderer.invoke(IPC.EMU_BREAKPOINT_LIST);
    if (list) renderBreakpoints(list);
}

function renderBreakpoints(bps: any[]) {
    const listEl = $('emu-bp-list');
    if (!listEl) return;

    if (!bps || bps.length === 0) {
        listEl.innerHTML = '<div style="color:var(--text-dim);font-size:11px;padding:4px;">No breakpoints set</div>';
        return;
    }

    listEl.innerHTML = '';
    for (const bp of bps) {
        const row = document.createElement('div');
        row.className = 'emu-bp-entry';
        row.innerHTML = `
            <span class="emu-bp-dot ${bp.enabled ? 'active' : 'disabled'}">●</span>
            <span class="emu-bp-addr">${bp.addr}</span>
            ${bp.hitCount ? `<span class="emu-bp-hits">(${bp.hitCount}×)</span>` : ''}
            <button class="emu-bp-remove" title="Remove">✕</button>`;
        row.querySelector('.emu-bp-remove')?.addEventListener('click', () => {
            ipcRenderer.invoke(IPC.EMU_BREAKPOINT_REMOVE, bp.id);
            setTimeout(() => refreshBreakpointList(), 500);
        });
        listEl.appendChild(row);
    }
}

function renderBacktrace(frames: string[]) {
    const listEl = $('emu-stack-list');
    if (!listEl) return;

    if (!frames || frames.length === 0) {
        listEl.innerHTML = '<div style="color:var(--text-dim);font-size:11px;padding:4px;">No frames</div>';
        return;
    }

    listEl.innerHTML = '';
    for (const frame of frames) {
        const row = document.createElement('div');
        row.className = 'emu-stack-frame';
        row.textContent = frame;
        listEl.appendChild(row);
    }
}

// ══════════════════════════════════════
//  SETUP WIZARD
// ══════════════════════════════════════
async function checkSetup(appState: any) {
    if (appState.sdkConfigured) {
        const sdkRoot = appState.sdkPaths.root;
        const badge = appState.sdkBundled
            ? '<span class="sdk-bundled-badge">📦 Bundled</span>'
            : '<span class="sdk-system-badge">💻 System</span>';
        $('setup-sdk-status').className = 'sdk-found';
        $('setup-sdk-status').innerHTML = `✓ Xbox 360 SDK detected ${badge}<br><span style="font-size:11px;color:var(--text-dim)">${sdkRoot}</span>`;
        ($('setup-sdk-path') as HTMLInputElement).value = sdkRoot;
        $('status-sdk').textContent = appState.sdkBundled
            ? '✓ SDK: Bundled'
            : `✓ SDK: ${nodePath.basename(sdkRoot)}`;
        // Hide download section if SDK is found
        $('setup-sdk-download').classList.add('hidden');
    } else {
        $('setup-sdk-status').className = 'sdk-missing';
        $('setup-sdk-status').textContent = '✗ Xbox 360 SDK not found';
        $('status-sdk').textContent = '✗ SDK not configured';
        $('statusbar').classList.add('status-error');
        // Show download section
        $('setup-sdk-download').classList.remove('hidden');
    }
    if (appState.firstRun) $('setup-overlay').classList.remove('hidden');
}

$('setup-browse').addEventListener('click', async () => {
    const dir = await ipcRenderer.invoke(IPC.FILE_SELECT_DIR);
    if (dir) ($('setup-sdk-path') as HTMLInputElement).value = dir;
});
$('setup-detect').addEventListener('click', async () => {
    const result = await ipcRenderer.invoke(IPC.SDK_DETECT);
    if (result && result.paths) {
        ($('setup-sdk-path') as HTMLInputElement).value = result.paths.root;
        const badge = result.bundled
            ? '<span class="sdk-bundled-badge">📦 Bundled</span>'
            : '<span class="sdk-system-badge">💻 System</span>';
        $('setup-sdk-status').className = 'sdk-found';
        $('setup-sdk-status').innerHTML = `✓ Found SDK ${badge}<br><span style="font-size:11px;color:var(--text-dim)">${result.paths.root}</span>`;
        $('setup-sdk-download').classList.add('hidden');
    } else {
        $('setup-sdk-status').className = 'sdk-missing';
        $('setup-sdk-status').textContent = '✗ Could not auto-detect. Browse manually or download below.';
        $('setup-sdk-download').classList.remove('hidden');
    }
});
$('setup-download-btn').addEventListener('click', () => {
    // Open SDK download page in the user's browser
    shell.openExternal('https://archive.org/download/xbox-360-sdk-21256.3_202204/XBOX360%20SDK%2021256.3.zip');
    appendOutput('SDK download page opened in browser. After installing, click Auto-Detect.\n');
});
$('setup-done').addEventListener('click', async () => {
    const p = ($('setup-sdk-path') as HTMLInputElement).value;
    if (p) {
        const r = await ipcRenderer.invoke(IPC.SDK_CONFIGURE, p);
        if (r) {
            $('status-sdk').textContent = `✓ SDK: ${nodePath.basename(r.root)}`;
            $('statusbar').classList.remove('status-error');
        }
    }
    await ipcRenderer.invoke(IPC.APP_SHOW_SETUP);
    $('setup-overlay').classList.add('hidden');
});
$('setup-skip').addEventListener('click', async () => {
    await ipcRenderer.invoke(IPC.APP_SHOW_SETUP);
    $('setup-overlay').classList.add('hidden');
});

$('btn-settings').addEventListener('click', () => showSettingsPanel());

function showSettingsPanel() {
    // Populate current values
    (document.querySelectorAll('#settings-dialog input[type="color"]') as NodeListOf<HTMLInputElement>).forEach(inp => {
        const key = inp.dataset.setting as keyof UserSettings;
        if (key && userSettings[key]) inp.value = userSettings[key] as string;
    });
    ($('setting-font-size') as HTMLInputElement).value = String(userSettings.fontSize);
    ($('setting-fancy-effects') as HTMLInputElement).checked = userSettings.fancyEffects;
    $('settings-overlay').classList.remove('hidden');
}

// Settings dialog event delegation
document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.id === 'settings-close') {
        $('settings-overlay').classList.add('hidden');
    }
    if (target.id === 'settings-reset') {
        userSettings = { ...DEFAULT_SETTINGS };
        saveUserSettings();
        applyThemeColors();
        applyFancyMode();
        if (editor) editor.updateOptions({ fontSize: userSettings.fontSize });
        $('status-zoom').textContent = '100%';
        showSettingsPanel(); // refresh inputs
    }
    if (target.id === 'settings-open-setup') {
        $('settings-overlay').classList.add('hidden');
        $('setup-overlay').classList.remove('hidden');
    }
    if (target.id === 'settings-retake-tour') {
        $('settings-overlay').classList.add('hidden');
        setTimeout(() => startTour(), 300);
    }
    if (target.id === 'settings-reset-learning') {
        if (confirm('Reset all learning progress? This clears your skill level, achievements, curriculum progress, and dismissed tips. You will see the onboarding wizard again on next launch.')) {
            userProfile = { ...DEFAULT_PROFILE };
            saveProfile();
            renderLearnPanel();
            renderTipsPanel();
            $('settings-overlay').classList.add('hidden');
            appendOutput('Learning progress reset. Restart to see onboarding wizard.\n');
        }
    }
    if (target.id === 'settings-factory-reset') {
        if (confirm('Factory reset EVERYTHING? This resets all theme colors, editor settings, learning progress, achievements, and tips. The IDE will return to its first-launch state.')) {
            userSettings = { ...DEFAULT_SETTINGS };
            saveUserSettings();
            applyThemeColors();
            applyFancyMode();
            if (editor) editor.updateOptions({ fontSize: 14 });
            $('status-zoom').textContent = '100%';
            userProfile = { ...DEFAULT_PROFILE };
            saveProfile();
            renderLearnPanel();
            renderTipsPanel();
            $('settings-overlay').classList.add('hidden');
            appendOutput('Factory reset complete. Restart to see onboarding wizard.\n');
        }
    }
});

// Live-update colors as user picks them
document.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    if (!target.dataset.setting) return;
    const key = target.dataset.setting as keyof UserSettings;
    if (key === 'fontSize') {
        const v = parseInt(target.value) || 14;
        userSettings.fontSize = Math.max(8, Math.min(40, v));
        if (editor) editor.updateOptions({ fontSize: userSettings.fontSize });
        $('status-zoom').textContent = `${Math.round((userSettings.fontSize / 14) * 100)}%`;
    } else {
        (userSettings as any)[key] = target.value;
    }
    applyThemeColors();
    saveUserSettings();
});

// Fancy effects toggle
document.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.id === 'setting-fancy-effects') {
        userSettings.fancyEffects = target.checked;
        applyFancyMode();
        saveUserSettings();
    }
});

// Theme presets
const PRESETS: Record<string, Partial<UserSettings>> = {
    xbox:   { accentColor: '#4ec9b0', bgDark: '#181818', bgMain: '#1e1e1e', bgPanel: '#1e1e1e', bgSidebar: '#252526', editorBg: '#1e1e1e', textColor: '#cccccc', textDim: '#858585' },
    red:    { accentColor: '#f14c4c', bgDark: '#1c1616', bgMain: '#221a1a', bgPanel: '#221a1a', bgSidebar: '#2a2020', editorBg: '#221a1a', textColor: '#d4c8c8', textDim: '#8a7070' },
    blue:   { accentColor: '#4fc1ff', bgDark: '#16181c', bgMain: '#1a1e24', bgPanel: '#1a1e24', bgSidebar: '#20242a', editorBg: '#1a1e24', textColor: '#ccd0d8', textDim: '#6878889' },
    purple: { accentColor: '#c586c0', bgDark: '#1c1620', bgMain: '#221a26', bgPanel: '#221a26', bgSidebar: '#28202e', editorBg: '#221a26', textColor: '#d4ccd8', textDim: '#8a7090' },
    orange: { accentColor: '#ce9178', bgDark: '#1c1816', bgMain: '#241e1a', bgPanel: '#241e1a', bgSidebar: '#2a2420', editorBg: '#241e1a', textColor: '#d8d0c8', textDim: '#8a7868' },
    mono:   { accentColor: '#cccccc', bgDark: '#141414', bgMain: '#1a1a1a', bgPanel: '#1a1a1a', bgSidebar: '#222222', editorBg: '#1a1a1a', textColor: '#d4d4d4', textDim: '#808080' },
};

document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const preset = target.dataset?.preset || target.closest('[data-preset]')?.getAttribute('data-preset');
    if (preset && PRESETS[preset]) {
        Object.assign(userSettings, PRESETS[preset]);
        saveUserSettings();
        applyThemeColors();
        showSettingsPanel(); // refresh color inputs
    }
});

// ══════════════════════════════════════
//  ONBOARDING WIZARD
// ══════════════════════════════════════
function showOnboarding() {
    $('onboarding-overlay').classList.remove('hidden');
    setOnboardingStep(1);
}

function setOnboardingStep(step: number) {
    document.querySelectorAll('.ob-step').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.ob-dot').forEach(d => d.classList.remove('active'));
    const stepEl = document.querySelector(`.ob-step[data-step="${step}"]`);
    const dotEl = document.querySelector(`.ob-dot[data-dot="${step}"]`);
    if (stepEl) stepEl.classList.add('active');
    if (dotEl) dotEl.classList.add('active');
}

function finishOnboarding() {
    userProfile.onboardingComplete = true;
    saveProfile();
    $('onboarding-overlay').classList.add('hidden');
    renderLearnPanel();
}

// Wire onboarding buttons
$('ob-next-1').addEventListener('click', () => setOnboardingStep(2));
$('ob-next-3').addEventListener('click', () => { finishOnboarding(); setTimeout(() => startTour(), 400); });
$('ob-skip').addEventListener('click', () => finishOnboarding());

// Skill level selection
document.querySelectorAll('.ob-skill-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.ob-skill-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        userProfile.skillLevel = (card as HTMLElement).dataset.level as any;
        userProfile.tipsEnabled = userProfile.skillLevel !== 'expert';
        saveProfile();
        // Auto-advance after a short delay
        setTimeout(() => setOnboardingStep(3), 400);
    });
});

// ══════════════════════════════════════
//  GUIDED UI TOUR
// ══════════════════════════════════════
interface TourStep {
    target: string;        // CSS selector for the element to spotlight
    icon: string;
    title: string;
    body: string;
    position: 'bottom' | 'top' | 'right' | 'left';  // where card appears relative to target
    setup?: () => void;    // optional: run before showing this step
}

const TOUR_STEPS: TourStep[] = [
    {
        target: '#titlebar',
        icon: '🪟', title: 'Title Bar & Window Controls',
        body: 'The title bar shows your current project name. Use the minimize, maximize, and close buttons on the right — or drag anywhere to move the window.',
        position: 'bottom',
    },
    {
        target: '#menubar',
        icon: '📋', title: 'Menu Bar',
        body: 'Access all IDE features from the menus. File for projects, Edit for find/replace, Build for compiling, and View for toggling panels. Most actions have keyboard shortcuts shown next to them.',
        position: 'bottom',
    },
    {
        target: '#toolbar',
        icon: '🔧', title: 'Toolbar',
        body: 'Your quick-access buttons. Build (F7), Rebuild, Clean, and Deploy to Devkit are all one click away. The dropdown selects Debug, Release, or Profile configuration.',
        position: 'bottom',
    },
    {
        target: '#sidebar',
        icon: '📁', title: 'Sidebar — Explorer',
        body: 'Your project\'s file tree. Click files to open them in the editor. Right-click for Rename, Delete, and New File options. The tabs switch between Explorer, Search, Extensions, Devkit, and Learn.',
        position: 'right',
        setup: () => {
            // Make sure explorer tab is active
            const expTab = document.querySelector('[data-panel="explorer"]') as HTMLElement;
            if (expTab) expTab.click();
        },
    },
    {
        target: '#editor-area',
        icon: '📝', title: 'Code Editor',
        body: 'A full-featured code editor with syntax highlighting, auto-complete, and bracket matching. Open multiple files as tabs — right-click tabs for Close Others, Copy Path, and more. Ctrl+G jumps to a line number.',
        position: 'left',
    },
    {
        target: '#bottom-panel',
        icon: '📊', title: 'Output & Problems',
        body: 'Build output appears here in real-time. The Problems tab shows clickable errors and warnings — click one to jump straight to the problem line. The Tips tab has Xbox 360 development tips.',
        position: 'top',
        setup: () => {
            if (!bottomPanelVisible) toggleBottomPanel();
        },
    },
    {
        target: '#statusbar',
        icon: '📶', title: 'Status Bar',
        body: 'Shows build status (Ready/Building/Succeeded/Failed), SDK detection, cursor position, zoom level, file encoding, and language mode. Green means everything is good to go.',
        position: 'top',
    },
    {
        target: '[data-panel="learn"]',
        icon: '🎓', title: 'Learn Panel',
        body: 'Click here to open the Learn panel — it tracks your progress through the Xbox 360 development curriculum with step-by-step goals and achievements. Complete milestones to unlock new challenges!',
        position: 'right',
        setup: () => {
            // Flash the learn tab
            const learnTab = document.querySelector('[data-panel="learn"]') as HTMLElement;
            if (learnTab) learnTab.style.animation = 'tour-pulse 1s ease 3';
        },
    },
    {
        target: '#welcome-content',
        icon: '🚀', title: 'You\'re All Set!',
        body: 'Click "New Project" to create your first Xbox 360 project, or "Open Project" to load an existing one. Check the Learn panel for a guided curriculum that will walk you through building your first game. Happy coding!',
        position: 'top',
    },
];

let tourStep = 0;
let tourActive = false;

function startTour() {
    tourStep = 0;
    tourActive = true;
    $('tour-overlay').classList.remove('hidden');
    showTourStep();
}

function endTour() {
    tourActive = false;
    $('tour-overlay').classList.add('hidden');
    // Show first tip after tour ends
    setTimeout(() => triggerTip('first-launch'), 1500);
}

function showTourStep() {
    const step = TOUR_STEPS[tourStep];
    if (!step) { endTour(); return; }

    // Run setup if present
    if (step.setup) step.setup();

    // Update card content
    $('tour-step-badge').textContent = `${tourStep + 1} / ${TOUR_STEPS.length}`;
    $('tour-icon').textContent = step.icon;
    $('tour-title').textContent = step.title;
    $('tour-body').textContent = step.body;

    // Update button states
    ($('tour-prev') as HTMLButtonElement).disabled = tourStep === 0;
    $('tour-next').textContent = tourStep === TOUR_STEPS.length - 1 ? 'Finish ✓' : 'Next →';

    // Position spotlight on target
    const target = document.querySelector(step.target) as HTMLElement;
    const spotlight = $('tour-spotlight');
    const card = $('tour-card');

    if (target) {
        const rect = target.getBoundingClientRect();
        const pad = 6;
        spotlight.style.left = (rect.left - pad) + 'px';
        spotlight.style.top = (rect.top - pad) + 'px';
        spotlight.style.width = (rect.width + pad * 2) + 'px';
        spotlight.style.height = (rect.height + pad * 2) + 'px';
        spotlight.style.display = 'block';

        // Position card relative to target
        positionTourCard(card, rect, step.position);
    } else {
        // Fallback: center the card
        spotlight.style.display = 'none';
        card.style.left = '50%';
        card.style.top = '50%';
        card.style.transform = 'translate(-50%, -50%)';
    }

    // Reset animation
    card.style.animation = 'none';
    card.offsetHeight; // force reflow
    card.style.animation = 'tour-card-appear 0.3s ease';
}

function positionTourCard(card: HTMLElement, targetRect: DOMRect, pos: string) {
    const gap = 16;
    const cardW = 340;
    const cardH = 200; // approximate
    card.style.transform = 'none';

    switch (pos) {
        case 'bottom':
            card.style.left = Math.max(8, Math.min(targetRect.left, window.innerWidth - cardW - 8)) + 'px';
            card.style.top = (targetRect.bottom + gap) + 'px';
            break;
        case 'top':
            card.style.left = Math.max(8, Math.min(targetRect.left, window.innerWidth - cardW - 8)) + 'px';
            card.style.top = Math.max(8, targetRect.top - cardH - gap) + 'px';
            break;
        case 'right':
            card.style.left = (targetRect.right + gap) + 'px';
            card.style.top = Math.max(8, targetRect.top) + 'px';
            break;
        case 'left':
            card.style.left = Math.max(8, targetRect.left - cardW - gap) + 'px';
            card.style.top = Math.max(8, targetRect.top) + 'px';
            break;
    }

    // Clamp to viewport
    const cardRect = card.getBoundingClientRect();
    if (cardRect.bottom > window.innerHeight - 8) {
        card.style.top = Math.max(8, window.innerHeight - cardH - 8) + 'px';
    }
    if (cardRect.right > window.innerWidth - 8) {
        card.style.left = Math.max(8, window.innerWidth - cardW - 8) + 'px';
    }
}

// Tour button handlers
$('tour-next').addEventListener('click', () => {
    if (tourStep >= TOUR_STEPS.length - 1) { endTour(); return; }
    tourStep++;
    showTourStep();
});
$('tour-prev').addEventListener('click', () => {
    if (tourStep > 0) { tourStep--; showTourStep(); }
});
$('tour-skip').addEventListener('click', () => endTour());

// Reposition on resize
window.addEventListener('resize', () => { if (tourActive) showTourStep(); });

// ══════════════════════════════════════
//  TIPS SYSTEM
// ══════════════════════════════════════
function triggerTip(trigger: string, match?: string) {
    if (!userProfile.tipsEnabled || tipCooldown) return;
    const tip = learning.getRandomTip(userProfile, trigger, match);
    if (!tip) return;
    showInlineTip(tip);
}

function showInlineTip(tip: any) {
    currentInlineTip = tip;
    $('tip-icon').textContent = tip.icon;
    $('tip-text').textContent = `${tip.title}: ${tip.body}`;
    $('inline-tip').classList.remove('hidden');
    // Position it above the editor
    const editorArea = $('editor-area');
    if (editorArea) {
        $('inline-tip').style.position = 'absolute';
        editorArea.style.position = 'relative';
        editorArea.appendChild($('inline-tip'));
    }
    // Set cooldown to avoid tip spam
    tipCooldown = true;
    setTimeout(() => { tipCooldown = false; }, 30000); // 30s between tips
    // Auto-hide after 15s
    setTimeout(() => { $('inline-tip').classList.add('hidden'); }, 15000);
}

$('tip-dismiss').addEventListener('click', () => {
    $('inline-tip').classList.add('hidden');
    if (currentInlineTip) {
        userProfile.dismissedTips.push(currentInlineTip.id);
        saveProfile();
    }
});

$('tip-more').addEventListener('click', () => {
    $('inline-tip').classList.add('hidden');
    showBottomPanel();
    // Switch to tips tab
    const tipBtn = document.querySelector('[data-panel="tips"]') as HTMLElement;
    if (tipBtn) tipBtn.click();
});

function renderTipsPanel() {
    const list = $('tips-list');
    if (!list) return;
    list.innerHTML = '';
    const categories = ['ide', 'xbox360', 'cpp', 'd3d', 'build'];
    for (const cat of categories) {
        const tips = learning.getCategoryTips(userProfile, cat);
        for (const tip of tips) {
            const card = document.createElement('div');
            card.className = 'tip-card';
            card.innerHTML = `
                <span class="tip-card-icon">${tip.icon}</span>
                <div class="tip-card-body">
                    <div class="tip-card-title">${tip.title}</div>
                    <div class="tip-card-text">${tip.body}</div>
                    <span class="tip-card-cat cat-${tip.category}">${tip.category}</span>
                </div>`;
            list.appendChild(card);
        }
    }
    if (list.children.length === 0) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-dim)">No tips to show. You have dismissed them all — nice work! 🎉</div>';
    }
}

// ══════════════════════════════════════
//  ACHIEVEMENTS
// ══════════════════════════════════════
function checkAchievements(context?: any) {
    const { ACHIEVEMENTS } = learning;
    for (const ach of ACHIEVEMENTS) {
        if (userProfile.completedAchievements.includes(ach.id)) continue;
        if (ach.check(userProfile, context)) {
            unlockAchievement(ach);
        }
    }
}

function unlockAchievement(ach: any) {
    if (userProfile.completedAchievements.includes(ach.id)) return;
    userProfile.completedAchievements.push(ach.id);
    saveProfile();
    showAchievementToast(ach);
    renderLearnPanel();
}

function showAchievementToast(ach: any) {
    $('ach-icon').textContent = ach.icon;
    $('ach-name').textContent = ach.name;
    $('ach-desc').textContent = ach.description;
    const toast = $('achievement-toast');
    toast.classList.remove('hidden');
    // Auto-hide after 5s
    setTimeout(() => { toast.classList.add('hidden'); }, 5000);
}

// Manually trigger specific achievements
function triggerAchievement(id: string) {
    const ach = learning.ACHIEVEMENTS.find((a: any) => a.id === id);
    if (ach && !userProfile.completedAchievements.includes(id)) {
        unlockAchievement(ach);
    }
}

// ══════════════════════════════════════
//  LEARN PANEL (sidebar)
// ══════════════════════════════════════
function renderLearnPanel() {
    const panel = $('learn-panel');
    if (!panel) return;
    panel.innerHTML = '';

    // Progress bar
    const totalAch = learning.ACHIEVEMENTS.length;
    const earnedAch = userProfile.completedAchievements.length;
    const pct = totalAch > 0 ? Math.round((earnedAch / totalAch) * 100) : 0;

    const progress = document.createElement('div');
    progress.className = 'learn-progress';
    progress.innerHTML = `
        <div class="learn-section-title">PROGRESS — ${earnedAch}/${totalAch} Achievements (${pct}%)</div>
        <div class="learn-progress-bar"><div class="learn-progress-fill" style="width:${pct}%"></div></div>`;
    panel.appendChild(progress);

    // Current goal
    const nextGoal = learning.getNextGoal(userProfile);
    if (nextGoal) {
        const goalDiv = document.createElement('div');
        goalDiv.className = 'learn-section';
        goalDiv.innerHTML = `<div class="learn-section-title">CURRENT GOAL</div>`;
        const goalCard = document.createElement('div');
        goalCard.className = 'learn-goal';
        goalCard.innerHTML = `
            <div class="learn-goal-header">
                <span class="learn-goal-icon">${nextGoal.icon}</span>
                <span class="learn-goal-title">${nextGoal.title}</span>
            </div>
            <div class="learn-goal-desc">${nextGoal.description}</div>
            ${nextGoal.steps.map((s: string, i: number) => `
                <div class="learn-step">
                    <span class="learn-step-num">${i + 1}</span>
                    <span>${s}</span>
                </div>`).join('')}`;
        goalDiv.appendChild(goalCard);
        panel.appendChild(goalDiv);
    } else {
        const done = document.createElement('div');
        done.className = 'learn-section';
        done.innerHTML = '<div class="learn-section-title">ALL GOALS COMPLETE! 🏆</div><p style="padding:0 12px;font-size:12px;color:var(--text-dim)">Congratulations! You have completed the entire Xbox 360 development curriculum.</p>';
        panel.appendChild(done);
    }

    // Achievements list
    const achSection = document.createElement('div');
    achSection.className = 'learn-section';
    achSection.innerHTML = '<div class="learn-section-title">ACHIEVEMENTS</div>';
    const grid = document.createElement('div');
    grid.className = 'ach-grid';

    const { earned, locked } = learning.getAchievementProgress(userProfile);
    for (const a of earned) {
        const item = document.createElement('div');
        item.className = 'ach-item earned';
        item.innerHTML = `<span class="ach-item-icon">${a.icon}</span><div><div class="ach-item-name">${a.name}</div><div class="ach-item-desc">${a.description}</div></div>`;
        grid.appendChild(item);
    }
    for (const a of locked) {
        const item = document.createElement('div');
        item.className = 'ach-item locked';
        item.innerHTML = `<span class="ach-item-icon">${a.icon}</span><div><div class="ach-item-name">${a.name}</div><div class="ach-item-desc">${a.description}</div></div>`;
        grid.appendChild(item);
    }
    achSection.appendChild(grid);
    panel.appendChild(achSection);

    // Skill level indicator
    const skillDiv = document.createElement('div');
    skillDiv.className = 'learn-section';
    const levelIcons: Record<string, string> = { beginner: '🌱', intermediate: '🔧', expert: '⚡' };
    skillDiv.innerHTML = `
        <div class="learn-section-title">SKILL LEVEL</div>
        <div style="padding:8px 0;font-size:13px;color:var(--text)">
            ${levelIcons[userProfile.skillLevel] || '🌱'} ${userProfile.skillLevel.charAt(0).toUpperCase() + userProfile.skillLevel.slice(1)}
            <span style="font-size:11px;color:var(--text-dim);margin-left:8px">Tips: ${userProfile.tipsEnabled ? 'ON' : 'OFF'}</span>
        </div>`;
    panel.appendChild(skillDiv);
}

// ══════════════════════════════════════
//  LEARNING HOOKS (connect to IDE events)
// ══════════════════════════════════════
function onBuildComplete(result: any) {
    if (result.success) {
        userProfile.totalBuilds++;
        if (!userProfile.firstBuildDate) userProfile.firstBuildDate = new Date().toISOString();
        saveProfile();
        checkAchievements();
        triggerTip('build-success');

        // Check for zero-warnings achievement
        if ((result.warnings || []).length === 0 && (result.errors || []).length === 0) {
            triggerAchievement('master-clean-build');
        }
    } else {
        triggerTip('build-fail');
    }
    renderLearnPanel();
}

function onFileOpened(filePath: string) {
    const ext = nodePath.extname(filePath).toLowerCase();
    const baseName = nodePath.basename(filePath).toLowerCase();

    triggerTip('file-open', ext);

    // Achievement triggers
    if (baseName === 'stdafx.h') triggerAchievement('learn-pch');
    if (ext === '.hlsl' || ext === '.fx') triggerAchievement('learn-shader');
}

function onProjectCreated() {
    triggerAchievement('first-project');
    triggerTip('project-create');
    renderLearnPanel();
}

function onDeploy() {
    userProfile.totalDeploys++;
    saveProfile();
    checkAchievements();
    renderLearnPanel();
}

// Idle tip timer — show tips when the user hasn't done anything for a while
let idleTipTimer: any = null;
function resetIdleTipTimer() {
    if (idleTipTimer) clearTimeout(idleTipTimer);
    if (!userProfile.tipsEnabled) return;
    idleTipTimer = setTimeout(() => {
        triggerTip('editor-idle');
    }, 120000); // 2 minutes of idle
}
document.addEventListener('keydown', resetIdleTipTimer);
document.addEventListener('click', resetIdleTipTimer);

// ══════════════════════════════════════
//  QUIZ SYSTEM
// ══════════════════════════════════════
function startQuiz(category?: string, mode?: 'multiple-choice' | 'fill-in') {
    const allQ = quizzes.getQuizByCategory(category);
    quizMode = mode || 'multiple-choice';
    // Filter: MC questions need options, fill-in questions work without
    if (quizMode === 'fill-in') {
        quizQuestions = quizzes.shuffleArray(allQ).slice(0, 10);
    } else {
        quizQuestions = quizzes.shuffleArray(allQ.filter((q: any) => q.options)).slice(0, 10);
    }
    quizIndex = 0;
    quizAnswered = false;
    quizScore = { correct: 0, total: 0 };
    $('quiz-overlay').classList.remove('hidden');
    renderQuizQuestion();
}

function renderQuizQuestion() {
    if (quizIndex >= quizQuestions.length) { showQuizResults(); return; }
    const q = quizQuestions[quizIndex];
    quizAnswered = false;
    $('quiz-progress').textContent = `${quizIndex + 1} / ${quizQuestions.length}`;
    $('quiz-question').textContent = q.question;
    $('quiz-feedback').className = 'quiz-feedback hidden';
    $('quiz-ref').className = 'quiz-ref hidden';
    $('quiz-next').textContent = quizIndex < quizQuestions.length - 1 ? 'Next →' : 'Finish';

    // Show correct mode
    if (quizMode === 'fill-in' || !q.options) {
        $('quiz-mode-mc').style.display = 'none';
        $('quiz-mode-fill').style.display = 'block';
        ($('quiz-fill-input') as HTMLInputElement).value = '';
        ($('quiz-fill-input') as HTMLInputElement).focus();
    } else {
        $('quiz-mode-mc').style.display = 'block';
        $('quiz-mode-fill').style.display = 'none';
        const opts = $('quiz-options');
        opts.innerHTML = '';
        q.options.forEach((opt: string, i: number) => {
            const btn = document.createElement('button');
            btn.className = 'quiz-option';
            btn.textContent = opt;
            btn.addEventListener('click', () => answerQuizMC(i));
            opts.appendChild(btn);
        });
    }
}

function answerQuizMC(idx: number) {
    if (quizAnswered) return;
    quizAnswered = true;
    quizScore.total++;
    const q = quizQuestions[quizIndex];
    const correct = idx === q.answerIndex;
    if (correct) quizScore.correct++;

    const btns = $('quiz-options').querySelectorAll('.quiz-option');
    btns.forEach((b: any, i: number) => {
        if (i === q.answerIndex) b.classList.add('correct');
        else if (i === idx && !correct) b.classList.add('incorrect');
    });
    showQuizFeedback(correct, q);
}

function answerQuizFill() {
    if (quizAnswered) return;
    const input = ($('quiz-fill-input') as HTMLInputElement).value.trim();
    if (!input) return;
    quizAnswered = true;
    quizScore.total++;
    const q = quizQuestions[quizIndex];
    const correct = input.toLowerCase().includes(q.answer.toLowerCase());
    if (correct) quizScore.correct++;
    showQuizFeedback(correct, q);
}

function showQuizFeedback(correct: boolean, q: any) {
    const fb = $('quiz-feedback');
    fb.className = `quiz-feedback ${correct ? 'correct' : 'incorrect'}`;
    fb.textContent = correct ? '✓ Correct!' : `✗ Incorrect. The answer is: ${q.answer}`;
}

function showQuizResults() {
    const pct = quizScore.total > 0 ? Math.round((quizScore.correct / quizScore.total) * 100) : 0;
    $('quiz-question').textContent = `Quiz Complete! You scored ${quizScore.correct}/${quizScore.total} (${pct}%)`;
    $('quiz-options').innerHTML = '';
    $('quiz-mode-mc').style.display = 'none';
    $('quiz-mode-fill').style.display = 'none';
    $('quiz-feedback').className = 'quiz-feedback hidden';
    $('quiz-next').textContent = 'Close';
    $('quiz-progress').textContent = 'Done!';
    // Update profile stats
    renderLearnPanel();
}

// Wire quiz buttons
$('quiz-next').addEventListener('click', () => {
    if (quizIndex >= quizQuestions.length) { $('quiz-overlay').classList.add('hidden'); return; }
    quizIndex++;
    renderQuizQuestion();
});
$('quiz-close').addEventListener('click', () => $('quiz-overlay').classList.add('hidden'));
$('quiz-ref-btn').addEventListener('click', () => {
    if (quizIndex < quizQuestions.length) {
        $('quiz-ref').classList.remove('hidden');
        $('quiz-ref-text').textContent = quizQuestions[quizIndex].reference;
    }
});
$('quiz-note-btn').addEventListener('click', () => {
    if (quizIndex < quizQuestions.length) {
        const q = quizQuestions[quizIndex];
        flashcards.push({ front: q.question, back: q.answer + ' — ' + q.reference });
        saveFlashcards();
        appendOutput(`📌 Saved flashcard: "${q.question.substring(0, 40)}..."\n`);
    }
});
$('quiz-fill-submit').addEventListener('click', answerQuizFill);

// ══════════════════════════════════════
//  FLASHCARD SYSTEM
// ══════════════════════════════════════
function loadFlashcards() {
    try {
        const file = nodePath.join(nodeOs.homedir(), '.nexia-ide-flashcards.json');
        if (nodeFs.existsSync(file)) flashcards = JSON.parse(nodeFs.readFileSync(file, 'utf-8'));
    } catch {}
}
function saveFlashcards() {
    try { nodeFs.writeFileSync(nodePath.join(nodeOs.homedir(), '.nexia-ide-flashcards.json'), JSON.stringify(flashcards, null, 2)); } catch {}
}

function showFlashcards() {
    if (flashcards.length === 0) {
        alert('No flashcards yet! Take a quiz and click "Save as Flashcard" to create some, or add them from the Study panel.');
        return;
    }
    fcIndex = 0;
    $('flashcard-overlay').classList.remove('hidden');
    renderFlashcard();
}

function renderFlashcard() {
    if (flashcards.length === 0) return;
    const fc = flashcards[fcIndex];
    $('fc-front-text').textContent = fc.front;
    $('fc-back-text').textContent = fc.back;
    $('fc-progress').textContent = `${fcIndex + 1} / ${flashcards.length}`;
    document.getElementById('flashcard')!.classList.remove('flipped');
}

$('flashcard').addEventListener('click', () => document.getElementById('flashcard')!.classList.toggle('flipped'));
$('fc-flip').addEventListener('click', () => document.getElementById('flashcard')!.classList.toggle('flipped'));
$('fc-prev').addEventListener('click', () => { if (fcIndex > 0) { fcIndex--; renderFlashcard(); } });
$('fc-next').addEventListener('click', () => { if (fcIndex < flashcards.length - 1) { fcIndex++; renderFlashcard(); } });
$('fc-close').addEventListener('click', () => $('flashcard-overlay').classList.add('hidden'));

// ══════════════════════════════════════
//  STUDY NOTES
// ══════════════════════════════════════
function getNotesFile(): string {
    if (currentProject) return nodePath.join(currentProject.path, 'study-notes.txt');
    return nodePath.join(nodeOs.homedir(), '.nexia-ide-notes.txt');
}

function showNotes() {
    try {
        const file = getNotesFile();
        if (nodeFs.existsSync(file)) studyNotes = nodeFs.readFileSync(file, 'utf-8');
    } catch {}
    ($('notes-editor') as HTMLTextAreaElement).value = studyNotes;
    $('notes-overlay').classList.remove('hidden');
}

$('notes-save').addEventListener('click', () => {
    studyNotes = ($('notes-editor') as HTMLTextAreaElement).value;
    try { nodeFs.writeFileSync(getNotesFile(), studyNotes, 'utf-8'); } catch {}
    $('notes-overlay').classList.add('hidden');
    appendOutput('📓 Study notes saved.\n');
});

$('notes-export').addEventListener('click', () => {
    const content = ($('notes-editor') as HTMLTextAreaElement).value;
    const { dialog } = require('electron').remote || {};
    // Fallback: save to project or home
    const dest = currentProject
        ? nodePath.join(currentProject.path, 'study-notes-export.txt')
        : nodePath.join(nodeOs.homedir(), 'Desktop', 'nexia-study-notes.txt');
    try { nodeFs.writeFileSync(dest, content, 'utf-8'); appendOutput(`📓 Notes exported to: ${dest}\n`); } catch {}
});

// ══════════════════════════════════════
//  STUDY PANEL (sidebar)
// ══════════════════════════════════════
function renderStudyPanel() {
    const panel = $('study-panel');
    if (!panel) return;
    panel.innerHTML = '';

    // Stats
    const statsDiv = document.createElement('div');
    statsDiv.className = 'study-stats';
    statsDiv.innerHTML = `
        <div class="study-stat"><div class="study-stat-num">${flashcards.length}</div><div class="study-stat-label">Flashcards</div></div>
        <div class="study-stat"><div class="study-stat-num">${quizzes.QUIZ_BANK.length}</div><div class="study-stat-label">Quiz Questions</div></div>`;
    panel.appendChild(statsDiv);

    // Actions
    const section = document.createElement('div');
    section.className = 'study-section';
    section.innerHTML = '<div class="learn-section-title">STUDY TOOLS</div>';

    const cats = quizzes.getQuizCategories();
    // Quiz buttons per category
    for (const cat of cats) {
        const btn = document.createElement('button');
        btn.className = 'study-btn';
        btn.innerHTML = `<span class="study-btn-icon">📝</span><div><div class="study-btn-label">${cat} Quiz</div><div class="study-btn-desc">Multiple choice questions</div></div>`;
        btn.addEventListener('click', () => startQuiz(cat, 'multiple-choice'));
        section.appendChild(btn);
    }

    // Fill-in quiz
    const fillBtn = document.createElement('button');
    fillBtn.className = 'study-btn';
    fillBtn.innerHTML = '<span class="study-btn-icon">✏️</span><div><div class="study-btn-label">Fill-in-the-Blank Quiz</div><div class="study-btn-desc">Type your answers — all categories</div></div>';
    fillBtn.addEventListener('click', () => startQuiz(undefined, 'fill-in'));
    section.appendChild(fillBtn);

    // Flashcards
    const fcBtn = document.createElement('button');
    fcBtn.className = 'study-btn';
    fcBtn.innerHTML = `<span class="study-btn-icon">🃏</span><div><div class="study-btn-label">Flashcards (${flashcards.length})</div><div class="study-btn-desc">Review saved cards</div></div>`;
    fcBtn.addEventListener('click', showFlashcards);
    section.appendChild(fcBtn);

    // Add flashcard manually
    const addFcBtn = document.createElement('button');
    addFcBtn.className = 'study-btn';
    addFcBtn.innerHTML = '<span class="study-btn-icon">➕</span><div><div class="study-btn-label">Add Flashcard</div><div class="study-btn-desc">Create a custom flashcard</div></div>';
    addFcBtn.addEventListener('click', () => {
        const front = prompt('Flashcard front (question):');
        if (!front) return;
        const back = prompt('Flashcard back (answer):');
        if (!back) return;
        flashcards.push({ front, back });
        saveFlashcards();
        renderStudyPanel();
    });
    section.appendChild(addFcBtn);

    // Study notes
    const notesBtn = document.createElement('button');
    notesBtn.className = 'study-btn';
    notesBtn.innerHTML = '<span class="study-btn-icon">📓</span><div><div class="study-btn-label">Study Notes</div><div class="study-btn-desc">Write and save personal notes</div></div>';
    notesBtn.addEventListener('click', showNotes);
    section.appendChild(notesBtn);

    panel.appendChild(section);
}

// ══════════════════════════════════════
//  COMMUNITY PANEL (Discord feed + invite)
// ══════════════════════════════════════
let discordFeedLoading = false;
let currentThreadView: string | null = null;
let discordAuthUser: { id: string; username: string; avatarUrl: string | null } | null = null;
let threadPollInterval: ReturnType<typeof setInterval> | null = null;
let feedPollInterval: ReturnType<typeof setInterval> | null = null;
let lastSeenMessageId: string | null = null;
const THREAD_POLL_MS = 5000;  // Poll thread messages every 5s
const FEED_POLL_MS = 30000;   // Poll feed every 30s

function stopThreadPoll() {
    if (threadPollInterval) { clearInterval(threadPollInterval); threadPollInterval = null; }
}

function startThreadPoll(threadId: string) {
    stopThreadPoll();
    threadPollInterval = setInterval(() => pollThreadMessages(threadId), THREAD_POLL_MS);
}

async function pollThreadMessages(threadId: string) {
    if (currentThreadView !== threadId || !lastSeenMessageId) return;

    try {
        const newMsgs = await ipcRenderer.invoke(IPC.DISCORD_GET_NEW_MESSAGES, threadId, lastSeenMessageId);
        if (!newMsgs || newMsgs.length === 0) return;

        const container = document.getElementById('thread-messages');
        if (!container) return;

        const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 40;

        for (const msg of newMsgs) {
            appendMessageToView(container, msg, true);
            lastSeenMessageId = msg.id;
        }

        // Auto-scroll if user was already at the bottom
        if (wasAtBottom) {
            container.scrollTop = container.scrollHeight;
        } else {
            // Show "new messages" indicator
            showNewMessagesBadge(container, newMsgs.length);
        }
    } catch {}
}

function showNewMessagesBadge(container: HTMLElement, count: number) {
    let badge = container.parentElement?.querySelector('.new-msgs-badge') as HTMLElement;
    if (!badge) {
        badge = document.createElement('div');
        badge.className = 'new-msgs-badge';
        badge.addEventListener('click', () => {
            container.scrollTop = container.scrollHeight;
            badge.remove();
        });
        container.parentElement?.insertBefore(badge, container.nextSibling);
    }
    badge.textContent = `↓ ${count} new message${count > 1 ? 's' : ''}`;
}

function stopFeedPoll() {
    if (feedPollInterval) { clearInterval(feedPollInterval); feedPollInterval = null; }
}

function startFeedPoll() {
    stopFeedPoll();
    feedPollInterval = setInterval(() => pollFeed(), FEED_POLL_MS);
}

async function pollFeed() {
    if (currentThreadView) return; // Don't poll feed while viewing a thread
    const feedEl = document.getElementById('community-feed');
    if (!feedEl || discordFeedLoading) return;

    try {
        const threads = await ipcRenderer.invoke(IPC.DISCORD_GET_FEED, true);
        if (!threads || threads.length === 0) return;

        // Check if feed content changed by comparing first thread's last message
        const firstCard = feedEl.querySelector('.discord-thread');
        const currentFirstId = firstCard?.getAttribute('data-thread-id');
        if (threads[0]?.id !== currentFirstId) {
            // Feed has new content — rebuild quietly
            renderFeedCards(feedEl, threads);
        }
    } catch {}
}

function renderCommunityPanel() {
    const panel = $('community-panel');
    if (!panel) return;

    panel.innerHTML = `
        <div class="community-header">
            <div class="community-invite">
                <span class="community-invite-icon">💬</span>
                <div>
                    <div class="community-invite-title">Nexia Discord</div>
                    <div class="community-invite-sub">Xbox 360 homebrew community</div>
                </div>
                <button class="community-join-btn" id="community-discord-btn">Join</button>
            </div>
        </div>
        <div class="discord-auth-bar" id="discord-auth-bar">
            <div class="discord-auth-loading">Checking login...</div>
        </div>
        <div class="community-feed-header">
            <span>📋 Software Tools Forum</span>
            <div style="display:flex;gap:4px;">
                <button class="community-action-btn" id="community-new-post-btn" title="New Post" style="display:none;">+ New</button>
                <button class="community-refresh-btn" id="community-refresh-btn" title="Refresh feed">↻</button>
                <button class="community-refresh-btn" id="community-settings-btn" title="Settings">⚙</button>
            </div>
        </div>
        <div id="community-feed" class="community-feed">
            <div class="community-feed-placeholder">
                <p>Configure a Discord bot to see forum posts here.</p>
                <button class="community-setup-btn" id="community-setup-btn">⚙ Setup Discord Feed</button>
            </div>
        </div>
        <div id="community-thread-view" class="community-thread-view hidden"></div>
    `;

    document.getElementById('community-discord-btn')!.addEventListener('click', () => shell.openExternal('https://discord.gg/d3AeCyH7bN'));
    document.getElementById('community-refresh-btn')!.addEventListener('click', () => loadDiscordFeed(true));
    document.getElementById('community-settings-btn')!.addEventListener('click', () => showDiscordSetup());
    document.getElementById('community-new-post-btn')!.addEventListener('click', () => showNewPostDialog());
    document.getElementById('community-setup-btn')!.addEventListener('click', () => showDiscordSetup());

    refreshAuthBar();
    loadDiscordFeed();
}

async function refreshAuthBar() {
    const bar = document.getElementById('discord-auth-bar');
    if (!bar) return;

    const result = await ipcRenderer.invoke(IPC.DISCORD_AUTH_USER);
    if (result.loggedIn) {
        discordAuthUser = { id: result.id, username: result.username, avatarUrl: result.avatarUrl };
        bar.innerHTML = `
            <div class="discord-auth-user">
                ${result.avatarUrl ? `<img class="discord-auth-avatar" src="${result.avatarUrl}" alt="">` : '<span class="discord-auth-avatar-placeholder">👤</span>'}
                <span class="discord-auth-name">${escapeHtml(result.username)}</span>
                <button class="discord-auth-logout" id="discord-logout-btn" title="Log out">Log out</button>
            </div>
        `;
        document.getElementById('discord-logout-btn')!.addEventListener('click', async () => {
            await ipcRenderer.invoke(IPC.DISCORD_AUTH_LOGOUT);
            discordAuthUser = null;
            refreshAuthBar();
            // Re-render thread view if open to hide reply bar
            if (currentThreadView) {
                const threadView = document.getElementById('community-thread-view');
                const replyBar = threadView?.querySelector('.thread-reply-bar') as HTMLElement;
                if (replyBar) replyBar.innerHTML = '<div class="thread-reply-login">Log in to reply</div>';
            }
        });
        // Show new post button
        const newBtn = document.getElementById('community-new-post-btn');
        if (newBtn) newBtn.style.display = '';
    } else {
        discordAuthUser = null;
        bar.innerHTML = `
            <div class="discord-auth-prompt">
                <span>Log in to post and reply</span>
                <button class="discord-auth-login" id="discord-login-btn">Login with Discord</button>
            </div>
        `;
        document.getElementById('discord-login-btn')!.addEventListener('click', async () => {
            const loginBtn = document.getElementById('discord-login-btn') as HTMLButtonElement;
            loginBtn.textContent = 'Waiting...';
            loginBtn.disabled = true;
            const result = await ipcRenderer.invoke(IPC.DISCORD_AUTH_START);
            if (result.success) {
                refreshAuthBar();
            } else {
                loginBtn.textContent = 'Login with Discord';
                loginBtn.disabled = false;
                if (result.error) appendOutput('Discord login: ' + result.error + '\n');
            }
        });
        // Hide new post button
        const newBtn = document.getElementById('community-new-post-btn');
        if (newBtn) newBtn.style.display = 'none';
    }
}

async function loadDiscordFeed(force: boolean = false) {
    const feedEl = document.getElementById('community-feed');
    if (!feedEl || discordFeedLoading) return;

    // Hide thread view, show feed
    const threadView = document.getElementById('community-thread-view');
    if (threadView) threadView.classList.add('hidden');
    feedEl.classList.remove('hidden');
    currentThreadView = null;
    lastSeenMessageId = null;
    stopThreadPoll();

    const config = await ipcRenderer.invoke(IPC.DISCORD_GET_CONFIG);
    if (!config.enabled) {
        feedEl.innerHTML = `
            <div class="community-feed-placeholder">
                <p>Connect a Discord bot to pull forum posts<br>from your server into the IDE.</p>
                <button class="community-setup-btn" id="community-setup-btn2">⚙ Setup Discord Feed</button>
            </div>`;
        document.getElementById('community-setup-btn2')?.addEventListener('click', () => showDiscordSetup());
        return;
    }

    discordFeedLoading = true;
    feedEl.innerHTML = '<div class="community-feed-loading">Loading forum threads...</div>';

    try {
        const threads = await ipcRenderer.invoke(IPC.DISCORD_GET_FEED, force);
        if (!threads || threads.length === 0) {
            feedEl.innerHTML = '<div class="community-feed-placeholder"><p>No forum threads found.<br>Check your channel ID and bot permissions.</p></div>';
            return;
        }
        feedEl.innerHTML = '';
        renderFeedCards(feedEl, threads);
    } catch (err: any) {
        feedEl.innerHTML = `<div class="community-feed-placeholder"><p>Failed to load feed:<br>${escapeHtml(err.message || 'Unknown error')}</p></div>`;
    } finally {
        discordFeedLoading = false;
        // Start feed polling
        startFeedPoll();
    }
}

function renderFeedCards(feedEl: HTMLElement, threads: any[]) {
    feedEl.innerHTML = '';
    for (const thread of threads) {
        const card = document.createElement('div');
        card.className = 'discord-thread' + (thread.pinned ? ' pinned' : '');
        card.setAttribute('data-thread-id', thread.id);
        const timeAgo = formatTimeAgo(thread.createdAt);
        const preview = escapeHtml(thread.preview);
        card.innerHTML = `
            <div class="discord-thread-header">
                ${thread.pinned ? '<span class="discord-pin">📌</span>' : ''}
                <span class="discord-thread-title">${escapeHtml(thread.name)}</span>
            </div>
            <div class="discord-thread-meta">
                <span class="discord-thread-author">${escapeHtml(thread.authorName)}</span>
                <span class="discord-thread-time">${timeAgo}</span>
                <span class="discord-thread-replies">💬 ${thread.messageCount}</span>
            </div>
            ${preview ? `<div class="discord-thread-preview">${preview}</div>` : ''}
        `;
        card.addEventListener('click', () => openThreadView(thread.id, thread.name));
        feedEl.appendChild(card);
    }
}

async function openThreadView(threadId: string, threadName: string) {
    const feedEl = document.getElementById('community-feed');
    const threadView = document.getElementById('community-thread-view');
    if (!feedEl || !threadView) return;

    feedEl.classList.add('hidden');
    threadView.classList.remove('hidden');
    currentThreadView = threadId;
    lastSeenMessageId = null;
    stopFeedPoll();
    stopThreadPoll();

    threadView.innerHTML = `
        <div class="thread-view-header">
            <button class="thread-back-btn" id="thread-back-btn">← Back</button>
            <span class="thread-view-title">${escapeHtml(threadName)}</span>
            <button class="thread-open-discord-btn" id="thread-open-discord" title="Open in Discord">↗</button>
        </div>
        <div class="thread-messages" id="thread-messages">
            <div class="community-feed-loading">Loading messages...</div>
        </div>
        <div class="thread-reply-bar" id="thread-reply-bar">
            ${discordAuthUser
                ? `<input type="text" id="thread-reply-input" placeholder="Reply as ${escapeHtml(discordAuthUser.username)}..." autocomplete="off">
                   <button class="thread-reply-send" id="thread-reply-send">Send</button>`
                : `<div class="thread-reply-login">Log in with Discord to reply</div>`
            }
        </div>
    `;

    document.getElementById('thread-back-btn')!.addEventListener('click', () => loadDiscordFeed(true));
    document.getElementById('thread-open-discord')!.addEventListener('click', () => {
        shell.openExternal(`https://discord.com/channels/@me/${threadId}`);
    });

    // Reply (only if logged in)
    if (discordAuthUser) {
        const replyInput = document.getElementById('thread-reply-input') as HTMLInputElement;
        const replySend = document.getElementById('thread-reply-send')!;
        const sendReply = async () => {
            const content = replyInput.value.trim();
            if (!content) return;
            replyInput.disabled = true;
            replySend.textContent = '...';
            const result = await ipcRenderer.invoke(IPC.DISCORD_REPLY, threadId, content);
            if (result.success) {
                replyInput.value = '';
                // Quick poll to pick up our own reply
                setTimeout(() => pollThreadMessages(threadId), 1000);
            } else {
                appendOutput('Reply failed: ' + (result.error || 'Unknown error') + '\n');
            }
            replyInput.disabled = false;
            replySend.textContent = 'Send';
            replyInput.focus();
        };
        replySend.addEventListener('click', sendReply);
        replyInput.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') sendReply(); });
    }

    await loadThreadMessages(threadId);
}

async function loadThreadMessages(threadId: string) {
    const container = document.getElementById('thread-messages');
    if (!container) return;

    try {
        const messages = await ipcRenderer.invoke(IPC.DISCORD_GET_MESSAGES, threadId);
        if (!messages || messages.length === 0) {
            container.innerHTML = '<div class="community-feed-placeholder"><p>No messages found.</p></div>';
            return;
        }

        container.innerHTML = '';
        for (const msg of messages) {
            appendMessageToView(container, msg, false);
        }

        // Track last message for polling
        lastSeenMessageId = messages[messages.length - 1].id;

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;

        // Start live polling
        startThreadPoll(threadId);

        // Auto-dismiss new messages badge when scrolled to bottom
        container.addEventListener('scroll', () => {
            if (container.scrollHeight - container.scrollTop - container.clientHeight < 40) {
                const badge = container.parentElement?.querySelector('.new-msgs-badge');
                if (badge) badge.remove();
            }
        });
    } catch (err: any) {
        container.innerHTML = `<div class="community-feed-placeholder"><p>Failed to load messages:<br>${escapeHtml(err.message || 'Error')}</p></div>`;
    }
}

function appendMessageToView(container: HTMLElement, msg: any, isNew: boolean) {
    const msgEl = document.createElement('div');
    msgEl.className = 'thread-message' + (msg.authorIsBot ? ' bot-message' : '') + (isNew ? ' new-message' : '');
    msgEl.setAttribute('data-msg-id', msg.id);

    let attachmentsHtml = '';
    if (msg.attachments && msg.attachments.length > 0) {
        attachmentsHtml = '<div class="msg-attachments">';
        for (const att of msg.attachments) {
            const sizeStr = formatFileSize(att.size);
            const isImage = att.contentType && att.contentType.startsWith('image/');
            attachmentsHtml += `
                <div class="msg-attachment" data-url="${escapeHtml(att.url)}" data-filename="${escapeHtml(att.filename)}">
                    <span class="msg-att-icon">${isImage ? '🖼' : '📎'}</span>
                    <div class="msg-att-info">
                        <span class="msg-att-name">${escapeHtml(att.filename)}</span>
                        <span class="msg-att-size">${sizeStr}</span>
                    </div>
                    <button class="msg-att-dl" title="Download">↓</button>
                </div>
            `;
        }
        attachmentsHtml += '</div>';
    }

    let embedsHtml = '';
    if (msg.embeds && msg.embeds.length > 0) {
        for (const embed of msg.embeds) {
            if (embed.title || embed.description) {
                embedsHtml += `<div class="msg-embed">`;
                if (embed.title) embedsHtml += `<div class="msg-embed-title">${escapeHtml(embed.title)}</div>`;
                if (embed.description) embedsHtml += `<div class="msg-embed-desc">${escapeHtml(embed.description)}</div>`;
                embedsHtml += `</div>`;
            }
        }
    }

    const timeStr = new Date(msg.createdAt).toLocaleString();
    const contentHtml = formatDiscordContent(msg.content);

    msgEl.innerHTML = `
        <div class="msg-header">
            <span class="msg-author${msg.authorIsBot ? ' msg-bot' : ''}">${escapeHtml(msg.authorName)}${msg.authorIsBot ? ' <span class="msg-bot-badge">BOT</span>' : ''}</span>
            <span class="msg-time">${timeStr}</span>
        </div>
        ${contentHtml ? `<div class="msg-content">${contentHtml}</div>` : ''}
        ${attachmentsHtml}
        ${embedsHtml}
    `;

    // Wire download buttons
    const dlBtns = msgEl.querySelectorAll('.msg-att-dl');
    dlBtns.forEach((btn) => {
        btn.addEventListener('click', async (e: Event) => {
            e.stopPropagation();
            const attEl = (btn as HTMLElement).closest('.msg-attachment') as HTMLElement;
            const url = attEl.dataset.url || '';
            const filename = attEl.dataset.filename || 'download';
            (btn as HTMLElement).textContent = '...';
            const result = await ipcRenderer.invoke(IPC.DISCORD_DOWNLOAD, url, filename);
            if (result.success) {
                (btn as HTMLElement).textContent = '✓';
                appendOutput(`Downloaded: ${filename}\n`);
            } else {
                (btn as HTMLElement).textContent = '✗';
                appendOutput(`Download failed: ${result.error}\n`);
            }
        });
    });

    container.appendChild(msgEl);
}

function showNewPostDialog() {
    if (!discordAuthUser) {
        appendOutput('You must be logged in to create a post.\n');
        return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.id = 'new-post-overlay';
    overlay.innerHTML = `
        <div class="discord-setup-dialog" style="width:520px;">
            <h2>📋 New Forum Post</h2>
            <p class="discord-setup-info">
                Create a new post in the Software Tools forum channel.
                This will be posted as <strong>${escapeHtml(discordAuthUser!.username)}</strong> via Nexia IDE.
            </p>
            <div class="dialog-field">
                <label>Title</label>
                <input type="text" id="new-post-title" placeholder="Post title..." maxlength="100" autocomplete="off">
            </div>
            <div class="dialog-field">
                <label>Content</label>
                <textarea id="new-post-content" placeholder="Write your post content here..." rows="8"
                    style="width:100%;padding:8px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--font);font-size:13px;resize:vertical;"></textarea>
            </div>
            <div class="dialog-buttons">
                <button class="setup-btn-secondary" id="new-post-cancel">Cancel</button>
                <button class="setup-btn-primary" id="new-post-submit">Publish</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('new-post-cancel')!.addEventListener('click', () => overlay.remove());
    document.getElementById('new-post-submit')!.addEventListener('click', async () => {
        const title = (document.getElementById('new-post-title') as HTMLInputElement).value.trim();
        const content = (document.getElementById('new-post-content') as HTMLTextAreaElement).value.trim();

        if (!title) { alert('Please enter a title.'); return; }
        if (!content) { alert('Please enter content.'); return; }

        const btn = document.getElementById('new-post-submit')!;
        btn.textContent = 'Publishing...';
        (btn as HTMLButtonElement).disabled = true;

        const result = await ipcRenderer.invoke(IPC.DISCORD_CREATE_THREAD, title, content);
        if (result.success) {
            overlay.remove();
            appendOutput(`Published forum post: "${title}"\n`);
            // Small delay for Discord API propagation, then force refresh
            setTimeout(() => loadDiscordFeed(true), 1500);
        } else {
            btn.textContent = 'Publish';
            (btn as HTMLButtonElement).disabled = false;
            alert('Failed to publish: ' + (result.error || 'Unknown error'));
        }
    });

    document.getElementById('new-post-title')!.focus();
}

function showDiscordSetup() {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.id = 'discord-setup-overlay';
    overlay.innerHTML = `
        <div class="discord-setup-dialog">
            <h2>⚙ Discord Feed Setup</h2>
            <p class="discord-setup-info">
                Create a Discord bot at <a id="discord-dev-link" href="#">developer portal</a>,
                add it to your server with <strong>Read Message History</strong>,
                <strong>Send Messages</strong>, and
                <strong>View Channels</strong> permissions, then paste the bot token and
                forum channel ID below.<br><br>
                For user login, also copy the <strong>Client ID</strong> and <strong>Client Secret</strong>
                from the OAuth2 section of your application, and add
                <code style="background:rgba(0,0,0,0.3);padding:1px 4px;border-radius:3px;">http://localhost:18293/callback</code>
                as a Redirect URI.
            </p>
            <div class="dialog-field">
                <label>Bot Token</label>
                <input type="password" id="discord-token-input" placeholder="Bot token..." autocomplete="off">
            </div>
            <div class="dialog-field">
                <label>Forum Channel ID</label>
                <input type="text" id="discord-channel-input" placeholder="e.g. 1234567890">
            </div>
            <div class="dialog-field">
                <label>Client ID (for user login)</label>
                <input type="text" id="discord-clientid-input" placeholder="Application Client ID">
            </div>
            <div class="dialog-field">
                <label>Client Secret (for user login)</label>
                <input type="password" id="discord-clientsecret-input" placeholder="Application Client Secret" autocomplete="off">
            </div>
            <div class="dialog-field">
                <label style="display:flex;align-items:center;gap:8px;">
                    <input type="checkbox" id="discord-enabled-input"> Enable Discord feed
                </label>
            </div>
            <div class="dialog-buttons">
                <button class="setup-btn-secondary" id="discord-setup-cancel">Cancel</button>
                <button class="setup-btn-primary" id="discord-setup-save">Save</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    ipcRenderer.invoke(IPC.DISCORD_GET_CONFIG).then((config: any) => {
        (document.getElementById('discord-channel-input') as HTMLInputElement).value = config.channelId || '';
        (document.getElementById('discord-clientid-input') as HTMLInputElement).value = config.clientId || '';
        (document.getElementById('discord-enabled-input') as HTMLInputElement).checked = config.enabled;
    });

    document.getElementById('discord-dev-link')!.addEventListener('click', (e) => {
        e.preventDefault();
        shell.openExternal('https://discord.com/developers/applications');
    });

    document.getElementById('discord-setup-cancel')!.addEventListener('click', () => overlay.remove());

    document.getElementById('discord-setup-save')!.addEventListener('click', async () => {
        const token = (document.getElementById('discord-token-input') as HTMLInputElement).value.trim();
        const channelId = (document.getElementById('discord-channel-input') as HTMLInputElement).value.trim();
        const clientId = (document.getElementById('discord-clientid-input') as HTMLInputElement).value.trim();
        const clientSecret = (document.getElementById('discord-clientsecret-input') as HTMLInputElement).value.trim();
        const enabled = (document.getElementById('discord-enabled-input') as HTMLInputElement).checked;

        const config: any = { channelId, enabled };
        if (token) config.botToken = token;
        if (clientId) config.clientId = clientId;
        if (clientSecret) config.clientSecret = clientSecret;

        await ipcRenderer.invoke(IPC.DISCORD_CONFIGURE, config);
        overlay.remove();
        loadDiscordFeed(true);
    });
}

function formatDiscordContent(content: string): string {
    if (!content) return '';
    let html = escapeHtml(content);
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Code blocks
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre class="msg-codeblock"><code>$2</code></pre>');
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    return html;
}

function formatTimeAgo(dateStr: string): string {
    const d = new Date(dateStr);
    const now = Date.now();
    const diff = now - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return d.toLocaleDateString();
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ══════════════════════════════════════
//  CODE-ALONG HELPER
// ══════════════════════════════════════
function initCodeHelper() {
    // Listen for cursor position changes
    if (!editor) return;
    editor.onDidChangeCursorPosition((e: any) => {
        if (!userProfile.tipsEnabled) return;
        const lineNum = e.position.lineNumber;
        if (lineNum === lastHintLine) return;
        lastHintLine = lineNum;

        const model = editor.getModel();
        if (!model) return;
        const lineContent = model.getLineContent(lineNum);
        // Check surrounding lines too for broader context
        const context = [
            lineNum > 1 ? model.getLineContent(lineNum - 1) : '',
            lineContent,
            lineNum < model.getLineCount() ? model.getLineContent(lineNum + 1) : '',
        ].join('\n');

        const hints = quizzes.getHintsForLine(context);
        if (hints.length > 0) {
            const hint = hints.find((h: any) => !codeHelperDismissed.has(h.id));
            if (hint && hint.id !== currentCodeHint?.id) {
                showCodeHelper(hint);
            }
        }
    });
}

function showCodeHelper(hint: any) {
    currentCodeHint = hint;
    const body = $('code-helper-body');
    body.innerHTML = `<strong>${hint.icon} ${hint.title}</strong><br><br>${hint.body}`;
    // Show/hide insert button based on whether hint has a snippet
    $('code-helper-insert').style.display = hint.snippet ? 'inline-block' : 'none';
    $('code-helper').classList.remove('hidden');
    // Position relative to editor area
    const editorArea = $('editor-area');
    if (editorArea && !editorArea.contains($('code-helper'))) {
        editorArea.style.position = 'relative';
        editorArea.appendChild($('code-helper'));
    }
}

$('code-helper-close').addEventListener('click', () => $('code-helper').classList.add('hidden'));
$('code-helper-dismiss').addEventListener('click', () => {
    if (currentCodeHint) codeHelperDismissed.add(currentCodeHint.id);
    $('code-helper').classList.add('hidden');
});
$('code-helper-insert').addEventListener('click', () => {
    if (!editor || !currentCodeHint?.snippet) return;
    const pos = editor.getPosition();
    editor.executeEdits('code-helper', [{
        range: new (window as any).monaco.Range(pos.lineNumber + 1, 1, pos.lineNumber + 1, 1),
        text: '\n' + currentCodeHint.snippet + '\n',
    }]);
    $('code-helper').classList.add('hidden');
    editor.focus();
});

// ══════════════════════════════════════
//  PROJECT EXPORT / IMPORT
// ══════════════════════════════════════
async function exportProject() {
    if (!currentProject) { appendOutput('No project open to export.\n'); return; }
    try {
        const archiver = require('archiver');
        // Fallback: use a simple zip via child_process
    } catch {}
    // Use IPC to call main process for zipping
    const result = await ipcRenderer.invoke(IPC.PROJECT_EXPORT);
    if (result) appendOutput(`📦 Project exported to: ${result}\n`);
}

async function importProject() {
    const result = await ipcRenderer.invoke(IPC.PROJECT_IMPORT);
    if (result) {
        appendOutput(`📦 Project imported: ${result}\n`);
        openProject(result);
    }
}

async function uploadDocument() {
    if (!currentProject) { appendOutput('Open a project first.\n'); return; }
    const filePath = await ipcRenderer.invoke(IPC.FILE_SELECT_FILE);
    if (!filePath) return;
    const fileName = nodePath.basename(filePath);
    const docsDir = nodePath.join(currentProject.path, 'Documents');
    try {
        nodeFs.mkdirSync(docsDir, { recursive: true });
        nodeFs.copyFileSync(filePath, nodePath.join(docsDir, fileName));
        await refreshFileTree();
        appendOutput(`📄 Uploaded document: ${fileName}\n`);
    } catch (err: any) { appendOutput(`Upload failed: ${err.message}\n`); }
}

// Wire menu items
menuAction('menu-export', exportProject);
menuAction('menu-import', importProject);
menuAction('menu-upload-doc', uploadDocument);

// ══════════════════════════════════════
//  GIT INTEGRATION
// ══════════════════════════════════════
const { execSync } = require('child_process');

function gitExec(cmd: string): string {
    if (!currentProject) throw new Error('No project open');
    try {
        return execSync(cmd, { cwd: currentProject.path, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err: any) {
        throw new Error(err.stderr || err.message);
    }
}

menuAction('menu-git-init', () => {
    if (!currentProject) { appendOutput('No project open.\n'); return; }
    try {
        gitExec('git init');
        gitExec('git add -A');
        gitExec('git commit -m "Initial commit — Nexia IDE project"');
        appendOutput('✅ Git repository initialized and first commit created.\n');
    } catch (err: any) { appendOutput(`Git init failed: ${err.message}\n`); }
});

menuAction('menu-git-commit', () => {
    if (!currentProject) { appendOutput('No project open.\n'); return; }
    const msg = prompt('Commit message:', 'Update project');
    if (!msg) return;
    try {
        gitExec('git add -A');
        const result = gitExec(`git commit -m "${msg.replace(/"/g, '\\"')}"`);
        appendOutput(`✅ ${result}\n`);
    } catch (err: any) { appendOutput(`Git commit failed: ${err.message}\n`); }
});

menuAction('menu-git-push', () => {
    if (!currentProject) { appendOutput('No project open.\n'); return; }
    try {
        appendOutput('Pushing to remote...\n');
        const result = gitExec('git push');
        appendOutput(`✅ ${result || 'Push complete.'}\n`);
    } catch (err: any) { appendOutput(`Git push failed: ${err.message}\n`); }
});

menuAction('menu-git-setup', () => {
    if (!currentProject) { appendOutput('No project open.\n'); return; }
    const url = prompt('Enter Git remote URL (e.g. https://github.com/user/repo.git):');
    if (!url) return;
    try {
        try { gitExec(`git remote remove origin`); } catch {}
        gitExec(`git remote add origin ${url}`);
        appendOutput(`✅ Remote set to: ${url}\n`);
    } catch (err: any) { appendOutput(`Git setup failed: ${err.message}\n`); }
});

// ══════════════════════════════════════
//  FIND IN FILES (Ctrl+Shift+F)
// ══════════════════════════════════════
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
    if (!currentProject || !query) return [];

    const includeGlobs = includeFilter.split(',').map(s => s.trim()).filter(Boolean);
    const files = getSearchableFiles(currentProject.path, includeGlobs);
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
                        relPath: nodePath.relative(currentProject.path, file),
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

function triggerSearch() {
    const query = ($('search-query') as HTMLInputElement).value;
    const caseSensitive = ($('search-case') as HTMLInputElement).checked;
    const useRegex = ($('search-regex') as HTMLInputElement).checked;
    const include = ($('search-include') as HTMLInputElement).value;

    if (!query || !currentProject) {
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

function openFindInFiles() {
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
//  EDITOR ZOOM — Ctrl+Scroll, Ctrl+Plus/Minus, Ctrl+0
// ══════════════════════════════════════

function editorZoom(delta: number) {
    if (!editor) return;
    userSettings.fontSize = Math.max(8, Math.min(40, userSettings.fontSize + delta));
    editor.updateOptions({ fontSize: userSettings.fontSize });
    $('status-zoom').textContent = `${Math.round((userSettings.fontSize / 14) * 100)}%`;
    saveUserSettings();
}

function editorZoomReset() {
    if (!editor) return;
    userSettings.fontSize = 14;
    editor.updateOptions({ fontSize: 14 });
    $('status-zoom').textContent = '100%';
    saveUserSettings();
}

// Ctrl+Scroll over editor area
$('editor-container').addEventListener('wheel', (e: WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();
    editorZoom(e.deltaY < 0 ? 1 : -1);
}, { passive: false });

// ══════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ══════════════════════════════════════
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); if (e.shiftKey) saveAllFiles(); else saveCurrentFile(); }
    if (e.key === 'F7') { e.preventDefault(); doBuild(); }
    if (e.key === 'F6') {
        e.preventDefault();
        if (lastBuiltXex) {
            ipcRenderer.invoke(IPC.EMU_LAUNCH, lastBuiltXex);
            appendOutput(`[Nexia 360] Launching: ${lastBuiltXex}\n`);
        } else {
            appendOutput('No XEX built yet. Build first (F7), then run (F6).\n');
        }
    }
    if (e.key === 'F5') {
        e.preventDefault();
        if (lastBuiltXex && devkitConnected) {
            ipcRenderer.invoke(IPC.DEVKIT_DEPLOY, lastBuiltXex);
        } else if (!devkitConnected) {
            appendOutput('No console connected. Connect in the Devkit panel first.\n');
        } else {
            appendOutput('No XEX built yet. Build first (F7), then deploy (F5).\n');
        }
    }
    if (e.ctrlKey && e.shiftKey && e.key === 'B') { e.preventDefault(); doRebuild(); }
    if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) { e.preventDefault(); openFindInFiles(); }
    if (e.ctrlKey && !e.shiftKey && e.key === 'b' && !e.altKey) { e.preventDefault(); doBuild(); }
    if (e.ctrlKey && e.key === 'n') { e.preventDefault(); if (e.altKey) { if (currentProject) inlineCreateItem('file'); else showNewFileDialog(); } else showNewProjectDialog(); }
    if (e.ctrlKey && e.key === 'o') { e.preventDefault(); openProject(); }
    if (e.ctrlKey && e.key === 'w') { e.preventDefault(); if (activeTab) closeTab(activeTab); }
    if (e.ctrlKey && e.key === 'g') { e.preventDefault(); showGoToLine(); }
    if (e.ctrlKey && e.key === '\\') { e.preventDefault(); toggleSidebar(); }
    if (e.ctrlKey && e.key === '`') { e.preventDefault(); toggleBottomPanel(); }
    // Zoom: Ctrl+= / Ctrl+- / Ctrl+0
    if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        editorZoom(1);
    }
    if (e.ctrlKey && e.key === '-') {
        e.preventDefault();
        editorZoom(-1);
    }
    if (e.ctrlKey && e.key === '0') {
        e.preventDefault();
        editorZoomReset();
    }
    if (e.key === 'Escape') { $$('.overlay').forEach(o => o.classList.add('hidden')); closeAllMenus(); }
});

// ══════════════════════════════════════
//  RECENT PROJECTS
// ══════════════════════════════════════
function renderRecentProjects(recent: string[]) {
    const c = $('recent-projects');
    if (!recent.length) { c.innerHTML = ''; return; }
    c.innerHTML = '<h3>Recent Projects</h3>';
    for (const p of recent.slice(0, 3)) {
        const item = document.createElement('div');
        item.className = 'recent-item';
        const name = nodePath.basename(p);
        const dir = nodePath.dirname(p);
        const info = document.createElement('div');
        info.className = 'recent-info';
        info.innerHTML = `<span class="recent-name">📁 ${name}</span><span class="recent-path">${dir}</span>`;
        info.addEventListener('click', () => openProject(p));
        const btn = document.createElement('button');
        btn.className = 'recent-delete';
        btn.title = 'Remove from recent projects';
        btn.textContent = '✕';
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const updated = await ipcRenderer.invoke(IPC.APP_REMOVE_RECENT, p);
            renderRecentProjects(updated);
        });
        item.appendChild(info);
        item.appendChild(btn);
        c.appendChild(item);
    }
}

// ══════════════════════════════════════
//  INIT
// ══════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════
// NEXIA AI — Multi-provider AI assistant
// ══════════════════════════════════════════════════════════════════════

const XBOX360_SYSTEM_PROMPT = `You are Nexia AI, an expert Xbox 360 development assistant built into the Nexia IDE. You have deep knowledge of:
- Xbox 360 SDK (XDK) APIs, D3D9 on Xbox 360, XAudio2, XACT, XInput
- PowerPC architecture (Xenon CPU), Xbox 360 GPU (Xenos/ATI)
- XEX format, XAM.XEX system functions, Xbox 360 memory layout
- C++ game programming, HLSL shaders, Xbox 360 performance optimization
- RGH/JTAG development, homebrew development, devkit deployment
- MSBuild for Xbox 360 projects, Xbox 360 SDK toolchain

When generating code, always use Xbox 360 compatible APIs and patterns.
Keep responses concise and code-focused. Use C++ unless asked otherwise.`;

interface AIMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}

let aiMessages: AIMessage[] = [];
let aiStreaming = false;

// ── AI networking via Node's https (bypasses CSP, uses exact URLs) ──
const nodeHttps = require('https');
const nodeHttp = require('http');
const nodeUrl = require('url');
const { marked } = require('marked');
const hljs = require('highlight.js');

// Configure marked with highlight.js for syntax highlighting in code blocks
marked.setOptions({
    highlight: (code: string, lang: string) => {
        if (lang && hljs.getLanguage(lang)) {
            try { return hljs.highlight(code, { language: lang }).value; } catch {}
        }
        try { return hljs.highlightAuto(code).value; } catch {}
        return code;
    },
    breaks: true,
    gfm: true,
});

function renderMarkdown(text: string): string {
    try { return marked.parse(text); }
    catch { return text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); }
}

// Non-streaming request (error analysis, code gen, inline, test)
function aiRequest(url: string, body: any, apiKey?: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const isHttps = parsed.protocol === 'https:';
        const lib = isHttps ? nodeHttps : nodeHttp;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
        const postData = JSON.stringify(body);
        headers['Content-Length'] = Buffer.byteLength(postData).toString();
        const req = lib.request({
            hostname: parsed.hostname, port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + parsed.search, method: 'POST', headers,
        }, (res: any) => {
            let data = '';
            res.on('data', (chunk: string) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) { reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 300)}`)); return; }
                try { resolve(JSON.parse(data)); }
                catch { reject(new Error('Invalid JSON response: ' + data.substring(0, 200))); }
            });
        });
        req.on('error', reject);
        req.setTimeout(120000, () => { req.destroy(); reject(new Error('Request timeout')); });
        req.write(postData); req.end();
    });
}

function aiRequestRaw(url: string, body: any, headers: Record<string, string>): Promise<any> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const isHttps = parsed.protocol === 'https:';
        const lib = isHttps ? nodeHttps : nodeHttp;
        const postData = JSON.stringify(body);
        headers['Content-Length'] = Buffer.byteLength(postData).toString();
        const req = lib.request({
            hostname: parsed.hostname, port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + parsed.search, method: 'POST', headers,
        }, (res: any) => {
            let data = '';
            res.on('data', (chunk: string) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) { reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 300)}`)); return; }
                try { resolve(JSON.parse(data)); }
                catch { reject(new Error('Invalid JSON response: ' + data.substring(0, 200))); }
            });
        });
        req.on('error', reject);
        req.setTimeout(120000, () => { req.destroy(); reject(new Error('Request timeout')); });
        req.write(postData); req.end();
    });
}

// ── SSE Streaming — parses Server-Sent Events, yields tokens to callback ──
function aiStreamSSE(
    url: string, body: any, headers: Record<string, string>,
    onToken: (token: string) => void,
    onDone: (fullText: string) => void,
    onError: (err: Error) => void,
): () => void {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? nodeHttps : nodeHttp;

    body.stream = true;
    const postData = JSON.stringify(body);
    headers['Content-Length'] = Buffer.byteLength(postData).toString();
    headers['Accept'] = 'text/event-stream';

    let fullText = '';
    let aborted = false;
    let buffer = '';
    let finished = false;

    const finish = () => { if (!finished) { finished = true; onDone(fullText); } };

    const req = lib.request({
        hostname: parsed.hostname, port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search, method: 'POST', headers,
    }, (res: any) => {
        if (res.statusCode >= 400) {
            let errData = '';
            res.on('data', (c: string) => errData += c);
            res.on('end', () => onError(new Error(`HTTP ${res.statusCode}: ${errData.substring(0, 300)}`)));
            return;
        }
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
            if (aborted) return;
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(':')) continue;
                if (trimmed === 'data: [DONE]') { finish(); return; }
                if (trimmed.startsWith('data: ')) {
                    try {
                        const obj = JSON.parse(trimmed.slice(6));
                        const delta = obj.choices?.[0]?.delta?.content || obj.choices?.[0]?.text || '';
                        if (delta) { fullText += delta; onToken(delta); }
                    } catch {}
                }
            }
        });
        res.on('end', () => { if (!aborted) finish(); });
    });

    req.on('error', (err: Error) => { if (!aborted) onError(err); });
    req.setTimeout(120000, () => { req.destroy(); if (!aborted) onError(new Error('Stream timeout')); });
    req.write(postData); req.end();

    return () => { aborted = true; finished = true; req.destroy(); };
}

function getAIRequestURL(): string {
    const s = userSettings;
    switch (s.aiProvider) {
        case 'anthropic': return 'https://api.anthropic.com/v1/messages';
        case 'openai': return 'https://api.openai.com/v1/chat/completions';
        case 'local': return s.aiEndpoint || 'http://localhost:11434/v1/chat/completions';
        case 'custom': return s.aiEndpoint || 'http://localhost:8080/v1/chat/completions';
        default: return s.aiEndpoint;
    }
}

function getAIModel(): string {
    const m = (userSettings.aiModel || '').trim();
    if (m && m !== 'auto') return m;
    const defaults: Record<string, string> = {
        anthropic: 'claude-sonnet-4-20250514',
        openai: 'gpt-4o',
        local: 'llama3',
        custom: '',
    };
    return defaults[userSettings.aiProvider] || '';
}

// ── Project Signature Scanner ──
// Scans .h/.hpp/.cpp files for function, class, struct, enum, typedef, and #define signatures
// to provide the LLM with codebase context for accurate completions

let projectSignaturesCache: string = '';
let projectSignaturesCacheTime: number = 0;
const SIGNATURE_CACHE_TTL = 30000; // 30s — rescan after this

function scanProjectSignatures(): string {
    if (!currentProject?.path) return '';

    // Use cache if fresh
    const now = Date.now();
    if (projectSignaturesCache && (now - projectSignaturesCacheTime) < SIGNATURE_CACHE_TTL) {
        return projectSignaturesCache;
    }

    const srcDir = nodePath.join(currentProject.path, 'src');
    const includeDir = nodePath.join(currentProject.path, 'include');
    const signatures: string[] = [];
    const scannedFiles: string[] = [];

    function scanDir(dir: string) {
        try {
            if (!nodeFs.existsSync(dir)) return;
            const entries = nodeFs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = nodePath.join(dir, entry.name);
                if (entry.isDirectory()) {
                    scanDir(fullPath);
                } else {
                    const ext = nodePath.extname(entry.name).toLowerCase();
                    if (['.h', '.hpp', '.hxx', '.cpp', '.c', '.cc', '.cxx', '.hlsl'].includes(ext)) {
                        scanFile(fullPath, entry.name);
                    }
                }
            }
        } catch {}
    }

    function scanFile(filePath: string, fileName: string) {
        try {
            const content = nodeFs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');
            const fileSigs: string[] = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();

                // Skip empty lines, comments, preprocessor guards
                if (!line || line.startsWith('//') || line === '#pragma once' || line.startsWith('#ifndef') || line.startsWith('#define _') || line.startsWith('#endif')) continue;

                // Function declarations/definitions: return_type name(params)
                const funcMatch = line.match(/^(?:(?:static|inline|virtual|extern|__declspec\([^)]*\))\s+)*(\w[\w:*&<> ]*?)\s+(\w+)\s*\(([^)]*)\)\s*(?:const\s*)?(?:override\s*)?[;{]/);
                if (funcMatch && !['if', 'while', 'for', 'switch', 'return', 'else', 'case'].includes(funcMatch[2])) {
                    fileSigs.push(`${funcMatch[1]} ${funcMatch[2]}(${funcMatch[3].trim()})`);
                    continue;
                }

                // Class/struct declarations
                const classMatch = line.match(/^(?:class|struct)\s+(?:__declspec\([^)]*\)\s+)?(\w+)\s*(?::\s*(?:public|private|protected)\s+\w[\w:<> ]*)?(?:\s*\{)?/);
                if (classMatch) {
                    fileSigs.push(`${line.startsWith('struct') ? 'struct' : 'class'} ${classMatch[1]}`);
                    continue;
                }

                // Enum declarations
                const enumMatch = line.match(/^enum\s+(?:class\s+)?(\w+)/);
                if (enumMatch) {
                    fileSigs.push(`enum ${enumMatch[1]}`);
                    continue;
                }

                // Typedef
                if (line.startsWith('typedef ')) {
                    const shortTypedef = line.length < 120 ? line.replace(/;$/, '') : line.substring(0, 120) + '...';
                    fileSigs.push(shortTypedef);
                    continue;
                }

                // #define macros (skip include guards)
                const defineMatch = line.match(/^#define\s+(\w+)(?:\(([^)]*)\))?\s*(.*)/);
                if (defineMatch && defineMatch[1] && !defineMatch[1].startsWith('_') && defineMatch[1] !== defineMatch[1].toUpperCase() + '_H') {
                    const macro = defineMatch[2] !== undefined
                        ? `#define ${defineMatch[1]}(${defineMatch[2]})`
                        : `#define ${defineMatch[1]}`;
                    fileSigs.push(macro);
                    continue;
                }

                // Global variable declarations (extern)
                if (line.startsWith('extern ') && line.endsWith(';')) {
                    fileSigs.push(line.replace(/;$/, ''));
                    continue;
                }
            }

            if (fileSigs.length > 0) {
                scannedFiles.push(fileName);
                signatures.push(`// ${fileName}\n${fileSigs.join('\n')}`);
            }
        } catch {}
    }

    scanDir(srcDir);
    scanDir(includeDir);
    // Also scan root-level headers
    try {
        const rootEntries = nodeFs.readdirSync(currentProject.path);
        for (const name of rootEntries) {
            const ext = nodePath.extname(name).toLowerCase();
            if (['.h', '.hpp'].includes(ext)) {
                scanFile(nodePath.join(currentProject.path, name), name);
            }
        }
    } catch {}

    if (signatures.length === 0) return '';

    // Truncate if too large (keep under ~4000 chars to not blow up context)
    let result = signatures.join('\n\n');
    if (result.length > 4000) {
        result = result.substring(0, 4000) + '\n// ... (truncated, ' + scannedFiles.length + ' files scanned)';
    }

    projectSignaturesCache = result;
    projectSignaturesCacheTime = now;
    return result;
}

function getSystemPrompt(): string {
    let prompt = XBOX360_SYSTEM_PROMPT;

    // Inject project signatures
    const sigs = scanProjectSignatures();
    if (sigs) {
        prompt += `\n\nThe user's current project contains the following declarations and signatures. Use these for accurate code completion, references, and suggestions:\n\n${sigs}`;
    }

    if (userSettings.aiSystemPrompt) {
        prompt += '\n\n' + userSettings.aiSystemPrompt;
    }
    return prompt;
}

async function aiComplete(messages: { role: string; content: string }[]): Promise<string> {
    const url = getAIRequestURL();
    const s = userSettings;

    if (s.aiProvider === 'anthropic') {
        const body = {
            model: getAIModel(),
            max_tokens: 4096,
            system: getSystemPrompt(),
            messages,
        };
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-api-key': s.aiApiKey,
            'anthropic-version': '2023-06-01',
        };
        const resp = await aiRequestRaw(url, body, headers);
        return (resp.content || []).map((b: any) => b.text || '').join('');
    } else {
        const model = getAIModel();
        const sysPrompt = getSystemPrompt();
        const allMessages: any[] = [];
        if (sysPrompt) allMessages.push({ role: 'system', content: sysPrompt });
        allMessages.push(...messages);
        const body: any = { messages: allMessages, max_tokens: 4096 };
        if (model) body.model = model;
        const resp = await aiRequest(url, body, s.aiApiKey || undefined);
        return resp.choices?.[0]?.message?.content || '';
    }
}

function setAIStatus(state: 'connected' | 'disconnected' | 'loading' | 'error', text?: string) {
    const dot = $('ai-status-dot');
    const txt = $('ai-status-text');
    const label = $('ai-provider-label');
    dot.className = 'ai-dot ' + state;
    if (text) txt.textContent = text;
    const providerNames: Record<string, string> = { anthropic: 'Claude', openai: 'GPT', local: 'Ollama', custom: 'Custom' };
    label.textContent = userSettings.aiApiKey || userSettings.aiProvider === 'local' ? providerNames[userSettings.aiProvider] || '' : '';
}

let aiAbortStream: (() => void) | null = null;

async function sendAIMessage(userText: string, contextCode?: string) {
    if (!userText.trim() || aiStreaming) return;
    if (!userSettings.aiApiKey && userSettings.aiProvider !== 'local' && userSettings.aiProvider !== 'custom') {
        addAIMessage('system', '⚠ No API key configured. Click the ⚙ button to set up your AI provider.');
        return;
    }

    let fullPrompt = userText;
    if (contextCode) {
        fullPrompt = `Here is the relevant code:\n\`\`\`cpp\n${contextCode}\n\`\`\`\n\n${userText}`;
    } else if (userSettings.aiFileContext && editor) {
        const currentCode = editor.getValue();
        const currentTab = openTabs.find(t => t.path === activeTab);
        if (currentCode && currentCode.length < 8000 && currentTab) {
            fullPrompt = `I'm working on file "${currentTab?.name || 'unknown'}". Here's the current code:\n\`\`\`cpp\n${currentCode}\n\`\`\`\n\n${userText}`;
        }
    }

    addAIMessage('user', userText);
    showAITyping();
    setAIStatus('loading', 'Thinking...');
    aiStreaming = true;
    ($('ai-send') as HTMLButtonElement).disabled = false;
    $('ai-send').textContent = '↑';
    $('ai-send').textContent = '■'; // Stop icon

    const apiMessages = aiMessages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role, content: m.role === 'user' && m === aiMessages[aiMessages.length - 1] ? fullPrompt : m.content }));

    const url = getAIRequestURL();
    const s = userSettings;

    // Build request body and headers based on provider
    let body: any;
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (s.aiProvider === 'anthropic') {
        headers['x-api-key'] = s.aiApiKey;
        headers['anthropic-version'] = '2023-06-01';
        body = { model: getAIModel(), max_tokens: 4096, system: getSystemPrompt(), messages: apiMessages };
        // Anthropic streaming uses a different SSE format — fall back to non-streaming for now
        try {
            const resp = await aiRequestRaw(url, body, headers);
            const reply = (resp.content || []).map((b: any) => b.text || '').join('');
            hideAITyping();
            if (reply) { addAIMessage('assistant', reply); setAIStatus('connected', 'Ready'); }
            else { addAIMessage('system', '⚠ Empty response.'); setAIStatus('error', 'Empty'); }
        } catch (err: any) {
            hideAITyping();
            addAIMessage('system', `❌ Error: ${err.message}`);
            setAIStatus('error', 'Failed');
        }
        aiStreaming = false;
        ($('ai-send') as HTMLButtonElement).disabled = false;
    $('ai-send').textContent = '↑';
        return;
    }

    // OpenAI-compatible providers — use SSE streaming
    if (s.aiApiKey) headers['Authorization'] = `Bearer ${s.aiApiKey}`;
    const model = getAIModel();
    const sysPrompt = getSystemPrompt();
    const allMessages: any[] = [];
    if (sysPrompt) allMessages.push({ role: 'system', content: sysPrompt });
    allMessages.push(...apiMessages);
    body = { messages: allMessages, max_tokens: 4096 };
    if (model) body.model = model;

    // Create the streaming message element
    hideAITyping();
    const streamMsg: AIMessage = { role: 'assistant', content: '', timestamp: Date.now() };
    aiMessages.push(streamMsg);
    const streamEl = createStreamingMessageEl();
    const bodyEl = streamEl.querySelector('.ai-msg-body') as HTMLElement;

    let tokenCount = 0;

    aiAbortStream = aiStreamSSE(url, body, headers,
        // onToken — live update
        (token: string) => {
            streamMsg.content += token;
            tokenCount++;
            // Re-render markdown every few tokens (throttled for performance)
            if (tokenCount % 3 === 0 || token.includes('\n')) {
                bodyEl.innerHTML = renderMarkdown(streamMsg.content);
                addCopyButtonsToCodeBlocks(bodyEl);
            }
            streamEl.scrollIntoView({ behavior: 'auto', block: 'end' });
            setAIStatus('loading', `Streaming... (${streamMsg.content.length} chars)`);
        },
        // onDone
        (fullText: string) => {
            streamMsg.content = fullText;
            bodyEl.innerHTML = renderMarkdown(fullText);
            addCopyButtonsToCodeBlocks(bodyEl);
            // Remove streaming visual state
            streamEl.classList.remove('ai-msg-streaming');
            const badge = streamEl.querySelector('.ai-msg-streaming-badge');
            if (badge) badge.remove();
            // Add action buttons
            addMessageActionButtons(streamEl, streamMsg);
            streamEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
            setAIStatus('connected', 'Ready');
            aiStreaming = false;
            aiAbortStream = null;
            ($('ai-send') as HTMLButtonElement).disabled = false;
    $('ai-send').textContent = '↑';
        },
        // onError
        (err: Error) => {
            if (streamMsg.content) {
                // Partial response — keep what we got
                bodyEl.innerHTML = renderMarkdown(streamMsg.content);
                addCopyButtonsToCodeBlocks(bodyEl);
            } else {
                streamEl.remove();
                aiMessages.pop();
            }
            addAIMessage('system', `❌ Stream error: ${err.message}`);
            setAIStatus('error', 'Stream failed');
            aiStreaming = false;
            aiAbortStream = null;
            ($('ai-send') as HTMLButtonElement).disabled = false;
    $('ai-send').textContent = '↑';
        },
    );
}

function createStreamingMessageEl(): HTMLElement {
    const container = $('ai-messages');
    const welcome = container.querySelector('.ai-welcome');
    if (welcome) welcome.remove();

    const el = document.createElement('div');
    el.className = 'ai-msg ai-msg-streaming';
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    el.innerHTML = `<div class="ai-msg-header"><span class="ai-msg-role assistant">Nexia AI</span><span class="ai-msg-streaming-badge">● streaming</span><span class="ai-msg-time">${time}</span></div><div class="ai-msg-body"><span class="ai-cursor-blink">▊</span></div>`;
    container.appendChild(el);
    el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    return el;
}

function addCopyButtonsToCodeBlocks(container: HTMLElement) {
    container.querySelectorAll('pre').forEach(pre => {
        if (pre.querySelector('.ai-code-copy')) return; // already has one
        const copyBtn = document.createElement('button');
        copyBtn.className = 'ai-code-copy';
        copyBtn.textContent = '📋';
        copyBtn.title = 'Copy code';
        copyBtn.addEventListener('click', () => {
            const code = pre.querySelector('code')?.textContent || pre.textContent || '';
            navigator.clipboard.writeText(code);
            copyBtn.textContent = '✓';
            setTimeout(() => copyBtn.textContent = '📋', 1500);
        });
        pre.style.position = 'relative';
        pre.appendChild(copyBtn);
    });
}

function addAIMessage(role: 'user' | 'assistant' | 'system', content: string) {
    const msg: AIMessage = { role, content, timestamp: Date.now() };
    aiMessages.push(msg);
    renderAIMessage(msg);
}

function addMessageActionButtons(el: HTMLElement, msg: AIMessage) {
    const actions = document.createElement('div');
    actions.className = 'ai-msg-actions';
    actions.innerHTML = `<button class="ai-msg-action-btn" data-action="copy" title="Copy response">📋</button><button class="ai-msg-action-btn" data-action="edit" title="Edit response">✏️</button><button class="ai-msg-action-btn" data-action="retry" title="Retry">🔄</button>`;

    actions.querySelector('[data-action="copy"]')!.addEventListener('click', () => {
        navigator.clipboard.writeText(msg.content);
        const btn = actions.querySelector('[data-action="copy"]')!;
        btn.textContent = '✓';
        setTimeout(() => btn.textContent = '📋', 1500);
    });

    actions.querySelector('[data-action="edit"]')!.addEventListener('click', () => {
        const bodyEl = el.querySelector('.ai-msg-body') as HTMLElement;
        if (bodyEl.contentEditable === 'true') {
            bodyEl.contentEditable = 'false';
            bodyEl.classList.remove('ai-msg-editing');
            msg.content = bodyEl.innerText;
            bodyEl.innerHTML = renderMarkdown(msg.content);
            addCopyButtonsToCodeBlocks(bodyEl);
            actions.querySelector('[data-action="edit"]')!.textContent = '✏️';
        } else {
            bodyEl.contentEditable = 'true';
            bodyEl.classList.add('ai-msg-editing');
            bodyEl.innerText = msg.content;
            bodyEl.focus();
            actions.querySelector('[data-action="edit"]')!.textContent = '💾';
        }
    });

    actions.querySelector('[data-action="retry"]')!.addEventListener('click', () => {
        retryAIMessage(msg, el);
    });

    el.appendChild(actions);
}

function renderAIMessage(msg: AIMessage) {
    const container = $('ai-messages');
    const welcome = container.querySelector('.ai-welcome');
    if (welcome) welcome.remove();

    const el = document.createElement('div');
    el.className = 'ai-msg';
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const roleLabel = msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'Nexia AI' : 'System';

    el.innerHTML = `<div class="ai-msg-header"><span class="ai-msg-role ${msg.role}">${roleLabel}</span><span class="ai-msg-time">${time}</span></div><div class="ai-msg-body"></div>`;

    const body = el.querySelector('.ai-msg-body')!;
    body.innerHTML = renderMarkdown(msg.content);
    addCopyButtonsToCodeBlocks(body as HTMLElement);

    // Action buttons for assistant messages
    if (msg.role === 'assistant') {
        addMessageActionButtons(el, msg);
    }

    container.appendChild(el);
    el.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function retryAIMessage(msg: AIMessage, msgEl: HTMLElement) {
    if (aiStreaming) return;

    // Find the user message that preceded this assistant response
    const msgIdx = aiMessages.indexOf(msg);
    if (msgIdx < 0) return;

    // Walk backwards to find the preceding user message
    let userMsg: AIMessage | null = null;
    for (let i = msgIdx - 1; i >= 0; i--) {
        if (aiMessages[i].role === 'user') {
            userMsg = aiMessages[i];
            break;
        }
    }

    if (!userMsg) return;

    // Remove the assistant message from array and DOM
    aiMessages.splice(msgIdx, 1);
    msgEl.remove();

    // Also remove the user message from array and DOM
    const userIdx = aiMessages.indexOf(userMsg);
    if (userIdx >= 0) {
        aiMessages.splice(userIdx, 1);
        // Find and remove the user message DOM element
        const allMsgEls = $('ai-messages').querySelectorAll('.ai-msg');
        allMsgEls.forEach(el => {
            const roleEl = el.querySelector('.ai-msg-role');
            if (roleEl?.classList.contains('user') && el.querySelector('.ai-msg-body')?.textContent?.trim() === userMsg!.content.trim()) {
                el.remove();
            }
        });
    }

    // Resend the original user message
    sendAIMessage(userMsg.content);
}

function formatAIContent(text: string): string {
    return renderMarkdown(text);
}

function showAITyping() {
    // Auto-switch to AI panel so user sees the response
    const aiTab = document.querySelector('[data-panel="ai"]') as HTMLElement;
    if (aiTab && !aiTab.classList.contains('active')) aiTab.click();

    const container = $('ai-messages');
    const el = document.createElement('div');
    el.className = 'ai-typing';
    el.id = 'ai-typing-indicator';
    el.innerHTML = '<div class="ai-typing-dots"><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span></div><span class="ai-typing-label">Nexia AI is thinking...</span>';
    container.appendChild(el);
    el.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function hideAITyping() {
    const el = document.getElementById('ai-typing-indicator');
    if (el) el.remove();
}

function clearAIChat() {
    aiMessages = [];
    const container = $('ai-messages');
    container.innerHTML = `<div class="ai-welcome"><div class="ai-welcome-icon">🤖</div><div class="ai-welcome-title">Nexia AI</div><div class="ai-welcome-desc">Your Xbox 360 development assistant. Ask questions about XDK APIs, debug build errors, or generate code.</div><div class="ai-quick-actions"><button class="ai-quick-btn" data-prompt="Explain the Xbox 360 D3D initialization process">📖 D3D Init Guide</button><button class="ai-quick-btn" data-prompt="Show me a basic Xbox 360 input polling loop">🎮 Input Polling</button><button class="ai-quick-btn" data-prompt="How do I set up audio using XAudio2 on Xbox 360?">🔊 Audio Setup</button><button class="ai-quick-btn" data-prompt="What are common Xbox 360 build errors and how to fix them?">🔧 Build Errors</button></div></div>`;
}

// ── AI Error Analysis ──

async function analyzeAIBuildErrors(errors: any[], warnings: any[]) {
    if (!userSettings.aiAutoErrors) return;
    if (!userSettings.aiApiKey && userSettings.aiProvider !== 'local') return;
    if (errors.length === 0) return;

    const errorsView = $('ai-errors-content');
    const emptyView = $('ai-errors-empty');
    const summary = $('ai-errors-summary');
    const list = $('ai-errors-list');

    emptyView.classList.add('hidden');
    errorsView.classList.remove('hidden');
    summary.innerHTML = `<strong>🔴 ${errors.length} error${errors.length > 1 ? 's' : ''}</strong>${warnings.length ? `, ⚠ ${warnings.length} warning${warnings.length > 1 ? 's' : ''}` : ''} — analyzing...`;
    list.innerHTML = '<div class="ai-typing" style="padding:16px;"><div class="ai-typing-dots"><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span></div><span class="ai-typing-label">Analyzing errors...</span></div>';

    // Update the AI tab badge
    const aiTab = document.querySelector('[data-panel="ai"]');
    if (aiTab) aiTab.setAttribute('data-badge', String(errors.length));

    const errorText = errors.map(e => `${e.file || '?'}:${e.line || '?'}: ${e.message}`).join('\n');
    const warningText = warnings.map(w => `${w.file || '?'}:${w.line || '?'}: ${w.message}`).join('\n');

    // Get current file content for context
    let codeContext = '';
    if (editor && errors[0]?.file) {
        const code = editor.getValue();
        if (code.length < 6000) codeContext = `\nCurrent file content:\n\`\`\`cpp\n${code}\n\`\`\``;
    }

    const prompt = `Analyze these Xbox 360 build errors and provide a fix for each one. Be concise.
${codeContext}

ERRORS:
${errorText}
${warningText ? '\nWARNINGS:\n' + warningText : ''}

For each error, respond with:
1. What caused it (one sentence)
2. How to fix it (specific code change)`;

    try {
        const reply = await aiComplete([{ role: 'user', content: prompt }]);

        summary.innerHTML = `<strong>🔴 ${errors.length} error${errors.length > 1 ? 's' : ''}</strong>${warnings.length ? `, ⚠ ${warnings.length} warning${warnings.length > 1 ? 's' : ''}` : ''} — AI analysis complete`;
        list.innerHTML = '';

        const analysisEl = document.createElement('div');
        analysisEl.className = 'ai-error-item';
        analysisEl.innerHTML = `<div class="ai-msg-body">${formatAIContent(reply)}</div>`;
        list.appendChild(analysisEl);

    } catch (err: any) {
        summary.innerHTML = `<strong>🔴 ${errors.length} error${errors.length > 1 ? 's' : ''}</strong> — analysis failed`;
        list.innerHTML = `<div class="ai-error-item"><div class="ai-error-item-explanation">❌ Could not analyze: ${err.message}</div></div>`;
    }
}

// ── AI Code Generation ──

async function generateAICode() {
    const prompt = ($('ai-gen-prompt') as HTMLTextAreaElement).value.trim();
    if (!prompt) return;
    if (!userSettings.aiApiKey && userSettings.aiProvider !== 'local') {
        alert('No API key configured. Open AI Settings first.');
        return;
    }

    const addComments = ($('ai-gen-comments') as HTMLInputElement).checked;
    const addIncludes = ($('ai-gen-includes') as HTMLInputElement).checked;
    const addErrorHandling = ($('ai-gen-error-handling') as HTMLInputElement).checked;

    const genBtn = $('ai-gen-submit') as HTMLButtonElement;
    genBtn.disabled = true;
    genBtn.textContent = '⏳ Generating...';
    $('ai-gen-result').classList.add('hidden');

    const fullPrompt = `Generate Xbox 360 C++ code for the following request. Return ONLY the code, no explanation.
${addComments ? 'Add clear comments.' : 'Minimal comments.'}
${addIncludes ? 'Include all necessary #include directives.' : 'Do not include #include directives.'}
${addErrorHandling ? 'Add proper error handling (HRESULT checks, null checks).' : 'Skip error handling for brevity.'}

Request: ${prompt}`;

    try {
        let reply = await aiComplete([{ role: 'user', content: fullPrompt }]);

        // Strip markdown code fences if present
        reply = reply.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();

        $('ai-gen-code-text').textContent = reply;
        $('ai-gen-result').classList.remove('hidden');
    } catch (err: any) {
        alert('Generation failed: ' + err.message);
    } finally {
        genBtn.disabled = false;
        genBtn.textContent = '⚡ Generate Code';
    }
}

// ── AI Inline Suggestions ──

let inlineSuggestTimer: any = null;

function triggerInlineSuggestion() {
    if (!userSettings.aiInlineSuggest || !userSettings.aiApiKey) return;
    if (!editor) return;

    clearTimeout(inlineSuggestTimer);
    inlineSuggestTimer = setTimeout(async () => {
        const pos = editor.getPosition();
        if (!pos) return;
        const model = editor.getModel();
        if (!model) return;

        // Get surrounding code context
        const startLine = Math.max(1, pos.lineNumber - 20);
        const endLine = pos.lineNumber;
        const codeAbove = model.getValueInRange({ startLineNumber: startLine, startColumn: 1, endLineNumber: endLine, endColumn: pos.column });
        const currentLine = model.getLineContent(pos.lineNumber);

        // Only suggest if the line is non-empty and we're at the end
        if (!currentLine.trim() || pos.column < currentLine.length) return;

        try {
            let suggestion = await aiComplete([{
                role: 'user',
                content: `Complete the following Xbox 360 C++ code. Return ONLY the completion (the next 1-5 lines), nothing else. No explanation.\n\n${codeAbove}`,
            }]);

            suggestion = suggestion.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
            if (!suggestion) return;

            showInlineSuggestion(suggestion, pos);
        } catch {}
    }, 1500); // 1.5s debounce
}

function showInlineSuggestion(text: string, position: any) {
    const widget = $('ai-inline-widget');
    $('ai-inline-text').textContent = text;
    widget.classList.remove('hidden');

    // Position near cursor
    const editorDom = $('editor-container');
    const rect = editorDom.getBoundingClientRect();
    const coords = editor.getScrolledVisiblePosition(position);
    if (coords) {
        widget.style.left = Math.min(rect.left + coords.left, window.innerWidth - 520) + 'px';
        widget.style.top = (rect.top + coords.top + 20) + 'px';
    }

    (window as any).__aiInlineSuggestion = text;
}

function acceptInlineSuggestion() {
    const text = (window as any).__aiInlineSuggestion;
    if (!text || !editor) return;
    const pos = editor.getPosition();
    if (pos) {
        editor.executeEdits('ai-inline', [{ range: new (window as any).monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text: '\n' + text }]);
    }
    dismissInlineSuggestion();
}

function dismissInlineSuggestion() {
    $('ai-inline-widget').classList.add('hidden');
    (window as any).__aiInlineSuggestion = null;
}

// ── Breadcrumb Bar ──

function updateBreadcrumb(filePath?: string) {
    const bar = $('breadcrumb-bar');
    const pathEl = $('breadcrumb-path');
    if (!filePath) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');

    const parts = filePath.replace(/\\/g, '/').split('/');
    // Show last 3-4 parts
    const visible = parts.slice(-4);
    pathEl.innerHTML = visible.map((part, i) => {
        const isLast = i === visible.length - 1;
        return `<span class="breadcrumb-item${isLast ? ' active' : ''}">${part}</span>${!isLast ? '<span class="breadcrumb-sep">›</span>' : ''}`;
    }).join('');
}

// ── AI Context Menu for Editor ──

function addAIContextMenuItems(items: CtxItem[]): CtxItem[] {
    if (!userSettings.aiApiKey && userSettings.aiProvider !== 'local') return items;

    items.push({ label: '─', action: () => {} });
    items.push({
        label: '🤖 Ask AI about this code',
        action: () => {
            const selection = editor?.getModel()?.getValueInRange(editor.getSelection());
            if (selection) {
                switchToAIPanel();
                setAIContext(selection);
                ($('ai-input') as HTMLTextAreaElement).focus();
            } else {
                switchToAIPanel();
                ($('ai-input') as HTMLTextAreaElement).focus();
            }
        },
    });
    items.push({
        label: '⚡ Generate code here',
        action: () => {
            switchToAIPanel();
            switchAIMode('generate');
            ($('ai-gen-prompt') as HTMLTextAreaElement).focus();
        },
    });
    items.push({
        label: '📖 Explain this code',
        action: () => {
            const selection = editor?.getModel()?.getValueInRange(editor.getSelection());
            if (selection) {
                switchToAIPanel();
                sendAIMessage('Explain this code in detail:', selection);
            }
        },
    });
    items.push({
        label: '🔧 Fix / improve this code',
        action: () => {
            const selection = editor?.getModel()?.getValueInRange(editor.getSelection());
            if (selection) {
                switchToAIPanel();
                sendAIMessage('Fix any bugs and suggest improvements for this code:', selection);
            }
        },
    });
    return items;
}

function switchToAIPanel() {
    // Click the AI sidebar tab
    const aiTab = document.querySelector('[data-panel="ai"]') as HTMLElement;
    if (aiTab) aiTab.click();
}

function switchAIMode(mode: string) {
    document.querySelectorAll('.ai-mode-tab').forEach(t => t.classList.toggle('active', t.getAttribute('data-ai-mode') === mode));
    document.querySelectorAll('.ai-view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(`ai-${mode}-view`);
    if (view) view.classList.add('active');
}

function setAIContext(code: string) {
    const badge = $('ai-context-badge');
    const text = $('ai-context-text');
    const lines = code.split('\n');
    text.textContent = `📎 ${lines.length} line${lines.length > 1 ? 's' : ''} of code attached`;
    badge.classList.remove('hidden');
    (badge as any).__contextCode = code;
}

// ── AI Settings Dialog ──

function openAISettings() {
    const overlay = $('ai-settings-overlay');
    overlay.classList.remove('hidden');
    // Populate from current settings
    ($('ai-provider') as HTMLSelectElement).value = userSettings.aiProvider;
    ($('ai-api-key') as HTMLInputElement).value = userSettings.aiApiKey;
    ($('ai-endpoint-url') as HTMLInputElement).value = userSettings.aiEndpoint;
    ($('ai-model') as HTMLInputElement).value = userSettings.aiModel || '';
    ($('ai-system-prompt') as HTMLTextAreaElement).value = userSettings.aiSystemPrompt;
    ($('ai-auto-errors') as HTMLInputElement).checked = userSettings.aiAutoErrors;
    ($('ai-inline-suggest') as HTMLInputElement).checked = userSettings.aiInlineSuggest;
    ($('ai-file-context') as HTMLInputElement).checked = userSettings.aiFileContext;
    toggleCustomEndpointField();
}

function toggleCustomEndpointField() {
    const provider = ($('ai-provider') as HTMLSelectElement).value;
    $('ai-custom-endpoint').classList.toggle('hidden', provider !== 'custom' && provider !== 'local');
}


function saveAISettings() {
    userSettings.aiProvider = ($('ai-provider') as HTMLSelectElement).value as any;
    userSettings.aiApiKey = ($('ai-api-key') as HTMLInputElement).value;
    userSettings.aiEndpoint = ($('ai-endpoint-url') as HTMLInputElement).value;
    userSettings.aiModel = ($('ai-model') as HTMLInputElement).value.trim();
    userSettings.aiSystemPrompt = ($('ai-system-prompt') as HTMLTextAreaElement).value;
    userSettings.aiAutoErrors = ($('ai-auto-errors') as HTMLInputElement).checked;
    userSettings.aiInlineSuggest = ($('ai-inline-suggest') as HTMLInputElement).checked;
    userSettings.aiFileContext = ($('ai-file-context') as HTMLInputElement).checked;
    saveUserSettings();
    $('ai-settings-overlay').classList.add('hidden');
    updateAIStatusFromSettings();
}

function updateAIStatusFromSettings() {
    if (userSettings.aiApiKey || userSettings.aiProvider === 'local') {
        setAIStatus('connected', 'Ready');
    } else {
        setAIStatus('disconnected', 'No API key configured');
    }
}

async function testAIConnection() {
    const origKey = userSettings.aiApiKey;
    const origProvider = userSettings.aiProvider;
    const origEndpoint = userSettings.aiEndpoint;
    const origModel = userSettings.aiModel;
    userSettings.aiApiKey = ($('ai-api-key') as HTMLInputElement).value;
    userSettings.aiProvider = ($('ai-provider') as HTMLSelectElement).value as any;
    userSettings.aiEndpoint = ($('ai-endpoint-url') as HTMLInputElement).value;
    userSettings.aiModel = ($('ai-model') as HTMLInputElement).value.trim();

    const btn = $('ai-test-connection') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = '⏳ Testing...';

    try {
        await aiComplete([{ role: 'user', content: 'Say "connected" and nothing else.' }]);
        btn.textContent = '✅ Connected!';
    } catch (err: any) {
        btn.textContent = `❌ ${err.message.substring(0, 40)}`;
    }

    userSettings.aiApiKey = origKey;
    userSettings.aiProvider = origProvider;
    userSettings.aiEndpoint = origEndpoint;
    userSettings.aiModel = origModel;

    setTimeout(() => { btn.disabled = false; btn.textContent = '🔌 Test Connection'; }, 3000);
}

// ── Initialize AI System ──

// ══════════════════════════════════════════════════════════════════════
// AI HINT BAR — Selection-triggered inline actions
// ══════════════════════════════════════════════════════════════════════

let hintBarDebounce: any = null;
let hintBarSelection: { text: string; range: any } | null = null;
let hintResultData: { action: string; code: string; result: string } | null = null;

function initAIHintBar() {
    if (!editor) return;

    // Listen for selection changes in Monaco
    editor.onDidChangeCursorSelection((e: any) => {
        clearTimeout(hintBarDebounce);
        const selection = e.selection;
        const model = editor.getModel();
        if (!model) return;

        const text = model.getValueInRange(selection).trim();
        if (!text || text.length < 3 || selection.startLineNumber === selection.endLineNumber && selection.startColumn === selection.endColumn) {
            hideHintBar();
            return;
        }

        // Debounce — show after 400ms of stable selection
        hintBarDebounce = setTimeout(() => {
            hintBarSelection = { text, range: selection };
            showHintBar(selection);
        }, 400);
    });

    // Hint bar button clicks
    $('ai-hint-bar').addEventListener('click', (e: MouseEvent) => {
        const btn = (e.target as HTMLElement).closest('.ai-hint-btn') as HTMLElement;
        if (!btn || !hintBarSelection) return;
        const action = btn.getAttribute('data-action');
        if (action) executeHintAction(action, hintBarSelection.text, hintBarSelection.range);
    });

    // Result panel buttons
    $('ai-hint-result-close').addEventListener('click', hideHintResult);
    $('ai-hint-reject').addEventListener('click', hideHintResult);
    $('ai-hint-apply').addEventListener('click', applyHintResult);
    $('ai-hint-copy').addEventListener('click', () => {
        if (hintResultData) {
            navigator.clipboard.writeText(hintResultData.result);
            ($('ai-hint-copy') as HTMLElement).textContent = '✓ Copied';
            setTimeout(() => ($('ai-hint-copy') as HTMLElement).textContent = '📋 Copy', 1500);
        }
    });

    // Hide hint bar when editor scrolls or loses focus
    editor.onDidScrollChange(() => { hideHintBar(); hideHintResult(); });
    editor.onDidBlurEditorText(() => {
        // Small delay so clicking hint bar buttons works
        setTimeout(() => {
            if (!document.querySelector('.ai-hint-bar:hover') && !document.querySelector('.ai-hint-result:hover')) {
                hideHintBar();
            }
        }, 200);
    });
}

function showHintBar(selection: any) {
    if (!editor) return;
    // Don't show if no API configured
    if (!userSettings.aiApiKey && userSettings.aiProvider !== 'local' && userSettings.aiProvider !== 'custom') return;

    const bar = $('ai-hint-bar');
    const editorDom = $('editor-container');
    const editorRect = editorDom.getBoundingClientRect();

    // Get position of the start of the selection
    const coords = editor.getScrolledVisiblePosition({ lineNumber: selection.startLineNumber, column: selection.startColumn });
    if (!coords) { hideHintBar(); return; }

    const x = editorRect.left + coords.left;
    const y = editorRect.top + coords.top - 36; // 36px above selection

    // Keep on screen
    bar.classList.remove('hidden');
    const barWidth = bar.offsetWidth || 250;
    bar.style.left = Math.max(editorRect.left, Math.min(x, window.innerWidth - barWidth - 8)) + 'px';
    bar.style.top = Math.max(editorRect.top, y) + 'px';
}

function hideHintBar() {
    $('ai-hint-bar').classList.add('hidden');
}

function hideHintResult() {
    $('ai-hint-result').classList.add('hidden');
    hintResultData = null;
}

function showHintResult(x: number, y: number) {
    const panel = $('ai-hint-result');
    panel.classList.remove('hidden');
    const pw = 520;
    const ph = panel.offsetHeight || 200;
    panel.style.left = Math.max(8, Math.min(x, window.innerWidth - pw - 8)) + 'px';
    panel.style.top = Math.max(8, Math.min(y, window.innerHeight - ph - 8)) + 'px';
}

function setHintResultLoading(action: string) {
    const titles: Record<string, string> = {
        explain: '📖 Explaining...',
        fix: '🔧 Auto Fixing...',
        refactor: '⚡ Refactoring...',
    };
    $('ai-hint-result-title').textContent = titles[action] || '🤖 Nexia AI';
    $('ai-hint-result-status').textContent = '';
    $('ai-hint-result-body').innerHTML = '<div class="ai-hint-loading"><div class="ai-hint-loading-dots"><span class="ai-hint-loading-dot"></span><span class="ai-hint-loading-dot"></span><span class="ai-hint-loading-dot"></span></div><span class="ai-hint-loading-label">Thinking...</span></div>';
    $('ai-hint-result-actions').classList.add('hidden');
}

async function executeHintAction(action: string, code: string, range: any) {
    hideHintBar();

    // Position result panel near the selection
    const editorDom = $('editor-container');
    const editorRect = editorDom.getBoundingClientRect();
    const coords = editor.getScrolledVisiblePosition({ lineNumber: range.endLineNumber, column: 1 });
    const rx = editorRect.left + (coords?.left || 100);
    const ry = editorRect.top + (coords?.top || 100) + 24;

    showHintResult(rx, ry);
    setHintResultLoading(action);

    const prompts: Record<string, string> = {
        explain: `Explain the following code. Describe what it does, its purpose, and any notable patterns or potential issues. Be concise but thorough.

\`\`\`cpp
${code}
\`\`\``,

        fix: `You are a code repair tool. Analyze the following code for bugs, errors, and issues, then provide the FIXED version.

IMPORTANT: Respond using EXACTLY this format:
<tool>fix_code</tool>
<search>
(the exact original code or pattern to find)
</search>
<replace>
(the corrected code to replace it with)
</replace>
<explanation>
(brief explanation of what was fixed and why)
</explanation>

If there are multiple fixes needed, repeat the tool block for each one.
If no issues are found, say "No issues found" and explain why the code is correct.

\`\`\`cpp
${code}
\`\`\``,

        refactor: `You are a code refactoring tool. Improve the following code for readability, performance, or best practices while preserving its functionality.

IMPORTANT: Respond using EXACTLY this format:
<tool>refactor_code</tool>
<mode>replace</mode>
<code>
(the complete refactored code that replaces the selection)
</code>
<explanation>
(brief explanation of what was changed and why)
</explanation>

\`\`\`cpp
${code}
\`\`\``,
    };

    try {
        const reply = await aiComplete([{ role: 'user', content: prompts[action] }]);

        const titleLabels: Record<string, string> = {
            explain: '📖 Explanation',
            fix: '🔧 Auto Fix',
            refactor: '⚡ Refactored',
        };
        $('ai-hint-result-title').textContent = titleLabels[action] || '🤖 Nexia AI';

        if (action === 'explain') {
            // Explain — just render markdown, no apply button
            $('ai-hint-result-body').innerHTML = renderMarkdown(reply);
            addCopyButtonsToCodeBlocks($('ai-hint-result-body'));
            $('ai-hint-result-actions').classList.add('hidden');
            hintResultData = { action, code, result: reply };
            $('ai-hint-result-status').textContent = '';
            // Show copy only
            $('ai-hint-result-actions').classList.remove('hidden');
            ($('ai-hint-apply') as HTMLElement).style.display = 'none';
            ($('ai-hint-reject') as HTMLElement).style.display = 'none';

        } else if (action === 'fix') {
            // Parse fix_code tool calls
            const fixes = parseFixToolCalls(reply);
            if (fixes.length > 0) {
                renderFixResult(fixes, code);
                hintResultData = { action, code, result: JSON.stringify(fixes) };
            } else {
                // No structured tool call — show as markdown
                $('ai-hint-result-body').innerHTML = renderMarkdown(reply);
                addCopyButtonsToCodeBlocks($('ai-hint-result-body'));
                $('ai-hint-result-actions').classList.add('hidden');
                hintResultData = { action, code, result: reply };
            }

        } else if (action === 'refactor') {
            // Parse refactor_code tool call
            const refactored = parseRefactorToolCall(reply);
            if (refactored) {
                renderRefactorResult(code, refactored.code, refactored.explanation);
                hintResultData = { action, code, result: refactored.code };
            } else {
                $('ai-hint-result-body').innerHTML = renderMarkdown(reply);
                addCopyButtonsToCodeBlocks($('ai-hint-result-body'));
                $('ai-hint-result-actions').classList.add('hidden');
                hintResultData = { action, code, result: reply };
            }
        }

    } catch (err: any) {
        $('ai-hint-result-title').textContent = '❌ Error';
        $('ai-hint-result-body').innerHTML = `<p style="color:var(--red)">${err.message}</p>`;
        $('ai-hint-result-actions').classList.add('hidden');
    }
}

// ── Tool call parsers ──

interface FixCall { search: string; replace: string; explanation: string; }

function parseFixToolCalls(text: string): FixCall[] {
    const fixes: FixCall[] = [];
    // Match <tool>fix_code</tool> blocks
    const toolRegex = /<tool>\s*fix_code\s*<\/tool>\s*<search>\s*([\s\S]*?)\s*<\/search>\s*<replace>\s*([\s\S]*?)\s*<\/replace>(?:\s*<explanation>\s*([\s\S]*?)\s*<\/explanation>)?/gi;
    let match;
    while ((match = toolRegex.exec(text)) !== null) {
        fixes.push({
            search: match[1].trim(),
            replace: match[2].trim(),
            explanation: (match[3] || '').trim(),
        });
    }
    return fixes;
}

interface RefactorResult { code: string; explanation: string; mode: string; }

function parseRefactorToolCall(text: string): RefactorResult | null {
    const regex = /<tool>\s*refactor_code\s*<\/tool>\s*(?:<mode>\s*([\s\S]*?)\s*<\/mode>\s*)?<code>\s*([\s\S]*?)\s*<\/code>(?:\s*<explanation>\s*([\s\S]*?)\s*<\/explanation>)?/i;
    const match = regex.exec(text);
    if (!match) return null;
    return {
        mode: (match[1] || 'replace').trim(),
        code: match[2].trim(),
        explanation: (match[3] || '').trim(),
    };
}

// ── Result renderers ──

function renderFixResult(fixes: FixCall[], originalCode: string) {
    const body = $('ai-hint-result-body');
    let html = `<p style="margin-bottom:8px;color:var(--text-dim);font-size:11px;">${fixes.length} fix${fixes.length > 1 ? 'es' : ''} found:</p>`;

    for (let i = 0; i < fixes.length; i++) {
        const fix = fixes[i];
        html += `<div style="margin-bottom:10px;">`;
        if (fix.explanation) {
            html += `<p style="font-size:11px;color:var(--text);margin:0 0 4px;"><strong>#${i + 1}:</strong> ${fix.explanation}</p>`;
        }
        html += `<div class="ai-hint-diff-remove"><pre>${escapeHtml(fix.search)}</pre></div>`;
        html += `<div class="ai-hint-diff-add"><pre>${escapeHtml(fix.replace)}</pre></div>`;
        html += `</div>`;
    }

    body.innerHTML = html;
    $('ai-hint-result-status').textContent = `${fixes.length} change${fixes.length > 1 ? 's' : ''}`;

    // Show apply/reject
    const actions = $('ai-hint-result-actions');
    actions.classList.remove('hidden');
    ($('ai-hint-apply') as HTMLElement).style.display = '';
    ($('ai-hint-reject') as HTMLElement).style.display = '';
}

function renderRefactorResult(original: string, refactored: string, explanation: string) {
    const body = $('ai-hint-result-body');
    let html = '';
    if (explanation) {
        html += `<p style="font-size:11px;color:var(--text);margin:0 0 8px;">${explanation}</p>`;
    }
    html += `<div class="ai-hint-diff-remove"><pre>${escapeHtml(original)}</pre></div>`;
    html += `<div class="ai-hint-diff-add"><pre>${escapeHtml(refactored)}</pre></div>`;
    body.innerHTML = html;
    $('ai-hint-result-status').textContent = 'Refactored';

    const actions = $('ai-hint-result-actions');
    actions.classList.remove('hidden');
    ($('ai-hint-apply') as HTMLElement).style.display = '';
    ($('ai-hint-reject') as HTMLElement).style.display = '';
}

// ── Apply changes to editor ──

function applyHintResult() {
    if (!hintResultData || !editor || !hintBarSelection) return;
    const model = editor.getModel();
    if (!model) return;

    const { action, code, result } = hintResultData;
    const range = hintBarSelection.range;

    if (action === 'fix') {
        // Apply fix_code tool calls — search/replace within the selection
        const fixes: FixCall[] = JSON.parse(result);
        let currentText = model.getValueInRange(range);

        for (const fix of fixes) {
            // Try exact string match first
            if (currentText.includes(fix.search)) {
                currentText = currentText.replace(fix.search, fix.replace);
            } else {
                // Try regex match
                try {
                    const regex = new RegExp(fix.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                    currentText = currentText.replace(regex, fix.replace);
                } catch {
                    // If regex fails, try line-by-line fuzzy match
                    currentText = currentText.replace(fix.search.trim(), fix.replace.trim());
                }
            }
        }

        // Apply the edit
        const monaco = (window as any).monaco;
        editor.executeEdits('ai-hint-fix', [{
            range: new monaco.Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn),
            text: currentText,
        }]);

    } else if (action === 'refactor') {
        // Replace entire selection with refactored code
        const monaco = (window as any).monaco;
        editor.executeEdits('ai-hint-refactor', [{
            range: new monaco.Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn),
            text: result,
        }]);
    }

    hideHintResult();
    // Mark file as modified
    if (activeTab) {
        const tab = openTabs.find(t => t.path === activeTab);
        if (tab && !tab.modified) { tab.modified = true; renderTabs(); }
    }
}

function initAI() {
    // Mode tabs
    document.querySelectorAll('.ai-mode-tab').forEach(tab => {
        tab.addEventListener('click', () => switchAIMode(tab.getAttribute('data-ai-mode') || 'chat'));
    });

    // Chat input
    const input = $('ai-input') as HTMLTextAreaElement;
    input.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const contextBadge = $('ai-context-badge');
            const contextCode = (contextBadge as any).__contextCode || undefined;
            sendAIMessage(input.value, contextCode);
            input.value = '';
            input.style.height = 'auto';
            // Clear context
            contextBadge.classList.add('hidden');
            (contextBadge as any).__contextCode = null;
        }
    });
    // Auto-resize textarea
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // Send button
    $('ai-send').addEventListener('click', () => {
        if (aiStreaming && aiAbortStream) {
            // Stop streaming
            aiAbortStream();
            aiAbortStream = null;
            aiStreaming = false;
            ($('ai-send') as HTMLButtonElement).disabled = false;
    $('ai-send').textContent = '↑';
            $('ai-send').textContent = '↑';
            setAIStatus('connected', 'Stopped');
            // Remove streaming badge from current message
            const streamingMsg = document.querySelector('.ai-msg-streaming');
            if (streamingMsg) {
                streamingMsg.classList.remove('ai-msg-streaming');
                const badge = streamingMsg.querySelector('.ai-msg-streaming-badge');
                if (badge) badge.remove();
            }
            return;
        }
        const contextCode = ($('ai-context-badge') as any).__contextCode || undefined;
        sendAIMessage(input.value, contextCode);
        input.value = '';
        input.style.height = 'auto';
        $('ai-context-badge').classList.add('hidden');
    });

    // Clear button
    $('ai-clear').addEventListener('click', clearAIChat);

    // Quick action buttons
    document.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('.ai-quick-btn');
        if (btn) {
            const prompt = btn.getAttribute('data-prompt');
            if (prompt) sendAIMessage(prompt);
        }
    });

    // Settings
    $('ai-settings-btn').addEventListener('click', openAISettings);
    $('ai-settings-save').addEventListener('click', saveAISettings);
    $('ai-settings-cancel').addEventListener('click', () => $('ai-settings-overlay').classList.add('hidden'));
    $('ai-provider').addEventListener('change', () => { toggleCustomEndpointField(); });
    $('ai-test-connection').addEventListener('click', testAIConnection);
    $('ai-key-toggle').addEventListener('click', () => {
        const inp = $('ai-api-key') as HTMLInputElement;
        inp.type = inp.type === 'password' ? 'text' : 'password';
        ($('ai-key-toggle') as HTMLElement).textContent = inp.type === 'password' ? 'Show' : 'Hide';
    });

    // Context clear
    $('ai-context-clear').addEventListener('click', () => {
        $('ai-context-badge').classList.add('hidden');
        ($('ai-context-badge') as any).__contextCode = null;
    });

    // Generate mode
    $('ai-gen-submit').addEventListener('click', generateAICode);
    $('ai-gen-copy').addEventListener('click', () => {
        navigator.clipboard.writeText($('ai-gen-code-text').textContent || '');
        ($('ai-gen-copy') as HTMLElement).textContent = '✓ Copied';
        setTimeout(() => ($('ai-gen-copy') as HTMLElement).textContent = '📋 Copy', 1500);
    });
    $('ai-gen-insert').addEventListener('click', () => {
        const code = $('ai-gen-code-text').textContent || '';
        if (editor && code) {
            const pos = editor.getPosition();
            if (pos) {
                editor.executeEdits('ai-gen', [{ range: new (window as any).monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text: code }]);
            }
        }
    });
    $('ai-gen-newfile').addEventListener('click', () => {
        const code = $('ai-gen-code-text').textContent || '';
        // Trigger new file dialog, user can paste
        navigator.clipboard.writeText(code);
        appendOutput('Generated code copied to clipboard. Create a new file and paste.\n');
    });

    // Inline suggestion handlers
    $('ai-inline-accept').addEventListener('click', acceptInlineSuggestion);
    $('ai-inline-dismiss').addEventListener('click', dismissInlineSuggestion);

    // Keyboard shortcut: Ctrl+Shift+A to focus AI
    document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'A') {
            e.preventDefault();
            switchToAIPanel();
            ($('ai-input') as HTMLTextAreaElement).focus();
        }
        // Esc to dismiss inline suggestion
        if (e.key === 'Escape') dismissInlineSuggestion();
        // Tab to accept inline suggestion
        if (e.key === 'Tab' && (window as any).__aiInlineSuggestion) {
            e.preventDefault();
            acceptInlineSuggestion();
        }
    });

    updateAIStatusFromSettings();

    // Initialize hint bar after editor is ready
    monacoReady.then(() => initAIHintBar());
}

async function init() {
    loadUserSettings();
    loadProfile();
    loadFlashcards();
    applyThemeColors();
    applyFancyMode();
    initMonaco();
    initDevkitPanel();
    initEmulatorPanel();
    initTabContextMenu();
    setBuildStatus('ready');
    renderLearnPanel();
    renderTipsPanel();
    renderStudyPanel();
    renderCommunityPanel();
    initAI();
    const state = await ipcRenderer.invoke(IPC.APP_READY);
    defaultProjectsDir = state.projectsDir || '';
    await checkSetup(state);
    renderRecentProjects(state.recentProjects || []);
    // Show onboarding on first launch
    if (!userProfile.onboardingComplete) {
        setTimeout(() => showOnboarding(), 500);
    } else {
        // Start idle tip timer for returning users
        resetIdleTipTimer();
    }
}

$$('.overlay').forEach(o => {
    o.addEventListener('click', (e) => { if (e.target === o) o.classList.add('hidden'); });
});

init();
