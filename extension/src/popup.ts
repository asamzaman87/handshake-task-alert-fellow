const pollNowBtn = byId("pollNowBtn") as HTMLButtonElement;
const forceAlertBtn = byId("forceAlertBtn") as HTMLButtonElement;
pollNowBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "POLL_NOW" });
});
forceAlertBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "FORCE_ALERT" });
});

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el;
}
