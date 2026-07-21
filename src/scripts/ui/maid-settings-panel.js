import { MAID_SUB_AGENT_SKILLS } from '../storage/maid-settings-store.js';
import { escapeHtml } from '../utils/name-badges.js';
import { rankModelCandidates } from '../utils/model-candidates.js';
const STYLE_ID = 'maid-settings-panel-style';

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const injectStyle = (documentRef) => {
  if (!documentRef?.head || documentRef.getElementById?.(STYLE_ID)) return;
  const style = documentRef.createElement?.('style');
  if (!style) return;
  style.id = STYLE_ID;
  style.textContent = `
.maid-settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 26120;
  display: none;
  align-items: center;
  justify-content: center;
  padding: calc(12px + env(safe-area-inset-top, 0px)) 12px calc(12px + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
  background: rgba(15, 23, 42, 0.34);
}
.maid-settings-overlay.is-open {
  display: flex;
}
.maid-settings-panel {
  width: min(780px, 100%);
  height: min(680px, calc(var(--app-visual-height, 100dvh) - 24px));
  max-height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--app-border-default, rgba(148, 163, 184, 0.28));
  border-radius: 16px;
  background: var(--app-surface-card, #fff);
  color: var(--app-text-primary, #111827);
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.24);
}
.maid-settings-header {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid var(--app-border-default, rgba(148, 163, 184, 0.22));
  background: color-mix(in srgb, var(--app-surface-card, #fff) 90%, var(--app-surface-subtle, #f8fafc));
}
.maid-settings-mark {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 12px;
  background: rgba(37, 99, 235, 0.09);
  color: #2563eb;
}
.maid-settings-title {
  font-weight: 800;
  font-size: 15px;
  line-height: 1.2;
}
.maid-settings-icon {
  width: 18px;
  height: 18px;
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.maid-settings-close,
.maid-settings-action {
  border: 1px solid var(--app-border-default, rgba(148, 163, 184, 0.35));
  border-radius: 8px;
  background: var(--app-surface-card, #fff);
  color: inherit;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, transform 90ms ease;
}
.maid-settings-close {
  width: 32px;
  height: 32px;
  box-sizing: border-box;
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.maid-settings-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  overflow-x: auto;
  padding: 10px 12px;
  border-bottom: 1px solid var(--app-border-default, rgba(148, 163, 184, 0.22));
  background: var(--app-surface-card, #fff);
}
.maid-settings-tab {
  min-height: 34px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--app-text-secondary, #475569);
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  touch-action: manipulation;
}
.maid-settings-tab.is-active {
  color: var(--app-text-primary, #111827);
  border-color: rgba(37, 99, 235, 0.22);
  background: rgba(37, 99, 235, 0.08);
}
.maid-settings-tab .maid-settings-icon {
  width: 15px;
  height: 15px;
}
.maid-settings-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
.maid-settings-section {
  height: 100%;
  display: none;
  padding: 14px;
  box-sizing: border-box;
}
.maid-settings-section.is-active {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}
.maid-settings-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.maid-settings-list-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--app-border-default, rgba(148, 163, 184, 0.24));
  border-radius: 10px;
  background: var(--app-surface-subtle, #f8fafc);
  font-size: 13px;
  line-height: 1.45;
}
.maid-settings-item-main {
  flex: 1;
  min-width: 0;
}
.maid-settings-item-title {
  font-weight: 700;
  word-break: break-word;
}
.maid-settings-item-meta {
  color: var(--app-text-secondary, #6b7280);
  font-size: 12px;
  word-break: break-word;
}
.maid-settings-status-chip {
  flex: 0 0 auto;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: rgba(148, 163, 184, 0.16);
}
.maid-settings-status-chip.is-succeeded {
  color: #047857;
  background: rgba(16, 185, 129, 0.14);
}
.maid-settings-status-chip.is-failed {
  color: #b91c1c;
  background: rgba(239, 68, 68, 0.12);
}
.maid-settings-status-chip.is-interrupted {
  color: #b45309;
  background: rgba(245, 158, 11, 0.14);
}
.maid-settings-prompt-tabs {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 6px;
  padding: 4px;
  border: 1px solid var(--app-border-default, rgba(148, 163, 184, 0.26));
  border-radius: 10px;
  background: var(--app-surface-subtle, #f8fafc);
  align-self: flex-start;
}
.maid-settings-prompt-tab {
  min-height: 28px;
  box-sizing: border-box;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--app-text-secondary, #475569);
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  transition: background 120ms ease, border-color 120ms ease, transform 90ms ease;
  touch-action: manipulation;
}
.maid-settings-prompt-tab.is-active {
  color: var(--app-text-primary, #111827);
  border-color: rgba(37, 99, 235, 0.20);
  background: var(--app-surface-card, #fff);
}
.maid-settings-prompt-pane {
  min-height: 0;
  display: none;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
}
.maid-settings-prompt-pane.is-active {
  display: flex;
}
.maid-settings-label {
  font-size: 12px;
  font-weight: 800;
  color: var(--app-text-secondary, #475569);
}
.maid-settings-field {
  min-height: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 7px;
}
.maid-settings-split {
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1.2fr) minmax(0, 0.8fr);
  gap: 10px;
  flex: 1 1 auto;
}
.maid-settings-textarea {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  resize: none;
  box-sizing: border-box;
  border: 1px solid var(--app-border-default, rgba(148, 163, 184, 0.35));
  border-radius: 9px;
  padding: 10px 11px;
  background: var(--app-surface-card, #fff);
  color: var(--app-text-primary, #111827);
  font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  outline: none;
}
.maid-settings-textarea[readonly] {
  background: color-mix(in srgb, var(--app-surface-card, #fff) 88%, var(--app-surface-subtle, #f8fafc));
  color: var(--app-text-secondary, #475569);
}
.maid-settings-textarea:focus {
  border-color: rgba(37, 99, 235, 0.42);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
}
.maid-settings-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
}
.maid-settings-action {
  min-height: 32px;
  box-sizing: border-box;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 800;
  touch-action: manipulation;
}
.maid-settings-tab > *,
.maid-settings-prompt-tab > *,
.maid-settings-action > *,
.maid-settings-close > *,
.maid-settings-icon {
  pointer-events: none;
}
.maid-settings-action.is-primary {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}
.maid-settings-close:hover,
.maid-settings-action:hover,
.maid-settings-tab:hover,
.maid-settings-prompt-tab:hover {
  border-color: rgba(37, 99, 235, 0.28);
  background: var(--app-surface-subtle, #f8fafc);
}
.maid-settings-action.is-primary:hover {
  background: #1d4ed8;
}
.maid-settings-close:active,
.maid-settings-action:active,
.maid-settings-tab:active,
.maid-settings-prompt-tab:active {
  transform: translateY(1px);
}
.maid-settings-status {
  margin-left: auto;
  color: var(--app-text-secondary, #475569);
  font-size: 12px;
}
.maid-settings-empty {
  color: var(--app-text-muted, #64748b);
  font-size: 13px;
  line-height: 1.5;
}
.maid-settings-api-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 52px;
  padding: 10px 12px;
  border: 1px solid var(--app-border-default, rgba(148, 163, 184, 0.26));
  border-radius: 9px;
  background: var(--app-surface-subtle, #f8fafc);
}
@media (max-width: 640px) {
  .maid-settings-panel {
    width: 100%;
    height: 100%;
    max-height: 100%;
    border-radius: 12px;
  }
  .maid-settings-tabs {
    grid-template-columns: repeat(2, max-content);
  }
  .maid-settings-tab {
    padding: 0 9px;
  }
  .maid-settings-prompt-tabs {
    width: 100%;
    overflow-x: auto;
  }
  .maid-settings-prompt-tab {
    flex: 1 0 auto;
  }
  .maid-settings-split {
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  }
}
@media (prefers-reduced-motion: reduce) {
  .maid-settings-close,
  .maid-settings-action,
  .maid-settings-tab,
  .maid-settings-prompt-tab {
    transition: none;
  }
}

/* 2026-07 女仆设定视觉重构：参考 ARIA Assistant，保留原运行时与表单契约。 */
.maid-settings-overlay {
  display: flex;
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
  padding: clamp(16px, 3vw, 32px);
  background: rgba(15, 23, 42, 0.25);
  -webkit-backdrop-filter: blur(7px);
  backdrop-filter: blur(7px);
  transition: opacity 240ms ease, visibility 0s linear 320ms;
}
.maid-settings-overlay.is-open {
  visibility: visible;
  opacity: 1;
  pointer-events: auto;
  transition-delay: 0s;
}
.maid-settings-panel {
  position: relative;
  width: min(920px, 94vw);
  height: min(780px, 88vh);
  max-height: calc(var(--app-visual-height, 100dvh) - 32px);
  isolation: isolate;
  border: 1px solid color-mix(in srgb, var(--app-border-default) 72%, transparent);
  border-radius: 28px;
  background: var(--app-surface-card, #fff);
  box-shadow: 0 40px 120px -24px rgba(15, 23, 42, 0.45), 0 2px 8px rgba(15, 23, 42, 0.06);
  opacity: 0;
  transform: translate3d(0, 24px, 0) scale(0.94);
  transition: transform 380ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease;
}
.maid-settings-overlay.is-open .maid-settings-panel {
  opacity: 1;
  transform: translate3d(0, 0, 0) scale(1);
}
.maid-settings-panel::before {
  content: '';
  position: absolute;
  z-index: 3;
  top: 0;
  left: 32px;
  right: 32px;
  height: 1px;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--app-text-inverse, #fff) 76%, transparent), transparent);
}
.maid-settings-header {
  min-height: 86px;
  gap: 14px;
  padding: 18px 28px 16px;
  border-bottom: 0;
  background: var(--app-surface-card, #fff);
}
.maid-settings-mark {
  width: 44px;
  height: 44px;
  border: 1px solid rgba(var(--app-accent-rgb, 37, 99, 235), 0.38);
  border-radius: 16px;
  background: linear-gradient(135deg, var(--app-accent-primary, #3b82f6), var(--app-accent-strong, #4f46e5));
  color: var(--app-text-inverse, #fff);
  box-shadow: 0 12px 26px -10px rgba(var(--app-accent-rgb, 37, 99, 235), 0.7);
}
.maid-settings-mark .maid-settings-icon {
  width: 22px;
  height: 22px;
  stroke-width: 2.05;
}
.maid-settings-header-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.maid-settings-title {
  color: var(--app-text-primary, #111827);
  font-size: 17px;
  font-weight: 850;
  line-height: 1.2;
  letter-spacing: 0.025em;
}
.maid-settings-header-meta {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--app-text-muted, #94a3b8);
  font-size: 11px;
  line-height: 1.3;
}
.maid-settings-assistant-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 650;
  letter-spacing: 0.08em;
}
.maid-settings-header-separator {
  color: color-mix(in srgb, var(--app-text-muted) 36%, transparent);
}
.maid-settings-runtime-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--app-success-text, #059669);
  white-space: nowrap;
}
.maid-settings-runtime-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 12%, transparent);
}
.maid-settings-close {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  color: var(--app-text-muted, #94a3b8);
  transition: color 180ms ease, background 180ms ease, border-color 180ms ease, transform 300ms cubic-bezier(0.22, 1, 0.36, 1);
}
.maid-settings-close .maid-settings-icon {
  width: 18px;
  height: 18px;
}
.maid-settings-tabs {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
  margin: 0 28px 16px;
  padding: 4px;
  overflow: visible;
  border: 1px solid color-mix(in srgb, var(--app-border-subtle) 54%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--app-surface-subtle) 82%, var(--app-surface-card));
}
.maid-settings-tab {
  position: relative;
  min-height: 44px;
  gap: 8px;
  padding: 0 12px;
  border-radius: 12px;
  color: var(--app-text-muted, #94a3b8);
  font-size: 13.5px;
  font-weight: 700;
  transition: color 180ms ease, background 220ms ease, border-color 220ms ease, box-shadow 220ms ease, transform 120ms ease;
}
.maid-settings-tab.is-active {
  color: var(--app-text-primary, #111827);
  border-color: color-mix(in srgb, var(--app-border-default) 42%, transparent);
  background: var(--app-surface-card, #fff);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.07), 0 6px 16px -6px rgba(15, 23, 42, 0.12);
}
.maid-settings-tab .maid-settings-icon {
  width: 16px;
  height: 16px;
  color: var(--app-text-muted, #94a3b8);
  transition: color 180ms ease, transform 220ms ease;
}
.maid-settings-tab.is-active .maid-settings-icon {
  color: var(--app-accent-primary, #2563eb);
}
.maid-settings-body {
  border-top: 1px solid var(--app-border-subtle, rgba(148, 163, 184, 0.18));
  background: var(--app-surface-card, #fff);
}
.maid-settings-section {
  padding: 24px 28px 28px;
}
.maid-settings-section.is-active {
  gap: 18px;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--app-text-muted) 38%, transparent) transparent;
  animation: maid-settings-section-in 200ms ease-out both;
  overscroll-behavior: contain;
}
.maid-settings-section.is-active::-webkit-scrollbar,
.maid-settings-list::-webkit-scrollbar,
.maid-settings-prompt-tabs::-webkit-scrollbar,
.maid-subagent-model-menu::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.maid-settings-section.is-active::-webkit-scrollbar-thumb,
.maid-settings-list::-webkit-scrollbar-thumb,
.maid-settings-prompt-tabs::-webkit-scrollbar-thumb,
.maid-subagent-model-menu::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-text-muted) 38%, transparent);
}
.maid-settings-section-caption {
  display: flex;
  align-items: baseline;
  gap: 9px;
  margin: 0 0 2px;
  color: var(--app-text-muted, #94a3b8);
  font-size: 12px;
  font-weight: 750;
}
.maid-settings-section-caption small {
  color: color-mix(in srgb, var(--app-text-muted) 56%, transparent);
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}
.maid-settings-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.maid-settings-section-title-row {
  display: flex;
  align-items: center;
  gap: 9px;
}
.maid-settings-section-title {
  color: var(--app-text-primary, #111827);
  font-size: 15px;
  font-weight: 800;
}
.maid-settings-count-badge {
  min-width: 22px;
  padding: 2px 7px;
  box-sizing: border-box;
  border: 1px solid rgba(var(--app-accent-rgb, 37, 99, 235), 0.14);
  border-radius: 999px;
  background: rgba(var(--app-accent-rgb, 37, 99, 235), 0.08);
  color: var(--app-accent-primary, #2563eb);
  font-size: 11px;
  font-weight: 750;
  text-align: center;
}
.maid-settings-list {
  gap: 12px;
  padding: 1px;
}
.maid-settings-list-item {
  position: relative;
  gap: 14px;
  padding: 15px 16px;
  border-color: color-mix(in srgb, var(--app-border-default) 72%, transparent);
  border-radius: 16px;
  background: var(--app-surface-card, #fff);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.025);
  font-size: 13px;
  line-height: 1.55;
  transition: transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease;
}
.maid-settings-list-item.is-run {
  align-items: flex-start;
}
.maid-settings-list-item.is-rule {
  align-items: center;
}
.maid-settings-item-main {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.maid-settings-item-heading {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.maid-settings-item-title {
  min-width: 0;
  flex: 1;
  color: var(--app-text-primary, #111827);
  font-size: 14px;
  font-weight: 800;
  line-height: 1.45;
}
.maid-settings-item-meta {
  color: var(--app-text-secondary, #64748b);
  font-size: 12.5px;
  line-height: 1.65;
}
.maid-settings-item-time {
  flex: 0 0 auto;
  color: var(--app-text-muted, #94a3b8);
  font: 10.5px/1.8 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: nowrap;
}
.maid-settings-item-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.maid-settings-item-tag {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 1px 7px;
  border-radius: 6px;
  background: var(--app-surface-subtle, #f8fafc);
  color: var(--app-text-secondary, #64748b);
  font-size: 11px;
  font-weight: 650;
}
.maid-settings-run-icon,
.maid-settings-rule-icon {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 36px;
  border: 1px solid currentColor;
  border-radius: 50%;
}
.maid-settings-run-icon .maid-settings-icon,
.maid-settings-rule-icon .maid-settings-icon {
  width: 18px;
  height: 18px;
}
.maid-settings-run-icon.is-succeeded {
  color: var(--app-success-text, #059669);
  background: color-mix(in srgb, var(--app-success-text, #059669) 9%, var(--app-surface-card));
  border-color: color-mix(in srgb, var(--app-success-text, #059669) 18%, transparent);
}
.maid-settings-run-icon.is-failed {
  color: var(--app-danger-text, #dc2626);
  background: color-mix(in srgb, var(--app-danger-text, #dc2626) 9%, var(--app-surface-card));
  border-color: color-mix(in srgb, var(--app-danger-text, #dc2626) 18%, transparent);
}
.maid-settings-run-icon.is-interrupted {
  color: var(--app-warning-text, #b45309);
  background: color-mix(in srgb, var(--app-warning-text, #b45309) 9%, var(--app-surface-card));
  border-color: color-mix(in srgb, var(--app-warning-text, #b45309) 18%, transparent);
}
.maid-settings-rule-icon {
  border-radius: 12px;
  color: var(--app-accent-primary, #2563eb);
  background: rgba(var(--app-accent-rgb, 37, 99, 235), 0.08);
  border-color: rgba(var(--app-accent-rgb, 37, 99, 235), 0.14);
}
.maid-settings-status-chip {
  min-height: 20px;
  box-sizing: border-box;
  padding: 1px 7px;
  border: 1px solid currentColor;
  font-size: 11px;
  font-weight: 750;
}
.maid-settings-status-chip.is-succeeded {
  color: var(--app-success-text, #047857);
  background: color-mix(in srgb, var(--app-success-text, #047857) 8%, transparent);
  border-color: color-mix(in srgb, var(--app-success-text, #047857) 16%, transparent);
}
.maid-settings-status-chip.is-failed {
  color: var(--app-danger-text, #b91c1c);
  background: color-mix(in srgb, var(--app-danger-text, #b91c1c) 8%, transparent);
  border-color: color-mix(in srgb, var(--app-danger-text, #b91c1c) 16%, transparent);
}
.maid-settings-status-chip.is-interrupted {
  color: var(--app-warning-text, #b45309);
  background: color-mix(in srgb, var(--app-warning-text, #b45309) 8%, transparent);
  border-color: color-mix(in srgb, var(--app-warning-text, #b45309) 16%, transparent);
}
.maid-settings-prompt-tabs {
  max-width: 100%;
  gap: 4px;
  overflow-x: auto;
  padding: 4px;
  border-color: color-mix(in srgb, var(--app-border-subtle) 54%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--app-surface-subtle) 82%, var(--app-surface-card));
  scrollbar-width: none;
}
.maid-settings-prompt-tabs::-webkit-scrollbar {
  display: none;
}
.maid-settings-prompt-tab {
  min-height: 32px;
  padding: 0 14px;
  border-radius: 11px;
  color: var(--app-text-muted, #94a3b8);
  font-size: 13px;
  font-weight: 650;
  transition: color 180ms ease, background 220ms ease, border-color 220ms ease, box-shadow 220ms ease, transform 120ms ease;
}
.maid-settings-prompt-tab.is-active {
  border-color: color-mix(in srgb, var(--app-border-default) 42%, transparent);
  background: var(--app-surface-card, #fff);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.07), 0 4px 12px -4px rgba(15, 23, 42, 0.1);
}
.maid-settings-prompt-pane {
  gap: 14px;
}
.maid-settings-prompt-pane.is-active {
  animation: maid-settings-pane-in 180ms ease-out both;
}
.maid-settings-field {
  gap: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--app-border-default) 76%, transparent);
  border-radius: 16px;
  background: var(--app-surface-card, #fff);
}
.maid-settings-field-header {
  min-height: 45px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 18px;
  border-bottom: 1px solid var(--app-border-subtle, rgba(148, 163, 184, 0.18));
}
.maid-settings-label {
  color: var(--app-text-secondary, #64748b);
  font-size: 13px;
  font-weight: 750;
}
.maid-settings-field > .maid-settings-label {
  min-height: 44px;
  display: flex;
  align-items: center;
  padding: 0 18px;
  border-bottom: 1px solid var(--app-border-subtle, rgba(148, 163, 184, 0.18));
}
.maid-settings-char-count {
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--app-surface-subtle, #f8fafc);
  color: var(--app-text-muted, #94a3b8);
  font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.maid-settings-split {
  gap: 14px;
}
.maid-settings-textarea {
  border: 0;
  border-radius: 0;
  padding: 18px 20px;
  background: color-mix(in srgb, var(--app-surface-subtle) 42%, var(--app-surface-card));
  color: var(--app-text-secondary, #475569);
  font: 13.5px/1.8 ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  caret-color: var(--app-accent-primary, #2563eb);
}
.maid-settings-textarea[readonly] {
  background: color-mix(in srgb, var(--app-surface-subtle) 48%, var(--app-surface-card));
}
.maid-settings-textarea:focus {
  border-color: transparent;
  box-shadow: inset 0 0 0 2px rgba(var(--app-accent-rgb, 37, 99, 235), 0.16);
}
.maid-settings-footer {
  min-height: 38px;
  gap: 10px;
}
.maid-settings-action {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 15px;
  border-radius: 11px;
  color: var(--app-text-secondary, #475569);
  font-size: 13px;
  font-weight: 700;
  transition: color 180ms ease, background 180ms ease, border-color 180ms ease, transform 120ms ease, box-shadow 180ms ease;
}
.maid-settings-action .maid-settings-icon {
  width: 15px;
  height: 15px;
}
.maid-settings-action.is-primary {
  border-color: var(--app-accent-primary, #2563eb);
  background: var(--app-accent-primary, #2563eb);
  color: var(--app-text-inverse, #fff);
  box-shadow: 0 10px 24px -10px rgba(var(--app-accent-rgb, 37, 99, 235), 0.7);
}
.maid-settings-status {
  min-width: 0;
  margin: 0 auto 0 0;
  color: var(--app-success-text, #059669);
  font-size: 12px;
}
.maid-settings-empty {
  padding: 16px;
  border: 1px dashed var(--app-border-default, rgba(148, 163, 184, 0.34));
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-surface-subtle) 54%, transparent);
  text-align: center;
}
.maid-settings-empty-state {
  min-height: 250px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 36px 24px;
  box-sizing: border-box;
  border: 2px dashed color-mix(in srgb, var(--app-border-default) 76%, transparent);
  border-radius: 24px;
  background: color-mix(in srgb, var(--app-surface-subtle) 44%, transparent);
  text-align: center;
}
.maid-settings-empty-state-icon {
  width: 56px;
  height: 56px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--app-border-default, rgba(148, 163, 184, 0.28));
  border-radius: 18px;
  background: var(--app-surface-card, #fff);
  color: var(--app-text-muted, #94a3b8);
  box-shadow: 0 8px 20px -8px rgba(15, 23, 42, 0.15);
}
.maid-settings-empty-state-icon .maid-settings-icon {
  width: 28px;
  height: 28px;
  stroke-width: 1.6;
}
.maid-settings-empty-state strong {
  margin-top: 16px;
  color: var(--app-text-secondary, #475569);
  font-size: 14px;
}
.maid-settings-empty-state p {
  max-width: 390px;
  margin: 7px 0 0;
  color: var(--app-text-muted, #94a3b8);
  font-size: 13px;
  line-height: 1.65;
}

/* API 首页卡片与二级编辑页。运行时样式晚于 qq-legacy，统一覆盖旧紧凑表单。 */
.maid-api-nav {
  gap: 14px;
}
.maid-api-nav-item {
  min-height: 78px;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  grid-template-areas: 'icon copy chevron';
  gap: 14px;
  padding: 15px 16px;
  border-color: color-mix(in srgb, var(--app-border-default) 72%, transparent);
  border-radius: 17px;
  background: var(--app-surface-card, #fff);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.025);
  transition: transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease;
}
.maid-api-nav-icon {
  grid-area: icon;
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 13px;
  color: var(--app-accent-primary, #2563eb);
  background: rgba(var(--app-accent-rgb, 37, 99, 235), 0.08);
}
.maid-api-nav-icon.is-subagent {
  color: var(--app-accent-strong, #7c3aed);
  background: color-mix(in srgb, var(--app-accent-soft) 68%, transparent);
}
.maid-api-nav-icon .maid-settings-icon {
  width: 20px;
  height: 20px;
}
.maid-api-nav-copy {
  grid-area: copy;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.maid-api-nav-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.maid-api-nav-title {
  color: var(--app-text-primary, #111827);
  font-size: 14px;
  font-weight: 800;
}
.maid-api-nav-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 20px;
  padding: 1px 8px;
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--app-success-text, #059669) 14%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-success-text, #059669) 8%, transparent);
  color: var(--app-success-text, #059669);
  font-size: 11px;
  font-weight: 700;
}
.maid-api-nav-badge::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.maid-api-nav-badge.is-muted {
  border-color: var(--app-border-subtle, rgba(148, 163, 184, 0.2));
  background: var(--app-surface-subtle, #f8fafc);
  color: var(--app-text-muted, #94a3b8);
}
.maid-api-nav-summary {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--app-text-muted, #94a3b8);
  font-size: 12px;
}
.maid-api-nav-summary > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.maid-api-nav-summary code {
  max-width: min(360px, 60vw);
  overflow: hidden;
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--app-surface-subtle, #f8fafc);
  color: var(--app-text-secondary, #64748b);
  font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.maid-api-nav-chevron {
  grid-area: chevron;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-muted, #94a3b8);
  transition: color 180ms ease, transform 220ms ease;
}
.maid-api-nav-chevron .maid-settings-icon {
  width: 16px;
  height: 16px;
}
.maid-api-back {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  border-radius: 10px;
  transition: color 180ms ease, background 180ms ease, transform 120ms ease;
}
.maid-api-back .maid-settings-icon {
  width: 14px;
  height: 14px;
  transform: rotate(180deg);
}
.maid-api-group {
  gap: 12px;
  padding: 18px;
  border-color: color-mix(in srgb, var(--app-border-default) 74%, transparent);
  border-radius: 18px;
  background: var(--app-surface-card, #fff);
}
.maid-api-group-title {
  font-size: 15px;
  font-weight: 800;
}
.maid-api-group-desc {
  margin-top: -5px;
  font-size: 12px;
  line-height: 1.65;
}
.maid-api-field {
  gap: 6px;
}
.maid-api-field-label {
  font-size: 11.5px;
  font-weight: 700;
}
.maid-api-form-title {
  padding-top: 14px;
  font-size: 13px;
  border-top-color: var(--app-border-subtle, rgba(148, 163, 184, 0.2));
}
.maid-subagent-select,
.maid-subagent-input {
  min-height: 38px;
  padding: 8px 11px;
  border-color: var(--app-border-default, rgba(148, 163, 184, 0.28));
  border-radius: 10px;
  font-size: 13px;
  outline: none;
  transition: border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
}
.maid-subagent-select:focus,
.maid-subagent-input:focus {
  border-color: rgba(var(--app-accent-rgb, 37, 99, 235), 0.46);
  box-shadow: 0 0 0 3px rgba(var(--app-accent-rgb, 37, 99, 235), 0.1);
}
.maid-subagent-list {
  gap: 8px;
}
.maid-subagent-item {
  gap: 9px;
  padding: 10px 11px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-surface-subtle) 48%, var(--app-surface-card));
}
.maid-subagent-form {
  gap: 9px;
}
.maid-subagent-model-menu {
  border-radius: 10px;
  padding: 5px;
  box-shadow: 0 14px 34px -18px rgba(15, 23, 42, 0.3);
}
.maid-subagent-model-option {
  min-height: 32px;
  border-radius: 8px;
  font-size: 12px;
}
.maid-subagent-skill {
  min-height: 28px;
  padding: 3px 8px;
  border: 1px solid var(--app-border-subtle, rgba(148, 163, 184, 0.2));
  border-radius: 9px;
  background: var(--app-surface-subtle, #f8fafc);
}

@media (hover: hover) and (pointer: fine) {
  .maid-settings-close:hover {
    border-color: var(--app-border-default, rgba(148, 163, 184, 0.34));
    background: var(--app-surface-subtle, #f8fafc);
    color: var(--app-text-primary, #111827);
    transform: rotate(90deg);
  }
  .maid-settings-tab:not(.is-active):hover,
  .maid-settings-prompt-tab:not(.is-active):hover {
    color: var(--app-text-secondary, #475569);
    background: transparent;
  }
  .maid-settings-tab:hover .maid-settings-icon {
    transform: translateY(-1px);
  }
  .maid-settings-list-item:hover,
  .maid-api-nav-item:hover {
    border-color: rgba(var(--app-accent-rgb, 37, 99, 235), 0.24);
    background: var(--app-surface-card, #fff);
    box-shadow: 0 16px 38px -24px rgba(var(--app-accent-rgb, 37, 99, 235), 0.34);
    transform: translateY(-2px);
  }
  .maid-api-nav-item:hover .maid-api-nav-chevron {
    color: var(--app-accent-primary, #2563eb);
    transform: translateX(3px);
  }
  .maid-settings-action:hover {
    border-color: color-mix(in srgb, var(--app-border-default) 86%, var(--app-accent-primary));
    background: var(--app-surface-subtle, #f8fafc);
  }
  .maid-settings-action.is-primary:hover {
    border-color: var(--app-accent-strong, #1d4ed8);
    background: var(--app-accent-strong, #1d4ed8);
  }
  .maid-api-back:hover {
    background: var(--app-surface-subtle, #f8fafc);
  }
}

@keyframes maid-settings-section-in {
  from { opacity: 0; transform: translate3d(0, 10px, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}
@keyframes maid-settings-pane-in {
  from { opacity: 0; transform: translate3d(0, 8px, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}

@media (max-width: 640px) {
  .maid-settings-overlay {
    padding: 0;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
  .maid-settings-panel {
    width: 100%;
    height: var(--app-visual-height, 100dvh);
    max-height: var(--app-visual-height, 100dvh);
    border: 0;
    border-radius: 0;
    box-shadow: none;
    transform: translate3d(0, 18px, 0) scale(0.99);
  }
  .maid-settings-header {
    min-height: 72px;
    padding: calc(10px + env(safe-area-inset-top, 0px)) 16px 10px;
  }
  .maid-settings-mark {
    width: 40px;
    height: 40px;
    border-radius: 14px;
  }
  .maid-settings-title {
    font-size: 16px;
  }
  .maid-settings-header-meta {
    font-size: 10.5px;
  }
  .maid-settings-close {
    width: 38px;
    height: 38px;
  }
  .maid-settings-tabs {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 3px;
    margin: 0 12px 12px;
    padding: 3px;
    overflow: visible;
    border-radius: 14px;
  }
  .maid-settings-tab {
    min-width: 0;
    min-height: 40px;
    gap: 5px;
    padding: 0 5px;
    border-radius: 11px;
    font-size: 11.5px;
  }
  .maid-settings-tab .maid-settings-icon {
    width: 14px;
    height: 14px;
  }
  .maid-settings-section {
    padding: 18px 14px calc(22px + env(safe-area-inset-bottom, 0px));
  }
  .maid-settings-section.is-active {
    gap: 14px;
  }
  .maid-settings-prompt-tabs {
    width: 100%;
    align-self: stretch;
    box-sizing: border-box;
  }
  .maid-settings-prompt-tab {
    flex: 0 0 auto;
    min-height: 31px;
    padding: 0 12px;
    font-size: 12px;
  }
  .maid-settings-split {
    grid-template-rows: minmax(180px, 1fr) minmax(150px, 0.8fr);
  }
  .maid-settings-textarea {
    min-height: 180px;
    padding: 15px 16px;
    font-size: 13px;
    line-height: 1.75;
  }
  .maid-settings-footer {
    flex-wrap: wrap;
  }
  .maid-settings-status {
    flex: 1 0 100%;
    order: -1;
  }
  .maid-settings-action {
    min-height: 38px;
  }
  .maid-api-nav-item {
    grid-template-columns: 40px minmax(0, 1fr) auto;
    gap: 11px;
    padding: 13px;
  }
  .maid-api-nav-icon {
    width: 40px;
    height: 40px;
  }
  .maid-api-nav-summary code {
    max-width: 42vw;
  }
  .maid-api-group {
    padding: 15px;
  }
  .maid-subagent-item {
    flex-wrap: wrap;
  }
  .maid-subagent-item-main {
    flex-basis: calc(100% - 8px);
  }
  .maid-settings-list-item {
    gap: 11px;
    padding: 13px;
  }
  .maid-settings-item-heading {
    flex-wrap: wrap;
  }
  .maid-settings-item-time {
    flex-basis: 100%;
    order: 3;
  }
  .maid-settings-run-icon,
  .maid-settings-rule-icon {
    width: 34px;
    height: 34px;
    flex-basis: 34px;
  }
  .maid-settings-empty-state {
    min-height: 300px;
    padding: 32px 18px;
  }
}

@media (max-width: 380px) {
  .maid-settings-tab {
    flex-direction: column;
    gap: 2px;
    min-height: 44px;
    font-size: 10.5px;
  }
  .maid-settings-header-separator {
    display: none;
  }
  .maid-api-nav-heading {
    gap: 5px;
  }
  .maid-api-nav-badge {
    padding-inline: 6px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .maid-settings-overlay,
  .maid-settings-panel,
  .maid-settings-overlay *,
  .maid-settings-overlay *::before,
  .maid-settings-overlay *::after {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
}
body[data-reduced-motion='on'] .maid-settings-overlay,
body[data-reduced-motion='on'] .maid-settings-panel,
body[data-reduced-motion='on'] .maid-settings-overlay *,
body[data-reduced-motion='on'] .maid-settings-overlay *::before,
body[data-reduced-motion='on'] .maid-settings-overlay *::after {
  animation: none !important;
  transition: none !important;
  scroll-behavior: auto !important;
}
`;
  documentRef.head.appendChild(style);
};

