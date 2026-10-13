import type { NextConfig } from "next";

/**
 * Security headers and Content-Security-Policy. AkunMu loads nothing from other origins, except the project
 * screenshots it stores in Vercel Blob (images only, from the Blob store's public host).
 */
const isDevelopment = process.env.NODE_ENV !== "production";
/**
 * The desktop build (desktop/scripts/build.mjs): a standalone server the Electron shell runs on plain http at
 * 127.0.0.1, built into its own folder so it never mixes with the web build.
 */
const isDesktopBuild = process.env.AKUNMU_DESKTOP === "1";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'none'",
  "worker-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  ...(isDevelopment || isDesktopBuild ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isDesktopBuild ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The app lives inside a larger folder with other lockfiles; pin the project root.
  outputFileTracingRoot: import.meta.dirname,
  turbopack: { root: import.meta.dirname },
  // RoPA, DPIA and incident documents (PDF) embed the Inter fonts read from assets/fonts at run time.
  outputFileTracingIncludes: Object.fromEntries(
    ["", "/platform"].flatMap((prefix) =>
      ["ropa/[key]/document", "register", "dpia/[key]/document", "incidents/[id]/document"].map((path) => [`/api${prefix}/compliance/${path}`, ["./assets/fonts/*.ttf"]]),
    ),
  ),
  ...(isDesktopBuild ? { output: "standalone" as const, distDir: ".next-desktop", images: { unoptimized: true } } : {}),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
