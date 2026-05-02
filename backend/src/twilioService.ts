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
  _customMessage?: string
): Promise<SingleCallResult> {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="3600"/>
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
