/**
 * projectExport.ts — Project export (.zip) and import
 * Extracted from app.ts.
 */

const { ipcRenderer } = require('electron');
const nodeFs = require('fs');
const nodePath = require('path');

let _appendOutput: (text: string) => void = () => {};
let _getCurrentProject: () => any = () => null;
let _refreshFileTree: () => void = () => {};
let _openProject: (path?: string) => void = () => {};

export function initProjectExport(deps: {
    appendOutput: (text: string) => void;
    getCurrentProject: () => any;
    refreshFileTree: () => void;
    openProject: (path?: string) => void;
}) {
    _appendOutput = deps.appendOutput;
    _getCurrentProject = deps.getCurrentProject;
    _refreshFileTree = deps.refreshFileTree;
    _openProject = deps.openProject;
}

export async function exportProject() {
    const proj = _getCurrentProject();
    if (!proj) { _appendOutput('No project open to export.\n'); return; }
    try {
        const result = await ipcRenderer.invoke('project:export');
        if (result) _appendOutput(`📦 Project exported: ${result}\n`);
    } catch (err: any) {
        _appendOutput(`Export failed: ${err.message}\n`);
    }
}

export async function importProject() {
    try {
        const result = await ipcRenderer.invoke('project:import');
        if (result) {
            _appendOutput(`📦 Project imported: ${result}\n`);
            _openProject(result);
        }
    } catch (err: any) {
        _appendOutput(`Import failed: ${err.message}\n`);
    }
}

export async function uploadDocument() {
    const proj = _getCurrentProject();
    if (!proj) { _appendOutput('Open a project first.\n'); return; }
    const filePath = await ipcRenderer.invoke('file:selectFile');
    if (!filePath) return;
    const fileName = nodePath.basename(filePath);
    const docsDir = nodePath.join(proj.path, 'Documents');
    try {
        nodeFs.mkdirSync(docsDir, { recursive: true });
        nodeFs.copyFileSync(filePath, nodePath.join(docsDir, fileName));
        _refreshFileTree();
        _appendOutput(`📄 Uploaded document: ${fileName}\n`);
    } catch (err: any) { _appendOutput(`Upload failed: ${err.message}\n`); }
}
