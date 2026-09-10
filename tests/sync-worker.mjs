import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

const crypto = webcrypto;
const baseUrl = process.env.CONTA_AI_TEST_URL || "http://127.0.0.1:8791";
const secret = [...crypto.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();

const sha256 = async value => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
const hex = bytes => [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
const toBase64 = bytes => Buffer.from(bytes).toString("base64url");
const fromBase64 = value => new Uint8Array(Buffer.from(value, "base64url"));

const id = hex(await sha256(`contaai:id:${secret}`));
const writeKey = hex(await sha256(`contaai:write:${secret}`));
const key = await crypto.subtle.importKey("raw", await sha256(`contaai:encryption:${secret}`), "AES-GCM", false, ["encrypt", "decrypt"]);

async function encrypt(value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(id) }, key, new TextEncoder().encode(JSON.stringify(value)));
  return { version: 1, iv: toBase64(iv), data: toBase64(new Uint8Array(encrypted)) };
}

async function decrypt(payload) {
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(payload.iv), additionalData: new TextEncoder().encode(id) }, key, fromBase64(payload.data));
  return JSON.parse(new TextDecoder().decode(decrypted));
}

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  assert.equal(response.headers.get("x-contaai-sync"), "1", "a resposta não foi identificada como serviço de sincronização");
  return { response, body };
}

const health = await request("/api/sync");
assert.equal(health.response.status, 200);
assert.equal(health.body.ok, true);

const missing = await request(`/api/sync/${id}`);
assert.equal(missing.response.status, 404);

const firstDocument = { version: 1, updatedAt: 1, transactions: [{ id: "t1", title: "Teste protegido", updatedAt: 1 }], goals: [], budgets: [], categories: [], tombstones: [] };
const created = await request(`/api/sync/${id}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", "X-Contaai-Key": writeKey },
  body: JSON.stringify({ baseRevision: 0, payload: await encrypt(firstDocument) })
});
assert.equal(created.response.status, 201);
assert.equal(created.body.revision, 1);

const stored = await request(`/api/sync/${id}`);
assert.equal(stored.body.revision, 1);
assert.deepEqual(await decrypt(stored.body.payload), firstDocument);
assert.equal(stored.body.payload.data.includes("Teste protegido"), false, "o Worker recebeu conteúdo em texto aberto");

const conflict = await request(`/api/sync/${id}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", "X-Contaai-Key": writeKey },
  body: JSON.stringify({ baseRevision: 0, payload: await encrypt(firstDocument) })
});
assert.equal(conflict.response.status, 409);
assert.equal(conflict.body.revision, 1);

const denied = await request(`/api/sync/${id}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", "X-Contaai-Key": "0".repeat(64) },
  body: JSON.stringify({ baseRevision: 1, payload: await encrypt(firstDocument) })
});
assert.equal(denied.response.status, 403);

const secondDocument = { ...firstDocument, updatedAt: 2, goals: [{ id: "g1", title: "Reserva", updatedAt: 2 }] };
const updated = await request(`/api/sync/${id}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", "X-Contaai-Key": writeKey },
  body: JSON.stringify({ baseRevision: 1, payload: await encrypt(secondDocument) })
});
assert.equal(updated.response.status, 200);
assert.equal(updated.body.revision, 2);

const final = await request(`/api/sync/${id}`);
assert.deepEqual(await decrypt(final.body.payload), secondDocument);
process.stdout.write("✓ Worker: cofre criptografado, revisão e autorização validados\n");
