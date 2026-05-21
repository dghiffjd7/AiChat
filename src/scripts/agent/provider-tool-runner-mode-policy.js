import { runProviderToolRunnerContractFixture } from './provider-tool-runner-contract-fixture.js';

export const PROVIDER_TOOL_RUNNER_MODES = Object.freeze({
  readOnlyCapture: 'read_only_capture',
  contractFixture: 'contract_fixture',
  realRunner: 'real_runner',
});

const isRunner = value => typeof value === 'function' || Boolean(value && typeof value.run === 'function');

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const normalizeMode = (mode = '') => {
  const value = trim(mode).toLowerCase();
  if (value === 'fixture' || value === 'contract' || value === 'contract_fixture') return PROVIDER_TOOL_RUNNER_MODES.contractFixture;
  if (value === 'real' || value === 'real_runner' || value === 'provider') return PROVIDER_TOOL_RUNNER_MODES.realRunner;
  return PROVIDER_TOOL_RUNNER_MODES.readOnlyCapture;
};

const buildPlan = ({
  requestedMode = '',
  mode = PROVIDER_TOOL_RUNNER_MODES.readOnlyCapture,
  status = 'ready',
  reason = '',
  runnerFacadeEnabled = false,
  providerRunner = null,
  allowRunnerNetwork = false,
  realRunnerAllowed = false,
  runner = '',
} = {}) => ({
  mode,
  status,
  reason: trim(reason),
  runnerFacadeEnabled: runnerFacadeEnabled === true,
  providerRunner,
  allowRunnerNetwork: allowRunnerNetwork === true,
  diagnostics: {
    requestedMode: trim(requestedMode),
    mode,
    status,
    reason: trim(reason),
    runner: trim(runner),
    runnerFacadeEnabled: runnerFacadeEnabled === true,
    allowRunnerNetwork: allowRunnerNetwork === true,
    network: runnerFacadeEnabled === true && allowRunnerNetwork === true,
    writesChat: false,
    realRunnerAllowed: realRunnerAllowed === true,
  },
});

export const resolveProviderToolRunnerModePlan = ({
  runnerMode = '',
  providerRunner = null,
  allowRealRunner = false,
  allowRunnerNetwork = false,
} = {}) => {
  const requestedMode = trim(runnerMode);
  const mode = normalizeMode(runnerMode);
  if (mode === PROVIDER_TOOL_RUNNER_MODES.contractFixture) {
    return buildPlan({
      requestedMode,
      mode,
      status: 'ready',
      reason: '',
      runnerFacadeEnabled: true,
      providerRunner: runProviderToolRunnerContractFixture,
      allowRunnerNetwork: false,
      runner: 'contract_fixture',
    });
  }
  if (mode === PROVIDER_TOOL_RUNNER_MODES.realRunner) {
    if (allowRealRunner !== true) {
      return buildPlan({
        requestedMode,
        mode,
        status: 'blocked',
        reason: 'real provider runner disabled by policy',
        runner: 'real_runner',
      });
    }
    if (!isRunner(providerRunner)) {
      return buildPlan({
        requestedMode,
        mode,
        status: 'blocked',
        reason: 'real provider runner missing',
        realRunnerAllowed: true,
        runner: 'real_runner',
      });
    }
    return buildPlan({
      requestedMode,
      mode,
      status: 'ready',
      runnerFacadeEnabled: true,
      providerRunner,
      allowRunnerNetwork: allowRunnerNetwork === true,
      realRunnerAllowed: true,
      runner: 'real_runner',
    });
  }

  return buildPlan({
    requestedMode,
    mode: PROVIDER_TOOL_RUNNER_MODES.readOnlyCapture,
    status: 'ready',
    reason: 'runner stays at read-only capture',
    runner: 'none',
  });
};
