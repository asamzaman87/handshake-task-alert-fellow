import Twilio from "twilio";
import { config } from "./config.js";
import {
  createAlert,
  elapsedMs,
  getAlert,
  isTerminalStatus,
  markCallMapping,
  updateAlert
} from "./alertStore.js";
import { AlertRecord } from "./types.js";

const client = Twilio(config.twilioAccountSid, config.twilioAuthToken);
const activeRunners = new Map<string, Promise<void>>();

export async function startAlertCycle(
  alertId: string,
  phoneNumber: string,
  customMessage?: string
): Promise<AlertRecord> {
  const existing = getAlert(alertId);
  if (existing) {
    return existing;
  }

  const record: AlertRecord = {
    alertId,
    phoneNumber,
    status: "queued",
    attempts: 0,
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    customMessage: customMessage?.trim() || config.defaultMessage
  };

  createAlert(record);
  const runPromise = runAlert(alertId);
  activeRunners.set(alertId, runPromise);
  runPromise.finally(() => activeRunners.delete(alertId)).catch(() => undefined);
  return record;
}

async function runAlert(alertId: string): Promise<void> {
  while (elapsedMs(alertId) < config.maxAlertDurationMs) {
    const current = getAlert(alertId);
    if (!current || isTerminalStatus(current.status)) return;

    updateAlert(alertId, { status: "calling" });
    const callResult = await placeSingleCall(current);
    if (!callResult.ok) {
      updateAlert(alertId, {
        status: "failed",
        endedAt: new Date().toISOString(),
        failureReason: callResult.error
      });
      return;
    }

    await sleep(config.callTimeoutSec * 1000 + 2500);

    const latest = getAlert(alertId);
    if (!latest) return;
    if (latest.status === "answered") {
      updateAlert(alertId, { endedAt: new Date().toISOString() });
      return;
    }

    if (elapsedMs(alertId) < config.maxAlertDurationMs) {
      await sleep(config.retryGapMs);
    }
  }

  const finalAlert = getAlert(alertId);
  if (finalAlert && !isTerminalStatus(finalAlert.status)) {
    updateAlert(alertId, {
      status: "unresolved",
      endedAt: new Date().toISOString()
    });
  }
}

async function placeSingleCall(record: AlertRecord): Promise<{ ok: boolean; error?: string }> {
  try {
    const call = await client.calls.create({
      to: record.phoneNumber,
      from: config.twilioFromNumber,
      url: `${process.env.PUBLIC_BASE_URL}/twiml/alert?alertId=${encodeURIComponent(record.alertId)}`,
      statusCallback: `${process.env.PUBLIC_BASE_URL}/twilio/status-callback`,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["answered", "completed", "no-answer", "busy", "failed"],
      timeout: config.callTimeoutSec
    });
    markCallMapping(call.sid, record.alertId);
    updateAlert(record.alertId, {
      attempts: record.attempts + 1,
      lastCallSid: call.sid
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Twilio error";
    return { ok: false, error: message };
  }
}

export function markAnswered(alertId: string): void {
  updateAlert(alertId, {
    status: "answered",
    answeredAt: new Date().toISOString(),
    endedAt: new Date().toISOString()
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
