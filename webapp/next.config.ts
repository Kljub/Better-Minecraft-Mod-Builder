import type { NextConfig } from "next";
import { networkInterfaces } from "os";

// Next.js deliberately refuses a bare "*"/"**" wildcard for allowedDevOrigins (it would defeat
// the point of the allowlist), and its "*.x" matcher matches exactly one label — "*.internal"
// would NOT match "minecraft.modbuilder.internal" (3 labels). So instead of hand-listing every
// host this machine might be reached as, list every IP it currently has (covers "whatever
// LAN/VPN address you hit it from") plus a wildcard for the actual local domain in use here.
function localIps(): string[] {
  const ips: string[] = [];
  for (const iface of Object.values(networkInterfaces())) {
    for (const addr of iface ?? []) {
      if (!addr.internal) ips.push(addr.address);
    }
  }
  return ips;
}

const nextConfig: NextConfig = {
  // Allow LAN access to dev-server resources (HMR websocket, etc.) when reached via any of the
  // host machine's current IPs or a "*.modbuilder.internal" local hostname, instead of only localhost.
  allowedDevOrigins: [...localIps(), "*.modbuilder.internal"],
  // The floating dev-tools badge is dev-server chrome, not app UI — hide it
  // during Playwright runs so it can't leak into visual regression snapshots.
  ...(process.env.PLAYWRIGHT_TEST ? { devIndicators: false } : {}),
  // In sandbox environments (e.g. super.engineering) the project root may be
  // read-only, causing Turbopack panics. Write dev chunks to /tmp instead.
  ...(process.env.NODE_ENV !== "production" ? { distDir: "/tmp/next-dist-mc-ui-builder" } : {}),
};

export default nextConfig;
