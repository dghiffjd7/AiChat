import { buildAgentCenterView } from './agent-center-view-model.js';
import { rankModelCandidates } from '../utils/model-candidates.js';
import { findAgentCenterResource } from './agent-center-resource-contract.js';
import { WRITE_PREVIEW_PROVIDER_MODEL_CONTEXT_TOOLS } from '../agent/provider-tool-request-schema.js';
import { PROVIDER_TOOL_PERMISSION_ACTIONS } from '../agent/provider-tool-permission-actions.js';
import { appChoice, appConfirm } from './app-confirm.js';
import { bindCustomSelectButton, closeCustomSelectMenu } from './custom-select.js';
import { buildDebugTextFilename } from './debug-panel-utils.js';
import { exportDebugTextFile } from './debug-panel-export-utils.js';
import { exportDebugTextFlow } from './debug-panel-runtime-utils.js';

const STYLE_ID = 'agent-center-panel-style';

const iconSvg = (body) => `
    <svg class="agent-center-icon" viewBox="0 0 24 24" aria-hidden="true">
        ${body}
    </svg>
`;

const ICONS = Object.freeze({
    agent: iconSvg('<path d="M12 8V4"/><rect x="5" y="8" width="14" height="10" rx="4"/><path d="M9 18v2"/><path d="M15 18v2"/><path d="M9 13h.01"/><path d="M15 13h.01"/>'),
    activity: iconSvg('<path d="M4 12h4l2-6 4 12 2-6h4"/>'),
    close: iconSvg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
    export: iconSvg('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>'),
    pending: iconSvg('<path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="9"/>'),
    prompts: iconSvg('<path d="M4 5h16"/><path d="M4 9h10"/><path d="M4 15h16"/><path d="M4 19h12"/>'),
    diagnostics: iconSvg('<path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 16 4-4 3 3 5-7"/><path d="M17 8h2v2"/>'),
    refresh: iconSvg('<path d="M3 12a9 9 0 0 1 15.5-6.2"/><path d="M18 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2"/><path d="M6 21v-5h5"/>'),
    resources: iconSvg('<path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/><path d="M7 5v14"/>'),
    safety: iconSvg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-5"/>'),
});

const tabIcon = (id = '') => ({
    pending: ICONS.pending,
    agents: ICONS.agent,
    prompts: ICONS.prompts,
    diagnostics: ICONS.diagnostics,
    resources: ICONS.resources,
    activity: ICONS.activity,
    safety: ICONS.safety,
}[trim(id)] || ICONS.agent);

const PANEL_CSS = `
.agent-center-overlay {
    position: fixed;
    inset: 0;
    z-index: 22000;
    display: none;
    align-items: stretch;
    justify-content: flex-end;
    box-sizing: border-box;
    padding: max(10px, env(safe-area-inset-top, 0px)) max(10px, env(safe-area-inset-right, 0px)) max(10px, env(safe-area-inset-bottom, 0px)) max(10px, env(safe-area-inset-left, 0px));
    background: rgba(15,23,42,0.34);
    opacity: 0;
    transition: opacity 180ms ease;
}
.agent-center-overlay[style*="flex"] {
    opacity: 1;
}
.agent-center-panel {
    width: min(680px, 100vw);
    height: calc(var(--app-visual-height, 100dvh) - max(8px, env(safe-area-inset-top, 0px)) - max(8px, env(safe-area-inset-bottom, 0px)));
    max-height: calc(100vh - max(8px, env(safe-area-inset-top, 0px)) - max(8px, env(safe-area-inset-bottom, 0px)));
    display: flex;
    flex-direction: column;
    background: var(--app-surface-card);
    color: var(--app-text-primary);
    border: 1px solid var(--app-border-default);
    border-radius: 16px;
    box-shadow: -18px 0 46px rgba(15,23,42,0.22);
    overflow: hidden;
    transform: translateX(18px);
    transition: transform 180ms ease-out;
}
.agent-center-overlay[style*="flex"] .agent-center-panel {
    transform: translateX(0);
}
.agent-center-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 15px 16px;
    border-bottom: 1px solid var(--app-border-default);
    background: color-mix(in srgb, var(--app-surface-card) 90%, var(--app-surface-subtle));
    flex-shrink: 0;
}
.agent-center-title {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
}
.agent-center-title-mark {
    width: 38px;
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border: 1px solid rgba(37, 99, 235, 0.18);
    border-radius: 13px;
    background: rgba(37, 99, 235, 0.10);
    color: #1d4ed8;
    font-family: Georgia, 'Palatino Linotype', 'Songti SC', 'Noto Serif SC', serif;
    font-style: italic;
    font-weight: 700;
    font-size: 21px;
    line-height: 1;
    background-image: linear-gradient(160deg, rgba(37, 99, 235, 0.10), rgba(37, 99, 235, 0.16));
}
.agent-center-title strong {
    display: block;
    font-size: 18px;
    line-height: 1.2;
}
.agent-center-meta {
    margin-top: 4px;
    font-size: 12px;
    color: var(--app-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.agent-center-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
}
.agent-center-button {
    border: 1px solid var(--app-border-default);
    border-radius: 999px;
    background: var(--app-surface-subtle);
    color: var(--app-text-primary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    padding: 0;
    cursor: pointer;
    transition: background 120ms ease, border-color 120ms ease, transform 90ms ease, box-shadow 120ms ease;
}
.agent-center-button .agent-center-icon {
    width: 16px;
    height: 16px;
}
.agent-center-button:hover,
.agent-center-card-action:hover,
.agent-center-switch:hover,
.agent-center-filter:hover,
.agent-center-tab:hover,
.agent-center-model-manage:hover {
    border-color: rgba(59,130,246,0.28);
    box-shadow: 0 1px 0 rgba(15,23,42,0.06);
}
.agent-center-button:active,
.agent-center-card-action:active,
.agent-center-switch:active,
.agent-center-filter:active,
.agent-center-tab:active,
.agent-center-model-manage:active {
    transform: translateY(1px);
}
.agent-center-button:focus-visible,
.agent-center-card-action:focus-visible,
.agent-center-switch:focus-visible,
.agent-center-filter:focus-visible,
.agent-center-tab:focus-visible,
.agent-center-model-manage:focus-visible {
    outline: 2px solid rgba(59,130,246,0.42);
    outline-offset: 2px;
}
.agent-center-tabs {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
    padding: 12px;
    border-bottom: 1px solid var(--app-border-default);
    flex-shrink: 0;
}
.agent-center-tab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: var(--app-text-secondary);
    min-height: 36px;
    padding: 8px 7px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 120ms ease, border-color 120ms ease, color 120ms ease, transform 90ms ease;
}
.agent-center-tab.is-active {
    border-color: rgba(59,130,246,0.24);
    background: rgba(59,130,246,0.10);
    color: #1d4ed8;
    box-shadow: inset 0 -2px 0 rgba(37, 99, 235, 0.38);
}
.agent-center-tab.is-active .agent-center-icon {
    stroke-width: 2.4;
}
.agent-center-icon {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex: 0 0 auto;
}
.agent-center-content {
    min-height: 0;
    flex: 1;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
    padding: 16px;
}
.agent-center-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.agent-center-filter-row {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
}
.agent-center-filter {
    min-height: 30px;
    border: 1px solid var(--app-border-default);
    border-radius: 999px;
    background: var(--app-surface-card);
    color: var(--app-text-secondary);
    padding: 5px 9px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
}
.agent-center-filter.is-active {
    border-color: rgba(59,130,246,0.26);
    background: rgba(59,130,246,0.10);
    color: #1d4ed8;
}
.agent-center-filter.is-danger.is-active {
    border-color: rgba(244,63,94,0.26);
    background: rgba(244,63,94,0.10);
    color: #be123c;
}
.agent-center-card {
    border: 1px solid var(--app-border-default);
    border-radius: 12px;
    background: color-mix(in srgb, var(--app-surface-card) 90%, var(--app-surface-subtle));
    padding: 12px 14px;
    box-shadow: 0 4px 16px rgba(15, 23, 42, 0.045);
    transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease, transform 120ms ease;
}
.agent-center-card.is-failure {
    border-color: rgba(244,63,94,0.24);
    background: rgba(244,63,94,0.07);
}
.agent-center-card.is-notice {
    border-color: rgba(59,130,246,0.20);
    background: rgba(59,130,246,0.07);
}
.agent-center-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
}
.agent-center-card-title {
    font-size: 14px;
    font-weight: 700;
    line-height: 1.4;
    word-break: break-word;
}
.agent-center-card-sub {
    margin-top: 6px;
    font-size: 12px;
    line-height: 1.55;
    color: var(--app-text-secondary);
    word-break: break-word;
}
.agent-center-card-error {
    color: #be123c;
}
.agent-center-review-detail {
    margin-top: 8px;
    border: 1px solid rgba(148,163,184,0.22);
    border-radius: 8px;
    background: var(--app-surface-card);
    overflow: hidden;
}
.agent-center-review-detail summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    cursor: pointer;
    list-style: none;
    color: var(--app-text-primary);
    font-size: 12px;
    font-weight: 700;
}
.agent-center-review-detail summary::-webkit-details-marker {
    display: none;
}
.agent-center-review-detail summary::after {
    content: '展开';
    color: var(--app-text-secondary);
    font-size: 12px;
    font-weight: 600;
}
.agent-center-review-detail[open] summary::after {
    content: '收起';
}
.agent-center-review-detail-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 10px 10px;
}
.agent-center-review-label {
    font-size: 12px;
    font-weight: 700;
    color: var(--app-text-secondary);
}
.agent-center-review-code {
    margin: 4px 0 0;
    max-height: 220px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    border: 1px solid rgba(148,163,184,0.20);
    border-radius: 8px;
    background: rgba(15,23,42,0.04);
    color: var(--app-text-primary);
    padding: 8px;
    font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
}
.agent-center-review-code.is-delete {
    border-color: rgba(244,63,94,0.22);
    background: rgba(244,63,94,0.08);
}
.agent-center-review-code.is-add {
    border-color: rgba(34,197,94,0.22);
    background: rgba(34,197,94,0.08);
}
.agent-center-review-expandable {
    border: 1px solid rgba(148,163,184,0.20);
    border-radius: 8px;
    background: rgba(15,23,42,0.03);
    overflow: hidden;
}
.agent-center-review-expandable summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    padding: 8px;
    cursor: pointer;
    list-style: none;
}
.agent-center-review-expandable summary::-webkit-details-marker {
    display: none;
}
.agent-center-review-expandable-title {
    font-size: 12px;
    font-weight: 700;
    color: var(--app-text-secondary);
}
.agent-center-review-expandable-hint {
    color: var(--app-text-secondary);
    font-size: 12px;
    font-weight: 600;
}
.agent-center-review-expandable-preview {
    grid-column: 1 / -1;
    color: var(--app-text-primary);
    opacity: 0.82;
    font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.agent-center-review-expandable[open] .agent-center-review-expandable-hint {
    color: #2563eb;
}
.agent-center-review-expandable .agent-center-review-code {
    margin: 0 8px 8px;
}
.agent-center-review-patch {
    border: 1px solid rgba(148,163,184,0.18);
    border-radius: 8px;
    padding: 8px;
    background: rgba(148,163,184,0.06);
}
.agent-center-rule-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
}
.agent-center-rule-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    padding: 7px 8px;
    border: 1px solid rgba(148,163,184,0.18);
    border-radius: 8px;
    background: var(--app-surface-card);
}
.agent-center-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
}
.agent-center-card-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
}
.agent-center-agent-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}
.agent-center-agent-card {
    min-height: 210px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background:
        linear-gradient(135deg, var(--agent-card-accent-soft, rgba(59,130,246,0.10)), transparent 46%),
        color-mix(in srgb, var(--app-surface-card) 94%, var(--app-surface-subtle));
}
.agent-center-agent-card.is-agent-on {
    border-color: var(--agent-card-accent-border, rgba(34,197,94,0.24));
}
.agent-center-agent-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 26px rgba(15, 23, 42, 0.10);
}
.agent-center-agent-card[data-agent-accent="image"],
.agent-center-floating-card[data-agent-accent="image"] {
    --agent-card-accent-soft: rgba(14,165,233,0.12);
    --agent-card-accent-border: rgba(14,165,233,0.28);
}
.agent-center-agent-card[data-agent-accent="memory"],
.agent-center-floating-card[data-agent-accent="memory"] {
    --agent-card-accent-soft: rgba(34,197,94,0.12);
    --agent-card-accent-border: rgba(34,197,94,0.28);
}
.agent-center-agent-card[data-agent-accent="lineage"],
.agent-center-agent-card[data-agent-accent="lane"],
.agent-center-floating-card[data-agent-accent="lineage"],
.agent-center-floating-card[data-agent-accent="lane"] {
    --agent-card-accent-soft: rgba(99,102,241,0.12);
    --agent-card-accent-border: rgba(99,102,241,0.26);
}
.agent-center-agent-card[data-agent-accent="moment"],
.agent-center-agent-card[data-agent-accent="group"],
.agent-center-floating-card[data-agent-accent="moment"],
.agent-center-floating-card[data-agent-accent="group"] {
    --agent-card-accent-soft: rgba(244,114,182,0.11);
    --agent-card-accent-border: rgba(244,114,182,0.25);
}
.agent-center-agent-card[data-agent-accent="summary"],
.agent-center-agent-card[data-agent-accent="dialogue"],
.agent-center-agent-card[data-agent-accent="phone"],
.agent-center-floating-card[data-agent-accent="summary"],
.agent-center-floating-card[data-agent-accent="dialogue"],
.agent-center-floating-card[data-agent-accent="phone"] {
    --agent-card-accent-soft: rgba(245,158,11,0.11);
    --agent-card-accent-border: rgba(245,158,11,0.25);
}
.agent-center-floating-layer {
    position: fixed;
    inset: 0;
    z-index: 22030;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(15, 23, 42, 0.22);
}
.agent-center-floating-card {
    width: min(620px, calc(100vw - 32px));
    height: min(720px, calc(100vh - 40px));
    perspective: 1400px;
}
.agent-center-floating-inner {
    position: relative;
    width: 100%;
    height: 100%;
    transform: rotateY(0deg);
    transform-style: preserve-3d;
    transition: transform 520ms cubic-bezier(0.16, 1, 0.3, 1);
    will-change: transform;
}
.agent-center-floating-card.is-flipped .agent-center-floating-inner {
    transform: rotateY(180deg);
}
.agent-center-floating-face {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: auto;
    padding: 16px;
    border: 1px solid var(--agent-card-accent-border, var(--app-border-default));
    border-radius: 12px;
    background:
        linear-gradient(135deg, var(--agent-card-accent-soft, rgba(59,130,246,0.10)), transparent 44%),
        color-mix(in srgb, var(--app-surface-card) 96%, var(--app-surface-subtle));
    box-shadow: 0 22px 70px rgba(15, 23, 42, 0.24);
    backface-visibility: hidden;
}
.agent-center-floating-face-back {
    transform: rotateY(180deg);
}
.agent-center-floating-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
}
.agent-center-icon-button {
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border: 1px solid var(--app-border-default);
    border-radius: 8px;
    background: var(--app-surface-card);
    color: var(--app-text-primary);
    cursor: pointer;
}
.agent-center-icon-button:hover {
    background: var(--app-surface-hover);
}
.agent-center-agent-badge {
    width: 38px;
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border: 1px solid var(--agent-card-accent-border, rgba(59,130,246,0.24));
    border-radius: 8px;
    background: var(--agent-card-accent-soft, rgba(59,130,246,0.10));
    color: var(--app-text-primary);
    font-size: 18px;
    font-weight: 700;
}
.agent-center-agent-title-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
}
.agent-center-agent-title-main {
    min-width: 0;
    display: flex;
    gap: 10px;
    align-items: flex-start;
}
.agent-center-agent-face-back .agent-center-card-title {
    font-size: 13px;
}
.agent-center-agent-section {
    display: grid;
    gap: 6px;
    padding: 8px;
    border: 1px solid rgba(148,163,184,0.16);
    border-radius: 8px;
    background: color-mix(in srgb, var(--app-surface-card) 82%, transparent);
}
.agent-center-agent-section-title {
    color: var(--app-text-secondary);
    font-size: 12px;
    font-weight: 700;
}
.agent-center-agent-mini-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.agent-center-agent-mini-item {
    min-height: 24px;
    display: inline-flex;
    align-items: center;
    border: 1px solid rgba(148,163,184,0.20);
    border-radius: 8px;
    padding: 4px 7px;
    background: var(--app-surface-card);
    color: var(--app-text-primary);
    font-size: 12px;
    font-weight: 600;
}
.agent-center-agent-editor {
    display: grid;
    gap: 8px;
}
.agent-center-agent-editor-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
}
.agent-center-agent-field-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
}
.agent-center-agent-field {
    display: grid;
    gap: 4px;
}
.agent-center-agent-field.is-wide {
    grid-column: 1 / -1;
}
.agent-center-agent-field label,
.agent-center-agent-check {
    color: var(--app-text-secondary);
    font-size: 12px;
    font-weight: 700;
}
.agent-center-agent-check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
}
.agent-center-agent-input,
.agent-center-agent-textarea {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--app-border-default);
    border-radius: 8px;
    background: var(--app-surface-card);
    color: var(--app-text-primary);
    font: inherit;
    font-size: 12px;
    box-sizing: border-box;
}
.agent-center-agent-input {
    min-height: 30px;
    padding: 5px 7px;
}
.agent-center-agent-textarea {
    min-height: 92px;
    resize: vertical;
    padding: 8px;
    line-height: 1.55;
}
.agent-center-agent-textarea.is-compact {
    min-height: 70px;
}
.agent-center-agent-prompt-preview {
    min-height: 86px;
    padding: 8px;
    border: 1px solid var(--app-border-default);
    border-radius: 8px;
    background: color-mix(in srgb, var(--app-surface-card) 88%, transparent);
    color: var(--app-text-secondary);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.55;
    white-space: pre-wrap;
}
.agent-center-agent-input:focus,
.agent-center-agent-textarea:focus {
    outline: 2px solid rgba(59,130,246,0.22);
    border-color: rgba(59,130,246,0.38);
}
.agent-center-agent-settings {
    display: grid;
    gap: 6px;
}
.agent-center-setting-row {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 7px 8px;
    border: 1px solid rgba(148,163,184,0.16);
    border-radius: 8px;
    background: var(--app-surface-card);
}
.agent-center-setting-row.is-model {
    grid-template-columns: 72px minmax(0, 1fr);
}
.agent-center-setting-label {
    color: var(--app-text-secondary);
    font-size: 12px;
    font-weight: 600;
}
.agent-center-setting-value {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--app-text-primary);
    font-size: 12px;
    font-weight: 700;
}
.agent-center-model-override-row {
    margin-top: 6px;
    display: flex;
    gap: 6px;
    align-items: center;
}
.agent-center-model-override-row .agent-center-card-action {
    flex: 0 0 auto;
}
.agent-center-model-menu[hidden] {
    display: none;
}
.agent-center-model-menu {
    margin-top: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 180px;
    overflow-y: auto;
    border: 1px solid var(--app-border-default);
    border-radius: 8px;
    background: var(--app-surface-card);
    padding: 4px;
}
.agent-center-model-menu-item {
    border: none;
    background: transparent;
    color: var(--app-text-primary);
    text-align: left;
    padding: 6px 8px;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
}
.agent-center-model-menu-item:hover {
    background: var(--app-surface-subtle);
}
.agent-center-model-menu-item.is-loading {
    color: var(--app-text-secondary);
    cursor: default;
}
.agent-center-model-override {
    flex: 1;
    min-width: 0;
    width: 100%;
    min-height: 30px;
    padding: 5px 9px;
    border: 1px solid var(--app-border-default);
    border-radius: 8px;
    background: var(--app-surface-card);
    color: var(--app-text-primary);
    font-size: 12px;
    box-sizing: border-box;
}
.agent-center-model-override::placeholder {
    color: var(--app-text-secondary);
}
.agent-center-model-select {
    width: 100%;
    min-width: 0;
    min-height: 32px;
    border: 1px solid var(--app-border-default);
    border-radius: 8px;
    background: var(--app-surface-subtle);
    color: var(--app-text-primary);
    padding: 6px 8px;
    font-size: 12px;
    font-weight: 600;
    outline: none;
    cursor: pointer;
}
.agent-center-model-select:focus {
    border-color: rgba(59,130,246,0.40);
    box-shadow: 0 0 0 2px rgba(59,130,246,0.12);
}
.agent-center-model-select:disabled {
    cursor: not-allowed;
    opacity: 0.58;
}
.agent-center-model-control {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    align-items: center;
}
.agent-center-model-control .world-app-select-btn {
    min-height: 32px;
    padding: 6px 8px;
    border-radius: 8px;
    background: var(--app-surface-subtle);
    font-size: 12px;
    font-weight: 600;
}
.agent-center-model-manage {
    min-height: 32px;
    border: 1px solid var(--app-border-default);
    border-radius: 8px;
    background: var(--app-surface-subtle);
    color: var(--app-text-primary);
    padding: 6px 9px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
}
.agent-center-model-manage:disabled {
    cursor: not-allowed;
    opacity: 0.58;
}
.agent-center-switch {
    min-width: 76px;
    border: 1px solid var(--app-border-default);
    border-radius: 999px;
    background: var(--app-surface-card);
    color: var(--app-text-secondary);
    padding: 6px 10px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
}
.agent-center-switch.is-on {
    border-color: rgba(34,197,94,0.30);
    background: rgba(34,197,94,0.12);
    color: #047857;
}
.agent-center-switch:disabled {
    cursor: not-allowed;
    opacity: 0.58;
}
.agent-center-card-action {
    border: 1px solid var(--app-border-default);
    border-radius: 10px;
    background: var(--app-surface-card);
    color: var(--app-text-primary);
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 120ms ease, border-color 120ms ease, color 120ms ease, transform 90ms ease, box-shadow 120ms ease;
}
.agent-center-card-action.is-primary {
    border-color: rgba(14,165,233,0.34);
    background: rgba(14,165,233,0.14);
    color: #0369a1;
}
.agent-center-card-action.is-danger {
    border-color: rgba(244,63,94,0.24);
    background: rgba(244,63,94,0.08);
    color: #be123c;
}
.agent-center-chip {
    display: inline-flex;
    align-items: center;
    min-height: 23px;
    padding: 4px 8px;
    border-radius: 999px;
    border: 1px solid rgba(148,163,184,0.22);
    color: var(--app-text-secondary);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
}
.agent-center-resource-list {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
}
.agent-center-resource-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px 12px;
    align-items: center;
}
.agent-center-resource-card:hover {
    border-color: rgba(59,130,246,0.22);
    box-shadow: 0 6px 18px rgba(15,23,42,0.08);
    transform: translateY(-1px);
}
.agent-center-resource-card .agent-center-card-head {
    align-items: center;
}
.agent-center-resource-group {
    margin-bottom: 2px;
    color: var(--app-text-secondary);
    font-size: 12px;
    font-weight: 700;
}
.agent-center-resource-main {
    min-width: 0;
}
.agent-center-resource-main .agent-center-card-sub {
    margin-top: 2px;
}
.agent-center-resource-shortcuts {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.agent-center-resource-shortcut {
    min-height: 28px;
    border: 1px solid rgba(148,163,184,0.22);
    border-radius: 8px;
    background: var(--app-surface-card);
    color: var(--app-text-primary);
    padding: 5px 8px;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 120ms ease, border-color 120ms ease, transform 90ms ease, box-shadow 120ms ease;
}
.agent-center-resource-shortcut:hover {
    border-color: rgba(59,130,246,0.28);
    background: rgba(59,130,246,0.08);
}
.agent-center-resource-shortcut:active {
    transform: translateY(1px);
}
.agent-center-resource-actions {
    margin-top: 0;
    justify-content: flex-end;
}
.agent-center-chip.is-risk-high,
.agent-center-chip.is-risk-medium {
    border-color: rgba(245,158,11,0.24);
    background: rgba(245,158,11,0.10);
    color: #b45309;
}
.agent-center-chip.is-status-failed,
.agent-center-chip.is-status-denied,
.agent-center-chip.is-status-expired {
    border-color: rgba(244,63,94,0.22);
    background: rgba(244,63,94,0.10);
    color: #be123c;
}
.agent-center-chip.is-status-running,
.agent-center-chip.is-status-pending {
    border-color: rgba(59,130,246,0.22);
    background: rgba(59,130,246,0.10);
    color: #1d4ed8;
}
.agent-center-chip.is-usage {
    border-color: rgba(16,185,129,0.24);
    background: rgba(16,185,129,0.10);
    color: #047857;
}
.agent-center-chip.is-danger {
    border-color: rgba(244,63,94,0.22);
    background: rgba(244,63,94,0.10);
    color: #be123c;
}
.agent-center-chip.is-muted {
    opacity: 0.72;
}
.agent-center-usage-summary {
    margin: 4px 0 10px;
    padding: 10px 12px;
    border: 1px solid rgba(148,163,184,0.20);
    border-radius: 12px;
    background: var(--app-surface-card);
}
.agent-center-usage-summary-title {
    margin-bottom: 4px;
    font-size: 12px;
    font-weight: 700;
    color: var(--app-text-secondary);
}
.agent-center-empty {
    padding: 28px 12px;
    color: var(--app-text-secondary);
    text-align: center;
    font-size: 13px;
}
.agent-center-error {
    margin-bottom: 10px;
    padding: 10px 12px;
    border: 1px solid rgba(244,63,94,0.22);
    border-radius: 8px;
    background: rgba(244,63,94,0.08);
    color: #be123c;
    font-size: 12px;
    line-height: 1.5;
}
@media (max-width: 680px) {
    .agent-center-overlay {
        align-items: flex-end;
        justify-content: center;
        padding: max(8px, env(safe-area-inset-top, 0px)) max(8px, env(safe-area-inset-right, 0px)) max(8px, env(safe-area-inset-bottom, 0px)) max(8px, env(safe-area-inset-left, 0px));
    }
    .agent-center-panel {
        width: 100%;
        height: min(92dvh, calc(var(--app-visual-height, 100dvh) - max(16px, env(safe-area-inset-top, 0px)) - max(8px, env(safe-area-inset-bottom, 0px))));
        border-radius: 16px 16px 12px 12px;
        transform: translateY(18px);
        box-shadow: 0 -16px 42px rgba(15,23,42,0.22);
    }
    .agent-center-overlay[style*="flex"] .agent-center-panel {
        transform: translateY(0);
    }
    .agent-center-header {
        padding: 12px;
    }
    .agent-center-title-mark {
        width: 34px;
        height: 34px;
        border-radius: 11px;
    }
    .agent-center-tabs {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        padding: 9px 10px;
    }
    .agent-center-content {
        padding: 10px;
    }
    .agent-center-agent-list {
        grid-template-columns: minmax(0, 1fr);
    }
    .agent-center-setting-row {
        grid-template-columns: 64px minmax(0, 1fr);
    }
    .agent-center-setting-row.is-model {
        grid-template-columns: 64px minmax(0, 1fr);
    }
    .agent-center-setting-row .agent-center-card-action {
        grid-column: 1 / -1;
        width: 100%;
    }
    .agent-center-agent-field-grid {
        grid-template-columns: minmax(0, 1fr);
    }
    .agent-center-resource-list {
        grid-template-columns: minmax(0, 1fr);
    }
    .agent-center-resource-card {
        grid-template-columns: minmax(0, 1fr);
    }
    .agent-center-resource-actions {
        justify-content: flex-start;
    }
}
@media (max-width: 430px) {
    .agent-center-actions {
        gap: 4px;
    }
    .agent-center-button span {
        display: none;
    }
    .agent-center-button {
        width: 34px;
        padding: 0;
    }
}
body[data-theme-mode='dark'] .agent-center-title-mark {
    color: #8ecbff;
    border-color: rgba(121, 192, 255, 0.26);
    background: rgba(121, 192, 255, 0.12);
}
body[data-theme-mode='dark'] .agent-center-card,
body[data-theme-mode='dark'] .agent-center-agent-card.is-agent-on {
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
}
body[data-theme-mode='dark'] .agent-center-tab.is-active {
    color: #8ecbff;
    border-color: rgba(121, 192, 255, 0.32);
    background: rgba(121, 192, 255, 0.13);
    box-shadow: inset 0 -2px 0 rgba(121, 192, 255, 0.36);
}
@media (prefers-reduced-motion: reduce) {
    .agent-center-overlay,
    .agent-center-panel,
    .agent-center-button,
    .agent-center-card,
    .agent-center-floating-inner,
    .agent-center-card-action,
    .agent-center-resource-shortcut,
    .agent-center-switch,
    .agent-center-filter,
    .agent-center-tab,
    .agent-center-model-manage {
        transition: none !important;
        transform: none !important;
    }
}
`;

