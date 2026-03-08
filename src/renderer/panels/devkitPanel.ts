/**
 * devkitPanel.ts — Xbox 360 Development Kit Panel
 *
 * Extracted from app.ts. Handles the devkit sidebar panel:
 * console connection, file browsing, deployment, screenshots, and system info.
 */

// ── Dependencies (injected via initDevkit) ──
let _$: (id: string) => HTMLElement;
let _appendOutput: (text: string) => void;
let _escapeHtml: (s: string) => string;
let _ipcRenderer: any;
let _IPC: any;
let _nodeFs: any;
let _nodePath: any;
let _nodeOs: any;

export interface DevkitDeps {
    $: (id: string) => HTMLElement;
    appendOutput: (text: string) => void;
    escapeHtml: (s: string) => string;
    ipcRenderer: any;
    IPC: any;
    nodeFs: any;
    nodePath: any;
    nodeOs: any;
}

export function initDevkit(deps: DevkitDeps) {
    _$ = deps.$;
    _appendOutput = deps.appendOutput;
    _escapeHtml = deps.escapeHtml;
    _ipcRenderer = deps.ipcRenderer;
    _IPC = deps.IPC;
    _nodeFs = deps.nodeFs;
    _nodePath = deps.nodePath;
    _nodeOs = deps.nodeOs;
}

// ── Exported state ──
export let devkitConnected = false;
export let devkitCurrentIp = '';

export function isDevkitConnected() { return devkitConnected; }

