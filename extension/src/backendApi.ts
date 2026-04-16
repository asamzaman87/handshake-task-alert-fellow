export interface RemotePollResult {
  ok: boolean;
  called: boolean;
  availableCount: number | null;
  skipped?: boolean;
  pollError?: string;
  callError?: string;
}

export async function triggerRemotePoll(
  backendBaseUrl: string,
  reason: string
): Promise<RemotePollResult> {
  const response = await fetch(`${backendBaseUrl}/monitor/poll-now`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Backend /monitor/poll-now failed: ${response.status} ${text.slice(0, 180)}`);
  }
  return (await response.json()) as RemotePollResult;
}

export async function forceRemoteAlert(
  backendBaseUrl: string
): Promise<{ ok: boolean; callSid?: string }> {
  const response = await fetch(`${backendBaseUrl}/alerts/force`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Backend /alerts/force failed: ${response.status} ${text.slice(0, 180)}`);
  }
  return (await response.json()) as { ok: boolean; callSid?: string };
}
