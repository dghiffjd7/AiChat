// 在运行中的 dev APP 页面上下文执行；由 app-eval.mjs 载入。
// 使用临时角色卡与临时按钮，不调用模型；结束后恢复当前角色并清理测试资料/UI。
(async () => {
  const debug = window.appBridge?.debugUiRegistry;
  const registry = debug?.stores?.agentToolRegistry;
  const personaStore = debug?.stores?.personaStore;
  const personaPanel = debug?.panels?.personaPanel;
  const agentCenterPanel = debug?.panels?.agentCenterPanel;
  if (
    !registry?.executeTool ||
    !personaStore?.create ||
    !personaStore?.update ||
    !personaStore?.delete ||
    !personaPanel?.onUserPersonaSwitch ||
    !agentCenterPanel?.show
  ) {
    throw new Error('persona/ui conflict probe dependencies unavailable');
  }

  const prefix = `__codex_persona_ui_${Date.now()}`;
  const probeButtonLabel = `codex-ui-${Date.now().toString(36)}`;
  const originalActiveId = String(personaStore.getActive?.()?.id || '').trim();
  const agentCenterWasVisible = Boolean(agentCenterPanel.isVisible?.());
  const temporaryPersonaIds = [];
  let probeButton = null;
  const report = { prefix, originalActiveId, cases: {}, cleanup: null };
  const baseContext = {
    operationIntentPolicy: { mode: 'write_allowed' },
    requestPermission: async () => ({ decision: 'allow' }),
  };

  try {
    const edited = await personaStore.create({
      name: `${prefix}_edited`,
      description: 'delete confirmation base',
    });
    const recreated = await personaStore.create({
      name: `${prefix}_recreated`,
      description: 'delete recreation base',
    });
    const leaseTarget = await personaStore.create({
      name: `${prefix}_lease_target`,
      description: 'persona switch lease target',
    });
    temporaryPersonaIds.push(edited.id, recreated.id, leaseTarget.id);

    const deleteResult = await registry.executeTool('persona.delete_many', {
      personas: [edited.id, recreated.id],
    }, {
      ...baseContext,
      requestToolConfirmation: async () => {
        await personaStore.update(edited.id, {
          description: 'user edit during confirmation',
        });
        const recreateIndex = personaStore.personas.findIndex(item => item?.id === recreated.id);
        const current = personaStore.personas[recreateIndex];
        personaStore.personas.splice(recreateIndex, 1, {
          ...current,
          name: `${prefix}_same_id_new_instance`,
          created: Number(current?.created || Date.now()) + 10_000,
          updated: Number(current?.updated || Date.now()) + 10_000,
        });
        await personaStore.save();
        return { confirmed: true };
      },
    });
    const editedOutcome = deleteResult?.result?.results?.find(item => item.personaId === edited.id);
    const recreatedOutcome = deleteResult?.result?.results?.find(item => item.personaId === recreated.id);
    report.cases.persona_delete_revision = {
      status: deleteResult?.status,
      editedOutcome,
      recreatedOutcome,
      editedFinal: personaStore.get(edited.id),
      recreatedFinal: personaStore.get(recreated.id),
      guarded: editedOutcome?.reason === 'persona_changed_during_confirmation' &&
        recreatedOutcome?.reason === 'persona_recreated_during_confirmation' &&
        personaStore.get(edited.id)?.description === 'user edit during confirmation' &&
        personaStore.get(recreated.id)?.name === `${prefix}_same_id_new_instance`,
    };

    personaPanel.onUserPersonaSwitch({
      fromPersonaId: originalActiveId,
      toPersonaId: '__simulated_manual_target__',
    });
    const switchResult = await registry.executeTool('persona.switch', {
      target: leaseTarget.id,
    }, baseContext);
    report.cases.persona_switch_lease = {
      status: switchResult?.status,
      result: switchResult?.result,
      activePersonaId: String(personaStore.getActive?.()?.id || ''),
      guarded: switchResult?.result?.switched === false &&
        switchResult?.result?.reason === 'user_persona_switch_lease_active' &&
        String(personaStore.getActive?.()?.id || '') === originalActiveId,
    };

    agentCenterPanel.show({ tab: 'agents' });
    await new Promise(resolve => setTimeout(resolve, 750));
    const panel = agentCenterPanel.panelElement;
    if (!panel) throw new Error('agent center panel unavailable after show');
    let clickCount = 0;
    probeButton = document.createElement('button');
    probeButton.type = 'button';
    probeButton.textContent = probeButtonLabel;
    probeButton.addEventListener('click', () => { clickCount += 1; });
    panel.prepend(probeButton);
    const panelStyle = getComputedStyle(panel);
    const panelRect = panel.getBoundingClientRect();
    report.uiPanelState = {
      display: panelStyle.display,
      visibility: panelStyle.visibility,
      opacity: panelStyle.opacity,
      width: panelRect.width,
      height: panelRect.height,
      hidden: panel.hidden === true,
      className: panel.className,
      overlayDisplay: agentCenterPanel.overlayElement?.style?.display || '',
    };

    const inspect = async () => (
      await registry.executeTool('app.ui.inspect', { panel: 'agent-center' }, {
        operationIntentPolicy: { mode: 'read_only' },
        requestPermission: async () => ({ decision: 'allow' }),
      })
    );
    const clickRef = async ref => (
      await registry.executeTool('ui.click_element', { ref }, baseContext)
    );
    const findProbeRef = output => output?.result?.panels?.[0]?.buttons
      ?.find(item => item.label === probeButtonLabel)?.ref || '';

    const firstInspect = await inspect();
    const firstRef = findProbeRef(firstInspect);
    const secondInspect = await inspect();
    const secondRef = findProbeRef(secondInspect);
    const staleResult = await clickRef(firstRef);
    report.cases.ui_inspect_revision = {
      firstRef,
      secondRef,
      inspectedPanels: (firstInspect?.result?.panels || []).map(item => ({
        id: item.id,
        buttons: (item.buttons || []).slice(0, 5).map(button => button.label),
      })),
      result: staleResult?.result,
      guarded: Boolean(firstRef && secondRef && firstRef !== secondRef) &&
        staleResult?.result?.reason === 'ref_not_found' && clickCount === 0,
    };

    const replaceInspect = await inspect();
    const replaceRef = findProbeRef(replaceInspect);
    const oldButton = probeButton;
    const replacement = oldButton.cloneNode(true);
    replacement.addEventListener('click', () => { clickCount += 1; });
    oldButton.replaceWith(replacement);
    probeButton = replacement;
    const replacedResult = await clickRef(replaceRef);
    report.cases.ui_dom_replacement = {
      ref: replaceRef,
      result: replacedResult?.result,
      guarded: ['element_detached', 'element_replaced'].includes(replacedResult?.result?.reason) && clickCount === 0,
    };

    const interactionInspect = await inspect();
    const interactionRef = findProbeRef(interactionInspect);
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const interactionResult = await clickRef(interactionRef);
    report.cases.ui_user_interaction = {
      ref: interactionRef,
      result: interactionResult?.result,
      guarded: interactionResult?.result?.reason === 'user_interaction_since_inspect' && clickCount === 0,
    };

    const successInspect = await inspect();
    const successRef = findProbeRef(successInspect);
    const successResult = await clickRef(successRef);
    report.cases.ui_fresh_click = {
      ref: successRef,
      result: {
        ok: successResult?.result?.ok,
        clicked: successResult?.result?.clicked,
        afterInspectRevision: successResult?.result?.after?.inspectRevision,
      },
      clickCount,
      passed: successResult?.result?.ok === true && clickCount === 1 &&
        Number(successResult?.result?.after?.inspectRevision || 0) >
          Number(successInspect?.result?.inspectRevision || 0),
    };

    probeButton.textContent = '删除测试记录';
    const dangerousInspect = await inspect();
    const dangerousRef = dangerousInspect?.result?.panels?.[0]?.buttons
      ?.find(item => item.label === '删除测试记录')?.ref || '';
    let dangerousConfirmationCount = 0;
    const dangerousResult = await registry.executeTool('ui.click_element', {
      ref: dangerousRef,
    }, {
      operationIntentPolicy: { mode: 'read_only' },
      requestPermission: async () => ({ decision: 'allow' }),
      requestToolConfirmation: () => {
        dangerousConfirmationCount += 1;
        return { decision: 'allow' };
      },
    });
    report.cases.ui_ref_danger = {
      ref: dangerousRef,
      result: dangerousResult?.result,
      dangerousConfirmationCount,
      clickCount,
      guarded: Boolean(dangerousRef) &&
        dangerousResult?.result?.reason === 'agent_tool_write_intent_required' &&
        dangerousConfirmationCount === 0 && clickCount === 1,
    };

    const confirmedDangerResult = await registry.executeTool('ui.click_element', {
      ref: dangerousRef,
    }, {
      ...baseContext,
      requestToolConfirmation: () => {
        const modal = document.createElement('div');
        modal.className = 'app-confirm-modal';
        const allowButton = document.createElement('button');
        modal.appendChild(allowButton);
        document.body.appendChild(modal);
        allowButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        modal.remove();
        return { decision: 'allow' };
      },
    });
    report.cases.ui_confirmed_danger = {
      ref: dangerousRef,
      result: {
        ok: confirmedDangerResult?.result?.ok,
        clicked: confirmedDangerResult?.result?.clicked,
        afterInspectRevision: confirmedDangerResult?.result?.after?.inspectRevision,
      },
      clickCount,
      passed: confirmedDangerResult?.result?.ok === true && clickCount === 2,
    };
  } finally {
    probeButton?.remove?.();
    if (!agentCenterWasVisible) agentCenterPanel.hide?.();
    if (originalActiveId && String(personaStore.getActive?.()?.id || '') !== originalActiveId) {
      await personaStore.setActive(originalActiveId);
      await personaPanel.notifyPersonaChanged?.();
    }
    for (const personaId of temporaryPersonaIds) {
      if (personaStore.get(personaId)) await personaStore.delete(personaId);
    }
    report.cleanup = {
      activePersonaId: String(personaStore.getActive?.()?.id || ''),
      remainingPersonas: temporaryPersonaIds.filter(id => Boolean(personaStore.get(id))),
      probeButtonConnected: Boolean(probeButton?.isConnected),
      agentCenterVisibleRestored: Boolean(agentCenterPanel.isVisible?.()) === agentCenterWasVisible,
    };
  }

  report.summary = {
    personaDeleteRevisionGuard: report.cases.persona_delete_revision?.guarded === true,
    personaSwitchLeaseGuard: report.cases.persona_switch_lease?.guarded === true,
    uiInspectRevisionGuard: report.cases.ui_inspect_revision?.guarded === true,
    uiDomReplacementGuard: report.cases.ui_dom_replacement?.guarded === true,
    uiUserInteractionGuard: report.cases.ui_user_interaction?.guarded === true,
    uiFreshClickPass: report.cases.ui_fresh_click?.passed === true,
    uiRefDangerGuard: report.cases.ui_ref_danger?.guarded === true,
    uiConfirmedDangerPass: report.cases.ui_confirmed_danger?.passed === true,
    cleanupPass: report.cleanup?.activePersonaId === originalActiveId &&
      report.cleanup?.remainingPersonas?.length === 0 &&
      report.cleanup?.probeButtonConnected === false &&
      report.cleanup?.agentCenterVisibleRestored === true,
  };
  report.summary.guardReady = Object.values(report.summary).every(value => value === true);
  return report;
})()
