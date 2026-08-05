#!/usr/bin/env node
// html2u MCP server — lets an MCP client (Claude Code, Claude Desktop, …) turn
// HTML into a shareable html2u link via POST /api/shares.
//
// Zero dependencies: speaks MCP's stdio transport (newline-delimited JSON-RPC)
// directly, so it runs with plain `node` — no npm install needed.
//
// Config (env vars):
//   HTML2U_API_KEY   — the server's ADMIN_API_KEY. Falls back to reading
//                      ADMIN_API_KEY/HTML2U_API_KEY from .env.local / .env
//                      at the repo root (one directory up from this file).
//   HTML2U_BASE_URL  — target instance; defaults to https://html2u.vercel.app
//
// Register (user scope, works in any project):
//   claude mcp add --scope user html2u -- node /path/to/repo/mcp/html2u-mcp.mjs

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = process.env.HTML2U_BASE_URL || "https://html2u.vercel.app";
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function apiKey() {
  if (process.env.HTML2U_API_KEY) return process.env.HTML2U_API_KEY;
  for (const file of [".env.local", ".env"]) {
    try {
      const text = readFileSync(join(REPO_ROOT, file), "utf8");
      const m = text.match(/^(?:ADMIN_API_KEY|HTML2U_API_KEY)="?([^"\n]+)"?$/m);
      if (m) return m[1];
    } catch {
      /* file absent — try next */
    }
  }
  return "";
}

const TOOL = {
  name: "share_html",
  description:
    "Upload an HTML document to html2u and get back a shareable URL that renders " +
    "it in a sandboxed iframe. Max 1 MB. Use this whenever the user wants to share " +
    "generated HTML as a link.",
  inputSchema: {
    type: "object",
    properties: {
      html: { type: "string", description: "Full HTML document to share (max 1 MB)" },
      title: { type: "string", description: "Optional title shown to viewers" },
      mode: {
        type: "string",
        enum: ["link", "password", "magic"],
        description:
          "link = anyone with the URL (default); password = viewers must enter a " +
          "password; magic = one-time link that self-destructs after first view",
      },
      password: { type: "string", description: "Required when mode is 'password'" },
      ttl: {
        type: "string",
        enum: ["1h", "1d", "7d", "30d"],
        description: "Lifetime before the share auto-expires (default 7d)",
      },
      allowExternal: {
        type: "boolean",
        description:
          "Allow the page to load external resources (CDNs, images). Weakens the " +
          "sandbox CSP — default false",
      },
    },
    required: ["html"],
  },
};

async function shareHtml(args) {
  const key = apiKey();
  if (!key)
    throw new Error(
      "No API key: set HTML2U_API_KEY, or put ADMIN_API_KEY in .env.local at the html2u repo root",
    );

  const res = await fetch(`${BASE_URL}/api/shares`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      html: String(args.html ?? ""),
      mode: args.mode || "link",
      password: args.password || "",
      ttl: args.ttl || "7d",
      title: args.title,
      allowExternal: args.allowExternal === true,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`html2u API ${res.status}: ${data.error || "unknown error"}`);

  const expires = data.expiresAt ? new Date(data.expiresAt).toISOString() : "?";
  const lines = [`Share URL: ${data.url}`, `Expires: ${expires}`, `Mode: ${data.mode}`];
  if (data.mode === "magic")
    lines.push("Note: one-time link — it is consumed on first open.");
  if (args.mode === "password")
    lines.push("Note: tell the viewer the password separately.");
  return lines.join("\n");
}

// --- MCP stdio plumbing (JSON-RPC 2.0, one message per line) ---

function send(msg) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
}

async function handle(req) {
  const { id, method, params } = req;
  switch (method) {
    case "initialize":
      return send({
        id,
        result: {
          protocolVersion: params?.protocolVersion || "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "html2u", version: "1.0.0" },
        },
      });
    case "ping":
      return send({ id, result: {} });
    case "tools/list":
      return send({ id, result: { tools: [TOOL] } });
    case "tools/call": {
      if (params?.name !== TOOL.name)
        return send({ id, error: { code: -32602, message: `unknown tool: ${params?.name}` } });
      try {
        const text = await shareHtml(params.arguments || {});
        return send({ id, result: { content: [{ type: "text", text }] } });
      } catch (e) {
        const text = e instanceof Error ? e.message : String(e);
        return send({ id, result: { content: [{ type: "text", text }], isError: true } });
      }
    }
    default:
      // Notifications (no id) need no reply; unknown requests get method-not-found.
      if (id !== undefined)
        send({ id, error: { code: -32601, message: `method not found: ${method}` } });
  }
}

createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return send({ id: null, error: { code: -32700, message: "parse error" } });
  }
  handle(req).catch(() => {});
});
