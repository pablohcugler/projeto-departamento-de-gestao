import { requireAdmin, handleRequest } from "./index.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function factory(options: { valid?: boolean; active?: boolean; admin?: boolean }) {
  return (() => ({
    auth: { getUser: () => Promise.resolve({
      data: { user: options.valid === false ? null : { id: "test-caller" } },
      error: null,
    }) },
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve({
          data: table === "user_profiles"
            ? { suspenso: options.active === false, setor_id: "test-sector" }
            : options.admin === false ? null : { role: "admin" },
          error: null,
        }),
      };
      return chain;
    },
  })) as unknown as typeof createClient;
}

const request = () => new Request("https://example.test", { headers: { Authorization: "Bearer test-session" } });

async function denied(req: Request, client: typeof createClient, reason: string) {
  let rejected = false;
  try { await requireAdmin(req, "https://example.test", "test-public", client); }
  catch (error) { rejected = error instanceof Error && error.message.includes(reason); }
  assert(rejected, "Unauthorized caller must be rejected");
}

Deno.test("administration requires a session", async () => {
  await denied(new Request("https://example.test"), factory({}), "Sessão ausente");
});
Deno.test("administration requires a valid session", async () => {
  await denied(request(), factory({ valid: false }), "Sessão inválida");
});
Deno.test("administration rejects suspended users even with admin role", async () => {
  await denied(request(), factory({ active: false }), "suspenso");
});
Deno.test("administration rejects active non-admin users", async () => {
  await denied(request(), factory({ admin: false }), "Apenas administradores");
});
Deno.test("administration accepts only a valid active administrator", async () => {
  const result = await requireAdmin(request(), "https://example.test", "test-public", factory({}));
  assert(result.user.id === "test-caller", "Expected verified administrator identity");
});
Deno.test("function allows CORS preflight and rejects non-POST methods", async () => {
  assert((await handleRequest(new Request("https://example.test", { method: "OPTIONS" }))).status === 200, "Preflight must succeed");
  assert((await handleRequest(new Request("https://example.test"))).status === 405, "GET must be rejected");
});