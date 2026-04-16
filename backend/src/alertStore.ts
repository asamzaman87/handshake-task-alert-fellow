import { AlertRecord, AlertStatus } from "./types.js";

interface RuntimeState {
  record: AlertRecord;
  timerStartedAt: number;
}

const alerts = new Map<string, RuntimeState>();
const callToAlert = new Map<string, string>();

export function getAlert(alertId: string): AlertRecord | undefined {
  return alerts.get(alertId)?.record;
}

export function createAlert(record: AlertRecord): AlertRecord {
  alerts.set(record.alertId, {
    record,
    timerStartedAt: Date.now()
  });
  return record;
}

export function updateAlert(alertId: string, patch: Partial<AlertRecord>): AlertRecord | undefined {
  const entry = alerts.get(alertId);
  if (!entry) return undefined;
  entry.record = { ...entry.record, ...patch };
  alerts.set(alertId, entry);
  return entry.record;
}

export function markCallMapping(callSid: string, alertId: string): void {
  callToAlert.set(callSid, alertId);
}

export function getAlertByCallSid(callSid: string): string | undefined {
  return callToAlert.get(callSid);
}

export function elapsedMs(alertId: string): number {
  const entry = alerts.get(alertId);
  if (!entry) return 0;
  return Date.now() - entry.timerStartedAt;
}

export function isTerminalStatus(status: AlertStatus): boolean {
  return status === "answered" || status === "unresolved" || status === "failed";
}
