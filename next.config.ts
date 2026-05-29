import type { NextConfig } from "next";

// SEC-02 baseline security headers + SEC-02b Report-Only wrapper CSP.
//
// These ship on every WRAPPER route the app controls, but MUST NOT reach the
// sandboxed raw-content route `/s/<id>/raw`, which carries its OWN strict
// per-response CSP set in app/s/[id]/raw/route.ts. Leaking X-Frame-Options:
// DENY or a wrapper CSP into the raw route would break the iframe trust
// contract (CLAUDE.md core value). The `source` below uses a negative-lookahead
// so it matches every path EXCEPT `/s/<anything>/raw` and `/api/...`.
//
// All values are static string literals — no request-derived interpolation
// reaches a header value, so header injection / response splitting via config
// is structurally impossible (threat T-01-01).
const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  async headers() {
    return [
      {
        // Match all wrapper routes EXCEPT the sandboxed raw-content route
        // (`/s/<id>/raw`) and `/api/*`. path-to-regexp negative-lookahead:
        // leading `/` then any path that does not begin with `s/.../raw`
        // or `api/`.
        source: "/((?!s/.*/raw|api/).*)",
        headers: [
          // --- SEC-02 baseline security headers (exact values, verbatim) ---
          // HSTS: 2-year max-age only, intentionally bare per CRIT-3 because
          // Vercel already manages HSTS coverage for *.vercel.app.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=() microphone=() geolocation=() interest-cohort=()",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          // --- SEC-02b Report-Only wrapper CSP + reporting endpoints ---
          // Modern Reporting API endpoint declaration (absolute first-party URL;
          // ?ctx=wrapper distinguishes wrapper reports from future content reports).
          {
            key: "Reporting-Endpoints",
            value:
              'csp-endpoint="https://html2u.vercel.app/api/csp-report?ctx=wrapper"',
          },
          // Report-Only (NEVER enforcing) so the UX-02 inline theme-bootstrap
          // script keeps running and the home page paints with no FOUC. It only
          // EMITS a violation report; enforce mode + nonce refactor is deferred
          // to SEC-V3-05. Carries both modern report-to and legacy report-uri.
          {
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-src 'self'",
              "base-uri 'self'",
              "form-action 'self'",
              "report-to csp-endpoint",
              "report-uri https://html2u.vercel.app/api/csp-report?ctx=wrapper",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
