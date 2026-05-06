import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OnelapClient } from "../client.js";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

  it("sends correct headers and body, stores auth state on success", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            token: "test-xsrf-token",
            refresh_token: "test-otoken",
            userinfo: { uid: 12345 },
          },
        ],
      }),
    };

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(mockResponse as Response);

    const client = new OnelapClient();
    await client.login("testuser", "testpass");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://www.onelap.cn/api/login");
    expect(options?.method).toBe("POST");
    expect(options?.headers).toHaveProperty("Content-Type", "application/json");
    expect(options?.headers).toHaveProperty("nonce");
    expect(options?.headers).toHaveProperty("timestamp");
    expect(options?.headers).toHaveProperty("sign");

    const body = JSON.parse(options?.body as string);
    expect(body.account).toBe("testuser");
    expect(body.password).toHaveLength(32); // MD5 hex
  });

  it("throws on non-OK HTTP response", async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "Invalid credentials",
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as Response);

    const client = new OnelapClient();
    await expect(client.login("user", "pass")).rejects.toThrow("401");
  });

  it("throws if response data is empty", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as Response);

    const client = new OnelapClient();
    await expect(client.login("user", "pass")).rejects.toThrow(
      "no data"
    );
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
      client.downloadFit("https://example.com/file.fit", "/tmp/test.fit")
    ).rejects.toThrow("Not logged in");
  });
});

describe("OnelapClient.getActivities", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns activity list from API", async () => {
    const client = await (async () => {
      const c = new OnelapClient();
      const mockLogin = {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              token: "xsrf",
              refresh_token: "otoken",
              userinfo: { uid: 123 },
            },
          ],
        }),
      };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockLogin as Response
      );
      await c.login("user", "pass");
      return c;
    })();

    const mockActivities = {
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            _id: "act-1",
            id: 123,
            fileKey: "key1",
            date: "2026-05-06 10:30",
            durl: "https://example.com/1.fit",
          },
          {
            _id: "act-2",
            id: 123,
            fileKey: "key2",
            date: "2026-05-05 08:00",
            durl: "https://example.com/2.fit",
          },
        ],
      }),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockActivities as Response
    );

    const activities = await client.getActivities();
    expect(activities).toHaveLength(2);
    expect(activities[0]._id).toBe("act-1");
    expect(activities[1].date).toBe("2026-05-05 08:00");

    // Verify cookie header was sent
    const lastCall = vi.mocked(globalThis.fetch).mock.calls.at(-1)!;
    expect(lastCall[0]).toBe("https://u.onelap.cn/analysis/list");
    const headers = lastCall[1]?.headers as Record<string, string>;
    expect(headers["Cookie"]).toContain("ouid=123");
    expect(headers["Cookie"]).toContain("XSRF-TOKEN=xsrf");
    expect(headers["Cookie"]).toContain("OTOKEN=otoken");
  });
});

describe("OnelapClient.getTodayActivities", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("filters activities to last 24 hours", async () => {
    const client = await (async () => {
      const c = new OnelapClient();
      const mockLogin = {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              token: "xsrf",
              refresh_token: "otoken",
              userinfo: { uid: 123 },
            },
          ],
        }),
      };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockLogin as Response
      );
      await c.login("user", "pass");
      return c;
    })();

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const mockActivities = {
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            _id: "today-1",
            id: 123,
            fileKey: "k1",
            date: `${today} 10:30`,
            durl: "https://example.com/1.fit",
          },
          {
            _id: "yesterday-1",
            id: 123,
            fileKey: "k2",
            date: `${yesterday} 08:00`,
            durl: "https://example.com/2.fit",
          },
          {
            _id: "old-1",
            id: 123,
            fileKey: "k3",
            date: `${twoDaysAgo} 14:00`,
            durl: "https://example.com/3.fit",
          },
        ],
      }),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockActivities as Response
    );

    const activities = await client.getTodayActivities();
    expect(activities).toHaveLength(2);
    expect(activities.map((a) => a._id)).toEqual(["today-1", "yesterday-1"]);
  });
});

describe("OnelapClient.getActivityDetail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches detail for a specific activity", async () => {
    const client = await (async () => {
      const c = new OnelapClient();
      const mockLogin = {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              token: "xsrf",
              refresh_token: "otoken",
              userinfo: { uid: 123 },
            },
          ],
        }),
      };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockLogin as Response
      );
      await c.login("user", "pass");
      return c;
    })();

    const mockDetail = {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          _id: "act-123",
          duration: 3600,
          distance: 25000,
          avgPower: 200,
        },
      }),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockDetail as Response
    );

    const detail = await client.getActivityDetail("act-123");
    expect(detail._id).toBe("act-123");
    expect(detail.duration).toBe(3600);

    const lastCall = vi.mocked(globalThis.fetch).mock.calls.at(-1)!;
    expect(lastCall[0]).toBe("https://u.onelap.cn/analysis/detail/act-123");
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

  it("downloads file to specified path", async () => {
    const client = await (async () => {
      const c = new OnelapClient();
      const mockLogin = {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              token: "xsrf",
              refresh_token: "otoken",
              userinfo: { uid: 123 },
            },
          ],
        }),
      };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockLogin as Response
      );
      await c.login("user", "pass");
      return c;
    })();

    const fitContent = new Uint8Array([0x2e, 0x46, 0x49, 0x54]); // ".FIT"
    const mockDownload = {
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(fitContent);
          controller.close();
        },
      }),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockDownload as Response
    );

    const destPath = join(tempDir, "test.fit");
    await client.downloadFit("https://example.com/file.fit", destPath);

    expect(existsSync(destPath)).toBe(true);
    const content = readFileSync(destPath);
    expect(new Uint8Array(content)).toEqual(fitContent);
  });

  it("throws on non-OK response", async () => {
    const client = await (async () => {
      const c = new OnelapClient();
      const mockLogin = {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              token: "xsrf",
              refresh_token: "otoken",
              userinfo: { uid: 123 },
            },
          ],
        }),
      };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockLogin as Response
      );
      await c.login("user", "pass");
      return c;
    })();

    const mockFail = {
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => "File not found",
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockFail as Response
    );

    const destPath = join(tempDir, "fail.fit");
    await expect(
      client.downloadFit("https://example.com/missing.fit", destPath)
    ).rejects.toThrow("404");
  });
});
