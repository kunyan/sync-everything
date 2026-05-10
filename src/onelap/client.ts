import { createHash, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type {
  Activity,
  ActivityDetail,
  ActivityDetailResponse,
  ActivityListResponse,
  LoginResponse,
  OnelapClientOptions,
  TokenExchangeResponse,
} from "./types.js";

const LOGIN_BASE_URL = "https://www.onelap.cn/api";
const OTM_BASE_URL = "https://otm.onelap.cn/api";

export function md5Hex(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

export function randomHex(length: number): string {
  return randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length);
}

export function buildSignature(params: {
  account: string;
  passwordMd5: string;
  nonce: string;
  timestamp: string;
  secret: string;
}): string {
  const signStr = `account=${params.account}&nonce=${params.nonce}&password=${params.passwordMd5}&timestamp=${params.timestamp}&key=${params.secret}`;
  return md5Hex(signStr);
}

export class OnelapClient {
  private sessionToken: string | null = null;
  private secret: string;
  private timeout: number;

  constructor(options: OnelapClientOptions) {
    if (!options.secret) {
      throw new Error("secret is required");
    }
    this.secret = options.secret;
    this.timeout = options.timeout ?? 30_000;
  }

  async login(username: string, password: string): Promise<void> {
    if (!username || !password) {
      throw new Error("username and password cannot be empty");
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomHex(16);
    const passwordMd5 = md5Hex(password);
    const sign = buildSignature({
      account: username,
      passwordMd5,
      nonce,
      timestamp,
      secret: this.secret,
    });

    const loginResponse = await fetch(`${LOGIN_BASE_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        nonce,
        timestamp,
        sign,
      },
      body: JSON.stringify({ account: username, password: passwordMd5 }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!loginResponse.ok) {
      const body = await loginResponse.text();
      throw new Error(
        `Login failed with status ${loginResponse.status}: ${body}`
      );
    }

    const result: LoginResponse = await loginResponse.json();

    if (!result.data || result.data.length === 0) {
      throw new Error("Invalid login response: no data");
    }

    const refreshToken = result.data[0].refresh_token;

    const tokenResponse = await fetch(`${OTM_BASE_URL}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: refreshToken, from: "web", to: "web" }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      throw new Error(
        `Token exchange failed with status ${tokenResponse.status}: ${body}`
      );
    }

    const tokenResult: TokenExchangeResponse = await tokenResponse.json();

    if (tokenResult.code !== 200) {
      throw new Error(`Token exchange failed: ${tokenResult.error}`);
    }

    this.sessionToken = tokenResult.data.token;
  }

  private assertLoggedIn(): void {
    if (!this.sessionToken) {
      throw new Error("Not logged in. Call login() first.");
    }
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.sessionToken}` };
  }

  async getActivities(): Promise<Activity[]> {
    this.assertLoggedIn();

    const response = await fetch(`${OTM_BASE_URL}/otm/ride_record/list`, {
      method: "POST",
      headers: {
        ...this.authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Failed to get activities (${response.status}): ${body}`
      );
    }

    const result: ActivityListResponse = await response.json();
    return result.data.list;
  }

  async getTodayActivities(): Promise<Activity[]> {
    const all = await this.getActivities();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    return all.filter((activity) => {
      const dateStr = activity.start_riding_time?.slice(0, 10);
      if (!dateStr) return false;
      return dateStr === today || dateStr === yesterday;
    });
  }

  async getActivityDetail(activityId: string): Promise<ActivityDetail> {
    this.assertLoggedIn();

    const response = await fetch(
      `${OTM_BASE_URL}/otm/ride_record/analysis/${activityId}`,
      {
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(this.timeout),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Failed to get activity detail (${response.status}): ${body}`
      );
    }

    const result: ActivityDetailResponse = await response.json();
    return result.data.ridingRecord;
  }

  async downloadFit(fitUrl: string, destPath: string): Promise<void> {
    this.assertLoggedIn();

    const encoded = Buffer.from(fitUrl).toString("base64");
    const response = await fetch(
      `${OTM_BASE_URL}/otm/ride_record/analysis/fit_content/${encoded}`,
      {
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(this.timeout),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Failed to download FIT file (${response.status}): ${body}`
      );
    }

    if (!response.body) {
      throw new Error("Response body is null");
    }

    await mkdir(dirname(destPath), { recursive: true });
    const fileStream = createWriteStream(destPath);
    await pipeline(Readable.fromWeb(response.body as any), fileStream);
  }
}