const trim = (value, fallback = '') => {
    const text = String(value ?? '').trim();
    return text || fallback;
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
}[ch]));

const list = value => (Array.isArray(value) ? value : [value])
    .map(item => trim(item))
    .filter(Boolean);

const formatMeta = (items = []) => items.filter(Boolean).join(' · ');

const statusChipClass = value => `agent-center-chip is-status-${trim(value, 'unknown').toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}`;

const riskChipClass = value => `agent-center-chip is-risk-${trim(value, 'low').toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}`;

const normalizeActivityStatus = (value = '') => {
    const status = trim(value).toLowerCase();
    return ['active', 'failure', 'queued', 'running', 'waiting_permission', 'succeeded', 'failed', 'cancelled'].includes(status)
        ? status
        : '';
};

const normalizeSurface = (value = '') => trim(value).toLowerCase().replace(/[^a-z0-9_-]+/g, '-');

const activityStatusLabel = (status = '') => ({
    active: '运行中',
    failure: '失败',
    queued: '排队',
    running: '运行中',
    waiting_permission: '待确认',
    succeeded: '完成',
    failed: '失败',
    cancelled: '已取消',
}[normalizeActivityStatus(status)] || '全部');

const activityCardClass = runOrStatus => {
    const status = trim(typeof runOrStatus === 'string' ? runOrStatus : runOrStatus?.status).toLowerCase();
    const decision = trim(typeof runOrStatus === 'string' ? '' : runOrStatus?.reviewDecision || runOrStatus?.metadata?.reviewDecision);
    if (status === 'cancelled' && ['rejected', 'user_rejected'].includes(decision)) return 'agent-center-card';
    return ['failed', 'cancelled'].includes(status) ? 'agent-center-card is-failure' : 'agent-center-card';
};

const renderChips = (chips = []) => {
    const html = chips.filter(Boolean).map((chip) => {
        const label = trim(chip.label);
        if (!label) return '';
        return `<span class="${escapeHtml(chip.className || 'agent-center-chip')}">${escapeHtml(label)}</span>`;
    }).filter(Boolean).join('');
    return html ? `<div class="agent-center-chip-row">${html}</div>` : '';
};

const renderEmpty = message => `<div class="agent-center-empty">${escapeHtml(message)}</div>`;

// Phase B 只读用量：token/延迟的紧凑格式化，仅呈现真实计量，无估算。
const formatTokenCount = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return '-';
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(Math.trunc(n));
};

const formatLatencyMs = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return '-';
    return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.trunc(n)}ms`;
};

// 单个 run 的 usage chip：recorded 显示 token/延迟；unknown 只在有本地事实时显示延迟，不伪造 token。
const buildRunUsageChips = (usage = null) => {
    if (!usage || typeof usage !== 'object') return [];
    const chips = [];
    if (usage.status === 'recorded' && Number.isFinite(Number(usage.totalTokens))) {
        chips.push({ label: `Token ${formatTokenCount(usage.totalTokens)}`, className: 'agent-center-chip is-usage' });
    } else if (usage.status !== 'recorded') {
        chips.push({ label: 'Token 未计量', className: 'agent-center-chip is-muted' });
    }
    if (Number.isFinite(Number(usage.latencyMs)) && Number(usage.latencyMs) > 0) {
        chips.push({ label: `模型 ${formatLatencyMs(usage.latencyMs)}`, className: 'agent-center-chip' });
    }
    if (usage.degraded === true) chips.push({ label: '降级', className: 'agent-center-chip is-danger' });
    return chips;
};

// 活动页顶部的只读用量画像摘要（overall + 主要任务类型），不含任何自动决策。
const renderUsageProfileSummary = (profile = null) => {
    const overall = profile?.overall;
    if (!overall || !Number(overall.runCount)) return '';
    const parts = [
        `运行 ${Number(overall.runCount)}`,
        `已计量 ${Number(overall.recordedCount)}`,
        overall.unknownCount ? `未计量 ${Number(overall.unknownCount)}` : '',
        overall.recordedCount ? `Token 合计 ${formatTokenCount(overall.totalTokens)}` : '',
        overall.avgTotalTokens != null ? `均 ${formatTokenCount(overall.avgTotalTokens)}/次` : '',
        overall.avgLatencyMs != null ? `均延迟 ${formatLatencyMs(overall.avgLatencyMs)}` : '',
        overall.degradedCount ? `降级 ${Number(overall.degradedCount)}` : '',
    ].filter(Boolean);
    const topKinds = (Array.isArray(profile.byKind) ? profile.byKind : [])
        .filter(k => Number(k.runCount) > 0)
        .slice(0, 3)
        .map(k => `${displayAgentKind(k.kind)} ${Number(k.runCount)}${k.recordedCount ? `（Token ${formatTokenCount(k.totalTokens)}）` : ''}`);
    return `
        <div class="agent-center-usage-summary">
            <div class="agent-center-usage-summary-title">用量画像（当前活动列表 · 只读）</div>
            <div class="agent-center-card-sub">${escapeHtml(formatMeta(parts))}</div>
            ${topKinds.length ? `<div class="agent-center-card-sub">${escapeHtml(topKinds.join(' · '))}</div>` : ''}
        </div>`;
};

const renderNotice = ({
    title = '',
    message = '',
    actionLabel = '',
    actionAttr = '',
} = {}) => `
    <article class="agent-center-card is-notice">
        ${title ? `<div class="agent-center-card-title">${escapeHtml(title)}</div>` : ''}
        ${message ? `<div class="agent-center-card-sub">${escapeHtml(message)}</div>` : ''}
        ${actionLabel && actionAttr ? `
            <div class="agent-center-card-actions">
                <button type="button" class="agent-center-card-action" ${actionAttr}>${escapeHtml(actionLabel)}</button>
            </div>
        ` : ''}
    </article>
