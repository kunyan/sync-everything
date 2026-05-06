import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OnelapClient } from "../client.js";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function mockLoginResponses() {
  const loginResponse = {
    ok: true,
    status: 200,
    json: async () => ({
      data: [
        {
          token: "test-xsrf-token",
          refresh_token: "test-refresh-token",
          userinfo: { uid: 12345 },
        },
      ],
    }),
  };

  const tokenResponse = {
    ok: true,
    status: 200,
    json: async () => ({
      code: 200,
      error: "",
      data: { token: "test-session-token", uid: 12345 },
    }),
  };

  return [loginResponse, tokenResponse];
}

async function createLoggedInClient(): Promise<OnelapClient> {
  const [loginResp, tokenResp] = mockLoginResponses();
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(loginResp as Response)
    .mockResolvedValueOnce(tokenResp as Response);

  const client = new OnelapClient();
  await client.login("testuser", "testpass");
  return client;
}

describe("OnelapClient.login", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws if username is empty", async () => {
    const client = new OnelapClient();
    await expect(client.login("", "password")).rejects.toThrow(
      "username and password cannot be empty"
    );
  });

  it("throws if password is empty", async () => {
    const client = new OnelapClient();
    await expect(client.login("user", "")).rejects.toThrow(
      "username and password cannot be empty"
    );
  });

  it("performs two-step auth: login then token exchange", async () => {
    const [loginResp, tokenResp] = mockLoginResponses();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(loginResp as Response)
      .mockResolvedValueOnce(tokenResp as Response);

    const client = new OnelapClient();
    await client.login("testuser", "testpass");

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const [loginUrl, loginOpts] = fetchSpy.mock.calls[0];
    expect(loginUrl).toBe("https://www.onelap.cn/api/login");
    expect(loginOpts?.method).toBe("POST");
    expect(loginOpts?.headers).toHaveProperty("nonce");
    expect(loginOpts?.headers).toHaveProperty("timestamp");
    expect(loginOpts?.headers).toHaveProperty("sign");
    const loginBody = JSON.parse(loginOpts?.body as string);
    expect(loginBody.account).toBe("testuser");
    expect(loginBody.password).toHaveLength(32);

    const [tokenUrl, tokenOpts] = fetchSpy.mock.calls[1];
    expect(tokenUrl).toBe("https://otm.onelap.cn/api/token");
    expect(tokenOpts?.method).toBe("POST");
    const tokenBody = JSON.parse(tokenOpts?.body as string);
    expect(tokenBody.token).toBe("test-refresh-token");
    expect(tokenBody.from).toBe("web");
    expect(tokenBody.to).toBe("web");
  });

  it("throws on non-OK login response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Invalid credentials",
    } as Response);

    const client = new OnelapClient();
    await expect(client.login("user", "pass")).rejects.toThrow("401");
  });

  it("throws if login response data is empty", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    } as Response);

    const client = new OnelapClient();
    await expect(client.login("user", "pass")).rejects.toThrow("no data");
  });
});

describe("OnelapClient auth guard", () => {
  it("getActivities throws if not logged in", async () => {
    const client = new OnelapClient();
    await expect(client.getActivities()).rejects.toThrow("Not logged in");
  });

  it("getActivityDetail throws if not logged in", async () => {
    const client = new OnelapClient();
    await expect(client.getActivityDetail("abc")).rejects.toThrow(
      "Not logged in"
    );
  });

  it("downloadFit throws if not logged in", async () => {
    const client = new OnelapClient();
    await expect(
      client.downloadFit("geo/some/file.fit", "/tmp/test.fit")
    ).rejects.toThrow("Not logged in");
  });
});

