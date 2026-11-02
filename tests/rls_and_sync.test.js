import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const schema = fs.readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const backend = fs.readFileSync(new URL("../backend.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("schema contains the v5 security boundaries", () => {
  for (const fragment of [
    "auth_is_lover",
    "auth_is_active_friend",
    "redeem_couple_invite",
    "storage.foldername(name)",
    "submit_game_move",
    "shared_to_friends",
  ]) assert.match(schema, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("backend contains offline queue and private media safeguards", () => {
  for (const fragment of ["lovemojo_v5_db", "sync_queue", "pending_media", "MAX_RETRIES", "createSignedUrl", "couple-media"]) {
    assert.match(backend, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("app has the auth gate and five lover screens", () => {
  assert.match(index, /id="auth-gate"/);
  assert.equal((index.match(/data-tab="/g) || []).length, 5);
  assert.equal((index.match(/data-screen="/g) || []).length, 5);
});
