import cors from "cors";
import express from "express";
import { z } from "zod";
import { config } from "./config.js";
import { placeSingleAlertCall } from "./twilioService.js";

if (!process.env.PUBLIC_BASE_URL) {
  throw new Error("Missing PUBLIC_BASE_URL");
}

const app = express();
const corsOptions = {
  origin: config.extensionOrigin === "*" ? true : config.extensionOrigin
};
app.use(express.json());
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

const startAlertSchema = z.object({
  alertId: z.string().min(3).optional(),
  phoneNumber: z.string().min(8).optional(),
  message: z.string().optional()
});
const debugHandshakePollSchema = z.object({
  projectId: z.string().uuid().optional()
});
const pollNowSchema = z.object({
  reason: z.string().optional()
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/alerts/start", async (req, res) => {
  const parseResult = startAlertSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: "Invalid payload", details: parseResult.error.flatten() });
  }
  const { alertId, phoneNumber, message } = parseResult.data;
  const target = phoneNumber ?? config.destinationPhoneNumber;
  if (!target) {
    return res.status(400).json({ error: "Destination phone number is not configured." });
  }
  const result = await placeSingleAlertCall(target, message);
  if (!result.ok) {
    return res.status(502).json({ error: result.error ?? "Twilio call failed" });
  }
  return res.status(202).json({
    alertId: alertId ?? `manual-${Date.now()}`,
    status: "accepted",
    callSid: result.callSid,
    acceptedAt: new Date().toISOString()
  });
});

app.post("/alerts/force", async (req, res) => {
  const parseResult = startAlertSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: "Invalid payload", details: parseResult.error.flatten() });
  }
  const { phoneNumber, message } = parseResult.data;
  const target = phoneNumber ?? config.destinationPhoneNumber;
  if (!target) {
    return res.status(400).json({ error: "Destination phone number is not configured." });
  }
  const result = await placeSingleAlertCall(target, message);
  if (!result.ok) {
    return res.status(502).json({ error: result.error ?? "Twilio call failed" });
  }
  return res.json({
    ok: true,
    callSid: result.callSid
  });
});

app.post("/monitor/poll-now", async (req, res) => {
  const parse = pollNowSchema.safeParse(req.body ?? {});
  if (!parse.success) {
    return res.status(400).json({ error: "Invalid payload", details: parse.error.flatten() });
  }
  const result = await runRemotePoll(parse.data.reason ?? "manual");
  return res.json(result);
});

app.get("/monitor/status", (_req, res) => {
  res.json({
    pollingEnabled: config.pollingEnabled,
    projectId: config.defaultProjectId,
    backendMode: "remote_cron",
    destinationConfigured: Boolean(config.destinationPhoneNumber),
    hasHandshakeCookie: Boolean(config.handshakeCookie)
  });
});

app.get("/cron/poll", async (req, res) => {
  const cronSecret = config.cronSecret;
  if (cronSecret) {
    const authHeader = String(req.headers.authorization ?? "");
    const headerSecret = String(req.headers["x-cron-secret"] ?? "");
    const fromVercelCron = Boolean(req.headers["x-vercel-cron"]);
    const authorized =
      authHeader === `Bearer ${cronSecret}` || headerSecret === cronSecret || fromVercelCron;
    if (!authorized) {
      return res.status(401).json({ error: "Unauthorized cron request" });
    }
  }

  const result = await runRemotePoll("cron");
  return res.status(result.ok ? 200 : 500).json(result);
});

app.post("/debug/handshake-poll-with-cookie", async (req, res) => {
  const parsed = debugHandshakePollSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  if (!config.handshakeCookie) {
    return res.status(400).json({ error: "HANDSHAKE_COOKIE is not configured on backend." });
  }

  try {
    const pollResult = await pollHandshake(parsed.data.projectId ?? config.defaultProjectId);
    return res.json({
      ok: true,
      status: 200,
      contentType: "application/json",
      availableCount: pollResult.availableCount,
      responseSnippet: pollResult.responseSnippet
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Cookie poll request failed"
    });
  }
});

if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`Backend listening on http://localhost:${config.port}`);
  });
}

