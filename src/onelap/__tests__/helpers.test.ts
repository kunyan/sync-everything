import { describe, it, expect } from "vitest";
import { md5Hex, buildSignature, randomHex } from "../client.js";

describe("md5Hex", () => {
  it("hashes empty string", () => {
    expect(md5Hex("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
  });

  it("hashes a known value", () => {
    expect(md5Hex("password123")).toBe("482c811da5d5b4bc6d497ffa98491e38");
  });
});

describe("randomHex", () => {
  it("returns string of requested length", () => {
    const result = randomHex(16);
    expect(result).toHaveLength(16);
  });

  it("only contains hex characters", () => {
    const result = randomHex(32);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });
});

describe("buildSignature", () => {
  it("produces correct signature for known inputs", () => {
    const sign = buildSignature({
      account: "testuser",
      passwordMd5: "482c811da5d5b4bc6d497ffa98491e38",
      nonce: "abcdef1234567890",
      timestamp: "1700000000",
    });
    const expected = md5Hex(
      "account=testuser&nonce=abcdef1234567890&password=482c811da5d5b4bc6d497ffa98491e38&timestamp=1700000000&key=REDACTED_USE_ENV_VAR"
    );
    expect(sign).toBe(expected);
  });
});