export function initDevkitPanel() {
    _$('devkit-panel').innerHTML = `
        <div class="devkit-section">
            <h4>CONSOLE</h4>
            <div id="devkit-hint" style="margin-bottom:10px;padding:10px 12px;background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.2);border-radius:6px;">
                <div style="font-size:12px;font-weight:600;color:#38bdf8;margin-bottom:4px;">📡 No Dev Kit Connected</div>
                <div style="font-size:11px;color:var(--text-dim);line-height:1.5;">Enter the IP address of your Xbox 360 development kit below to deploy builds, browse files, capture screenshots, and debug remotely.</div>
            </div>
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
        </div>
        <div class="devkit-section hidden" id="devkit-deploy-section">
            <h4>DEPLOY FILES</h4>
            <div class="devkit-drop-zone" id="devkit-drop-zone">
                <div class="devkit-drop-icon">⬆</div>
                <div class="devkit-drop-text">Drop files here or click to select</div>
                <div class="devkit-drop-hint">Files will be copied to the console</div>
                <input type="file" id="devkit-drop-input" style="display:none" multiple>
            </div>
            <div class="devkit-deploy-dest">
                <span class="devkit-deploy-label">Destination:</span>
                <input type="text" id="devkit-deploy-path" class="devkit-deploy-path-input" placeholder="/Hdd1/Games/MyGame/" value="/Hdd1/">
            </div>
            <div id="devkit-deploy-queue" class="devkit-deploy-queue hidden"></div>
            <div id="devkit-deploy-progress" class="devkit-deploy-progress hidden">
                <div class="devkit-progress-bar-track">
                    <div class="devkit-progress-bar-fill" id="devkit-progress-fill"></div>
                </div>
                <div class="devkit-progress-info">
                    <span id="devkit-progress-text">Deploying...</span>
                    <span id="devkit-progress-count">0 / 0</span>
                </div>
                <div id="devkit-progress-file" class="devkit-progress-file"></div>
            </div>
        </div>`;

    // Check if already connected
    _ipcRenderer.invoke(_IPC.DEVKIT_STATUS).then((status: any) => {
        if (status.connected) {
            devkitConnected = true;
            devkitCurrentIp = status.ip;
            (_$('devkit-ip') as HTMLInputElement).value = status.ip;
            updateDevkitUI(true, status.ip);
        }
    });

    // Connect / Disconnect
    _$('devkit-connect-btn')!.addEventListener('click', async () => {
        const btn = _$('devkit-connect-btn') as HTMLButtonElement;
        const ip = (_$('devkit-ip') as HTMLInputElement).value.trim();

        if (devkitConnected) {
            // Disconnect
            await _ipcRenderer.invoke(_IPC.DEVKIT_DISCONNECT);
            devkitConnected = false;
            devkitCurrentIp = '';
            updateDevkitUI(false);
            _appendOutput('Disconnected from console.\n');
            return;
        }

        if (!ip) { _appendOutput('Enter console IP address.\n'); return; }

        btn.textContent = 'Connecting...';
        btn.disabled = true;
        (_$('devkit-status-text') as HTMLElement).textContent = `Connecting to ${ip}...`;

        try {
            const result = await _ipcRenderer.invoke(_IPC.DEVKIT_CONNECT, ip);
            if (result.connected) {
                devkitConnected = true;
                devkitCurrentIp = ip;
                updateDevkitUI(true, ip, result.type);
            } else {
                updateDevkitUI(false);
                _appendOutput(`Connection failed: ${result.type || 'Unknown error'}\n`);
            }
        } catch (e: any) {
            updateDevkitUI(false);
            _appendOutput(`Connection error: ${e.message}\n`);
        }

        btn.disabled = false;
    });

    // Reboot
    _$('devkit-reboot-btn')?.addEventListener('click', async () => {
        if (!devkitConnected) { _appendOutput('Not connected.\n'); return; }
        try {
            _appendOutput('Sending reboot command...\n');
            await _ipcRenderer.invoke(_IPC.DEVKIT_REBOOT, 'cold', devkitCurrentIp);
            devkitConnected = false;
            updateDevkitUI(false);
            _appendOutput('Reboot sent. Console will reconnect when ready.\n');
        } catch (e: any) { _appendOutput(`Reboot failed: ${e.message}\n`); }
    });

    // Screenshot
    _$('devkit-screenshot-btn')?.addEventListener('click', async () => {
        if (!devkitConnected) { _appendOutput('Not connected.\n'); return; }
        const p = _nodePath.join(_nodeOs.homedir(), 'Desktop', `screenshot_${Date.now()}.bmp`);
        try {
            _appendOutput('Capturing screenshot...\n');
            await _ipcRenderer.invoke(_IPC.DEVKIT_SCREENSHOT, p, devkitCurrentIp);
            _appendOutput(`Screenshot saved: ${p}\n`);
        } catch (e: any) { _appendOutput(`Screenshot failed: ${e.message}\n`); }
    });

    // System Info
    _$('devkit-sysinfo-btn')?.addEventListener('click', async () => {
        if (!devkitConnected) { _appendOutput('Not connected.\n'); return; }
        try {
            _appendOutput('Fetching system info...\n');
            const info = await _ipcRenderer.invoke(_IPC.DEVKIT_SYSINFO, devkitCurrentIp);
            const infoEl = _$('devkit-info');
            if (infoEl && info) {
                let html = '<div class="devkit-info-grid">';
                for (const [key, val] of Object.entries(info)) {
                    html += `<span class="devkit-info-key">${_escapeHtml(key)}</span><span class="devkit-info-val">${_escapeHtml(String(val))}</span>`;
                }
                html += '</div>';
                infoEl.innerHTML = html;
                infoEl.classList.remove('hidden');
                _appendOutput('System info loaded.\n');
            }
        } catch (e: any) { _appendOutput(`System info failed: ${e.message}\n`); }
    });

    // Browse Files
    _$('devkit-files-btn')?.addEventListener('click', () => {
        if (!devkitConnected) { _appendOutput('Not connected.\n'); return; }
        _$('devkit-file-browser')?.classList.remove('hidden');
        showDevkitVolumes();
    });

    _$('devkit-path-go')?.addEventListener('click', () => {
        const p = (_$('devkit-path') as HTMLInputElement).value.trim();
        if (p) browseDevkitPath(p);
    });

    _$('devkit-path-up')?.addEventListener('click', () => {
        const current = (_$('devkit-path') as HTMLInputElement).value.trim();
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

    (_$('devkit-path') as HTMLInputElement)?.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
            const p = (_$('devkit-path') as HTMLInputElement).value.trim();
            if (p) browseDevkitPath(p);
        }
    });

    // ── Deploy Drop Zone ──

    const dropZone = _$('devkit-drop-zone');
    const dropInput = _$('devkit-drop-input') as HTMLInputElement;
    let deployFiles: File[] = [];

    if (dropZone && dropInput) {
        dropZone.addEventListener('click', () => dropInput.click());

        dropZone.addEventListener('dragover', (e: Event) => {
            e.preventDefault();
            (e as DragEvent).dataTransfer!.dropEffect = 'copy';
            dropZone.classList.add('devkit-drop-active');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('devkit-drop-active'));
        dropZone.addEventListener('drop', (e: Event) => {
            e.preventDefault();
            dropZone.classList.remove('devkit-drop-active');
            const de = e as DragEvent;
            if (de.dataTransfer?.files) {
                deployFiles = Array.from(de.dataTransfer.files);
                showDeployQueue(deployFiles);
            }
        });

        dropInput.addEventListener('change', () => {
            deployFiles = Array.from(dropInput.files || []);
            showDeployQueue(deployFiles);
            dropInput.value = '';
        });
    }

    function showDeployQueue(files: File[]) {
        const queue = _$('devkit-deploy-queue');
        if (!queue || files.length === 0) return;
        queue.classList.remove('hidden');

        let html = `<div class="devkit-queue-header">${files.length} file${files.length > 1 ? 's' : ''} selected</div>`;
        for (const f of files) {
            const size = f.size < 1048576 ? `${(f.size / 1024).toFixed(1)} KB` : `${(f.size / 1048576).toFixed(1)} MB`;
            html += `<div class="devkit-queue-item"><span class="devkit-queue-name">${_escapeHtml(f.name)}</span><span class="devkit-queue-size">${size}</span></div>`;
        }
        html += `<button class="devkit-btn devkit-btn-deploy" id="devkit-deploy-go">⬆ Deploy ${files.length} file${files.length > 1 ? 's' : ''}</button>`;
        queue.innerHTML = html;

        _$('devkit-deploy-go')?.addEventListener('click', () => startDeploy(files));
    }

    async function startDeploy(files: File[]) {
        if (!devkitConnected || files.length === 0) return;

        const destBase = (_$('devkit-deploy-path') as HTMLInputElement)?.value.trim() || '/Hdd1/';
        const progressEl = _$('devkit-deploy-progress');
        const fillEl = _$('devkit-progress-fill');
        const textEl = _$('devkit-progress-text');
        const countEl = _$('devkit-progress-count');
        const fileEl = _$('devkit-progress-file');
        const queueEl = _$('devkit-deploy-queue');

        if (progressEl) progressEl.classList.remove('hidden');
        if (queueEl) queueEl.classList.add('hidden');

        const total = files.length;
        let completed = 0;
        let failed = 0;

        for (const file of files) {
            const fileName = file.name;
            const remotePath = destBase.endsWith('/') ? destBase + fileName : destBase + '/' + fileName;

            if (textEl) textEl.textContent = 'Deploying...';
            if (countEl) countEl.textContent = `${completed} / ${total}`;
            if (fileEl) fileEl.textContent = fileName;

            const percent = Math.round((completed / total) * 100);
            if (fillEl) (fillEl as HTMLElement).style.width = percent + '%';

            try {
                // Write the file to a temp location first (Electron can't send File objects over IPC)
                const tempDir = _nodeOs.tmpdir();
                const tempPath = _nodePath.join(tempDir, 'nexia-deploy-' + fileName);
                const buffer = Buffer.from(await file.arrayBuffer());
                _nodeFs.writeFileSync(tempPath, buffer);

                // Deploy via IPC
                await _ipcRenderer.invoke(_IPC.DEVKIT_COPY_TO, tempPath, remotePath, devkitCurrentIp);

                // Clean up temp
                try { _nodeFs.unlinkSync(tempPath); } catch {}

                completed++;
                _appendOutput(`✅ Deployed: ${fileName} → ${remotePath}\n`);
            } catch (err: any) {
                completed++;
                failed++;
                _appendOutput(`❌ Failed to deploy ${fileName}: ${err.message}\n`);
            }

            const newPercent = Math.round((completed / total) * 100);
            if (fillEl) (fillEl as HTMLElement).style.width = newPercent + '%';
            if (countEl) countEl.textContent = `${completed} / ${total}`;
        }

        // Complete
        if (fillEl) (fillEl as HTMLElement).style.width = '100%';
        if (textEl) textEl.textContent = failed > 0 ? `Done — ${failed} failed` : 'Deploy complete!';
        if (fileEl) fileEl.textContent = '';
        if (fillEl) fillEl.className = failed > 0 ? 'devkit-progress-bar-fill devkit-progress-warn' : 'devkit-progress-bar-fill devkit-progress-done';

        // Auto-hide after a few seconds
        setTimeout(() => {
            if (progressEl) progressEl.classList.add('hidden');
            if (fillEl) { fillEl.className = 'devkit-progress-bar-fill'; (fillEl as HTMLElement).style.width = '0%'; }
            deployFiles = [];
        }, 4000);
    }
}

