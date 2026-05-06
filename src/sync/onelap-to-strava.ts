import { join } from "node:path";
import type {
  SyncOptions,
  SyncResult,
  SyncedActivity,
  SkippedActivity,
  FailedActivity,
} from "./types.js";

function parseOnelapTime(timeStr: string): number {
  const isoWithTz = timeStr.replace(" ", "T") + "+08:00";
  return Math.floor(new Date(isoWithTz).getTime() / 1000);
}

function parseStravaTime(timeStr: string): number {
  return Math.floor(new Date(timeStr).getTime() / 1000);
}

function isTimeMatch(
  onelapTime: string,
  stravaTime: string,
  thresholdSeconds = 300
): boolean {
  const t1 = parseOnelapTime(onelapTime);
  const t2 = parseStravaTime(stravaTime);
  return Math.abs(t1 - t2) <= thresholdSeconds;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function syncOnelapToStrava(
  options: SyncOptions
): Promise<SyncResult> {
  const {
    onelapClient,
    stravaClient,
    days = 7,
    downloadDir = "./downloads",
    dryRun = false,
    _pollIntervalMs = 2000,
  } = options;

  const synced: SyncedActivity[] = [];
  const skipped: SkippedActivity[] = [];
  const failed: FailedActivity[] = [];

  const allOnelapActivities = await onelapClient.getActivities();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffTimestamp = Math.floor(cutoff.getTime() / 1000);

  const recentOnelap = allOnelapActivities.filter((a) => {
    if (!a.start_riding_time) return false;
    return parseOnelapTime(a.start_riding_time) >= cutoffTimestamp;
  });

  const stravaActivities = await stravaClient.getActivities({
    after: cutoffTimestamp,
    perPage: 100,
  });

  for (const activity of recentOnelap) {
    const onelapId = activity.id;

    const alreadyOnStrava = stravaActivities.some((sa) =>
      isTimeMatch(activity.start_riding_time, sa.start_date)
    );

    if (alreadyOnStrava) {
      skipped.push({ onelapId, reason: "already on Strava" });
      continue;
    }

    if (dryRun) {
      skipped.push({ onelapId, reason: "dry run" });
      continue;
    }

    try {
      const detail = await onelapClient.getActivityDetail(onelapId);

      if (!detail.fitUrl) {
        skipped.push({ onelapId, reason: "no FIT file" });
        continue;
      }

      const fitPath = join(downloadDir, `${onelapId}.fit`);
      await onelapClient.downloadFit(detail.fitUrl, fitPath);

      const upload = await stravaClient.uploadFit(fitPath, {
        externalId: onelapId,
      });

      if (upload.error) {
        failed.push({ onelapId, error: upload.error });
        continue;
      }

      let finalUpload = upload;
      for (let i = 0; i < 10; i++) {
        if (_pollIntervalMs > 0) {
          await sleep(_pollIntervalMs);
        }
        finalUpload = await stravaClient.getUploadStatus(upload.id_str);
        if (finalUpload.error) {
          break;
        }
        if (finalUpload.activity_id) {
          break;
        }
      }

      if (finalUpload.error) {
        failed.push({ onelapId, error: finalUpload.error });
      } else {
        synced.push({
          onelapId,
          stravaUploadId: finalUpload.id_str,
          name: activity.start_riding_time,
        });
      }
    } catch (err) {
      failed.push({
        onelapId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { synced, skipped, failed };
}