const createButton = (documentRef, className, text) => {
  const button = documentRef.createElement?.('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  return button;
};

const createTextarea = (documentRef, { readOnly = false } = {}) => {
  const textarea = documentRef.createElement?.('textarea');
  textarea.className = 'maid-settings-textarea';
  textarea.spellcheck = false;
  if (readOnly) textarea.readOnly = true;
  return textarea;
};

const iconSvg = body => `
  <svg class="maid-settings-icon" viewBox="0 0 24 24" aria-hidden="true">
    ${body}
  </svg>
`;

const ICONS = Object.freeze({
  maid: iconSvg('<path d="M12 5v3"/><path d="M8 8h8"/><path d="M7 12a5 5 0 0 1 10 0v3.5A2.5 2.5 0 0 1 14.5 18h-5A2.5 2.5 0 0 1 7 15.5Z"/><path d="M9 13h.01"/><path d="M15 13h.01"/><path d="M10 18v2"/><path d="M14 18v2"/>'),
  close: iconSvg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  api: iconSvg('<path d="M7 7h10v10H7z"/><path d="M3 10h4"/><path d="M3 14h4"/><path d="M17 10h4"/><path d="M17 14h4"/><path d="M10 3v4"/><path d="M14 3v4"/><path d="M10 17v4"/><path d="M14 17v4"/>'),
  prompt: iconSvg('<path d="M5 5h14"/><path d="M5 9h10"/><path d="M5 15h14"/><path d="M5 19h9"/>'),
  knowledge: iconSvg('<path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4Z"/><path d="M9 8h6"/><path d="M9 12h5"/>'),
  history: iconSvg('<path d="M4 12a8 8 0 1 0 3-6.25"/><path d="M4 4v5h5"/><path d="M12 8v5l3 2"/>'),
  table: iconSvg('<path d="M4 5h16v14H4z"/><path d="M4 10h16"/><path d="M4 15h16"/><path d="M10 5v14"/>'),
  request: iconSvg('<path d="M5 5h14v14H5z"/><path d="M8 9h8"/><path d="M8 13h5"/><path d="M8 17h7"/>'),
  response: iconSvg('<path d="M4 6h16v10H7l-3 3Z"/><path d="M8 10h8"/><path d="M8 14h5"/>'),
  activity: iconSvg('<path d="M4 12h4l2-6 4 12 2-6h4"/>'),
  shield: iconSvg('<path d="M12 3 5 6v5c0 4.4 3 8.1 7 9 4-.9 7-4.6 7-9V6Z"/><path d="m9.5 12 2 2 3.5-3.5"/>'),
  bolt: iconSvg('<path d="m13 2-8 12h7l-1 8 8-12h-7Z"/>'),
  chevron: iconSvg('<path d="m9 18 6-6-6-6"/>'),
  checkCircle: iconSvg('<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.2 2.2 4.8-4.8"/>'),
  alertCircle: iconSvg('<circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/>'),
  clock: iconSvg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  copy: iconSvg('<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  save: iconSvg('<path d="M5 4h12l2 2v14H5Z"/><path d="M8 4v6h8V4"/><path d="M8 20v-6h8v6"/>'),
});

const clearChildren = (el) => {
  if (!el) return;
  if (typeof el.replaceChildren === 'function') {
    el.replaceChildren();
    return;
  }
  if (Array.isArray(el.children)) {
    el.children.length = 0;
    return;
  }
  while (el.firstChild) el.removeChild(el.firstChild);
};

const formatRunTime = (timestamp = 0) => {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return '';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return '';
  }
};

const describeMaidRunStatus = (run = {}) => {
  if (run?.status === 'succeeded') return { key: 'succeeded', label: '成功' };
  if (run?.metadata?.maidStatus === 'interrupted') return { key: 'interrupted', label: '中断' };
  return { key: 'failed', label: '失败' };
};

const setIconButtonContent = (button, icon = '', label = '') => {
  if (!button) return;
  button.innerHTML = `${icon}${label ? `<span>${label}</span>` : ''}`;
};

export const createMaidSettingsPanel = ({
  documentRef = globalThis?.document || null,
  settingsStore = null,
  listModelProfiles = null,
  listProfileModels = null,
  onOpenApiConfig = null,
  getAppKnowledgeText = () => '',
  getHistoryContextText = () => '',
  getMemoryTableText = () => '',
  listRuns = null,
  allowRulesStore = null,
  onResumeRun = null,
  copyText = text => globalThis?.navigator?.clipboard?.writeText?.(text),
  logger = console,
} = {}) => {
  let overlay = null;
  let panel = null;
  let activeTab = 'api';
  let activePromptTab = 'persona';
  const tabButtons = new Map();
  const sections = new Map();
  const promptTabButtons = new Map();
  const promptPanes = new Map();
  let promptTextarea = null;
  let appKnowledgeTextarea = null;
  let historyContextTextarea = null;
  let memoryTableTextarea = null;
  let lastAppContextTextarea = null;
  let lastPromptTextarea = null;
  let lastResponseTextarea = null;
  let statusEl = null;
  let runListEl = null;
  let runCountEl = null;
  let ruleListEl = null;
  let promptCountEl = null;
  let isOpen = false;

  const setStatus = (message = '') => {
    if (!statusEl) return;
    statusEl.textContent = trim(message);
  };

  const getLastPromptText = () => trim(settingsStore?.getLastRequestPrompt?.(), '尚未记录任何女仆本次提示词。');
  const getLastAppContextText = () => trim(settingsStore?.getLastAppContext?.(), '尚未记录任何本次检索。');
  const getLastResponseText = () => trim(settingsStore?.getLastFullResponse?.(), '尚未记录任何女仆完整回复。');
  const getAppKnowledge = () => trim(getAppKnowledgeText?.(), '暂无 APP 知识。');
  const getHistoryContext = () => trim(getHistoryContextText?.(), '尚未记录女仆历史上下文。');
  const getMemoryTable = () => trim(getMemoryTableText?.(), '尚未生成女仆记忆表格。');

  const appendEmptyItem = (container, message = '') => {
    const empty = documentRef.createElement?.('div');
    empty.className = 'maid-settings-empty';
    empty.textContent = message;
    container.appendChild(empty);
  };

  const renderRuns = () => {
    if (!runListEl) return;
    clearChildren(runListEl);
    let runs = [];
    try {
      runs = typeof listRuns === 'function' ? (listRuns({ limit: 20 }) || []) : [];
    } catch (error) {
      logger?.warn?.('maid settings list runs failed', error);
    }
    if (runCountEl) runCountEl.textContent = String(runs.length);
    if (!runs.length) {
      appendEmptyItem(runListEl, '还没有女仆任务记录。');
      return;
    }
    runs.forEach((run) => {
      const item = documentRef.createElement?.('div');
      item.className = 'maid-settings-list-item is-run';
      const status = describeMaidRunStatus(run);
      const runIcon = documentRef.createElement?.('span');
      runIcon.className = `maid-settings-run-icon is-${status.key}`;
      runIcon.innerHTML = status.key === 'succeeded'
        ? ICONS.checkCircle
        : status.key === 'interrupted'
          ? ICONS.clock
          : ICONS.alertCircle;
      const chip = documentRef.createElement?.('span');
      chip.className = `maid-settings-status-chip is-${status.key}`;
      chip.textContent = status.label;
      const main = documentRef.createElement?.('div');
      main.className = 'maid-settings-item-main';
      const heading = documentRef.createElement?.('div');
      heading.className = 'maid-settings-item-heading';
      const title = documentRef.createElement?.('div');
      title.className = 'maid-settings-item-title';
      title.textContent = trim(run?.metadata?.goal || run?.title, '（无目标记录）');
      const time = documentRef.createElement?.('time');
      time.className = 'maid-settings-item-time';
      time.textContent = formatRunTime(run?.updatedAt);
      heading.append(title, chip, time);
      const meta = documentRef.createElement?.('div');
      meta.className = 'maid-settings-item-meta';
      meta.textContent = trim(run?.summary, '暂无执行摘要。');
      const tags = documentRef.createElement?.('div');
      tags.className = 'maid-settings-item-tags';
      [
        run?.metadata?.failureCode ? `分类: ${run.metadata.failureCode}` : '',
        run?.metadata?.stepCount ? `${run.metadata.stepCount} 步` : '',
        run?.metadata?.continuable ? '可继续' : '',
      ].filter(Boolean).forEach((label) => {
        const tag = documentRef.createElement?.('span');
        tag.className = 'maid-settings-item-tag';
        tag.textContent = label;
        tags.appendChild(tag);
      });
      main.append(heading, meta);
      if (tags.children?.length) main.appendChild(tags);
      item.append(runIcon, main);
      if (run?.metadata?.continuable && typeof onResumeRun === 'function') {
        const resumeBtn = createButton(documentRef, 'maid-settings-action is-primary', '继续');
        resumeBtn.addEventListener?.('click', () => {
          hide();
          void onResumeRun({ ...run });
        });
        item.appendChild(resumeBtn);
      }
      runListEl.appendChild(item);
    });
  };

  const renderRules = () => {
    if (!ruleListEl) return;
    clearChildren(ruleListEl);
    let rules = [];
    try {
      rules = allowRulesStore?.list?.() || [];
    } catch (error) {
      logger?.warn?.('maid settings list allow rules failed', error);
    }
    if (!rules.length) {
      const empty = documentRef.createElement?.('div');
      empty.className = 'maid-settings-empty-state';
      const icon = documentRef.createElement?.('span');
      icon.className = 'maid-settings-empty-state-icon';
      icon.innerHTML = ICONS.shield;
      const title = documentRef.createElement?.('strong');
      title.textContent = '尚无始终允许规则';
      const copy = documentRef.createElement?.('p');
      copy.textContent = '没有已保存的“始终允许”规则。危险操作每次都会重新确认。';
      empty.append(icon, title, copy);
      ruleListEl.appendChild(empty);
      return;
    }
    rules.forEach((rule) => {
      const item = documentRef.createElement?.('div');
      item.className = 'maid-settings-list-item is-rule';
      const icon = documentRef.createElement?.('span');
      icon.className = 'maid-settings-rule-icon';
      icon.innerHTML = ICONS.shield;
      const main = documentRef.createElement?.('div');
      main.className = 'maid-settings-item-main';
      const title = documentRef.createElement?.('div');
      title.className = 'maid-settings-item-title';
      title.textContent = trim(rule?.title || rule?.toolName, rule?.key || '');
      const meta = documentRef.createElement?.('div');
      meta.className = 'maid-settings-item-meta';
      meta.textContent = [
        trim(rule?.toolName),
        trim(rule?.operationType),
        trim(rule?.riskLevel),
        formatRunTime(rule?.updatedAt),
      ].filter(Boolean).join(' · ');
      main.append(title, meta);
      const revokeBtn = createButton(documentRef, 'maid-settings-action', '撤销');
      revokeBtn.addEventListener?.('click', () => {
        const removed = allowRulesStore?.revoke?.(rule?.key);
        setStatus(removed ? '已撤销该规则' : '撤销失败');
        renderRules();
      });
      item.append(icon, main, revokeBtn);
      ruleListEl.appendChild(item);
    });
  };

  const refresh = () => {
    if (promptTextarea) promptTextarea.value = settingsStore?.getMaidPrompt?.() || settingsStore?.getPersonaPrompt?.() || '';
    if (promptCountEl) promptCountEl.textContent = `${promptTextarea?.value?.length || 0} 字`;
    if (appKnowledgeTextarea) appKnowledgeTextarea.value = getAppKnowledge();
    if (historyContextTextarea) historyContextTextarea.value = getHistoryContext();
    if (memoryTableTextarea) memoryTableTextarea.value = getMemoryTable();
    if (lastAppContextTextarea) lastAppContextTextarea.value = getLastAppContextText();
    if (lastPromptTextarea) lastPromptTextarea.value = getLastPromptText();
    if (lastResponseTextarea) lastResponseTextarea.value = getLastResponseText();
    renderRuns();
    renderRules();
  };

  const switchPromptTab = (tab = 'persona') => {
    const next = ['persona', 'appKnowledge', 'historyContext', 'memoryTable', 'lastPrompt', 'lastResponse'].includes(tab) ? tab : 'persona';
    activePromptTab = next;
    promptTabButtons.forEach((button, key) => {
      button.classList.toggle('is-active', key === activePromptTab);
      button.setAttribute?.('aria-selected', key === activePromptTab ? 'true' : 'false');
    });
    promptPanes.forEach((pane, key) => {
      pane.classList.toggle('is-active', key === activePromptTab);
      pane.setAttribute?.('aria-hidden', key === activePromptTab ? 'false' : 'true');
    });
    refresh();
    setStatus('');
  };

  let refreshApiSubSection = null;
  const switchTab = (tab = 'api') => {
    const promptSubtab = tab === 'appKnowledge' || tab === 'historyContext' || tab === 'memoryTable' || tab === 'lastPrompt' || tab === 'lastResponse' || tab === 'persona'
      ? tab
      : '';
    const next = promptSubtab ? 'prompt' : (['api', 'prompt', 'activity', 'safety'].includes(tab) ? tab : 'api');
    if (next === 'api') {
      try { refreshApiSubSection?.(); } catch {}
    }
    activeTab = next;
    tabButtons.forEach((button, key) => {
      button.classList.toggle('is-active', key === activeTab);
      button.setAttribute?.('aria-selected', key === activeTab ? 'true' : 'false');
    });
    sections.forEach((section, key) => {
      section.classList.toggle('is-active', key === activeTab);
      section.setAttribute?.('aria-hidden', key === activeTab ? 'false' : 'true');
    });
    if (activeTab === 'prompt') switchPromptTab(promptSubtab || activePromptTab || 'persona');
    refresh();
    setStatus('');
  };

  const copyCurrentText = async (kind = '') => {
    const text = kind === 'lastResponse'
      ? lastResponseTextarea?.value
      : kind === 'lastPrompt'
        ? lastPromptTextarea?.value
        : kind === 'historyContext'
          ? historyContextTextarea?.value
          : kind === 'memoryTable'
            ? memoryTableTextarea?.value
        : promptTextarea?.value;
    if (!trim(text)) return false;
    try {
      await copyText?.(text);
      setStatus('已复制');
      return true;
    } catch (error) {
      logger?.warn?.('maid settings copy failed', error);
      setStatus('复制失败');
      return false;
    }
  };

  const savePrompt = async () => {
    try {
      if (typeof settingsStore?.setMaidPrompt === 'function') {
        await settingsStore.setMaidPrompt(promptTextarea?.value || '');
      } else {
        await settingsStore?.setPersonaPrompt?.(promptTextarea?.value || '');
      }
      setStatus('提示词已保存');
      refresh();
      return true;
    } catch (error) {
      logger?.warn?.('maid prompt save failed', error);
      setStatus('保存失败');
      return false;
    }
  };

  const ensure = () => {
    if (overlay || !documentRef?.body) return overlay;
    injectStyle(documentRef);

    overlay = documentRef.createElement?.('div');
    overlay.className = 'maid-settings-overlay';
    overlay.setAttribute?.('aria-hidden', 'true');
    overlay.addEventListener?.('click', () => hide());

    panel = documentRef.createElement?.('div');
    panel.className = 'maid-settings-panel';
    panel.setAttribute?.('role', 'dialog');
    panel.setAttribute?.('aria-modal', 'true');
    panel.setAttribute?.('aria-label', '女仆设定');
    panel.addEventListener?.('click', event => event.stopPropagation?.());

    const header = documentRef.createElement?.('div');
    header.className = 'maid-settings-header';
    const mark = documentRef.createElement?.('div');
    mark.className = 'maid-settings-mark';
    mark.innerHTML = ICONS.maid;
    mark.setAttribute?.('aria-hidden', 'true');
    const headerCopy = documentRef.createElement?.('div');
    headerCopy.className = 'maid-settings-header-copy';
    const title = documentRef.createElement?.('div');
    title.className = 'maid-settings-title';
    title.textContent = '女仆设定';
    const headerMeta = documentRef.createElement?.('div');
    headerMeta.className = 'maid-settings-header-meta';
    const assistantName = documentRef.createElement?.('span');
    assistantName.className = 'maid-settings-assistant-name';
    assistantName.textContent = 'ARIA Assistant';
    const headerSeparator = documentRef.createElement?.('span');
    headerSeparator.className = 'maid-settings-header-separator';
    headerSeparator.textContent = '·';
    const runtimeStatus = documentRef.createElement?.('span');
    runtimeStatus.className = 'maid-settings-runtime-status';
    const runtimeDot = documentRef.createElement?.('span');
    runtimeDot.className = 'maid-settings-runtime-dot';
    runtimeDot.setAttribute?.('aria-hidden', 'true');
    const runtimeLabel = documentRef.createElement?.('span');
    runtimeLabel.textContent = '运行中';
    runtimeStatus.append(runtimeDot, runtimeLabel);
    headerMeta.append(assistantName, headerSeparator, runtimeStatus);
    headerCopy.append(title, headerMeta);
    const closeBtn = createButton(documentRef, 'maid-settings-close', '×');
    closeBtn.innerHTML = ICONS.close;
    closeBtn.setAttribute?.('aria-label', '关闭女仆设定');
    closeBtn.addEventListener?.('click', () => hide());
    header.append(mark, headerCopy, closeBtn);

    const tabs = documentRef.createElement?.('div');
    tabs.className = 'maid-settings-tabs';
    tabs.setAttribute?.('role', 'tablist');
    tabs.setAttribute?.('aria-label', '女仆设定分页');
    [
      ['api', 'API', ICONS.api],
      ['prompt', '提示词', ICONS.prompt],
      ['activity', '活动', ICONS.activity],
      ['safety', '权限', ICONS.shield],
    ].forEach(([key, label, icon]) => {
      const button = createButton(documentRef, 'maid-settings-tab', label);
      setIconButtonContent(button, icon, label);
      button.setAttribute?.('role', 'tab');
      button.setAttribute?.('id', `maid-settings-tab-${key}`);
      button.setAttribute?.('aria-controls', `maid-settings-section-${key}`);
      button.setAttribute?.('aria-selected', 'false');
      button.addEventListener?.('click', () => switchTab(key));
      tabButtons.set(key, button);
      tabs.appendChild(button);
    });

    const body = documentRef.createElement?.('div');
    body.className = 'maid-settings-body';

    const apiSection = documentRef.createElement?.('section');
    apiSection.className = 'maid-settings-section';
    // API 分页二级导航：一级为干净的入口列表，二级为各自配置表单（2026-07-08）
    let apiPage = '';
    let editingSubAgentId = '';
    const renderApiSection = () => {
      if (!apiSection || typeof apiSection.querySelector !== 'function') return;
      const profiles = (typeof listModelProfiles === 'function' ? listModelProfiles() : []) || [];
      const profileById = id => profiles.find(item => item.id === id) || null;
      const profileOptions = selected => profiles.map(p => `<option value="${escapeHtml(p.id)}"${p.id === selected ? ' selected' : ''}>${escapeHtml(p.label || p.name || p.id)}</option>`).join('');
      const boundId = settingsStore?.getBoundProfileId?.() || '';
      const boundOverride = settingsStore?.getBoundModelOverride?.() || '';
      const boundProfile = profileById(boundId);
      const fallbackId = settingsStore?.getFallbackProfileId?.() || '';
      const subAgents = settingsStore?.listSubAgents?.() || [];

      if (apiPage === 'main') {
        const shownModel = boundOverride || boundProfile?.model || '';
        apiSection.innerHTML = `
          <button type="button" class="maid-api-back" data-api-back>${ICONS.chevron}<span>返回</span></button>
          <div class="maid-api-group">
            <div class="maid-api-group-title">女仆主配置</div>
            <div class="maid-api-group-desc">女仆规划与执行使用的主模型。</div>
            <label class="maid-api-field">
              <span class="maid-api-field-label">连线配置</span>
              <select class="maid-subagent-select" data-main-profile>
                <option value="">未绑定</option>
                ${profileOptions(boundId)}
              </select>
            </label>
            <label class="maid-api-field">
              <span class="maid-api-field-label">模型</span>
              <span class="maid-subagent-model-row">
                <input type="text" class="maid-subagent-input" data-main-model placeholder="${boundId ? '默认该配置保存的模型，可改' : '先选连线配置'}" maxlength="120" value="${escapeHtml(shownModel)}" ${boundId ? '' : 'disabled'} />
                <button type="button" class="maid-settings-action" data-main-model-pick ${boundId ? '' : 'disabled'}>▾</button>
              </span>
            </label>
            <div class="maid-subagent-model-menu" data-main-model-menu hidden></div>
            <label class="maid-api-field">
              <span class="maid-api-field-label">故障降级（主模型请求失败时自动用备用配置重试一次）</span>
              <select class="maid-subagent-select" data-main-fallback>
                <option value="">不降级</option>
                ${profileOptions(fallbackId)}
              </select>
            </label>
            <button type="button" class="maid-api-manage-link" data-api-open-config>管理连线配置（新增/编辑渠道）…</button>
          </div>
        `;
      } else if (apiPage === 'subagent') {
        const editing = editingSubAgentId ? subAgents.find(item => item.id === editingSubAgentId) : null;
        const editingProfile = editing ? profileById(editing.modelProfileId) : null;
        const formModelValue = editing ? (editing.modelOverride || editingProfile?.model || '') : '';
        const skillChecks = MAID_SUB_AGENT_SKILLS.map(skill => `
          <label class="maid-subagent-skill"><input type="checkbox" data-sub-skill="${escapeHtml(skill.id)}"${editing?.skills?.includes(skill.id) ? ' checked' : ''} />${escapeHtml(skill.label)}</label>
        `).join('');
        apiSection.innerHTML = `
          <button type="button" class="maid-api-back" data-api-back>${ICONS.chevron}<span>返回</span></button>
          <div class="maid-api-group">
            <div class="maid-api-group-title">Sub-agent 模型</div>
            <div class="maid-api-group-desc">女仆按能力标签把重内容生成等任务委派给这些模型，调用前会请求确认。</div>
            <div class="maid-subagent-list">
              ${subAgents.length ? subAgents.map(item => `
                <div class="maid-subagent-item${item.id === editingSubAgentId ? ' is-editing' : ''}">
                  <div class="maid-subagent-item-main">
                    <span class="maid-subagent-item-name">${escapeHtml(item.name)}</span>
                    <span class="maid-subagent-item-meta">${escapeHtml(item.skills.map(id => MAID_SUB_AGENT_SKILLS.find(s => s.id === id)?.label || id).join('、') || '未设标签')}${item.modelOverride ? ` · ${escapeHtml(item.modelOverride)}` : ''}</span>
                  </div>
                  <button type="button" class="maid-settings-action" data-sub-edit="${escapeHtml(item.id)}">编辑</button>
                  <button type="button" class="maid-settings-action" data-sub-remove="${escapeHtml(item.id)}">删除</button>
                </div>
              `).join('') : '<div class="maid-settings-empty">还没有配置 sub-agent 模型。</div>'}
            </div>
            <div class="maid-subagent-form">
              <div class="maid-api-form-title">${editing ? `编辑「${escapeHtml(editing.name)}」` : '添加 Sub-agent'}</div>
              <label class="maid-api-field">
                <span class="maid-api-field-label">名称</span>
                <input type="text" class="maid-subagent-input" data-sub-name placeholder="如：快手 flash" maxlength="40" value="${escapeHtml(editing?.name || '')}" />
              </label>
              <label class="maid-api-field">
                <span class="maid-api-field-label">连线配置</span>
                <select class="maid-subagent-select" data-sub-profile>
                  <option value="">选择连线配置…</option>
                  ${profileOptions(editing?.modelProfileId || '')}
                </select>
              </label>
              <label class="maid-api-field">
                <span class="maid-api-field-label">模型</span>
                <span class="maid-subagent-model-row">
                  <input type="text" class="maid-subagent-input" data-sub-model placeholder="${editing ? '默认该配置保存的模型，可改' : '先选连线配置'}" maxlength="120" value="${escapeHtml(formModelValue)}" ${editing ? '' : 'disabled'} />
                  <button type="button" class="maid-settings-action" data-sub-model-pick ${editing ? '' : 'disabled'}>▾</button>
                </span>
              </label>
              <div class="maid-subagent-model-menu" data-sub-model-menu hidden></div>
              <div class="maid-api-field">
                <span class="maid-api-field-label">能力标签</span>
                <div class="maid-subagent-skills">${skillChecks}</div>
              </div>
              <label class="maid-api-field">
                <span class="maid-api-field-label">备注</span>
                <input type="text" class="maid-subagent-input" data-sub-note placeholder="可选，会展示给女仆" maxlength="200" value="${escapeHtml(editing?.note || '')}" />
              </label>
              <div class="maid-api-form-actions">
                <button type="button" class="maid-settings-action is-primary" data-sub-add>${editing ? '保存修改' : '添加 Sub-agent'}</button>
                ${editing ? '<button type="button" class="maid-settings-action" data-sub-cancel-edit>取消编辑</button>' : ''}
              </div>
            </div>
          </div>
        `;
      } else {
        // 一级：干净的入口列表 + 状态摘要
        const mainName = boundProfile?.name || boundProfile?.label || '尚未绑定连线配置';
        const mainModel = boundOverride || boundProfile?.model || '';
        const subSummary = subAgents.length
          ? subAgents.map(item => item.name).slice(0, 3).join('、') + (subAgents.length > 3 ? ` 等 ${subAgents.length} 个` : '')
          : '按能力标签委派模型任务';
        apiSection.innerHTML = `
          <div class="maid-settings-section-caption"><span>模型配置</span><small>MODEL ROUTING</small></div>
          <div class="maid-api-nav">
            <button type="button" class="maid-api-nav-item" data-api-nav="main">
              <span class="maid-api-nav-icon">${ICONS.maid}</span>
              <span class="maid-api-nav-copy">
                <span class="maid-api-nav-heading">
                  <span class="maid-api-nav-title">女仆主配置</span>
                  <span class="maid-api-nav-badge${boundProfile ? '' : ' is-muted'}">${boundProfile ? '已连接' : '未配置'}</span>
                </span>
                <span class="maid-api-nav-summary">
                  <span>${escapeHtml(mainName)}${fallbackId ? ' · 已配置故障降级' : ''}</span>
                  ${mainModel ? `<code>${escapeHtml(mainModel)}</code>` : ''}
                </span>
              </span>
              <span class="maid-api-nav-chevron">${ICONS.chevron}</span>
            </button>
            <button type="button" class="maid-api-nav-item" data-api-nav="subagent">
              <span class="maid-api-nav-icon is-subagent">${ICONS.bolt}</span>
              <span class="maid-api-nav-copy">
                <span class="maid-api-nav-heading">
                  <span class="maid-api-nav-title">Sub-agent 模型</span>
                  <span class="maid-api-nav-badge${subAgents.length ? '' : ' is-muted'}">${subAgents.length ? `${subAgents.length} 个模型` : '未配置'}</span>
                </span>
                <span class="maid-api-nav-summary">${escapeHtml(subSummary)}</span>
              </span>
              <span class="maid-api-nav-chevron">${ICONS.chevron}</span>
            </button>
          </div>
        `;
      }
      bindApiSectionEvents();
    };

    const bindModelPicker = ({ inputSel, pickSel, menuSel, getProfileId }) => {
      const input = apiSection.querySelector(inputSel);
      const pickBtn = apiSection.querySelector(pickSel);
      const menu = apiSection.querySelector(menuSel);
      if (!input || !pickBtn || !menu) return { input };
      const closeMenu = () => { menu.hidden = true; menu.innerHTML = ''; };
      let candidates = [];
      const renderOptions = () => {
        if (menu.hidden) return;
        const ranked = rankModelCandidates(candidates, input.value || '');
        menu.innerHTML = ranked.length
          ? ranked.map(m => `<button type="button" class="maid-subagent-model-option" data-model-opt="${escapeHtml(m)}">${escapeHtml(m)}</button>`).join('')
          : '<div class="maid-subagent-model-option is-loading">该渠道未返回模型列表，可手动输入</div>';
        menu.querySelectorAll('[data-model-opt]').forEach((btn) => {
          btn.addEventListener('click', () => {
            input.value = btn.dataset.modelOpt || '';
            closeMenu();
            input.dispatchEvent(new Event('change', { bubbles: false }));
          });
        });
      };
      input.addEventListener('input', renderOptions);
      pickBtn.addEventListener('click', async () => {
        const profileId = getProfileId();
        if (!profileId) return;
        if (!menu.hidden) { closeMenu(); return; }
        menu.hidden = false;
        menu.innerHTML = '<div class="maid-subagent-model-option is-loading">加载模型列表…</div>';
        try {
          candidates = (await listProfileModels?.(profileId)) || [];
        } catch {
          candidates = [];
        }
        renderOptions();
      });
      return { input, closeMenu };
    };

    const bindApiSectionEvents = () => {
      const profiles = (typeof listModelProfiles === 'function' ? listModelProfiles() : []) || [];
      apiSection.querySelectorAll('[data-api-nav]').forEach((btn) => {
        btn.addEventListener('click', () => {
          apiPage = btn.dataset.apiNav || '';
          renderApiSection();
        });
      });
      apiSection.querySelector('[data-api-back]')?.addEventListener('click', () => {
        apiPage = '';
        editingSubAgentId = '';
        renderApiSection();
      });
      apiSection.querySelector('[data-api-open-config]')?.addEventListener('click', () => {
        hide();
        void onOpenApiConfig?.({ source: 'maid_settings' });
      });
      // 主配置页
      const mainProfileSelect = apiSection.querySelector('[data-main-profile]');
      if (mainProfileSelect) {
        const { input: mainModelInput } = bindModelPicker({
          inputSel: '[data-main-model]',
          pickSel: '[data-main-model-pick]',
          menuSel: '[data-main-model-menu]',
          getProfileId: () => mainProfileSelect.value,
        });
        mainProfileSelect.addEventListener('change', async () => {
          const profileId = mainProfileSelect.value;
          await settingsStore?.setBoundProfileId?.(profileId);
          await settingsStore?.setBoundModelOverride?.('');
          renderApiSection();
        });
        mainModelInput?.addEventListener('change', async () => {
          const chosen = mainModelInput.value.trim();
          const profileModel = (profiles.find(item => item.id === mainProfileSelect.value)?.model || '').trim();
          await settingsStore?.setBoundModelOverride?.(chosen && chosen !== profileModel ? chosen : '');
        });
        apiSection.querySelector('[data-main-fallback]')?.addEventListener('change', (event) => {
          void settingsStore?.setFallbackProfileId?.(event.target.value);
        });
      }
      // sub-agent 页
      apiSection.querySelectorAll('[data-sub-edit]').forEach((btn) => {
        btn.addEventListener('click', () => {
          editingSubAgentId = btn.dataset.subEdit || '';
          renderApiSection();
        });
      });
      apiSection.querySelector('[data-sub-cancel-edit]')?.addEventListener('click', () => {
        editingSubAgentId = '';
        renderApiSection();
      });
      apiSection.querySelectorAll('[data-sub-remove]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (btn.dataset.subRemove === editingSubAgentId) editingSubAgentId = '';
          await settingsStore?.removeSubAgent?.(btn.dataset.subRemove);
          renderApiSection();
        });
      });
      const subProfileSelect = apiSection.querySelector('[data-sub-profile]');
      if (subProfileSelect) {
        const { input: subModelInput } = bindModelPicker({
          inputSel: '[data-sub-model]',
          pickSel: '[data-sub-model-pick]',
          menuSel: '[data-sub-model-menu]',
          getProfileId: () => subProfileSelect.value,
        });
        subProfileSelect.addEventListener('change', () => {
          const profileId = subProfileSelect.value;
          const profile = profiles.find(item => item.id === profileId);
          if (subModelInput) {
            subModelInput.disabled = !profileId;
            subModelInput.value = profile?.model || '';
            subModelInput.placeholder = '模型（默认该配置保存的模型，可改）';
          }
          const pick = apiSection.querySelector('[data-sub-model-pick]');
          if (pick) pick.disabled = !profileId;
        });
        apiSection.querySelector('[data-sub-add]')?.addEventListener('click', async () => {
          const name = apiSection.querySelector('[data-sub-name]')?.value?.trim();
          const modelProfileId = subProfileSelect.value || '';
          if (!modelProfileId) {
            globalThis.toastr?.warning?.('请先选择连线配置');
            return;
          }
          const skills = Array.from(apiSection.querySelectorAll('[data-sub-skill]:checked')).map(el => el.dataset.subSkill);
          const existingCount = (settingsStore?.listSubAgents?.() || []).length;
          const chosenModel = subModelInput?.value?.trim() || '';
          const profileModel = (profiles.find(item => item.id === modelProfileId)?.model || '').trim();
          await settingsStore?.upsertSubAgent?.({
            ...(editingSubAgentId ? { id: editingSubAgentId } : {}),
            name,
            modelProfileId,
            modelOverride: chosenModel && chosenModel !== profileModel ? chosenModel : '',
            skills,
            note: apiSection.querySelector('[data-sub-note]')?.value?.trim() || '',
          });
          if (!editingSubAgentId && existingCount >= 1) {
            globalThis.toastr?.info?.('提示：配置多个模型时，女仆委派会带来相应的多份模型消耗。');
          }
          editingSubAgentId = '';
          renderApiSection();
        });
      }
    };

    renderApiSection();
    refreshApiSubSection = () => { apiPage = ''; editingSubAgentId = ''; renderApiSection(); };

    const promptSection = documentRef.createElement?.('section');
    promptSection.className = 'maid-settings-section';
    const promptSubtabs = documentRef.createElement?.('div');
    promptSubtabs.className = 'maid-settings-prompt-tabs';
    promptSubtabs.setAttribute?.('role', 'tablist');
    promptSubtabs.setAttribute?.('aria-label', '提示词资料分页');
    [
      ['persona', '人格'],
      ['appKnowledge', 'APP知识'],
      ['historyContext', '历史上下文'],
      ['memoryTable', '记忆表格'],
      ['lastPrompt', '本次提示词'],
      ['lastResponse', '本次完整回复'],
    ].forEach(([key, label]) => {
      const button = createButton(documentRef, 'maid-settings-prompt-tab', label);
      button.setAttribute?.('role', 'tab');
      button.setAttribute?.('id', `maid-settings-prompt-tab-${key}`);
      button.setAttribute?.('aria-controls', `maid-settings-prompt-pane-${key}`);
      button.setAttribute?.('aria-selected', 'false');
      button.addEventListener?.('click', () => switchPromptTab(key));
      promptTabButtons.set(key, button);
      promptSubtabs.appendChild(button);
    });
    const personaPane = documentRef.createElement?.('div');
    personaPane.className = 'maid-settings-prompt-pane';
    const promptField = documentRef.createElement?.('div');
    promptField.className = 'maid-settings-field';
    const promptLabel = documentRef.createElement?.('div');
    promptLabel.className = 'maid-settings-label';
    promptLabel.textContent = '提示词';
    const promptFieldHeader = documentRef.createElement?.('div');
    promptFieldHeader.className = 'maid-settings-field-header';
    promptCountEl = documentRef.createElement?.('span');
    promptCountEl.className = 'maid-settings-char-count';
    promptCountEl.textContent = '0 字';
    promptFieldHeader.append(promptLabel, promptCountEl);
    promptTextarea = createTextarea(documentRef);
    promptTextarea.placeholder = '女仆基础提示词';
    promptTextarea.addEventListener?.('input', () => {
      if (promptCountEl) promptCountEl.textContent = `${promptTextarea?.value?.length || 0} 字`;
    });
    const promptFooter = documentRef.createElement?.('div');
    promptFooter.className = 'maid-settings-footer';
    const saveBtn = createButton(documentRef, 'maid-settings-action is-primary', '保存');
    setIconButtonContent(saveBtn, ICONS.save, '保存');
    saveBtn.addEventListener?.('click', () => void savePrompt());
    const copyPromptBtn = createButton(documentRef, 'maid-settings-action', '复制');
    setIconButtonContent(copyPromptBtn, ICONS.copy, '复制');
    copyPromptBtn.addEventListener?.('click', () => void copyCurrentText('prompt'));
    statusEl = documentRef.createElement?.('div');
    statusEl.className = 'maid-settings-status';
    promptFooter.append(statusEl, copyPromptBtn, saveBtn);
    promptField.append(promptFieldHeader, promptTextarea);
    personaPane.append(promptField, promptFooter);

    const appKnowledgePane = documentRef.createElement?.('div');
    appKnowledgePane.className = 'maid-settings-prompt-pane';
    const appKnowledgeSplit = documentRef.createElement?.('div');
    appKnowledgeSplit.className = 'maid-settings-split';
    const appKnowledgeField = documentRef.createElement?.('div');
    appKnowledgeField.className = 'maid-settings-field';
    const appKnowledgeLabel = documentRef.createElement?.('div');
    appKnowledgeLabel.className = 'maid-settings-label';
    appKnowledgeLabel.textContent = 'APP知识';
    appKnowledgeTextarea = createTextarea(documentRef, { readOnly: true });
    appKnowledgeField.append(appKnowledgeLabel, appKnowledgeTextarea);
    const lastContextField = documentRef.createElement?.('div');
    lastContextField.className = 'maid-settings-field';
    const lastContextLabel = documentRef.createElement?.('div');
    lastContextLabel.className = 'maid-settings-label';
    lastContextLabel.textContent = '本次检索';
    lastAppContextTextarea = createTextarea(documentRef, { readOnly: true });
    lastContextField.append(lastContextLabel, lastAppContextTextarea);
    appKnowledgeSplit.append(appKnowledgeField, lastContextField);
    appKnowledgePane.append(appKnowledgeSplit);

    const historyContextPane = documentRef.createElement?.('div');
    historyContextPane.className = 'maid-settings-prompt-pane';
    const historyContextField = documentRef.createElement?.('div');
    historyContextField.className = 'maid-settings-field';
    const historyContextLabel = documentRef.createElement?.('div');
    historyContextLabel.className = 'maid-settings-label';
    historyContextLabel.textContent = '历史上下文';
    historyContextTextarea = createTextarea(documentRef, { readOnly: true });
    const historyContextFooter = documentRef.createElement?.('div');
    historyContextFooter.className = 'maid-settings-footer';
    const copyHistoryContextBtn = createButton(documentRef, 'maid-settings-action', '复制');
    setIconButtonContent(copyHistoryContextBtn, ICONS.copy, '复制');
    copyHistoryContextBtn.addEventListener?.('click', () => void copyCurrentText('historyContext'));
    historyContextFooter.appendChild(copyHistoryContextBtn);
    historyContextField.append(historyContextLabel, historyContextTextarea);
    historyContextPane.append(historyContextField, historyContextFooter);

    const memoryTablePane = documentRef.createElement?.('div');
    memoryTablePane.className = 'maid-settings-prompt-pane';
    const memoryTableField = documentRef.createElement?.('div');
    memoryTableField.className = 'maid-settings-field';
    const memoryTableLabel = documentRef.createElement?.('div');
    memoryTableLabel.className = 'maid-settings-label';
    memoryTableLabel.textContent = '记忆表格';
    memoryTableTextarea = createTextarea(documentRef, { readOnly: true });
    const memoryTableFooter = documentRef.createElement?.('div');
    memoryTableFooter.className = 'maid-settings-footer';
    const copyMemoryTableBtn = createButton(documentRef, 'maid-settings-action', '复制');
    setIconButtonContent(copyMemoryTableBtn, ICONS.copy, '复制');
    copyMemoryTableBtn.addEventListener?.('click', () => void copyCurrentText('memoryTable'));
    memoryTableFooter.appendChild(copyMemoryTableBtn);
    memoryTableField.append(memoryTableLabel, memoryTableTextarea);
    memoryTablePane.append(memoryTableField, memoryTableFooter);

    const lastPromptPane = documentRef.createElement?.('div');
    lastPromptPane.className = 'maid-settings-prompt-pane';
    const lastPromptField = documentRef.createElement?.('div');
    lastPromptField.className = 'maid-settings-field';
    const lastPromptLabel = documentRef.createElement?.('div');
    lastPromptLabel.className = 'maid-settings-label';
    lastPromptLabel.textContent = '本次提示词';
    lastPromptTextarea = createTextarea(documentRef, { readOnly: true });
    const lastPromptFooter = documentRef.createElement?.('div');
    lastPromptFooter.className = 'maid-settings-footer';
    const copyLastPromptBtn = createButton(documentRef, 'maid-settings-action', '复制');
    setIconButtonContent(copyLastPromptBtn, ICONS.copy, '复制');
    copyLastPromptBtn.addEventListener?.('click', () => void copyCurrentText('lastPrompt'));
    lastPromptFooter.appendChild(copyLastPromptBtn);
    lastPromptField.append(lastPromptLabel, lastPromptTextarea);
    lastPromptPane.append(lastPromptField, lastPromptFooter);

    const lastResponsePane = documentRef.createElement?.('div');
    lastResponsePane.className = 'maid-settings-prompt-pane';
    const lastResponseField = documentRef.createElement?.('div');
    lastResponseField.className = 'maid-settings-field';
    const lastResponseLabel = documentRef.createElement?.('div');
    lastResponseLabel.className = 'maid-settings-label';
    lastResponseLabel.textContent = '本次完整回复';
    lastResponseTextarea = createTextarea(documentRef, { readOnly: true });
    const lastResponseFooter = documentRef.createElement?.('div');
    lastResponseFooter.className = 'maid-settings-footer';
    const copyLastResponseBtn = createButton(documentRef, 'maid-settings-action', '复制');
    setIconButtonContent(copyLastResponseBtn, ICONS.copy, '复制');
    copyLastResponseBtn.addEventListener?.('click', () => void copyCurrentText('lastResponse'));
    lastResponseFooter.appendChild(copyLastResponseBtn);
    lastResponseField.append(lastResponseLabel, lastResponseTextarea);
    lastResponsePane.append(lastResponseField, lastResponseFooter);
    promptPanes.set('persona', personaPane);
    promptPanes.set('appKnowledge', appKnowledgePane);
    promptPanes.set('historyContext', historyContextPane);
    promptPanes.set('memoryTable', memoryTablePane);
    promptPanes.set('lastPrompt', lastPromptPane);
    promptPanes.set('lastResponse', lastResponsePane);
    promptPanes.forEach((pane, key) => {
      pane.setAttribute?.('id', `maid-settings-prompt-pane-${key}`);
      pane.setAttribute?.('role', 'tabpanel');
      pane.setAttribute?.('aria-labelledby', `maid-settings-prompt-tab-${key}`);
      pane.setAttribute?.('aria-hidden', 'true');
    });
    promptSection.append(
      promptSubtabs,
      personaPane,
      appKnowledgePane,
      historyContextPane,
      memoryTablePane,
      lastPromptPane,
      lastResponsePane,
    );

    const activitySection = documentRef.createElement?.('section');
    activitySection.className = 'maid-settings-section';
    const activityHead = documentRef.createElement?.('div');
    activityHead.className = 'maid-settings-section-head';
    const activityTitleRow = documentRef.createElement?.('div');
    activityTitleRow.className = 'maid-settings-section-title-row';
    const activityLabel = documentRef.createElement?.('div');
    activityLabel.className = 'maid-settings-section-title';
    activityLabel.textContent = '最近活动';
    runCountEl = documentRef.createElement?.('span');
    runCountEl.className = 'maid-settings-count-badge';
    runCountEl.textContent = '0';
    const activityCaption = documentRef.createElement?.('div');
    activityCaption.className = 'maid-settings-section-caption';
    const activityCaptionLabel = documentRef.createElement?.('small');
    activityCaptionLabel.textContent = 'RECENT RUNS';
    activityCaption.appendChild(activityCaptionLabel);
    activityTitleRow.append(activityLabel, runCountEl);
    activityHead.append(activityTitleRow, activityCaption);
    runListEl = documentRef.createElement?.('div');
    runListEl.className = 'maid-settings-list';
    activitySection.append(activityHead, runListEl);

    const safetySection = documentRef.createElement?.('section');
    safetySection.className = 'maid-settings-section';
    const safetyCaption = documentRef.createElement?.('div');
    safetyCaption.className = 'maid-settings-section-caption';
    const safetyLabel = documentRef.createElement?.('span');
    safetyLabel.textContent = '始终允许规则';
    const safetyCode = documentRef.createElement?.('small');
    safetyCode.textContent = 'ALLOWLIST';
    safetyCaption.append(safetyLabel, safetyCode);
    ruleListEl = documentRef.createElement?.('div');
    ruleListEl.className = 'maid-settings-list';
    safetySection.append(safetyCaption, ruleListEl);

    [
      ['api', apiSection],
      ['prompt', promptSection],
      ['activity', activitySection],
      ['safety', safetySection],
    ].forEach(([key, section]) => {
      section.setAttribute?.('id', `maid-settings-section-${key}`);
      section.setAttribute?.('role', 'tabpanel');
      section.setAttribute?.('aria-labelledby', `maid-settings-tab-${key}`);
      section.setAttribute?.('aria-hidden', 'true');
      sections.set(key, section);
      body.appendChild(section);
    });

    panel.append(header, tabs, body);
    overlay.appendChild(panel);
    documentRef.body.appendChild(overlay);
    return overlay;
  };

  const show = ({ tab = 'api' } = {}) => {
    const el = ensure();
    if (!el) return false;
    isOpen = true;
    refresh();
    switchTab(tab);
    el.classList.add('is-open');
    el.setAttribute?.('aria-hidden', 'false');
    return true;
  };

  const hide = () => {
    isOpen = false;
    overlay?.classList.remove('is-open');
    overlay?.setAttribute?.('aria-hidden', 'true');
    setStatus('');
    return true;
  };

  return {
    show,
    hide,
    refresh,
    switchTab,
    isOpen: () => isOpen,
    getElements: () => ({
      overlay,
      panel,
      promptTextarea,
      appKnowledgeTextarea,
      historyContextTextarea,
      memoryTableTextarea,
      lastAppContextTextarea,
      lastPromptTextarea,
      lastResponseTextarea,
      statusEl,
      runListEl,
      runCountEl,
      ruleListEl,
      promptCountEl,
      tabButtons,
      sections,
      promptTabButtons,
      promptPanes,
    }),
  };
};
