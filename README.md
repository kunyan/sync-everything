# sync-everything

Automatically sync cycling activities from [Onelap (顽鹿)](https://www.onelap.cn) to [Strava](https://www.strava.com).

Downloads FIT files from Onelap and uploads them to Strava, with time-based deduplication to avoid duplicates. Runs daily via GitHub Actions, or manually on demand.

## Setup

### Prerequisites

- Node.js >= 22
- pnpm

### Install

```bash
pnpm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `ONELAP_USERNAME` | Onelap account (phone number) |
| `ONELAP_PASSWORD` | Onelap password |
| `STRAVA_CLIENT_ID` | Strava API application Client ID |
| `STRAVA_CLIENT_SECRET` | Strava API application Client Secret |
| `STRAVA_REFRESH_TOKEN` | Strava OAuth refresh token |

### Strava OAuth Setup

1. Create an app at [Strava API Settings](https://www.strava.com/settings/api), set the callback domain to `localhost`.

2. Run the one-time authorization script to get your refresh token:

```bash
pnpm tsx scripts/authorize-strava.ts
```

This opens a browser for OAuth consent, then prints your tokens. Copy the `refreshToken` to your `.env`.

## Usage

### Run Locally

```bash
pnpm tsx scripts/sync-onelap-to-strava.ts
```

Output:

```
Onelap login successful
Strava client ready

Synced: 2 activities
  - 69f4219f... → upload 12345 (2026-05-06 10:00:00)
Skipped: 1 activities
  - 69d374c7... (already on Strava)
Failed: 0 activities
```

### GitHub Actions

The workflow runs daily at ~10:17 AM (UTC+8) and can be triggered manually from the Actions tab.

Add these secrets to your repository (Settings → Secrets and variables → Actions):

- `ONELAP_USERNAME`
- `ONELAP_PASSWORD`
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REFRESH_TOKEN`

## How It Works

1. Fetches recent activities from Onelap (last 7 days)
2. Fetches recent activities from Strava for the same period
3. For each Onelap activity:
   - Compares start times — if a Strava activity starts within 5 minutes, it's considered a duplicate and skipped
   - Downloads the FIT file from Onelap
   - Uploads it to Strava
   - Polls upload status until complete

Onelap timestamps are in UTC+8 (Asia/Shanghai); Strava uses UTC. The sync handles the timezone conversion automatically.

## Project Structure

```
src/
├── onelap/          # Onelap API client
├── strava/          # Strava API client (OAuth + upload)
└── sync/            # Sync bridge (download from Onelap → upload to Strava)
scripts/
├── sync-onelap-to-strava.ts   # Main sync CLI
└── authorize-strava.ts        # One-time OAuth setup
.github/workflows/
└── sync-onelap-to-strava.yml  # Daily cron + manual trigger
```

## Development

```bash
pnpm test        # Run unit tests
pnpm typecheck   # Type check
pnpm build       # Build to dist/
```

The library exports three subpath modules:

```typescript
import { OnelapClient } from "sync-everything/onelap";
import { StravaClient } from "sync-everything/strava";
import { syncOnelapToStrava } from "sync-everything/sync";
```
