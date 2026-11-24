import express from "express";
import { createClient } from "@libsql/client";
import worker from "./_worker.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

const dbUrl = process.env.TABO_DATABASE_URL || process.env.TURSO_DATABASE_URL || "file:./tabo-local.db";
const dbOptions = { url: dbUrl };
if (process.env.TURSO_AUTH_TOKEN) dbOptions.authToken = process.env.TURSO_AUTH_TOKEN;
const client = createClient(dbOptions);

// Small D1-compatible adapter. The Worker already uses SQLite SQL; Turso/libSQL
// keeps that SQL and the existing table logic without requiring Cloudflare D1.
function plainRow(row, columns = []) {
  if (!row) return null;
  const out = {};
  if (Array.isArray(columns) && columns.length) {
    for (let i = 0; i < columns.length; i++) out[columns[i]] = row[i];
    return out;
  }
  for (const k of Object.keys(row)) if (!/^\d+$/.test(k)) out[k] = row[k];
  return out;
}
class LibsqlStatement {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first(column) {
    const result = await client.execute({ sql: this.sql, args: this.args });
    const row = plainRow(result.rows[0], result.columns);
    return column ? (row ? row[column] ?? null : null) : row;
  }
  async all() {
    const result = await client.execute({ sql: this.sql, args: this.args });
    return { success: true, results: result.rows.map(row => plainRow(row, result.columns)), meta: { changes: result.rowsAffected, last_row_id: result.lastInsertRowid } };
  }
  async run() {
    const result = await client.execute({ sql: this.sql, args: this.args });
    return { success: true, meta: { changes: result.rowsAffected, last_row_id: result.lastInsertRowid } };
  }
}
class LibsqlD1 {
  prepare(sql) { return new LibsqlStatement(sql); }
  async batch(statements) {
    const queries = statements.map(s => ({ sql: s.sql, args: s.args || [] }));
    const results = await client.batch(queries, "write");
    return results.map(r => ({ success: true, meta: { changes: r.rowsAffected, last_row_id: r.lastInsertRowid } }));
  }
}
const db = new LibsqlD1();
const env = {
  LBDB: db,
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }
};
const ctx = { waitUntil(promise) { Promise.resolve(promise).catch(err => console.error("background task failed", err)); } };

app.get("/healthz", (_req, res) => res.json({ ok: true, service: "tabo-ai", backend: "node-keyless-ai" }));

async function toWebRequest(req) {
  const headers = new Headers();
  const blocked = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null || blocked.has(key.toLowerCase())) continue;
    if (Array.isArray(value)) for (const item of value) headers.append(key, item);
    else headers.set(key, String(value));
  }
  if (!headers.has("cf-connecting-ip") && req.ip) headers.set("cf-connecting-ip", req.ip);
  let body;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const chunks = []; let total = 0;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > 15 * 1024 * 1024) throw Object.assign(new Error("request_too_large"), { status: 413 });
      chunks.push(chunk);
    }
    if (chunks.length) body = Buffer.concat(chunks);
  }
  const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  return new Request(url, { method: req.method, headers, ...(body ? { body } : {}) });
}
async function sendWebResponse(webResponse, res) {
  res.status(webResponse.status);
  for (const [key, value] of webResponse.headers) {
    if (["transfer-encoding", "connection"].includes(key.toLowerCase())) continue;
    res.setHeader(key, value);
  }
  if (!webResponse.body || res.req.method === "HEAD") return res.end();
  const reader = webResponse.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) await new Promise(resolve => res.once("drain", resolve));
    }
    res.end();
  } catch (error) {
    console.error("response stream error", error);
    if (!res.headersSent) res.status(502);
    res.end();
  } finally { try { reader.releaseLock(); } catch {} }
}

// All backend endpoints are handled by the existing Tabo Worker logic, now
// running in Node and backed by SQLite/Turso + keyless AI gateways instead of Cloudflare bindings.
app.use(async (req, res, next) => {
  if (!(req.path.startsWith("/api/") || req.path === "/v1" || req.path.startsWith("/v1/"))) return next();
  try {
    const request = await toWebRequest(req);
    const response = await worker.fetch(request, env, ctx);
    await sendWebResponse(response, res);
  } catch (error) {
    console.error("backend request failed", error);
    res.status(error.status || 500).json({ error: error.message === "request_too_large" ? "request_too_large" : "server_error" });
  }
});

app.use(express.static(path.join(__dirname, "public"), { index: "index.html", extensions: ["html"] }));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const port = Number(process.env.PORT || 10000);
app.listen(port, "0.0.0.0", () => console.log(`Tabo AI listening on ${port}`));
