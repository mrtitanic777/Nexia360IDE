/**
 * authService.ts — Authentication client for Nexia IDE
 *
 * Communicates with the Nexia auth server (Node.js/Express).
 * Manages JWT tokens, user sessions, and role checking.
 *
 * API Contract (server must implement):
 *
 *   POST /api/auth/register   { username, email, password }           → { token, user }
 *   POST /api/auth/login      { email, password }                     → { token, user }
 *   GET  /api/auth/me          Authorization: Bearer <token>          → { user }
 *   POST /api/auth/refresh     Authorization: Bearer <token>          → { token, user }
 *
 *   GET  /api/admin/users      Authorization: Bearer <admin-token>    → { users[] }
 *   POST /api/admin/promote    { userId, role }  + admin token        → { user }
 *   POST /api/admin/demote     { userId }        + admin token        → { user }
 *   DELETE /api/admin/users/:id  admin token                          → { success }
 *
 *   GET  /api/lessons                                                 → { lessons[] }  (public list)
 *   GET  /api/lessons/:id                                             → { lesson }     (full lesson data)
 *   POST /api/lessons           admin token + lesson data             → { lesson }
 *   PUT  /api/lessons/:id       admin token + lesson data             → { lesson }
 *   DELETE /api/lessons/:id     admin token                           → { success }
 *
 * User object shape:
 *   { id, username, email, role: 'user' | 'admin', createdAt, lastLogin }
 *
 * The first registered user is auto-promoted to admin by the server.
 */

// ── Types ──

export interface NexiaUser {
    id: string;
    username: string;
    email: string;
    role: 'user' | 'admin';
    createdAt: string;
    lastLogin: string;
    avatarUrl?: string;
}

export interface AuthResult {
    success: boolean;
    token?: string;
    user?: NexiaUser;
    error?: string;
}

export interface LessonMeta {
    id: string;
    title: string;
    author: string;
    version: string;
    difficulty: string;
    description: string;
    language: string;
    tags: string[];
    createdAt: string;
    updatedAt: string;
}

export type AuthStateListener = (user: NexiaUser | null) => void;
export type ConnectionStateListener = (state: ConnectionState) => void;

export interface ConnectionState {
    connected: boolean;
    serverOnline: boolean;
    authenticated: boolean;
    offlineMode: boolean;
    lastPulse: string | null;
    lastConnected: string | null;   // when we last had a successful connection
    failCount: number;
    serverVersion?: string;
    serverUptime?: number;
    queuedActions: number;          // items waiting to sync
    syncInProgress: boolean;
}

export interface OfflineAction {
    id: string;
    type: 'lesson-progress' | 'quiz-score' | 'flashcard-add' | 'profile-update' | 'custom';
    payload: any;
    timestamp: string;
    synced: boolean;
}

// ── Configuration ──

const DEFAULT_SERVER_URL = 'http://138.197.25.107:3500';
const TOKEN_STORAGE_KEY = 'nexia_auth_token';

const PULSE_INTERVAL = 60 * 1000;         // 60 seconds
const PULSE_TIMEOUT = 8000;               // 8 second timeout
const PULSE_MAX_FAILURES = 3;             // enter offline mode after 3 failures
const RECONNECT_INTERVAL = 30 * 1000;     // check every 30s while offline
const OFFLINE_QUEUE_FILE = '.nexia-ide-offline-queue.json';

// ── State ──

let _token: string | null = null;
let _user: NexiaUser | null = null;
let _serverUrl: string = DEFAULT_SERVER_URL;
let _listeners: AuthStateListener[] = [];
let _connectionListeners: ConnectionStateListener[] = [];
let _refreshTimer: ReturnType<typeof setInterval> | null = null;
let _pulseTimer: ReturnType<typeof setInterval> | null = null;
let _offlineQueue: OfflineAction[] = [];
let _userSnapshot: NexiaUser | null = null; // cached user for offline mode

let _connectionState: ConnectionState = {
    connected: false,
    serverOnline: false,
    authenticated: false,
    offlineMode: false,
    lastPulse: null,
    lastConnected: null,
    failCount: 0,
    queuedActions: 0,
    syncInProgress: false,
};

// ── Helpers ──

function getStoredToken(): string | null {
    try {
        const fs = require('fs');
        const os = require('os');
        const path = require('path');
        const tokenFile = path.join(os.homedir(), '.nexia-ide-token.json');
        if (fs.existsSync(tokenFile)) {
            const data = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
            return data.token || null;
        }
    } catch {}
    return null;
}

