import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runAiScraper } from "@/lib/server/brightdata-scraper";
import {
  OpenRouterProviderSchema,
  runOpenRouterEngine,
} from "@/lib/server/openrouter-engines";

export const maxDuration = 300;

const BrightDataProviderSchema = z.enum([
  "chatgpt",
  "perplexity",
  "copilot",
  "gemini",
  "google_ai",
]);

const InputSchema = z.object({
  provider: z.union([BrightDataProviderSchema, OpenRouterProviderSchema]),
  prompt: z.string().min(3).max(2000),
  requireSources: z.boolean().optional(),
  country: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = InputSchema.parse(body);
    const openRouter = OpenRouterProviderSchema.safeParse(parsed.provider);
    const result = openRouter.success
      ? await runOpenRouterEngine({ ...parsed, provider: openRouter.data })
      : await runAiScraper({
          ...parsed,
          provider: BrightDataProviderSchema.parse(parsed.provider),
        });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
