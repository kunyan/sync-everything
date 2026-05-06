import "dotenv/config";
import { StravaClient } from "../src/strava/index.js";

async function main() {
  const clientId = process.env.STRAVA_CLIENT_ID!;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET!;
  const refreshToken = process.env.STRAVA_REFRESH_TOKEN!;

  if (!clientId || !clientSecret || !refreshToken) {
    console.error(
      "Missing STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, or STRAVA_REFRESH_TOKEN in .env"
    );
    process.exit(1);
  }

  const client = new StravaClient({
    clientId,
    clientSecret,
    refreshToken,
    accessToken: process.env.STRAVA_ACCESS_TOKEN || undefined,
    expiresAt: process.env.STRAVA_EXPIRES_AT
      ? Number(process.env.STRAVA_EXPIRES_AT)
      : undefined,
    onTokenRefresh: (tokens) => {
      console.log("Token refreshed! New expiry:", new Date(tokens.expiresAt * 1000).toISOString());
    },
  });

  console.log("=== 1. Get Activities ===");
  const activities = await client.getActivities({ perPage: 5 });
  console.log(`Found ${activities.length} activities:`);
  for (const a of activities) {
    console.log(
      `  - ${a.id} | ${a.name} | ${a.sport_type} | ${a.start_date_local} | ${a.distance}m`
    );
  }

  console.log("\nAll tests passed!");
}

main().catch(console.error);
