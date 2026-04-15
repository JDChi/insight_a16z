import config from "../../playwright.config";

describe("playwright config", () => {
  it("does not inject removed admin test env vars", () => {
    expect(config.webServer?.command).not.toContain("TEST_ADMIN_EMAIL");
    expect(config.webServer?.command).toContain("PUBLIC_DATA_MODE=fixtures");
  });
});
