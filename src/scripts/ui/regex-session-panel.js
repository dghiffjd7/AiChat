/**
 * Regex panel (Session scoped)
 * - Only applies in the current chat session
 */
import { RegexStore, regex_placement } from '../storage/regex-store.js';
import { logger } from '../utils/logger.js';
import { translateUiText } from '../i18n/index.js';
import { bindCustomSelectButton, closeCustomSelectMenu } from './custom-select.js';
import {
    downloadJsonFile,
    flattenRegexImportRules,
    genRegexId,
    normalizeRegexScript,
    parseRegexImportText,
    pickJsonFileText,
} from '../utils/regex-transfer.js';

const placementLabels = {
    [regex_placement.USER_INPUT]: '用户输入',
    [regex_placement.AI_OUTPUT]: 'AI输出',
    [regex_placement.SLASH_COMMAND]: 'Slash',
    [regex_placement.WORLD_INFO]: '世界书',
    [regex_placement.REASONING]: '推理',
};

const RULE_CARD_STYLE = 'border:1px solid var(--app-border-default); border-radius:14px; background:var(--app-surface-card); overflow:hidden;';
const RULE_HEADER_STYLE = 'display:flex; align-items:center; justify-content:space-between; gap:10px; padding:11px 13px; background:var(--app-surface-card); border-bottom:1px solid var(--app-border-subtle); cursor:pointer;';
const SECTION_BOX_STYLE = 'flex:1; min-width:260px; border:1px solid var(--app-border-subtle); border-radius:12px; padding:12px; background:var(--app-surface-subtle);';
const DANGER_BUTTON_STYLE = 'padding:6px 10px; border:1px solid var(--app-danger-border); border-radius:9px; background:var(--app-danger-soft); color:var(--app-danger-text); cursor:pointer; font-size:12px; font-weight:700;';
const REGEX_SESSION_PANEL_STYLE_ID = 'regex-session-panel-polish-style';
const REGEX_SESSION_PANEL_MOTION_MS = 220;
const REGEX_SESSION_RULE_MOTION_MS = 250;

const regexSessionIcons = {
    mark: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>
        </svg>
    `,
    close: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m7 7 10 10M17 7 7 17"/>
        </svg>
    `,
    session: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 8h10M7 12h7M6 19l-2 2v-4a8 8 0 1 1 3 2z"/>
        </svg>
    `,
    empty: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 3h8l4 4v14H4V3h4zM14 3v5h6M8 13h8M8 17h5"/>
        </svg>
    `,
};

const isRegexSessionMotionReduced = () => {
    if (typeof document !== 'undefined' && document.body?.dataset?.reducedMotion === 'on') return true;
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
};

const playRegexSessionMotionClass = (element, className, duration) => {
    if (!element) return Promise.resolve();
    if (isRegexSessionMotionReduced()) {
        element.classList.remove(className);
        return Promise.resolve();
    }
    if (element.classList.contains(className)) {
        element.classList.remove(className);
        void element.offsetWidth;
    }
    element.classList.add(className);
    return new Promise((resolve) => {
        let settled = false;
        let timer = null;
        const finish = () => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            element.removeEventListener?.('animationend', onAnimationEnd);
            element.classList.remove(className);
            resolve();
        };
        const onAnimationEnd = (event) => {
            if (event.target === element) finish();
        };
        element.addEventListener?.('animationend', onAnimationEnd);
        timer = setTimeout(finish, duration + 80);
    });
};