function storeToken(token: string | null) {
    try {
        const fs = require('fs');
        const os = require('os');
        const path = require('path');
        const tokenFile = path.join(os.homedir(), '.nexia-ide-token.json');
        if (token) {
            fs.writeFileSync(tokenFile, JSON.stringify({ token }, null, 2));
        } else {
            if (fs.existsSync(tokenFile)) fs.unlinkSync(tokenFile);
        }
    } catch {}
}

function notifyListeners() {
    for (const fn of _listeners) {
        try { fn(_user); } catch {}
    }
}

// ── Offline Queue ──

function getQueuePath(): string {
    const os = require('os');
    const path = require('path');
    return path.join(os.homedir(), OFFLINE_QUEUE_FILE);
}

function loadOfflineQueue() {
    try {
        const fs = require('fs');
        const queuePath = getQueuePath();
        if (fs.existsSync(queuePath)) {
            _offlineQueue = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
        }
    } catch { _offlineQueue = []; }
}

function saveOfflineQueue() {
    try {
        const fs = require('fs');
        fs.writeFileSync(getQueuePath(), JSON.stringify(_offlineQueue, null, 2));
    } catch {}
}

function enterOfflineMode() {
    if (_connectionState.offlineMode) return; // already offline

    // Snapshot the user so we can keep showing their info
    if (_user) _userSnapshot = { ..._user };

    console.warn('[AuthService] Entering offline mode');
    updateConnectionState({
        ..._connectionState,
        offlineMode: true,
        connected: false,
        serverOnline: false,
        queuedActions: _offlineQueue.filter(a => !a.synced).length,
    });

    // Switch to slower reconnect polling
    stopPulse();
    _pulseTimer = setInterval(doPulse, RECONNECT_INTERVAL);
}

async function exitOfflineMode() {
    if (!_connectionState.offlineMode) return;

    console.log('[AuthService] Reconnected — exiting offline mode');

    // Revalidate token first
    if (_token) {
        const result = await apiFetch('/api/auth/me');
        if (result.success && result.user) {
            _user = result.user;
            _userSnapshot = null;
            startRefreshTimer();
            notifyListeners();
        } else {
            // Token expired during offline period — keep user data but clear auth
            _token = null;
            storeToken(null);
            notifyListeners();
        }
    }

    // Sync queued actions
    await syncOfflineQueue();

    updateConnectionState({
        ..._connectionState,
        offlineMode: false,
        connected: _token !== null,
        serverOnline: true,
        authenticated: _token !== null,
        queuedActions: _offlineQueue.filter(a => !a.synced).length,
        syncInProgress: false,
    });

    // Resume normal pulse interval
    stopPulse();
    startPulse();
}

async function syncOfflineQueue() {
    const pending = _offlineQueue.filter(a => !a.synced);
    if (pending.length === 0) return;

    console.log(`[AuthService] Syncing ${pending.length} queued actions...`);
    updateConnectionState({ ..._connectionState, syncInProgress: true });

    for (const action of pending) {
        try {
            let endpoint = '';
            let method = 'POST';
            let body: any = action.payload;

            switch (action.type) {
                case 'lesson-progress':
                    endpoint = '/api/auth/sync/progress';
                    body = { ...action.payload, offlineTimestamp: action.timestamp };
                    break;
                case 'quiz-score':
                    endpoint = '/api/auth/sync/quiz';
                    body = { ...action.payload, offlineTimestamp: action.timestamp };
                    break;
                case 'flashcard-add':
                    endpoint = '/api/auth/sync/flashcard';
                    body = { ...action.payload, offlineTimestamp: action.timestamp };
                    break;
                case 'profile-update':
                    endpoint = '/api/auth/profile';
                    method = 'PUT';
                    break;
                case 'custom':
                    endpoint = action.payload.endpoint || '';
                    method = action.payload.method || 'POST';
                    body = action.payload.data;
                    break;
                default:
                    action.synced = true;
                    continue;
            }

            if (endpoint) {
                const result = await apiFetch(endpoint, {
                    method,
                    body: JSON.stringify(body),
                });
                if (result.success !== false) {
                    action.synced = true;
                }
            }
        } catch {
            // Failed to sync — will retry next time
            console.warn(`[AuthService] Failed to sync action ${action.id}`);
        }
    }

    // Clean up synced actions
    _offlineQueue = _offlineQueue.filter(a => !a.synced);
    saveOfflineQueue();

    const remaining = _offlineQueue.length;
    if (remaining === 0) {
        console.log('[AuthService] All queued actions synced successfully');
    } else {
        console.warn(`[AuthService] ${remaining} actions still pending`);
    }
}

