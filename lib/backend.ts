// Storage backend abstraction.
//
//   - Production: Supabase (Postgres). Real table => the admin dashboard can
//     list / search / moderate, and one-time consumption is atomic via RPC.
//   - Local dev fallback: file store under .data/shares (zero setup). Fine for
//     a single dev process; do NOT use on serverless.

import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  HAS_SUPABASE,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} from "./config";

export type ShareMode = "link" | "password" | "magic";

export type StoredShare = {
  id: string;
  mode: ShareMode;
  html: string;
  passwordHash: string | null;
  magicToken: string | null;
  oneTime: boolean;
  consumedAt: number | null;
  title: string | null;
  views: number;
  reports: number;
  allowExternal: boolean; // false = strict self-contained CSP (exfil-blocked)
  createdIp: string | null;
  createdAt: number;
  expiresAt: number;
};

// Listing never exposes the html / secrets.
export type ShareSummary = {
  id: string;
  mode: ShareMode;
  title: string | null;
  hasPassword: boolean;
  oneTime: boolean;
  allowExternal: boolean;
  consumedAt: number | null;
  views: number;
  reports: number;
  createdIp: string | null;
  createdAt: number;
  expiresAt: number;
};

export interface Backend {
  create(s: StoredShare): Promise<void>;
  get(id: string): Promise<StoredShare | null>; // null if missing OR expired
  consumeMagic(id: string, token: string): Promise<StoredShare | null>; // atomic one-time
  incrViews(id: string): Promise<void>;
  report(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  list(opts: { limit: number; offset: number; q?: string }): Promise<{
    items: ShareSummary[];
    total: number;
  }>;
  incrRate(bucket: string, windowSeconds: number): Promise<number>;
}

const toSummary = (s: StoredShare): ShareSummary => ({
  id: s.id,
  mode: s.mode,
  title: s.title,
  hasPassword: !!s.passwordHash,
  oneTime: s.oneTime,
  allowExternal: s.allowExternal,
  consumedAt: s.consumedAt,
  views: s.views,
  reports: s.reports,
  createdIp: s.createdIp,
  createdAt: s.createdAt,
  expiresAt: s.expiresAt,
});

// --- Supabase backend -------------------------------------------------------

type Row = {
  id: string;
  mode: ShareMode;
  html: string;
  password_hash: string | null;
  magic_token: string | null;
  one_time: boolean;
  allow_external: boolean;
  consumed_at: string | null;
  title: string | null;
  views: number;
  reports: number;
  created_ip: string | null;
  created_at: string;
  expires_at: string;
};

const rowToShare = (r: Row): StoredShare => ({
  id: r.id,
  mode: r.mode,
  html: r.html,
  passwordHash: r.password_hash,
  magicToken: r.magic_token,
  oneTime: r.one_time,
  allowExternal: r.allow_external,
  consumedAt: r.consumed_at ? Date.parse(r.consumed_at) : null,
  title: r.title,
  views: r.views,
  reports: r.reports,
  createdIp: r.created_ip,
  createdAt: Date.parse(r.created_at),
  expiresAt: Date.parse(r.expires_at),
});

class SupabaseBackend implements Backend {
  private db: SupabaseClient;
  constructor() {
    this.db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async create(s: StoredShare): Promise<void> {
    const { error } = await this.db.from("shares").insert({
      id: s.id,
      mode: s.mode,
      html: s.html,
      password_hash: s.passwordHash,
      magic_token: s.magicToken,
      one_time: s.oneTime,
      allow_external: s.allowExternal,
      title: s.title,
      created_ip: s.createdIp,
      created_at: new Date(s.createdAt).toISOString(),
      expires_at: new Date(s.expiresAt).toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  async get(id: string): Promise<StoredShare | null> {
    const { data, error } = await this.db
      .from("shares")
      .select("*")
      .eq("id", id)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? rowToShare(data as Row) : null;
  }

  async consumeMagic(id: string, token: string): Promise<StoredShare | null> {
    const { data, error } = await this.db.rpc("consume_share", {
      p_id: id,
      p_token: token,
    });
    if (error) throw new Error(error.message);
    const rows = (data as Row[]) || [];
    return rows.length ? rowToShare(rows[0]) : null;
  }

  async incrViews(id: string): Promise<void> {
    await this.db.rpc("incr_views", { p_id: id });
  }

  async report(id: string): Promise<void> {
    await this.db.rpc("report_share", { p_id: id });
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from("shares").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async list(opts: { limit: number; offset: number; q?: string }) {
    let query = this.db
      .from("shares")
      .select(
        "id,mode,title,password_hash,one_time,allow_external,consumed_at,views,reports,created_ip,created_at,expires_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(opts.offset, opts.offset + opts.limit - 1);
    if (opts.q) query = query.ilike("title", `%${opts.q}%`);
    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    const items = (data as Row[]).map((r) =>
      toSummary(rowToShare({ ...r, html: "", magic_token: null } as Row)),
    );
    return { items, total: count ?? items.length };
  }

  async incrRate(bucket: string, windowSeconds: number): Promise<number> {
    const { data, error } = await this.db.rpc("incr_rate", {
      p_bucket: bucket,
      p_window_seconds: windowSeconds,
    });
    if (error) throw new Error(error.message);
    return (data as number) ?? 1;
  }
}

// --- File backend (dev) -----------------------------------------------------

const DATA_DIR = path.join(process.cwd(), ".data", "shares");
const RATE_DIR = path.join(process.cwd(), ".data", "rate");
const fileFor = (dir: string, k: string) =>
  path.join(dir, encodeURIComponent(k) + ".json");

class FileBackend implements Backend {
  private async read(id: string): Promise<StoredShare | null> {
    try {
      const raw = await fs.readFile(fileFor(DATA_DIR, id), "utf8");
      return JSON.parse(raw) as StoredShare;
    } catch {
      return null;
    }
  }
  private async write(s: StoredShare): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(fileFor(DATA_DIR, s.id), JSON.stringify(s));
  }

  async create(s: StoredShare): Promise<void> {
    await this.write(s);
  }

  async get(id: string): Promise<StoredShare | null> {
    const s = await this.read(id);
    if (!s) return null;
    if (s.expiresAt < Date.now()) {
      await this.remove(id);
      return null;
    }
    return s;
  }

  async consumeMagic(id: string, token: string): Promise<StoredShare | null> {
    const s = await this.get(id);
    if (!s || s.mode !== "magic" || s.magicToken !== token) return null;
    if (s.oneTime && s.consumedAt) return null;
    s.consumedAt = Date.now();
    s.views += 1;
    await this.write(s);
    return s;
  }

  async incrViews(id: string): Promise<void> {
    const s = await this.read(id);
    if (s) {
      s.views += 1;
      await this.write(s);
    }
  }

  async report(id: string): Promise<void> {
    const s = await this.read(id);
    if (s) {
      s.reports += 1;
      await this.write(s);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await fs.unlink(fileFor(DATA_DIR, id));
    } catch {
      /* gone */
    }
  }

  async list(opts: { limit: number; offset: number; q?: string }) {
    let files: string[] = [];
    try {
      files = await fs.readdir(DATA_DIR);
    } catch {
      return { items: [], total: 0 };
    }
    const all: StoredShare[] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const s = JSON.parse(
          await fs.readFile(path.join(DATA_DIR, f), "utf8"),
        ) as StoredShare;
        if (s.expiresAt < Date.now()) continue;
        if (opts.q && !(s.title || "").toLowerCase().includes(opts.q.toLowerCase()))
          continue;
        all.push(s);
      } catch {
        /* skip */
      }
    }
    all.sort((a, b) => b.createdAt - a.createdAt);
    const items = all.slice(opts.offset, opts.offset + opts.limit).map(toSummary);
    return { items, total: all.length };
  }

  async incrRate(bucket: string, windowSeconds: number): Promise<number> {
    await fs.mkdir(RATE_DIR, { recursive: true });
    const p = fileFor(RATE_DIR, bucket);
    let entry = { count: 0, exp: 0 };
    try {
      entry = JSON.parse(await fs.readFile(p, "utf8"));
    } catch {
      /* new bucket */
    }
    const now = Date.now();
    if (!entry.exp || entry.exp < now) {
      entry = { count: 1, exp: now + windowSeconds * 1000 };
    } else {
      entry.count += 1;
    }
    await fs.writeFile(p, JSON.stringify(entry));
    return entry.count;
  }
}

let _backend: Backend | null = null;
export function backend(): Backend {
  if (_backend) return _backend;
  if (HAS_SUPABASE) {
    _backend = new SupabaseBackend();
  } else {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[backend] Supabase not configured — using ephemeral file store. " +
          "Shares will NOT persist on serverless. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      );
    }
    _backend = new FileBackend();
  }
  return _backend;
}
