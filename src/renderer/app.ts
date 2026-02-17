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

// ── Workspace State ──
interface WorkspaceState {
    expandedDirs: string[];
    openTabs: string[];
    activeTab: string | null;
    sidebarVisible: boolean;
    bottomPanelVisible: boolean;
    activeSidebarTab: string;
}
const DEFAULT_WORKSPACE: WorkspaceState = {
    expandedDirs: [], openTabs: [], activeTab: null,
    sidebarVisible: true, bottomPanelVisible: true, activeSidebarTab: 'explorer',
};
let workspaceState: WorkspaceState = { ...DEFAULT_WORKSPACE };
let workspaceSaveTimer: any = null;
let workspaceRestoring = false;

function getWorkspacePath(): string | null {
    if (!currentProject?.path) return null;
    return nodePath.join(currentProject.path, 'nexia-workspace.json');
}

function loadWorkspaceState(): WorkspaceState {
    const wsPath = getWorkspacePath();
    if (!wsPath) return { ...DEFAULT_WORKSPACE };
    try {
        if (nodeFs.existsSync(wsPath)) {
            return { ...DEFAULT_WORKSPACE, ...JSON.parse(nodeFs.readFileSync(wsPath, 'utf-8')) };
        }
    } catch {}
    return { ...DEFAULT_WORKSPACE };
}

function saveWorkspaceState() {
    if (workspaceRestoring) return;
    if (workspaceSaveTimer) clearTimeout(workspaceSaveTimer);
    workspaceSaveTimer = setTimeout(() => {
        flushWorkspaceState();
    }, 300);
}

function flushWorkspaceState() {
    if (workspaceRestoring) return;
    if (workspaceSaveTimer) { clearTimeout(workspaceSaveTimer); workspaceSaveTimer = null; }
    const wsPath = getWorkspacePath();
    if (!wsPath) return;
    try {
        workspaceState.expandedDirs = collectExpandedDirs();
        workspaceState.openTabs = openTabs.map(t => t.path);
        workspaceState.activeTab = activeTab;
        workspaceState.sidebarVisible = sidebarVisible;
        workspaceState.bottomPanelVisible = bottomPanelVisible;
        const activeSidebarEl = document.querySelector('.sidebar-tab.active') as HTMLElement;
        if (activeSidebarEl) workspaceState.activeSidebarTab = activeSidebarEl.dataset.panel || 'explorer';
        nodeFs.writeFileSync(wsPath, JSON.stringify(workspaceState, null, 2));
    } catch (err) {
        console.error('Failed to save workspace state:', err);
    }
}

function collectExpandedDirs(): string[] {
    const expanded: string[] = [];
    document.querySelectorAll('#file-tree .tree-children.open').forEach(el => {
        const header = el.previousElementSibling as HTMLElement;
        if (header) {
            const dirPath = header.getAttribute('data-dir-path');
            if (dirPath && currentProject?.path) {
                expanded.push(nodePath.relative(currentProject.path, dirPath));
            }
        }
    });
    document.querySelectorAll('#file-tree .virtual-folder').forEach(el => {
        const children = el.querySelector('.tree-children') as HTMLElement;
        if (children?.classList.contains('open')) {
            const header = el.querySelector('.tree-item') as HTMLElement;
            const name = header?.querySelector('.tree-name')?.textContent;
            if (name) expanded.push('__virtual__:' + name);
        }
    });
    const rootChildren = document.querySelector('#file-tree > .tree-children');
    if (rootChildren?.classList.contains('open')) expanded.push('__project_root__');
    return expanded;
}