const ensureRegexSessionPanelStyles = () => {
    if (typeof document === 'undefined') return;
    if (document.getElementById(REGEX_SESSION_PANEL_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = REGEX_SESSION_PANEL_STYLE_ID;
    style.textContent = `
        #regex-session-overlay {
            display: none;
            position: fixed;
            inset: 0;
            z-index: 20000;
            background: var(--app-surface-overlay);
            opacity: 0;
            backdrop-filter: blur(7px);
            -webkit-backdrop-filter: blur(7px);
            transition: opacity 180ms ease;
        }
        #regex-session-overlay.is-visible {
            opacity: 1;
        }
        #regex-session-panel {
            display: none;
            position: fixed;
            z-index: 21000;
            top: 50%;
            left: 50%;
            width: min(1180px, 94vw);
            height: min(820px, 92dvh);
            color: var(--app-text-primary);
            font-family: "Inter", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif;
            opacity: 0;
            transform: translate3d(-50%, calc(-50% + 14px), 0) scale(0.985);
            transform-origin: center;
            transition: opacity 180ms ease, transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        #regex-session-panel.is-visible {
            opacity: 1;
            transform: translate3d(-50%, -50%, 0) scale(1);
        }
        #regex-session-panel .regex-session-modal {
            height: 100%;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            border: 1px solid var(--app-border-default);
            border-radius: 20px;
            background: var(--app-surface-panel);
            box-shadow: 0 28px 72px rgba(15, 23, 42, 0.28);
        }
        #regex-session-panel .regex-session-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            flex: 0 0 auto;
            padding: 16px 18px;
            border-bottom: 1px solid var(--app-border-subtle);
            background: var(--app-surface-topbar);
        }
        #regex-session-panel .regex-session-heading {
            display: flex;
            align-items: center;
            gap: 13px;
            min-width: 0;
        }
        #regex-session-panel .regex-session-title-icon {
            width: 44px;
            height: 44px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 auto;
            border-radius: 14px;
            color: var(--app-text-on-accent);
            background: linear-gradient(135deg, #6366f1, #a855f7);
            box-shadow: 0 8px 20px rgba(99, 102, 241, 0.28), 0 0 0 4px rgba(99, 102, 241, 0.10);
        }
        #regex-session-panel .regex-session-title-icon svg {
            width: 23px;
            height: 23px;
            fill: none;
            stroke: currentColor;
            stroke-width: 2;
            stroke-linecap: round;
        }
        #regex-session-panel .regex-session-title {
            margin: 0;
            color: var(--app-text-primary);
            font-size: 18px;
            font-weight: 850;
            line-height: 1.2;
        }
        #regex-session-panel .regex-session-subtitle {
            margin-top: 4px;
            overflow: hidden;
            color: var(--app-text-muted);
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.055em;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        #regex-session-panel .regex-session-header-actions {
            display: flex;
            align-items: center;
            gap: 10px;
            flex: 0 0 auto;
        }
        #regex-session-panel .regex-session-runtime-status {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            padding: 7px 11px;
            border: 1px solid rgba(16, 185, 129, 0.24);
            border-radius: 999px;
            background: rgba(16, 185, 129, 0.08);
            color: #047857;
            font-size: 12px;
            font-weight: 800;
        }
        #regex-session-panel .regex-session-runtime-dot {
            width: 8px;
            height: 8px;
            border-radius: 999px;
            background: #10b981;
            box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.13);
        }
        #regex-session-panel .regex-session-close {
            width: 42px;
            height: 42px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            border: 1px solid var(--app-border-default);
            border-radius: 13px;
            background: var(--app-surface-card);
            color: var(--app-text-muted);
            cursor: pointer;
            transition: color 150ms ease, border-color 150ms ease, background 150ms ease, transform 120ms ease;
        }
        #regex-session-panel .regex-session-close:hover {
            border-color: var(--app-border-strong);
            background: var(--app-surface-hover);
            color: var(--app-text-primary);
        }
        #regex-session-panel .regex-session-close:active {
            transform: scale(0.94);
        }
        #regex-session-panel .regex-session-close svg {
            width: 20px;
            height: 20px;
            fill: none;
            stroke: currentColor;
            stroke-width: 2;
            stroke-linecap: round;
        }
        #regex-session-panel .regex-session-content {
            flex: 1;
            min-height: 0;
            overflow: auto;
            padding: 18px;
            background: color-mix(in srgb, var(--app-surface-subtle) 72%, transparent);
            -webkit-overflow-scrolling: touch;
        }
        #regex-session-panel .regex-session-editor-head {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 14px 15px;
            border: 1px solid var(--app-border-default);
            border-radius: 15px;
            background: var(--app-surface-card);
            box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
        }
        #regex-session-panel .regex-session-editor-title-row {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
        }
        #regex-session-panel .regex-session-editor-heading {
            display: flex;
            align-items: center;
            gap: 9px;
            min-width: 0;
        }
        #regex-session-panel .regex-session-status-dot {
            width: 9px;
            height: 9px;
            flex: 0 0 auto;
            border-radius: 999px;
            background: var(--regex-session-state-color, #10b981);
            box-shadow: 0 0 0 4px var(--regex-session-state-glow, rgba(16, 185, 129, 0.14));
        }
        #regex-session-panel .regex-session-editor-title {
            color: var(--app-text-primary);
            font-size: 16px;
            font-weight: 850;
        }
        #regex-session-panel .regex-session-editor-sub {
            margin-top: 4px;
            color: var(--app-text-muted);
            font-size: 12px;
        }
        #regex-session-panel .regex-session-actions {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 8px;
            flex-wrap: wrap;
        }
        #regex-session-panel .regex-session-btn {
            min-height: 36px;
            padding: 8px 11px;
            border: 1px solid var(--app-border-default);
            border-radius: 10px;
            background: var(--app-surface-card);
            color: var(--app-text-primary);
            cursor: pointer;
            font-size: 13px;
            font-weight: 750;
            white-space: nowrap;
            transition: transform 120ms ease, border-color 150ms ease, background 150ms ease, box-shadow 150ms ease;
        }
        #regex-session-panel .regex-session-btn:hover {
            border-color: var(--app-border-strong);
            background: var(--app-surface-hover);
            box-shadow: 0 5px 14px rgba(15, 23, 42, 0.07);
        }
        #regex-session-panel .regex-session-btn:active {
            transform: scale(0.96);
        }
        #regex-session-panel .regex-session-btn-primary {
            border-color: transparent;
            background: var(--app-accent-primary);
            color: var(--app-text-on-accent);
            box-shadow: 0 6px 14px rgba(var(--app-accent-rgb), 0.22);
        }
        #regex-session-panel .regex-session-editor-meta {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            flex-wrap: wrap;
        }
        #regex-session-panel .regex-session-inline-toggle {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            color: var(--app-text-secondary);
            cursor: pointer;
            font-size: 13px;
            font-weight: 750;
        }
        #regex-session-panel .regex-session-scope-chip {
            min-width: 0;
            display: inline-flex;
            align-items: center;
            gap: 7px;
            max-width: min(52vw, 520px);
            padding: 6px 9px;
            border: 1px solid var(--app-border-subtle);
            border-radius: 999px;
            background: var(--app-surface-subtle);
            color: var(--app-text-muted);
            font-size: 11px;
            font-weight: 700;
        }
        #regex-session-panel .regex-session-scope-chip svg {
            width: 14px;
            height: 14px;
            flex: 0 0 auto;
            fill: none;
            stroke: currentColor;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        #regex-session-panel #re-session-sub {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        #regex-session-panel .regex-session-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-top: 12px;
        }
        #regex-session-panel .regex-rule {
            transition: border-color 200ms ease, box-shadow 200ms ease, opacity 200ms ease;
        }
        #regex-session-panel .regex-rule[data-collapsed='false'] {
            border-color: rgba(99, 102, 241, 0.40) !important;
            box-shadow: 0 10px 28px -16px rgba(15, 23, 42, 0.28);
        }
        #regex-session-panel .regex-rule.is-disabled {
            opacity: 0.62;
        }
        #regex-session-panel .re-header:hover {
            background: var(--app-surface-hover) !important;
        }
        #regex-session-panel .re-header:focus-visible {
            outline: 2px solid var(--app-accent-primary);
            outline-offset: -2px;
        }
        #regex-session-panel .re-toggle {
            width: 18px;
            height: 18px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 auto;
            color: var(--app-text-muted);
        }
        #regex-session-panel .re-toggle svg {
            width: 16px;
            height: 16px;
            fill: none;
            stroke: currentColor;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
            transition: transform 200ms ease;
        }
        #regex-session-panel .regex-rule[data-collapsed='false'] .re-toggle svg {
            transform: rotate(90deg);
        }
        #regex-session-panel .re-body {
            display: grid;
            grid-template-rows: 0fr;
            overflow: hidden;
            padding: 0;
            opacity: 0;
            transition: grid-template-rows 300ms cubic-bezier(0.32, 0.72, 0, 1), opacity 200ms ease;
        }
        #regex-session-panel .regex-rule[data-collapsed='false'] .re-body {
            grid-template-rows: 1fr;
            opacity: 1;
        }
        #regex-session-panel .re-body-inner {
            min-height: 0;
            overflow: hidden;
            padding: 0 12px;
            transition: padding-block 300ms cubic-bezier(0.32, 0.72, 0, 1);
        }
        #regex-session-panel .regex-rule[data-collapsed='false'] .re-body-inner {
            padding-block: 12px;
        }
        #regex-session-panel .regex-rule.is-rule-entering {
            animation: regex-session-rule-in 250ms ease both;
        }
        #regex-session-panel .regex-rule.is-rule-leaving {
            animation: regex-session-rule-out 250ms ease both;
            pointer-events: none;
        }
        #regex-session-panel input:not([type='checkbox']):not([type='radio']),
        #regex-session-panel textarea,
        #regex-session-panel select,
        #regex-session-panel .world-app-select-btn {
            box-sizing: border-box;
            background: var(--app-surface-card);
            color: var(--app-text-primary);
            border-color: var(--app-border-default) !important;
            outline: none;
            transition: border-color 150ms ease, box-shadow 150ms ease, background 150ms ease;
        }
        #regex-session-panel input:not([type='checkbox']):not([type='radio']):focus,
        #regex-session-panel textarea:focus,
        #regex-session-panel .world-app-select-btn:focus-visible {
            border-color: var(--app-accent-primary) !important;
            box-shadow: 0 0 0 3px var(--app-accent-soft);
        }
        #regex-session-panel input[type='checkbox'] {
            width: 18px !important;
            height: 18px !important;
            display: inline-grid;
            flex: 0 0 auto;
            appearance: none;
            -webkit-appearance: none;
            place-content: center;
            border: 1px solid var(--app-border-strong);
            border-radius: 6px;
            background: var(--app-surface-card);
            cursor: pointer;
            transition: transform 120ms ease, border-color 180ms ease, background 180ms ease, box-shadow 180ms ease;
        }
        #regex-session-panel input[type='checkbox']::before {
            content: '';
            box-sizing: content-box;
            width: 5px;
            height: 9px;
            margin-top: -2px;
            border: solid var(--app-text-on-accent);
            border-width: 0 2.5px 2.5px 0;
            opacity: 0;
            filter: drop-shadow(0 1px 1px rgba(15, 23, 42, 0.25));
            transform: rotate(45deg) scale(0.3);
            transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 140ms ease;
        }
        #regex-session-panel input[type='checkbox']:checked {
            border-color: #4f46e5;
            background: #4f46e5;
            box-shadow: 0 3px 7px -1px rgba(79, 70, 229, 0.45);
        }
        #regex-session-panel input[type='checkbox']:checked::before {
            opacity: 1;
            transform: rotate(45deg) scale(1);
        }
        #regex-session-panel input[type='checkbox']:active {
            transform: scale(0.88);
        }
        #regex-session-panel .re-del:hover {
            filter: saturate(1.08);
            box-shadow: 0 4px 10px var(--app-danger-soft);
        }
        #regex-session-panel .regex-session-empty {
            margin-top: 12px;
            min-height: 220px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 9px;
            padding: 28px 18px;
            border: 1px dashed var(--app-border-default);
            border-radius: 15px;
            background: color-mix(in srgb, var(--app-surface-card) 72%, transparent);
            text-align: center;
        }
        #regex-session-panel .regex-session-empty[hidden] {
            display: none;
        }
        #regex-session-panel .regex-session-empty-icon {
            width: 48px;
            height: 48px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 15px;
            background: rgba(99, 102, 241, 0.10);
            color: #6366f1;
        }
        #regex-session-panel .regex-session-empty-icon svg {
            width: 24px;
            height: 24px;
            fill: none;
            stroke: currentColor;
            stroke-width: 1.8;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        #regex-session-panel .regex-session-empty-title {
            color: var(--app-text-primary);
            font-size: 14px;
            font-weight: 850;
        }
        #regex-session-panel .regex-session-empty-description {
            max-width: 420px;
            color: var(--app-text-muted);
            font-size: 12px;
            line-height: 1.65;
        }
        #regex-session-panel .regex-session-status {
            display: none;
            margin-top: 12px;
            padding: 10px 12px;
            border: 1px solid var(--app-border-subtle);
            border-radius: 11px;
            font-size: 13px;
            font-weight: 700;
        }
        #regex-session-panel .regex-session-status[data-type='success'] {
            border-color: rgba(16, 185, 129, 0.22);
            background: rgba(16, 185, 129, 0.10);
            color: #047857;
        }
        #regex-session-panel .regex-session-status[data-type='error'] {
            border-color: var(--app-danger-border);
            background: var(--app-danger-soft);
            color: var(--app-danger-text);
        }
        #regex-session-panel .regex-session-status[data-type='info'] {
            border-color: rgba(var(--app-accent-rgb), 0.20);
            background: var(--app-accent-soft);
            color: var(--app-accent-strong);
        }
        #regex-session-panel .regex-session-footer {
            flex: 0 0 auto;
            padding: 9px 18px 11px;
            border-top: 1px solid var(--app-border-subtle);
            background: var(--app-surface-topbar);
            color: var(--app-text-muted);
            font-size: 11px;
            text-align: center;
        }
        @keyframes regex-session-rule-in {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes regex-session-rule-out {
            from { height: var(--regex-rule-exit-height); opacity: 1; margin-top: 0; }
            to { height: 0; opacity: 0; margin-top: -10px; }
        }
        @media (max-width: 720px) {
            #regex-session-panel {
                top: calc(8px + env(safe-area-inset-top, 0px));
                right: calc(8px + env(safe-area-inset-right, 0px));
                bottom: calc(8px + env(safe-area-inset-bottom, 0px));
                left: calc(8px + env(safe-area-inset-left, 0px));
                width: auto;
                height: calc(var(--app-visual-height, 100dvh) - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 16px);
                transform: translate3d(0, 16px, 0) scale(0.985);
            }
            #regex-session-panel.is-visible {
                transform: none;
            }
            #regex-session-panel .regex-session-modal {
                border-radius: 16px;
            }
            #regex-session-panel .regex-session-header {
                padding: 12px;
            }
            #regex-session-panel .regex-session-title-icon {
                width: 40px;
                height: 40px;
                border-radius: 13px;
            }
            #regex-session-panel .regex-session-title {
                font-size: 16px;
            }
            #regex-session-panel .regex-session-subtitle {
                max-width: 48vw;
                font-size: 10px;
            }
            #regex-session-panel .regex-session-runtime-status {
                display: none;
            }
            #regex-session-panel .regex-session-close {
                width: 44px;
                height: 44px;
            }
            #regex-session-panel .regex-session-content {
                padding: 10px;
            }
            #regex-session-panel .regex-session-editor-head {
                padding: 12px;
                border-radius: 13px;
            }
            #regex-session-panel .regex-session-editor-title-row {
                flex-direction: column;
                align-items: stretch;
            }
            #regex-session-panel .regex-session-actions {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                width: 100%;
            }
            #regex-session-panel .regex-session-btn {
                min-height: 40px;
            }
            #regex-session-panel .regex-session-editor-meta {
                align-items: flex-start;
            }
            #regex-session-panel .regex-session-scope-chip {
                max-width: 100%;
            }
            #regex-session-panel .re-header {
                align-items: flex-start !important;
            }
            #regex-session-panel .regex-session-footer {
                display: none;
            }
        }
        @media (max-width: 430px) {
            #regex-session-panel .regex-session-editor-meta {
                flex-direction: column;
            }
            #regex-session-panel .regex-session-actions {
                grid-template-columns: 1fr 1fr;
            }
            #regex-session-panel .re-header {
                flex-wrap: wrap;
            }
        }
        body[data-theme-mode='dark'] #regex-session-panel .regex-session-runtime-status,
        body[data-theme-mode='dark'] #regex-session-panel .regex-session-status[data-type='success'] {
            color: #6ee7b7;
        }
        body[data-reduced-motion='on'] #regex-session-overlay,
        body[data-reduced-motion='on'] #regex-session-panel,
        body[data-reduced-motion='on'] #regex-session-panel *,
        body[data-reduced-motion='on'] #regex-session-panel *::before,
        body[data-reduced-motion='on'] #regex-session-panel *::after {
            animation: none !important;
            transition: none !important;
        }
        @media (prefers-reduced-motion: reduce) {
            #regex-session-overlay,
            #regex-session-panel,
            #regex-session-panel *,
            #regex-session-panel *::before,
            #regex-session-panel *::after {
                animation: none !important;
                transition: none !important;
            }
        }
    `;
    document.head.appendChild(style);
};

export class RegexSessionPanel {
    constructor(getSessionId, { store = null } = {}) {
        this.store = store || new RegexStore();
        this.getSessionId = typeof getSessionId === 'function' ? getSessionId : () => 'default';
        this.element = null;
        this.overlay = null;
        this.statusEl = null;
        this.visibilityTimer = null;
        this.visibilityToken = 0;
        this.statusTimer = null;
    }

    async show() {
        await this.store.ready;
        if (!this.element) this.createUI();
        await this.refresh();
        clearTimeout(this.visibilityTimer);
        const visibilityToken = ++this.visibilityToken;
        this.overlay.style.display = 'block';
        this.element.style.display = 'block';
        this.overlay.setAttribute('aria-hidden', 'false');
        this.element.setAttribute('aria-hidden', 'false');
        const reveal = () => {
            if (visibilityToken !== this.visibilityToken) return;
            this.overlay?.classList.add('is-visible');
            this.element?.classList.add('is-visible');
        };
        if (isRegexSessionMotionReduced()) reveal();
        else requestAnimationFrame(reveal);
    }

    hide() {
        closeCustomSelectMenu();
        clearTimeout(this.visibilityTimer);
        const visibilityToken = ++this.visibilityToken;
        this.overlay?.classList.remove('is-visible');
        this.element?.classList.remove('is-visible');
        this.overlay?.setAttribute('aria-hidden', 'true');
        this.element?.setAttribute('aria-hidden', 'true');
        const finish = () => {
            if (visibilityToken !== this.visibilityToken) return;
            if (this.element && !this.element.classList.contains('is-visible')) this.element.style.display = 'none';
            if (this.overlay && !this.overlay.classList.contains('is-visible')) this.overlay.style.display = 'none';
        };
        if (isRegexSessionMotionReduced()) finish();
        else this.visibilityTimer = setTimeout(finish, REGEX_SESSION_PANEL_MOTION_MS);
    }

    createUI() {
        ensureRegexSessionPanelStyles();
        this.overlay = document.createElement('div');
        this.overlay.id = 'regex-session-overlay';
        this.overlay.className = 'app-themed-overlay regex-session-overlay';
        this.overlay.setAttribute('aria-hidden', 'true');
        this.overlay.onclick = () => this.hide();

        this.element = document.createElement('div');
        this.element.id = 'regex-session-panel';
        this.element.className = 'app-themed-panel regex-session-panel';
        this.element.setAttribute('role', 'dialog');
        this.element.setAttribute('aria-modal', 'true');
        this.element.setAttribute('aria-labelledby', 'regex-session-title');
        this.element.setAttribute('aria-hidden', 'true');
        this.element.onclick = (e) => e.stopPropagation();

        this.element.innerHTML = `
            <div class="regex-session-modal">
                <header class="regex-session-header">
                    <div class="regex-session-heading">
                        <span class="regex-session-title-icon">${regexSessionIcons.mark}</span>
                        <div style="min-width:0;">
                            <h2 id="regex-session-title" class="regex-session-title">聊天室正则</h2>
                            <div class="regex-session-subtitle">SESSION REGEX · 当前聊天室</div>
                        </div>
                    </div>
                    <div class="regex-session-header-actions">
                        <span class="regex-session-runtime-status">
                            <span class="regex-session-runtime-dot"></span>
                            独立作用域
                        </span>
                        <button id="re-session-close" class="regex-session-close" type="button" aria-label="关闭聊天室正则">
                            ${regexSessionIcons.close}
                        </button>
                    </div>
                </header>

                <main id="re-session-scroll" class="regex-session-content">
                    <section class="regex-session-editor-head">
                        <div class="regex-session-editor-title-row">
                            <div style="min-width:0; flex:1;">
                                <div class="regex-session-editor-heading">
                                    <span id="re-session-state-dot" class="regex-session-status-dot"></span>
                                    <div class="regex-session-editor-title">本聊天室正则</div>
                                </div>
                                <div id="re-session-summary" class="regex-session-editor-sub">0/0 条规则启用 · 仅影响当前会话</div>
                            </div>
                            <div class="regex-session-actions">
                                <button type="button" id="re-session-import" class="regex-session-btn">导入</button>
                                <button type="button" id="re-session-export" class="regex-session-btn">导出</button>
                                <button type="button" id="re-session-add" class="regex-session-btn">＋ 新增规则</button>
                                <button type="button" id="re-session-save" class="regex-session-btn regex-session-btn-primary">保存</button>
                            </div>
                        </div>
                        <div class="regex-session-editor-meta">
                            <label class="regex-session-inline-toggle has-help" data-help="关闭后，本聊天室的全部正则规则都不会执行。" data-help-mode="press">
                                <input id="re-session-enabled" type="checkbox">
                                启用本聊天室正则
                            </label>
                            <div class="regex-session-scope-chip" title="当前会话标识">
                                ${regexSessionIcons.session}
                                <span id="re-session-sub"></span>
                            </div>
                        </div>
                    </section>

                    <div id="re-session-list" class="regex-session-list"></div>
                    <div id="re-session-empty" class="regex-session-empty" hidden>
                        <span class="regex-session-empty-icon">${regexSessionIcons.empty}</span>
                        <div class="regex-session-empty-title">这个聊天室还没有正则规则</div>
                        <div class="regex-session-empty-description">新增规则后，它只会作用于当前聊天室，不影响全局、角色或其他会话。</div>
                        <button type="button" id="re-session-empty-add" class="regex-session-btn">＋ 新增第一条规则</button>
                    </div>
                    <div id="re-session-status" class="regex-session-status" role="status" aria-live="polite"></div>
                </main>

                <footer class="regex-session-footer">聊天室正则 · 保存后即时生效，作用域与其他扩展规则彼此独立</footer>
            </div>
        `;

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.element);

        this.statusEl = this.element.querySelector('#re-session-status');
        this.element.querySelector('#re-session-close').onclick = () => this.hide();
        const addRule = () => this.addRule();
        this.element.querySelector('#re-session-add').onclick = addRule;
        this.element.querySelector('#re-session-empty-add').onclick = addRule;
        this.element.querySelector('#re-session-import').onclick = async () => this.importRules();
        this.element.querySelector('#re-session-export').onclick = async () => this.exportRules();
        this.element.querySelector('#re-session-save').onclick = async () => this.save();
        this.element.querySelector('#re-session-enabled').addEventListener('change', () => this.updateEditorSummary());
    }

    addRule() {
        const list = this.element?.querySelector('#re-session-list');
        if (!list) return;
        const card = this.renderRuleCard({
            placement: [regex_placement.USER_INPUT],
            markdownOnly: true,
            runOnEdit: true,
            disabled: false,
        }, { initiallyExpanded: true });
        list.appendChild(card);
        this.animateRuleCardIn(card);
        this.updateEditorSummary();
    }

    updateEditorSummary() {
        if (!this.element) return;
        const cards = Array.from(this.element.querySelectorAll('#re-session-list .regex-rule:not([data-removing="true"])'));
        const total = cards.length;
        const enabled = cards.filter(card => card.querySelector('.re-disabled')?.checked !== true).length;
        const scopeEnabled = this.element.querySelector('#re-session-enabled')?.checked !== false;
        const summary = this.element.querySelector('#re-session-summary');
        const stateDot = this.element.querySelector('#re-session-state-dot');
        const empty = this.element.querySelector('#re-session-empty');
        if (summary) {
            summary.textContent = `${enabled}/${total} 条规则启用 · ${scopeEnabled ? '仅影响当前会话' : '当前会话规则已暂停'}`;
        }
        if (stateDot) {
            stateDot.style.setProperty('--regex-session-state-color', scopeEnabled ? '#10b981' : '#ef4444');
            stateDot.style.setProperty('--regex-session-state-glow', scopeEnabled ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.14)');
        }
        if (empty) empty.hidden = total > 0;
    }

    animateRuleCardIn(card) {
        const start = () => {
            void playRegexSessionMotionClass(card, 'is-rule-entering', REGEX_SESSION_RULE_MOTION_MS);
        };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(start);
        else start();
    }

    async removeRuleCard(card) {
        if (!card || card.dataset.removing === 'true') return;
        card.dataset.removing = 'true';
        card.style.setProperty('--regex-rule-exit-height', `${Math.max(0, card.offsetHeight || 0)}px`);
        await playRegexSessionMotionClass(card, 'is-rule-leaving', REGEX_SESSION_RULE_MOTION_MS);
        card.remove();
        this.updateEditorSummary();
    }

    showStatus(message, type = 'info') {
        const el = this.statusEl;
        if (!el) return;
        clearTimeout(this.statusTimer);
        const normalizedType = ['success', 'error', 'info'].includes(type) ? type : 'info';
        el.style.display = 'block';
        el.dataset.type = normalizedType;
        el.textContent = message;
        this.statusTimer = setTimeout(() => {
            try { el.style.display = 'none'; } catch {}
        }, 2200);
    }

    renderRuleCard(rule, { initiallyExpanded = false } = {}) {
        const r = normalizeRegexScript(rule);
        const card = document.createElement('div');
        card.className = 'regex-rule';
        card.dataset.ruleId = r.id;
        card.dataset.collapsed = 'true';
        card.style.cssText = RULE_CARD_STYLE;

        const header = document.createElement('div');
        header.className = 're-header';
        header.style.cssText = RULE_HEADER_STYLE;

        const left = document.createElement('div');
        left.style.cssText = 'display:flex; align-items:center; gap:10px; min-width:0;';
        left.innerHTML = `
            <span class="re-toggle" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
            </span>
            <div style="min-width:0;">
                <div class="re-title" style="font-weight:800; color:var(--app-text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                <div class="re-sub" style="color:var(--app-text-muted); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
            </div>
        `;
        header.appendChild(left);

        const right = document.createElement('div');
        right.style.cssText = 'display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end;';
        const enabledWrap = document.createElement('label');
        enabledWrap.className = 'regex-session-rule-toggle';
        enabledWrap.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:12px; color:var(--app-text-secondary); cursor:pointer;';
        enabledWrap.innerHTML = `<input type="checkbox" class="re-enabled" style="width:16px; height:16px;">启用`;
        right.appendChild(enabledWrap);
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 're-del';
        del.textContent = '删除';
        del.style.cssText = DANGER_BUTTON_STYLE;
        right.appendChild(del);
        header.appendChild(right);

        const body = document.createElement('div');
        body.className = 're-body';
        body.style.cssText = 'display:grid; padding:0;';
        body.innerHTML = `
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <div style="flex:1; min-width: 220px;">
                    <div style="font-weight:700; color:var(--app-text-primary); margin-bottom:6px;">脚本名称</div>
                    <input class="re-name" style="width:100%; padding:10px; border:1px solid var(--app-border-default); border-radius:10px; font-size:13px;">
                </div>
                <div style="flex:1; min-width: 280px;">
                    <div style="font-weight:700; color:var(--app-text-primary); margin-bottom:6px;">Find Regex</div>
                    <input class="re-find" spellcheck="false" style="width:100%; padding:10px; border:1px solid var(--app-border-default); border-radius:10px; font-size:13px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">
                </div>
            </div>

            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
                <div style="flex:1; min-width: 260px;">
                    <div class="has-help" data-help="支持 {{match}}、$1/$2…、$&lt;name&gt;。" style="font-weight:700; color:var(--app-text-primary); margin-bottom:6px;">Replace With</div>
                    <textarea class="re-repl" rows="3" spellcheck="false" style="width:100%; padding:10px; border:1px solid var(--app-border-default); border-radius:10px; font-size:13px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;"></textarea>
                </div>
                <div style="flex:1; min-width: 260px;">
                    <div style="font-weight:700; color:var(--app-text-primary); margin-bottom:6px;">Trim Out（每行一个）</div>
                    <textarea class="re-trim" rows="3" spellcheck="false" style="width:100%; padding:10px; border:1px solid var(--app-border-default); border-radius:10px; font-size:13px;"></textarea>
                </div>
            </div>

            <div style="display:flex; gap:14px; flex-wrap:wrap; margin-top:12px;">
                <div style="${SECTION_BOX_STYLE}">
                    <div style="font-weight:800; color:var(--app-text-primary); margin-bottom:8px;">影响条目（Affects）</div>
                    <div style="display:flex; gap:12px; flex-wrap:wrap; color:var(--app-text-secondary); font-size:13px;">
                        <label style="display:flex; gap:6px; align-items:center; cursor:pointer;"><input type="checkbox" class="re-place" value="1">用户输入</label>
                        <label style="display:flex; gap:6px; align-items:center; cursor:pointer;"><input type="checkbox" class="re-place" value="2">AI输出</label>
                        <label style="display:flex; gap:6px; align-items:center; cursor:pointer;"><input type="checkbox" class="re-place" value="3">Slash</label>
                        <label style="display:flex; gap:6px; align-items:center; cursor:pointer;"><input type="checkbox" class="re-place" value="5">世界书</label>
                        <label style="display:flex; gap:6px; align-items:center; cursor:pointer;"><input type="checkbox" class="re-place" value="6">推理</label>
                    </div>
                    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px; align-items:center;">
                        <div class="has-help" data-help="0=最后一条，1=倒数第二条…" style="font-size:13px; color:var(--app-text-secondary); font-weight:700;">深度</div>
                        <input class="re-min-depth" type="number" min="-1" max="9999" placeholder="Min" style="width:120px; padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">
                        <input class="re-max-depth" type="number" min="0" max="9999" placeholder="Max" style="width:120px; padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">
                    </div>
                </div>

                <div style="${SECTION_BOX_STYLE}">
                    <div style="font-weight:800; color:var(--app-text-primary); margin-bottom:8px;">其他选项</div>
                    <div style="display:flex; flex-direction:column; gap:8px; color:var(--app-text-secondary); font-size:13px;">
                        <label style="display:flex; gap:8px; align-items:center; cursor:pointer;"><input type="checkbox" class="re-disabled">停用（Disabled）</label>
                        <label style="display:flex; gap:8px; align-items:center; cursor:pointer;"><input type="checkbox" class="re-run-on-edit">编辑消息时执行（Run On Edit）</label>
                        <label style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                            <span style="font-weight:700;">Find Regex 宏</span>
                            <select class="re-substitute" style="display:none;">
                                <option value="0">不替换</option>
                                <option value="1">替换（raw）</option>
                                <option value="2">替换（escaped）</option>
                            </select>
                            <button type="button" class="world-app-select-btn re-substitute-btn" style="min-width:170px;">
                                <span class="pp-custom-select-label" data-custom-select-label>不替换</span>
                                <span class="world-app-select-btn-chevron">▾</span>
                            </button>
                        </label>
                        <div style="margin-top:6px;">
                            <div style="font-weight:700; color:var(--app-text-primary); margin-bottom:6px;">暂时性（Ephemerality）</div>
                            <label style="display:flex; gap:8px; align-items:center; cursor:pointer; margin-bottom:6px;">
                                <input type="checkbox" class="re-md-only">仅影响聊天显示（不改存档）
                            </label>
                            <label style="display:flex; gap:8px; align-items:center; cursor:pointer;">
                                <input type="checkbox" class="re-prompt-only">仅影响发送给 LLM 的 prompt（不改存档）
                            </label>
                            <div style="color:var(--app-text-muted); font-size:12px; margin-top:6px;">两者都不勾选：将直接修改聊天存档内容（不可逆）。</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const bodyInner = document.createElement('div');
        bodyInner.className = 're-body-inner';
        while (body.firstChild) bodyInner.appendChild(body.firstChild);
        body.appendChild(bodyInner);

        const enabledInput = enabledWrap.querySelector('input');
        enabledInput.checked = !r.disabled;
        body.querySelector('.re-name').value = r.scriptName || '';
        body.querySelector('.re-find').value = r.findRegex || '';
        body.querySelector('.re-repl').value = r.replaceString ?? '';
        body.querySelector('.re-trim').value = (Array.isArray(r.trimStrings) ? r.trimStrings.join('\n') : '');
        body.querySelector('.re-disabled').checked = Boolean(r.disabled);
        body.querySelector('.re-run-on-edit').checked = Boolean(r.runOnEdit);
        body.querySelector('.re-md-only').checked = Boolean(r.markdownOnly);
        body.querySelector('.re-prompt-only').checked = Boolean(r.promptOnly);
        body.querySelector('.re-substitute').value = String(Number(r.substituteRegex ?? 0));
        bindCustomSelectButton({
            buttonEl: body.querySelector('.re-substitute-btn'),
            selectEl: body.querySelector('.re-substitute'),
            fallback: '不替换',
        });
        body.querySelector('.re-min-depth').value = (r.minDepth === null || r.minDepth === undefined || Number.isNaN(Number(r.minDepth))) ? '' : String(Number(r.minDepth));
        body.querySelector('.re-max-depth').value = (r.maxDepth === null || r.maxDepth === undefined || Number.isNaN(Number(r.maxDepth))) ? '' : String(Number(r.maxDepth));
        const placeSet = new Set((Array.isArray(r.placement) ? r.placement : []).map((n) => Number(n)).filter(Number.isFinite));
        body.querySelectorAll('.re-place').forEach((cb) => {
            cb.checked = placeSet.has(Number(cb.value));
        });

        const updateHeader = () => {
            const name = body.querySelector('.re-name')?.value?.trim();
            const find = body.querySelector('.re-find')?.value?.trim();
            const disabled = body.querySelector('.re-disabled')?.checked === true;
            const mdOnly = body.querySelector('.re-md-only')?.checked === true;
            const prOnly = body.querySelector('.re-prompt-only')?.checked === true;
            const placements = Array.from(body.querySelectorAll('.re-place')).filter(x => x.checked).map(x => Number(x.value)).filter(Number.isFinite);
            const title = name || (find ? `${find.slice(0, 36)}${find.length > 36 ? '…' : ''}` : '未命名正则');
            const affects = placements.length ? placements.map(p => placementLabels[p] || String(p)).join(' / ') : '未选择';
            const epi = `${mdOnly ? '显示' : ''}${mdOnly && prOnly ? '+' : ''}${prOnly ? 'Prompt' : ''}`;
            const sub = `${affects}${epi ? ` · ${epi}` : ''}${disabled ? ' · Disabled' : ''}`;
            left.querySelector('.re-title').textContent = title;
            left.querySelector('.re-sub').textContent = sub;
            enabledInput.checked = !disabled;
            card.classList.toggle('is-disabled', disabled);
            this.updateEditorSummary();
        };
        updateHeader();

        const setCollapsed = (collapsed) => {
            card.dataset.collapsed = collapsed ? 'true' : 'false';
            header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            body.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
            body.toggleAttribute('inert', collapsed);
        };
        header.setAttribute('role', 'button');
        header.tabIndex = 0;
        setCollapsed(!initiallyExpanded);

        header.addEventListener('click', () => {
            const collapsed = card.dataset.collapsed === 'true';
            setCollapsed(!collapsed);
        });
        header.addEventListener('keydown', (event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            const collapsed = card.dataset.collapsed === 'true';
            setCollapsed(!collapsed);
        });
        card.querySelectorAll('input,select,button').forEach(el => {
            el.addEventListener('click', (e) => e.stopPropagation());
        });
        del.addEventListener('click', (event) => {
            event.stopPropagation();
            void this.removeRuleCard(card);
        });
        enabledInput.addEventListener('change', () => {
            body.querySelector('.re-disabled').checked = !enabledInput.checked;
            updateHeader();
        });
        body.querySelectorAll('input,select,textarea').forEach(el => {
            el.addEventListener('input', updateHeader);
            el.addEventListener('change', updateHeader);
        });

        card.appendChild(header);
        card.appendChild(body);
        return card;
    }

    collectRules() {
        const root = this.element.querySelector('#re-session-list');
        const rules = [];
        root.querySelectorAll('.regex-rule:not([data-removing="true"])').forEach(el => {
            const id = el.dataset.ruleId || genRegexId('re');
            const placement = Array.from(el.querySelectorAll('.re-place'))
                .filter(cb => cb.checked)
                .map(cb => Number(cb.value))
                .filter(Number.isFinite);
            const minDepthRaw = el.querySelector('.re-min-depth')?.value;
            const maxDepthRaw = el.querySelector('.re-max-depth')?.value;
            rules.push(normalizeRegexScript({
                id,
                scriptName: el.querySelector('.re-name')?.value || '',
                findRegex: el.querySelector('.re-find')?.value || '',
                replaceString: el.querySelector('.re-repl')?.value ?? '',
                trimStrings: String(el.querySelector('.re-trim')?.value || '').split('\n').map(s => s.trim()).filter(Boolean),
                placement,
                disabled: el.querySelector('.re-disabled')?.checked === true,
                markdownOnly: el.querySelector('.re-md-only')?.checked === true,
                promptOnly: el.querySelector('.re-prompt-only')?.checked === true,
                runOnEdit: el.querySelector('.re-run-on-edit')?.checked === true,
                substituteRegex: Number(el.querySelector('.re-substitute')?.value ?? 0),
                minDepth: (minDepthRaw === '' || minDepthRaw === null || minDepthRaw === undefined) ? null : Number(minDepthRaw),
                maxDepth: (maxDepthRaw === '' || maxDepthRaw === null || maxDepthRaw === undefined) ? null : Number(maxDepthRaw),
            }));
        });
        return rules;
    }

    async refresh() {
        await this.store.ready;
        const sid = this.getSessionId();
        const sub = this.element.querySelector('#re-session-sub');
        if (sub) {
            sub.dataset.i18nSkip = '';
            sub.textContent = translateUiText(`会话：${sid}`);
            sub.parentElement?.setAttribute('title', translateUiText(`当前会话：${sid}`));
        }
        const state = this.store.getSession(sid);
        this.element.querySelector('#re-session-enabled').checked = state.enabled !== false;
        const list = this.element.querySelector('#re-session-list');
        list.innerHTML = '';
        (Array.isArray(state.rules) ? state.rules : []).forEach(r => list.appendChild(this.renderRuleCard(r)));
        this.updateEditorSummary();
    }

    async save() {
        const sid = this.getSessionId();
        if (!sid) return;
        try {
            const enabled = this.element.querySelector('#re-session-enabled')?.checked !== false;
            const rules = this.collectRules();
            await this.store.setSession(sid, { enabled, rules });
            this.showStatus('已保存', 'success');
            this.updateEditorSummary();
            window.dispatchEvent(new CustomEvent('regex-changed'));
        } catch (err) {
            logger.error('保存聊天室正则失败', err);
            this.showStatus(err.message || '保存失败', 'error');
        }
    }

    async importRules() {
        try {
            const text = await pickJsonFileText();
            if (!text) return;
            const parsed = parseRegexImportText(text);
            const rules = flattenRegexImportRules(parsed);
            if (!rules.length) { this.showStatus('未找到可导入的正则规则', 'info'); return; }
            const list = this.element.querySelector('#re-session-list');
            rules.forEach(rule => {
                const card = this.renderRuleCard(rule);
                list.appendChild(card);
                this.animateRuleCardIn(card);
            });
            this.updateEditorSummary();
            this.showStatus(`已导入 ${rules.length} 条规则（请点保存确认）`, 'success');
        } catch (err) {
            logger.error('导入聊天室正则失败', err);
            this.showStatus(err.message || '导入失败', 'error');
        }
    }

    async exportRules() {
        try {
            const rules = this.collectRules();
            if (!rules.length) { this.showStatus('没有可导出的规则', 'info'); return; }
            const sid = String(this.getSessionId() || 'session').replace(/[^a-zA-Z0-9_-]/g, '_');
            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const result = await downloadJsonFile(
                { version: 1, type: 'regex-rules', scope: 'session', sessionId: sid, rules },
                `regex-session-${sid}-${ts}.json`,
            );
            if (result?.cancelled) return;
            this.showStatus(`已导出 ${rules.length} 条规则`, 'success');
        } catch (err) {
            logger.error('导出聊天室正则失败', err);
            this.showStatus(err.message || '导出失败', 'error');
        }
    }
}
