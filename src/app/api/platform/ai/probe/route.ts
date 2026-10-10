import { z } from "zod";
import { platformRoute } from "@/server/route";
import { aiConfigInputSchema, loadPlatformAi } from "@/modules/ai/config";
import { probeProvider } from "@/modules/ai/probe";
import { readJson } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

const schema = z.object({ provider: aiConfigInputSchema.shape.providers.unwrap().element, action: z.enum(["test", "models"]) });

/** Tests a provider or loads its models from the settings form, before or after it is saved. */
export const POST = platformRoute(async ({ request }) => {
  const input = parseWith(schema, await readJson(request));
  return ok(await probeProvider(input.provider, (await loadPlatformAi()).providers, input.action));
});
