import { forceRemoteAlert, triggerRemotePoll } from "./backendApi";

const BACKEND_BASE_URL = "https://handshake-task-alert-vercel.vercel.app";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    if (message?.type === "POLL_NOW") {
      await runPoll();
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "FORCE_ALERT") {
      await runForceAlert();
      sendResponse({ ok: true });
      return;
    }
    sendResponse({ ok: false, error: "Unknown message" });
  })();
  return true;
});

async function runPoll(): Promise<void> {
  try {
    await triggerRemotePoll(BACKEND_BASE_URL, "manual");
  } catch (error) {
    console.error("Poll now failed", error);
  }
}

async function runForceAlert(): Promise<void> {
  try {
    await forceRemoteAlert(BACKEND_BASE_URL);
  } catch (error) {
    console.error("Force alert failed", error);
  }
}