`;

const renderReviewCodeBlock = (label = '', text = '', className = '') => {
    const body = String(text ?? '');
    if (!body.trim()) return '';
    return `
        <div>
            <div class="agent-center-review-label">${escapeHtml(label)}</div>
            <pre class="agent-center-review-code${className ? ` ${escapeHtml(className)}` : ''}">${escapeHtml(body)}</pre>
        </div>
    `;
};

const renderExpandableReviewCodeBlock = ({
    label = '',
    preview = '',
    text = '',
    truncated = false,
} = {}) => {
    const body = String(text || preview || '');
    if (!body.trim()) return '';
    const previewText = trim(preview || body.replace(/\s+/g, ' ').slice(0, 180));
    return `
        <details class="agent-center-review-expandable">
            <summary>
                <span class="agent-center-review-expandable-title">${escapeHtml(label)}${truncated ? '（已截断保存）' : ''}</span>
                <span class="agent-center-review-expandable-hint">点击查看完整</span>
                ${previewText ? `<span class="agent-center-review-expandable-preview">${escapeHtml(previewText)}</span>` : ''}
            </summary>
            <pre class="agent-center-review-code">${escapeHtml(body)}</pre>
        </details>
    `;
};

const formatPatchLineRange = (patch = {}) => {
    const start = Number(patch.startLine || 0);
    const end = Number(patch.endLine || 0);
    if (!start || !end) return '';
    return start === end ? `第 ${start} 行` : `第 ${start}-${end} 行`;
};

const renderChatFormatModelReviewDetail = (detail = null) => {
    if (!detail) return '';
    const meta = formatMeta([
        detail.status ? `状态：${detail.status}` : '',
        detail.canRepair ? '可修复' : '',
        Number(detail.patchCount || 0) ? `${Number(detail.patchCount || 0)} 个 patch` : '',
    ]);
    const issueText = (detail.issues || []).length
        ? `模型判断：${(detail.issues || []).map(issue => formatMeta([issue.type, issue.message])).filter(Boolean).join('；')}`
        : '';
    const patchHtml = (detail.linePatches || []).map((patch) => {
        const originalText = Array.isArray(patch.originalLines) ? patch.originalLines.map(line => `- ${line}`).join('\n') : '';
        const replacementText = Array.isArray(patch.replacementLines) ? patch.replacementLines.map(line => `+ ${line}`).join('\n') : '';
        const patchMeta = formatMeta([
            formatPatchLineRange(patch),
            patch.reason,
            patch.originalMatches === false ? '原文校验未通过' : '',
            patch.replacementLinesTruncated ? '替换行已截断' : '',
        ]);
        return `
            <div class="agent-center-review-patch">
                ${patchMeta ? `<div class="agent-center-card-sub">${escapeHtml(patchMeta)}</div>` : ''}
                ${renderReviewCodeBlock('原文', originalText, 'is-delete')}
                ${renderReviewCodeBlock('建议', replacementText || (Number(patch.replacementLineCount || 0) === 0 ? '+ （删除这些行）' : ''), 'is-add')}
            </div>
        `;
    }).join('');
    const correctedLabel = detail.correctedTextTruncated ? '修复后文本（已截断）' : '修复后文本';
    const correctedHtml = renderReviewCodeBlock(correctedLabel, detail.correctedText || '');
    const rawPreviewHtml = (detail.rawText || detail.rawPreview)
        ? renderExpandableReviewCodeBlock({
            label: '模型原始返回预览',
            preview: detail.rawPreview,
            text: detail.rawText || detail.rawPreview,
            truncated: detail.rawTextTruncated,
        })
        : '';
    if (!meta && !issueText && !patchHtml && !correctedHtml && !rawPreviewHtml && !detail.repairSummary) return '';
    return `
        <details class="agent-center-review-detail">
            <summary>
                <span>模型修复返回</span>
                ${meta ? `<span class="agent-center-card-sub">${escapeHtml(meta)}</span>` : ''}
            </summary>
            <div class="agent-center-review-detail-body">
                ${detail.repairSummary ? `<div class="agent-center-card-sub">${escapeHtml(detail.repairSummary)}</div>` : ''}
                ${issueText ? `<div class="agent-center-card-sub">${escapeHtml(issueText)}</div>` : ''}
                ${patchHtml}
                ${correctedHtml}
                ${rawPreviewHtml}
            </div>
        </details>
    `;
};

const renderChatFormatAutoRepair = (autoRepair = null) => {
    if (!autoRepair) return '';
    const parts = [
        autoRepair.autoApplyRepair ? '自动应用开启' : '',
        autoRepair.attempted ? '已尝试' : '未尝试',
        autoRepair.didAnything ? '已写入聊天' : '未写入聊天',
        Number(autoRepair.eventCount || 0) ? `${Number(autoRepair.eventCount || 0)} 个事件` : '',
        autoRepair.reason,
        autoRepair.errorMessage,
    ].filter(Boolean);
    if (!parts.length) return '';
    const className = autoRepair.attempted && !autoRepair.didAnything
        ? 'agent-center-card-sub agent-center-card-error'
        : 'agent-center-card-sub';
    return `<div class="${className}">自动应用：${escapeHtml(parts.join(' · '))}</div>`;
};

const renderChatFormatReview = (review = null) => {
    if (!review) return '';
    if (review.type === 'body_quality') {
        const issueText = formatMeta([
            `发现 ${Number(review.issueCount || (review.issues || []).length || 0)} 个问题`,
            review.hasRawOriginal ? '检查原始回复' : '',
        ]);
        const issuesText = (review.issues || []).length
            ? `问题：${(review.issues || []).map(issue => formatMeta([issue.title, issue.summary])).filter(Boolean).join('；')}`
            : '';
        const patchText = review.patchCandidate?.available
            ? `优化候选：${formatMeta([review.patchCandidate.title, review.patchCandidate.summary, review.patchCandidate.risk])}`
            : '';
        const actionText = (review.actionLabels || []).length
            ? `可在消息旁处理：${review.actionLabels.join('、')}`
            : '';
        return [
            issueText ? `<div class="agent-center-card-sub">正文检查：${escapeHtml(issueText)}</div>` : '',
            issuesText ? `<div class="agent-center-card-sub">${escapeHtml(issuesText)}</div>` : '',
            patchText ? `<div class="agent-center-card-sub">${escapeHtml(patchText)}</div>` : '',
            actionText ? `<div class="agent-center-card-sub">${escapeHtml(actionText)}</div>` : '',
        ].filter(Boolean).join('');
    }
    const issueText = formatMeta([
        `发现 ${Number((review.errors || []).length) + Number((review.warnings || []).length)} 条提醒`,
        review.hasRawOriginal ? '检查原始回复' : '',
    ]);
    const errorText = (review.errors || []).length ? `需要处理：${(review.errors || []).join('；')}` : '';
    const warningText = (review.warnings || []).length ? `提醒：${(review.warnings || []).join('；')}` : '';
    const repairText = review.repairCandidate?.available
        ? `修复候选：${formatMeta([review.repairCandidate.title, review.repairCandidate.summary])}`
        : '';
    const actionText = (review.actionLabels || []).length
        ? `可在消息旁处理：${review.actionLabels.join('、')}`
        : '';
    return [
        issueText ? `<div class="agent-center-card-sub">格式检查：${escapeHtml(issueText)}</div>` : '',
        errorText ? `<div class="agent-center-card-sub agent-center-card-error">${escapeHtml(errorText)}</div>` : '',
        warningText ? `<div class="agent-center-card-sub">${escapeHtml(warningText)}</div>` : '',
        repairText ? `<div class="agent-center-card-sub">${escapeHtml(repairText)}</div>` : '',
        renderChatFormatAutoRepair(review.autoRepair),
        actionText ? `<div class="agent-center-card-sub">${escapeHtml(actionText)}</div>` : '',
        renderChatFormatModelReviewDetail(review.modelReviewDetail),
    ].filter(Boolean).join('');
};

const providerToolActionLabel = action => ({
    [PROVIDER_TOOL_PERMISSION_ACTIONS.allowOnce]: '执行一次',
    [PROVIDER_TOOL_PERMISSION_ACTIONS.deny]: '打回',
    [PROVIDER_TOOL_PERMISSION_ACTIONS.rememberAllow]: '记住执行',
}[action] || '处理');

const continuationCommitStrategyLabel = strategy => ({
    preview_only: '只预览',
    append_to_previous_bubble: '接到上一气泡',
}[trim(strategy)] || '只预览');

const normalizeContinuationCommitStrategy = strategy => (
    trim(strategy) === 'append_to_previous_bubble' ? 'append_to_previous_bubble' : 'preview_only'
);

const TOOL_LABELS = Object.freeze({
    'contact_profile.list': '读取联系人列表',
    'contact_profile.get': '读取联系人画像',
    'chat.emit_private': '私聊候选',
    'chat.emit_group': '群聊候选',
    'chat.emit_moment_comment': '动态评论候选',
    'chat.emit_moment_post': '动态发布候选',
    'memory.preview_actions': '记忆变更预览',
    'variable.preview_commands': '变量变更预览',
    'worldbook.preview_actions': '世界书变更预览',
});

const STATUS_LABELS = Object.freeze({
    pending: '待确认',
    allowed: '已允许',
    denied: '已拒绝',
    idle: '未执行',
    ready: '已就绪',
    running: '运行中',
    succeeded: '已完成',
    failed: '失败',
    cancelled: '已取消',
    skipped: '已略过',
    blocked: '已阻止',
    expired: '已过期',
    committed: '已提交',
    undone: '已撤销',
    waiting_permission: '待确认',
});

const RISK_LABELS = Object.freeze({
    low: '低风险',
    medium: '中风险',
    high: '高风险',
});

const PERMISSION_LABELS = Object.freeze({
    storage: '读取本地资料',
    'storage:read': '读取本地资料',
    'storage:write': '写入本地资料',
    'chat:emit_candidate': '聊天候选',
    'contact:read': '读取联系人',
    'memory:read': '读取记忆',
    'memory:write': '写入记忆',
    'variables:read': '读取变量',
    'variables:write': '写入变量',
    'worldbook:read': '读取世界书',
    'worldbook:write': '写入世界书',
});

const AGENT_KIND_LABELS = Object.freeze({
    maid_assistant: '女仆任务',
    chat_format_guardian: '聊天格式检查',
    chat_body_quality_guardian: '正文检查',
    memory_update: '记忆更新',
    image_generation: '图片生成',
    image_director_generation: '生图整理',
    moment_summary: '动态整理',
    lineage_layout: '血缘图排版',
    creative_execution_lane: '执行泳道',
    summary_compaction: '摘要压缩',
    moment_comment: '动态评论',
    moment_publish: '动态发布',
    phone_format: '手机格式',
    chat_guide: '聊天提示',
    group_chat: '群聊提示',
});

const AGENT_FEATURE_LABELS = Object.freeze({
    reply_check: '检查回复格式',
    write_preview: '预览记忆和变量变更',
    text_completion: '文本补全',
});

const displayToolName = toolName => TOOL_LABELS[trim(toolName)] || trim(toolName, 'Agent 工具');
const displayStatusLabel = status => STATUS_LABELS[trim(status).toLowerCase()] || trim(status, '未知');
const isUserRejectedReview = value => trim(value) === 'user_rejected' || trim(value) === 'rejected';
const displayCommitStatusLabel = commit => (
    isUserRejectedReview(commit?.reviewDecision) && trim(commit?.status) === 'skipped'
        ? '已打回'
        : displayStatusLabel(commit?.status)
);
const displayRunStatusLabel = run => {
    const decision = trim(run?.reviewDecision || run?.metadata?.reviewDecision);
    if (run?.status === 'cancelled' && (decision === 'rejected' || decision === 'user_rejected')) return '已打回';
    if (run?.status === 'succeeded' && (decision === 'executed' || decision === 'user_executed')) return '已执行';
    return displayStatusLabel(run?.status);
};
const displayRiskLabel = risk => RISK_LABELS[trim(risk).toLowerCase()] || trim(risk, '风险未知');
const displayPermissionLabel = permission => PERMISSION_LABELS[trim(permission)] || trim(permission);
const displayAgentKind = kind => AGENT_KIND_LABELS[trim(kind)] || trim(kind);
const displayAgentFeature = id => AGENT_FEATURE_LABELS[trim(id)] || trim(id, 'Agent');
const displayCardCategory = category => ({
    creative: '创作执行',
    memory: '记忆与摘要',
    social: '动态执行',
    assistant: '辅助执行',
    safety: '写入安全',
    prompt_module: '提示词/协议',
    diagnostic: '诊断视图',
}[trim(category)] || trim(category, 'Agent'));

const AGENT_CARD_GLYPHS = Object.freeze({
    image_director: '图',
    memory_table_agent: '记',
    lineage_agent: '血',
    execution_lane_agent: '泳',
    summary_agent: '摘',
    moment_agent: '动',
    dialogue_agent: '私',
    group_agent: '群',
    phone_format_agent: '机',
    reply_check: '检',
    write_preview: '预',
    text_completion: '补',
    prompt_manager: '提',
    memory_manager: '管',
});

const displayAgentCardGlyph = card => (
    AGENT_CARD_GLYPHS[trim(card?.id)] || trim(card?.title, 'A').slice(0, 1).toUpperCase()
);

const FEATURE_AGENT_CARD_IDS = new Set([
    'reply_check',
    'write_preview',
    'text_completion',
    'prompt_manager',
    'memory_manager',
]);

const isFeatureAgentCard = agent => (
    trim(agent?.toggleKind) === 'feature' ||
    trim(agent?.cardType) === 'feature' ||
    FEATURE_AGENT_CARD_IDS.has(trim(agent?.id))
);

const PROMPT_POSITION_OPTIONS = Object.freeze([
    { value: 0, label: 'IN_PROMPT' },
    { value: 1, label: 'IN_CHAT' },
    { value: 4, label: '最新输入前' },
    { value: 5, label: '最新输入后' },
    { value: 2, label: 'BEFORE_PROMPT' },
    { value: -1, label: 'NONE' },
]);

const PROMPT_ROLE_OPTIONS = Object.freeze([
    { value: 0, label: 'SYSTEM' },
    { value: 1, label: 'USER' },
    { value: 2, label: 'ASSISTANT' },
]);

const PROMPT_REFS_WITH_PLACEMENT = new Set([
    'dialogue',
    'group',
    'moment',
    'moment-comment',
    'moment-publish-comment',
    'auto-image-prompt',
    'summary',
]);

const MEMORY_POSITION_OPTIONS = Object.freeze([
    { value: '', label: '跟随通用设置' },
    { value: 'template', label: '模板默认' },
    { value: 'before_latest_user', label: '最新输入前' },
    { value: 'after_latest_user', label: '最新输入后' },
    { value: 'history_depth', label: '历史深度' },
    { value: 'before_chat', label: '聊天前' },
    { value: 'history_before', label: '历史前' },
    { value: 'history_after', label: '历史后' },
    { value: 'system_end', label: '系统末尾' },
    { value: 'system_end+before_chat', label: '系统末尾 + 聊天前' },
]);

const REPLY_CHECK_PREVIEW_TARGET_OPTIONS = Object.freeze([
    { value: 'auto', label: '跟随当前场景' },
    { value: 'private_chat', label: '私聊格式' },
    { value: 'group_chat', label: '群聊格式' },
    { value: 'moment_comment', label: '动态评论' },
    { value: 'moment_post', label: '动态发布' },
    { value: 'image_prompt', label: '生图标签' },
    { value: 'memory_table_edit', label: '记忆表格' },
    { value: 'creative_text', label: '创意写作' },
]);

const permissionDecisionChipClass = decision => ({
    allow: statusChipClass('running'),
    deny: statusChipClass('denied'),
    ask: statusChipClass('pending'),
}[trim(decision)] || 'agent-center-chip');

const renderPermissionRuleSummary = (summary = {}) => {
    const total = Number(summary.total || 0);
    const visibleRules = Array.isArray(summary.visibleRules) ? summary.visibleRules : [];
    const overflow = Number(summary.overflow || 0);
    const decisionCounts = summary.decisionCounts || {};
    return `
        <div class="agent-center-card-sub">${escapeHtml(total ? `${total} 条。用于减少同类请求的重复确认。` : '0 条。工具请求仍会逐次确认。')}</div>
        <div class="agent-center-card-sub">优先顺序：${escapeHtml(summary.orderText || '全局 > 角色卡 > 当前会话 > Agent > 插件 > 默认')}</div>
        <div class="agent-center-card-sub">${escapeHtml(summary.tieBreakText || '同层先看优先级，仍相同则以后添加的规则生效。')}</div>
        ${Number(summary.conflictCount || 0) > 0 ? `<div class="agent-center-card-sub agent-center-card-error">检测到 ${Number(summary.conflictCount || 0)} 组同范围不同决定，最终按上方顺序处理。</div>` : ''}
        ${renderChips([
            { label: `允许 ${Number(decisionCounts.allow || 0)}` },
            { label: `拒绝 ${Number(decisionCounts.deny || 0)}` },
            { label: `每次确认 ${Number(decisionCounts.ask || 0)}` },
        ])}
        ${visibleRules.length ? `<div class="agent-center-rule-list">${visibleRules.map(rule => `
            <div class="agent-center-rule-row">
                <div>
                    <div class="agent-center-card-title">${escapeHtml(displayToolName(rule.toolName))}</div>
                    <div class="agent-center-card-sub">${escapeHtml(formatMeta([
                        rule.layerLabel,
                        displayPermissionLabel(rule.permission),
                        rule.source && rule.source !== '*' ? `来源：${rule.source}` : '',
                        rule.sessionId && rule.sessionId !== '*' ? `会话：${rule.sessionId}` : '',
                    ]))}</div>
                </div>
                <span class="${escapeHtml(permissionDecisionChipClass(rule.decision))}">${escapeHtml(rule.decisionLabel || rule.decision)}</span>
            </div>
        `).join('')}${overflow ? `<div class="agent-center-card-sub">还有 ${overflow} 条未显示。</div>` : ''}</div>` : ''}
    `;
};

const capabilityLabels = (capabilities = {}) => [
    capabilities.read ? '可读取' : '',
    capabilities.write ? '会写入' : '只读',
    capabilities.network ? '会联网' : '本地执行',
    capabilities.undo && capabilities.undo !== 'none' ? '可撤销' : '无撤销',
    capabilities.modelContext === 'allowlist' ? 'AI 可请求' : 'AI 默认看不到',
    capabilities.confirmation === 'allow_once' ? '每次确认' : '',
].filter(Boolean);

const displayRunSummary = (run = {}) => {
    const review = run?.review || null;
    if (review?.type === 'body_quality') {
        const issueCount = Number(review.issueCount || (review.issues || []).length || 0);
        return issueCount > 0 ? `发现 ${issueCount} 个正文问题` : '正文检查完成';
    }
    if (review) {
        const noticeCount = Number((review.errors || []).length) + Number((review.warnings || []).length);
        return noticeCount > 0 ? `发现 ${noticeCount} 条格式提醒` : '格式检查完成';
    }
    return trim(run.summary || run.lastStep?.summary || run.errorMessage, '-');
};

const formatExportLine = (items = []) => items.filter(Boolean).join(' · ');

const openDefaultAgentResourceTarget = async (target = {}) => {
    const registry = globalThis.window?.appBridge?.debugUiRegistry || {};
    const panels = registry.panels || {};
    const panelName = trim(target?.panel);
    if (!panelName) return false;
    const panel = panels[panelName];
    if (!panel) return false;
    if (panelName === 'presetPanel') {
        await Promise.resolve(panel.show?.({
            section: target.section || 'chatprompts',
            focus: target.focus || '',
            promptId: target.promptId || '',
        }));
        return true;
    }
    if (panelName === 'configPanel') {
        panel.show?.({ tab: target.tab || 'chat' });
        return true;
    }
    if (panelName === 'worldPanel') {
        await Promise.resolve(panel.show?.({ scope: target.scope || 'session' }));
        return true;
    }
    await Promise.resolve(panel.show?.(target.options || {}));
    return true;
};

export const formatAgentCenterExportText = (view = {}) => {
    const meta = view?.meta || {};
    const lines = [
        'Agent Center 导出',
        '',
        formatExportLine([
            `待确认 ${Number(meta.pending || 0)}`,
            `运行中 ${Number(meta.activeRuns || 0)}`,
            `未读失败 ${Number(meta.unreadFailedRuns || 0)}`,
            `Agent ${Number(meta.enabledAgents || 0)}/${Number(meta.agents || 0)}`,
            `提示词 ${Number(meta.enabledPromptModules || 0)}/${Number(meta.promptModules || 0)}`,
            `诊断 ${Number(meta.diagnosticViews || 0)}`,
            `资源 ${Number(meta.resources || 0)}`,
            `工具 ${Number(meta.tools || 0)}`,
        ]),
        '',
        '[待确认]',
    ];
    const pending = Array.isArray(view?.pending) ? view.pending : [];
    if (!pending.length) lines.push('无');
    pending.forEach((item, index) => {
        lines.push(formatExportLine([
            `#${index + 1}`,
            displayToolName(item.toolName),
            displayStatusLabel(item.status),
            item.sessionId ? `范围：${item.sessionId}` : '',
            item.resumeStatus ? `执行：${displayStatusLabel(item.resumeStatus)}` : '',
        ]));
    });

    lines.push('', '[活动]');
    const runs = Array.isArray(view?.activity?.runs) ? view.activity.runs : [];
    if (!runs.length) lines.push('无');
    runs.forEach((run, index) => {
        lines.push(formatExportLine([
            `#${index + 1}`,
            run.title || displayAgentKind(run.kind),
            displayStatusLabel(run.status),
            run.sessionId ? `范围：${run.sessionId}` : '',
            displayRunSummary(run),
        ]));
    });

    lines.push('', '[Agent]');
    const agents = Array.isArray(view?.agents) ? view.agents : [];
    if (!agents.length) lines.push('无');
    agents.forEach(agent => {
        lines.push(formatExportLine([
            agent.title || displayAgentFeature(agent.id),
            agent.enabled ? '已开启' : '已关闭',
            agent.implemented ? '可使用' : '规划中',
            agent.triggerLabel ? `触发：${agent.triggerLabel}` : '',
            agent.modelLabel ? `模型：${agent.modelLabel}` : '',
        ]));
    });

    lines.push('', '[提示词]');
    const promptModules = Array.isArray(view?.promptModules) ? view.promptModules : [];
    if (!promptModules.length) lines.push('无');
    promptModules.forEach(item => {
        lines.push(formatExportLine([
            item.title || displayAgentFeature(item.id),
            item.enabled ? '已开启' : '已关闭',
            item.promptRefs?.length ? `提示词 ${item.promptRefs.length}` : '',
            item.summary,
        ]));
    });

    lines.push('', '[诊断]');
    const diagnosticViews = Array.isArray(view?.diagnosticViews) ? view.diagnosticViews : [];
    if (!diagnosticViews.length) lines.push('无');
    diagnosticViews.forEach(item => {
        lines.push(formatExportLine([
            item.title || item.id,
            item.implemented ? '可使用' : '规划中',
            item.summary,
        ]));
    });

    lines.push('', '[资源]');
    const resources = Array.isArray(view?.resources) ? view.resources : [];
    if (!resources.length) lines.push('无');
    resources.forEach(resource => {
        lines.push(formatExportLine([
            resource.title || resource.id,
            resource.group ? `分组：${resource.group}` : '',
            resource.status ? `状态：${resource.status}` : '',
            resource.summary,
        ]));
    });

    const safety = view?.safety || {};
    const gate = safety.sessionGate || {};
    const ruleSummary = safety.permissionRuleSummary || {};
    lines.push('', '[安全]');
    lines.push(formatExportLine([
        gate.enabled ? '当前会话工具：已开启' : '当前会话工具：已关闭',
        gate.networkAllowed ? '允许联网继续' : '不会联网继续',
        gate.realRunnerAllowed ? '允许真实继续生成' : '不会自动继续生成',
    ]));
    lines.push(`工具白名单：${list(gate.allowedTools).map(displayToolName).join('、') || '无'}`);
    lines.push(`权限规则：${Number(ruleSummary.total || 0)} 条`);
    lines.push(`规则优先顺序：${trim(ruleSummary.orderText, '全局 > 角色卡 > 当前会话 > Agent > 插件 > 默认')}`);
    if (Number(ruleSummary.conflictCount || 0) > 0) {
        lines.push(`规则冲突：${Number(ruleSummary.conflictCount || 0)} 组`);
    }
    return lines.join('\n').trim();
};

