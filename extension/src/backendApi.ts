import { AlertState } from "./types";

export interface BackendAlertStatus {
  alertId: string;
  status: "queued" | "calling" | "answered" | "unresolved" | "failed";
  attempts: number;
  endedAt?: string;
}

export async function startBackendAlert(
  backendBaseUrl: string,
  activeAlert: AlertState,
  phoneNumber: string,
  message: string
): Promise<void> {
  const response = await fetch(`${backendBaseUrl}/alerts/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      alertId: activeAlert.alertId,
      phoneNumber,
      message
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Backend /alerts/start failed: ${response.status} ${text.slice(0, 180)}`);
  }
}

export async function getBackendAlertStatus(
  backendBaseUrl: string,
  alertId: string
): Promise<BackendAlertStatus> {
  const response = await fetch(`${backendBaseUrl}/alerts/${encodeURIComponent(alertId)}/status`);
  if (!response.ok) {
    throw new Error(`Backend status request failed: ${response.status}`);
  }
  return (await response.json()) as BackendAlertStatus;
}
