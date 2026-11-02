import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default (dummy) incremental cache: no route uses ISR or revalidate. Pages
// are therefore rendered per request rather than served from the build
// output, which is also what lets app/page.tsx see BRIGHT_DATA_KEY, a runtime
// secret, and leave demo mode.
export default defineCloudflareConfig();
