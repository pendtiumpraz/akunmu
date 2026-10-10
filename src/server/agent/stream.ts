import type { AgentStreamEvent } from "@/modules/ai/agent-types";
import { tenantById } from "@/modules/tenants/service";
import type { StaffContext } from "@/modules/users/session";
import { AppError, ValidationError } from "@/shared/http/errors";
import type { I18n } from "@/shared/i18n/messages-loader";
import type { Translator } from "@/shared/i18n/translate";
import type { AgentRun, AgentSession } from "./runner";

/** The assistant session of a staff request: who asks, in which language, and in which workspace. */
export async function agentSession(staff: StaffContext & { tenantId: number }, i18n: I18n): Promise<AgentSession> {
  const tenant = await tenantById(staff.tenantId);
  return {
    staff: { id: staff.user.id, name: staff.user.name, email: staff.user.email, role: staff.user.role },
    i18n,
    tenantName: tenant?.name ?? "",
  };
}

function errorEvent(error: unknown, t: Translator): AgentStreamEvent {
  if (error instanceof ValidationError) return { type: "error", status: 422, message: error.issues.map((issue) => t.dynamic(issue.messageKey, issue.params)).join(" ") };
  if (error instanceof AppError) return { type: "error", status: error.status, message: t.dynamic(error.messageKey, error.params) };
  console.error("[agent] run failed", error);
  return { type: "error", status: 500, message: t("errors.server") };
}

/**
 * Streams a run as server-sent events (`data: <json>` per event). The run starts inside the request's data scope
 * and keeps going if the browser disconnects, so its messages are stored either way.
 */
export function agentStream(run: AgentRun, t: Translator): Response {
  const encoder = new TextEncoder();
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: AgentStreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false;
        }
      };
      void run(emit)
        .catch((error: unknown) => emit(errorEvent(error, t)))
        .finally(() => {
          if (!open) return;
          open = false;
          try {
            controller.close();
          } catch {
            // Already closed by the browser.
          }
        });
    },
    cancel() {
      open = false;
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" },
  });
}
