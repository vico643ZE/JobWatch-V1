import test from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  createSession,
  validSession,
  sameOrigin,
} from "../lib/auth.mjs";
process.env.APP_URL = "https://jobwatch.example";
process.env.SESSION_SECRET = "test-only-secret-for-unit-tests-0123456789";
process.env.APP_PASSWORD_HASH = hashPassword("not-a-real-production-password");
test("mot de passe haché et absence de session forgée", () => {
  assert.ok(verifyPassword("not-a-real-production-password"));
  assert.equal(verifyPassword("incorrect"), false);
  const now = Date.now(),
    session = createSession(now);
  assert.ok(validSession(session, now));
  assert.equal(validSession(session, now + 8 * 86400000), false);
  assert.equal(validSession(session + "x", now), false);
  assert.equal(validSession("123.a.b", now), false);
});
test("rotation du mot de passe invalide les sessions", () => {
  const session = createSession();
  const old = process.env.APP_PASSWORD_HASH;
  process.env.APP_PASSWORD_HASH = hashPassword("different-test-password");
  assert.equal(validSession(session), false);
  process.env.APP_PASSWORD_HASH = old;
});
test("mutations uniquement depuis origine autorisée", () => {
  assert.ok(
    sameOrigin(
      new Request("https://jobwatch.example/api/jobs", {
        headers: { origin: "https://jobwatch.example" },
      }),
    ),
  );
  assert.equal(
    sameOrigin(
      new Request("https://jobwatch.example/api/jobs", {
        headers: { origin: "https://evil.example" },
      }),
    ),
    false,
  );
  assert.equal(
    sameOrigin(new Request("https://jobwatch.example/api/jobs")),
    false,
  );
});
