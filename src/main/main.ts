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
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
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
    } catch (e) {
        console.error('Failed to load recent projects:', e);
    }
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
        thickFrame: true,         // Keeps native Windows snap/resize behavior
        backgroundColor: '#1e1e1e',
        icon: path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', '..'), 'resources', 'icon.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        show: false,
    });

    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
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
            if (!mainWindow) return null;
            const result = await dialog.showOpenDialog(mainWindow, {
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
        if (!mainWindow) return null;
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
        });
        return result.canceled ? null : result.filePaths[0];
    });

    ipcMain.handle(IPC.FILE_SELECT_FILE, async (_e, filters?: any[]) => {
        if (!mainWindow) return null;
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: filters || [{ name: 'All Files', extensions: ['*'] }],
        });
        return result.canceled ? null : result.filePaths[0];
    });

    // ── Project Export/Import ──
    ipcMain.handle(IPC.PROJECT_EXPORT, async () => {
        const project = projectManager.getCurrent();
        if (!project) throw new Error('No project open');
        if (!mainWindow) return null;
        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Export Project',
            defaultPath: path.join(require('os').homedir(), 'Desktop', `${project.name}.zip`),
            filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
        });
        if (result.canceled || !result.filePath) return null;
        const { execFile, execSync } = require('child_process');
        try {
            const src = project.path;
            const dest = result.filePath;
            if (process.platform === 'win32') {
                // Use execFile with argument array to avoid command injection
                await new Promise<void>((resolve, reject) => {
                    execFile('powershell.exe', [
                        '-NoProfile', '-NonInteractive', '-Command',
                        `Compress-Archive -Path (Join-Path '${src.replace(/'/g, "''")}' '*') -DestinationPath '${dest.replace(/'/g, "''")}' -Force`
                    ], { windowsHide: true }, (err: any) => err ? reject(err) : resolve());
                });
            } else {
                execSync(`cd "${src}" && zip -r "${dest}" . -x "out/*" "*.obj" "*.pch"`, { stdio: 'pipe' });
            }
            return result.filePath;
        } catch (err: any) { throw new Error('Export failed: ' + err.message); }
    });

    ipcMain.handle(IPC.PROJECT_IMPORT, async () => {
        if (!mainWindow) return null;
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Import Project (.zip)',
            properties: ['openFile'],
            filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
        });
        if (result.canceled || !result.filePaths[0]) return null;
        const zipPath = result.filePaths[0];
        // Ask where to extract
        const destResult = await dialog.showOpenDialog(mainWindow, {
            title: 'Choose extraction location',
            properties: ['openDirectory'],
        });
        if (destResult.canceled || !destResult.filePaths[0]) return null;
        const destDir = destResult.filePaths[0];
        const projectName = path.basename(zipPath, '.zip');
        const extractTo = path.join(destDir, projectName);
        const { execFile, execSync } = require('child_process');
        try {
            fs.mkdirSync(extractTo, { recursive: true });
            if (process.platform === 'win32') {
                await new Promise<void>((resolve, reject) => {
                    execFile('powershell.exe', [
                        '-NoProfile', '-NonInteractive', '-Command',
                        `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractTo.replace(/'/g, "''")}' -Force`
                    ], { windowsHide: true }, (err: any) => err ? reject(err) : resolve());
                });
            } else {
                execSync(`unzip -o "${zipPath}" -d "${extractTo}"`, { stdio: 'pipe' });
            }
            return extractTo;
        } catch (err: any) { throw new Error('Import failed: ' + err.message); }
    });

    // ── XEX Inspector ──
    ipcMain.handle(IPC.XEX_INSPECT, async (_e, xexPath?: string) => {
        let filePath = xexPath;
        if (!filePath) {
            if (!mainWindow) return null;
            const result = await dialog.showOpenDialog(mainWindow, {
                title: 'Open XEX File',
                properties: ['openFile'],
                filters: [{ name: 'Xbox 360 Executable', extensions: ['xex'] }, { name: 'All Files', extensions: ['*'] }],
            });
            if (result.canceled || !result.filePaths[0]) return null;
            filePath = result.filePaths[0];
        }

        try {
            const buf = fs.readFileSync(filePath);
            return parseXex(buf, filePath);
        } catch (err: any) {
            return { error: err.message, filePath };
        }
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
        // Validate URL is from Discord CDN to prevent arbitrary downloads
        const allowedHosts = ['cdn.discordapp.com', 'media.discordapp.net'];
        try {
            const parsed = new URL(url);
            if (!allowedHosts.includes(parsed.hostname)) {
                return { success: false, error: 'Download URL is not from a Discord CDN domain' };
            }
        } catch {
            return { success: false, error: 'Invalid download URL' };
        }

        const dlDir = path.join(app.getPath('downloads'), 'Nexia IDE');
        if (!fs.existsSync(dlDir)) fs.mkdirSync(dlDir, { recursive: true });
        const result = await discordFeed.downloadAttachment(url, dlDir, filename);
        if (result.success && result.filePath) {
            shell.showItemInFolder(result.filePath);
        }
        return result;
    });
}

