import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncOnelapToStrava } from "../onelap-to-strava.js";
import type { OnelapClient } from "../../onelap/index.js";
import type { StravaClient } from "../../strava/index.js";

function createMockOnelapClient(overrides: Partial<OnelapClient> = {}) {
  return {
    login: vi.fn(),
    getActivities: vi.fn().mockResolvedValue([]),
    getTodayActivities: vi.fn().mockResolvedValue([]),
    getActivityDetail: vi.fn().mockResolvedValue({
      _id: "test",
      fitUrl: "geo/test.fit",
    }),
    downloadFit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as OnelapClient;
}

function createMockStravaClient(overrides: Partial<StravaClient> = {}) {
  return {
    getActivities: vi.fn().mockResolvedValue([]),
    uploadFit: vi.fn().mockResolvedValue({
      id: 999,
      id_str: "999",
      external_id: null,
      error: null,
      status: "Your activity is still being processed.",
      activity_id: null,
    }),
    getUploadStatus: vi.fn().mockResolvedValue({
      id: 999,
      id_str: "999",
      external_id: null,
      error: null,
      status: "Your activity is ready.",
      activity_id: 12345,
    }),
    ...overrides,
  } as unknown as StravaClient;
}

describe("syncOnelapToStrava", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("syncs new activities from Onelap to Strava", async () => {
    const onelapClient = createMockOnelapClient({
      getActivities: vi.fn().mockResolvedValue([
        {
          id: "onelap-1",
          start_riding_time: "2026-05-06 10:00:00",
          distance_km: 37,
          time_formatted: "1:25:31",
          avg_power_w: 137,
        },
      ]),
      getActivityDetail: vi.fn().mockResolvedValue({
        _id: "onelap-1",
        fitUrl: "geo/20260506/test.fit",
        date: "2026-05-06",
      }),
    });

    const stravaClient = createMockStravaClient();

    const result = await syncOnelapToStrava({
      onelapClient,
      stravaClient,
      days: 7,
      downloadDir: "/tmp/sync-test",
      _pollIntervalMs: 0,
    });

    expect(result.synced).toHaveLength(1);
    expect(result.synced[0].onelapId).toBe("onelap-1");
    expect(result.skipped).toHaveLength(0);
    expect(result.failed).toHaveLength(0);

    expect(onelapClient.getActivityDetail).toHaveBeenCalledWith("onelap-1");
    expect(onelapClient.downloadFit).toHaveBeenCalledWith(
      "geo/20260506/test.fit",
      "/tmp/sync-test/onelap-1.fit"
    );
    expect(stravaClient.uploadFit).toHaveBeenCalledWith(
      "/tmp/sync-test/onelap-1.fit",
      expect.objectContaining({ externalId: "onelap-1" })
    );
  });

  it("skips activities that already exist on Strava (time match within 5 min)", async () => {
    const onelapClient = createMockOnelapClient({
      getActivities: vi.fn().mockResolvedValue([
        {
          id: "onelap-1",
          start_riding_time: "2026-05-06 10:00:00",
        },
      ]),
    });

    const stravaClient = createMockStravaClient({
      getActivities: vi.fn().mockResolvedValue([
        {
          id: 12345,
          name: "Morning Ride",
          start_date: "2026-05-06T02:02:00Z",
          sport_type: "Ride",
        },
      ]),
    });

    const result = await syncOnelapToStrava({
      onelapClient,
      stravaClient,
      days: 7,
      _pollIntervalMs: 0,
    });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("already on Strava");
    expect(result.synced).toHaveLength(0);
    expect(onelapClient.getActivityDetail).not.toHaveBeenCalled();
  });

  it("skips activities without a FIT file", async () => {
    const onelapClient = createMockOnelapClient({
      getActivities: vi.fn().mockResolvedValue([
        {
          id: "onelap-1",
          start_riding_time: "2026-05-06 10:00:00",
        },
      ]),
      getActivityDetail: vi.fn().mockResolvedValue({
        _id: "onelap-1",
        fitUrl: "",
      }),
    });

    const stravaClient = createMockStravaClient();

    const result = await syncOnelapToStrava({
      onelapClient,
      stravaClient,
      days: 7,
      _pollIntervalMs: 0,
    });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("no FIT file");
  });

  it("records upload failures without stopping sync", async () => {
    const onelapClient = createMockOnelapClient({
      getActivities: vi.fn().mockResolvedValue([
        { id: "ok-1", start_riding_time: "2026-05-06 10:00:00" },
        { id: "fail-1", start_riding_time: "2026-05-06 14:00:00" },
      ]),
      getActivityDetail: vi.fn().mockImplementation(async (id: string) => ({
        _id: id,
        fitUrl: `geo/${id}.fit`,
      })),
    });

    const uploadCall = vi.fn()
      .mockResolvedValueOnce({
        id: 100, id_str: "100", external_id: null,
        error: null, status: "processing", activity_id: null,
      })
      .mockResolvedValueOnce({
        id: 101, id_str: "101", external_id: null,
        error: "duplicate activity", status: "error", activity_id: null,
      });

    const statusCall = vi.fn()
      .mockResolvedValueOnce({
        id: 100, id_str: "100", external_id: null,
        error: null, status: "ready", activity_id: 555,
      })
      .mockResolvedValueOnce({
        id: 101, id_str: "101", external_id: null,
        error: "duplicate activity", status: "error", activity_id: null,
      });

    const stravaClient = createMockStravaClient({
      uploadFit: uploadCall,
      getUploadStatus: statusCall,
    });

    const result = await syncOnelapToStrava({
      onelapClient,
      stravaClient,
      days: 7,
      _pollIntervalMs: 0,
    });

    expect(result.synced).toHaveLength(1);
    expect(result.synced[0].onelapId).toBe("ok-1");
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].onelapId).toBe("fail-1");
    expect(result.failed[0].error).toContain("duplicate");
  });

  it("filters activities to the specified number of days", async () => {
    const now = new Date();
    const withinRange = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const outsideRange = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    const formatLocal = (d: Date) => {
      const offset = d.getTime() + 8 * 60 * 60 * 1000;
      const local = new Date(offset);
      return local.toISOString().slice(0, 10) + " " + local.toISOString().slice(11, 19);
    };

    const onelapClient = createMockOnelapClient({
      getActivities: vi.fn().mockResolvedValue([
        { id: "recent", start_riding_time: formatLocal(withinRange) },
        { id: "old", start_riding_time: formatLocal(outsideRange) },
      ]),
      getActivityDetail: vi.fn().mockResolvedValue({
        _id: "recent",
        fitUrl: "geo/recent.fit",
      }),
    });

    const stravaClient = createMockStravaClient();

    const result = await syncOnelapToStrava({
      onelapClient,
      stravaClient,
      days: 7,
      _pollIntervalMs: 0,
    });

    expect(result.synced).toHaveLength(1);
    expect(result.synced[0].onelapId).toBe("recent");
    expect(onelapClient.getActivityDetail).toHaveBeenCalledTimes(1);
  });

  it("skips upload in dry run mode", async () => {
    const onelapClient = createMockOnelapClient({
      getActivities: vi.fn().mockResolvedValue([
        { id: "onelap-1", start_riding_time: "2026-05-06 10:00:00" },
      ]),
    });

    const stravaClient = createMockStravaClient();

    const result = await syncOnelapToStrava({
      onelapClient,
      stravaClient,
      days: 7,
      dryRun: true,
      _pollIntervalMs: 0,
    });

    expect(result.synced).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("dry run");
    expect(stravaClient.uploadFit).not.toHaveBeenCalled();
  });
});
