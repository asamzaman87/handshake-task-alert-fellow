import { ExtensionConfig, ExtensionState } from "./types";

export const DEFAULT_CONFIG: ExtensionConfig = {
  backendBaseUrl: "https://unscreenable-exanimate-stefany.ngrok-free.dev",
  destinationPhoneNumber: "+13474590196",
  callerLabel: "",
  pollIntervalMinutes: 10,
  projectId: "26a53071-8843-4138-97df-430bd3e4cd45",
  customMessage: "Handshake task available. Open Handshake now."
};

export const DEFAULT_STATE: ExtensionState = {
  enabled: false,
  lastPollAt: null,
  lastPollStatus: "idle",
  lastAvailableCount: 0,
  lastError: null,
  activeAlert: null,
  lastAlertStartedAt: null,
  lastAlertResolvedAt: null,
  lastRetryScheduledAt: null,
  activeAvailabilityKey: null
};

type StoreShape = {
  config?: ExtensionConfig;
  state?: ExtensionState;
};

export async function getConfig(): Promise<ExtensionConfig> {
  const value = (await chrome.storage.local.get("config")) as StoreShape;
  return { ...DEFAULT_CONFIG, ...(value.config ?? {}) };
}

export async function setConfig(config: ExtensionConfig): Promise<void> {
  await chrome.storage.local.set({ config });
}

export async function getState(): Promise<ExtensionState> {
  const value = (await chrome.storage.local.get("state")) as StoreShape;
  return { ...DEFAULT_STATE, ...(value.state ?? {}) };
}

export async function setState(state: ExtensionState): Promise<void> {
  await chrome.storage.local.set({ state });
}

export async function patchState(patch: Partial<ExtensionState>): Promise<ExtensionState> {
  const current = await getState();
  const next = { ...current, ...patch };
  await setState(next);
  return next;
}
