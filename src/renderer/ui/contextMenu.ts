/**
 * contextMenu.ts — Custom right-click context menu
 * Extracted from app.ts.
 */

export interface CtxItem { label: string; action: () => void; }

export function showContextMenu(x: number, y: number, items: CtxItem[]) {
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
    menu.style.display = 'block';
    menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - items.length * 30) + 'px';
}

export function hideContextMenu() {
    const menu = document.getElementById('context-menu');
    if (menu) menu.style.display = 'none';
}

export function initContextMenu() {
    document.addEventListener('click', hideContextMenu);
    document.addEventListener('contextmenu', (e) => {
        if ((e.target as HTMLElement).closest('.tree-item, .editor-tab')) return;
    });
}
