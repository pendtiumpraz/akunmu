import { z } from "zod";
import { staffRoute } from "@/server/route";
import { loadTenantAi, tenantAiInputSchema } from "@/modules/ai/config";
import { probeProvider } from "@/modules/ai/probe";
import { readJson } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

const schema = z.object({ provider: tenantAiInputSchema.shape.providers.unwrap().element, action: z.enum(["test", "models"]) });

export const POST = staffRoute("settings.manage", async ({ request }) => {
  const input = parseWith(schema, await readJson(request));
  return ok(await probeProvider(input.provider, (await loadTenantAi()).providers, input.action));
});
