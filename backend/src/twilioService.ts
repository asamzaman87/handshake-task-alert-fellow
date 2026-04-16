import Twilio from "twilio";
import { config } from "./config.js";

const client = Twilio(config.twilioAccountSid, config.twilioAuthToken);

export interface SingleCallResult {
  ok: boolean;
  callSid?: string;
  error?: string;
}

export async function placeSingleAlertCall(
  phoneNumber: string,
  customMessage?: string
): Promise<SingleCallResult> {
  const text = escapeXml((customMessage?.trim() || config.defaultMessage).slice(0, 240));
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${text}</Say>
</Response>`;

  try {
    const call = await client.calls.create({
      to: phoneNumber,
      from: config.twilioFromNumber,
      twiml,
      timeout: config.callTimeoutSec
    });
    return { ok: true, callSid: call.sid };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Twilio error";
    return { ok: false, error: message };
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
