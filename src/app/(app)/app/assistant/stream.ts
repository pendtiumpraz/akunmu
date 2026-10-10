"use client";

import type { AgentStreamEvent } from "@/modules/ai/agent-types";
import { ApiClientError } from "@/shared/http/client";

/**
 * POSTs to an assistant endpoint and hands each server-sent event to `onEvent`. Errors before the stream starts
 * (validation, quota, a busy chat) come back as the usual JSON envelope and are thrown as ApiClientError.
 */
export async function streamAgent(path: string, body: unknown, onEvent: (event: AgentStreamEvent) => void, signal?: AbortSignal): Promise<void> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiClientError("", 0);
  }
  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as { message?: string; errors?: Record<string, string[]> } | null;
    throw new ApiClientError(payload?.message ?? "", response.status, payload?.errors ?? {});
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = chunk
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6))
        .join("\n");
      if (data) onEvent(JSON.parse(data) as AgentStreamEvent);
      boundary = buffer.indexOf("\n\n");
    }
  }
}