// ── XEX2 Binary Parser ──

function parseXex(buf: Buffer, filePath: string): any {
    const result: any = {
        filePath,
        fileName: path.basename(filePath),
        fileSize: buf.length,
        fileSizeFormatted: formatBytes(buf.length),
        valid: false,
        error: null,
        header: {} as any,
        securityInfo: {} as any,
        optionalHeaders: [] as any[],
        sections: [] as any[],
        imports: [] as any[],
        resources: [] as any[],
        executionInfo: {} as any,
    };

    // XEX2 magic: "XEX2" at offset 0
    if (buf.length < 24) {
        result.error = 'File too small to be a valid XEX';
        return result;
    }

    const magic = buf.toString('ascii', 0, 4);
    if (magic !== 'XEX2' && magic !== 'XEX1' && magic !== 'XEX\0') {
        result.error = `Invalid magic: "${magic}" (expected "XEX2")`;
        return result;
    }

    result.valid = true;
    result.header.magic = magic;

    // XEX2 Header (Big Endian — Xbox 360 is PowerPC BE)
    result.header.moduleFlags = buf.readUInt32BE(4);
    result.header.peDataOffset = buf.readUInt32BE(8);
    result.header.reserved = buf.readUInt32BE(12);
    result.header.securityInfoOffset = buf.readUInt32BE(16);
    result.header.optionalHeaderCount = buf.readUInt32BE(20);

    // Decode module flags
    const flags = result.header.moduleFlags;
    result.header.moduleFlagsDecoded = [];
    if (flags & 0x00000001) result.header.moduleFlagsDecoded.push('TITLE_MODULE');
    if (flags & 0x00000002) result.header.moduleFlagsDecoded.push('EXPORTS_TO_TITLE');
    if (flags & 0x00000004) result.header.moduleFlagsDecoded.push('SYSTEM_DEBUGGER');
    if (flags & 0x00000008) result.header.moduleFlagsDecoded.push('DLL_MODULE');
    if (flags & 0x00000010) result.header.moduleFlagsDecoded.push('MODULE_PATCH');
    if (flags & 0x00000020) result.header.moduleFlagsDecoded.push('PATCH_FULL');
    if (flags & 0x00000040) result.header.moduleFlagsDecoded.push('PATCH_DELTA');
    if (flags & 0x00000080) result.header.moduleFlagsDecoded.push('USER_MODE');

    // Parse optional headers
    let offset = 24;
    const knownHeaders: Record<number, string> = {
        0x000002FF: 'Resource Info',
        0x000003FF: 'Base File Format',
        0x000005FF: 'Delta Patch Descriptor',
        0x00008001: 'Bounding Path',
        0x00008105: 'Device ID',
        0x000080FF: 'Original Base Address',
        0x00008102: 'Entry Point',
        0x00008103: 'Image Base Address',
        0x00008104: 'Import Libraries',
        0x000100FF: 'Checksum Timestamp',
        0x000101FF: 'Enabled For Callcap',
        0x000102FF: 'Enabled For Fastcap',
        0x000103FF: 'Original PE Name',
        0x00018002: 'Static Libraries',
        0x000183FF: 'TLS Info',
        0x000200FF: 'Default Stack Size',
        0x000201FF: 'Default Filesystem Cache Size',
        0x000300FF: 'Default Heap Size',
        0x00040006: 'System Flags',
        0x000400FF: 'Execution Info',
        0x000401FF: 'Service ID List',
        0x000402FF: 'Title Workspace Size',
        0x000403FF: 'Game Ratings',
        0x000405FF: 'LAN Key',
        0x000406FF: 'Xbox 360 Logo',
        0x000407FF: 'Multidisc Media IDs',
        0x000408FF: 'Alternate Title IDs',
        0x000409FF: 'Additional Title Memory',
        0x0004050B: 'Export Table',
    };

    for (let i = 0; i < result.header.optionalHeaderCount && offset + 8 <= buf.length; i++) {
        const headerId = buf.readUInt32BE(offset);
        const headerData = buf.readUInt32BE(offset + 4);
        const headerName = knownHeaders[headerId] || `Unknown (0x${headerId.toString(16).padStart(8, '0')})`;

        const entry: any = {
            id: headerId,
            idHex: '0x' + headerId.toString(16).padStart(8, '0'),
            name: headerName,
            dataOrOffset: headerData,
            dataHex: '0x' + headerData.toString(16).padStart(8, '0'),
        };

        // Extract specific header data
        if (headerId === 0x00008102 /* Entry Point */) {
            result.executionInfo.entryPoint = '0x' + headerData.toString(16).padStart(8, '0');
        } else if (headerId === 0x00008103 /* Image Base Address */) {
            result.executionInfo.imageBaseAddress = '0x' + headerData.toString(16).padStart(8, '0');
        } else if (headerId === 0x000080FF /* Original Base Address */) {
            result.executionInfo.originalBaseAddress = '0x' + headerData.toString(16).padStart(8, '0');
        } else if (headerId === 0x000200FF /* Default Stack Size */) {
            entry.value = headerData;
            entry.valueFormatted = formatBytes(headerData);
        } else if (headerId === 0x000300FF /* Default Heap Size */) {
            entry.value = headerData;
            entry.valueFormatted = formatBytes(headerData);
        } else if (headerId === 0x000103FF /* Original PE Name */) {
            // Points to offset containing the name string
            if (headerData > 0 && headerData + 4 < buf.length) {
                const nameLen = buf.readUInt32BE(headerData);
                if (nameLen > 0 && nameLen < 256 && headerData + 4 + nameLen <= buf.length) {
                    entry.value = buf.toString('ascii', headerData + 4, headerData + 4 + nameLen).replace(/\0/g, '');
                    result.header.originalPeName = entry.value;
                }
            }
        } else if (headerId === 0x000400FF /* Execution Info */ && headerData + 24 <= buf.length) {
            try {
                result.executionInfo.mediaId = '0x' + buf.readUInt32BE(headerData).toString(16).padStart(8, '0');
                result.executionInfo.version = `${buf.readUInt8(headerData + 4)}.${buf.readUInt8(headerData + 5)}.${buf.readUInt16BE(headerData + 6)}.${buf.readUInt8(headerData + 8)}`;
                result.executionInfo.baseVersion = `${buf.readUInt8(headerData + 9)}.${buf.readUInt8(headerData + 10)}.${buf.readUInt16BE(headerData + 11)}.${buf.readUInt8(headerData + 13)}`;
                result.executionInfo.titleId = '0x' + buf.readUInt32BE(headerData + 14).toString(16).padStart(8, '0');
                result.executionInfo.platform = buf.readUInt8(headerData + 18);
                result.executionInfo.executableType = buf.readUInt8(headerData + 19);
                result.executionInfo.discNumber = buf.readUInt8(headerData + 20);
                result.executionInfo.discCount = buf.readUInt8(headerData + 21);
            } catch {}
        } else if (headerId === 0x00008104 /* Import Libraries */ && headerData + 8 <= buf.length) {
            try {
                const nameTableSize = buf.readUInt32BE(headerData);
                const importCount = buf.readUInt32BE(headerData + 4);
                // Parse library name table
                let nameOffset = headerData + 8;
                const names: string[] = [];
                for (let n = 0; n < 16 && nameOffset < headerData + 8 + nameTableSize; n++) {
                    const end = buf.indexOf(0, nameOffset);
                    if (end <= nameOffset || end > headerData + 8 + nameTableSize) break;
                    const name = buf.toString('ascii', nameOffset, end);
                    if (name.length > 0) names.push(name);
                    nameOffset = end + 1;
                    // Skip padding
                    while (nameOffset < headerData + 8 + nameTableSize && buf[nameOffset] === 0) nameOffset++;
                }
                for (const name of names) {
                    result.imports.push({ library: name, functions: [] });
                }
                entry.value = `${names.length} libraries, ${importCount} total imports`;
                entry.libraries = names;
            } catch {}
        } else if (headerId === 0x000002FF /* Resource Info */ && headerData + 4 <= buf.length) {
            try {
                const resSize = buf.readUInt32BE(headerData);
                const resCount = Math.floor(resSize / 16);
                for (let r = 0; r < resCount && headerData + 4 + (r + 1) * 16 <= buf.length; r++) {
                    const resOff = headerData + 4 + r * 16;
                    const resName = buf.toString('ascii', resOff, resOff + 8).replace(/\0/g, '');
                    const resAddr = buf.readUInt32BE(resOff + 8);
                    const resLen = buf.readUInt32BE(resOff + 12);
                    result.resources.push({
                        name: resName,
                        address: '0x' + resAddr.toString(16).padStart(8, '0'),
                        size: resLen,
                        sizeFormatted: formatBytes(resLen),
                    });
                }
            } catch {}
        }

        result.optionalHeaders.push(entry);
        offset += 8;
    }

    // Parse security info
    const secOff = result.header.securityInfoOffset;
    if (secOff > 0 && secOff + 296 <= buf.length) {
        try {
            result.securityInfo.headerSize = buf.readUInt32BE(secOff);
            result.securityInfo.imageSize = buf.readUInt32BE(secOff + 4);
            result.securityInfo.imageSizeFormatted = formatBytes(buf.readUInt32BE(secOff + 4));

            // PE headers inside the XEX
            const peOff = result.header.peDataOffset;
            if (peOff > 0 && peOff + 0x100 < buf.length) {
                // Check for PE signature
                const peMagic = buf.toString('ascii', peOff, peOff + 2);
                if (peMagic === 'MZ') {
                    const peHeaderOff = buf.readUInt32LE(peOff + 0x3C);
                    const absOff = peOff + peHeaderOff;
                    if (absOff + 4 <= buf.length && buf.toString('ascii', absOff, absOff + 4) === 'PE\0\0') {
                        // COFF header
                        const numSections = buf.readUInt16LE(absOff + 6);
                        const timeDateStamp = buf.readUInt32LE(absOff + 8);
                        result.header.peTimestamp = new Date(timeDateStamp * 1000).toISOString();
                        result.header.peSectionCount = numSections;

                        // Optional header size
                        const optHeaderSize = buf.readUInt16LE(absOff + 20);
                        const sectionTableOff = absOff + 24 + optHeaderSize;

                        // Parse sections
                        for (let s = 0; s < numSections && sectionTableOff + (s + 1) * 40 <= buf.length; s++) {
                            const sOff = sectionTableOff + s * 40;
                            const secName = buf.toString('ascii', sOff, sOff + 8).replace(/\0/g, '');
                            const virtualSize = buf.readUInt32LE(sOff + 8);
                            const virtualAddr = buf.readUInt32LE(sOff + 12);
                            const rawSize = buf.readUInt32LE(sOff + 16);
                            const rawPtr = buf.readUInt32LE(sOff + 20);
                            const chars = buf.readUInt32LE(sOff + 36);

                            const charFlags: string[] = [];
                            if (chars & 0x00000020) charFlags.push('CODE');
                            if (chars & 0x00000040) charFlags.push('INITIALIZED_DATA');
                            if (chars & 0x00000080) charFlags.push('UNINITIALIZED_DATA');
                            if (chars & 0x20000000) charFlags.push('EXECUTE');
                            if (chars & 0x40000000) charFlags.push('READ');
                            if (chars & 0x80000000) charFlags.push('WRITE');

                            result.sections.push({
                                name: secName,
                                virtualSize,
                                virtualSizeFormatted: formatBytes(virtualSize),
                                virtualAddress: '0x' + virtualAddr.toString(16).padStart(8, '0'),
                                rawDataSize: rawSize,
                                rawDataSizeFormatted: formatBytes(rawSize),
                                rawDataPointer: '0x' + rawPtr.toString(16).padStart(8, '0'),
                                characteristics: charFlags,
                                characteristicsRaw: '0x' + (chars >>> 0).toString(16).padStart(8, '0'),
                            });
                        }
                    }
                }
            }
        } catch {}
    }

    return result;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const val = bytes / Math.pow(1024, i);
    return `${val < 10 ? val.toFixed(2) : val < 100 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
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
