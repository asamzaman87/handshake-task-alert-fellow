import { PollResult } from "./types";

const BASE_ENDPOINT =
  "https://ai.joinhandshake.com/api/trpc/task.getAllClaimableTasksForFellow";

export async function pollHandshake(projectId: string): Promise<PollResult> {
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

  const input = encodeURIComponent(JSON.stringify(inputObj));
  const url = `${BASE_ENDPOINT}?batch=1&input=${input}`;
  const response = await fetch(url, { method: "GET", credentials: "include" });
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok || response.redirected || !contentType.includes("application/json")) {
    throw new Error("Session expired or request invalid: non-JSON or unauthorized response");
  }

  const data = await response.json();
  const availableCount = extractAvailableCount(data);
  const rawSnippet = JSON.stringify(data).slice(0, 300);
  return { availableCount, rawSnippet };
}

export function extractAvailableCount(payload: unknown): number {
  if (!Array.isArray(payload) || payload.length < 1) {
    throw new Error("Unexpected response shape from Handshake");
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
    throw new Error("Could not determine tasks array from payload");
  }
  return tasks.length;
}
