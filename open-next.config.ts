import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Defaults: no incremental cache. Every page here is either static or
// force-dynamic, so there is nothing for ISR to store.
export default defineCloudflareConfig();
