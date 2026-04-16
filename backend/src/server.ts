import cors from "cors";
import express from "express";
import { z } from "zod";
import { config } from "./config.js";
import { getAlert, getAlertByCallSid, updateAlert } from "./alertStore.js";
import { startAlertCycle, markAnswered } from "./twilioService.js";

if (!process.env.PUBLIC_BASE_URL) {
  throw new Error("Missing PUBLIC_BASE_URL");
}

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: config.extensionOrigin === "*" ? true : config.extensionOrigin
  })
);

const startAlertSchema = z.object({
  alertId: z.string().min(3),
  phoneNumber: z.string().min(8),
  message: z.string().optional()
});
const debugHandshakePollSchema = z.object({
  projectId: z.string().uuid().optional()
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/debug/handshake-poll-with-cookie", async (req, res) => {
  if (!config.handshakeCookie) {
    return res.status(400).json({
      error: "HANDSHAKE_COOKIE is not configured on backend."
    });
  }

  const parsed = debugHandshakePollSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const projectId = parsed.data.projectId ?? config.defaultProjectId;
  const url = buildHandshakePollUrl(projectId);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Cookie: config.handshakeCookie,
        Accept: "application/json"
      }
    });

    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    let availableCount: number | null = null;
    if (contentType.includes("application/json")) {
      try {
        const jsonPayload = JSON.parse(text) as unknown;
        availableCount = extractAvailableCount(jsonPayload);
      } catch {
        availableCount = null;
      }
    }

    return res.status(response.status).json({
      ok: response.ok,
      status: response.status,
      contentType,
      availableCount,
      responseSnippet: text.slice(0, 500)
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Cookie poll request failed"
    });
  }
});

app.post("/alerts/start", async (req, res) => {
  const parseResult = startAlertSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: "Invalid payload", details: parseResult.error.flatten() });
  }
  const { alertId, phoneNumber, message } = parseResult.data;
  try {
    const record = await startAlertCycle(alertId, phoneNumber, message);
    return res.status(202).json({
      alertId: record.alertId,
      status: record.status,
      attempts: record.attempts,
      acceptedAt: new Date().toISOString()
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Failed to start alert";
    return res.status(500).json({ error: messageText });
  }
});

app.get("/alerts/:id/status", (req, res) => {
  const record = getAlert(req.params.id);
  if (!record) {
    return res.status(404).json({ error: "Alert not found" });
  }
  return res.json(record);
});

app.post(
  "/twilio/status-callback",
  express.urlencoded({ extended: true }),
  (req, res) => {
    const callSid = String(req.body.CallSid ?? "");
    const callStatus = String(req.body.CallStatus ?? "");
    const alertId = getAlertByCallSid(callSid);
    if (alertId) {
      if (callStatus === "in-progress") {
        updateAlert(alertId, { status: "calling" });
      }
      if (callStatus === "completed" || callStatus === "answered") {
        markAnswered(alertId);
      }
      if (["busy", "failed", "no-answer", "canceled"].includes(callStatus)) {
        const current = getAlert(alertId);
        if (current && current.status !== "answered") {
          updateAlert(alertId, { status: "calling" });
        }
      }
    }
    res.status(204).send();
  }
);

app.all("/twiml/alert", express.urlencoded({ extended: true }), (req, res) => {
  const alertId = String(req.query.alertId ?? "");
  const alert = getAlert(alertId);
  const message = alert?.customMessage ?? config.defaultMessage;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${escapeXml(message)}</Say>
  <Pause length="1"/>
</Response>`;
  res.type("text/xml").send(twiml);
});

app.listen(config.port, () => {
  console.log(`Backend listening on http://localhost:${config.port}`);
});

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildHandshakePollUrl(projectId: string): string {
  const baseEndpoint =
    "https://ai.joinhandshake.com/api/trpc/task.getAllClaimableTasksForFellow";
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
