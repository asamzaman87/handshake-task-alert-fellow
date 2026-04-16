import { getBackendAlertStatus, startBackendAlert } from "./backendApi";
import { pollHandshake } from "./handshake";
import { DEFAULT_STATE, getConfig, getState, patchState, setState } from "./storage";
import { AlertState, ExtensionState } from "./types";

const POLL_ALARM = "task-poll-alarm";
const RETRY_ALARM = "task-retry-alarm";
const RETRY_DELAY_MINUTES = 30;

chrome.runtime.onInstalled.addListener(async () => {
  await ensureInitialized();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureInitialized();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === POLL_ALARM) {
    await runPoll("poll_alarm");
  } else if (alarm.name === RETRY_ALARM) {
    await runRetryCheck();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    if (message?.type === "TOGGLE_ENABLED") {
      const state = await getState();
      const enabled = !state.enabled;
      await patchState({ enabled, lastError: null });
      await syncAlarms(enabled);
      if (enabled) await runPoll("manual_enable");
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
      await chrome.alarms.clear(RETRY_ALARM);
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
  await syncAlarms(state.enabled);
}

async function syncAlarms(enabled: boolean): Promise<void> {
  const config = await getConfig();
  if (!enabled) {
    await chrome.alarms.clear(POLL_ALARM);
    await chrome.alarms.clear(RETRY_ALARM);
    return;
  }
  const periodInMinutes = Math.max(10, config.pollIntervalMinutes);
  await chrome.alarms.create(POLL_ALARM, {
    periodInMinutes,
    delayInMinutes: 0.1
  });
}

async function runPoll(source: string): Promise<void> {
  const state = await getState();
  const config = await getConfig();
  if (!state.enabled) return;
  const previousCount = state.lastAvailableCount;

  try {
    const result = await pollHandshake(config.projectId);
    await patchState({
      lastPollAt: new Date().toISOString(),
      lastPollStatus: "ok",
      lastAvailableCount: result.availableCount,
      lastError: null
    });
    await handleAvailabilityTransition(result.availableCount, previousCount, source);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    const isSessionIssue = text.toLowerCase().includes("session expired");
    await patchState({
      lastPollAt: new Date().toISOString(),
      lastPollStatus: isSessionIssue ? "session_expired" : "error",
      lastError: text
    });
  }
}

async function handleAvailabilityTransition(
  availableCount: number,
  previousCount: number,
  source: string
): Promise<void> {
  const state = await getState();
  const config = await getConfig();
  const hasTasks = availableCount > 0;
  const hadTasks = previousCount > 0;

  if (!hasTasks) {
    await resolveIfNoTasks(state);
    return;
  }

  if (state.activeAlert) {
    await refreshAlertStatus(state.activeAlert.alertId);
    return;
  }

  if (hadTasks && state.activeAvailabilityKey) {
    return;
  }

  const alertId = createAlertId(source);
  const alert: AlertState = {
    alertId,
    state: "TASK_AVAILABLE_NEW",
    createdAt: new Date().toISOString(),
    retryScheduled: false,
    retryAttempted: false
  };

  await patchState({
    activeAlert: { ...alert, state: "ALERT_ACTIVE" },
    lastAlertStartedAt: new Date().toISOString(),
    activeAvailabilityKey: `avail-${alertId}`
  });

  if (!config.destinationPhoneNumber) {
    await patchState({
      lastError: "Destination phone number missing in options.",
      activeAlert: null
    });
    return;
  }

  try {
    await startBackendAlert(
      config.backendBaseUrl,
      alert,
      config.destinationPhoneNumber,
      config.customMessage
    );
    await refreshAlertStatus(alertId);
  } catch (error) {
    await patchState({
      lastError: error instanceof Error ? error.message : "Failed to contact backend",
      activeAlert: null
    });
  }
}

async function refreshAlertStatus(alertId: string): Promise<void> {
  const config = await getConfig();
  try {
    const status = await getBackendAlertStatus(config.backendBaseUrl, alertId);
    if (status.status === "answered") {
      await patchState({
        activeAlert: null,
        lastAlertResolvedAt: new Date().toISOString(),
        lastRetryScheduledAt: null
      });
      await chrome.alarms.clear(RETRY_ALARM);
      return;
    }

    if (status.status === "unresolved" || status.status === "failed") {
      const state = await getState();
      if (state.activeAlert && !state.activeAlert.retryScheduled) {
        await scheduleRetry();
      }
    }
  } catch (error) {
    await patchState({
      lastError: error instanceof Error ? error.message : "Could not refresh alert status"
    });
  }
}

async function scheduleRetry(): Promise<void> {
  const state = await getState();
  if (!state.activeAlert) return;
  await chrome.alarms.create(RETRY_ALARM, { delayInMinutes: RETRY_DELAY_MINUTES });
  await patchState({
    activeAlert: {
      ...state.activeAlert,
      retryScheduled: true,
      state: "ALERT_UNANSWERED_WAITING_RETRY"
    },
    lastRetryScheduledAt: new Date().toISOString()
  });
}

async function runRetryCheck(): Promise<void> {
  const state = await getState();
  if (!state.enabled || !state.activeAlert) return;

  await patchState({
    activeAlert: { ...state.activeAlert, state: "RETRY_DUE_CHECKING_TASKS", retryAttempted: true }
  });

  await runPoll("retry_due");
  const latest = await getState();
  if (!latest.activeAlert) return;

  const config = await getConfig();
  const status = await getBackendAlertStatus(config.backendBaseUrl, latest.activeAlert.alertId).catch(
    async () => {
      await patchState({ lastError: "Retry check could not read backend alert status." });
      return null;
    }
  );
  if (latest.lastAvailableCount > 0 && status && status.status !== "answered") {
    const retryAlertId = createAlertId("retry");
    await patchState({
      activeAlert: {
        alertId: retryAlertId,
        state: "ALERT_ACTIVE",
        createdAt: new Date().toISOString(),
        retryScheduled: false,
        retryAttempted: true
      },
      lastAlertStartedAt: new Date().toISOString()
    });
    try {
      await startBackendAlert(
        config.backendBaseUrl,
        {
          alertId: retryAlertId,
          state: "ALERT_ACTIVE",
          createdAt: new Date().toISOString(),
          retryScheduled: false,
          retryAttempted: true
        },
        config.destinationPhoneNumber,
        config.customMessage
      );
    } catch (error) {
      await patchState({
        lastError: error instanceof Error ? error.message : "Retry alert start failed"
      });
    }
  } else {
    await patchState({
      activeAlert: null,
      lastAlertResolvedAt: new Date().toISOString()
    });
  }
}

async function resolveIfNoTasks(state: ExtensionState): Promise<void> {
  if (!state.activeAlert) {
    await patchState({
      activeAvailabilityKey: null
    });
    return;
  }
  await patchState({
    activeAlert: null,
    activeAvailabilityKey: null,
    lastAlertResolvedAt: new Date().toISOString()
  });
  await chrome.alarms.clear(RETRY_ALARM);
}

function createAlertId(source: string): string {
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${Date.now()}-${source}-${suffix}`;
}

async function runForceAlert(): Promise<void> {
  const config = await getConfig();
  if (!config.destinationPhoneNumber) {
    await patchState({ lastError: "Destination phone number missing in options." });
    return;
  }

  const alertId = createAlertId("force");
  const alert: AlertState = {
    alertId,
    state: "ALERT_ACTIVE",
    createdAt: new Date().toISOString(),
    retryScheduled: false,
    retryAttempted: false
  };

  await patchState({
    activeAlert: alert,
    lastAlertStartedAt: new Date().toISOString(),
    lastError: null
  });

  try {
    await startBackendAlert(
      config.backendBaseUrl,
      alert,
      config.destinationPhoneNumber,
      config.customMessage
    );
    await refreshAlertStatus(alertId);
  } catch (error) {
    await patchState({
      activeAlert: null,
      lastError: error instanceof Error ? error.message : "Force alert failed"
    });
  }
}
