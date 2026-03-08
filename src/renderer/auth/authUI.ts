/**
 * authUI.ts — Authentication UI for Nexia IDE
 *
 * Provides:
 * - Login / Register modal dialog
 * - Account button in the titlebar (avatar + dropdown)
 * - Server URL configuration
 * - Auth state visual feedback
 *
 * This module builds and manages its own DOM elements.
 * Call init() once during app startup to wire everything up.
 */

import * as auth from './authService';
import type { NexiaUser } from './authService';

// ── DOM References ──

let _authBtn: HTMLElement | null = null;
let _authDropdown: HTMLElement | null = null;
let _modalOverlay: HTMLElement | null = null;
let _onAdminStateChange: ((isAdmin: boolean) => void) | null = null;

// ── Helpers ──

function $(id: string): HTMLElement { return document.getElementById(id)!; }

function getInitials(user: NexiaUser): string {
    return (user.username || user.email || '?').substring(0, 2).toUpperCase();
}

function getRoleColor(role: string): string {
    return role === 'admin' ? '#e5c07b' : '#4ec9b0';
}

function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Modal ──

function showModal(mode: 'login' | 'register') {
    if (_modalOverlay) _modalOverlay.remove();

    _modalOverlay = document.createElement('div');
    _modalOverlay.className = 'auth-modal-overlay';
    _modalOverlay.addEventListener('click', (e) => {
        if (e.target === _modalOverlay) closeModal();
    });

    const modal = document.createElement('div');
    modal.className = 'auth-modal';
    modal.innerHTML = renderAuthForm(mode);

    _modalOverlay.appendChild(modal);
    document.body.appendChild(_modalOverlay);
    requestAnimationFrame(() => _modalOverlay!.classList.add('visible'));

    wireAuthForm(modal, mode);
}

function closeModal() {
    if (_modalOverlay) {
        _modalOverlay.classList.remove('visible');
        setTimeout(() => { _modalOverlay?.remove(); _modalOverlay = null; }, 200);
    }
}

function renderAuthForm(mode: 'login' | 'register'): string {
    const isRegister = mode === 'register';
    return `
        <div class="auth-modal-header">
            <div class="auth-modal-title">${isRegister ? 'Create Account' : 'Sign In'}</div>
            <button class="auth-modal-close" id="auth-close">✕</button>
        </div>
        <div class="auth-modal-body">
            <div class="auth-error" id="auth-error" style="display:none"></div>
            ${isRegister ? `
                <label class="auth-label">Username</label>
                <input type="text" class="auth-input" id="auth-username" placeholder="nexia_dev" autocomplete="username" spellcheck="false">
            ` : ''}
            <label class="auth-label">Email</label>
            <input type="email" class="auth-input" id="auth-email" placeholder="you@example.com" autocomplete="email" spellcheck="false">
            <label class="auth-label">Password</label>
            <input type="password" class="auth-input" id="auth-password" placeholder="••••••••" autocomplete="${isRegister ? 'new-password' : 'current-password'}">
            ${isRegister ? `
                <label class="auth-label">Confirm Password</label>
                <input type="password" class="auth-input" id="auth-confirm" placeholder="••••••••" autocomplete="new-password">
            ` : ''}
            <button class="auth-submit" id="auth-submit">${isRegister ? 'Create Account' : 'Sign In'}</button>
            <div class="auth-switch">
                ${isRegister
                    ? 'Already have an account? <a href="#" id="auth-switch-link">Sign In</a>'
                    : 'Don\'t have an account? <a href="#" id="auth-switch-link">Create one</a>'}
            </div>
        </div>`;
}

function wireAuthForm(modal: HTMLElement, mode: 'login' | 'register') {
    modal.querySelector('#auth-close')!.addEventListener('click', closeModal);

    modal.querySelector('#auth-switch-link')!.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal();
        setTimeout(() => showModal(mode === 'login' ? 'register' : 'login'), 250);
    });

    const submit = modal.querySelector('#auth-submit') as HTMLButtonElement;
    const emailInput = modal.querySelector('#auth-email') as HTMLInputElement;
    const passInput = modal.querySelector('#auth-password') as HTMLInputElement;

    async function doSubmit() {
        const errorEl = modal.querySelector('#auth-error') as HTMLElement;
        errorEl.style.display = 'none';
        submit.disabled = true;
        submit.textContent = 'Please wait...';

        const email = emailInput.value.trim();
        const password = passInput.value;

        if (!email || !password) {
            showFormError(errorEl, 'Please fill in all fields.');
            submit.disabled = false;
            submit.textContent = mode === 'register' ? 'Create Account' : 'Sign In';
            return;
        }

        let result: auth.AuthResult;

        if (mode === 'register') {
            const username = (modal.querySelector('#auth-username') as HTMLInputElement).value.trim();
            const confirm = (modal.querySelector('#auth-confirm') as HTMLInputElement).value;
            if (!username) { showFormError(errorEl, 'Username is required.'); submit.disabled = false; submit.textContent = 'Create Account'; return; }
            if (password !== confirm) { showFormError(errorEl, 'Passwords do not match.'); submit.disabled = false; submit.textContent = 'Create Account'; return; }
            if (password.length < 6) { showFormError(errorEl, 'Password must be at least 6 characters.'); submit.disabled = false; submit.textContent = 'Create Account'; return; }
            result = await auth.register(username, email, password);
        } else {
            result = await auth.login(email, password);
        }

        if (result.success) {
            closeModal();
        } else {
            showFormError(errorEl, result.error || 'Authentication failed.');
            submit.disabled = false;
            submit.textContent = mode === 'register' ? 'Create Account' : 'Sign In';
        }
    }

    submit.addEventListener('click', doSubmit);

    // Enter key submits
    const inputs = modal.querySelectorAll('.auth-input');
    inputs.forEach(inp => {
        inp.addEventListener('keydown', (e: Event) => {
            if ((e as KeyboardEvent).key === 'Enter') doSubmit();
        });
    });

    // Focus first input
    setTimeout(() => {
        const first = modal.querySelector(mode === 'register' ? '#auth-username' : '#auth-email') as HTMLInputElement;
        first?.focus();
    }, 300);
}