async function restoreWorkspaceState(state: WorkspaceState) {
    workspaceRestoring = true;
    try {
    for (const relPath of state.expandedDirs) {
        if (relPath === '__project_root__') continue;
        if (relPath.startsWith('__virtual__:')) {
            const name = relPath.replace('__virtual__:', '');
            document.querySelectorAll('#file-tree .virtual-folder').forEach(el => {
                const header = el.querySelector('.tree-item') as HTMLElement;
                const vName = header?.querySelector('.tree-name')?.textContent;
                if (vName === name) {
                    const children = el.querySelector('.tree-children') as HTMLElement;
                    if (children && !children.classList.contains('open')) {
                        children.classList.add('open');
                        const arrow = header.querySelector('.tree-arrow') as HTMLElement;
                        if (arrow) { arrow.textContent = '▼'; arrow.classList.add('expanded'); }
                    }
                }
            });
            continue;
        }
        const absPath = nodePath.join(currentProject.path, relPath);
        const header = document.querySelector('#file-tree [data-dir-path="' + absPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]') as HTMLElement;
        if (header) {
            const children = header.nextElementSibling as HTMLElement;
            if (children && children.classList.contains('tree-children') && !children.classList.contains('open')) {
                children.classList.add('open');
                const arrow = header.querySelector('.tree-arrow') as HTMLElement;
                const icon = header.querySelector('.tree-icon');
                if (arrow) { arrow.textContent = '▼'; arrow.classList.add('expanded'); }
                if (icon) icon.textContent = '📂';
            }
        }
    }
    if (state.activeSidebarTab) {
        const tab = document.querySelector('.sidebar-tab[data-panel="' + state.activeSidebarTab + '"]') as HTMLElement;
        if (tab) tab.click();
    }
    if (!state.sidebarVisible && sidebarVisible) toggleSidebar();
    if (!state.bottomPanelVisible && bottomPanelVisible) toggleBottomPanel();

    await monacoReady;
    for (const tabPath of state.openTabs) {
        if (nodeFs.existsSync(tabPath)) {
            await openFile(tabPath);
        }
    }
    if (state.activeTab && openTabs.some(t => t.path === state.activeTab)) {
        switchToTab(state.activeTab);
    }
    } finally {
        workspaceRestoring = false;
    }
}

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
    showHiddenFiles: boolean;
}
const DEFAULT_SETTINGS: UserSettings = {
    fontSize: 14,
    accentColor: '#00e676',
    bgDark: '#06060f',
    bgMain: '#0c0c1a',
    bgPanel: '#0a0e1e',
    bgSidebar: '#080914',
    editorBg: '#0c0c1a',
    textColor: '#d0d0e8',
    textDim: '#555580',
    fancyEffects: true,
    showHiddenFiles: false,
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
    r.setProperty('--green-bg', userSettings.accentColor + '14');
    r.setProperty('--green-bg-hover', userSettings.accentColor + '26');
    // Glow variants for enhancements
    r.setProperty('--green-glow', userSettings.accentColor + '28');
    r.setProperty('--green-glow-strong', userSettings.accentColor + '55');
    r.setProperty('--green-glow-soft', userSettings.accentColor + '10');
    r.setProperty('--bg-dark', userSettings.bgDark);
    r.setProperty('--bg-main', userSettings.bgMain);
    r.setProperty('--bg-panel', userSettings.bgPanel);
    r.setProperty('--bg-sidebar', userSettings.bgSidebar);
    r.setProperty('--text', userSettings.textColor);
    r.setProperty('--text-dim', userSettings.textDim);

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
                'editorSuggestWidget.border': '#2a2a4a',
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
menuAction('menu-project-properties', () => showProjectProperties());
menuAction('menu-deploy', () => $('btn-deploy').click());
menuAction('menu-toggle-sidebar', () => toggleSidebar());
menuAction('menu-toggle-output', () => toggleBottomPanel());
menuAction('menu-extensions', () => {
    // Switch to extensions sidebar tab
    const tab = document.querySelector('.sidebar-tab[data-panel="extensions"]') as HTMLElement;
    if (tab) tab.click();
});
menuAction('menu-sdk-tools', () => showSdkToolsDialog());
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
        if (panel === 'tutorials') renderTutorialsPanel();
        if (panel === 'search') setTimeout(() => ($('search-query') as HTMLInputElement).focus(), 50);
        saveWorkspaceState();
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
    saveWorkspaceState();
}

function showBottomPanel() {
    if (!bottomPanelVisible) toggleBottomPanel();
}

