/**
 * appContext.ts — Shared application state and utilities
 *
 * This module acts as the central bridge between app.ts (the orchestrator)
 * and all extracted modules (AI, search, XEX inspector, etc.).
 *
 * app.ts populates the context during init. Extracted modules import
 * from here instead of reaching back into app.ts.
 *
 * This avoids circular dependencies: app.ts → modules → appContext (no cycles).
 */

const { ipcRenderer } = require('electron');
const nodePath = require('path');
const nodeFs = require('fs');

// ── DOM Helpers ──

/** getElementById shorthand. Used everywhere. */
export function $(id: string): HTMLElement {
    return document.getElementById(id)!;
}

/** querySelectorAll shorthand. */
export function $$(sel: string): NodeListOf<HTMLElement> {
    return document.querySelectorAll(sel);
}

/** Escape HTML special characters. */
export function escHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ── Shared State ──
// These are set by app.ts during init and read by extracted modules.

export const ctx = {
    /** The Monaco editor instance. Set after Monaco loads. */
    editor: null as any,

    /** Monaco module reference. Set after Monaco loads. */
    monaco: null as any,

    /** Promise that resolves when Monaco is ready. */
    monacoReady: null as Promise<void> | null,

    /** The currently active tab's file path, or null. */
    activeTab: null as string | null,

    /** Map of open tab file paths → their state. */
    openTabs: [] as any[],

    /** The project root directory, or null if no project is open. */
    projectRoot: null as string | null,

    /** The current project object, or null. */
    currentProject: null as any,

    /** User settings object (AI keys, theme, etc.). */
    userSettings: {} as any,

    /** User learning profile (achievements, builds, etc.). */
    userProfile: {} as any,

    /** IPC renderer for main process communication. */
    ipc: ipcRenderer,
};

// ── Shared Functions ──
// These are function references set by app.ts, callable by any extracted module.

export const fn = {
    /** Append text to the Output panel. */
    appendOutput: (text: string) => {},

    /** Clear the Output panel. */
    clearOutput: () => {},

    /** Show the bottom panel (Output/Problems/Tips/Visualizer). */
    showBottomPanel: () => {},

    /** Re-render the tab bar. */
    renderTabs: () => {},

    /** Save user settings to disk. */
    saveUserSettings: () => {},

    /** Save user profile to disk. */
    saveProfile: () => {},

    /** Render the file tree. */
    refreshFileTree: () => {},

    /** Switch to a tab by file path. */
    switchToTab: (filePath: string) => {},

    /** Render markdown text to HTML. */
    renderMarkdown: (text: string): string => text,
};
