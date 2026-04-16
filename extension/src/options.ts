import { DEFAULT_CONFIG, getConfig, setConfig } from "./storage";

const backendBaseUrl = byId("backendBaseUrl") as HTMLInputElement;
const destinationPhoneNumber = byId("destinationPhoneNumber") as HTMLInputElement;
const callerLabel = byId("callerLabel") as HTMLInputElement;
const pollIntervalMinutes = byId("pollIntervalMinutes") as HTMLInputElement;
const projectId = byId("projectId") as HTMLInputElement;
const customMessage = byId("customMessage") as HTMLTextAreaElement;
const saveBtn = byId("saveBtn") as HTMLButtonElement;
const statusEl = byId("status");

async function load(): Promise<void> {
  const config = await getConfig();
  backendBaseUrl.value = config.backendBaseUrl;
  destinationPhoneNumber.value = config.destinationPhoneNumber;
  callerLabel.value = config.callerLabel;
  pollIntervalMinutes.value = String(config.pollIntervalMinutes);
  projectId.value = config.projectId;
  customMessage.value = config.customMessage;
}

saveBtn.addEventListener("click", async () => {
  const next = {
    backendBaseUrl: backendBaseUrl.value.trim() || DEFAULT_CONFIG.backendBaseUrl,
    destinationPhoneNumber: destinationPhoneNumber.value.trim(),
    callerLabel: callerLabel.value.trim(),
    pollIntervalMinutes: Math.max(10, Number(pollIntervalMinutes.value || 10)),
    projectId: projectId.value.trim() || DEFAULT_CONFIG.projectId,
    customMessage: customMessage.value.trim() || DEFAULT_CONFIG.customMessage
  };
  await setConfig(next);
  statusEl.textContent = "Saved. Poll interval updates on next alarm setup.";
  setTimeout(() => {
    statusEl.textContent = "";
  }, 2500);
});

void load();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el;
}
