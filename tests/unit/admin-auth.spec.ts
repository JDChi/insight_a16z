import { getAdminEmail, isAdminRequest } from "../../apps/web/src/lib/admin-auth";

describe("admin auth helpers", () => {
  it("detects Cloudflare Access and test headers", () => {
    const headers = new Headers({
      "x-test-admin-email": "admin@local.test"
    });

    expect(isAdminRequest(headers)).toBe(true);
    expect(getAdminEmail(headers)).toBe("admin@local.test");
  });

  it("rejects requests without admin headers", () => {
    expect(isAdminRequest(new Headers())).toBe(false);
  });
});
