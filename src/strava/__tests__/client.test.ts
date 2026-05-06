import { describe, it, expect, vi, beforeEach } from "vitest";
import { StravaClient } from "../client.js";

function mockTokenRefreshResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      token_type: "Bearer",
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 21600,
      expires_in: 21600,
    }),
  };
}

function mockActivitiesResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ([]),
  };
}

describe("StravaClient token refresh", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("refreshes token automatically when no accessToken provided", async () => {
    const onTokenRefresh = vi.fn();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockTokenRefreshResponse() as Response)
      .mockResolvedValueOnce(mockActivitiesResponse() as Response);

    const client = new StravaClient({
      clientId: "123",
      clientSecret: "secret",
      refreshToken: "refresh-tok",
      onTokenRefresh,
    });

    await client.getActivities();

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const [refreshUrl, refreshOpts] = fetchSpy.mock.calls[0];
    expect(refreshUrl).toBe("https://www.strava.com/oauth/token");
    expect(refreshOpts?.method).toBe("POST");
    const body = new URLSearchParams(refreshOpts?.body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("client_id")).toBe("123");
    expect(body.get("client_secret")).toBe("secret");
    expect(body.get("refresh_token")).toBe("refresh-tok");

    expect(onTokenRefresh).toHaveBeenCalledOnce();
    expect(onTokenRefresh).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
      })
    );
  });

  it("skips refresh when accessToken is valid and not expired", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockActivitiesResponse() as Response);

    const client = new StravaClient({
      clientId: "123",
      clientSecret: "secret",
      refreshToken: "refresh-tok",
      accessToken: "valid-token",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    await client.getActivities();

    expect(fetchSpy).toHaveBeenCalledOnce();
    const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer valid-token");
  });

  it("refreshes when accessToken is expired", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockTokenRefreshResponse() as Response)
      .mockResolvedValueOnce(mockActivitiesResponse() as Response);

    const client = new StravaClient({
      clientId: "123",
      clientSecret: "secret",
      refreshToken: "refresh-tok",
      accessToken: "expired-token",
      expiresAt: Math.floor(Date.now() / 1000) - 100,
    });

    await client.getActivities();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0]).toBe("https://www.strava.com/oauth/token");
  });

  it("throws on token refresh failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Invalid refresh token",
    } as Response);

    const client = new StravaClient({
      clientId: "123",
      clientSecret: "secret",
      refreshToken: "bad-token",
    });

    await expect(client.getActivities()).rejects.toThrow("Token refresh failed");
  });
});
