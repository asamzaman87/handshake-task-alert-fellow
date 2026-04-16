import { forceRemoteAlert, triggerRemotePoll } from "./backendApi";
import { DEFAULT_STATE, getConfig, getState, patchState, setState } from "./storage";

chrome.runtime.onInstalled.addListener(async () => {
  await ensureInitialized();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureInitialized();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    if (message?.type === "TOGGLE_ENABLED") {
      const state = await getState();
      const enabled = !state.enabled;
      await patchState({ enabled, lastError: null });
      sendResponse({ ok: true, enabled });
      return;
    }
    if (message?.type === "POLL_NOW") {
      await runPoll("manual");
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "FORCE_ALERT") {
      await runForceAlert();
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "CLEAR_STATE") {
      const current = await getState();
      await setState({
        ...DEFAULT_STATE,
        enabled: current.enabled
      });
      sendResponse({ ok: true });
      return;
    }
    sendResponse({ ok: false, error: "Unknown message" });
  })();
  return true;
});

async function ensureInitialized(): Promise<void> {
  const state = await getState();
  await patchState(state);
}

async function runPoll(source: string): Promise<void> {
  const state = await getState();
  const config = await getConfig();
  if (!state.enabled) {
    await patchState({
      lastError: "Manual polling is disabled in popup. Enable to run manual poll."
    });
    return;
  }

  try {
    const result = await triggerRemotePoll(config.backendBaseUrl, source);
    await patchState({
      lastPollAt: new Date().toISOString(),
      lastPollStatus: result.ok ? "ok" : "error",
      lastAvailableCount: result.availableCount ?? 0,
      lastError: result.pollError ?? result.callError ?? null,
      activeAlert: result.called
        ? {
            alertId: `remote-${Date.now()}`,
            state: "ALERT_ACTIVE",
            createdAt: new Date().toISOString(),
            retryScheduled: false,
            retryAttempted: false
          }
        : null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Manual poll failed";
    await patchState({
      lastPollAt: new Date().toISOString(),
      lastPollStatus: "error",
      lastError: message
    });
  }
}

async function runForceAlert(): Promise<void> {
  const config = await getConfig();
  try {
    const result = await forceRemoteAlert(config.backendBaseUrl, config.customMessage);
    await patchState({
      lastAlertStartedAt: new Date().toISOString(),
      lastError: result.ok ? null : "Force alert returned not-ok response"
    });
  } catch (error) {
    await patchState({
      lastError: error instanceof Error ? error.message : "Force alert failed"
    });
  }
}