function toggleSidebar() {
    sidebarVisible = !sidebarVisible;
    $('sidebar').classList.toggle('hidden', !sidebarVisible);
    $('sidebar-resize').style.display = sidebarVisible ? '' : 'none';
    if (editor) editor.layout();
    saveWorkspaceState();
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
            'editorSuggestWidget.border': '#2a2a4a',
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

    // Ctrl+Scroll to zoom
    let fontSize = userSettings.fontSize || 14;
    $('editor-container').addEventListener('wheel', (e: WheelEvent) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.deltaY < 0) fontSize = Math.min(40, fontSize + 1);
        else fontSize = Math.max(8, fontSize - 1);
        editor.updateOptions({ fontSize });
        $('status-zoom').textContent = `${Math.round((fontSize / 14) * 100)}%`;
        userSettings.fontSize = fontSize;
        saveUserSettings();
    }, { passive: false });

    // Apply saved font size
    editor.updateOptions({ fontSize });
    $('status-zoom').textContent = `${Math.round((fontSize / 14) * 100)}%`;

    registerXbox360Completions(monaco);
    initCodeHelper();

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
    if (editor) editor.setModel(tab.model);
    $('editor-container').style.display = 'block';
    $('welcome-screen').style.display = 'none';
    renderTabs();
    saveWorkspaceState();
}

function closeTab(filePath: string) {
    const idx = openTabs.findIndex(t => t.path === filePath);
    if (idx === -1) return;
    const tab = openTabs[idx];
    if (tab.modified) {
        const save = confirm(`"${tab.name}" has unsaved changes. Save before closing?`);
        if (save) {
            ipcRenderer.invoke(IPC.FILE_WRITE, tab.path, tab.model.getValue());
        }
    }
    tab.model.dispose();
    openTabs.splice(idx, 1);
    if (activeTab === filePath) {
        if (openTabs.length > 0) {
            switchToTab(openTabs[Math.min(idx, openTabs.length - 1)].path);
        } else {
            activeTab = null;
            $('editor-container').style.display = 'none';
            $('welcome-screen').style.display = 'flex';
        }
    }
    renderTabs();
    saveWorkspaceState();
}

