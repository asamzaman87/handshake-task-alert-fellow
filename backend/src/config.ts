import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  twilioAccountSid: required("TWILIO_ACCOUNT_SID"),
  twilioAuthToken: required("TWILIO_AUTH_TOKEN"),
  twilioFromNumber: required("TWILIO_FROM_NUMBER"),
  extensionOrigin: process.env.EXTENSION_ORIGIN ?? "*",
  maxAlertDurationMs: 60_000,
  callTimeoutSec: Number(process.env.CALL_TIMEOUT_SEC ?? 20),
  retryGapMs: Number(process.env.CALL_RETRY_GAP_MS ?? 3_000),
  defaultMessage: process.env.DEFAULT_VOICE_MESSAGE ?? "Handshake task available. Open Handshake now.",
  handshakeCookie: process.env.HANDSHAKE_COOKIE ?? "",
  defaultProjectId: process.env.HANDSHAKE_PROJECT_ID ?? "26a53071-8843-4138-97df-430bd3e4cd45"
};
