/**
 * Xbox 360 Development Kit Management
 * Handles console connection, deployment, and management.
 * Communicates via XBDM (Xbox Debug Monitor) on port 730.
 */

import * as path from 'path';
import * as net from 'net';
import { spawn } from 'child_process';
import { Toolchain } from './toolchain';
import { DevkitConfig, DevkitStatus } from '../shared/types';

const XBDM_PORT = 730;
const XBDM_TIMEOUT = 5000;

export class DevkitManager {
    private toolchain: Toolchain;
    private consoles: DevkitConfig[] = [];
    private onOutput: ((data: string) => void) | null = null;
    private connectedIp: string | null = null;

    constructor(toolchain: Toolchain) {
        this.toolchain = toolchain;
    }

    setOutputCallback(cb: (data: string) => void) {
        this.onOutput = cb;
    }

    private emit(data: string) {
        if (this.onOutput) this.onOutput(data);
    }

    getConsoles(): DevkitConfig[] {
        return this.consoles;
    }

    addConsole(config: DevkitConfig) {
        this.consoles = this.consoles.filter(c => c.name !== config.name);
        this.consoles.push(config);
    }

    removeConsole(name: string) {
        this.consoles = this.consoles.filter(c => c.name !== name);
    }

    getDefault(): DevkitConfig | undefined {
        return this.consoles.find(c => c.isDefault) || this.consoles[0];
    }

    isConnected(): boolean {
        return this.connectedIp !== null;
    }

    getConnectedIp(): string | null {
        return this.connectedIp;
    }

    /**
     * Test connection to an Xbox 360 via XBDM (port 730).
     * Sends a simple command and checks for a valid response.
     */
    async connect(ip: string): Promise<DevkitStatus> {
        this.emit(`\nConnecting to ${ip}:${XBDM_PORT}...\n`);

        return new Promise((resolve) => {
            const socket = new net.Socket();
            let responseData = '';
            let resolved = false;

            const finish = (status: DevkitStatus) => {
                if (resolved) return;
                resolved = true;
                socket.destroy();
                if (status.connected) {
                    this.connectedIp = ip;
                    // Register as default console
                    this.addConsole({ name: `Xbox360@${ip}`, ip, isDefault: true });
                    this.emit(`✓ Connected to ${ip}\n`);
                    if (status.type) this.emit(`  Console type: ${status.type}\n`);
                } else {
                    this.connectedIp = null;
                    this.emit(`✗ Connection failed: ${status.type || 'Unknown error'}\n`);
                }
                resolve(status);
            };

            socket.setTimeout(XBDM_TIMEOUT);

            socket.on('connect', () => {
                // XBDM sends a banner on connect, then we can send commands
                // Wait for the initial banner response
            });

            socket.on('data', (data) => {
                responseData += data.toString();

                // XBDM banner is typically "201- connected\r\n"
                if (responseData.includes('201') || responseData.includes('connected')) {
                    // Connected! Try to get console info
                    socket.write('dbgname\r\n');

                    // Check if we already have the name response
                    const lines = responseData.split('\r\n');
                    for (const line of lines) {
                        if (line.startsWith('200-')) {
                            const consoleName = line.substring(4).trim();
                            finish({
                                connected: true,
                                type: consoleName || 'Xbox 360 Development Kit',
                            });
                            return;
                        }
                    }

                    // Wait a bit more for the name response
                    setTimeout(() => {
                        if (!resolved) {
                            // Parse whatever we got
                            const nameMatch = responseData.match(/200-\s*(.+)/);
                            finish({
                                connected: true,
                                type: nameMatch ? nameMatch[1].trim() : 'Xbox 360 Development Kit',
                            });
                        }
                    }, 1500);
                }
            });

            socket.on('timeout', () => {
                finish({ connected: false, type: `Timeout - no response from ${ip}:${XBDM_PORT}` });
            });

            socket.on('error', (err: any) => {
                let reason = err.message;
                if (err.code === 'ECONNREFUSED') reason = `Connection refused - XBDM not running on ${ip}`;
                else if (err.code === 'EHOSTUNREACH') reason = `Host unreachable - check network cable and IP`;
                else if (err.code === 'ENETUNREACH') reason = `Network unreachable - check ethernet connection`;
                else if (err.code === 'ETIMEDOUT') reason = `Timed out - console may be off or wrong IP`;
                finish({ connected: false, type: reason });
            });

            socket.connect(XBDM_PORT, ip);
        });
    }

