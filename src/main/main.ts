/**
 * Nexia IDE — Main Process
 * Electron main process handling window creation, IPC, and backend services.
 */

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { Toolchain } from './toolchain';
import { BuildSystem } from './buildSystem';
import { DevkitManager } from './devkit';
import { EmulatorManager } from './emulator';
import { SdkTools } from './sdkTools';
import { ExtensionManager } from './extensions';
import { ProjectManager } from './projectManager';
import { DiscordFeed } from './discord';
import { IPC } from '../shared/types';

// ── Services ──
let toolchain: Toolchain;
let buildSystem: BuildSystem;
let devkitManager: DevkitManager;
let emulatorManager: EmulatorManager;
let sdkTools: SdkTools;
let extensionManager: ExtensionManager;
let projectManager: ProjectManager;
let discordFeed: DiscordFeed;
let mainWindow: BrowserWindow | null = null;

// ── App Settings ──
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const RECENT_PATH = path.join(app.getPath('userData'), 'recent.json');
const PROJECTS_DIR = path.join(app.getPath('documents'), 'Nexia IDE', 'Projects');

// Ensure Projects folder exists
function ensureProjectsDir() {
    if (!fs.existsSync(PROJECTS_DIR)) {
        fs.mkdirSync(PROJECTS_DIR, { recursive: true });
    }
    return PROJECTS_DIR;
}

function loadSettings(): any {
    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
        }
    } catch (e) {}
    return {};
}

function saveSettings(settings: any) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
}

function getRecentProjects(): string[] {
    try {
        if (fs.existsSync(RECENT_PATH)) {
            return JSON.parse(fs.readFileSync(RECENT_PATH, 'utf-8'));
        }
    } catch (e) {}
    return [];
}

function addRecentProject(projectPath: string) {
    let recent = getRecentProjects();
    recent = recent.filter(p => p !== projectPath);
    recent.unshift(projectPath);
    if (recent.length > 10) recent = recent.slice(0, 10);
    fs.writeFileSync(RECENT_PATH, JSON.stringify(recent, null, 2), 'utf-8');
}

function removeRecentProject(projectPath: string) {
    let recent = getRecentProjects();
    recent = recent.filter(p => p !== projectPath);
    fs.writeFileSync(RECENT_PATH, JSON.stringify(recent, null, 2), 'utf-8');
}

function sendToRenderer(channel: string, ...args: any[]) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, ...args);
    }
}

// ── Window Creation ──

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 600,
        frame: false,             // Custom title bar
        titleBarStyle: 'hidden',
        backgroundColor: '#1a1a2e',
        icon: path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', '..'), 'resources', 'icon.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        show: false,
    });

    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow!.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ── Initialize Services ──

async function initializeServices() {
    toolchain = new Toolchain();
    buildSystem = new BuildSystem(toolchain);
    devkitManager = new DevkitManager(toolchain);

    // Initialize emulator manager
    emulatorManager = new EmulatorManager();
    emulatorManager.setOutputCallback((data) => sendToRenderer(IPC.TOOL_OUTPUT, data));
    emulatorManager.setStateChangeCallback((state) => sendToRenderer(IPC.EMU_EVENT, { event: 'state', state }));
    emulatorManager.setEventCallback((event) => sendToRenderer(IPC.EMU_EVENT, event));
    sdkTools = new SdkTools(toolchain);
    extensionManager = new ExtensionManager();
    projectManager = new ProjectManager();

    // Forward build/tool output to renderer
    buildSystem.setOutputCallback((data) => sendToRenderer(IPC.BUILD_OUTPUT, data));
    devkitManager.setOutputCallback((data) => sendToRenderer(IPC.TOOL_OUTPUT, data));
    sdkTools.setOutputCallback((data) => sendToRenderer(IPC.TOOL_OUTPUT, data));
    extensionManager.setOutputCallback((data) => sendToRenderer(IPC.TOOL_OUTPUT, data));

    // Try to auto-detect SDK
    const settings = loadSettings();
    if (settings.emulatorPath) emulatorManager.configure(settings.emulatorPath);
    if (settings.sdkPath) {
        await toolchain.configure(settings.sdkPath);
    } else {
        await toolchain.detect();
    }

    // Initialize Discord feed from saved settings
    discordFeed = new DiscordFeed({
        botToken: settings.discordBotToken || '',
        channelId: settings.discordChannelId || '',
        clientId: settings.discordClientId || '',
        clientSecret: settings.discordClientSecret || '',
        enabled: settings.discordEnabled ?? false,
    });

    // Restore saved Discord user session
    if (settings.discordUser) {
        discordFeed.setAuthUser(settings.discordUser);
    }
}

