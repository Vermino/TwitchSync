# Backend Smoke Tests

## Scripts
- `npm run test:smoke`
  - Runs the deterministic API smoke suite with mocked auth, database state, and download-manager behavior.
- `npm run test:smoke:live`
  - Runs the live download smoke test file. The test is skipped unless `LIVE_DOWNLOAD_SMOKE=1`.

## Deterministic Smoke Coverage
- Task creation and validation failures
- Task-option matrix coverage for `channel`, `game`, and `combined` tasks across `manual`, `interval`, and `cron`
- Task persistence for `quality`, `conditions`, and `restrictions`
- Manual task run and manager-detail response shape
- VOD listing across `pending`, `queued`, `downloading`, `completed`, `failed`, `cancelled`, and `paused`
- Queue add flow, duplicate add idempotence, retry exhaustion, and stats/estimate endpoints
- Download-manager pause/resume controls
- Settings read/write round-trip coverage for downloads, file organization, storage, and notifications
- Settings validation coverage for invalid limits, email configuration, and Discord webhook configuration
- Settings storage stats, folder selection, path browsing, and filesystem rescan endpoints
- User-isolation checks on queue reads and direct download mutations

## Live Download Smoke Prerequisites
Set these before running `npm run test:smoke:live`:
- `LIVE_DOWNLOAD_SMOKE=1`
- `LIVE_SMOKE_BASE_URL`
  - Base URL for a running TwitchSync instance, for example `http://localhost:2261`
- `LIVE_SMOKE_AUTH_TOKEN`
  - A valid bearer token for a test user who owns the target VOD
- `LIVE_SMOKE_VOD_ID`
  - An existing discovered VOD row that the test user is allowed to queue

Optional:
- `LIVE_SMOKE_TIMEOUT_MS`
  - Defaults to `300000`
- `LIVE_SMOKE_POLL_INTERVAL_MS`
  - Defaults to `5000`
- `LIVE_SMOKE_CLEANUP=1`
  - Enables optional cleanup after a successful download
- `LIVE_SMOKE_STORAGE_ROOT`
  - Required when cleanup is enabled; downloaded files are only deleted if they resolve inside this directory

## PowerShell Example
```powershell
$env:LIVE_DOWNLOAD_SMOKE = '1'
$env:LIVE_SMOKE_BASE_URL = 'http://localhost:2261'
$env:LIVE_SMOKE_AUTH_TOKEN = 'replace-with-a-real-token'
$env:LIVE_SMOKE_VOD_ID = '12345'
npm run test:smoke:live
```