async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = _serverUrl + endpoint;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {}),
    };
    if (_token) {
        headers['Authorization'] = 'Bearer ' + _token;
    }

    try {
        const resp = await fetch(url, { ...options, headers });
        const data = await resp.json();

        if (!resp.ok) {
            return { success: false, error: data.error || data.message || `HTTP ${resp.status}` };
        }
        return { success: true, ...data };
    } catch (err: any) {
        return { success: false, error: 'Connection failed: ' + (err.message || err) };
    }
}

// ── Token Refresh ──

function startRefreshTimer() {
    stopRefreshTimer();
    _refreshTimer = setInterval(async () => {
        if (!_token) return;
        const result = await apiFetch('/api/auth/refresh', { method: 'POST' });
        if (result.success && result.token) {
            _token = result.token;
            storeToken(_token);
            if (result.user) _user = result.user;
        }
    }, 50 * 60 * 1000);
}

function stopRefreshTimer() {
    if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
}

// ── Pulse / Heartbeat ──

function startPulse() {
    stopPulse();
    // Run first pulse immediately
    doPulse();
    _pulseTimer = setInterval(doPulse, PULSE_INTERVAL);
}

function stopPulse() {
    if (_pulseTimer) { clearInterval(_pulseTimer); _pulseTimer = null; }
}

async function doPulse() {
    if (!_token && !_userSnapshot) {
        // No token and no offline user — just check if server is online
        try {
            const resp = await fetch(_serverUrl + '/api/health', { signal: AbortSignal.timeout(PULSE_TIMEOUT) });
            if (resp.ok) {
                const data = await resp.json();
                const wasOffline = _connectionState.offlineMode;
                updateConnectionState({
                    ..._connectionState,
                    connected: false, serverOnline: true, authenticated: false,
                    offlineMode: false,
                    lastPulse: new Date().toISOString(), failCount: 0,
                    serverVersion: data.version, serverUptime: data.uptime,
                    queuedActions: _offlineQueue.filter(a => !a.synced).length,
                });
                if (wasOffline) await exitOfflineMode();
            } else {
                pulseFailure();
            }
        } catch {
            pulseFailure();
        }
        return;
    }

    // Has token (or offline snapshot) — do authenticated pulse
    if (!_token && _userSnapshot) {
        // We're in offline mode with a cached user — try health check to see if server is back
        try {
            const resp = await fetch(_serverUrl + '/api/health', { signal: AbortSignal.timeout(PULSE_TIMEOUT) });
            if (resp.ok) {
                // Server is back — exit offline mode (will revalidate token)
                await exitOfflineMode();
            } else {
                pulseFailure();
            }
        } catch {
            pulseFailure();
        }
        return;
    }

    try {
        const resp = await fetch(_serverUrl + '/api/auth/pulse', {
            headers: {
                'Authorization': `Bearer ${_token}`,
                'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(PULSE_TIMEOUT),
        });

        if (resp.ok) {
            const data = await resp.json();
            const wasOffline = _connectionState.offlineMode;

            updateConnectionState({
                ..._connectionState,
                connected: true, serverOnline: true, authenticated: data.authenticated === true,
                offlineMode: false,
                lastPulse: data.timestamp || new Date().toISOString(), failCount: 0,
                lastConnected: new Date().toISOString(),
                serverVersion: data.server?.version, serverUptime: data.server?.uptime,
                queuedActions: _offlineQueue.filter(a => !a.synced).length,
                syncInProgress: false,
            });

            // Update user info if role changed on server
            if (data.user && _user) {
                if (data.user.role !== _user.role || data.user.username !== _user.username) {
                    _user = { ..._user, role: data.user.role, username: data.user.username };
                    notifyListeners();
                }
            }

            // If we just came back online, sync queued actions
            if (wasOffline) {
                _userSnapshot = null;
                await syncOfflineQueue();
                updateConnectionState({
                    ..._connectionState,
                    queuedActions: _offlineQueue.filter(a => !a.synced).length,
                    syncInProgress: false,
                });
            }
        } else if (resp.status === 401) {
            // Token revoked or expired
            console.warn('[AuthService] Pulse: token rejected — logging out');
            updateConnectionState({
                ..._connectionState,
                connected: false, serverOnline: true, authenticated: false,
                offlineMode: false,
                lastPulse: new Date().toISOString(), failCount: 0,
            });
            _token = null;
            _user = null;
            _userSnapshot = null;
            storeToken(null);
            stopRefreshTimer();
            notifyListeners();
        } else {
            pulseFailure();
        }
    } catch {
        pulseFailure();
    }
}

function pulseFailure() {
    const newFails = _connectionState.failCount + 1;
    const wasConnected = _connectionState.connected || _connectionState.authenticated;

    if (newFails >= PULSE_MAX_FAILURES && !_connectionState.offlineMode) {
        // Transition to offline mode
        _connectionState.failCount = newFails;
        enterOfflineMode();
        return;
    }

    updateConnectionState({
        ..._connectionState,
        failCount: newFails,
        connected: newFails < PULSE_MAX_FAILURES && wasConnected,
        serverOnline: false,
        lastPulse: new Date().toISOString(),
    });
}

function updateConnectionState(state: ConnectionState) {
    const changed = JSON.stringify(state) !== JSON.stringify(_connectionState);
    _connectionState = state;
    if (changed) {
        for (const fn of _connectionListeners) {
            try { fn(state); } catch {}
        }
    }
}

// ══════════════════════════════════════
//  PUBLIC API
// ══════════════════════════════════════

/** Get the current server URL. */
export function getServerUrl(): string {
    return _serverUrl;
}

/** Initialize auth — loads stored token, validates it, starts pulse. */
export async function init(): Promise<NexiaUser | null> {
    _token = getStoredToken();
    loadOfflineQueue();

    if (!_token) {
        startPulse();
        notifyListeners();
        return null;
    }

    // Validate stored token against server
    const result = await apiFetch('/api/auth/me');
    if (result.success && result.user) {
        _user = result.user;
        startRefreshTimer();
        startPulse();
        notifyListeners();
        return _user;
    } else {
        // Token expired or invalid — server rejected it
        _token = null;
        _user = null;
        storeToken(null);
        startPulse();
        notifyListeners();
        return null;
    }
}

/** Register a new account. */
export async function register(username: string, email: string, password: string): Promise<AuthResult> {
    const result = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password }),
    });

    if (result.success && result.token) {
        _token = result.token;
        _user = result.user;
        storeToken(_token);
        startRefreshTimer();
        notifyListeners();
    }
    return result;
}