function buildHandshakePollUrl(projectId: string): string {
  const baseEndpoint = config.handshakeEndpoint;
  const inputObj = {
    0: {
      json: {
        annotationProjectId: projectId,
        pipelineStageId: null,
        attempters: null,
        search: null,
        sortBy: "default",
        sortOrder: "desc",
        limit: 10,
        offset: 0,
        categories: null,
        priorityLevel: null
      },
      meta: {
        values: {
          pipelineStageId: ["undefined"],
          attempters: ["undefined"],
          search: ["undefined"],
          categories: ["undefined"],
          priorityLevel: ["undefined"]
        },
        v: 1
      }
    }
  };
  return `${baseEndpoint}?batch=1&input=${encodeURIComponent(JSON.stringify(inputObj))}`;
}

async function runRemotePoll(reason: string): Promise<{
  ok: boolean;
  reason: string;
  called: boolean;
  availableCount: number | null;
  callSid?: string;
  pollError?: string;
  callError?: string;
}> {
  if (!config.pollingEnabled) {
    const skipped = {
      ok: true,
      reason,
      called: false,
      availableCount: null
    };
    logPollResult({ ...skipped, note: "Polling disabled by env" });
    return skipped;
  }

  if (!config.destinationPhoneNumber) {
    const missing = {
      ok: false,
      reason,
      called: false,
      availableCount: null,
      callError: "DESTINATION_PHONE_NUMBER is missing"
    };
    logPollResult(missing);
    return missing;
  }

  try {
    const pollResult = await pollHandshake(config.defaultProjectId);
    if (pollResult.availableCount > 0) {
      const callResult = await placeSingleAlertCall(config.destinationPhoneNumber);
      const response = {
        ok: callResult.ok,
        reason,
        called: true,
        availableCount: pollResult.availableCount,
        callSid: callResult.callSid,
        callError: callResult.error
      };
      logPollResult(response);
      return response;
    }

    const noTask = {
      ok: true,
      reason,
      called: false,
      availableCount: pollResult.availableCount
    };
    logPollResult(noTask);
    return noTask;
  } catch (error) {
    const pollError = error instanceof Error ? error.message : "Handshake poll failed";
    // Requirement: call once when poll request errors.
    const callResult = await placeSingleAlertCall(
      config.destinationPhoneNumber,
      "Handshake polling error detected. Please check the service."
    );
    const onError = {
      ok: callResult.ok,
      reason,
      called: true,
      availableCount: null,
      pollError,
      callSid: callResult.callSid,
      callError: callResult.error
    };
    logPollResult(onError);
    return onError;
  }
}

async function pollHandshake(projectId: string): Promise<{ availableCount: number; responseSnippet: string }> {
  if (!config.handshakeCookie) {
    throw new Error("HANDSHAKE_COOKIE is not configured.");
  }

  const url = buildHandshakePollUrl(projectId);
  const cookieHeader = config.handshakeCookie.includes("=")
    ? config.handshakeCookie
    : `hss-global=${config.handshakeCookie}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Cookie: cookieHeader,
      Accept: "application/json"
    }
  });
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  if (!response.ok || !contentType.includes("application/json")) {
    throw new Error(`Handshake poll failed with status ${response.status}`);
  }

  const parsed = JSON.parse(text) as unknown;
  return {
    availableCount: extractAvailableCount(parsed),
    responseSnippet: text.slice(0, 500)
  };
}

function logPollResult(payload: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      event: "poll_run",
      at: new Date().toISOString(),
      ...payload
    })
  );
}

function extractAvailableCount(payload: unknown): number {
  if (!Array.isArray(payload) || payload.length < 1) {
    throw new Error("Unexpected response shape");
  }
  const first = payload[0] as { result?: { data?: { json?: unknown } } };
  const rawJson = first?.result?.data?.json;
  if (!rawJson || typeof rawJson !== "object") {
    throw new Error("Missing tRPC result payload");
  }
  const tasks =
    (rawJson as { tasks?: unknown[] }).tasks ??
    (rawJson as { items?: unknown[] }).items ??
    (rawJson as { records?: unknown[] }).records;
  if (!Array.isArray(tasks)) {
    throw new Error("Could not find task array");
  }
  return tasks.length;
}

export default app;
