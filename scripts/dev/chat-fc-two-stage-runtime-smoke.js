(async () => {
  const runtimeModule = await import('/scripts/agent/chat-fc-two-stage-runtime.js');
  const fixtureModule = await import('/scripts/agent/chat-fc-readonly-fixture-tool.js');
  let readCount = 0;
  let writeCount = 0;
  const fixtureTool = fixtureModule.buildChatFcReadonlyFixtureTool({
    onRead: () => { readCount += 1; },
  });
  const terminalTool = {
    type: 'function',
    function: {
      name: 'emit_phone_batch',
      description: 'Fixture terminal tool.',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
        additionalProperties: false,
      },
    },
  };
  const result = await runtimeModule.runChatFcTwoStageGeneration({
    identity: {
      requestId: 'dev-two-stage-request',
      turnId: 'dev-two-stage-turn',
      snapshotFingerprint: 'dev-two-stage-snapshot',
    },
    readOnlyTools: [fixtureTool],
    terminalTool,
    runIntermediatePhase: async ({ round }) => (round === 1
      ? {
          text: 'internal draft',
          toolCalls: [{
            id: 'dev-read-1',
            name: fixtureTool.name,
            arguments: { key: 'product_name' },
          }],
        }
      : { toolCalls: [] }),
    runTerminalPhase: async ({ transcript }) => {
      const fact = transcript.find(item => item.type === 'tool_result');
      return {
        toolCall: {
          id: 'dev-terminal-1',
          name: 'emit_phone_batch',
          arguments: { text: JSON.parse(fact.content).value },
        },
      };
    },
    validateTerminal: (response) => {
      const call = response?.toolCall;
      return call?.name === 'emit_phone_batch' && typeof call?.arguments?.text === 'string'
        ? { ok: true, value: call.arguments }
        : { ok: false, reason: 'invalid_terminal_fixture' };
    },
  });
  return {
    fixtureVersion: 'chat-fc-two-stage-runtime-v1',
    ok: result.ok,
    reason: result.reason,
    terminal: result.terminal,
    intermediateRoundCount: result.intermediateRoundCount,
    modelCallCount: result.modelCallCount,
    toolCallCount: result.toolCallCount,
    toolExecutionCount: result.toolExecutionCount,
    persistentWriteCount: result.persistentWriteCount,
    readCount,
    writeCount,
  };
})()