/** Log in with email and password. */
export async function login(email: string, password: string): Promise<AuthResult> {
    const result = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    });

    if (result.success && result.token) {
        _token = result.token;
        _user = result.user;
        storeToken(_token);
        startRefreshTimer();
        startPulse();
        notifyListeners();
    }
    return result;
}

/** Log out — clears token, tells server, stops pulse. */
export async function logout() {
    // Tell server to blacklist the token
    if (_token) {
        try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch {}
    }
    _token = null;
    _user = null;
    storeToken(null);
    stopRefreshTimer();
    updateConnectionState({
        ..._connectionState,
        connected: false, serverOnline: _connectionState.serverOnline,
        authenticated: false, offlineMode: false,
        lastPulse: new Date().toISOString(), failCount: 0,
    });
    notifyListeners();
}

/** Get the currently logged-in user, or null. Returns cached snapshot in offline mode. */
export function getUser(): NexiaUser | null {
    return _user || _userSnapshot;
}

/** Check if the current user is an admin. */
export function isAdmin(): boolean {
    const u = _user || _userSnapshot;
    return u?.role === 'admin';
}

/** Check if any user is logged in (or was logged in before going offline). */
export function isLoggedIn(): boolean {
    return (_user !== null && _token !== null) || (_userSnapshot !== null && _connectionState.offlineMode);
}

/** Subscribe to auth state changes. Returns unsubscribe function. */
export function onAuthStateChange(listener: AuthStateListener): () => void {
    _listeners.push(listener);
    return () => { _listeners = _listeners.filter(l => l !== listener); };
}

/** Get the current JWT token (for custom API calls). */
export function getToken(): string | null {
    return _token;
}

/** Get current connection/pulse state. */
export function getConnectionState(): ConnectionState {
    return { ..._connectionState };
}

/** Subscribe to connection state changes. Returns unsubscribe function. */
export function onConnectionStateChange(listener: ConnectionStateListener): () => void {
    _connectionListeners.push(listener);
    return () => { _connectionListeners = _connectionListeners.filter(l => l !== listener); };
}

/** Force an immediate pulse check. */
export function forcePulse() {
    doPulse();
}

/** Check if currently in offline mode. */
export function isOffline(): boolean {
    return _connectionState.offlineMode;
}

/**
 * Queue an action to sync when back online.
 * Use this from anywhere in the IDE when the server is unreachable.
 */
export function queueOfflineAction(type: OfflineAction['type'], payload: any) {
    const action: OfflineAction = {
        id: require('crypto').randomBytes(8).toString('hex'),
        type,
        payload,
        timestamp: new Date().toISOString(),
        synced: false,
    };
    _offlineQueue.push(action);
    saveOfflineQueue();

    updateConnectionState({
        ..._connectionState,
        queuedActions: _offlineQueue.filter(a => !a.synced).length,
    });

    console.log(`[AuthService] Queued offline action: ${type} (${_offlineQueue.length} total)`);
}