function updateDevkitUI(connected: boolean, ip?: string, consoleName?: string) {
    const dot = document.querySelector('.devkit-status-dot') as HTMLElement;
    const text = _$('devkit-status-text') as HTMLElement;
    const btn = _$('devkit-connect-btn') as HTMLButtonElement;
    const actions = _$('devkit-actions') as HTMLElement;

    if (connected) {
        dot.className = 'devkit-status-dot connected';
        text.textContent = consoleName ? `${consoleName} (${ip})` : `Connected to ${ip}`;
        btn.textContent = 'Disconnect';
        btn.classList.add('disconnect');
        actions.style.display = '';
        _$('devkit-deploy-section')?.classList.remove('hidden');
        // Hide the hint banner
        const hint = document.getElementById('devkit-hint');
        if (hint) hint.style.display = 'none';
    } else {
        dot.className = 'devkit-status-dot disconnected';
        text.textContent = 'Not connected';
        btn.textContent = 'Connect';
        btn.classList.remove('disconnect');
        actions.style.display = 'none';
        _$('devkit-info')?.classList.add('hidden');
        _$('devkit-file-browser')?.classList.add('hidden');
        _$('devkit-deploy-section')?.classList.add('hidden');
        // Show the hint banner
        const hint = document.getElementById('devkit-hint');
        if (hint) hint.style.display = '';
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
    const listEl = _$('devkit-file-list') as HTMLElement;
    const pathInput = _$('devkit-path') as HTMLInputElement;
    if (!listEl) return;

    pathInput.value = '';
    listEl.innerHTML = '<div class="community-feed-loading">Querying volumes...</div>';

    let volumes: string[];
    try {
        volumes = await _ipcRenderer.invoke(_IPC.DEVKIT_VOLUMES, devkitCurrentIp);
    } catch {
        // Fallback to common volumes
        volumes = ['HDD:', 'GAME:', 'DVD:', 'USB0:', 'DASHUSER:'];
    }

    listEl.innerHTML = '';

    for (const vol of volumes) {
        const info = XBOX_VOLUME_INFO[vol] || { label: 'Volume', icon: '💾' };
        const entry = document.createElement('div');
        entry.className = 'devkit-file-entry dir';
        entry.innerHTML = `<span class="devkit-file-icon">${info.icon}</span><span class="devkit-file-name">${_escapeHtml(vol)}</span><span class="devkit-file-size">${_escapeHtml(info.label)}</span>`;
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
    const listEl = _$('devkit-file-list') as HTMLElement;
    const pathInput = _$('devkit-path') as HTMLInputElement;
    if (!listEl) return;

    pathInput.value = remotePath;
    listEl.innerHTML = '<div class="community-feed-loading">Loading...</div>';

    try {
        const output = await _ipcRenderer.invoke(_IPC.DEVKIT_FILE_MANAGER, remotePath, devkitCurrentIp);
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
                entry.innerHTML = `<span class="devkit-file-icon">📁</span><span class="devkit-file-name">${_escapeHtml(name)}</span>`;
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
                entry.innerHTML = `<span class="devkit-file-icon">${icon}</span><span class="devkit-file-name">${_escapeHtml(name)}</span>${isXex || isXbe ? '<span class="devkit-file-run">▶ Run</span>' : ''}<span class="devkit-file-size">${size}</span>`;

                if (isXex || isXbe) {
                    // Double-click to launch
                    entry.addEventListener('dblclick', async () => {
                        const sep = remotePath.endsWith('\\') ? '' : '\\';
                        const fullPath = remotePath + sep + name;
                        entry.classList.add('launching');
                        const runLabel = entry.querySelector('.devkit-file-run') as HTMLElement;
                        if (runLabel) runLabel.textContent = '⏳ Launching...';
                        try {
                            await _ipcRenderer.invoke(_IPC.DEVKIT_LAUNCH, fullPath, devkitCurrentIp);
                            if (runLabel) runLabel.textContent = '✓ Launched';
                            _appendOutput(`Launched: ${fullPath}\n`);
                        } catch (e: any) {
                            if (runLabel) runLabel.textContent = '▶ Run';
                            _appendOutput(`Launch failed: ${e.message}\n`);
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
                            await _ipcRenderer.invoke(_IPC.DEVKIT_LAUNCH, fullPath, devkitCurrentIp);
                            if (runLabel) runLabel.textContent = '✓ Launched';
                            _appendOutput(`Launched: ${fullPath}\n`);
                        } catch (e: any) {
                            if (runLabel) runLabel.textContent = '▶ Run';
                            _appendOutput(`Launch failed: ${(e as Error).message}\n`);
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
        listEl.innerHTML = `<div class="community-feed-placeholder"><p>Error: ${_escapeHtml(e.message)}</p></div>`;
    }
}
