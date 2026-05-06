import "dotenv/config";
import { OnelapClient } from "../src/onelap/index.js";
import { StravaClient } from "../src/strava/index.js";
import { syncOnelapToStrava } from "../src/sync/index.js";

async function main() {
  const onelapClient = new OnelapClient();
  await onelapClient.login(
    process.env.ONELAP_USERNAME!,
    process.env.ONELAP_PASSWORD!
  );
  console.log("Onelap login successful");

  const stravaClient = new StravaClient({
    clientId: process.env.STRAVA_CLIENT_ID!,
    clientSecret: process.env.STRAVA_CLIENT_SECRET!,
    refreshToken: process.env.STRAVA_REFRESH_TOKEN!,
    accessToken: process.env.STRAVA_ACCESS_TOKEN || undefined,
    expiresAt: process.env.STRAVA_EXPIRES_AT
      ? Number(process.env.STRAVA_EXPIRES_AT)
      : undefined,
    onTokenRefresh: (tokens) => {
      console.log(
        "Strava token refreshed, expires:",
        new Date(tokens.expiresAt * 1000).toISOString()
      );
    },
  });
  console.log("Strava client ready\n");

  const result = await syncOnelapToStrava({
    onelapClient,
    stravaClient,
    days: 7,
  });

  console.log(`Synced: ${result.synced.length} activities`);
  for (const s of result.synced) {
    console.log(`  - ${s.onelapId} → upload ${s.stravaUploadId} (${s.name})`);
  }

  console.log(`Skipped: ${result.skipped.length} activities`);
  for (const s of result.skipped) {
    console.log(`  - ${s.onelapId} (${s.reason})`);
  }

  console.log(`Failed: ${result.failed.length} activities`);
  for (const f of result.failed) {
    console.log(`  - ${f.onelapId} (${f.error})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
