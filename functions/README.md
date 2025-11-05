# Cloud Functions for WhatWord

## Setup

1. Install dependencies:
```bash
cd functions
npm install
```

2. Deploy functions:
```bash
firebase deploy --only functions
```

## Functions

### `calculateGlobalLeaderboard`
Scheduled function that runs daily at midnight UTC to calculate global leaderboard rankings.

**Schedule:** Every day at 00:00 UTC

**What it does:**
- Calculates top 100 global rankings for each difficulty (Easy, Regular, Hard)
- Filters users inactive for 7+ days
- Requires minimum 20 games per difficulty
- Uses rolling average of last 20 games + activity bonuses
- Stores results in `globalLeaderboard/{difficulty}` documents

## Migration Scripts

### `migrate-lastSoloActivity.js`
One-time migration script to set `lastSoloActivity` for existing users.

**Usage:**
```bash
node migrate-lastSoloActivity.js
```

**What it does:**
- Finds users who have played solo games but don't have `lastSoloActivity` set
- Sets `lastSoloActivity` to their most recent solo game timestamp
- Allows existing users to appear on global leaderboard immediately

**Note:** This script should be run once before deploying the global leaderboard feature, or after deploying to backfill existing users.

## Manual Testing

To manually trigger the global leaderboard calculation for testing:

```bash
firebase functions:shell
```

Then in the shell:
```javascript
calculateGlobalLeaderboard()
```

