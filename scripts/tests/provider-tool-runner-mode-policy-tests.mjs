import assert from 'node:assert/strict';

import {
  PROVIDER_TOOL_RUNNER_MODES,
  resolveProviderToolRunnerModePlan,
} from '../../src/scripts/agent/provider-tool-runner-mode-policy.js';
import { runProviderToolRunnerContractFixture } from '../../src/scripts/agent/provider-tool-runner-contract-fixture.js';

{
  const plan = resolveProviderToolRunnerModePlan();
  assert.equal(plan.mode, PROVIDER_TOOL_RUNNER_MODES.readOnlyCapture);
  assert.equal(plan.status, 'ready');
  assert.equal(plan.runnerFacadeEnabled, false);
  assert.equal(plan.providerRunner, null);
  assert.equal(plan.allowRunnerNetwork, false);
  assert.equal(plan.diagnostics.mode, 'read_only_capture');
  assert.equal(plan.diagnostics.runner, 'none');
  assert.equal(plan.diagnostics.network, false);
  assert.equal(plan.diagnostics.writesChat, false);
  console.log('ok - provider runner mode policy defaults to read-only capture');
}

{
  const plan = resolveProviderToolRunnerModePlan({ runnerMode: 'fixture' });
  assert.equal(plan.mode, PROVIDER_TOOL_RUNNER_MODES.contractFixture);
  assert.equal(plan.status, 'ready');
  assert.equal(plan.runnerFacadeEnabled, true);
  assert.equal(plan.providerRunner, runProviderToolRunnerContractFixture);
  assert.equal(plan.allowRunnerNetwork, false);
  assert.equal(plan.diagnostics.runner, 'contract_fixture');
  assert.equal(plan.diagnostics.network, false);
  console.log('ok - provider runner mode policy enables contract fixture without network');
}

{
  let called = false;
  const providerRunner = async () => {
    called = true;
    return { events: [] };
  };
  const plan = resolveProviderToolRunnerModePlan({
    runnerMode: 'real_runner',
    providerRunner,
  });
  assert.equal(plan.mode, PROVIDER_TOOL_RUNNER_MODES.realRunner);
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.reason, 'real provider runner disabled by policy');
  assert.equal(plan.runnerFacadeEnabled, false);
  assert.equal(plan.providerRunner, null);
  assert.equal(plan.diagnostics.realRunnerAllowed, false);
  assert.equal(called, false);
  console.log('ok - provider runner mode policy blocks real runner by default');
}

{
  const plan = resolveProviderToolRunnerModePlan({
    runnerMode: 'real_runner',
    allowRealRunner: true,
  });
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.reason, 'real provider runner missing');
  assert.equal(plan.runnerFacadeEnabled, false);
  assert.equal(plan.diagnostics.realRunnerAllowed, true);
  console.log('ok - provider runner mode policy requires an injected real runner');
}

{
  const providerRunner = async () => ({ events: [] });
  const plan = resolveProviderToolRunnerModePlan({
    runnerMode: 'real',
    providerRunner,
    allowRealRunner: true,
    allowRunnerNetwork: true,
  });
  assert.equal(plan.mode, PROVIDER_TOOL_RUNNER_MODES.realRunner);
  assert.equal(plan.status, 'ready');
  assert.equal(plan.runnerFacadeEnabled, true);
  assert.equal(plan.providerRunner, providerRunner);
  assert.equal(plan.allowRunnerNetwork, true);
  assert.equal(plan.diagnostics.realRunnerAllowed, true);
  assert.equal(plan.diagnostics.network, true);
  assert.equal(plan.diagnostics.writesChat, false);
  console.log('ok - provider runner mode policy can explicitly enable a real runner');
}
