import { test, expect } from "@playwright/test";

test("health endpoint is reachable", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body).toEqual({ ok: true });
});
