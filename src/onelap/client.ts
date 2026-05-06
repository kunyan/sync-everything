import { createHash, randomBytes } from "node:crypto";
import type {
  Activity,
  ActivityDetail,
  ActivityListResponse,
  LoginResponse,
  OnelapClientOptions,
} from "./types.js";

const ONELAP_SECRET = "REDACTED_USE_ENV_VAR";
const LOGIN_BASE_URL = "https://www.onelap.cn/api";
const ANALYSIS_BASE_URL = "https://u.onelap.cn/analysis";

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
}): string {
  const signStr = `account=${params.account}&nonce=${params.nonce}&password=${params.passwordMd5}&timestamp=${params.timestamp}&key=${ONELAP_SECRET}`;
  return md5Hex(signStr);
}

export class OnelapClient {
  private uid: string | null = null;
  private xsrfToken: string | null = null;
  private oToken: string | null = null;
  private timeout: number;

  constructor(options?: OnelapClientOptions) {
    this.timeout = options?.timeout ?? 30_000;
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
    });

    const response = await fetch(`${LOGIN_BASE_URL}/login`, {
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

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Login failed with status ${response.status}: ${body}`
      );
    }

    const result: LoginResponse = await response.json();

    if (!result.data || result.data.length === 0) {
      throw new Error("Invalid login response: no data");
    }

    const entry = result.data[0];
    this.uid = String(entry.userinfo.uid);
    this.xsrfToken = entry.token;
    this.oToken = entry.refresh_token;
  }

  private assertLoggedIn(): void {
    if (!this.uid || !this.xsrfToken || !this.oToken) {
      throw new Error("Not logged in. Call login() first.");
    }
  }

  private buildCookieHeader(): string {
    return `ouid=${this.uid}; XSRF-TOKEN=${this.xsrfToken}; OTOKEN=${this.oToken}`;
  }

  async getActivities(): Promise<Activity[]> {
    this.assertLoggedIn();

    const response = await fetch(`${ANALYSIS_BASE_URL}/list`, {
      headers: {
        Cookie: this.buildCookieHeader(),
      },
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Failed to get activities (${response.status}): ${body}`
      );
    }

    const result: ActivityListResponse = await response.json();
    return result.data;
  }

  async getTodayActivities(): Promise<Activity[]> {
    this.assertLoggedIn();
    throw new Error("Not implemented");
  }

  async getActivityDetail(activityId: string): Promise<ActivityDetail> {
    this.assertLoggedIn();
    throw new Error("Not implemented");
  }

  async downloadFit(downloadUrl: string, destPath: string): Promise<void> {
    this.assertLoggedIn();
    throw new Error("Not implemented");
  }
}
