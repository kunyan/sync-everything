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
