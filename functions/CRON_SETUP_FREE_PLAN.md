# Setting Up Global Leaderboard on Free Firebase Plan

Since scheduled Cloud Functions require the Blaze (pay-as-you-go) plan, we've converted the function to an HTTP-triggered endpoint that can be called by free external cron services.

## Step 1: Deploy the HTTP Function

After deploying the function, you'll get a URL like:
```
https://us-central1-whatword-a3f4b.cloudfunctions.net/calculateGlobalLeaderboard
```

## Step 2: Set Up Free External Cron Service

### Option A: cron-job.org (Recommended - Free)

1. Go to https://cron-job.org
2. Create a free account
3. Click "Create cronjob"
4. Configure:
   - **Title**: WhatWord Global Leaderboard
   - **Address**: `https://us-central1-whatword-a3f4b.cloudfunctions.net/calculateGlobalLeaderboard?key=YOUR_SECRET_KEY`
   - **Schedule**: Every day at 00:00 UTC
   - **Activation**: Enabled

### Option B: GitHub Actions (Free)

Create `.github/workflows/leaderboard-cron.yml`:
```yaml
name: Calculate Global Leaderboard
on:
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight UTC
  workflow_dispatch:  # Allows manual trigger

jobs:
  calculate:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Function
        run: |
          curl -X GET "https://us-central1-whatword-a3f4b.cloudfunctions.net/calculateGlobalLeaderboard?key=${{ secrets.CRON_SECRET_KEY }}"
```

### Option C: EasyCron (Free tier available)

1. Go to https://www.easycron.com
2. Sign up for free account
3. Add new cron job pointing to your function URL

## Step 3: Set Secret Key (Security)

1. In Firebase Console → Functions → Environment Variables
2. Add: `CRON_SECRET_KEY` = (generate a random string)
3. Update the cron service URL to include: `?key=YOUR_SECRET_KEY`

Or set it in the function code directly (less secure but simpler):
```javascript
const expectedKey = 'your-secret-key-here';
```

## Step 4: Test the Function

Test manually via browser or curl:
```
https://us-central1-whatword-a3f4b.cloudfunctions.net/calculateGlobalLeaderboard?key=YOUR_SECRET_KEY
```

You should get: `{"success": true, "message": "Global leaderboard calculated successfully", ...}`

## Cost

- **HTTP Functions**: Free tier includes 2 million invocations/month
- **External Cron Services**: Free tier available
- **Total Cost**: $0/month on free plan

## Alternative: On-Demand Calculation

If you prefer not to use external services, we can modify the code to calculate leaderboards on-demand when users view the Global tab (slower but no external dependency).

