import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildEngineBody,
  DEFAULT_ENGINE_MODELS,
  parseEngineResponse,
  runOpenRouterEngine,
} from "./openrouter-engines";
import { availableProviders } from "../../components/dashboard/types";

test("body: web search on, prompt verbatim, country as the only context", () => {
  const body = buildEngineBody({
    provider: "claude_api",
    prompt: "Best retirement planner?",
    country: "us",
  });
  assert.equal(body.model, DEFAULT_ENGINE_MODELS.claude_api);
  assert.deepEqual(body.plugins, [{ id: "web" }]);
  assert.deepEqual(body.messages, [
    { role: "system", content: "The user is located in country code US." },
    { role: "user", content: "Best retirement planner?" },
  ]);
});

test("body: no country means no system message", () => {
  const body = buildEngineBody({ provider: "chatgpt_api", prompt: "Hi there" });
  assert.deepEqual(body.messages, [{ role: "user", content: "Hi there" }]);
});

test("body: per-engine model override from env", () => {
  process.env.OPENROUTER_ENGINE_MODEL_GEMINI_API = "google/gemini-x";
  try {
    assert.equal(
      buildEngineBody({ provider: "gemini_api", prompt: "Hi there" }).model,
      "google/gemini-x",
    );
  } finally {
    delete process.env.OPENROUTER_ENGINE_MODEL_GEMINI_API;
  }
});

test("parse: url_citation annotations and citations, de-duplicated, http only", () => {
  const { answer, sources } = parseEngineResponse({
    citations: ["https://b.example/", "not-a-url"],
    choices: [
      {
        message: {
          content: "Boldin is a retirement planner.",
          annotations: [
            { type: "url_citation", url_citation: { url: "https://a.example/" } },
            { type: "url_citation", url_citation: { url: "https://b.example/" } },
            { type: "file", url_citation: { url: "https://ignored.example/" } },
          ],
        },
      },
    ],
  });
  assert.equal(answer, "Boldin is a retirement planner.");
  assert.deepEqual(sources, ["https://a.example/", "https://b.example/"]);
});

test("parse: malformed payload yields empty answer, no throw", () => {
  assert.deepEqual(parseEngineResponse(null), { answer: "", sources: [] });
  assert.deepEqual(parseEngineResponse({ choices: [] }), {
    answer: "",
    sources: [],
  });
});

test("run: missing OPENROUTER_KEY fails before any network call", async () => {
  const saved = process.env.OPENROUTER_KEY;
  delete process.env.OPENROUTER_KEY;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("fetch must not be called");
  }) as typeof fetch;
  try {
    await assert.rejects(
      runOpenRouterEngine({ provider: "chatgpt_api", prompt: "Hi there" }),
      /OPENROUTER_KEY is not set/,
    );
  } finally {
    globalThis.fetch = realFetch;
    if (saved !== undefined) process.env.OPENROUTER_KEY = saved;
  }
});

test("run: sends key and body, returns scrape-shaped result", async () => {
  process.env.OPENROUTER_KEY = "sk-or-test";
  const realFetch = globalThis.fetch;
  let seen: { url: string; init?: RequestInit } | undefined;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    seen = { url: String(url), init };
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: "Answer text",
              annotations: [
                { type: "url_citation", url_citation: { url: "https://s.example/" } },
              ],
            },
          },
        ],
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  try {
    const result = await runOpenRouterEngine({
      provider: "perplexity_api",
      prompt: "Hi there",
    });
    assert.equal(seen?.url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(
      (seen?.init?.headers as Record<string, string>).Authorization,
      "Bearer sk-or-test",
    );
    assert.equal(
      JSON.parse(String(seen?.init?.body)).model,
      DEFAULT_ENGINE_MODELS.perplexity_api,
    );
    assert.equal(result.provider, "perplexity_api");
    assert.equal(result.answer, "Answer text");
    assert.deepEqual(result.sources, ["https://s.example/"]);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.OPENROUTER_KEY;
  }
});

test("run: upstream error surfaces status and model", async () => {
  process.env.OPENROUTER_KEY = "sk-or-test";
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("insufficient credits", { status: 402 })) as typeof fetch;
  try {
    await assert.rejects(
      runOpenRouterEngine({ provider: "claude_api", prompt: "Hi there" }),
      /claude-sonnet-5\.5 failed \(402\): insufficient credits/,
    );
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.OPENROUTER_KEY;
  }
});

test("availableProviders: only engines with a key, demo when none", () => {
  assert.deepEqual(availableProviders({ brightData: false, openRouter: false }), []);
  assert.deepEqual(availableProviders({ brightData: false, openRouter: true }), [
    "chatgpt_api",
    "claude_api",
    "gemini_api",
    "perplexity_api",
  ]);
  assert.equal(
    availableProviders({ brightData: true, openRouter: true }).length,
    9,
  );
});
