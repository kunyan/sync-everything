import "dotenv/config";
import { authorizeStrava } from "../src/strava/index.js";

async function main() {
  const clientId = process.env.STRAVA_CLIENT_ID!;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET!;

  if (!clientId || !clientSecret) {
    console.error("Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET in .env");
    process.exit(1);
  }

  console.log("Starting Strava OAuth authorization...\n");

  const result = await authorizeStrava({ clientId, clientSecret });

  console.log("\nAuthorization successful!");
  console.log(`  Athlete: ${result.athlete.firstname} ${result.athlete.lastname} (ID: ${result.athlete.id})`);
  console.log(`  Access Token: ${result.accessToken}`);
  console.log(`  Refresh Token: ${result.refreshToken}`);
  console.log(`  Expires At: ${new Date(result.expiresAt * 1000).toISOString()}`);
  console.log("\nAdd these to your .env file:");
  console.log(`  STRAVA_REFRESH_TOKEN=${result.refreshToken}`);
  console.log(`  STRAVA_ACCESS_TOKEN=${result.accessToken}`);
  console.log(`  STRAVA_EXPIRES_AT=${result.expiresAt}`);
}

main().catch(console.error);