// ── IPC Handlers ──

function registerIpcHandlers() {
    // ── App ──
    ipcMain.handle(IPC.APP_READY, async () => {
        ensureProjectsDir();
        const settings = loadSettings();
        return {
            sdkConfigured: !!toolchain.getPaths(),
            sdkPaths: toolchain.getPaths(),
            sdkBundled: toolchain.isBundled(),
            recentProjects: getRecentProjects(),
            firstRun: !settings.setupComplete,
            projectsDir: PROJECTS_DIR,
        };
    });

    ipcMain.on(IPC.APP_MINIMIZE, () => mainWindow?.minimize());
    ipcMain.on(IPC.APP_MAXIMIZE, () => {
        if (mainWindow?.isMaximized()) mainWindow.unmaximize();
        else mainWindow?.maximize();
    });
    ipcMain.on(IPC.APP_CLOSE, () => mainWindow?.close());

    // ── SDK ──
    ipcMain.handle(IPC.SDK_DETECT, async () => {
        const result = await toolchain.detect();
        return { paths: result, bundled: toolchain.isBundled() };
    });

    ipcMain.handle(IPC.SDK_CONFIGURE, async (_e, sdkPath: string) => {
        const result = await toolchain.configure(sdkPath);
        if (result) {
            const settings = loadSettings();
            settings.sdkPath = sdkPath;
            saveSettings(settings);
        }
        return result;
    });

    ipcMain.handle(IPC.SDK_GET_PATHS, async () => toolchain.getPaths());
    ipcMain.handle(IPC.SDK_GET_TOOLS, async () => toolchain.getToolInventory());

    // ── Project ──
    ipcMain.handle(IPC.PROJECT_GET_TEMPLATES, async () => projectManager.getTemplates());

    ipcMain.handle(IPC.PROJECT_NEW, async (_e, name: string, directory: string, templateId: string) => {
        const project = await projectManager.create(name, directory, templateId);
        addRecentProject(project.path);
        return project;
    });

    ipcMain.handle(IPC.PROJECT_OPEN, async (_e, projectDir?: string) => {
        let dir = projectDir;
        if (!dir) {
            const result = await dialog.showOpenDialog(mainWindow!, {
                properties: ['openDirectory'],
                title: 'Open Xbox 360 Project',
            });
            if (result.canceled || result.filePaths.length === 0) return null;
            dir = result.filePaths[0];
        }
        const project = await projectManager.open(dir!);
        addRecentProject(project.path);
        return project;
    });

    ipcMain.handle(IPC.PROJECT_SAVE, async (_e, config?: any) => {
        await projectManager.save(config);
    });

    ipcMain.handle(IPC.PROJECT_GET_CONFIG, async () => projectManager.getCurrent());

    // ── Files ──
    ipcMain.handle(IPC.FILE_READ, async (_e, filePath: string) => {
        return fs.readFileSync(filePath, 'utf-8');
    });

    ipcMain.handle(IPC.FILE_WRITE, async (_e, filePath: string, content: string) => {
        fs.writeFileSync(filePath, content, 'utf-8');
    });

    ipcMain.handle(IPC.FILE_LIST, async (_e, dirPath?: string) => {
        return projectManager.getFileTree(dirPath);
    });

    ipcMain.handle(IPC.FILE_CREATE, async (_e, filePath: string, content: string = '') => {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf-8');
    });

    ipcMain.handle(IPC.FILE_DELETE, async (_e, filePath: string) => {
        fs.rmSync(filePath, { recursive: true, force: true });
    });

    ipcMain.handle(IPC.FILE_RENAME, async (_e, oldPath: string, newPath: string) => {
        fs.renameSync(oldPath, newPath);
    });

    ipcMain.handle(IPC.FILE_SELECT_DIR, async () => {
        const result = await dialog.showOpenDialog(mainWindow!, {
            properties: ['openDirectory'],
        });
        return result.canceled ? null : result.filePaths[0];
    });

    ipcMain.handle(IPC.FILE_SELECT_FILE, async (_e, filters?: any[]) => {
        const result = await dialog.showOpenDialog(mainWindow!, {
            properties: ['openFile'],
            filters: filters || [{ name: 'All Files', extensions: ['*'] }],
        });
        return result.canceled ? null : result.filePaths[0];
    });

    // ── Project Export/Import ──
    ipcMain.handle('project:export', async () => {
        const project = projectManager.getCurrent();
        if (!project) throw new Error('No project open');
        const result = await dialog.showSaveDialog(mainWindow!, {
            title: 'Export Project',
            defaultPath: path.join(require('os').homedir(), 'Desktop', `${project.name}.zip`),
            filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
        });
        if (result.canceled || !result.filePath) return null;
        // Create zip using PowerShell (Windows) or tar (Linux/Mac)
        const { execSync } = require('child_process');
        try {
            const src = project.path.replace(/\\/g, '/');
            const dest = result.filePath.replace(/\\/g, '/');
            // Exclude build output
            if (process.platform === 'win32') {
                execSync(`powershell -Command "Compress-Archive -Path '${src}\\*' -DestinationPath '${dest}' -Force"`, { stdio: 'pipe' });
            } else {
                execSync(`cd "${src}" && zip -r "${dest}" . -x "out/*" "*.obj" "*.pch"`, { stdio: 'pipe' });
            }
            return result.filePath;
        } catch (err: any) { throw new Error('Export failed: ' + err.message); }
    });

    ipcMain.handle('project:import', async () => {
        const result = await dialog.showOpenDialog(mainWindow!, {
            title: 'Import Project (.zip)',
            properties: ['openFile'],
            filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
        });
        if (result.canceled || !result.filePaths[0]) return null;
        const zipPath = result.filePaths[0];
        // Ask where to extract
        const destResult = await dialog.showOpenDialog(mainWindow!, {
            title: 'Choose extraction location',
            properties: ['openDirectory'],
        });
        if (destResult.canceled || !destResult.filePaths[0]) return null;
        const destDir = destResult.filePaths[0];
        const projectName = path.basename(zipPath, '.zip');
        const extractTo = path.join(destDir, projectName);
        const { execSync } = require('child_process');
        try {
            fs.mkdirSync(extractTo, { recursive: true });
            if (process.platform === 'win32') {
                execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractTo}' -Force"`, { stdio: 'pipe' });
            } else {
                execSync(`unzip -o "${zipPath}" -d "${extractTo}"`, { stdio: 'pipe' });
            }
            return extractTo;
        } catch (err: any) { throw new Error('Import failed: ' + err.message); }
    });

    // ── Build ──
    ipcMain.handle(IPC.BUILD_RUN, async (_e, config?: any) => {
        const project = projectManager.getCurrent();
        if (!project) throw new Error('No project open');
        const result = await buildSystem.build(project, config);
        sendToRenderer(IPC.BUILD_COMPLETE, result);
        return result;
    });

    ipcMain.handle(IPC.BUILD_CLEAN, async () => {
        const project = projectManager.getCurrent();
        if (!project) throw new Error('No project open');
        await buildSystem.clean(project);
    });

    ipcMain.handle(IPC.BUILD_REBUILD, async (_e, config?: any) => {
        const project = projectManager.getCurrent();
        if (!project) throw new Error('No project open');
        await buildSystem.clean(project);
        const result = await buildSystem.build(project, config);
        sendToRenderer(IPC.BUILD_COMPLETE, result);
        return result;
    });

    // ── SDK Tools ──
    ipcMain.handle(IPC.TOOL_COMPILE_SHADER, async (_e, input: string, output: string, profile: string, entry: string) => {
        return sdkTools.compileShader(input, output, profile, entry);
    });

    ipcMain.handle(IPC.TOOL_BUILD_XEX, async (_e, input: string, output: string) => {
        return sdkTools.buildXex(input, output);
    });

    ipcMain.handle(IPC.TOOL_ENCODE_AUDIO, async (_e, input: string, output: string) => {
        return sdkTools.encodeAudioXma2(input, output);
    });

    ipcMain.handle(IPC.TOOL_COMPILE_XUI, async (_e, input: string, output: string) => {
        return sdkTools.compileXui(input, output);
    });

    ipcMain.handle(IPC.TOOL_INSPECT_BINARY, async (_e, input: string) => {
        return sdkTools.inspectBinary(input);
    });

    ipcMain.handle(IPC.TOOL_COMPRESS, async (_e, input: string, output: string) => {
        return sdkTools.compress(input, output);
    });

    ipcMain.handle(IPC.TOOL_LAUNCH_PIX, async () => {
        return sdkTools.launchPix();
    });

    ipcMain.handle(IPC.TOOL_RUN, async (_e, toolName: string, args: string[]) => {
        return sdkTools.runTool(toolName, args);
    });

    ipcMain.handle(IPC.TOOL_LAUNCH, async (_e, toolName: string, isGui: boolean) => {
        return sdkTools.launchTool(toolName, isGui);
    });

    // ── Extensions ──
    ipcMain.handle(IPC.EXT_LIST, async () => {
        return extensionManager.getInstalled();
    });

    ipcMain.handle(IPC.EXT_INSTALL_ZIP, async (_e, zipPath: string) => {
        return extensionManager.installFromZip(zipPath);
    });

    ipcMain.handle(IPC.EXT_INSTALL_FOLDER, async (_e, folderPath: string) => {
        return extensionManager.installFromFolder(folderPath);
    });

    ipcMain.handle(IPC.EXT_UNINSTALL, async (_e, extensionId: string) => {
        return extensionManager.uninstall(extensionId);
    });

    ipcMain.handle(IPC.EXT_SET_ENABLED, async (_e, extensionId: string, enabled: boolean) => {
        return extensionManager.setEnabled(extensionId, enabled);
    });

    ipcMain.handle(IPC.EXT_CREATE, async (_e, name: string, type: string) => {
        return extensionManager.createTemplate(name, type as any);
    });

    ipcMain.handle(IPC.EXT_OPEN_DIR, async () => {
        extensionManager.openExtensionsDir();
    });

    // ── Devkit ──
    ipcMain.handle(IPC.DEVKIT_CONNECT, async (_e, ip: string) => {
        return devkitManager.connect(ip);
    });

    ipcMain.handle(IPC.DEVKIT_DISCONNECT, async () => {
        devkitManager.disconnect();
        return { connected: false };
    });

    ipcMain.handle(IPC.DEVKIT_STATUS, async () => {
        return {
            connected: devkitManager.isConnected(),
            ip: devkitManager.getConnectedIp(),
        };
    });

    ipcMain.handle(IPC.DEVKIT_SYSINFO, async (_e, ip?: string) => {
        return devkitManager.getSystemInfo(ip);
    });

    ipcMain.handle(IPC.DEVKIT_VOLUMES, async (_e, ip?: string) => {
        return devkitManager.listVolumes(ip);
    });

    ipcMain.handle(IPC.DEVKIT_DEPLOY, async (_e, xexPath: string, ip?: string) => {
        return devkitManager.deployAndRun(xexPath, ip);
    });

    ipcMain.handle(IPC.DEVKIT_LAUNCH, async (_e, remotePath: string, ip?: string) => {
        return devkitManager.launchTitle(remotePath, ip);
    });

    ipcMain.handle(IPC.DEVKIT_REBOOT, async (_e, type: string, ip?: string) => {
        return devkitManager.reboot(type as any, ip);
    });

    ipcMain.handle(IPC.DEVKIT_SCREENSHOT, async (_e, outputPath: string, ip?: string) => {
        return devkitManager.screenshot(outputPath, ip);
    });

    ipcMain.handle(IPC.DEVKIT_FILE_MANAGER, async (_e, remotePath: string, ip?: string) => {
        return devkitManager.listFiles(remotePath, ip);
    });

    // ── Emulator ──
    ipcMain.handle(IPC.EMU_CONFIGURE, async (_e, emulatorPath: string) => {
        emulatorManager.configure(emulatorPath);
        const settings = loadSettings();
        settings.emulatorPath = emulatorPath;
        saveSettings(settings);
        return { configured: emulatorManager.isConfigured() };
    });

    ipcMain.handle(IPC.EMU_GET_CONFIG, async () => {
        return {
            path: emulatorManager.getEmulatorPath(),
            configured: emulatorManager.isConfigured(),
        };
    });

    ipcMain.handle(IPC.EMU_LAUNCH, async (_e, xexPath: string) => {
        return emulatorManager.launch(xexPath);
    });

    ipcMain.handle(IPC.EMU_STOP, async () => {
        emulatorManager.stop();
        return { success: true };
    });

    ipcMain.handle(IPC.EMU_PAUSE, async () => {
        return await emulatorManager.pause();
    });

    ipcMain.handle(IPC.EMU_RESUME, async () => {
        return { ok: await emulatorManager.resume() };
    });

    ipcMain.handle(IPC.EMU_STEP, async () => {
        return await emulatorManager.step();
    });

    ipcMain.handle(IPC.EMU_STEP_OVER, async () => {
        return await emulatorManager.stepOver();
    });

    ipcMain.handle(IPC.EMU_STATE, async () => {
        return {
            state: emulatorManager.getState(),
            registers: emulatorManager.getRegisters(),
            breakpoints: emulatorManager.getBreakpoints(),
        };
    });

    ipcMain.handle(IPC.EMU_REGISTERS, async () => {
        return await emulatorManager.requestRegisters();
    });

    ipcMain.handle(IPC.EMU_BREAKPOINT_SET, async (_e, addr: string) => {
        return await emulatorManager.setBreakpoint(addr);
    });

    ipcMain.handle(IPC.EMU_BREAKPOINT_REMOVE, async (_e, id: string) => {
        return { ok: await emulatorManager.removeBreakpoint(id) };
    });

    ipcMain.handle(IPC.EMU_BREAKPOINT_LIST, async () => {
        return await emulatorManager.listBreakpoints();
    });

    ipcMain.handle(IPC.EMU_BACKTRACE, async () => {
        return await emulatorManager.getBacktrace();
    });

    ipcMain.handle(IPC.EMU_MEMORY_READ, async (_e, addr: string, size: number) => {
        return await emulatorManager.readMemory(addr, size);
    });

    ipcMain.handle(IPC.EMU_MEMORY_WRITE, async (_e, addr: string, data: string) => {
        return { ok: await emulatorManager.writeMemory(addr, data) };
    });

    // ── Setup Complete ──
    ipcMain.handle(IPC.APP_SHOW_SETUP, async () => {
        const settings = loadSettings();
        settings.setupComplete = true;
        saveSettings(settings);
    });

    ipcMain.handle(IPC.APP_GET_RECENT, async () => getRecentProjects());

    ipcMain.handle(IPC.APP_REMOVE_RECENT, async (_e, projectPath: string) => {
        removeRecentProject(projectPath);
        return getRecentProjects();
    });

    // ── Discord ──
    ipcMain.handle(IPC.DISCORD_GET_FEED, async (_e, force?: boolean) => {
        if (force) discordFeed.clearCache();
        return discordFeed.getThreads();
    });

    ipcMain.handle(IPC.DISCORD_GET_CONFIG, async () => {
        return discordFeed.getConfig();
    });

    ipcMain.handle(IPC.DISCORD_CONFIGURE, async (_e, config: { botToken?: string; channelId?: string; clientId?: string; clientSecret?: string; enabled?: boolean }) => {
        discordFeed.configure(config);
        // Persist to settings
        const settings = loadSettings();
        if (config.botToken !== undefined) settings.discordBotToken = config.botToken;
        if (config.channelId !== undefined) settings.discordChannelId = config.channelId;
        if (config.clientId !== undefined) settings.discordClientId = config.clientId;
        if (config.clientSecret !== undefined) settings.discordClientSecret = config.clientSecret;
        if (config.enabled !== undefined) settings.discordEnabled = config.enabled;
        saveSettings(settings);
        return discordFeed.getConfig();
    });

    ipcMain.handle(IPC.DISCORD_GET_MESSAGES, async (_e, threadId: string) => {
        return discordFeed.getThreadMessages(threadId);
    });

    ipcMain.handle(IPC.DISCORD_GET_NEW_MESSAGES, async (_e, threadId: string, afterMessageId: string) => {
        return discordFeed.getNewMessages(threadId, afterMessageId);
    });

    ipcMain.handle(IPC.DISCORD_CREATE_THREAD, async (_e, title: string, content: string) => {
        return discordFeed.createThread(title, content);
    });

    ipcMain.handle(IPC.DISCORD_REPLY, async (_e, threadId: string, content: string) => {
        return discordFeed.replyToThread(threadId, content);
    });

    ipcMain.handle(IPC.DISCORD_AUTH_START, async () => {
        if (!discordFeed.isOAuthConfigured()) {
            return { success: false, error: 'OAuth2 not configured. Add Client ID and Client Secret in Discord settings.' };
        }
        // Open browser to Discord authorize page
        const authUrl = discordFeed.getAuthUrl();
        shell.openExternal(authUrl);
        // Wait for callback
        const user = await discordFeed.startAuth();
        if (user) {
            // Persist user session
            const settings = loadSettings();
            settings.discordUser = user;
            saveSettings(settings);
            return { success: true, user: { id: user.id, username: user.username, avatarUrl: user.avatarUrl } };
        }
        return { success: false, error: 'Login cancelled or failed' };
    });

    ipcMain.handle(IPC.DISCORD_AUTH_USER, async () => {
        const user = discordFeed.getAuthUser();
        if (user) return { loggedIn: true, id: user.id, username: user.username, avatarUrl: user.avatarUrl };
        return { loggedIn: false };
    });

    ipcMain.handle(IPC.DISCORD_AUTH_LOGOUT, async () => {
        discordFeed.logout();
        const settings = loadSettings();
        delete settings.discordUser;
        saveSettings(settings);
        return { success: true };
    });

    ipcMain.handle(IPC.DISCORD_DOWNLOAD, async (_e, url: string, filename: string) => {
        const dlDir = path.join(app.getPath('downloads'), 'Nexia IDE');
        if (!fs.existsSync(dlDir)) fs.mkdirSync(dlDir, { recursive: true });
        const result = await discordFeed.downloadAttachment(url, dlDir, filename);
        if (result.success && result.filePath) {
            shell.showItemInFolder(result.filePath);
        }
        return result;
    });
}

// ── App Lifecycle ──

app.whenReady().then(async () => {
    await initializeServices();
    registerIpcHandlers();
    createWindow();
});

app.on('window-all-closed', () => {
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
