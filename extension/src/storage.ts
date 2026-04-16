import { ExtensionState } from "./types";

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
  state?: ExtensionState;
};

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
