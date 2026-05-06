import type { OnelapClient } from "../onelap/index.js";
import type { StravaClient } from "../strava/index.js";

export interface SyncOptions {
  onelapClient: OnelapClient;
  stravaClient: StravaClient;
  days?: number;
  downloadDir?: string;
  dryRun?: boolean;
  _pollIntervalMs?: number;
}

export interface SyncedActivity {
  onelapId: string;
  stravaUploadId: string;
  name: string;
}

export interface SkippedActivity {
  onelapId: string;
  reason: string;
}

export interface FailedActivity {
  onelapId: string;
  error: string;
}

export interface SyncResult {
  synced: SyncedActivity[];
  skipped: SkippedActivity[];
  failed: FailedActivity[];
}
