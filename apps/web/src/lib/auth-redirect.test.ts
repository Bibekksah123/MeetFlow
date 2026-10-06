import { describe, expect, it } from "vitest";

import { getAuthDestination } from "./auth-redirect";

describe("auth callback destinations", () => {
  it("allows the dashboard and password update destinations", () => {
    expect(getAuthDestination("/dashboard")).toBe("/dashboard");
    expect(getAuthDestination("/forgot-password?mode=update")).toBe(
      "/forgot-password?mode=update",
    );
  });

  it.each([null, "", "https://example.com", "//example.com", "/settings", "/forgot-password?mode=update&next=/settings"])(
    "falls back to the dashboard for an unapproved destination: %s",
    (destination) => {
      expect(getAuthDestination(destination)).toBe("/dashboard");
    },
  );
});
