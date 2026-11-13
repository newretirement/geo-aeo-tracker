/**
 * Turn the rejected results of a multi-engine run into one short line for the
 * status bar, e.g. ` Perplexity (API): OpenRouter perplexity/sonar failed (404): …`.
 * Identical errors are listed once with a count, so a batch of 40 prompts that
 * all hit the same problem stays readable. Returns "" when nothing failed.
 */
export function summarizeFailures(
  results: PromiseSettledResult<unknown>[],
  maxLength = 300,
): string {
  const counts = new Map<string, number>();
  for (const r of results) {
    if (r.status !== "rejected") continue;
    const reason = r.reason;
    const text = (
      reason instanceof Error ? reason.message : String(reason ?? "")
    ).trim() || "Unknown error";
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  if (counts.size === 0) return "";
  const line = [...counts]
    .map(([text, n]) => (n > 1 ? `${text} (×${n})` : text))
    .join(" | ");
  return line.length > maxLength ? `${line.slice(0, maxLength - 1)}…` : line;
}
