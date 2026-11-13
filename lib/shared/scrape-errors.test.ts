import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeFailures } from "./scrape-errors";

const ok = { status: "fulfilled", value: 1 } as const;
const fail = (reason: unknown): PromiseRejectedResult => ({
  status: "rejected",
  reason,
});

test("summarizeFailures is empty when nothing failed", () => {
  assert.equal(summarizeFailures([ok, ok]), "");
  assert.equal(summarizeFailures([]), "");
});

test("summarizeFailures lists each distinct error and counts repeats", () => {
  const line = summarizeFailures([
    ok,
    fail(new Error("Perplexity (API): OpenRouter perplexity/sonar failed (404)")),
    fail(new Error("Perplexity (API): OpenRouter perplexity/sonar failed (404)")),
    fail(new Error("Claude (API): timeout")),
  ]);
  assert.equal(
    line,
    "Perplexity (API): OpenRouter perplexity/sonar failed (404) (×2) | Claude (API): timeout",
  );
});

test("summarizeFailures handles non-Error and empty reasons", () => {
  assert.equal(summarizeFailures([fail("plain string")]), "plain string");
  assert.equal(summarizeFailures([fail(undefined)]), "Unknown error");
});

test("summarizeFailures truncates long lines", () => {
  const line = summarizeFailures([fail(new Error("x".repeat(500)))], 50);
  assert.equal(line.length, 50);
  assert.ok(line.endsWith("…"));
});
