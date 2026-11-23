import { describe, expect, it } from "vitest";
import { originFromHost } from "./request-origin";

describe("originFromHost", () => {
  it("keeps the user on the host they are on, for each host the app is served on", () => {
    expect(originFromHost("madgigz.app", "https")).toBe("https://madgigz.app");
    expect(originFromHost("www.madgigz.app", "https")).toBe("https://www.madgigz.app");
    expect(originFromHost("madgigz.aurasonic.es", "https")).toBe("https://madgigz.aurasonic.es");
    expect(originFromHost("madgigz-app-git-staging-aura-sonic.vercel.app", "https")).toBe(
      "https://madgigz-app-git-staging-aura-sonic.vercel.app"
    );
  });

  it("is always https on a public host, whatever the proxy says", () => {
    expect(originFromHost("madgigz.app", "http")).toBe("https://madgigz.app");
    expect(originFromHost("madgigz.app", null)).toBe("https://madgigz.app");
  });

  it("is http on localhost unless the dev server is actually https", () => {
    expect(originFromHost("localhost:3000", null)).toBe("http://localhost:3000");
    expect(originFromHost("127.0.0.1:3001", null)).toBe("http://127.0.0.1:3001");
    expect(originFromHost("localhost:3000", "https")).toBe("https://localhost:3000");
  });

  it("normalises case and whitespace", () => {
    expect(originFromHost("  MadGigz.App ", "https")).toBe("https://madgigz.app");
  });

  it("refuses a host the app is not served on, so a return URL can never point elsewhere", () => {
    expect(originFromHost("evil.com", "https")).toBeNull();
    expect(originFromHost("madgigz.app.evil.com", "https")).toBeNull();
    expect(originFromHost("notmadgigz.app", "https")).toBeNull();
    expect(originFromHost("aurasonic.es.evil.com", "https")).toBeNull();
    expect(originFromHost("localhost.evil.com", "https")).toBeNull();
    expect(originFromHost("", "https")).toBeNull();
    expect(originFromHost(null, "https")).toBeNull();
  });
});