    /**
     * Disconnect from the current console.
     */
    disconnect() {
        const ip = this.connectedIp;
        this.connectedIp = null;
        if (ip) this.emit(`Disconnected from ${ip}\n`);
    }

    /**
     * List available volumes/drives on the console via XBDM drivelist command.
     */
    async listVolumes(ip?: string): Promise<string[]> {
        const targetIp = ip || this.connectedIp || this.getDefault()?.ip;
        if (!targetIp) throw new Error('No console connected');

        return new Promise((resolve, reject) => {
            const socket = new net.Socket();
            let responseData = '';
            let sentCommand = false;

            socket.setTimeout(XBDM_TIMEOUT);

            socket.on('data', (data) => {
                responseData += data.toString();

                if (!sentCommand && responseData.includes('201')) {
                    sentCommand = true;
                    socket.write('drivelist\r\n');

                    setTimeout(() => {
                        socket.destroy();
                        // Parse drivelist response
                        // Format: 202- multiline follows\r\ndrivename="HDD"\r\ndrivename="GAME"\r\n...\r\n.\r\n
                        const drives: string[] = [];
                        const lines = responseData.split('\r\n');
                        for (const line of lines) {
                            const match = line.match(/drivename="([^"]+)"/i);
                            if (match) drives.push(match[1] + ':');
                        }
                        resolve(drives.length > 0 ? drives : ['HDD:', 'GAME:', 'DVD:']);
                    }, 1500);
                }
            });

            socket.on('timeout', () => { socket.destroy(); reject(new Error('Timeout')); });
            socket.on('error', (err) => { socket.destroy(); reject(err); });
            socket.connect(XBDM_PORT, targetIp);
        });
    }

    /**
     * Get console system info via XBDM.
     */
    async getSystemInfo(ip?: string): Promise<Record<string, string>> {
        const targetIp = ip || this.connectedIp || this.getDefault()?.ip;
        if (!targetIp) throw new Error('No console connected');

        return new Promise((resolve, reject) => {
            const socket = new net.Socket();
            let responseData = '';
            let sentCommand = false;
            const info: Record<string, string> = {};

            socket.setTimeout(XBDM_TIMEOUT);

            socket.on('data', (data) => {
                responseData += data.toString();

                if (!sentCommand && responseData.includes('201')) {
                    sentCommand = true;
                    // Connected, request system info
                    socket.write('systeminfo\r\n');

                    setTimeout(() => {
                        // Parse multiline response
                        const lines = responseData.split('\r\n');
                        for (const line of lines) {
                            if (line.includes('=')) {
                                const [key, ...val] = line.replace(/^202\| /, '').split('=');
                                if (key && val.length) info[key.trim()] = val.join('=').trim();
                            }
                        }
                        socket.destroy();
                        resolve(info);
                    }, 2000);
                }
            });

            socket.on('timeout', () => { socket.destroy(); reject(new Error('Timeout')); });
            socket.on('error', (err) => { socket.destroy(); reject(err); });
            socket.connect(XBDM_PORT, targetIp);
        });
    }

    /**
     * Run a devkit tool command.
     */
    private runDevkitCommand(tool: string, args: string[], ip?: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const toolPath = this.toolchain.getToolPath(tool);
            if (!toolPath) {
                reject(new Error(`${tool} not found in SDK`));
                return;
            }

            const targetIp = ip || this.getDefault()?.ip;
            if (!targetIp) {
                reject(new Error('No devkit configured'));
                return;
            }

            const fullArgs = [`/X:${targetIp}`, ...args];
            const env = this.toolchain.getToolEnvironment();

            this.emit(`> ${tool} ${fullArgs.join(' ')}\n`);

            const proc = spawn(toolPath.includes(' ') ? `"${toolPath}"` : toolPath, fullArgs, { env, shell: true, windowsHide: true });
            let output = '';

            proc.stdout.on('data', (data) => {
                const text = data.toString();
                output += text;
                this.emit(text);
            });

            proc.stderr.on('data', (data) => {
                const text = data.toString();
                output += text;
                this.emit(text);
            });

            proc.on('close', (code) => {
                if (code === 0) resolve(output);
                else reject(new Error(`${tool} failed with code ${code}\n${output}`));
            });

            proc.on('error', (err) => reject(err));
        });
    }

    /**
     * Launch a title (XEX) already on the console via XBDM magicboot command.
     */
    async launchTitle(remotePath: string, ip?: string): Promise<void> {
        const targetIp = ip || this.connectedIp || this.getDefault()?.ip;
        if (!targetIp) throw new Error('No console connected');

        // Normalize path separators
        const cleanPath = remotePath.replace(/\//g, '\\');
        this.emit(`\nLaunching: ${cleanPath}\n`);

        return new Promise((resolve, reject) => {
            const socket = new net.Socket();
            let responseData = '';
            let sentCommand = false;

            socket.setTimeout(XBDM_TIMEOUT);

            socket.on('data', (data) => {
                responseData += data.toString();

                if (!sentCommand && responseData.includes('201')) {
                    sentCommand = true;
                    // magicboot launches a title from its path on the console
                    socket.write(`magicboot title="${cleanPath}" directory="${cleanPath.substring(0, cleanPath.lastIndexOf('\\'))}\\"\r\n`);

                    setTimeout(() => {
                        socket.destroy();
                        if (responseData.includes('200') || responseData.includes('OK')) {
                            this.emit(`✓ Title launched: ${cleanPath}\n`);
                            resolve();
                        } else if (responseData.includes('402') || responseData.includes('not found')) {
                            reject(new Error(`File not found: ${cleanPath}`));
                        } else {
                            // magicboot usually causes a disconnect as the console reboots into the title
                            this.emit(`✓ Launch command sent: ${cleanPath}\n`);
                            resolve();
                        }
                    }, 2000);
                }
            });

            socket.on('timeout', () => {
                socket.destroy();
                // Timeout is expected — console reboots into the title
                this.emit(`✓ Launch command sent (console rebooting into title)\n`);
                resolve();
            });

            socket.on('error', (err: any) => {
                // Connection reset is expected when magicboot triggers a reboot
                if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
                    this.emit(`✓ Title launching (console rebooting)\n`);
                    resolve();
                } else {
                    reject(err);
                }
            });

            socket.connect(XBDM_PORT, targetIp);
        });
    }

    /**
     * Deploy a XEX to the devkit.
     */
    async deploy(xexPath: string, remotePath: string, ip?: string): Promise<void> {
        const target = remotePath || 'xe:\\';
        this.emit(`\nDeploying to ${target}...\n`);
        await this.runDevkitCommand('xbcp.exe', [xexPath, target], ip);
        this.emit(`✓ Deployed successfully\n`);
    }

    /**
     * Deploy and run a title on the devkit.
     */
    async deployAndRun(xexPath: string, ip?: string): Promise<void> {
        const remotePath = `xe:\\${path.basename(xexPath)}`;
        await this.deploy(xexPath, remotePath, ip);
        this.emit(`\nLaunching...\n`);
        await this.runDevkitCommand('xbrun.exe', [remotePath], ip);
        this.emit(`✓ Title launched\n`);
    }

    /**
     * Reboot the devkit.
     */
    async reboot(type: 'cold' | 'warm' | 'title' = 'cold', ip?: string): Promise<void> {
        const args: string[] = [];
        if (type === 'warm') args.push('/warm');
        else if (type === 'title') args.push('/title');

        this.emit(`\nRebooting (${type})...\n`);
        await this.runDevkitCommand('xbreboot.exe', args, ip);
        this.emit(`✓ Reboot command sent\n`);
    }

    /**
     * Capture a screenshot from the devkit.
     */
    async screenshot(outputPath: string, ip?: string): Promise<string> {
        this.emit(`\nCapturing screenshot...\n`);
        await this.runDevkitCommand('xbcapture.exe', [outputPath], ip);
        this.emit(`✓ Saved to ${outputPath}\n`);
        return outputPath;
    }

    /**
     * List files on the devkit via XBDM dirlist command.
     */
    async listFiles(remotePath: string, ip?: string): Promise<string> {
        const targetIp = ip || this.connectedIp || this.getDefault()?.ip;
        if (!targetIp) throw new Error('No console connected');

        return new Promise((resolve, reject) => {
            const socket = new net.Socket();
            let responseData = '';
            let sentCommand = false;

            socket.setTimeout(XBDM_TIMEOUT + 5000); // Extra time for large dirs

            socket.on('data', (data) => {
                responseData += data.toString();

                if (!sentCommand && responseData.includes('201')) {
                    sentCommand = true;
                    // Normalize path
                    const cleanPath = remotePath.replace(/\//g, '\\');
                    socket.write(`dirlist name="${cleanPath}"\r\n`);
                }

                // Check for end of multiline response
                if (sentCommand && responseData.includes('\r\n.\r\n')) {
                    socket.destroy();

                    // Parse dirlist response
                    // Format: name="filename" sizehi=0x0 sizelo=0x1234 create=... modify=... \r\n
                    // Directories have no size fields or sizehi=0 sizelo=0
                    const lines = responseData.split('\r\n');
                    const results: string[] = [];

                    for (const line of lines) {
                        const nameMatch = line.match(/name="([^"]+)"/);
                        if (!nameMatch) continue;

                        const name = nameMatch[1];
                        const sizeHiMatch = line.match(/sizehi=0x([0-9a-fA-F]+)/);
                        const sizeLoMatch = line.match(/sizelo=0x([0-9a-fA-F]+)/);
                        // Directories have directory attribute or size of 0
                        const hasDir = line.includes('directory') || line.includes('DIR');
                        const sizeHi = sizeHiMatch ? parseInt(sizeHiMatch[1], 16) : 0;
                        const sizeLo = sizeLoMatch ? parseInt(sizeLoMatch[1], 16) : 0;
                        const totalSize = (sizeHi * 0x100000000) + sizeLo;
                        const isDir = hasDir || (totalSize === 0 && !sizeLoMatch);

                        if (isDir) {
                            results.push(`<DIR>          ${name}`);
                        } else {
                            const sizeStr = totalSize.toLocaleString();
                            results.push(`${sizeStr}  ${name}`);
                        }
                    }

                    resolve(results.join('\n'));
                }
            });

            socket.on('timeout', () => {
                socket.destroy();
                // Return whatever we got
                if (sentCommand && responseData) {
                    resolve(responseData);
                } else {
                    reject(new Error('Timeout listing directory'));
                }
            });

            socket.on('error', (err) => { socket.destroy(); reject(err); });
            socket.connect(XBDM_PORT, targetIp);
        });
    }

    /**
     * Delete a file on the devkit.
     */
    async deleteFile(remotePath: string, ip?: string): Promise<void> {
        await this.runDevkitCommand('xbdel.exe', [remotePath], ip);
    }

    /**
     * Create a directory on the devkit.
     */
    async mkdir(remotePath: string, ip?: string): Promise<void> {
        await this.runDevkitCommand('xbmkdir.exe', [remotePath], ip);
    }

    /**
     * Copy a file to the devkit.
     */
    async copyTo(localPath: string, remotePath: string, ip?: string): Promise<void> {
        await this.runDevkitCommand('xbcp.exe', [localPath, remotePath], ip);
    }

    /**
     * Copy a file from the devkit.
     */
    async copyFrom(remotePath: string, localPath: string, ip?: string): Promise<void> {
        await this.runDevkitCommand('xbcp.exe', [remotePath, localPath], ip);
    }
}