export class AgentCenterPanel {
    constructor({
        getActions = () => globalThis.window?.appBridge?.debugUiRegistry?.actions || {},
        confirm = appConfirm,
        choice = appChoice,
        openConfig = (options = {}) => globalThis.window?.appBridge?.debugUiRegistry?.panels?.configPanel?.show?.(options),
        openResourceTarget = openDefaultAgentResourceTarget,
        exportTextFile = (text, filename, successLabel) => exportDebugTextFile({
            text,
            filename,
            successLabel,
            onSuccess: (message) => globalThis.window?.toastr?.success?.(message),
        }),
        getFailureSeenAt = () => 0,
        markFailureSeen = () => {},
    } = {}) {
        this.getActions = getActions;
        this.confirm = confirm;
        this.choice = choice;
        this.openConfig = openConfig;
        this.openResourceTarget = openResourceTarget;
        this.exportTextFile = exportTextFile;
        this.getFailureSeenAt = getFailureSeenAt;
        this.markFailureSeen = markFailureSeen;
        this.overlayElement = null;
        this.panelElement = null;
        this.contentElement = null;
        this.metaElement = null;
        this.tabsElement = null;
        this.activeTab = 'agents';
        this.activityStatus = '';
        this.activityKind = '';
        this.surface = '';
        this.view = buildAgentCenterView();
        this.lastError = '';
        this.boundConfigProfileChanged = null;
        this.boundMemoryStorageModeChanged = null;
        this.floatingAgentId = '';
        this.floatingAgentFlipped = false;
        this.replyCheckPreviewTarget = 'auto';
    }

    ensureStyle() {
        if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = PANEL_CSS;
        document.head.appendChild(style);
    }