/** Get the number of pending offline actions. */
export function getQueuedActionCount(): number {
    return _offlineQueue.filter(a => !a.synced).length;
}

/** Clear the offline queue (e.g. user chose to discard). */
export function clearOfflineQueue() {
    _offlineQueue = [];
    saveOfflineQueue();
    updateConnectionState({ ..._connectionState, queuedActions: 0 });
}

// ── Admin: User Management ──

export async function getUsers(): Promise<{ success: boolean; users?: NexiaUser[]; error?: string }> {
    return apiFetch('/api/admin/users');
}

export async function promoteUser(userId: string, role: 'admin' | 'user'): Promise<AuthResult> {
    return apiFetch('/api/admin/promote', {
        method: 'POST',
        body: JSON.stringify({ userId, role }),
    });
}

export async function demoteUser(userId: string): Promise<AuthResult> {
    return apiFetch('/api/admin/demote', {
        method: 'POST',
        body: JSON.stringify({ userId }),
    });
}

export async function deleteUser(userId: string): Promise<{ success: boolean; error?: string }> {
    return apiFetch('/api/admin/users/' + userId, { method: 'DELETE' });
}

// ── Cloud Lessons ──

export async function getCloudLessons(): Promise<{ success: boolean; lessons?: LessonMeta[]; error?: string }> {
    return apiFetch('/api/lessons');
}

export async function getCloudLesson(id: string): Promise<{ success: boolean; lesson?: any; error?: string }> {
    return apiFetch('/api/lessons/' + id);
}

export async function publishLesson(lessonData: any): Promise<{ success: boolean; lesson?: LessonMeta; error?: string }> {
    return apiFetch('/api/lessons', {
        method: 'POST',
        body: JSON.stringify(lessonData),
    });
}

export async function updateCloudLesson(id: string, lessonData: any): Promise<{ success: boolean; lesson?: LessonMeta; error?: string }> {
    return apiFetch('/api/lessons/' + id, {
        method: 'PUT',
        body: JSON.stringify(lessonData),
    });
}

export async function deleteCloudLesson(id: string): Promise<{ success: boolean; error?: string }> {
    return apiFetch('/api/lessons/' + id, { method: 'DELETE' });
}

// ── Server Health ──

export async function checkServerHealth(): Promise<{ online: boolean; version?: string }> {
    try {
        const resp = await fetch(_serverUrl + '/api/health', { signal: AbortSignal.timeout(5000) });
        if (resp.ok) {
            const data = await resp.json();
            return { online: true, version: data.version };
        }
    } catch {}
    return { online: false };
}

// ── Cloud Settings Sync ──

export interface CloudSettings {
    // IDE preferences
    fontSize?: number;
    accentColor?: string;
    bgDark?: string;
    bgMain?: string;
    bgPanel?: string;
    bgSidebar?: string;
    editorBg?: string;
    textColor?: string;
    textDim?: string;
    fancyEffects?: boolean;
    layout?: string;
    cornerRadius?: string;
    compactMode?: boolean;
    colorMode?: string;

    // AI settings
    aiProvider?: string;
    aiApiKey?: string;
    aiEndpoint?: string;
    aiModel?: string;
    aiSystemPrompt?: string;
    aiAutoErrors?: boolean;
    aiInlineSuggest?: boolean;
    aiFileContext?: boolean;

    // Discord auth
    discord?: {
        id: string;
        username: string;
        discriminator: string;
        avatar: string | null;
        avatarUrl: string | null;
        accessToken: string;
    } | null;

    // GitHub auth
    github?: {
        token: string;
        username: string;
        avatarUrl: string;
        name: string;
    } | null;
}

/**
 * Load settings from the cloud (server).
 * Returns null if not logged in or if the request fails.
 */
export async function loadCloudSettings(): Promise<{ settings: CloudSettings; updatedAt: string | null } | null> {
    if (!_token) return null;
    const result = await apiFetch('/api/user/settings');
    if (result.success) {
        return { settings: result.settings || {}, updatedAt: result.updatedAt || null };
    }
    return null;
}

/**
 * Save settings to the cloud (server).
 * Returns true on success.
 */
export async function saveCloudSettings(settings: CloudSettings): Promise<boolean> {
    if (!_token) return false;
    const result = await apiFetch('/api/user/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings }),
    });
    return result.success === true;
}