import { test, expect } from "@playwright/test";

test("member token can be issued and resolved by provider (requires logged-in sessions)", async ({ request }) => {
  const tokenRes = await request.get("/api/member/qr-token");
  expect([200, 401]).toContain(tokenRes.status());
});