    ensureDom() {
        if (this.overlayElement || typeof document === 'undefined') return;
        this.ensureStyle();
        const overlay = document.createElement('div');
        overlay.className = 'agent-center-overlay';
        overlay.dataset.agentCenterOverlay = 'true';
        overlay.innerHTML = `
            <section class="agent-center-panel" role="dialog" aria-modal="true" aria-labelledby="agent-center-title">
                <header class="agent-center-header">
                    <div class="agent-center-title">
                        <span class="agent-center-title-mark" aria-hidden="true">A</span>
                        <div style="min-width:0;">
                            <strong id="agent-center-title">Agent Center</strong>
                            <div class="agent-center-meta"></div>
                        </div>
                    </div>
                    <div class="agent-center-actions">
                        <button type="button" class="agent-center-button" data-action="refresh" title="刷新" aria-label="刷新">${ICONS.refresh}</button>
                        <button type="button" class="agent-center-button" data-action="export" title="导出" aria-label="导出">${ICONS.export}</button>
                        <button type="button" class="agent-center-button" data-action="close" title="关闭" aria-label="关闭">${ICONS.close}</button>
                    </div>
                </header>
                <nav class="agent-center-tabs" aria-label="Agent Center tabs"></nav>
                <main class="agent-center-content"></main>
            </section>
        `;
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) this.hide();
        });
        overlay.querySelector('[data-action="close"]')?.addEventListener('click', () => this.hide());
        overlay.querySelector('[data-action="refresh"]')?.addEventListener('click', () => this.refresh());
        overlay.querySelector('[data-action="export"]')?.addEventListener('click', () => this.handleExport());
        this.overlayElement = overlay;
        this.panelElement = overlay.querySelector('.agent-center-panel');
        this.contentElement = overlay.querySelector('.agent-center-content');
        this.metaElement = overlay.querySelector('.agent-center-meta');
        this.tabsElement = overlay.querySelector('.agent-center-tabs');
        document.body.appendChild(overlay);
        this.boundConfigProfileChanged = (event) => this.handleConfigProfileChanged(event);
        globalThis.window?.addEventListener?.('config-profile-changed', this.boundConfigProfileChanged);
        this.boundMemoryStorageModeChanged = () => {
            if (this.isVisible()) this.refresh();
        };
        globalThis.window?.addEventListener?.('memory-storage-mode-changed', this.boundMemoryStorageModeChanged);
    }

    async callAction(name, args = undefined, fallback = null) {
        const actions = this.getActions?.() || {};
        const fn = actions?.[name];
        if (typeof fn !== 'function') return fallback;
        try {
            return await Promise.resolve(args === undefined ? fn() : fn(args));
        } catch (err) {
            this.lastError = trim(err?.message || err, `${name} failed`);
            return fallback;
        }
    }

    async handleExport() {
        const text = formatAgentCenterExportText(this.view);
        const ok = await exportDebugTextFlow({
            text,
            filenamePrefix: 'agent-center',
            successLabel: 'Agent Center 已导出',
            emptyMessage: '暂无 Agent 记录可导出',
            exportFailureToast: 'Agent Center 导出失败',
            exportFailurePrefix: 'Agent Center 导出失败: ',
            buildFilename: buildDebugTextFilename,
            exportTextFile: this.exportTextFile,
            onWarning: (message) => globalThis.window?.toastr?.warning?.(message),
            onLogWarn: (message) => {
                this.lastError = message;
            },
            onError: (message) => {
                this.lastError = message;
                globalThis.window?.toastr?.error?.(message);
            },
        });
        return ok;
    }

    async collectView(options = {}) {
        this.lastError = '';
        const opts = options && typeof options === 'object' ? options : {};
        const hasSurface = Object.prototype.hasOwnProperty.call(opts, 'surface');
        const hasActivityStatus = Object.prototype.hasOwnProperty.call(opts, 'activityStatus') ||
            Object.prototype.hasOwnProperty.call(opts, 'status');
        const activityStatus = normalizeActivityStatus(hasActivityStatus
            ? (opts.activityStatus || opts.status || '')
            : this.activityStatus);
        const surface = normalizeSurface(hasSurface ? opts.surface : this.surface);
        const failureSeenAt = Number(this.getFailureSeenAt?.({ surface }) || 0) || 0;
        const activityKind = String(this.activityKind || '').trim();
        const agentRunView = await this.callAction('listAgentRunView', {
            limit: 50,
            failureSeenAt,
            ...(activityStatus ? { status: activityStatus } : {}),
            ...(activityKind ? { kind: activityKind } : {}),
            ...(surface ? { surface } : {}),
        }, null);
        const [
            pendingPermissions,
            contactProfilePendingUpdates,
            tools,
            permissionRules,
            sessionGate,
            experimentStatus,
            continuationCommitPolicy,
            agentModelProfiles,
            resourceStatus,
            agentCenterSettings,
            agentProfileView,
            memoryMode,
            memoryAgentPromptConfig,
        ] = await Promise.all([
            this.callAction('listProviderToolPendingPermissions', { limit: 100 }, []),
            this.callAction('listContactProfilePendingUpdates', undefined, []),
            this.callAction('listAgentTools', undefined, []),
            this.callAction('listAgentPermissionRules', undefined, []),
            this.callAction('getProviderToolSessionGate', undefined, null),
            this.callAction('getProviderToolExperimentStatus', undefined, null),
            this.callAction('getProviderContinuationCommitPolicy', undefined, null),
            this.callAction('listAgentModelProfiles', undefined, []),
            this.callAction('listAgentResourceStatus', undefined, {}),
            this.callAction('getAgentCenterSettings', undefined, null),
            this.callAction('getAgentCenterProfileView', undefined, null),
            this.callAction('getMemoryStorageMode', undefined, 'table'),
            this.callAction('getMemoryAgentPromptConfig', undefined, null),
        ]);
        const agentFeatureSettings = await this.callAction('getAgentFeatureSettings', undefined, null);
        const view = buildAgentCenterView({
            pendingPermissions,
            contactProfilePendingUpdates,
            agentRunView,
            tools,
            agentFeatureSettings,
            agentModelProfiles,
            permissionRules,
            sessionGate,
            experimentStatus,
            continuationCommitPolicy,
            resourceStatus,
            agentCenterSettings,
            agentProfileView,
            memoryMode,
        });
        view.memoryAgentPromptConfig = memoryAgentPromptConfig;
        return view;
    }

    show(options = {}) {
        const opts = options && typeof options === 'object' ? options : {};
        const tab = Object.prototype.hasOwnProperty.call(opts, 'tab') ? opts.tab : this.activeTab;
        this.ensureDom();
        this.activeTab = trim(tab, 'agents');
        this.activityStatus = normalizeActivityStatus(opts.activityStatus || opts.status || '');
        this.surface = normalizeSurface(opts.surface || '');
        if (this.overlayElement) this.overlayElement.style.display = 'flex';
        this.refresh();
    }

    hide() {
        closeCustomSelectMenu();
        this.floatingAgentId = '';
        this.floatingAgentFlipped = false;
        if (this.overlayElement) this.overlayElement.style.display = 'none';
    }

    isVisible() {
        return Boolean(this.overlayElement && this.overlayElement.style.display !== 'none');
    }

    handleConfigProfileChanged(event = null) {
        const tab = trim(event?.detail?.tab || 'chat');
        if (tab && tab !== 'chat') return null;
        if (this.activeTab !== 'agents' || !this.isVisible()) return null;
        return this.refresh();
    }

    async refresh() {
        this.ensureDom();
        this.view = await this.collectView();
        if (this.activeTab === 'activity' && normalizeActivityStatus(this.activityStatus) === 'failure') {
            this.markCurrentFailuresSeen();
        }
        this.render();
    }

    setActiveTab(tab = 'pending', { resetActivityStatus = false } = {}) {
        const next = trim(tab, 'pending');
        if (!this.view.tabs.some(item => item.id === next)) return;
        this.activeTab = next;
        this.floatingAgentId = '';
        this.floatingAgentFlipped = false;
        if (resetActivityStatus) this.activityStatus = '';
        this.render();
    }

    setActivityStatus(status = '') {
        this.activeTab = 'activity';
        this.floatingAgentId = '';
        this.floatingAgentFlipped = false;
        this.activityStatus = normalizeActivityStatus(status);
        this.refresh();
    }

    setActivityKind(kind = '') {
        this.activeTab = 'activity';
        this.activityKind = String(kind || '').trim();
        this.refresh();
    }

    markCurrentFailuresSeen() {
        const newestFailureAt = Number(this.view?.meta?.newestFailureAt || this.view?.activity?.meta?.scopedNewestFailureAt || this.view?.activity?.meta?.newestFailureAt || 0) || 0;
        this.markFailureSeen?.({
            surface: this.surface,
            at: Math.max(Date.now(), newestFailureAt),
        });
        if (this.view?.meta) this.view.meta.unreadFailedRuns = 0;
        if (this.view?.activity?.meta) {
            this.view.activity.meta.unreadFailures = 0;
            this.view.activity.meta.scopedUnreadFailures = 0;
        }
    }

    renderTabs() {
        if (!this.tabsElement) return;
        this.tabsElement.innerHTML = this.view.tabs.map((tab) => `
            <button
                type="button"
                class="agent-center-tab${tab.id === this.activeTab ? ' is-active' : ''}"
                data-tab="${escapeHtml(tab.id)}"
            >${tabIcon(tab.id)}<span>${escapeHtml(tab.label)}${tab.count ? ` ${Number(tab.count)}` : ''}</span></button>
        `).join('');
        this.tabsElement.querySelectorAll('[data-tab]').forEach((button) => {
            button.addEventListener('click', () => this.setActiveTab(button.dataset.tab, {
                resetActivityStatus: button.dataset.tab === 'activity',
            }));
        });
    }

    renderMeta() {
        if (!this.metaElement) return;
        const meta = this.view.meta || {};
        this.metaElement.textContent = formatMeta([
            `待确认 ${Number(meta.pending || 0)}`,
            `活动中 ${Number(meta.activeRuns || 0)}`,
            `失败 ${Number(meta.failedRuns || 0)}`,
            `Agent ${Number(meta.enabledAgents || 0)}/${Number(meta.agents || 0)}`,
            `提示词 ${Number(meta.enabledPromptModules || 0)}/${Number(meta.promptModules || 0)}`,
            `诊断 ${Number(meta.diagnosticViews || 0)}`,
            `资源 ${Number(meta.resources || 0)}`,
            `工具 ${Number(meta.tools || 0)}`,
            this.surface ? `范围 ${this.surface}` : '',
            meta.sessionGateEnabled ? '当前会话已开启' : '当前会话未开启',
        ]);
    }

    getAgentModelSelectValue(agent = {}) {
        const mode = trim(agent.modelMode, 'follow_current');
        if (mode === 'none') return 'none';
        if (mode === 'profile' && trim(agent.modelProfileId)) return `profile:${trim(agent.modelProfileId)}`;
        return 'follow_current';
    }

    renderAgentModelSelect(agent = {}) {
        const selectedValue = this.getAgentModelSelectValue(agent);
        const profiles = Array.isArray(this.view.agentModelProfiles) ? this.view.agentModelProfiles : [];
        const options = [
            { value: 'follow_current', label: '跟随当前聊天模型' },
            { value: 'none', label: '不调用模型' },
            ...profiles.map(profile => ({
                value: `profile:${trim(profile.id)}`,
                label: trim(profile.label || [
                    profile.name,
                    [profile.provider, profile.model].map(trim).filter(Boolean).join(' / '),
                ].filter(Boolean).join(' · '), profile.id),
            })).filter(option => option.value !== 'profile:'),
        ];
        if (agent.modelMode === 'profile' && selectedValue !== 'profile:' &&
            !options.some(option => option.value === selectedValue)) {
            options.push({
                value: selectedValue,
                label: agent.modelLabel || `指定模型：${trim(agent.modelProfileId)}`,
            });
        }
        const disabled = !agent.implemented || !agent.supportsModel;
        return `
            <div class="agent-center-model-control">
                <select
                    class="agent-center-model-select"
                    data-agent-feature-model-select="${escapeHtml(agent.id)}"
                    aria-label="${escapeHtml(`${agent.title || displayAgentFeature(agent.id)}模型`)}"
                    style="display:none;"
                    ${disabled ? 'disabled' : ''}
                >
                    ${options.map(option => `
                        <option value="${escapeHtml(option.value)}"${option.value === selectedValue ? ' selected' : ''}>${escapeHtml(option.label)}</option>
                    `).join('')}
                </select>
                <button
                    type="button"
                    class="world-app-select-btn agent-center-model-select-btn"
                    data-agent-feature-model-button="${escapeHtml(agent.id)}"
                    ${disabled ? 'disabled' : ''}
                >
                    <span class="pp-custom-select-label" data-custom-select-label>${escapeHtml(agent.modelLabel || '不调用模型')}</span>
                    <span class="world-app-select-btn-chevron">▾</span>
                </button>
                <button
                    type="button"
                    class="agent-center-model-manage"
                    data-agent-feature-model-manage="${escapeHtml(agent.id)}"
                    ${agent.supportsModel && agent.implemented ? '' : 'disabled'}
                >管理</button>
            </div>
            ${agent.modelMode === 'profile' && trim(agent.modelProfileId) ? (() => {
                const profile = profiles.find(item => item.id === trim(agent.modelProfileId));
                const shownModel = agent.modelOverride || trim(profile?.model || '');
                return `
                <div class="agent-center-model-override-row">
                    <input
                        type="text"
                        class="agent-center-model-override"
                        data-agent-feature-model-override="${escapeHtml(agent.id)}"
                        data-profile-model="${escapeHtml(trim(profile?.model || ''))}"
                        value="${escapeHtml(shownModel)}"
                        placeholder="模型（默认该配置保存的模型，可改）"
                        aria-label="模型"
                        ${disabled ? 'disabled' : ''}
                    />
                    <button type="button" class="agent-center-card-action" data-agent-model-pick="${escapeHtml(agent.id)}" ${disabled ? 'disabled' : ''}>▾</button>
                </div>
                <div class="agent-center-model-menu" data-agent-model-menu="${escapeHtml(agent.id)}" hidden></div>
            `; })() : ''}
        `;
    }

    getAgentCards() {
        return this.view.agentCards || this.view.agents || [];
    }

    getPromptModuleCards() {
        return this.view.promptModules || [];
    }

    getDiagnosticCards() {
        return this.view.diagnosticViews || [];
    }

    getAllCenterCards() {
        return [
            ...this.getAgentCards(),
            ...this.getPromptModuleCards(),
            ...this.getDiagnosticCards(),
        ];
    }

    getAgentCardById(agentId = '') {
        const id = trim(agentId);
        return (this.getAllCenterCards() || []).find(item => item.id === id) || null;
    }

    renderAgentRuntimeState(agent = {}) {
        const state = agent.runtimeState || null;
        if (!state) return '';
        return `
            <div class="agent-center-agent-section">
                <div class="agent-center-agent-section-title">最近运行</div>
                <div class="agent-center-card-sub">${escapeHtml(formatMeta([
                    displayAgentKind(state.kind),
                    displayStatusLabel(state.status),
                    state.summary,
                ]))}</div>
            </div>
        `;
    }

    getAgentProfile(profileType = 'sysprompt') {
        const view = this.view.agentProfileView || {};
        const key = trim(profileType, 'sysprompt');
        return view?.[key]?.profile || null;
    }

    getAgentPromptConfig(agent = {}, ref = {}) {
        const profileType = trim(ref.profileType, 'sysprompt');
        const profile = this.getAgentProfile(profileType);
        const agentProfile = profile?.agents?.[trim(ref.agentId || agent.id)] || null;
        const prompt = agentProfile?.prompts?.[trim(ref.id)] || null;
        return prompt && typeof prompt === 'object' ? prompt : null;
    }

    renderSelectOptions(options = [], selectedValue = '') {
        const selected = String(selectedValue ?? '');
        return options.map(option => `
            <option value="${escapeHtml(option.value)}"${String(option.value) === selected ? ' selected' : ''}>${escapeHtml(option.label)}</option>
        `).join('');
    }

    renderAgentPromptEditor(agent = {}, ref = {}) {
        const prompt = this.getAgentPromptConfig(agent, ref) || {};
        const profileType = trim(ref.profileType, 'sysprompt');
        const profileView = this.view.agentProfileView?.[profileType] || {};
        const presetId = trim(profileView.presetId);
        const promptId = trim(ref.id);
        const hasPlacement = PROMPT_REFS_WITH_PLACEMENT.has(promptId) || prompt.position !== undefined;
        const positionValue = prompt.position !== undefined ? prompt.position : (promptId === 'summary' ? 1 : 0);
        const depthValue = prompt.depth !== undefined ? prompt.depth : (promptId === 'summary' ? 1 : 0);
        const roleValue = prompt.role !== undefined ? prompt.role : 0;
        return `
            <div
                class="agent-center-agent-editor"
                data-agent-prompt-editor="${escapeHtml(promptId)}"
                data-agent-id="${escapeHtml(agent.id)}"
                data-agent-prompt-profile-type="${escapeHtml(profileType)}"
                data-agent-prompt-preset-id="${escapeHtml(presetId)}"
            >
                <div class="agent-center-agent-editor-row">
                    <label class="agent-center-agent-check">
                        <input type="checkbox" data-agent-prompt-enabled ${prompt.enabled !== false ? 'checked' : ''}>
                        <span>${escapeHtml(ref.label || promptId)}</span>
                    </label>
                    <button type="button" class="agent-center-card-action is-primary" data-agent-prompt-save="${escapeHtml(promptId)}">保存</button>
                </div>
                ${hasPlacement ? `
                    <div class="agent-center-agent-field-grid">
                        <div class="agent-center-agent-field">
                            <label>注入位置</label>
                            <select class="agent-center-agent-input" data-agent-prompt-position>
                                ${this.renderSelectOptions(PROMPT_POSITION_OPTIONS, positionValue)}
                            </select>
                        </div>
                        <div class="agent-center-agent-field">
                            <label>深度</label>
                            <input class="agent-center-agent-input" type="number" min="0" inputmode="numeric" data-agent-prompt-depth value="${escapeHtml(depthValue)}">
                        </div>
                        <div class="agent-center-agent-field">
                            <label>角色</label>
                            <select class="agent-center-agent-input" data-agent-prompt-role>
                                ${this.renderSelectOptions(PROMPT_ROLE_OPTIONS, roleValue)}
                            </select>
                        </div>
                    </div>
                ` : ''}
                <textarea class="agent-center-agent-textarea" data-agent-prompt-rules>${escapeHtml(prompt.rules || '')}</textarea>
            </div>
        `;
    }

    renderAgentPromptRefs(agent = {}) {
        const refs = Array.isArray(agent.promptRefs) ? agent.promptRefs : [];
        if (!refs.length) return '';
        return `
            <div class="agent-center-agent-section">
                <div class="agent-center-agent-section-title">提示词</div>
                ${refs.map(ref => this.renderAgentPromptEditor(agent, ref)).join('')}
            </div>
        `;
    }

    getMemoryAgentSettings() {
        const profile = this.getAgentProfile('openai');
        const agent = profile?.agents?.memory_table_agent || null;
        return agent?.settings && typeof agent.settings === 'object' ? agent.settings : {};
    }

    getMemoryAgentPromptConfig() {
        const cfg = this.view?.memoryAgentPromptConfig && typeof this.view.memoryAgentPromptConfig === 'object'
            ? this.view.memoryAgentPromptConfig
            : {};
        return {
            templateId: trim(cfg.templateId),
            templateName: trim(cfg.templateName, '默认记忆模板'),
            template: typeof cfg.template === 'string' ? cfg.template : '{{tableData}}',
            wrapper: typeof cfg.wrapper === 'string' ? cfg.wrapper : '<memories>\n{{tableData}}\n</memories>',
            position: trim(cfg.position, 'before_latest_user'),
        };
    }

    renderMemoryAgentEditor(agent = {}) {
        if (agent.id !== 'memory_table_agent') return '';
        const profileView = this.view?.agentProfileView?.openai || {};
        const settings = this.getMemoryAgentSettings();
        const prompt = this.getMemoryAgentPromptConfig();
        return `
            <div
                class="agent-center-agent-section agent-center-agent-editor"
                data-memory-agent-editor="memory_table_agent"
                data-memory-agent-preset-id="${escapeHtml(profileView.presetId || '')}"
                data-memory-agent-template-id="${escapeHtml(prompt.templateId || '')}"
            >
                <div class="agent-center-agent-section-title">记忆提示词与注入</div>
                <div class="agent-center-card-sub">${escapeHtml(prompt.templateName)} · 模板使用 {{tableData}} 插入表格内容</div>
                <div class="agent-center-agent-field-grid">
                    <div class="agent-center-agent-field">
                        <label>记忆数据提示词位置</label>
                        <select class="agent-center-agent-input" data-memory-data-position>
                            ${this.renderSelectOptions(MEMORY_POSITION_OPTIONS, settings.dataPosition || '')}
                        </select>
                    </div>
                    <div class="agent-center-agent-field">
                        <label>数据深度</label>
                        <input class="agent-center-agent-input" type="number" min="0" inputmode="numeric" data-memory-data-depth value="${escapeHtml(settings.dataDepth ?? 0)}">
                    </div>
                    <div class="agent-center-agent-field">
                        <label>写表指导提示词位置</label>
                        <select class="agent-center-agent-input" data-memory-guide-position>
                            ${this.renderSelectOptions(MEMORY_POSITION_OPTIONS, settings.guidePosition || '')}
                        </select>
                    </div>
                    <div class="agent-center-agent-field">
                        <label>指导深度</label>
                        <input class="agent-center-agent-input" type="number" min="0" inputmode="numeric" data-memory-guide-depth value="${escapeHtml(settings.guideDepth ?? 0)}">
                    </div>
                    <div class="agent-center-agent-field">
                        <label>表格内容模板位置</label>
                        <select class="agent-center-agent-input" data-memory-prompt-position>
                            ${this.renderSelectOptions(MEMORY_POSITION_OPTIONS, prompt.position || 'before_latest_user')}
                        </select>
                    </div>
                    <div class="agent-center-agent-field is-wide">
                        <label>表格内容模板</label>
                        <textarea class="agent-center-agent-textarea is-compact" data-memory-prompt-template>${escapeHtml(prompt.template || '')}</textarea>
                    </div>
                    <div class="agent-center-agent-field is-wide">
                        <label>包裹模板</label>
                        <textarea class="agent-center-agent-textarea is-compact" data-memory-prompt-wrapper>${escapeHtml(prompt.wrapper || '')}</textarea>
                    </div>
                </div>
                <div class="agent-center-card-actions">
                    <button type="button" class="agent-center-card-action is-primary" data-memory-agent-save="memory_table_agent">保存记忆设置</button>
                </div>
            </div>
        `;
    }

    renderReplyCheckPromptInfo(agent = {}) {
        if (agent.id !== 'reply_check') return '';
        const promptText = [
            '固定检查指令：只修复标签、顺序、闭合、缺失字段和时间等格式问题；不改写剧情或正文语义。',
            '',
            '运行时按触发目标选择最小格式规则：',
            '- 私聊：QQ聊天格式 + 私聊格式',
            '- 群聊：QQ聊天格式 + 群聊格式',
            '- 动态：动态发布或动态评论格式',
            '- 生图 / 记忆表格：只使用对应标签格式',
            '- 创意写作：默认不注入聊天格式',
        ].join('\n');
        return `
            <div class="agent-center-agent-section agent-center-agent-editor">
                <div class="agent-center-agent-section-title">检查提示词</div>
                <div class="agent-center-agent-field">
                    <label>预览格式目标</label>
                    <select class="agent-center-agent-input" data-reply-check-preview-target>
                        ${this.renderSelectOptions(REPLY_CHECK_PREVIEW_TARGET_OPTIONS, this.replyCheckPreviewTarget || 'auto')}
                    </select>
                </div>
                <div class="agent-center-agent-prompt-preview">${escapeHtml(promptText)}</div>
            </div>
        `;
    }

    renderAgentSettingRefs(agent = {}) {
        const refs = list(agent.settingRefs);
        if (!refs.length) return '';
        return `
            <div class="agent-center-agent-section">
                <div class="agent-center-agent-section-title">可设定项目</div>
                <div class="agent-center-agent-mini-list">
                    ${refs.map(label => `<span class="agent-center-agent-mini-item">${escapeHtml(label)}</span>`).join('')}
                </div>
            </div>
        `;
    }

    renderAgentResourceRefs(agent = {}) {
        const refs = list(agent.resourceRefs);
        if (!refs.length) return '';
        const resources = this.view.resources || [];
        return `
            <div class="agent-center-agent-section">
                <div class="agent-center-agent-section-title">关联资源</div>
                <div class="agent-center-card-actions" style="margin-top:0;">
                    ${refs.map(resourceId => {
                        const resource = resources.find(item => item.id === resourceId) || { id: resourceId, title: resourceId };
                        return `<button type="button" class="agent-center-card-action" data-agent-resource-open="${escapeHtml(resource.id)}">${escapeHtml(resource.title || resource.id)}</button>`;
                    }).join('')}
                </div>
            </div>
        `;
    }

    renderAgentPromptPreviewAction(agent = {}) {
        if (!agent?.implemented) return '';
        return `
            <div class="agent-center-agent-section">
                <div class="agent-center-agent-section-title">完整请求预览</div>
                <div class="agent-center-card-sub">根据该 Agent 的当前触发场景构建完整提示词和请求参数；只预览，不发送。</div>
                <div class="agent-center-card-actions" style="margin-top:0;">
                    <button type="button" class="agent-center-card-action is-primary" data-agent-prompt-preview="${escapeHtml(agent.id || '')}">预览提示词</button>
                </div>
            </div>
        `;
    }

    renderAgentFeatureSettings(agent = {}) {
        if (!isFeatureAgentCard(agent)) return '';
        return `
            <div class="agent-center-agent-settings">
                ${agent.supportsTriggerMode ? `
                    <div class="agent-center-setting-row">
                        <span class="agent-center-setting-label">触发</span>
                        <span class="agent-center-setting-value">${escapeHtml(agent.triggerLabel || '自动触发')}</span>
                        <button type="button" class="agent-center-card-action" data-agent-feature-trigger="${escapeHtml(agent.id)}" ${agent.implemented ? '' : 'disabled'}>设置</button>
                    </div>
                ` : ''}
                <div class="agent-center-setting-row is-model">
                    <span class="agent-center-setting-label">模型</span>
                    ${agent.supportsModel
                        ? this.renderAgentModelSelect(agent)
                        : `<span class="agent-center-setting-value">${escapeHtml(agent.modelLabel || '不直接调用模型')}</span>`}
                </div>
            </div>
        `;
    }

    renderAgentFront(agent = {}) {
        const title = agent.title || displayAgentFeature(agent.id);
        const isDiagnosticView = trim(agent.cardGroup || agent.category) === 'diagnostic';
        const enableButton = isDiagnosticView || agent.enabled === true
            ? ''
            : isFeatureAgentCard(agent)
                ? `
                    <button
                        type="button"
                        class="agent-center-switch"
                        data-agent-feature-action="enable"
                        data-agent-feature-id="${escapeHtml(agent.id)}"
                        ${agent.implemented ? '' : 'disabled'}
                    >${escapeHtml(agent.implemented ? '开启' : '规划中')}</button>
                `
                : `
                    <button
                        type="button"
                        class="agent-center-switch"
                        data-agent-card-action="enable"
                        data-agent-card-id="${escapeHtml(agent.id)}"
                        ${agent.implemented ? '' : 'disabled'}
                    >${escapeHtml(agent.implemented ? '开启' : '规划中')}</button>
                `;
        const stateBadge = isDiagnosticView
            ? `<span class="${escapeHtml(statusChipClass('succeeded'))}">诊断视图</span>`
            : agent.enabled
                ? `<span class="${escapeHtml(statusChipClass('running'))}">已开启</span>`
                : '';
        const promptCount = Array.isArray(agent.promptRefs) ? agent.promptRefs.length : 0;
        const runtimeState = agent.runtimeState || null;
        return `
            <div class="agent-center-agent-title-row">
                <div class="agent-center-agent-title-main">
                    <span class="agent-center-agent-badge">${escapeHtml(displayAgentCardGlyph(agent))}</span>
                    <div>
                        <div class="agent-center-card-title">${escapeHtml(title)}</div>
                        <div class="agent-center-card-sub">${escapeHtml(agent.summary || '')}</div>
                    </div>
                </div>
                ${enableButton || stateBadge}
            </div>
            ${renderChips([
                { label: agent.implemented ? '可使用' : '规划中', className: statusChipClass(agent.implemented ? 'succeeded' : 'pending') },
                isDiagnosticView ? null : { label: agent.enabled ? '已开启' : '已关闭', className: statusChipClass(agent.enabled ? 'running' : 'denied') },
                promptCount ? { label: `提示词 ${promptCount}` } : null,
                runtimeState ? { label: displayStatusLabel(runtimeState.status), className: statusChipClass(runtimeState.status) } : null,
            ])}
            <div class="agent-center-card-sub">${escapeHtml((Array.isArray(agent.detail) ? agent.detail[0] : '') || agent.summary || '')}</div>
        `;
    }

    renderAgentBack(agent = {}) {
        const detail = Array.isArray(agent.detail) ? agent.detail : [];
        return `
            <div class="agent-center-agent-title-row">
                <div>
                    <div class="agent-center-card-title">${escapeHtml(agent.detailTitle || agent.title || displayAgentFeature(agent.id))}</div>
                    <div class="agent-center-card-sub">${escapeHtml(agent.category ? `分类：${displayCardCategory(agent.category)}` : '卡片详情')}</div>
                </div>
                <button type="button" class="agent-center-card-action" data-agent-float-flip>返回</button>
            </div>
            ${detail.length ? `
                <div class="agent-center-agent-section">
                    <div class="agent-center-agent-section-title">说明</div>
                    ${detail.map(line => `<div class="agent-center-card-sub">${escapeHtml(line)}</div>`).join('')}
                </div>
            ` : ''}
            ${this.renderAgentFeatureSettings(agent)}
            ${this.renderAgentSettingRefs(agent)}
            ${this.renderMemoryAgentEditor(agent)}
            ${this.renderAgentPromptRefs(agent)}
            ${this.renderAgentResourceRefs(agent)}
            ${this.renderAgentRuntimeState(agent)}
        `;
    }

    renderFloatingAgentFront(agent = {}) {
        const detail = Array.isArray(agent.detail) ? agent.detail : [];
        const isDiagnosticView = trim(agent.cardGroup || agent.category) === 'diagnostic';
        const promptCount = Array.isArray(agent.promptRefs) ? agent.promptRefs.length : 0;
        const runtimeState = agent.runtimeState || null;
        return `
            <div class="agent-center-agent-title-row">
                <div class="agent-center-agent-title-main">
                    <span class="agent-center-agent-badge">${escapeHtml(displayAgentCardGlyph(agent))}</span>
                    <div>
                        <div class="agent-center-card-title">${escapeHtml(agent.title || displayAgentFeature(agent.id))}</div>
                        <div class="agent-center-card-sub">${escapeHtml(agent.summary || '')}</div>
                    </div>
                </div>
                <div class="agent-center-floating-toolbar">
                    <button type="button" class="agent-center-icon-button" data-agent-float-flip title="翻转" aria-label="翻转">${ICONS.refresh}</button>
                    <button type="button" class="agent-center-icon-button" data-agent-float-close title="关闭" aria-label="关闭">${ICONS.close}</button>
                </div>
            </div>
            ${renderChips([
                { label: displayCardCategory(agent.category), className: statusChipClass('pending') },
                { label: agent.implemented ? '可使用' : '规划中', className: statusChipClass(agent.implemented ? 'succeeded' : 'pending') },
                isDiagnosticView ? { label: '诊断视图' } : { label: agent.enabled ? '已开启' : '已关闭', className: statusChipClass(agent.enabled ? 'running' : 'denied') },
                promptCount ? { label: `提示词 ${promptCount}` } : null,
                runtimeState ? { label: displayStatusLabel(runtimeState.status), className: statusChipClass(runtimeState.status) } : null,
            ])}
            <div class="agent-center-agent-section">
                <div class="agent-center-agent-section-title">说明</div>
                ${(detail.length ? detail : [agent.summary]).filter(Boolean).map(line => `<div class="agent-center-card-sub">${escapeHtml(line)}</div>`).join('')}
            </div>
            ${this.renderAgentSettingRefs(agent)}
            ${this.renderAgentRuntimeState(agent)}
        `;
    }

    renderFloatingAgentBack(agent = {}) {
        return `
            <div class="agent-center-agent-title-row">
                <div>
                    <div class="agent-center-card-title">${escapeHtml(agent.title || displayAgentFeature(agent.id))}</div>
                    <div class="agent-center-card-sub">配置</div>
                </div>
                <div class="agent-center-floating-toolbar">
                    <button type="button" class="agent-center-icon-button" data-agent-float-flip title="翻转" aria-label="翻转">${ICONS.refresh}</button>
                    <button type="button" class="agent-center-icon-button" data-agent-float-close title="关闭" aria-label="关闭">${ICONS.close}</button>
                </div>
            </div>
            ${this.renderAgentFeatureSettings(agent)}
            ${this.renderAgentPromptPreviewAction(agent)}
            ${this.renderReplyCheckPromptInfo(agent)}
            ${this.renderMemoryAgentEditor(agent)}
            ${this.renderAgentPromptRefs(agent)}
            ${this.renderAgentResourceRefs(agent)}
            ${(!isFeatureAgentCard(agent) && agent.id !== 'memory_table_agent' && !(Array.isArray(agent.promptRefs) && agent.promptRefs.length) && !(Array.isArray(agent.resourceRefs) && agent.resourceRefs.length))
                ? '<div class="agent-center-card-sub">这个卡片当前没有可编辑设置。</div>'
                : ''}
        `;
    }

    renderFloatingAgentCard() {
        const agent = this.getAgentCardById(this.floatingAgentId);
        if (!agent) return '';
        return `
            <div class="agent-center-floating-layer" data-agent-float-layer>
                <section
                    class="agent-center-floating-card${this.floatingAgentFlipped ? ' is-flipped' : ''}"
                    data-agent-accent="${escapeHtml(agent.accent || '')}"
                    role="dialog"
                    aria-modal="true"
                    aria-label="${escapeHtml(agent.title || displayAgentFeature(agent.id))}"
                >
                    <div class="agent-center-floating-inner">
                        <div class="agent-center-floating-face agent-center-floating-face-front">
                            ${this.renderFloatingAgentFront(agent)}
                        </div>
                        <div class="agent-center-floating-face agent-center-floating-face-back">
                            ${this.renderFloatingAgentBack(agent)}
                        </div>
                    </div>
                </section>
            </div>
        `;
    }

    renderCardList(cards = [], emptyMessage = '还没有可用卡片。') {
        const agents = Array.isArray(cards) ? cards : [];
        if (!agents.length) return renderEmpty(emptyMessage);
        return `<div class="agent-center-agent-list">${agents.map(agent => `
            <article
                class="agent-center-card agent-center-agent-card${agent.enabled ? ' is-agent-on' : ''}"
                data-agent-accent="${escapeHtml(agent.accent || '')}"
                data-agent-card-open="${escapeHtml(agent.id)}"
                role="button"
                tabindex="0"
            >
                ${this.renderAgentFront(agent)}
            </article>
        `).join('')}</div>`;
    }

    renderAgents() {
        return this.renderCardList(this.getAgentCards(), '还没有可启用的 Agent');
    }

    renderPromptModules() {
        return this.renderCardList(this.getPromptModuleCards(), '还没有可管理的提示词/协议模块。');
    }

    renderDiagnostics() {
        return this.renderCardList(this.getDiagnosticCards(), '还没有诊断视图。');
    }

    renderPending() {
        const items = this.view.pending || [];
        if (!items.length) {
            return renderEmpty('没有待确认请求。AI 请求工具、画像保存或变更提交前，会出现在这里。');
        }
        return `<div class="agent-center-list">${items.map(item => {
            const isProfileUpdate = item.kind === 'contact_profile_update';
            const isToolPermission = item.kind === 'tool_permission';
            const writePreview = item.writePreview || null;
            const writePreviewCommit = writePreview?.commit || null;
            const impactText = isProfileUpdate
                ? `保存会写入联系人「${item.contactId || item.sessionId || '-'}」画像，并影响后续动态弱触发、提示词上下文和 Agent 画像读取；忽略只清除本次候选，不删除旧画像。`
                : '';
            const toolImpactText = isToolPermission
                ? (writePreview
                    ? '执行一次只生成变更预览和撤销记录；不会写入记忆、变量、世界书或聊天正文。真正提交还需要再次确认。'
                    : '执行一次只处理这个工具请求；不会重放聊天、不会自动继续生成、不会直接写聊天正文。')
                : '';
            const chatEmitPreview = item.chatEmitPreview || null;
            const chatEmitCommitPreview = item.chatEmitCommitPreview || null;
            const chatEmitCommit = item.chatEmitCommit || null;
            const chatEmitMeta = chatEmitPreview
                ? formatMeta([
                    chatEmitPreview.kind,
                    chatEmitPreview.target ? `目标：${chatEmitPreview.target}` : '',
                    chatEmitPreview.speaker ? `说话人：${chatEmitPreview.speaker}` : '',
                    chatEmitPreview.time ? `时间：${chatEmitPreview.time}` : '',
                ])
                : '';
            const isPending = item.status === 'pending';
            return `
            <article class="agent-center-card">
                <div class="agent-center-card-head">
                    <div>
                        <div class="agent-center-card-title">${escapeHtml(displayToolName(item.toolName))}</div>
                        <div class="agent-center-card-sub">${escapeHtml(formatMeta([item.sessionId ? `范围：${item.sessionId}` : '']))}</div>
                    </div>
                    <span class="${escapeHtml(statusChipClass(item.status))}">${escapeHtml(displayStatusLabel(item.status))}</span>
                </div>
                ${renderChips([
                    { label: displayRiskLabel(item.riskLevel), className: riskChipClass(item.riskLevel) },
                    ...item.permissions.map(permission => ({ label: displayPermissionLabel(permission) })),
                    item.expiresAt ? { label: `过期时间 ${new Date(item.expiresAt).toLocaleTimeString()}` } : null,
                ])}
                ${isProfileUpdate ? `
                    <div class="agent-center-card-sub">${escapeHtml(formatMeta([item.reason ? `原因：${item.reason}` : '', item.profileSummary]))}</div>
                    <div class="agent-center-card-sub">${escapeHtml(impactText)}</div>
                    <div class="agent-center-card-actions">
                        <button type="button" class="agent-center-card-action is-primary" data-profile-action="approve" data-pending-id="${escapeHtml(item.id)}">保存画像</button>
                        <button type="button" class="agent-center-card-action is-danger" data-profile-action="deny" data-pending-id="${escapeHtml(item.id)}">忽略</button>
                    </div>
                ` : ''}
                ${isToolPermission ? `
                    <div class="agent-center-card-sub">${escapeHtml(toolImpactText)}</div>
                    ${writePreview ? `
                        <div class="agent-center-card-sub">写入预览：${escapeHtml(formatMeta([
                            writePreview.kind,
                            writePreview.target ? `${writePreview.targetLabel}：${writePreview.target}` : '',
                            writePreview.requestSummary,
                        ]))}</div>
                        ${writePreview.previewReady ? `
                            <div class="agent-center-card-sub">预览结果：${escapeHtml(writePreview.resultSummary || '无变更')}</div>
                            ${writePreview.rollbackReady ? `<div class="agent-center-card-sub">撤销记录：已准备好；当前仍未写入。</div>` : ''}
                            ${writePreview.entries?.length ? `
                                <div class="agent-center-card-sub">变更摘要：${escapeHtml(writePreview.entries.join('；'))}${writePreview.entryOverflow ? escapeHtml(`；另有 ${writePreview.entryOverflow} 项`) : ''}</div>
                            ` : ''}
                        ` : `
                            <div class="agent-center-card-sub">预览尚未执行；执行一次后只会生成可检查的变更摘要，不会提交。</div>
                        `}
                    ` : ''}
                    ${chatEmitPreview ? `
                        <div class="agent-center-card-sub">候选预览：${escapeHtml(chatEmitMeta || chatEmitPreview.kind || '聊天事件候选')}</div>
                        <div class="agent-center-card-sub">${escapeHtml(chatEmitPreview.contentPreview || '-')}</div>
                    ` : ''}
                    ${chatEmitCommitPreview ? `
                        <div class="agent-center-card-sub">后续提交预览：${escapeHtml(chatEmitCommitPreview.effect || '-')}</div>
                        <div class="agent-center-card-sub">撤销边界：${escapeHtml(chatEmitCommitPreview.undoSummary || '-')}</div>
                    ` : ''}
                    ${renderChips([
                        writePreview ? { label: writePreview.previewReady ? '预览已生成' : '等待预览' } : null,
                        writePreviewCommit ? { label: `提交：${displayCommitStatusLabel(writePreviewCommit)}` } : null,
                        writePreviewCommit ? { label: `撤销：${displayStatusLabel(writePreviewCommit.undoStatus)}` } : null,
                        chatEmitCommit ? { label: `提交：${displayCommitStatusLabel(chatEmitCommit)}` } : null,
                        chatEmitCommit ? { label: `撤销：${displayStatusLabel(chatEmitCommit.undoStatus)}` } : null,
                    ])}
                    ${writePreviewCommit?.resultSummary ? `
                        <div class="agent-center-card-sub">提交结果：${escapeHtml(writePreviewCommit.resultSummary)}</div>
                    ` : ''}
                    ${writePreviewCommit?.message ? `
                        <div class="agent-center-card-sub">提交说明：${escapeHtml(writePreviewCommit.message)}</div>
                    ` : ''}
                    ${writePreviewCommit?.undoMessage ? `
                        <div class="agent-center-card-sub">撤销说明：${escapeHtml(writePreviewCommit.undoMessage)}</div>
                    ` : ''}
                    ${writePreviewCommit?.errorMessage ? `
                        <div class="agent-center-card-sub agent-center-card-error">提交错误：${escapeHtml(writePreviewCommit.errorMessage)}</div>
                    ` : ''}
                    ${writePreviewCommit?.undoErrorMessage ? `
                        <div class="agent-center-card-sub agent-center-card-error">撤销错误：${escapeHtml(writePreviewCommit.undoErrorMessage)}</div>
                    ` : ''}
                    ${chatEmitCommit?.resultSummary ? `
                        <div class="agent-center-card-sub">提交结果：${escapeHtml(chatEmitCommit.resultSummary)}</div>
                    ` : ''}
                    ${chatEmitCommit?.message ? `
                        <div class="agent-center-card-sub">提交说明：${escapeHtml(chatEmitCommit.message)}</div>
                    ` : ''}
                    ${chatEmitCommit?.undoMessage ? `
                        <div class="agent-center-card-sub">撤销说明：${escapeHtml(chatEmitCommit.undoMessage)}</div>
                    ` : ''}
                    ${chatEmitCommit?.errorMessage ? `
                        <div class="agent-center-card-sub agent-center-card-error">提交错误：${escapeHtml(chatEmitCommit.errorMessage)}</div>
                    ` : ''}
                    ${chatEmitCommit?.undoErrorMessage ? `
                        <div class="agent-center-card-sub agent-center-card-error">撤销错误：${escapeHtml(chatEmitCommit.undoErrorMessage)}</div>
                    ` : ''}
                    ${isPending ? `
                        <div class="agent-center-card-actions">
                            <button type="button" class="agent-center-card-action is-primary" data-provider-permission-action="${PROVIDER_TOOL_PERMISSION_ACTIONS.allowOnce}" data-pending-id="${escapeHtml(item.id)}">执行一次</button>
                            <button type="button" class="agent-center-card-action is-danger" data-provider-permission-action="${PROVIDER_TOOL_PERMISSION_ACTIONS.deny}" data-pending-id="${escapeHtml(item.id)}">打回</button>
                            <button type="button" class="agent-center-card-action" data-provider-permission-action="${PROVIDER_TOOL_PERMISSION_ACTIONS.rememberAllow}" data-pending-id="${escapeHtml(item.id)}">记住执行</button>
                        </div>
                    ` : ''}
                    ${chatEmitCommit?.canCommit || chatEmitCommit?.canUndo ? `
                        <div class="agent-center-card-actions">
                            ${chatEmitCommit?.canCommit ? `<button type="button" class="agent-center-card-action is-primary" data-chat-emit-commit-action="commit" data-pending-id="${escapeHtml(item.id)}">执行</button>` : ''}
                            ${chatEmitCommit?.canCommit ? `<button type="button" class="agent-center-card-action is-danger" data-chat-emit-commit-action="reject" data-pending-id="${escapeHtml(item.id)}">打回</button>` : ''}
                            ${chatEmitCommit?.canUndo ? `<button type="button" class="agent-center-card-action is-danger" data-chat-emit-commit-action="undo" data-pending-id="${escapeHtml(item.id)}">撤销提交</button>` : ''}
                        </div>
                    ` : ''}
                    ${writePreviewCommit?.canCommit || writePreviewCommit?.canUndo ? `
                        <div class="agent-center-card-actions">
                            ${writePreviewCommit?.canCommit ? `<button type="button" class="agent-center-card-action is-primary" data-write-preview-commit-action="commit" data-pending-id="${escapeHtml(item.id)}">执行</button>` : ''}
                            ${writePreviewCommit?.canCommit ? `<button type="button" class="agent-center-card-action is-danger" data-write-preview-commit-action="reject" data-pending-id="${escapeHtml(item.id)}">打回</button>` : ''}
                            ${writePreviewCommit?.canUndo ? `<button type="button" class="agent-center-card-action is-danger" data-write-preview-commit-action="undo" data-pending-id="${escapeHtml(item.id)}">撤销变更</button>` : ''}
                        </div>
                    ` : ''}
                ` : ''}
            </article>
        `; }).join('')}</div>`;
    }

    async handleProfilePendingAction(action = '', pendingId = '') {
        const normalizedAction = trim(action);
        const id = trim(pendingId);
        if (!id) return;
        const item = (this.view.pending || []).find(entry => entry.id === id);
        const contactId = item?.contactId || item?.sessionId || '';
        const approving = normalizedAction === 'approve';
        const ok = await this.confirm({
            title: approving ? '保存联系人画像' : '忽略联系人画像',
            message: approving
                ? `确定保存联系人「${contactId || '-'}」的画像候选吗？\n\n保存后会影响后续动态弱触发、提示词上下文和 Agent 画像读取。`
                : `确定忽略联系人「${contactId || '-'}」的画像候选吗？\n\n忽略只清除本次候选，不删除已有画像。`,
            danger: !approving,
            confirmText: approving ? '保存画像' : '忽略',
        });
        if (!ok) return;
        const actionName = approving ? 'approveContactProfilePendingUpdate' : 'denyContactProfilePendingUpdate';
        await this.callAction(actionName, { id }, null);
        await this.refresh();
    }

    async handleProviderPermissionAction(action = '', pendingId = '') {
        const normalizedAction = trim(action);
        const id = trim(pendingId);
        if (!id) return;
        const item = (this.view.pending || []).find(entry => entry.id === id);
        const toolName = item?.toolName || 'tool';
        const writePreview = item?.writePreview || null;
        const label = providerToolActionLabel(normalizedAction);
        const toolLabel = displayToolName(toolName);
        const remembering = normalizedAction === PROVIDER_TOOL_PERMISSION_ACTIONS.rememberAllow;
        const denying = normalizedAction === PROVIDER_TOOL_PERMISSION_ACTIONS.deny;
        const ok = await this.confirm({
            title: `${label} Agent 工具`,
            message: denying
                ? `确定打回「${toolLabel}」这次请求吗？\n\n打回后不会执行工具，也不会继续生成。`
                : remembering
                    ? (writePreview
                        ? `确定记住执行「${toolLabel}」吗？\n\n影响范围：当前会话。后续同类预览请求可复用这条权限；执行只生成变更预览，不会写入记忆、变量、世界书或聊天正文。`
                        : `确定记住执行「${toolLabel}」吗？\n\n影响范围：当前会话。后续同类请求可复用这条权限；执行仍不会重放聊天或直接写聊天正文。`)
                    : (writePreview
                        ? `确定执行「${toolLabel}」一次吗？\n\n只会生成变更预览；不会写入记忆、变量、世界书或聊天正文。真正提交还需要再次确认。`
                        : `确定执行「${toolLabel}」一次吗？\n\n只会执行这一个工具请求；不会重放聊天、不会自动继续生成、不会直接写聊天正文。`),
            confirmText: label,
            danger: denying,
        });
        if (!ok) return;
        const actions = this.getActions?.() || {};
        const resolver = actions.resolveProviderToolPendingPermission;
        if (typeof resolver !== 'function') {
            this.lastError = '当前环境没有 Agent 工具权限处理动作';
            this.render();
            return;
        }
        try {
            await Promise.resolve(resolver({
                id,
                action: normalizedAction,
                reason: 'agent center pending action',
            }));
            await this.refresh();
        } catch (err) {
            this.lastError = trim(err?.message || err, 'resolveProviderToolPendingPermission failed');
            this.render();
        }
    }

    async handleChatEmitCommitAction(action = '', pendingId = '') {
        const normalizedAction = trim(action);
        const id = trim(pendingId);
        if (!id || !['commit', 'undo', 'reject'].includes(normalizedAction)) return;
        const item = (this.view.pending || []).find(entry => entry.id === id);
        const committing = normalizedAction === 'commit';
        const rejecting = normalizedAction === 'reject';
        const toolLabel = displayToolName(item?.toolName || 'chat.emit');
        const ok = await this.confirm({
            title: committing ? '执行聊天候选' : (rejecting ? '打回聊天候选' : '撤销聊天候选'),
            message: rejecting
                ? `确定打回「${toolLabel}」吗？\n\n打回后不会写入聊天或动态，这条候选会离开待确认。`
                : committing
                ? `确定提交「${toolLabel}」吗？\n\n这一步会写入聊天或动态；提交后可在这里撤销。`
                : `确定撤销「${toolLabel}」刚才提交的内容吗？\n\n撤销会删除本次新增聊天消息，或回滚动态变更。`,
            confirmText: committing ? '执行' : (rejecting ? '打回' : '撤销提交'),
            danger: !committing,
        });
        if (!ok) return;
        const actionName = committing
            ? 'commitChatEmitPendingPermission'
            : (rejecting ? 'rejectChatEmitPendingCommit' : 'undoChatEmitPendingCommit');
        const result = await this.callAction(actionName, {
            id,
            confirmed: true,
            reason: 'agent center chat emit commit action',
        }, null);
        if (!result) {
            this.lastError = committing
                ? '当前环境没有聊天候选提交动作'
                : rejecting
                    ? '当前环境没有聊天候选打回动作'
                : '当前环境没有聊天候选撤销动作';
        } else if (result.ok === false && (result.message || result.reason)) {
            this.lastError = result.message || result.reason;
        }
        await this.refresh();
    }

    async handleWritePreviewCommitAction(action = '', pendingId = '') {
        const normalizedAction = trim(action);
        const id = trim(pendingId);
        if (!id || !['commit', 'undo', 'reject'].includes(normalizedAction)) return;
        const item = (this.view.pending || []).find(entry => entry.id === id);
        const committing = normalizedAction === 'commit';
        const rejecting = normalizedAction === 'reject';
        const toolLabel = displayToolName(item?.toolName || '写入预览');
        const ok = await this.confirm({
            title: committing ? '执行写入预览' : (rejecting ? '打回写入预览' : '撤销写入变更'),
            message: rejecting
                ? `确定打回「${toolLabel}」吗？\n\n打回后不会写入记忆、变量或世界书，这条候选会离开待确认。`
                : committing
                ? `确定提交「${toolLabel}」吗？\n\n这一步会写入记忆、变量或世界书；提交后可在这里撤销。`
                : `确定撤销「${toolLabel}」刚才提交的变更吗？\n\n撤销只会回滚本次提交保存的变更。`,
            confirmText: committing ? '执行' : (rejecting ? '打回' : '撤销变更'),
            danger: !committing,
        });
        if (!ok) return;
        const actionName = committing
            ? 'commitAgentWritePreviewPendingPermission'
            : (rejecting ? 'rejectAgentWritePreviewPendingCommit' : 'undoAgentWritePreviewPendingCommit');
        const result = await this.callAction(actionName, {
            id,
            confirmed: true,
            reason: 'agent center write preview commit action',
        }, null);
        if (!result) {
            this.lastError = committing
                ? '当前环境没有写入预览提交动作'
                : rejecting
                    ? '当前环境没有写入预览打回动作'
                : '当前环境没有写入预览撤销动作';
        } else if (result.ok === false && (result.message || result.reason)) {
            this.lastError = result.message || result.reason;
        }
        await this.refresh();
    }

    async handleSessionGateAction(action = '') {
        const normalizedAction = trim(action);
        if (!['enable', 'disable'].includes(normalizedAction)) return;
        const enabling = normalizedAction === 'enable';
        const ok = await this.confirm({
            title: enabling ? '开启当前会话 Agent 工具' : '关闭当前会话 Agent 工具',
            message: enabling
                ? '影响范围：当前会话。开启后，AI 可以请求已允许的工具；每次执行前仍会让你确认。'
                : '影响范围：当前会话。关闭后，AI 后续请求工具不会执行；已有活动记录不会删除。',
            confirmText: enabling ? '开启' : '关闭',
            danger: !enabling,
        });
        if (!ok) return;
        const actions = this.getActions?.() || {};
        if (typeof actions.setProviderToolSessionGate !== 'function') {
            this.lastError = '当前环境不能切换会话 Agent 工具';
            this.render();
            return;
        }
        try {
            await Promise.resolve(actions.setProviderToolSessionGate({
                enabled: enabling,
                networkAllowed: false,
                realRunnerAllowed: false,
                source: 'agent_center',
                reason: enabling
                    ? 'enabled from Agent Center safety tab'
                    : 'disabled from Agent Center safety tab',
            }));
            await this.refresh();
        } catch (err) {
            this.lastError = trim(err?.message || err, '切换会话 Agent 工具失败');
            this.render();
        }
    }

    async handleWritePreviewModelContextAction(action = '') {
        const normalizedAction = trim(action);
        if (!['enable', 'disable'].includes(normalizedAction)) return;
        const enabling = normalizedAction === 'enable';
        const gate = this.view?.safety?.sessionGate || {};
        const writePreviewTools = Array.from(WRITE_PREVIEW_PROVIDER_MODEL_CONTEXT_TOOLS);
        const currentTools = list(gate.allowedTools);
        const nextTools = Array.from(new Set(enabling
            ? currentTools.concat(writePreviewTools)
            : currentTools.filter(tool => !writePreviewTools.includes(tool))));
        const ok = await this.confirm({
            title: enabling ? '加入写入预览工具' : '移除写入预览工具',
            message: enabling
                ? '影响范围：当前会话。AI 可以请求记忆、变量、世界书的变更预览；真正提交仍需要你再次确认。'
                : '影响范围：当前会话。AI 后续不会再看到记忆、变量、世界书预览工具；已有待确认请求不会删除。',
            confirmText: enabling ? '加入预览工具' : '移除预览工具',
            danger: !enabling,
        });
        if (!ok) return;
        const actions = this.getActions?.() || {};
        if (typeof actions.setProviderToolSessionGate !== 'function') {
            this.lastError = '当前环境不能调整预览工具';
            this.render();
            return;
        }
        try {
            await Promise.resolve(actions.setProviderToolSessionGate({
                enabled: gate.enabled === true,
                allowedTools: nextTools,
                networkAllowed: false,
                realRunnerAllowed: false,
                source: 'agent_center',
                reason: enabling
                    ? 'write preview tools added from Agent Center safety tab'
                    : 'write preview tools removed from Agent Center safety tab',
            }));
            await this.refresh();
        } catch (err) {
            this.lastError = trim(err?.message || err, '调整预览工具失败');
            this.render();
        }
    }

    async setWritePreviewModelContextEnabled(enabling = false) {
        const gate = this.view?.safety?.sessionGate || {};
        const writePreviewTools = Array.from(WRITE_PREVIEW_PROVIDER_MODEL_CONTEXT_TOOLS);
        const currentTools = list(gate.allowedTools);
        const nextTools = Array.from(new Set(enabling
            ? currentTools.concat(writePreviewTools)
            : currentTools.filter(tool => !writePreviewTools.includes(tool))));
        const actions = this.getActions?.() || {};
        if (typeof actions.setProviderToolSessionGate !== 'function') return false;
        await Promise.resolve(actions.setProviderToolSessionGate({
            enabled: enabling ? true : gate.enabled === true,
            allowedTools: nextTools,
            networkAllowed: false,
            realRunnerAllowed: false,
            source: 'agent_center',
            reason: enabling
                ? 'write preview agent enabled from Agent Center'
                : 'write preview agent disabled from Agent Center',
        }));
        return true;
    }

    handleAgentCardFlip(agentId = '') {
        this.openFloatingAgentCard(agentId);
    }

    openFloatingAgentCard(agentId = '') {
        const id = trim(agentId);
        if (!id || !this.getAgentCardById(id)) return;
        this.floatingAgentId = id;
        this.floatingAgentFlipped = false;
        this.render();
    }

    closeFloatingAgentCard() {
        this.floatingAgentId = '';
        this.floatingAgentFlipped = false;
        this.render();
    }

    toggleFloatingAgentCard() {
        if (!this.floatingAgentId) return;
        this.floatingAgentFlipped = !this.floatingAgentFlipped;
        const card = this.contentElement?.querySelector?.('.agent-center-floating-card');
        if (card) {
            card.classList?.toggle?.('is-flipped', this.floatingAgentFlipped);
            return;
        }
        this.render();
    }

    async handleAgentCardToggle(action = '', cardId = '') {
        const id = trim(cardId);
        const enabling = trim(action) === 'enable';
        if (!id) return;
        const agent = this.getAgentCardById(id);
        if (!agent?.implemented) return;
        const result = await this.callAction('setAgentCardEnabled', {
            id,
            enabled: enabling,
            reason: 'agent center card toggle',
        }, null);
        if (!result) {
            this.lastError = '当前环境不能切换这个卡片';
            this.render();
            return;
        }
        await this.refresh();
    }

    async handleAgentPromptSave(promptId = '', button = null) {
        const id = trim(promptId);
        const editor = button?.closest?.('[data-agent-prompt-editor]');
        if (!id || !editor) return;
        const agentId = trim(editor.dataset.agentId);
        const profileType = trim(editor.dataset.agentPromptProfileType, 'sysprompt');
        const presetId = trim(editor.dataset.agentPromptPresetId);
        const config = {
            enabled: editor.querySelector('[data-agent-prompt-enabled]')?.checked !== false,
            rules: editor.querySelector('[data-agent-prompt-rules]')?.value ?? '',
        };
        const positionEl = editor.querySelector('[data-agent-prompt-position]');
        const depthEl = editor.querySelector('[data-agent-prompt-depth]');
        const roleEl = editor.querySelector('[data-agent-prompt-role]');
        if (positionEl) config.position = Math.trunc(Number(positionEl.value));
        if (depthEl) config.depth = Math.max(0, Math.trunc(Number(depthEl.value) || 0));
        if (roleEl) config.role = Math.trunc(Number(roleEl.value));
        const result = await this.callAction('setAgentPromptConfig', {
            profileType,
            presetId,
            agentId,
            promptId: id,
            config,
        }, null);
        if (!result) {
            this.lastError = '当前环境不能保存提示词';
            this.render();
            return;
        }
        await this.refresh();
    }

    async handleMemoryAgentSave(button = null) {
        const editor = button?.closest?.('[data-memory-agent-editor]');
        if (!editor) return;
        const config = {
            dataPosition: editor.querySelector('[data-memory-data-position]')?.value || '',
            dataDepth: Math.max(0, Math.trunc(Number(editor.querySelector('[data-memory-data-depth]')?.value) || 0)),
            guidePosition: editor.querySelector('[data-memory-guide-position]')?.value || '',
            guideDepth: Math.max(0, Math.trunc(Number(editor.querySelector('[data-memory-guide-depth]')?.value) || 0)),
        };
        const result = await this.callAction('setMemoryAgentSettings', {
            presetId: trim(editor.dataset.memoryAgentPresetId),
            config,
        }, null);
        if (!result) {
            this.lastError = '当前环境不能保存记忆表格 Agent 设置';
            this.render();
            return;
        }
        const promptResult = await this.callAction('setMemoryAgentPromptConfig', {
            templateId: trim(editor.dataset.memoryAgentTemplateId),
            config: {
                template: editor.querySelector('[data-memory-prompt-template]')?.value ?? '',
                wrapper: editor.querySelector('[data-memory-prompt-wrapper]')?.value ?? '',
                position: editor.querySelector('[data-memory-prompt-position]')?.value || 'before_latest_user',
            },
        }, true);
        if (!promptResult) {
            this.lastError = '当前环境不能保存记忆提示词模板';
            this.render();
            return;
        }
        await this.refresh();
    }

    handleReplyCheckPreviewTargetChange(value = 'auto') {
        const normalized = trim(value, 'auto');
        const allowed = new Set(REPLY_CHECK_PREVIEW_TARGET_OPTIONS.map(option => option.value));
        this.replyCheckPreviewTarget = allowed.has(normalized) ? normalized : 'auto';
    }

    async handleAgentPromptPreview(agentId = '') {
        const id = trim(agentId);
        const payload = {
            source: 'agent_center',
            agentId: id,
        };
        if (id === 'reply_check') payload.formatTarget = this.replyCheckPreviewTarget || 'auto';
        const result = await this.callAction('showPromptPreview', payload, null);
        if (result === false || result === null) {
            this.lastError = '暂时无法构建本次 Prompt 预览。';
            this.render();
        }
    }

    async handleAgentFeatureToggle(action = '', featureId = '') {
        const id = trim(featureId);
        const enabling = trim(action) === 'enable';
        if (!id) return;
        const agent = this.getAgentCardById(id);
        if (!agent?.implemented) return;
        const ok = await this.confirm({
            title: enabling ? `开启${agent.title}` : `关闭${agent.title}`,
            message: enabling
                ? `开启后：${agent.summary || agent.title}\n\n${id === 'write_preview' ? '影响范围：当前会话。预览工具会加入可请求范围；真正提交仍需要再次确认。' : '解析失败且聊天室没有输出时会自动尝试修复；其他结果会显示在消息旁或 Agent Center。'}`
                : `关闭后：${agent.summary || agent.title}\n\n已有活动记录不会删除。`,
            confirmText: enabling ? '开启' : '关闭',
            danger: !enabling,
        });
        if (!ok) return;
        const result = await this.callAction('setAgentFeatureEnabled', {
            id,
            enabled: enabling,
            reason: 'agent center feature toggle',
        }, null);
        if (!result) {
            this.lastError = '当前环境不能切换 Agent';
            this.render();
            return;
        }
        if (id === 'write_preview') {
            try {
                await this.setWritePreviewModelContextEnabled(enabling);
            } catch (err) {
                this.lastError = trim(err?.message || err, '调整预览工具失败');
            }
        }
        await this.refresh();
        if (enabling && id === 'reply_check' && trim(agent.modelMode, 'none') === 'none') {
            const selected = await this.choice({
                title: '配置检查模型',
                message: '默认只做本地格式检测。选择模型后，发现格式问题时可让 AI 再复核一次。',
                defaultActionId: 'select_model',
                actions: [
                    { id: 'select_model', label: '现在选择模型', primary: true },
                    { id: 'manage_api', label: '管理 API 配置' },
                    { id: 'keep_local', label: '暂时只本地检测' },
                ],
            });
            if (selected === 'select_model') {
                this.openAgentModelSelect(id);
            } else if (selected === 'manage_api') {
                this.handleAgentFeatureModelManage(id);
            }
        }
    }

    async handleAgentFeatureDetail(featureId = '') {
        const id = trim(featureId);
        const agent = this.getAgentCardById(id);
        if (!agent) return;
        await this.confirm({
            title: agent.detailTitle || agent.title || displayAgentFeature(id),
            message: [
                agent.summary,
                ...(Array.isArray(agent.detail) ? agent.detail : []),
                isFeatureAgentCard(agent) && agent.supportsTriggerMode ? `触发：${agent.triggerLabel || '自动触发'}` : '',
                isFeatureAgentCard(agent) && agent.supportsModel ? `模型：${agent.modelLabel || '不调用模型'}` : '',
                trim(agent.cardGroup || agent.category) === 'diagnostic' ? '类型：诊断视图' : (agent.enabled ? '状态：已开启' : '状态：默认关闭'),
            ].filter(Boolean).join('\n\n'),
            confirmText: '知道了',
        });
    }

    async handleAgentFeatureModel(featureId = '') {
        const id = trim(featureId);
        const agent = this.getAgentCardById(id);
        if (!agent?.supportsModel || !agent?.implemented) return;
        await this.handleAgentFeatureModelSelect(id, this.getAgentModelSelectValue(agent));
    }

    async handleAgentFeatureModelSelect(featureId = '', selectedValue = '', selectElement = null) {
        const id = trim(featureId);
        const agent = this.getAgentCardById(id);
        if (!agent?.supportsModel || !agent?.implemented) return;
        const selected = trim(selectedValue, 'follow_current');
        const previousValue = this.getAgentModelSelectValue(agent);
        const modelMode = selected.startsWith('profile:') ? 'profile' : selected;
        const modelProfileId = selected.startsWith('profile:')
            ? selected.slice('profile:'.length)
            : '';
        const result = await this.callAction('setAgentFeatureModel', {
            id,
            modelMode,
            modelProfileId,
            // 切换连线档时清除模型覆盖（旧覆盖针对旧档的模型名）
            modelOverride: '',
        }, null);
        if (!result) {
            this.lastError = '当前环境不能更新 Agent 模型';
            if (selectElement) selectElement.value = previousValue;
            this.render();
            return;
        }
        await this.refresh();
    }

    handleAgentFeatureModelManage(featureId = '') {
        const id = trim(featureId);
        const agent = this.getAgentCardById(id);
        if (!agent?.supportsModel || !agent?.implemented || typeof this.openConfig !== 'function') return;
        closeCustomSelectMenu();
        this.hide();
        this.openConfig({
            tab: 'chat',
            onHide: async () => {
                this.show({ tab: 'agents' });
            },
        });
    }

    openAgentModelSelect(featureId = '') {
        const id = trim(featureId);
        if (!id || !this.contentElement) return;
        const button = Array.from(this.contentElement.querySelectorAll('[data-agent-feature-model-button]'))
            .find(item => item?.dataset?.agentFeatureModelButton === id);
        if (button instanceof HTMLElement && !button.disabled) {
            button.focus();
            button.click();
        }
    }

    async handleAgentFeatureTriggerMode(featureId = '') {
        const id = trim(featureId);
        const agent = this.getAgentCardById(id);
        if (!agent?.supportsTriggerMode || !agent?.implemented) return;
        const selected = await this.choice({
            title: `${agent.title || displayAgentFeature(id)}触发方式`,
            message: [
                '选择这个 Agent 在 AI 回复后的工作方式。',
                '自动触发只在解析失败且没有聊天输出时直接尝试修复；手动检查的修复候选仍由你确认。',
            ].join('\n\n'),
            defaultActionId: agent.triggerMode || 'auto',
            actions: [
                { id: 'auto', label: '自动触发', primary: agent.triggerMode !== 'manual' },
                { id: 'manual', label: '手动触发', primary: agent.triggerMode === 'manual' },
            ],
        });
        if (!selected) return;
        const result = await this.callAction('setAgentFeatureTriggerMode', {
            id,
            triggerMode: selected,
        }, null);
        if (!result) {
            this.lastError = '当前环境不能更新 Agent 触发方式';
            this.render();
            return;
        }
        await this.refresh();
    }

    async handleContinuationPolicyAction(strategy = '') {
        const normalizedStrategy = normalizeContinuationCommitStrategy(strategy);
        const actions = this.getActions?.() || {};
        if (typeof actions.setProviderContinuationCommitPolicy !== 'function') {
            this.lastError = '当前环境没有 Provider continuation 策略设置动作';
            this.render();
            return;
        }
        try {
            await Promise.resolve(actions.setProviderContinuationCommitPolicy({
                defaultStrategy: normalizedStrategy,
            }));
            await this.refresh();
        } catch (err) {
            this.lastError = trim(err?.message || err, 'setProviderContinuationCommitPolicy failed');
            this.render();
        }
    }

    handleFailureReadAction() {
        this.markCurrentFailuresSeen();
        this.render();
    }

    async handleAgentRunReviewAction(action = '', runId = '') {
        const normalizedAction = trim(action);
        const id = trim(runId);
        if (!id || normalizedAction !== 'reject') return;
        const run = (this.view.activity?.runs || []).find(item => item.id === id);
        const ok = await this.confirm({
            title: '打回 Agent 待确认',
            message: `确定打回「${run?.title || run?.kind || id}」吗？\n\n打回后不会执行候选动作，这条记录会离开待确认。`,
            confirmText: '打回',
            danger: true,
        });
        if (!ok) return;
        const result = await this.callAction('resolveAgentRunReview', {
            runId: id,
            decision: 'reject',
            reason: 'agent center review rejected',
            summary: '已打回',
        }, null);
        if (!result || result.ok === false) {
            this.lastError = result?.message || result?.reason || '当前环境没有 Agent 待确认处理动作';
        }
        await this.refresh();
    }

    renderActivity() {
        const activity = this.view.activity || {};
        const runs = activity.runs || [];
        const meta = activity.meta || {};
        const statusCounts = this.surface ? (meta.scopedStatusCounts || meta.statusCounts || {}) : (meta.statusCounts || {});
        const activeStatus = normalizeActivityStatus(this.activityStatus);
        const filters = [
            { status: '', label: `全部 ${Number(this.surface ? (meta.scoped ?? meta.filtered ?? 0) : (meta.total || 0))}` },
            { status: 'active', label: `运行中 ${Number(this.surface ? (meta.scopedActive ?? meta.active ?? 0) : (meta.active || 0))}` },
            { status: 'waiting_permission', label: `待确认 ${Number(statusCounts.waiting_permission || 0)}` },
            { status: 'failure', label: `失败 ${Number(this.surface ? (meta.scopedFailures ?? meta.failures ?? 0) : (meta.failures || 0))}`, tone: 'danger' },
            { status: 'succeeded', label: `完成 ${Number(statusCounts.succeeded || 0)}` },
        ];
        const maidRunCount = Number(meta.kindCounts?.maid_assistant || 0);
        const activeKind = String(this.activityKind || '').trim();
        const filterHtml = `<div class="agent-center-filter-row" aria-label="Agent activity filters">${filters.map(filter => `
            <button
                type="button"
                class="agent-center-filter${activeStatus === filter.status ? ' is-active' : ''}${filter.tone === 'danger' ? ' is-danger' : ''}"
                data-activity-status="${escapeHtml(filter.status)}"
            >${escapeHtml(filter.label)}</button>
        `).join('')}${maidRunCount ? `
            <button
                type="button"
                class="agent-center-filter${activeKind === 'maid_assistant' ? ' is-active' : ''}"
                data-activity-kind="${activeKind === 'maid_assistant' ? '' : 'maid_assistant'}"
            >女仆 ${maidRunCount}</button>
        ` : ''}</div>`;
        const intro = activeStatus === 'failure'
            ? renderNotice({
                title: '失败记录',
                message: '查看后会从顶部提醒移除，不会删除活动记录。',
                actionLabel: '从顶部提醒移除',
                actionAttr: 'data-failure-read-action="mark"',
            })
            : '';
        const usageSummary = renderUsageProfileSummary(activity.usageProfile);
        if (!runs.length) {
            return `${filterHtml}${usageSummary}${intro}${renderEmpty(activeStatus ? `没有${activityStatusLabel(activeStatus)} Agent 活动` : '还没有 Agent 活动记录。AI 检查、候选和后台任务会显示在这里。')}`;
        }
        return `${filterHtml}${usageSummary}${intro}<div class="agent-center-list">${runs.map(run => {
            const failureDetail = trim(run.errorMessage || run.cancelReason || run.lastStep?.errorMessage);
            return `
            <article class="${escapeHtml(activityCardClass(run))}">
                <div class="agent-center-card-head">
                    <div>
                        <div class="agent-center-card-title">${escapeHtml(run.title || run.kind || run.id)}</div>
                        <div class="agent-center-card-sub">${escapeHtml(formatMeta([displayAgentKind(run.kind), run.sessionId ? `范围：${run.sessionId}` : '']))}</div>
                    </div>
                    <span class="${escapeHtml(statusChipClass(run.status))}">${escapeHtml(displayRunStatusLabel(run))}</span>
                </div>
                <div class="agent-center-card-sub">${escapeHtml(displayRunSummary(run))}</div>
                ${run.goal && run.goal !== run.title ? `<div class="agent-center-card-sub">目标：${escapeHtml(run.goal)}</div>` : ''}
                ${failureDetail ? `<div class="agent-center-card-sub agent-center-card-error">错误：${escapeHtml(failureDetail)}</div>` : ''}
                ${renderChips([
                    { label: `步骤 ${Number(run.stepCount || 0)}` },
                    { label: `工具 ${Number(run.toolCallCount || 0)}` },
                    ...buildRunUsageChips(run.usage),
                    run.continuable ? { label: '可继续' } : null,
                    run.failureCode ? { label: `原因：${run.failureCode}` } : null,
                    run.lastStep ? { label: `最近：${displayAgentKind(run.lastStep.type)}` } : null,
                ])}
                ${renderChatFormatReview(run.review)}
                ${run.status === 'waiting_permission' ? `
                    <div class="agent-center-card-actions">
                        <button type="button" class="agent-center-card-action is-danger" data-agent-run-review-action="reject" data-run-id="${escapeHtml(run.id)}">打回</button>
                    </div>
                ` : ''}
            </article>
        `; }).join('')}</div>`;
    }

    renderResources() {
        const resources = this.view.resources || [];
        if (!resources.length) return renderEmpty('还没有可管理资源入口。');
        return `<div class="agent-center-resource-list">${resources.map(resource => {
            const shortcuts = Array.isArray(resource.shortcuts) ? resource.shortcuts.filter(item => item?.label && item?.promptId) : [];
            return `
            <article class="agent-center-card agent-center-resource-card">
                <div class="agent-center-resource-main">
                    <div class="agent-center-card-head">
                        <div>
                            <div class="agent-center-resource-group">${escapeHtml(resource.group || '资源')}</div>
                            <div class="agent-center-card-title">${escapeHtml(resource.title || resource.id)}</div>
                        </div>
                        <span class="${escapeHtml(statusChipClass(Number(resource.count || 0) > 0 ? 'pending' : 'succeeded'))}">${escapeHtml(resource.status || '就绪')}</span>
                    </div>
                    ${resource.summary ? `<div class="agent-center-card-sub">${escapeHtml(resource.summary)}</div>` : ''}
                </div>
                <div class="agent-center-card-actions agent-center-resource-actions">
                    <button type="button" class="agent-center-card-action is-primary" data-resource-open="${escapeHtml(resource.id)}">${escapeHtml(resource.actionLabel || '打开')}</button>
                    ${Number(resource.count || 0) > 0 ? `<button type="button" class="agent-center-card-action" data-resource-pending="${escapeHtml(resource.id)}">待处理</button>` : ''}
                </div>
                ${shortcuts.length ? `<div class="agent-center-resource-shortcuts">${shortcuts.map(shortcut => `
                    <button
                        type="button"
                        class="agent-center-resource-shortcut"
                        data-resource-open="${escapeHtml(resource.id)}"
                        data-resource-prompt-id="${escapeHtml(shortcut.promptId)}"
                    >${escapeHtml(shortcut.label)}</button>
                `).join('')}</div>` : ''}
            </article>
        `; }).join('')}</div>`;
    }

    async handleResourceOpen(resourceId = '', options = {}) {
        const resource = findAgentCenterResource(this.view.resources || [], resourceId);
        if (!resource) return;
        const opts = options && typeof options === 'object' ? options : {};
        const target = {
            ...(resource.target || {}),
            ...(opts.target || {}),
        };
        if (opts.promptId) target.promptId = opts.promptId;
        if (opts.focus) target.focus = opts.focus;
        const ok = await Promise.resolve(this.openResourceTarget?.(target, resource));
        if (ok) return;
        this.lastError = `无法打开「${resource.title || resource.id}」主界面`;
        this.render();
    }

    handleResourcePending(resourceId = '') {
        const resource = findAgentCenterResource(this.view.resources || [], resourceId);
        if (!resource) return;
        this.setActiveTab('pending');
    }

    renderTools() {
        const tools = this.view.tools || [];
        if (!tools.length) return renderEmpty('还没有注册 Agent 工具');
        return `<div class="agent-center-list">${tools.map(tool => `
            <article class="agent-center-card">
                <div class="agent-center-card-title">${escapeHtml(displayToolName(tool.name || tool.title))}</div>
                <div class="agent-center-card-sub">${escapeHtml(tool.description || tool.title || '')}</div>
                ${renderChips([
                    { label: displayRiskLabel(tool.riskLevel), className: riskChipClass(tool.riskLevel) },
                    ...tool.permissions.map(permission => ({ label: displayPermissionLabel(permission) })),
                ])}
                ${renderChips(capabilityLabels(tool.capabilities).map(label => ({ label })))}
            </article>
        `).join('')}</div>`;
    }

    renderSafety() {
        const safety = this.view.safety || {};
        const gate = safety.sessionGate || {};
        const provider = safety.providerTools || {};
        const policy = safety.continuationCommitPolicy || {};
        const gateEnabled = gate.enabled === true;
        const writePreview = gate.writePreviewTools || {};
        const writePreviewEnabled = writePreview.enabled === true;
        const defaultStrategy = normalizeContinuationCommitStrategy(policy.defaultStrategy);
        return `<div class="agent-center-list">
            <article class="agent-center-card">
                <div class="agent-center-card-head">
                    <div>
                        <div class="agent-center-card-title">当前会话 Agent 工具</div>
                        <div class="agent-center-card-sub">${escapeHtml(gateEnabled ? 'AI 可以请求已允许的工具，执行前仍会让你确认。' : 'AI 现在不会执行工具请求。')}</div>
                    </div>
                    <span class="${escapeHtml(statusChipClass(gateEnabled ? 'running' : 'denied'))}">${escapeHtml(gateEnabled ? '已开启' : '已关闭')}</span>
                </div>
                <div class="agent-center-card-sub">开启后仍不会自动继续生成，也不会直接写聊天正文。</div>
                ${renderChips([
                    { label: gate.networkAllowed ? '允许联网继续' : '不会联网继续' },
                    { label: gate.realRunnerAllowed ? '允许真实继续生成' : '不会自动继续生成' },
                    { label: gate.writesChat ? '可写聊天' : '不会自动写聊天' },
                    ...list(gate.allowedTools).map(tool => ({ label: displayToolName(tool) })),
                ])}
                <div class="agent-center-card-sub">记忆/变量/世界书预览：${escapeHtml(writePreviewEnabled ? 'AI 可以请求预览' : 'AI 现在看不到这些预览工具')}。提交仍需要你手动确认。</div>
                ${renderChips([
                    { label: writePreviewEnabled ? '预览工具已加入' : '预览工具未加入', className: statusChipClass(writePreviewEnabled ? 'running' : 'denied') },
                    ...list(writePreview.activeTools).map(tool => ({ label: displayToolName(tool) })),
                ])}
                <div class="agent-center-card-actions">
                    <button
                        type="button"
                        class="agent-center-card-action${gateEnabled ? '' : ' is-primary'}"
                        data-session-gate-action="${escapeHtml(gateEnabled ? 'disable' : 'enable')}"
                    >${escapeHtml(gateEnabled ? '关闭当前会话 Agent 工具' : '开启当前会话 Agent 工具')}</button>
                    <button
                        type="button"
                        class="agent-center-card-action${writePreviewEnabled ? '' : ' is-primary'}"
                        data-write-preview-model-context-action="${escapeHtml(writePreviewEnabled ? 'disable' : 'enable')}"
                    >${escapeHtml(writePreviewEnabled ? '移除预览工具' : '加入预览工具')}</button>
                </div>
            </article>
            ${provider.enabled ? `
                <article class="agent-center-card">
                    <div class="agent-center-card-title">调试入口</div>
                    <div class="agent-center-card-sub">调试入口已开启，只影响开发检查。</div>
                    ${renderChips(list(provider.allowedTools).map(tool => ({ label: displayToolName(tool) })))}
                </article>
            ` : ''}
            <article class="agent-center-card">
                <div class="agent-center-card-head">
                    <div>
                        <div class="agent-center-card-title">继续生成后的处理方式</div>
                        <div class="agent-center-card-sub">工具执行后如需继续生成，仍会先让你确认。</div>
                    </div>
                    <span class="${escapeHtml(statusChipClass('pending'))}">${escapeHtml(continuationCommitStrategyLabel(defaultStrategy))}</span>
                </div>
                <div class="agent-center-card-actions">
                    ${['preview_only', 'append_to_previous_bubble'].map(strategy => `
                        <button
                            type="button"
                            class="agent-center-card-action${defaultStrategy === strategy ? ' is-primary' : ''}"
                            data-continuation-policy-strategy="${escapeHtml(strategy)}"
                        >${escapeHtml(continuationCommitStrategyLabel(strategy))}</button>
                    `).join('')}
                </div>
            </article>
            <article class="agent-center-card">
                <div class="agent-center-card-title">已记住的允许规则</div>
                ${renderPermissionRuleSummary(safety.permissionRuleSummary)}
            </article>
        </div>`;
    }

    render() {
        this.renderMeta();
        this.renderTabs();
        if (!this.contentElement) return;
        const error = this.lastError
            ? `<div class="agent-center-error">${escapeHtml(this.lastError)}</div>`
            : '';
        const body = this.activeTab === 'pending'
            ? this.renderPending()
            : this.activeTab === 'agents'
                ? this.renderAgents()
                : this.activeTab === 'prompts'
                    ? this.renderPromptModules()
                    : this.activeTab === 'diagnostics'
                        ? this.renderDiagnostics()
                        : this.activeTab === 'resources'
                            ? this.renderResources()
                            : this.activeTab === 'activity'
                                ? this.renderActivity()
                                : this.renderSafety();
        this.contentElement.innerHTML = `${error}${body}${this.renderFloatingAgentCard()}`;
        if (this.activeTab === 'pending') {
            this.contentElement.querySelectorAll('[data-profile-action]').forEach((button) => {
                button.addEventListener('click', () => this.handleProfilePendingAction(
                    button.dataset.profileAction || '',
                    button.dataset.pendingId || '',
                ));
            });
            this.contentElement.querySelectorAll('[data-provider-permission-action]').forEach((button) => {
                button.addEventListener('click', () => this.handleProviderPermissionAction(
                    button.dataset.providerPermissionAction || '',
                    button.dataset.pendingId || '',
                ));
            });
            this.contentElement.querySelectorAll('[data-chat-emit-commit-action]').forEach((button) => {
                button.addEventListener('click', () => this.handleChatEmitCommitAction(
                    button.dataset.chatEmitCommitAction || '',
                    button.dataset.pendingId || '',
                ));
            });
            this.contentElement.querySelectorAll('[data-write-preview-commit-action]').forEach((button) => {
                button.addEventListener('click', () => this.handleWritePreviewCommitAction(
                    button.dataset.writePreviewCommitAction || '',
                    button.dataset.pendingId || '',
                ));
            });
        }
        if (this.activeTab === 'activity') {
            this.contentElement.querySelectorAll('[data-activity-status]').forEach((button) => {
                button.addEventListener('click', () => this.setActivityStatus(button.dataset.activityStatus || ''));
            });
            this.contentElement.querySelectorAll('[data-activity-kind]').forEach((button) => {
                button.addEventListener('click', () => this.setActivityKind(button.dataset.activityKind || ''));
            });
            this.contentElement.querySelectorAll('[data-failure-read-action]').forEach((button) => {
                button.addEventListener('click', () => this.handleFailureReadAction());
            });
            this.contentElement.querySelectorAll('[data-agent-run-review-action]').forEach((button) => {
                button.addEventListener('click', () => this.handleAgentRunReviewAction(
                    button.dataset.agentRunReviewAction || '',
                    button.dataset.runId || '',
                ));
            });
        }
        if (this.activeTab === 'resources') {
            this.contentElement.querySelectorAll('[data-resource-open]').forEach((button) => {
                button.addEventListener('click', () => this.handleResourceOpen(button.dataset.resourceOpen || '', {
                    promptId: button.dataset.resourcePromptId || '',
                }));
            });
            this.contentElement.querySelectorAll('[data-resource-pending]').forEach((button) => {
                button.addEventListener('click', () => this.handleResourcePending(button.dataset.resourcePending || ''));
            });
        }
        if (['agents', 'prompts', 'diagnostics'].includes(this.activeTab)) {
            this.contentElement.querySelectorAll('[data-agent-card-open]').forEach((card) => {
                const open = () => this.openFloatingAgentCard(card.dataset.agentCardOpen || '');
                card.addEventListener('click', (event) => {
                    if (event.target?.closest?.('button, input, textarea, select, a')) return;
                    open();
                });
                card.addEventListener('keydown', (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    open();
                });
            });
            this.contentElement.querySelectorAll('[data-agent-card-action]').forEach((button) => {
                button.addEventListener('click', (event) => {
                    event.stopPropagation();
                    this.handleAgentCardToggle(
                    button.dataset.agentCardAction || '',
                    button.dataset.agentCardId || '',
                    );
                });
            });
            this.contentElement.querySelectorAll('[data-agent-resource-open]').forEach((button) => {
                button.addEventListener('click', () => this.handleResourceOpen(button.dataset.agentResourceOpen || ''));
            });
            this.contentElement.querySelectorAll('[data-agent-prompt-save]').forEach((button) => {
                button.addEventListener('click', () => this.handleAgentPromptSave(
                    button.dataset.agentPromptSave || '',
                    button,
                ));
            });
            this.contentElement.querySelectorAll('[data-memory-agent-save]').forEach((button) => {
                button.addEventListener('click', () => this.handleMemoryAgentSave(button));
            });
            this.contentElement.querySelectorAll('[data-agent-prompt-preview]').forEach((button) => {
                button.addEventListener('click', () => this.handleAgentPromptPreview(button.dataset.agentPromptPreview || ''));
            });
            this.contentElement.querySelectorAll('[data-reply-check-preview-target]').forEach((select) => {
                select.addEventListener('change', () => this.handleReplyCheckPreviewTargetChange(select.value || 'auto'));
            });
            this.contentElement.querySelectorAll('[data-agent-feature-action]').forEach((button) => {
                button.addEventListener('click', (event) => {
                    event.stopPropagation();
                    this.handleAgentFeatureToggle(
                    button.dataset.agentFeatureAction || '',
                    button.dataset.agentFeatureId || '',
                    );
                });
            });
            this.contentElement.querySelectorAll('[data-agent-feature-model-override]').forEach((input) => {
                input.addEventListener('change', async () => {
                    const id = input.dataset.agentFeatureModelOverride || '';
                    const agent = this.getAgentCardById(id);
                    if (!agent) return;
                    const chosen = input.value.trim();
                    const profileModel = (input.dataset.profileModel || '').trim();
                    await this.callAction('setAgentFeatureModel', {
                        id,
                        modelMode: 'profile',
                        modelProfileId: agent.modelProfileId,
                        // 与配置保存的模型相同 = 维持原样（存空覆盖）
                        modelOverride: chosen && chosen !== profileModel ? chosen : '',
                    }, null);
                    await this.refresh();
                });
                input.addEventListener('click', event => event.stopPropagation());
            });
            this.contentElement.querySelectorAll('[data-agent-model-pick]').forEach((btn) => {
                btn.addEventListener('click', async (event) => {
                    event.stopPropagation();
                    const id = btn.dataset.agentModelPick || '';
                    const agent = this.getAgentCardById(id);
                    const menu = this.contentElement?.querySelector?.(`[data-agent-model-menu="${id}"]`);
                    const input = this.contentElement?.querySelector?.(`[data-agent-feature-model-override="${id}"]`);
                    if (!agent?.modelProfileId || !menu || !input) return;
                    if (!menu.hidden) { menu.hidden = true; menu.innerHTML = ''; return; }
                    menu.hidden = false;
                    menu.innerHTML = '<div class="agent-center-model-menu-item is-loading">加载模型列表…</div>';
                    const models = await this.callAction('listProfileModels', agent.modelProfileId, []);
                    if (menu.hidden) return;
                    const renderOptions = () => {
                        if (menu.hidden) return;
                        const ranked = rankModelCandidates(models || [], input.value || '');
                        menu.innerHTML = ranked.length
                            ? ranked.map(m => `<button type="button" class="agent-center-model-menu-item" data-model-option="${escapeHtml(String(m))}">${escapeHtml(String(m))}</button>`).join('')
                            : '<div class="agent-center-model-menu-item is-loading">该渠道未返回模型列表，可手动输入</div>';
                        menu.querySelectorAll('[data-model-option]').forEach((option) => {
                            option.addEventListener('click', (ev) => {
                                ev.stopPropagation();
                                input.value = option.dataset.modelOption || '';
                                menu.hidden = true;
                                menu.innerHTML = '';
                                input.dispatchEvent(new Event('change', { bubbles: false }));
                            });
                        });
                    };
                    input.addEventListener('input', renderOptions);
                    renderOptions();
                });
            });
            this.contentElement.querySelectorAll('[data-agent-feature-model-select]').forEach((select) => {
                const id = select.dataset.agentFeatureModelSelect || '';
                const button = Array.from(this.contentElement.querySelectorAll('[data-agent-feature-model-button]'))
                    .find(item => item?.dataset?.agentFeatureModelButton === id);
                bindCustomSelectButton({
                    buttonEl: button,
                    selectEl: select,
                    fallback: '不调用模型',
                });
                select.addEventListener('change', () => this.handleAgentFeatureModelSelect(
                    select.dataset.agentFeatureModelSelect || '',
                    select.value || '',
                    select,
                ));
            });
            this.contentElement.querySelectorAll('[data-agent-feature-model-manage]').forEach((button) => {
                button.addEventListener('click', () => this.handleAgentFeatureModelManage(button.dataset.agentFeatureModelManage || ''));
            });
            this.contentElement.querySelectorAll('[data-agent-feature-trigger]').forEach((button) => {
                button.addEventListener('click', () => this.handleAgentFeatureTriggerMode(button.dataset.agentFeatureTrigger || ''));
            });
            this.contentElement.querySelectorAll('[data-agent-float-flip]').forEach((button) => {
                button.addEventListener('click', () => this.toggleFloatingAgentCard());
            });
            this.contentElement.querySelectorAll('[data-agent-float-close]').forEach((button) => {
                button.addEventListener('click', () => this.closeFloatingAgentCard());
            });
            this.contentElement.querySelector('[data-agent-float-layer]')?.addEventListener('click', (event) => {
                if (event.target?.dataset?.agentFloatLayer !== undefined) this.closeFloatingAgentCard();
            });
        }
        if (this.activeTab === 'safety') {
            this.contentElement.querySelectorAll('[data-session-gate-action]').forEach((button) => {
                button.addEventListener('click', () => this.handleSessionGateAction(button.dataset.sessionGateAction || ''));
            });
            this.contentElement.querySelectorAll('[data-write-preview-model-context-action]').forEach((button) => {
                button.addEventListener('click', () => this.handleWritePreviewModelContextAction(
                    button.dataset.writePreviewModelContextAction || '',
                ));
            });
            this.contentElement.querySelectorAll('[data-continuation-policy-strategy]').forEach((button) => {
                button.addEventListener('click', () => this.handleContinuationPolicyAction(button.dataset.continuationPolicyStrategy || ''));
            });
        }
    }
}
