import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StravaClient } from "../client.js";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

function createClientWithValidToken() {
  return new StravaClient({
    clientId: "123",
    clientSecret: "secret",
    refreshToken: "refresh-tok",
    accessToken: "valid-token",
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  });
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

describe("StravaClient.getActivities", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches activities with Bearer auth", async () => {
    const client = createClientWithValidToken();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: 12345,
          name: "Morning Ride",
          sport_type: "Ride",
          start_date: "2026-05-06T08:00:00Z",
          start_date_local: "2026-05-06T16:00:00Z",
          distance: 37000,
          moving_time: 5131,
          elapsed_time: 5500,
          total_elevation_gain: 200,
          average_watts: 137,
        },
      ],
    } as Response);

    const activities = await client.getActivities();
    expect(activities).toHaveLength(1);
    expect(activities[0].id).toBe(12345);
    expect(activities[0].name).toBe("Morning Ride");
    expect(activities[0].distance).toBe(37000);

    const [url, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toBe("https://www.strava.com/api/v3/athlete/activities");
    const headers = opts?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer valid-token");
  });

  it("passes query parameters correctly", async () => {
    const client = createClientWithValidToken();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    } as Response);

    await client.getActivities({
      before: 1714953600,
      after: 1714867200,
      page: 2,
      perPage: 10,
    });

    const [url] = vi.mocked(globalThis.fetch).mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get("before")).toBe("1714953600");
    expect(parsed.searchParams.get("after")).toBe("1714867200");
    expect(parsed.searchParams.get("page")).toBe("2");
    expect(parsed.searchParams.get("per_page")).toBe("10");
  });

  it("throws on non-OK response", async () => {
    const client = createClientWithValidToken();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    } as Response);

    await expect(client.getActivities()).rejects.toThrow("401");
  });
});

describe("StravaClient.uploadFit", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.restoreAllMocks();
    tempDir = mkdtempSync(join(tmpdir(), "strava-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("uploads FIT file with multipart form data", async () => {
    const client = createClientWithValidToken();

    const fitPath = join(tempDir, "test.fit");
    writeFileSync(fitPath, new Uint8Array([0x2e, 0x46, 0x49, 0x54]));

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        id: 999,
        id_str: "999",
        external_id: null,
        error: null,
        status: "Your activity is still being processed.",
        activity_id: null,
      }),
    } as Response);

    const upload = await client.uploadFit(fitPath, {
      name: "Morning Ride",
      sportType: "Ride",
    });

    expect(upload.id).toBe(999);
    expect(upload.status).toContain("processed");

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://www.strava.com/api/v3/uploads");
    expect(opts?.method).toBe("POST");
    const headers = opts?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer valid-token");

    const body = opts?.body as FormData;
    expect(body.get("data_type")).toBe("fit");
    expect(body.get("name")).toBe("Morning Ride");
    expect(body.get("sport_type")).toBe("Ride");
    expect(body.get("file")).toBeInstanceOf(Blob);
  });

  it("throws on non-OK response", async () => {
    const client = createClientWithValidToken();

    const fitPath = join(tempDir, "test.fit");
    writeFileSync(fitPath, new Uint8Array([0x2e, 0x46, 0x49, 0x54]));

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "Bad Request: duplicate activity",
    } as Response);

    await expect(client.uploadFit(fitPath)).rejects.toThrow("400");
  });
});

describe("StravaClient.getUploadStatus", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches upload status by id", async () => {
    const client = createClientWithValidToken();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: 999,
        id_str: "999",
        external_id: "test-ext",
        error: null,
        status: "Your activity is ready.",
        activity_id: 12345,
      }),
    } as Response);

    const status = await client.getUploadStatus("999");
    expect(status.id).toBe(999);
    expect(status.activity_id).toBe(12345);
    expect(status.error).toBeNull();

    const [url] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toBe("https://www.strava.com/api/v3/uploads/999");
  });

  it("throws on non-OK response", async () => {
    const client = createClientWithValidToken();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "Not found",
    } as Response);

    await expect(client.getUploadStatus("bad-id")).rejects.toThrow("404");
  });
});
