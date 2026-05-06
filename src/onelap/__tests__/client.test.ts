import { describe, it, expect, vi, beforeEach } from "vitest";
import { OnelapClient } from "../client.js";

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
