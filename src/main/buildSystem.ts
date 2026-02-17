/**
 * Xbox 360 Build System
 * Handles compilation, linking, and XEX packaging.
 * Output format mirrors Visual Studio / MSBuild for Xbox 360.
 */

import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { Toolchain } from './toolchain';
import { BuildConfig, BuildResult, BuildMessage, ProjectConfig } from '../shared/types';

export class BuildSystem {
    private toolchain: Toolchain;
    private currentProcess: ChildProcess | null = null;
    private activeProcesses: Set<ChildProcess> = new Set();
    private onOutput: ((data: string) => void) | null = null;

    constructor(toolchain: Toolchain) {
        this.toolchain = toolchain;
    }

    setOutputCallback(cb: (data: string) => void) {
        this.onOutput = cb;
    }

    private emit(data: string) {
        if (this.onOutput) this.onOutput(data);
    }

    private timestamp(): string {
        const d = new Date();
        return d.toLocaleDateString('en-US') + ' ' + d.toLocaleTimeString('en-US');
    }

    private elapsed(ms: number): string {
        const s = Math.floor(ms / 1000);
        const min = Math.floor(s / 60);
        const sec = s % 60;
        const frac = (ms % 1000).toString().padStart(3, '0').substring(0, 2);
        return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${frac}`;
    }

    /**
     * Full build: compile all sources → link → produce XEX.
     */
    async build(project: ProjectConfig, config?: Partial<BuildConfig>): Promise<BuildResult> {
        const startTime = Date.now();
        const errors: BuildMessage[] = [];
        const warnings: BuildMessage[] = [];
        let fullOutput = '';

        const configuration = config?.configuration || project.configuration || 'Debug';
        const buildConfig: BuildConfig = {
            configuration,
            compilerFlags: config?.compilerFlags || [],
            linkerFlags: config?.linkerFlags || [],
            defines: config?.defines || project.defines || [],
            outputDir: config?.outputDir || path.join(project.path, 'out', configuration),
        };

        // Ensure output directory
        if (!fs.existsSync(buildConfig.outputDir)) {
            fs.mkdirSync(buildConfig.outputDir, { recursive: true });
        }

        // ── MSBuild-style header ──
        this.emit(`1>------ Build started: Project: ${project.name}, Configuration: ${configuration} Xbox 360 ------\n`);
        this.emit(`1>Build started ${this.timestamp()}.\n`);


        // ── Check VC++ Runtime Dependencies ──
        const runtimeCheck = this.toolchain.checkRuntimeDependencies();
        if (runtimeCheck.missing.length > 0) {
            const duration = Date.now() - startTime;
            const dlls = runtimeCheck.missing.join(', ');
            const msg = `Microsoft Visual C++ 2010 runtime DLLs are missing from the SDK: ${dlls}. ${runtimeCheck.hint}`;
            this.emit(`1>\n`);
            this.emit(`1>  ERROR: ${msg}\n`);
            this.emit(`1>\n`);
            errors.push({ file: '', line: 0, column: 0, message: msg, severity: 'error' });
            this.emit(`1>Build FAILED.\n`);
            this.emit(`1>\n`);
            this.emit(`1>Time Elapsed ${this.elapsed(duration)}\n`);
            this.emit(`========== Build: 0 succeeded, 1 failed, 0 up-to-date, 0 skipped ==========\n`);
            return { success: false, errors, warnings, output: fullOutput, duration };
        }

        // ── InitializeBuildStatus ──
        this.emit(`1>InitializeBuildStatus:\n`);
        const unsuccessfulMarker = path.join(buildConfig.outputDir, `${project.name}.unsuccessfulbuild`);
        try { fs.writeFileSync(unsuccessfulMarker, ''); } catch {}
        this.emit(`1>  Creating "${path.relative(project.path, unsuccessfulMarker)}" because "AlwaysCreate" was specified.\n`);

        // ── ClCompile ──
        // Discover all source files: merge config list with directory scan
        // Use case-insensitive dedup since Windows paths are case-insensitive
        const configuredFiles = (project.sourceFiles || []).filter(f => /\.(cpp|c|cc|cxx)$/i.test(f));
        const discoveredFiles = this.discoverSourceFiles(project.path);
        const seen = new Set<string>();
        const sourceFiles: string[] = [];
        const addSource = (f: string) => {
            const abs = path.isAbsolute(f) ? f : path.join(project.path, f);
            const key = abs.toLowerCase();
            if (!seen.has(key) && fs.existsSync(abs)) {
                seen.add(key);
                sourceFiles.push(abs);
            }
        };
        for (const f of configuredFiles) addSource(f);
        for (const f of discoveredFiles) addSource(f);

        // Detect object file name collisions (e.g. src/util.cpp and lib/util.cpp)
        const objNameMap = new Map<string, string>();
        for (const srcFile of sourceFiles) {
            const objName = path.basename(srcFile, path.extname(srcFile)).toLowerCase() + '.obj';
            const existing = objNameMap.get(objName);
            if (existing) {
                const relA = path.relative(project.path, existing);
                const relB = path.relative(project.path, srcFile);
                warnings.push({
                    file: srcFile, line: 0, column: 0,
                    message: `Object file collision: "${relB}" and "${relA}" both produce ${objName}. The second will overwrite the first.`,
                    severity: 'warning',
                });
                this.emit(`1>  warning: "${relB}" collides with "${relA}" (both produce ${objName})\n`);
            }
            objNameMap.set(objName, srcFile);
        }

        const objFiles: string[] = [];

        // Determine PCH files
        const pchHeaderName = project.pchHeader || 'stdafx.h';
        const pchCppName = pchHeaderName.replace(/\.h$/i, '.cpp');
        const pchPath = path.join(buildConfig.outputDir, pchHeaderName.replace(/\.h$/i, '.pch'));
        const pchCpp = sourceFiles.find(f => path.basename(f).toLowerCase() === pchCppName.toLowerCase());
        const nonPchFiles = sourceFiles.filter(f => path.basename(f).toLowerCase() !== pchCppName.toLowerCase());
        const usePch = !!pchCpp;
        let pchRebuilt = false;
        let skippedCount = 0;

        if (sourceFiles.length > 0) {
            this.emit(`1>ClCompile:\n`);

            // Step 1: Compile PCH source first with /Yc (create precompiled header)
            // PCH always recompiles since header changes are hard to track
            if (usePch && pchCpp) {
                // Clean stale PCH and compiler PDB to prevent C2859
                try { fs.unlinkSync(pchPath); } catch {}
                try { fs.unlinkSync(path.join(buildConfig.outputDir, 'vc100.pdb')); } catch {}

                const baseName = path.basename(pchCpp);
                const objName = path.basename(pchCpp, path.extname(pchCpp)) + '.obj';
                const objPath = path.join(buildConfig.outputDir, objName);

                this.emit(`1>  ${baseName}\n`);

                const result = await this.compile(pchCpp, objPath, project, buildConfig, {
                    pchMode: 'create', pchHeader: pchHeaderName, pchFile: pchPath
                });
                fullOutput += result.output;
                pchRebuilt = true;

                if (result.rawLines.length > 0) {
                    for (const line of result.rawLines) this.emit(`1>  ${line}\n`);
                }

                if (result.errors.length > 0) {
                    errors.push(...result.errors);
                } else {
                    objFiles.push(objPath);
                    warnings.push(...result.warnings);
                }
            }

            // Stop if PCH compilation failed
            if (errors.length > 0) {
                const duration = Date.now() - startTime;
                this.emitFailure(project, errors, warnings, duration, unsuccessfulMarker);
                return { success: false, errors, warnings, output: fullOutput, duration };
            }

            // Step 2: Compile remaining source files with /Yu (use precompiled header)
            // Incremental: skip files whose .obj is newer than the source (and PCH, if any)
            const filesToCompile: string[] = [];
            for (const srcPath of nonPchFiles) {
                const objName = path.basename(srcPath, path.extname(srcPath)) + '.obj';
                const objPath = path.join(buildConfig.outputDir, objName);
                if (!pchRebuilt && this.isUpToDate(srcPath, objPath, usePch ? pchPath : undefined)) {
                    objFiles.push(objPath);
                    skippedCount++;
                } else {
                    filesToCompile.push(srcPath);
                }
            }

            if (skippedCount > 0) {
                this.emit(`1>  ${skippedCount} file${skippedCount > 1 ? 's' : ''} up-to-date, skipped.\n`);
            }

            if (filesToCompile.length > 0) {
                if (usePch) this.emit(`1>  Compiling...\n`);

                // Parallel compilation: run up to N compiles concurrently
                const maxParallel = Math.min(4, filesToCompile.length);
                const queue = [...filesToCompile];
                const compileOne = async (): Promise<void> => {
                    while (queue.length > 0 && errors.length === 0) {
                        const srcPath = queue.shift()!;
                        const baseName = path.basename(srcPath);
                        const objName = path.basename(srcPath, path.extname(srcPath)) + '.obj';
                        const objPath = path.join(buildConfig.outputDir, objName);

                        this.emit(`1>  ${baseName}\n`);

                        const pchOpts = usePch ? { pchMode: 'use' as const, pchHeader: pchHeaderName, pchFile: pchPath } : undefined;
                        const result = await this.compile(srcPath, objPath, project, buildConfig, pchOpts);
                        fullOutput += result.output;

                        if (result.rawLines.length > 0) {
                            for (const line of result.rawLines) this.emit(`1>  ${line}\n`);
                        }

                        if (result.errors.length > 0) {
                            errors.push(...result.errors);
                        } else {
                            objFiles.push(objPath);
                            warnings.push(...result.warnings);
                        }
                    }
                };
                await Promise.all(Array.from({ length: maxParallel }, () => compileOne()));
            }

            this.emit(`1>  Generating Code...\n`);
        }

        // Stop if compilation errors
        if (errors.length > 0) {
            const duration = Date.now() - startTime;
            this.emitFailure(project, errors, warnings, duration, unsuccessfulMarker);
            return { success: false, errors, warnings, output: fullOutput, duration };
        }

        // ── Link ──
        if (objFiles.length > 0) {
            this.emit(`1>Link:\n`);
            const exeName = project.name + (project.type === 'dll' ? '.dll' : '.exe');
            const exePath = path.join(buildConfig.outputDir, exeName);

            this.emit(`1>  ${exeName}\n`);

            const linkResult = await this.link(objFiles, exePath, project, buildConfig);
            fullOutput += linkResult.output;
            errors.push(...linkResult.errors);
            warnings.push(...linkResult.warnings);

            if (linkResult.rawLines.length > 0) {
                for (const line of linkResult.rawLines) {
                    this.emit(`1>  ${line}\n`);
                }
            }

            if (linkResult.errors.length > 0) {
                const duration = Date.now() - startTime;
                this.emitFailure(project, errors, warnings, duration, unsuccessfulMarker);
                return { success: false, errors, warnings, output: fullOutput, duration };
            }

            // ── ImageXex ──
            if (project.type === 'executable') {
                this.emit(`1>ImageXex:\n`);
                const xexPath = path.join(buildConfig.outputDir, project.name + '.xex');

                this.emit(`1>  Microsoft(R) Xbox 360 Image File Builder Version 2.0.21256.0\n`);
                this.emit(`1>  (c)2012 Microsoft Corporation. All rights reserved.\n`);
                this.emit(`1>  \n`);

                const xexResult = await this.buildXex(exePath, xexPath);
                fullOutput += xexResult.output;

                if (xexResult.rawLines.length > 0) {
                    for (const line of xexResult.rawLines) {
                        this.emit(`1>  ${line}\n`);
                    }
                }

                if (xexResult.errors.length > 0) {
                    errors.push(...xexResult.errors);
                    const duration = Date.now() - startTime;
                    this.emitFailure(project, errors, warnings, duration, unsuccessfulMarker);
                    return { success: false, errors, warnings, output: fullOutput, duration };
                }
            }
        }

        // ── FinalizeBuildStatus ──
        const duration = Date.now() - startTime;
        const success = errors.length === 0;

        if (success) {
            this.emit(`1>FinalizeBuildStatus:\n`);
            try { if (fs.existsSync(unsuccessfulMarker)) fs.unlinkSync(unsuccessfulMarker); } catch {}
            this.emit(`1>  Deleting file "${path.relative(project.path, unsuccessfulMarker)}".\n`);
            const lastBuildState = path.join(buildConfig.outputDir, `${project.name}.lastbuildstate`);
            try { fs.writeFileSync(lastBuildState, new Date().toISOString()); } catch {}
            this.emit(`1>  Touching "${path.relative(project.path, lastBuildState)}".\n`);
            this.emit(`1>\n`);
            this.emit(`1>Build succeeded.\n`);
            this.emit(`1>\n`);
            this.emit(`1>Time Elapsed ${this.elapsed(duration)}\n`);
            this.emit(`========== Build: 1 succeeded, 0 failed, 0 up-to-date, 0 skipped ==========\n`);
        } else {
            this.emitFailure(project, errors, warnings, duration, unsuccessfulMarker);
        }

        const outputFile = path.join(buildConfig.outputDir, project.name + '.xex');
        return { success, errors, warnings, output: fullOutput, duration, outputFile: success ? outputFile : undefined };
    }

    private emitFailure(project: ProjectConfig, errors: BuildMessage[], warnings: BuildMessage[], duration: number, unsuccessfulMarker: string) {
        this.emit(`1>FinalizeBuildStatus:\n`);
        this.emit(`1>  "${path.basename(unsuccessfulMarker)}" was not deleted — build failed.\n`);
        this.emit(`1>\n`);
        this.emit(`1>Build FAILED.\n`);
        this.emit(`1>\n`);
        if (errors.length > 0) {
            for (const err of errors) {
                const loc = err.file ? `${path.basename(err.file)}${err.line ? `(${err.line})` : ''}` : project.name;
                this.emit(`1>${loc}: error: ${err.message}\n`);
            }
            this.emit(`1>\n`);
        }
        this.emit(`1>Time Elapsed ${this.elapsed(duration)}\n`);
        this.emit(`========== Build: 0 succeeded, 1 failed, 0 up-to-date, 0 skipped ==========\n`);
    }

    /**
     * Compile a single source file.
     */
    private async compile(
        srcPath: string,
        objPath: string,
        project: ProjectConfig,
        config: BuildConfig,
        pchOpts?: { pchMode: 'create' | 'use'; pchHeader: string; pchFile: string }
    ): Promise<{ output: string; errors: BuildMessage[]; warnings: BuildMessage[]; rawLines: string[] }> {
        const sdkPaths = this.toolchain.getPaths();
        if (!sdkPaths) {
            return { output: '', errors: [{ file: srcPath, line: 0, column: 0, message: 'Xbox 360 SDK not configured. Go to Settings > SDK Setup.', severity: 'error' }], warnings: [], rawLines: ['error: Xbox 360 SDK not configured'] };
        }

        const clPath = this.toolchain.getToolPath('cl.exe');
        if (!clPath) {
            return { output: '', errors: [{ file: srcPath, line: 0, column: 0, message: 'cl.exe not found in SDK', severity: 'error' }], warnings: [], rawLines: ['error: cl.exe not found in SDK bin directory'] };
        }

        const args: string[] = ['/nologo', '/c', `/Fo"${objPath}"`];

        // Precompiled header flags
        if (pchOpts) {
            if (pchOpts.pchMode === 'create') {
                // /Yc creates the .pch from this source file
                args.push(`/Yc"${pchOpts.pchHeader}"`);
            } else {
                // /Yu uses an existing .pch
                args.push(`/Yu"${pchOpts.pchHeader}"`);
            }
            args.push(`/Fp"${pchOpts.pchFile}"`);
        }

        // Include paths
        args.push(`/I"${sdkPaths.include}"`);
        const xboxInc = path.join(sdkPaths.include, 'xbox');
        if (fs.existsSync(xboxInc)) args.push(`/I"${xboxInc}"`);
        // Project source dir
        args.push(`/I"${path.join(project.path, 'src')}"`);
        args.push(`/I"${project.path}"`);
        for (const inc of (project.includeDirectories || [])) {
            const incPath = path.isAbsolute(inc) ? inc : path.join(project.path, inc);
            args.push(`/I"${incPath}"`);
        }

        // Configuration-specific flags
        if (config.configuration === 'Debug') {
            args.push('/Od', '/Zi', `/Fd"${path.join(config.outputDir, 'vc100.pdb')}"`, '/D_DEBUG', '/DDEBUG', '/RTC1', '/GS');
        } else if (config.configuration === 'Release') {
            args.push('/O2', '/Ox', '/DNDEBUG', '/GS-');
        } else if (config.configuration === 'Profile') {
            args.push('/O2', '/Zi', `/Fd"${path.join(config.outputDir, 'vc100.pdb')}"`, '/DNDEBUG', '/DPROFILE', '/GS-');
        }

        // Xbox 360 specific defines
        args.push('/D_XBOX', '/DXBOX', '/D_XBOX_VER=200');

        // User defines
        for (const def of config.defines) args.push(`/D${def}`);

        // Standard flags — respect project-level compiler options
        const ehMode = project.exceptionHandling || 'EHsc';
        if (ehMode !== 'off') args.push(`/${ehMode}`);
        const warnLevel = project.warningLevel ?? 3;
        args.push(`/W${warnLevel}`);
        // RTTI: Xbox 360 default is /GR- (disabled) for performance
        args.push(project.enableRTTI ? '/GR' : '/GR-');

        // Additional compiler flags from project properties
        if (project.additionalCompilerFlags) {
            const extra = project.additionalCompilerFlags.trim().split(/\s+/).filter(Boolean);
            args.push(...extra);
        }

        // Additional compiler flags from build config
        args.push(...config.compilerFlags);

        // Source file
        args.push(`"${srcPath}"`);

        return this.runTool(clPath, args, srcPath);
    }

    /**
     * Link object files into an executable.
     * Uses a response file (@file) to avoid the ~8191 char Windows command line limit.
     */
    private async link(
        objFiles: string[],
        outputPath: string,
        project: ProjectConfig,
        config: BuildConfig
    ): Promise<{ output: string; errors: BuildMessage[]; warnings: BuildMessage[]; rawLines: string[] }> {
        const sdkPaths = this.toolchain.getPaths();
        if (!sdkPaths) {
            return { output: '', errors: [{ file: '', line: 0, column: 0, message: 'SDK not configured', severity: 'error' }], warnings: [], rawLines: [] };
        }

        const linkPath = this.toolchain.getToolPath('link.exe');
        if (!linkPath) {
            return { output: '', errors: [{ file: '', line: 0, column: 0, message: 'link.exe not found', severity: 'error' }], warnings: [], rawLines: ['error: link.exe not found in SDK'] };
        }

        const rspArgs: string[] = ['/nologo', `/OUT:"${outputPath}"`];

        if (project.type === 'dll') rspArgs.push('/DLL');

        // Xbox 360 link.exe infers MACHINE/SUBSYSTEM/ENTRY automatically

        // Library paths
        const xboxLib = path.join(sdkPaths.lib, 'xbox');
        if (fs.existsSync(xboxLib)) rspArgs.push(`/LIBPATH:"${xboxLib}"`);
        for (const libDir of (project.libraryDirectories || [])) {
            const libPath = path.isAbsolute(libDir) ? libDir : path.join(project.path, libDir);
            rspArgs.push(`/LIBPATH:"${libPath}"`);
        }

        // Default Xbox 360 libraries — matches VS2010 project defaults exactly
        const isDebug = config.configuration === 'Debug';
        const defaultLibs = [
            isDebug ? 'xapilibd.lib' : 'xapilib.lib',
            isDebug ? 'd3d9d.lib'    : 'd3d9.lib',
            isDebug ? 'd3dx9d.lib'   : 'd3dx9.lib',
            isDebug ? 'xgraphicsd.lib' : 'xgraphics.lib',
            'xboxkrnl.lib',
            isDebug ? 'xnetd.lib'    : 'xnet.lib',
            isDebug ? 'xaudiod2.lib' : 'xaudio2.lib',
            isDebug ? 'xactd3.lib'   : 'xact3.lib',
            isDebug ? 'x3daudiod.lib': 'x3daudio.lib',
            isDebug ? 'xmcored.lib'  : 'xmcore.lib',
        ];
        if (isDebug) defaultLibs.push('xbdm.lib', 'vcompd.lib');
        rspArgs.push(...defaultLibs);

        // SDK headers auto-link xapilib.lib via #pragma comment(lib).
        // Suppress the release version so it doesn't conflict with xapilibd.lib.
        if (isDebug) rspArgs.push('/NODEFAULTLIB:xapilib.lib');

        // User libraries
        for (const lib of (project.libraries || [])) rspArgs.push(lib);

        // Debug info
        if (config.configuration === 'Debug' || config.configuration === 'Profile') {
            rspArgs.push('/INCREMENTAL');
            rspArgs.push('/DEBUG');
            const pdbPath = outputPath.replace(/\.(exe|dll)$/i, '.pdb');
            rspArgs.push(`/PDB:"${pdbPath}"`);
        }

        // Additional linker flags from project properties
        if (project.additionalLinkerFlags) {
            const extra = project.additionalLinkerFlags.trim().split(/\s+/).filter(Boolean);
            rspArgs.push(...extra);
        }

        // Additional linker flags from build config
        rspArgs.push(...config.linkerFlags);

        // Object files
        for (const obj of objFiles) rspArgs.push(`"${obj}"`);

        // Xbox 360 link.exe: skip XEX generation (done separately by buildXex)
        rspArgs.push('/XEX:NO');

        // Write response file to avoid Windows command line length limit (~8191 chars)
        const rspPath = path.join(config.outputDir, 'link.rsp');
        fs.writeFileSync(rspPath, rspArgs.join('\n'), 'utf-8');

        return this.runTool(linkPath, [`@"${rspPath}"`], '');
    }

    /**
     * Build XEX from executable.
     */
    private async buildXex(
        exePath: string,
        xexPath: string
    ): Promise<{ output: string; errors: BuildMessage[]; warnings: BuildMessage[]; rawLines: string[] }> {
        const imagexex = this.toolchain.getToolPath('imagexex.exe');
        if (!imagexex) {
            return { output: '', errors: [{ file: '', line: 0, column: 0, message: 'imagexex.exe not found', severity: 'error' }], warnings: [], rawLines: ['error: imagexex.exe not found'] };
        }

        const args = ['/nologo', `/out:"${xexPath}"`, `"${exePath}"`];
        return this.runTool(imagexex, args, '');
    }

    /**
     * Clean build artifacts.
     */
    async clean(project: ProjectConfig): Promise<void> {
        const outDir = path.join(project.path, 'out');
        if (fs.existsSync(outDir)) {
            fs.rmSync(outDir, { recursive: true, force: true });
            this.emit(`1>  Cleaned: ${outDir}\n`);
        }
        this.emit(`========== Clean: 1 succeeded ==========\n`);
    }

    /**
     * Cancel the current build.
     */
    cancel() {
        if (this.currentProcess) {
            this.currentProcess.kill();
            this.currentProcess = null;
        }
        for (const proc of this.activeProcesses) {
            try { proc.kill(); } catch {}
        }
        this.activeProcesses.clear();
        this.emit('\n========== Build: cancelled ==========\n');
    }

    /**
     * Check if an object file is up-to-date relative to its source.
     * Returns true if .obj exists and is newer than the source file (and PCH if applicable).
     */
    private isUpToDate(srcPath: string, objPath: string, pchPath?: string): boolean {
        try {
            if (!fs.existsSync(objPath)) return false;
            const objMtime = fs.statSync(objPath).mtimeMs;
            const srcMtime = fs.statSync(srcPath).mtimeMs;
            if (srcMtime >= objMtime) return false;
            if (pchPath && fs.existsSync(pchPath)) {
                const pchMtime = fs.statSync(pchPath).mtimeMs;
                if (pchMtime >= objMtime) return false;
            }
            return true;
        } catch {
            return false;
        }
    }

    private discoverSourceFiles(projectPath: string): string[] {
        const sources: string[] = [];
        const srcDir = path.join(projectPath, 'src');
        const scanDir = (dir: string) => {
            if (!fs.existsSync(dir)) return;
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.isDirectory()) {
                    if (!['out', 'obj', '.git', 'node_modules'].includes(entry.name)) {
                        scanDir(path.join(dir, entry.name));
                    }
                } else if (/\.(cpp|c|cc|cxx)$/i.test(entry.name)) {
                    sources.push(path.join(dir, entry.name));
                }
            }
        };
        // Scan src/ folder first, then root
        scanDir(srcDir);
        // Also check root for any loose source files
        if (fs.existsSync(projectPath)) {
            for (const entry of fs.readdirSync(projectPath, { withFileTypes: true })) {
                if (!entry.isDirectory() && /\.(cpp|c|cc|cxx)$/i.test(entry.name)) {
                    sources.push(path.join(projectPath, entry.name));
                }
            }
        }
        return sources;
    }

    /**
     * Run a tool and parse output for errors/warnings.
     */
    private runTool(toolPath: string, args: string[], contextFile: string): Promise<{ output: string; errors: BuildMessage[]; warnings: BuildMessage[]; rawLines: string[] }> {
        return new Promise((resolve) => {
            const env = this.toolchain.getToolEnvironment();
            let proc: ChildProcess;

            try {
                // Quote the tool path to handle spaces (e.g. C:\Program Files (x86)\...)
                const quotedTool = toolPath.includes(' ') ? `"${toolPath}"` : toolPath;
                // Set cwd to the tool's directory so Windows DLL search finds sibling
                // DLLs (c1.dll, c1xx.dll, c2.dll, mspdb*.dll, MSVC runtimes, etc.)
                const toolDir = path.dirname(toolPath);
                proc = spawn(quotedTool, args, { env, cwd: toolDir, shell: true, windowsHide: true });
            } catch (err: any) {
                resolve({
                    output: err.message,
                    errors: [{ file: contextFile, line: 0, column: 0, message: `Failed to launch: ${path.basename(toolPath)} — ${err.message}`, severity: 'error' }],
                    warnings: [],
                    rawLines: [`error: Failed to launch ${path.basename(toolPath)}: ${err.message}`],
                });
                return;
            }

            this.currentProcess = proc;
            this.activeProcesses.add(proc);
            let output = '';
            const errors: BuildMessage[] = [];
            const warnings: BuildMessage[] = [];
            const rawLines: string[] = [];

            const parseLine = (line: string) => {
                output += line + '\n';

                // MSVC error format: file(line): error Cxxxx: message
                const match = line.match(/^(.+?)\((\d+)\)\s*:\s*(error|warning)\s+(\w+)\s*:\s*(.+)/i);
                if (match) {
                    const msg: BuildMessage = {
                        file: match[1],
                        line: parseInt(match[2]),
                        column: 0,
                        message: `${match[4]}: ${match[5]}`,
                        severity: match[3].toLowerCase() as 'error' | 'warning',
                    };
                    if (msg.severity === 'error') errors.push(msg);
                    else warnings.push(msg);
                    rawLines.push(line);
                    return;
                }

                // Linker error: LINK : fatal error LNKxxxx: message
                const linkMatch = line.match(/LINK\s*:\s*(fatal\s+error|error|warning)\s+(\w+)\s*:\s*(.+)/i);
                if (linkMatch) {
                    const severity = linkMatch[1].toLowerCase().includes('error') ? 'error' : 'warning';
                    const msg: BuildMessage = {
                        file: contextFile || 'LINK',
                        line: 0, column: 0,
                        message: `${linkMatch[2]}: ${linkMatch[3]}`,
                        severity: severity as 'error' | 'warning',
                    };
                    if (severity === 'error') errors.push(msg);
                    else warnings.push(msg);
                    rawLines.push(line);
                    return;
                }

                // Unresolved external
                const unresolved = line.match(/error\s+(LNK\d+)\s*:\s*(.+)/i);
                if (unresolved) {
                    errors.push({
                        file: contextFile || 'LINK', line: 0, column: 0,
                        message: `${unresolved[1]}: ${unresolved[2]}`,
                        severity: 'error',
                    });
                    rawLines.push(line);
                    return;
                }

                // Skip nologo/blank lines, only collect meaningful tool output
                // Also skip cl.exe filename echo (just the bare source filename)
                if (line.trim() && !line.match(/^Microsoft|^Copyright|^\s*$/) && !line.match(/^\w+\.(cpp|c|cc|cxx|obj|h)$/i)) {
                    rawLines.push(line);
                }
            };

            proc.stdout?.on('data', (data) => {
                data.toString().split('\n').forEach((l: string) => { if (l.trim()) parseLine(l.trim()); });
            });

            proc.stderr?.on('data', (data) => {
                data.toString().split('\n').forEach((l: string) => { if (l.trim()) parseLine(l.trim()); });
            });

            proc.on('close', (code) => {
                this.currentProcess = null;
                this.activeProcesses.delete(proc);
                // If process exited with error code but we didn't parse any errors,
                // add a generic error
                if (code && code !== 0 && errors.length === 0) {
                    // 0xC0000135 (3221225781 unsigned / -1073741515 signed) = STATUS_DLL_NOT_FOUND
                    const isDllNotFound = code === 3221225781 || code === -1073741515;
                    const message = isDllNotFound
                        ? `${path.basename(toolPath)} failed: a required DLL was not found (0xC0000135). Ensure msvcr100.dll and msvcp100.dll are in the SDK bin\\win32 folder.`
                        : `${path.basename(toolPath)} exited with code ${code}`;
                    errors.push({
                        file: contextFile || path.basename(toolPath),
                        line: 0, column: 0,
                        message,
                        severity: 'error',
                    });
                    rawLines.push(`error: ${message}`);
                }
                resolve({ output, errors, warnings, rawLines });
            });

            proc.on('error', (err) => {
                this.currentProcess = null;
                this.activeProcesses.delete(proc);
                errors.push({
                    file: contextFile, line: 0, column: 0,
                    message: `Cannot execute ${path.basename(toolPath)}: ${err.message}`,
                    severity: 'error',
                });
                rawLines.push(`error: Cannot execute ${path.basename(toolPath)}: ${err.message}`);
                resolve({ output, errors, warnings, rawLines });
            });
        });
    }
}
