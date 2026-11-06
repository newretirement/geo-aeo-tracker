import { z } from "zod";
import { fetchWithTimeout } from "./http";

/**
 * AI engines answered through the OpenRouter API instead of Bright Data's
 * consumer-app scrapers. Each request turns on OpenRouter's web plugin, which
 * uses the provider's own search where it has one (OpenAI, Anthropic, Google,
 * Perplexity), so answers cite live pages the way the consumer apps do.
 *
 * These are API answers: no ChatGPT/Gemini app system prompt, memory or
 * personalization. Close to what the apps say, not identical.
 *
 * Returns the same shape as runAiScraper, so the client scores both alike.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export const OpenRouterProviderSchema = z.enum([
  "chatgpt_api",
  "claude_api",
  "gemini_api",
  "perplexity_api",
]);

type OpenRouterProvider = z.infer<typeof OpenRouterProviderSchema>;

/**
 * Model per engine. gpt-chat-latest is OpenAI's alias for the model ChatGPT
 * serves; the others are each vendor's mainstream chat model. Override one
 * with OPENROUTER_ENGINE_MODEL_<ENGINE>, e.g. OPENROUTER_ENGINE_MODEL_CLAUDE_API.
 */
export const DEFAULT_ENGINE_MODELS: Record<OpenRouterProvider, string> = {
  chatgpt_api: "openai/gpt-chat-latest",
  claude_api: "anthropic/claude-sonnet-5.5",
  gemini_api: "google/gemini-3.8-flash",
  perplexity_api: "perplexity/sonar",
};

export function engineModel(provider: OpenRouterProvider): string {
  const override =
    process.env[`OPENROUTER_ENGINE_MODEL_${provider.toUpperCase()}`]?.trim();
  return override || DEFAULT_ENGINE_MODELS[provider];
}

type EngineRequest = {
  provider: OpenRouterProvider;
  prompt: string;
  country?: string;
};

type EngineResult = {
  provider: OpenRouterProvider;
  prompt: string;
  answer: string;
  sources: string[];
  cached: boolean;
  raw: unknown;
  createdAt: string;
  model: string;
};

/** Build the request body. Exported for tests. */
export function buildEngineBody(request: EngineRequest) {
  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  // The consumer apps know roughly where the user is; tell the API the same,
  // and nothing else, so answers stay as unprompted as possible.
  if (request.country) {
    messages.push({
      role: "system",
      content: `The user is located in country code ${request.country.toUpperCase()}.`,
    });
  }
  messages.push({ role: "user", content: request.prompt });
  return {
    model: engineModel(request.provider),
    messages,
    plugins: [{ id: "web" }],
    max_tokens: 2000,
  };
}

type Annotation = { type?: string; url_citation?: { url?: unknown } };

/** Pull the answer text and de-duplicated cited URLs. Exported for tests. */
export function parseEngineResponse(payload: unknown): {
  answer: string;
  sources: string[];
} {
  const message = (
    payload as {
      choices?: Array<{
        message?: { content?: unknown; annotations?: Annotation[] };
      }>;
    }
  )?.choices?.[0]?.message;
  const answer = typeof message?.content === "string" ? message.content : "";

  const urls: string[] = [];
  for (const a of message?.annotations ?? []) {
    const url = a?.url_citation?.url;
    if (a?.type === "url_citation" && typeof url === "string") urls.push(url);
  }
  // Some providers also return a top-level citations array (Perplexity).
  const citations = (payload as { citations?: unknown })?.citations;
  if (Array.isArray(citations)) {
    for (const c of citations) if (typeof c === "string") urls.push(c);
  }
  const sources = [...new Set(urls)].filter((u) => /^https?:\/\//i.test(u));
  return { answer, sources };
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_KEY?.trim());
}

export async function runOpenRouterEngine(
  request: EngineRequest,
): Promise<EngineResult> {
  const provider = OpenRouterProviderSchema.parse(request.provider);
  const apiKey = process.env.OPENROUTER_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_KEY is not set, so the API engines are unavailable.",
    );
  }

  const body = buildEngineBody({ ...request, provider });
  const response = await fetchWithTimeout(
    OPENROUTER_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    90_000,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `OpenRouter ${body.model} failed (${response.status}): ${text.slice(0, 300)}`,
    );
  }

  const payload: unknown = await response.json();
  const { answer, sources } = parseEngineResponse(payload);
  if (!answer) {
    throw new Error(`OpenRouter ${body.model} returned no answer.`);
  }

  return {
    provider,
    prompt: request.prompt,
    answer,
    sources,
    cached: false,
    raw: null,
    createdAt: new Date().toISOString(),
    model: body.model,
  };
}
