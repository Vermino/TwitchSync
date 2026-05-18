# Database Migrations

## Running Migrations
```bash
cd backend
npx ts-node src/database/migrations/runner.ts
```

The runner tracks applied migrations by **filename** in the `migrations` table. A migration is only run once. Never rename a file that has already been applied to an environment.

## Numbering Convention
New migrations must use the next sequential number: `NNN_description.ts`.

To find the next number: look at the highest `NNN` in this directory and add 1.

Current highest: **036** → next migration should start at **037**.

## Known Numbering Gaps

The following numbers are intentionally missing (migrations were applied out of order during development):

| Missing | Note |
|---------|------|
| 031, 032, 033 | Skipped — migrations 034+ were applied directly |

Duplicate prefixes (026×2, 027×3, 035×2, 036×2) were applied and tracked under their full filename and are safe to keep.

## Schema Quick Reference

| # | Description |
|---|-------------|
| 001 | core tables (channels, games) |
| 002 | auth tables |
| 003 | system tables |
| 004 | vod tables |
| 005 | discovery tables |
| 006–008 | discovery preferences & stats |
| 009–013 | task priority, enhancements, status |
| 014–015 | error messaging, task monitoring |
| 016–018 | channel game tracking, live status |
| 019–020 | user settings, VOD ID type fix |
| 021–025 | task skipped vods, content type, events |
| 026 | game filter skip reason + completed VOD tracking |
| 027 | progress tracking, lifecycle states, queue optimization |
| 028–030 | resume functionality, paused status enum |
| 034 | VOD lifecycle management |
| 035 | ignored discovery items + global quality setting |
| 036 | tags in discovery preferences + quality to tasks |
