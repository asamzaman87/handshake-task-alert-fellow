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
  destinationPhoneNumber: process.env.DESTINATION_PHONE_NUMBER ?? "",
  extensionOrigin: process.env.EXTENSION_ORIGIN ?? "*",
  pollingEnabled: process.env.POLLING_ENABLED !== "false",
  cronSecret: process.env.CRON_SECRET ?? "",
  callTimeoutSec: Number(process.env.CALL_TIMEOUT_SEC ?? 20),
  cronJitterMaxSeconds: Number(process.env.CRON_JITTER_MAX_SECONDS ?? 60),
  defaultMessage: process.env.DEFAULT_VOICE_MESSAGE ?? "Handshake task available. Open Handshake now.",
  handshakeEndpoint:
    process.env.HANDSHAKE_ENDPOINT ??
    "https://ai.joinhandshake.com/api/trpc/task.getAllClaimableTasksForFellow",
  handshakeCookie: process.env.HANDSHAKE_COOKIE ?? "",
  defaultProjectId: process.env.HANDSHAKE_PROJECT_ID ?? "26a53071-8843-4138-97df-430bd3e4cd45"
};
