/**
 * emulatorPanel.ts — Nexia 360 Emulator Panel
 *
 * Extracted from app.ts. Handles the emulator sidebar panel:
 * launch, pause/resume/step, breakpoints, GDB output, and debug state.
 */

let _$: (id: string) => HTMLElement;
let _appendOutput: (text: string) => void;
let _escapeHtml: (s: string) => string;
let _ipcRenderer: any;
let _IPC: any;
let _nodeOs: any;

export interface EmulatorDeps {
    $: (id: string) => HTMLElement;
    appendOutput: (text: string) => void;
    escapeHtml: (s: string) => string;
    ipcRenderer: any;
    IPC: any;
    nodeOs: any;
}

export function initEmulator(deps: EmulatorDeps) {
    _$ = deps.$;
    _appendOutput = deps.appendOutput;
    _escapeHtml = deps.escapeHtml;
    _ipcRenderer = deps.ipcRenderer;
    _IPC = deps.IPC;
    _nodeOs = deps.nodeOs;
}

let emuState: 'stopped' | 'starting' | 'running' | 'paused' = 'stopped';

export function initEmulatorPanel() {
    const panel = _$('emulator-panel');
    if (!panel) return;

    // Check if running on Windows 7 or older (kernel version < 10.0)
    // Windows 7 = 6.1, Windows 8 = 6.2, Windows 8.1 = 6.3, Windows 10+ = 10.0
    const osRelease = _nodeOs.release(); // e.g. "6.1.7601" or "10.0.19041"
    const majorVersion = parseInt(osRelease.split('.')[0], 10);
    if (majorVersion < 10) {
        const minorVersion = osRelease.split('.')[1] as string;
        const winName = majorVersion === 6
            ? ({ '1': 'Windows 7', '2': 'Windows 8', '3': 'Windows 8.1' } as Record<string, string>)[minorVersion] || 'Windows'
            : 'Windows';
        panel.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:24px 18px;text-align:center;">
                <div style="font-size:36px;margin-bottom:16px;color:var(--text-muted);">⚠</div>
                <div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:8px;">Emulation Not Supported</div>
                <div style="font-size:12px;color:var(--text-dim);line-height:1.6;max-width:280px;">
                    Nexia 360 Emulation is not yet supported on ${_escapeHtml(winName)}.<br><br>
                    The emulator requires Windows 10 or later due to graphics API and driver dependencies.
                </div>
                <div style="margin-top:20px;padding:10px 16px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;font-size:11px;color:var(--text-dim);line-height:1.5;max-width:280px;">
                    Detected OS: ${_escapeHtml(winName)} (NT ${_escapeHtml(osRelease)})
                </div>
            </div>
        `;
        return;
    }

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
    _ipcRenderer.invoke(_IPC.EMU_GET_CONFIG).then((cfg: any) => {
        if (cfg.path) (_$('emu-path') as HTMLInputElement).value = cfg.path;
    });

    // Browse for Nexia360.exe
    _$('emu-browse-btn')?.addEventListener('click', async () => {
        const file = await _ipcRenderer.invoke(_IPC.FILE_SELECT_FILE, [{ name: 'Executable', extensions: ['exe'] }]);
        if (file) (_$('emu-path') as HTMLInputElement).value = file;
    });

    // Save path
    _$('emu-save-path')?.addEventListener('click', async () => {
        const p = (_$('emu-path') as HTMLInputElement).value.trim();
        if (!p) { _appendOutput('Enter path to Nexia360.exe\n'); return; }
        const result = await _ipcRenderer.invoke(_IPC.EMU_CONFIGURE, p);
        if (result.configured) {
            _appendOutput('[Nexia 360] Emulator path saved.\n');
        } else {
            _appendOutput('[Nexia 360] File not found at: ' + p + '\n');
        }
    });

    // Browse for XEX
    _$('emu-xex-browse')?.addEventListener('click', async () => {
        const file = await _ipcRenderer.invoke(_IPC.FILE_SELECT_FILE, [{ name: 'Xbox Executable', extensions: ['xex'] }]);
        if (file) (_$('emu-xex-path') as HTMLInputElement).value = file;
    });

    // Launch
    _$('emu-launch-btn')?.addEventListener('click', async () => {
        const xex = (_$('emu-xex-path') as HTMLInputElement).value.trim();
        if (!xex) { _appendOutput('Select a XEX file to run.\n'); return; }
        const btn = _$('emu-launch-btn') as HTMLButtonElement;
        btn.textContent = '⏳ Starting...';
        btn.disabled = true;
        const result = await _ipcRenderer.invoke(_IPC.EMU_LAUNCH, xex);
        if (result.success) {
            // Directly update UI — don't wait for events
            emuState = 'running';
            updateEmulatorUI();
        } else {
            _appendOutput('[Nexia 360] ' + (result.error || 'Launch failed') + '\n');
            btn.textContent = '▶ Launch in Emulator';
            btn.disabled = false;
        }
    });

    // Controls — fetch debug data directly from the return values
    _$('emu-pause-btn')?.addEventListener('click', async () => {
        const result = await _ipcRenderer.invoke(_IPC.EMU_PAUSE);
        if (result && result.paused) {
            emuState = 'paused';
            updateEmulatorUI();
            if (result.registers) updateRegisters(result.registers);
            if (result.backtrace) renderBacktrace(result.backtrace);
        }
    });
    _$('emu-resume-btn')?.addEventListener('click', async () => {
        await _ipcRenderer.invoke(_IPC.EMU_RESUME);
        emuState = 'running';
        updateEmulatorUI();
    });
    _$('emu-step-btn')?.addEventListener('click', async () => {
        const result = await _ipcRenderer.invoke(_IPC.EMU_STEP);
        if (result) {
            emuState = 'paused';
            updateEmulatorUI();
            if (result.registers) updateRegisters(result.registers);
            if (result.backtrace) renderBacktrace(result.backtrace);
        }
    });
    _$('emu-step-over-btn')?.addEventListener('click', async () => {
        const result = await _ipcRenderer.invoke(_IPC.EMU_STEP_OVER);
        if (result) {
            emuState = 'paused';
            updateEmulatorUI();
            if (result.registers) updateRegisters(result.registers);
            if (result.backtrace) renderBacktrace(result.backtrace);
        }
    });
    _$('emu-stop-btn')?.addEventListener('click', async () => {
        await _ipcRenderer.invoke(_IPC.EMU_STOP);
        emuState = 'stopped';
        updateEmulatorUI();
    });

    // Breakpoints
    _$('emu-bp-add')?.addEventListener('click', () => {
        const addr = (_$('emu-bp-addr') as HTMLInputElement).value.trim();
        if (!addr) return;
        _ipcRenderer.invoke(_IPC.EMU_BREAKPOINT_SET, addr);
        (_$('emu-bp-addr') as HTMLInputElement).value = '';
        setTimeout(() => refreshBreakpointList(), 500);
    });
    (_$('emu-bp-addr') as HTMLInputElement)?.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') _$('emu-bp-add')?.click();
    });

    // Call Stack
    _$('emu-stack-refresh')?.addEventListener('click', () => fetchDebugState());

    // Registers
    _$('emu-reg-refresh')?.addEventListener('click', () => _ipcRenderer.invoke(_IPC.EMU_REGISTERS));

    // Memory read
    _$('emu-mem-read')?.addEventListener('click', () => {
        const addr = (_$('emu-mem-addr') as HTMLInputElement).value.trim();
        const size = parseInt((_$('emu-mem-size') as HTMLInputElement).value) || 256;
        if (!addr) return;
        _ipcRenderer.invoke(_IPC.EMU_MEMORY_READ, addr, size);
    });

    // Listen for emulator events from main process
    _ipcRenderer.on(_IPC.EMU_EVENT, (_e: any, event: any) => {
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
            _appendOutput(`[GDB] ● Breakpoint hit at ${event.addr}${event.func ? ' (' + event.func + ')' : ''}\n`);
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
            if (event.text) _appendOutput(event.text);
            break;
    }
}

/**
 * Fetch registers and backtrace from GDB — called when paused or after step.
 */
async function fetchDebugState() {
    try {
        // Fetch registers (result comes back via EMU_EVENT)
        const regs = await _ipcRenderer.invoke(_IPC.EMU_REGISTERS);
        if (regs) updateRegisters(regs);

        // Fetch backtrace
        const bt = await _ipcRenderer.invoke(_IPC.EMU_BACKTRACE);
        if (bt && bt.length > 0) renderBacktrace(bt);

        // Fetch breakpoint list
        const bps = await _ipcRenderer.invoke(_IPC.EMU_BREAKPOINT_LIST);
        if (bps) renderBreakpoints(bps);
    } catch (err: any) {
        // GDB might not be attached
    }
}

function updateEmulatorUI() {
    const dot = _$('emu-dot') as HTMLElement;
    const text = _$('emu-status-text') as HTMLElement;
    const controls = _$('emu-controls') as HTMLElement;
    const launchBtn = _$('emu-launch-btn') as HTMLButtonElement;
    const bpSection = _$('emu-bp-section') as HTMLElement;
    const stackSection = _$('emu-stack-section') as HTMLElement;
    const regSection = _$('emu-reg-section') as HTMLElement;
    const memSection = _$('emu-mem-section') as HTMLElement;

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
    const pauseBtn = _$('emu-pause-btn') as HTMLButtonElement;
    const resumeBtn = _$('emu-resume-btn') as HTMLButtonElement;
    if (pauseBtn) pauseBtn.disabled = emuState !== 'running';
    if (resumeBtn) resumeBtn.disabled = emuState !== 'paused';
}

function updateRegisters(regs: any) {
    const grid = _$('emu-reg-grid');
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
            html += `<span class="emu-reg-name">${_escapeHtml(reg.name)}</span><span class="emu-reg-val">${_escapeHtml(reg.value)}</span>`;
        }
    }

    grid.innerHTML = html;
}

function renderMemoryDump(addr: string, hexData: string) {
    const dump = _$('emu-mem-dump');
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
    const list = await _ipcRenderer.invoke(_IPC.EMU_BREAKPOINT_LIST);
    if (list) renderBreakpoints(list);
}

function renderBreakpoints(bps: any[]) {
    const listEl = _$('emu-bp-list');
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
            _ipcRenderer.invoke(_IPC.EMU_BREAKPOINT_REMOVE, bp.id);
            setTimeout(() => refreshBreakpointList(), 500);
        });
        listEl.appendChild(row);
    }
}

function renderBacktrace(frames: string[]) {
    const listEl = _$('emu-stack-list');
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