function closeAllTabs() {
    for (const tab of openTabs) tab.model.dispose();
    openTabs = [];
    activeTab = null;
    $('editor-container').style.display = 'none';
    $('welcome-screen').style.display = 'flex';
    renderTabs();
    saveWorkspaceState();
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
// Hidden project files that are filtered unless showHiddenFiles is enabled
const HIDDEN_PROJECT_FILES = new Set(['nexia.json', 'nexia-workspace.json']);

function filterHiddenProjectFiles(nodes: any[]): any[] {
    return nodes.filter(node => {
        if (!node.isDirectory && HIDDEN_PROJECT_FILES.has(node.name)) return false;
        if (node.isDirectory && node.children) {
            node.children = filterHiddenProjectFiles(node.children);
        }
        return true;
    });
}

async function refreshFileTree() {
    let tree = await ipcRenderer.invoke(IPC.FILE_LIST);
    const container = $('file-tree');
    container.innerHTML = '';

    // Filter hidden project files unless setting is enabled
    if (!userSettings.showHiddenFiles) {
        tree = filterHiddenProjectFiles(tree);
    }

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
        const isHeader = slug === 'header-files';
        const fileContext = isHeader ? 'header' : 'source';
        showContextMenu(e.clientX, e.clientY, [
            { label: 'New File...', action: () => inlineCreateItem('file') },
            { label: '─', action: () => {} },
            { label: 'Add Existing File...', action: () => addExistingFile(fileContext as any) },
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

async function addExistingFile(context: 'header' | 'source' | 'general' = 'general') {
    if (!currentProject) { appendOutput('Open a project first.\n'); return; }

    // Build file type filters based on context
    const HEADER_EXTS = ['h', 'hpp', 'hxx', 'inl'];
    const SOURCE_EXTS = ['cpp', 'c', 'cc', 'cxx'];
    const CODE_EXTS = [...SOURCE_EXTS, ...HEADER_EXTS];

    let filters: { name: string; extensions: string[] }[];
    let destDir: string;

    if (context === 'header') {
        filters = [
            { name: 'Header Files', extensions: HEADER_EXTS },
        ];
        destDir = nodePath.join(currentProject.path, 'include');
    } else if (context === 'source') {
        filters = [
            { name: 'Source Files', extensions: SOURCE_EXTS },
        ];
        destDir = nodePath.join(currentProject.path, 'src');
    } else {
        filters = [
            { name: 'Code Files', extensions: CODE_EXTS },
            { name: 'All Files', extensions: ['*'] },
        ];
        destDir = nodePath.join(currentProject.path, 'src');
    }

    const filePaths: string[] | null = await ipcRenderer.invoke('file:selectFiles', filters);
    if (!filePaths || filePaths.length === 0) return;
    if (!nodeFs.existsSync(destDir)) nodeFs.mkdirSync(destDir, { recursive: true });

    let added = 0;
    for (const filePath of filePaths) {
        const fileName = nodePath.basename(filePath);
        const dest = nodePath.join(destDir, fileName);
        try {
            nodeFs.copyFileSync(filePath, dest);
            added++;
        } catch (err: any) { appendOutput(`Add file failed (${fileName}): ${err.message}\n`); }
    }

    if (added > 0) {
        await refreshFileTree();
        // Open the last added file
        const lastFile = nodePath.join(destDir, nodePath.basename(filePaths[filePaths.length - 1]));
        if (nodeFs.existsSync(lastFile)) openFile(lastFile);
        appendOutput(`Added ${added} file${added > 1 ? 's' : ''}.\n`);
    }
}

function renderFileTree(nodes: any[], container: HTMLElement, depth: number, clear: boolean = true) {
    if (clear) container.innerHTML = '';
    for (const node of nodes) {
        const item = document.createElement('div');
        if (node.isDirectory) {
            const header = document.createElement('div');
            header.className = 'tree-item';
            header.style.paddingLeft = (8 + depth * 16) + 'px';
            header.setAttribute('data-dir-path', node.path);
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
                saveWorkspaceState();
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
    // Strip carriage returns from Windows-style line endings
    const cleaned = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = cleaned.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip the trailing empty segment from split (the preceding line already has \n)
        if (i === lines.length - 1 && line === '') {
            break;
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
    flushWorkspaceState();
    if (hasUnsavedChanges()) {
        const choice = confirm('You have unsaved changes. Save all before closing?');
        if (choice) {
            saveAllFiles().then(() => ipcRenderer.send(IPC.APP_CLOSE));
            return;
        }
    }
    ipcRenderer.send(IPC.APP_CLOSE);
}

// Safety net: also flush workspace state if the window is being unloaded
window.addEventListener('beforeunload', () => {
    flushWorkspaceState();
});

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

// ── Project Properties Dialog ──
function showProjectProperties() {
    if (!currentProject) { appendOutput('No project open.\n'); return; }

    // Populate controls from current project config
    ($('pp-enable-rtti') as HTMLInputElement).checked = !!currentProject.enableRTTI;
    ($('pp-exception-handling') as HTMLSelectElement).value = currentProject.exceptionHandling || 'EHsc';
    ($('pp-warning-level') as HTMLSelectElement).value = String(currentProject.warningLevel ?? 3);
    ($('pp-extra-cl-flags') as HTMLInputElement).value = currentProject.additionalCompilerFlags || '';
    ($('pp-extra-link-flags') as HTMLInputElement).value = currentProject.additionalLinkerFlags || '';

    $('project-props-overlay').classList.remove('hidden');
}

$('pp-cancel').addEventListener('click', () => {
    $('project-props-overlay').classList.add('hidden');
});

$('pp-save').addEventListener('click', async () => {
    if (!currentProject) return;

    currentProject.enableRTTI = ($('pp-enable-rtti') as HTMLInputElement).checked;
    currentProject.exceptionHandling = ($('pp-exception-handling') as HTMLSelectElement).value as any;
    currentProject.warningLevel = parseInt(($('pp-warning-level') as HTMLSelectElement).value, 10) as any;
    currentProject.additionalCompilerFlags = ($('pp-extra-cl-flags') as HTMLInputElement).value.trim();
    currentProject.additionalLinkerFlags = ($('pp-extra-link-flags') as HTMLInputElement).value.trim();

    // Persist to nexia.json
    try {
        await ipcRenderer.invoke(IPC.PROJECT_SAVE, currentProject);
        appendOutput('Project properties saved.\n');
    } catch (err: any) {
        appendOutput(`Failed to save project properties: ${err.message}\n`);
    }

    $('project-props-overlay').classList.add('hidden');
});

// Close on overlay background click
$('project-props-overlay').addEventListener('click', (e: MouseEvent) => {
    if (e.target === $('project-props-overlay')) {
        $('project-props-overlay').classList.add('hidden');
    }
});

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

    // Close any currently open tabs from a previous project
    for (const tab of openTabs) tab.model.dispose();
    openTabs = [];
    activeTab = null;

    currentProject = project;
    $('titlebar-project').textContent = `— ${project.name}`;
    await refreshFileTree();

    // Try to restore saved workspace state
    const savedState = loadWorkspaceState();
    if (savedState.openTabs.length > 0) {
        await restoreWorkspaceState(savedState);
    } else {
        // No saved state: fall back to opening main source file
        if (project.sourceFiles?.length > 0) {
            const mainFile = project.sourceFiles.find((f: string) => /main\.(cpp|c)$/i.test(f))
                          || project.sourceFiles[project.sourceFiles.length - 1];
            const f = nodePath.isAbsolute(mainFile) ? mainFile : nodePath.join(project.path, mainFile);
            openFile(f);
        }
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
                        <button class="ext-toggle-btn devkit-btn" data-ext-id="${m.id}" data-enabled="${ext.enabled}" style="font-size:11px;padding:3px 8px;">
                            ${ext.enabled ? '⏸ Disable' : '▶ Enable'}
                        </button>
                        <button class="ext-remove-btn devkit-btn" data-ext-id="${m.id}" style="font-size:11px;padding:3px 8px;color:#ff5555;">
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
    ($('setting-show-hidden-files') as HTMLInputElement).checked = userSettings.showHiddenFiles;
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
            if (editor) editor.updateOptions({ fontSize: userSettings.fontSize });
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
    if (target.id === 'setting-show-hidden-files') {
        userSettings.showHiddenFiles = target.checked;
        saveUserSettings();
        refreshFileTree();
    }
});

// Theme presets
const PRESETS: Record<string, Partial<UserSettings>> = {
    xbox:   { accentColor: '#00e676', bgDark: '#0d0d1a', bgMain: '#1a1a2e', bgPanel: '#16213e', bgSidebar: '#0f1526', editorBg: '#1a1a2e', textColor: '#e0e0e0', textDim: '#8888aa' },
    red:    { accentColor: '#ff5252', bgDark: '#1a0a0a', bgMain: '#2e1a1a', bgPanel: '#3e1616', bgSidebar: '#26100f', editorBg: '#2e1a1a', textColor: '#e0d0d0', textDim: '#aa7777' },
    blue:   { accentColor: '#448aff', bgDark: '#0a0d1a', bgMain: '#1a202e', bgPanel: '#16243e', bgSidebar: '#0f1526', editorBg: '#1a202e', textColor: '#dce0e8', textDim: '#7788aa' },
    purple: { accentColor: '#b388ff', bgDark: '#120d1a', bgMain: '#241a2e', bgPanel: '#2e163e', bgSidebar: '#1a0f26', editorBg: '#241a2e', textColor: '#e0dce8', textDim: '#9988aa' },
    orange: { accentColor: '#ffab40', bgDark: '#1a130a', bgMain: '#2e241a', bgPanel: '#3e2e16', bgSidebar: '#261e0f', editorBg: '#2e241a', textColor: '#e8e0d0', textDim: '#aa9977' },
    mono:   { accentColor: '#cccccc', bgDark: '#111111', bgMain: '#1c1c1c', bgPanel: '#252525', bgSidebar: '#181818', editorBg: '#1c1c1c', textColor: '#d4d4d4', textDim: '#888888' },
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

// ══════════════════════════════════════
//  TUTORIALS PANEL
// ══════════════════════════════════════
interface TutorialVideo {
    id: string;
    title: string;
    description: string;
    duration?: string;
}

const TUTORIAL_VIDEOS: TutorialVideo[] = [
    {
        id: 'dQw4w9WgXcQ',
        title: 'Getting Started with Nexia IDE',
        description: 'Install, configure the Xbox 360 SDK, and create your first project.',
        duration: '12:34',
    },
    {
        id: 'dQw4w9WgXcQ',
        title: 'Build Pipeline Walkthrough',
        description: 'Compile, link, and package your Xbox 360 homebrew into a deployable XEX.',
        duration: '18:02',
    },
    {
        id: 'dQw4w9WgXcQ',
        title: 'Dev Kit Deployment & Debugging',
        description: 'Connect to your dev kit, deploy builds, take screenshots, and debug live.',
        duration: '15:20',
    },
    {
        id: 'dQw4w9WgXcQ',
        title: 'D3D9 Graphics on Xbox 360',
        description: 'Set up Direct3D, create shaders, and render your first 3D scene.',
        duration: '22:45',
    },
    {
        id: 'dQw4w9WgXcQ',
        title: 'XUI User Interfaces',
        description: 'Build Xbox-native UIs with XUI scenes, buttons, and navigation.',
        duration: '14:10',
    },
    {
        id: 'dQw4w9WgXcQ',
        title: 'Using the Extensions System',
        description: 'Install, create, and manage IDE extensions to customize your workflow.',
        duration: '10:55',
    },
];

function renderTutorialsPanel() {
    const panel = $('tutorials-panel');
    if (!panel) return;

    let html = `
        <div style="padding:8px 12px;">
            <p style="font-size:11px; color:var(--text-dim); margin:0 0 12px 0; line-height:1.5;">
                Video tutorials to help you get started with Xbox 360 homebrew development in Nexia IDE.
            </p>
    `;

    for (const video of TUTORIAL_VIDEOS) {
        const thumbUrl = `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`;
        html += `
            <div class="tutorial-card" data-video-id="${video.id}" style="
                margin-bottom:10px; border-radius:6px; overflow:hidden;
                background:var(--bg-panel); border:1px solid rgba(255,255,255,0.06);
                cursor:pointer; transition:border-color 0.2s;
            ">
                <div style="position:relative; width:100%; padding-top:56.25%; background:#000;">
                    <img src="${thumbUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;"
                         onerror="this.style.display='none'">
                    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
                        width:40px;height:40px;border-radius:50%;background:rgba(255,0,0,0.85);
                        display:flex;align-items:center;justify-content:center;">
                        <div style="width:0;height:0;border-left:14px solid #fff;border-top:8px solid transparent;border-bottom:8px solid transparent;margin-left:3px;"></div>
                    </div>
                    ${video.duration ? `<span style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.8);color:#fff;font-size:10px;padding:1px 5px;border-radius:3px;">${video.duration}</span>` : ''}
                </div>
                <div style="padding:8px 10px;">
                    <div style="font-size:12px;font-weight:600;color:var(--text);line-height:1.3;margin-bottom:3px;">${video.title}</div>
                    <div style="font-size:10px;color:var(--text-dim);line-height:1.4;">${video.description}</div>
                </div>
            </div>
        `;
    }

    html += `
            <div style="margin-top:16px; text-align:center;">
                <button class="setup-btn" id="tutorials-open-channel" style="font-size:11px;">
                    View All on YouTube
                </button>
            </div>
        </div>
    `;

    panel.innerHTML = html;

    // Click to open videos in external browser
    panel.querySelectorAll('.tutorial-card').forEach((card: Element) => {
        card.addEventListener('click', () => {
            const videoId = (card as HTMLElement).dataset.videoId;
            if (videoId) shell.openExternal(`https://www.youtube.com/watch?v=${videoId}`);
        });
        (card as HTMLElement).addEventListener('mouseenter', () => {
            (card as HTMLElement).style.borderColor = 'var(--green)';
        });
        (card as HTMLElement).addEventListener('mouseleave', () => {
            (card as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)';
        });
    });

    document.getElementById('tutorials-open-channel')?.addEventListener('click', () => {
        shell.openExternal('https://www.youtube.com/@NexiaIDE');
    });
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
    const result = await ipcRenderer.invoke('project:export');
    if (result) appendOutput(`📦 Project exported to: ${result}\n`);
}

async function importProject() {
    const result = await ipcRenderer.invoke('project:import');
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
    const actions = $('replace-actions');
    if (show) {
        actions.classList.remove('hidden');
        actions.style.display = 'flex';
    } else {
        actions.classList.add('hidden');
        actions.style.display = 'none';
    }
});

// Replace All in files
$('btn-replace-all').addEventListener('click', () => {
    const query = ($('search-query') as HTMLInputElement).value;
    const replacement = ($('search-replace') as HTMLInputElement).value;
    const caseSensitive = ($('search-case') as HTMLInputElement).checked;
    const useRegex = ($('search-regex') as HTMLInputElement).checked;
    const include = ($('search-include') as HTMLInputElement).value;

    if (!query || !currentProject) return;

    const results = searchInFiles(query, caseSensitive, useRegex, include);
    if (results.length === 0) {
        appendOutput('Replace: No matches found.\n');
        return;
    }

    // Group by file
    const fileGroups = new Map<string, SearchMatch[]>();
    for (const r of results) {
        const arr = fileGroups.get(r.file) || [];
        arr.push(r);
        fileGroups.set(r.file, arr);
    }

    const fileCount = fileGroups.size;
    const matchCount = results.length;
    const confirmMsg = `Replace ${matchCount} occurrence${matchCount > 1 ? 's' : ''} across ${fileCount} file${fileCount > 1 ? 's' : ''}?`;
    if (!confirm(confirmMsg)) return;

    let re: RegExp;
    try {
        const flags = caseSensitive ? 'g' : 'gi';
        re = useRegex ? new RegExp(query, flags) : new RegExp(escapeRegExp(query), flags);
    } catch { return; }

    let replacedFiles = 0;
    let totalReplacements = 0;

    for (const [file] of fileGroups) {
        try {
            const content = nodeFs.readFileSync(file, 'utf-8');
            const newContent = content.replace(re, replacement);
            if (newContent !== content) {
                nodeFs.writeFileSync(file, newContent, 'utf-8');
                replacedFiles++;
                // Count replacements in this file
                re.lastIndex = 0;
                let count = 0;
                const lines = content.split('\n');
                for (const line of lines) {
                    re.lastIndex = 0;
                    let m;
                    while ((m = re.exec(line)) !== null) {
                        count++;
                        if (!re.global) break;
                        if (m[0].length === 0) re.lastIndex++;
                    }
                }
                totalReplacements += count;

                // Update any open tab model for this file
                const openTab = openTabs.find(t => t.path === file);
                if (openTab) {
                    openTab.model.setValue(newContent);
                    openTab.modified = false;
                }
            }
        } catch (err: any) {
            appendOutput(`Replace failed in ${nodePath.basename(file)}: ${err.message}\n`);
        }
    }

    appendOutput(`Replaced ${totalReplacements} occurrence${totalReplacements > 1 ? 's' : ''} in ${replacedFiles} file${replacedFiles > 1 ? 's' : ''}.\n`);

    // Re-run search to update results
    triggerSearch();
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
        userSettings.fontSize = Math.min(40, userSettings.fontSize + 1);
        if (editor) editor.updateOptions({ fontSize: userSettings.fontSize });
        $('status-zoom').textContent = `${Math.round((userSettings.fontSize / 14) * 100)}%`;
        saveUserSettings();
    }
    if (e.ctrlKey && e.key === '-') {
        e.preventDefault();
        userSettings.fontSize = Math.max(8, userSettings.fontSize - 1);
        if (editor) editor.updateOptions({ fontSize: userSettings.fontSize });
        $('status-zoom').textContent = `${Math.round((userSettings.fontSize / 14) * 100)}%`;
        saveUserSettings();
    }
    if (e.ctrlKey && e.key === '0') {
        e.preventDefault();
        userSettings.fontSize = 14;
        if (editor) editor.updateOptions({ fontSize: 14 });
        $('status-zoom').textContent = '100%';
        saveUserSettings();
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
    renderTutorialsPanel();
    renderCommunityPanel();
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
