import { SovereignDashboard } from "@/components/sovereign-dashboard";
import { availableProviders } from "@/components/dashboard/types";
import { isDemoDeploy } from "@/lib/agent-discovery";

// Demo mode has two triggers.
//
// 1. NEXT_PUBLIC_DEMO_ONLY=true — an explicit read-only public preview.
// 2. Neither BRIGHT_DATA_KEY nor OPENROUTER_KEY — no engine can answer, so
//    showing the sample dataset beats a live dashboard whose every request 400s.
//
// This is what makes every environment variable optional: a fresh clone or a
// zero-config Vercel deploy lands on a working dashboard, and adding a key
// is what switches it to live data. Keys are read here in a server component,
// so they are never shipped to the browser; only which engines exist is.
//
// Read per request, not at module scope: on Cloudflare Workers the keys are
// runtime secrets, absent when the page module is first evaluated at build.
export default function Home() {
  const explicitDemo = isDemoDeploy();
  const providers = availableProviders({
    brightData: Boolean((process.env.BRIGHT_DATA_KEY ?? "").trim()),
    openRouter: Boolean((process.env.OPENROUTER_KEY ?? "").trim()),
  });
  const isDemoOnly = explicitDemo || providers.length === 0;

  return (
    <SovereignDashboard
      demoMode={isDemoOnly}
      demoReason={providers.length === 0 && !explicitDemo ? "no-key" : "explicit"}
      providers={providers}
    />
  );
}
