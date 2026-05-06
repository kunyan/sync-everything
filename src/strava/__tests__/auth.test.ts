import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "node:http";

describe("exchangeCodeForTokens", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts authorization code and returns tokens", async () => {
    const { exchangeCodeForTokens } = await import("../auth.js");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        token_type: "Bearer",
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_at: 1714953600,
        expires_in: 21600,
        athlete: { id: 123, firstname: "Test", lastname: "User" },
      }),
    } as Response);

    const result = await exchangeCodeForTokens({
      clientId: "test-id",
      clientSecret: "test-secret",
      code: "auth-code-123",
    });

    expect(result.accessToken).toBe("test-access-token");
    expect(result.refreshToken).toBe("test-refresh-token");
    expect(result.expiresAt).toBe(1714953600);
    expect(result.athlete.id).toBe(123);
    expect(result.athlete.firstname).toBe("Test");

    const [url, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toBe("https://www.strava.com/oauth/token");
    expect(opts?.method).toBe("POST");
    const body = new URLSearchParams(opts?.body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("auth-code-123");
  });

  it("throws on failed exchange", async () => {
    const { exchangeCodeForTokens } = await import("../auth.js");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "Bad Request",
    } as Response);

    await expect(
      exchangeCodeForTokens({
        clientId: "id",
        clientSecret: "secret",
        code: "bad",
      })
    ).rejects.toThrow("400");
  });
});

describe("authorizeStrava", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("starts server, handles callback, exchanges code, shuts down", async () => {
    const { authorizeStrava } = await import("../auth.js");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        token_type: "Bearer",
        access_token: "access-tok",
        refresh_token: "refresh-tok",
        expires_at: 1714953600,
        expires_in: 21600,
        athlete: { id: 1, firstname: "A", lastname: "B" },
      }),
    } as Response);

    let serverPort = 0;
    const resultPromise = authorizeStrava({
      clientId: "cid",
      clientSecret: "csec",
      port: 0,
      openBrowser: false,
      _onServerReady: (port: number) => {
        serverPort = port;
      },
    });

    await new Promise((r) => setTimeout(r, 100));

    const callbackUrl = `http://localhost:${serverPort}/callback?code=test-code&scope=activity:read_all,activity:write`;

    // Use http.get instead of fetch to avoid mock conflicts
    await new Promise<void>((resolve) => {
      get(callbackUrl, (res) => {
        res.resume();
        res.on("end", () => resolve());
      });
    });

    const result = await resultPromise;
    expect(result.accessToken).toBe("access-tok");
    expect(result.refreshToken).toBe("refresh-tok");
    expect(result.athlete.id).toBe(1);
  });

  it("rejects when user denies authorization", async () => {
    const { authorizeStrava } = await import("../auth.js");

    let serverPort = 0;
    const resultPromise = authorizeStrava({
      clientId: "cid",
      clientSecret: "csec",
      port: 0,
      openBrowser: false,
      _onServerReady: (port: number) => {
        serverPort = port;
      },
    });

    await new Promise((r) => setTimeout(r, 100));

    const callbackUrl = `http://localhost:${serverPort}/callback?error=access_denied`;

    // Make the callback request and expect rejection to happen
    const callbackPromise = new Promise<void>((resolve) => {
      get(callbackUrl, (res) => {
        res.resume();
        res.on("end", () => resolve());
      });
    });

    // Both should complete: the callback and the rejection
    await Promise.all([
      callbackPromise,
      expect(resultPromise).rejects.toThrow("access_denied"),
    ]);
  });
});