describe("OnelapClient.getActivities", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends POST with Bearer auth and returns activity list", async () => {
    const client = await createLoggedInClient();

    const mockActivities = {
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        message: "success",
        data: {
          list: [
            {
              id: "act-1",
              start_riding_time: "2026-05-06 10:30",
              distance_km: 25.5,
              time_formatted: "01:02:03",
              avg_power_w: 200,
            },
            {
              id: "act-2",
              start_riding_time: "2026-05-05 08:00",
              distance_km: 30.0,
              time_formatted: "01:15:00",
              avg_power_w: 180,
            },
          ],
          pagination: { total: 2, current_page: 1 },
        },
      }),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockActivities as Response
    );

    const activities = await client.getActivities();
    expect(activities).toHaveLength(2);
    expect(activities[0].id).toBe("act-1");
    expect(activities[1].distance_km).toBe(30.0);

    const lastCall = vi.mocked(globalThis.fetch).mock.calls.at(-1)!;
    expect(lastCall[0]).toBe(
      "https://otm.onelap.cn/api/otm/ride_record/list"
    );
    expect(lastCall[1]?.method).toBe("POST");
    const headers = lastCall[1]?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-session-token");
  });
});

describe("OnelapClient.getTodayActivities", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("filters activities to today and yesterday by start_riding_time", async () => {
    const client = await createLoggedInClient();

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        data: {
          list: [
            { id: "today-1", start_riding_time: `${today} 10:30` },
            { id: "yesterday-1", start_riding_time: `${yesterday} 08:00` },
            { id: "old-1", start_riding_time: `${twoDaysAgo} 14:00` },
          ],
          pagination: { total: 3 },
        },
      }),
    } as Response);

    const activities = await client.getTodayActivities();
    expect(activities).toHaveLength(2);
    expect(activities.map((a) => a.id)).toEqual(["today-1", "yesterday-1"]);
  });
});

describe("OnelapClient.getActivityDetail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches detail with Bearer auth from correct URL", async () => {
    const client = await createLoggedInClient();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        data: {
          ridingRecord: {
            _id: "act-123",
            id: 456,
            date: "2026-05-06",
            totalDistance: 25000,
            totalTime: 3600,
            avgPower: 200,
            TSS: 85,
            fitUrl: "geo/20260506/test.fit",
          },
        },
      }),
    } as Response);

    const detail = await client.getActivityDetail("act-123");
    expect(detail._id).toBe("act-123");
    expect(detail.avgPower).toBe(200);
    expect(detail.fitUrl).toBe("geo/20260506/test.fit");

    const lastCall = vi.mocked(globalThis.fetch).mock.calls.at(-1)!;
    expect(lastCall[0]).toBe(
      "https://otm.onelap.cn/api/otm/ride_record/analysis/act-123"
    );
    const headers = lastCall[1]?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-session-token");
  });
});

describe("OnelapClient.downloadFit", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.restoreAllMocks();
    tempDir = mkdtempSync(join(tmpdir(), "onelap-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("base64-encodes fitUrl and downloads to specified path", async () => {
    const client = await createLoggedInClient();

    const fitContent = new Uint8Array([0x2e, 0x46, 0x49, 0x54]);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(fitContent);
          controller.close();
        },
      }),
    } as Response);

    const fitUrl = "geo/20260506/test.fit";
    const destPath = join(tempDir, "test.fit");
    await client.downloadFit(fitUrl, destPath);

    expect(existsSync(destPath)).toBe(true);
    const content = readFileSync(destPath);
    expect(new Uint8Array(content)).toEqual(fitContent);

    const lastCall = vi.mocked(globalThis.fetch).mock.calls.at(-1)!;
    const expectedBase64 = Buffer.from(fitUrl).toString("base64");
    expect(lastCall[0]).toBe(
      `https://otm.onelap.cn/api/otm/ride_record/analysis/fit_content/${expectedBase64}`
    );
  });

  it("throws on non-OK response", async () => {
    const client = await createLoggedInClient();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "File not found",
    } as Response);

    const destPath = join(tempDir, "fail.fit");
    await expect(
      client.downloadFit("geo/missing.fit", destPath)
    ).rejects.toThrow("404");
  });
});