function showFormError(el: HTMLElement, msg: string) {
    el.style.display = 'block';
    el.textContent = msg;
}

// ── Account Button (titlebar) ──

function createAuthButton(): HTMLElement {
    const btn = document.createElement('div');
    btn.className = 'auth-titlebar-btn';
    btn.id = 'auth-titlebar-btn';
    updateAuthButtonContent(btn);
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown();
    });
    return btn;
}

function updateAuthButtonContent(btn: HTMLElement) {
    const user = auth.getUser();
    if (user) {
        btn.innerHTML = `<div class="auth-avatar" style="background:${getRoleColor(user.role)}">${getInitials(user)}</div>`;
        btn.title = user.username + ' (' + user.role + ')';
    } else {
        btn.innerHTML = '<span class="auth-signin-label">Sign In</span>';
        btn.title = 'Sign in to Nexia';
    }
}

function updateAuthButton() {
    if (_authBtn) updateAuthButtonContent(_authBtn);
}

function toggleDropdown() {
    if (_authDropdown) { _authDropdown.remove(); _authDropdown = null; return; }
    const user = auth.getUser();

    _authDropdown = document.createElement('div');
    _authDropdown.className = 'auth-dropdown';

    if (user) {
        _authDropdown.innerHTML = `
            <div class="auth-dropdown-header">
                <div class="auth-avatar-lg" style="background:${getRoleColor(user.role)}">${getInitials(user)}</div>
                <div>
                    <div class="auth-dropdown-name">${escHtml(user.username)}</div>
                    <div class="auth-dropdown-email">${escHtml(user.email)}</div>
                    <div class="auth-dropdown-role" style="color:${getRoleColor(user.role)}">${user.role.toUpperCase()}</div>
                </div>
            </div>
            <div class="auth-dropdown-sep"></div>
            <div class="auth-dropdown-item auth-dropdown-danger" id="auth-dd-logout">↪ Sign Out</div>`;

        _authDropdown.querySelector('#auth-dd-logout')!.addEventListener('click', () => {
            closeDropdown(); auth.logout();
        });
    } else {
        _authDropdown.innerHTML = `
            <div class="auth-dropdown-item" id="auth-dd-login">↪ Sign In</div>
            <div class="auth-dropdown-item" id="auth-dd-register">✦ Create Account</div>`;

        _authDropdown.querySelector('#auth-dd-login')!.addEventListener('click', () => {
            closeDropdown(); showModal('login');
        });
        _authDropdown.querySelector('#auth-dd-register')!.addEventListener('click', () => {
            closeDropdown(); showModal('register');
        });
    }

    document.body.appendChild(_authDropdown);
    positionDropdown();

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', closeDropdownOnOutside);
    }, 10);
}

function positionDropdown() {
    if (!_authDropdown || !_authBtn) return;
    const rect = _authBtn.getBoundingClientRect();
    _authDropdown.style.top = (rect.bottom + 4) + 'px';
    _authDropdown.style.right = (window.innerWidth - rect.right) + 'px';
}

function closeDropdown() {
    if (_authDropdown) { _authDropdown.remove(); _authDropdown = null; }
    document.removeEventListener('click', closeDropdownOnOutside);
}

function closeDropdownOnOutside(e: MouseEvent) {
    if (_authDropdown && !_authDropdown.contains(e.target as Node) && !_authBtn?.contains(e.target as Node)) {
        closeDropdown();
    }
}

// ══════════════════════════════════════
//  PUBLIC API
// ══════════════════════════════════════

/**
 * Initialize the auth UI.
 * Inserts the account button into the titlebar, loads stored session,
 * and subscribes to auth state changes.
 *
 * @param titlebarContainer - The DOM element to append the auth button to (e.g. the titlebar-controls div)
 * @param onAdminChange - Called when admin status changes (to show/hide admin panel tab)
 */
export async function init(
    titlebarContainer: HTMLElement,
    onAdminChange?: (isAdmin: boolean) => void
): Promise<NexiaUser | null> {
    _onAdminStateChange = onAdminChange || null;

    // Create and insert the auth button
    _authBtn = createAuthButton();
    // Insert before the window control buttons if possible
    const firstChild = titlebarContainer.firstChild;
    if (firstChild) {
        titlebarContainer.insertBefore(_authBtn, firstChild);
    } else {
        titlebarContainer.appendChild(_authBtn);
    }

    // Subscribe to auth state changes
    auth.onAuthStateChange((user) => {
        updateAuthButton();
        if (_onAdminStateChange) {
            _onAdminStateChange(user?.role === 'admin');
        }
    });

    // Initialize auth (loads stored token, validates)
    const user = await auth.init();

    // Trigger initial admin state
    if (_onAdminStateChange) {
        _onAdminStateChange(user?.role === 'admin');
    }

    return user;
}

/** Show the login modal programmatically. */
export function showLogin() { showModal('login'); }

/** Show the register modal programmatically. */
export function showRegister() { showModal('register'); }


