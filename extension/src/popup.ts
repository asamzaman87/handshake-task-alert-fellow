import { getState } from "./storage";

const enabledEl = byId("enabled");
const lastPollAtEl = byId("lastPollAt");
const lastPollStatusEl = byId("lastPollStatus");
const countEl = byId("count");
const alertStateEl = byId("alertState");
const lastErrorEl = byId("lastError");
const toggleBtn = byId("toggleBtn") as HTMLButtonElement;
const pollNowBtn = byId("pollNowBtn") as HTMLButtonElement;
const forceAlertBtn = byId("forceAlertBtn") as HTMLButtonElement;
const clearBtn = byId("clearBtn") as HTMLButtonElement;
const optionsBtn = byId("optionsBtn") as HTMLButtonElement;

async function render(): Promise<void> {
  const state = await getState();
  enabledEl.textContent = state.enabled ? "On" : "Off";
  toggleBtn.textContent = state.enabled ? "Disable" : "Enable";
  lastPollAtEl.textContent = state.lastPollAt ? new Date(state.lastPollAt).toLocaleString() : "Never";
  lastPollStatusEl.textContent = state.lastPollStatus;
  countEl.textContent = String(state.lastAvailableCount);
  alertStateEl.textContent = state.activeAlert?.state ?? "IDLE";
  lastErrorEl.textContent = state.lastError ?? "None";
}

toggleBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "TOGGLE_ENABLED" });
  await render();
});
pollNowBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "POLL_NOW" });
  await render();
});
forceAlertBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "FORCE_ALERT" });
  await render();
});
clearBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CLEAR_STATE" });
  await render();
});
optionsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());

void render();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el;
}
