import { RICH_SCRIPT_EXECUTION_REQUIRED_EVENT } from './chat/rich-render-routing.js';

export const MAID_RICH_SCRIPT_GUIDE_FLOW_ID = 'rich-script-permission';
export const MAID_RICH_SCRIPT_GUIDE_HINT_ID = 'maid-rich-script-permission-v1';

export const createMaidRichScriptGuideRuntime = ({
  windowRef = globalThis?.window || null,
  guideStore = null,
  getOnboardingRuntime = () => null,
  isExecutionEnabled = () => false,
} = {}) => {
  let bound = false;
  let pending = null;
  let offered = false;

  const isDismissed = () => {
    if (offered) return true;
    try {
      return guideStore?.isHintDismissed?.(MAID_RICH_SCRIPT_GUIDE_HINT_ID) === true;
    } catch {
      return false;
    }
  };

  const dismiss = () => {
    offered = true;
    try {
      guideStore?.dismissHint?.(MAID_RICH_SCRIPT_GUIDE_HINT_ID);
    } catch {}
  };

  const executionEnabled = () => {
    try {
      return isExecutionEnabled?.() === true;
    } catch {
      return false;
    }
  };

  const offer = (detail = {}) => {
    if (executionEnabled()) {
      pending = null;
      dismiss();
      return false;
    }
    if (isDismissed()) {
      pending = null;
      return false;
    }
    const onboardingRuntime = getOnboardingRuntime?.() || null;
    if (!onboardingRuntime || onboardingRuntime.isActive?.() === true) {
      pending = detail && typeof detail === 'object' ? { ...detail } : {};
      return false;
    }
    const started = onboardingRuntime.startFlow?.(MAID_RICH_SCRIPT_GUIDE_FLOW_ID) === true;
    if (!started) {
      pending = detail && typeof detail === 'object' ? { ...detail } : {};
      return false;
    }
    pending = null;
    dismiss();
    return true;
  };

  const onRequirement = event => offer(event?.detail || {});
  const onSettingsChanged = (event) => {
    const detail = event?.detail || {};
    if (String(detail?.key || '').trim() !== 'allowRichIframeScripts' || detail?.value !== true) return;
    pending = null;
    dismiss();
    getOnboardingRuntime?.()?.emit?.('rich-script-enabled', { enabled: true });
  };

  const bind = () => {
    if (bound) return false;
    bound = true;
    windowRef?.addEventListener?.(RICH_SCRIPT_EXECUTION_REQUIRED_EVENT, onRequirement);
    windowRef?.addEventListener?.('app-settings-changed', onSettingsChanged);
    return true;
  };

  const unbind = () => {
    if (!bound) return false;
    bound = false;
    windowRef?.removeEventListener?.(RICH_SCRIPT_EXECUTION_REQUIRED_EVENT, onRequirement);
    windowRef?.removeEventListener?.('app-settings-changed', onSettingsChanged);
    return true;
  };

  return {
    bind,
    destroy() {
      unbind();
      pending = null;
    },
    offer,
    retryPending() {
      if (!pending) return false;
      return offer(pending);
    },
    hasPending: () => Boolean(pending),
  };
};
