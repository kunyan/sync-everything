import { readFile } from "node:fs/promises";
import type {
  StravaClientOptions,
  SummaryActivity,
  TokenData,
  TokenResponse,
  Upload,
} from "./types.js";

const STRAVA_API_BASE = "https://www.strava.com/api/v3";
const STRAVA_OAUTH_URL = "https://www.strava.com/oauth/token";

export class StravaClient {
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private accessToken: string | null;
  private expiresAt: number;
  private timeout: number;
  private onTokenRefresh?: (tokens: TokenData) => void;

  constructor(options: StravaClientOptions) {
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.refreshToken = options.refreshToken;
    this.accessToken = options.accessToken ?? null;
    this.expiresAt = options.expiresAt ?? 0;
    this.timeout = options.timeout ?? 30_000;
    this.onTokenRefresh = options.onTokenRefresh;
  }

  private async ensureValidToken(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    if (this.accessToken && this.expiresAt > now + 60) {
      return;
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
    });

    const response = await fetch(STRAVA_OAUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Token refresh failed (${response.status}): ${text}`
      );
    }

    const data: TokenResponse = await response.json();
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.expiresAt = data.expires_at;

    this.onTokenRefresh?.({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
    });
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.accessToken}` };
  }

  async getActivities(params?: {
    before?: number;
    after?: number;
    page?: number;
    perPage?: number;
  }): Promise<SummaryActivity[]> {
    await this.ensureValidToken();

    const query = new URLSearchParams();
    if (params?.before) query.set("before", params.before.toString());
    if (params?.after) query.set("after", params.after.toString());
    if (params?.page) query.set("page", params.page.toString());
    if (params?.perPage) query.set("per_page", params.perPage.toString());

    const qs = query.toString();
    const url = `${STRAVA_API_BASE}/athlete/activities${qs ? `?${qs}` : ""}`;

    const response = await fetch(url, {
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to get activities (${response.status}): ${text}`
      );
    }

    return response.json();
  }

  async uploadFit(
    filePath: string,
    options?: {
      name?: string;
      description?: string;
      sportType?: string;
      externalId?: string;
    }
  ): Promise<Upload> {
    await this.ensureValidToken();

    const fileBuffer = await readFile(filePath);
    const form = new FormData();
    form.append("file", new Blob([fileBuffer]), filePath.split("/").pop()!);
    form.append("data_type", "fit");
    if (options?.name) form.append("name", options.name);
    if (options?.description) form.append("description", options.description);
    if (options?.sportType) form.append("sport_type", options.sportType);
    if (options?.externalId) form.append("external_id", options.externalId);

    const response = await fetch(`${STRAVA_API_BASE}/uploads`, {
      method: "POST",
      headers: this.authHeaders(),
      body: form,
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to upload FIT file (${response.status}): ${text}`
      );
    }

    return response.json();
  }

  async getUploadStatus(uploadId: string): Promise<Upload> {
    await this.ensureValidToken();

    const response = await fetch(
      `${STRAVA_API_BASE}/uploads/${uploadId}`,
      {
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(this.timeout),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to get upload status (${response.status}): ${text}`
      );
    }

    return response.json();
  }
}
