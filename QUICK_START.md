# Quick Start: Global Leaderboard Setup

## TL;DR - 3 Steps

1. **Deploy Function** → Firebase Console → Functions → Create → Paste code → Deploy
2. **Get URL** → Copy the function URL from Firebase Console
3. **Set Cron** → cron-job.org → Create job → Use URL → Daily at midnight UTC

---

## Detailed Steps

### 1. Deploy Function (5 minutes)

**Firebase Console Method:**
```
1. Go to: https://console.firebase.google.com/
2. Select project: whatword-a3f4b
3. Click: Functions (left sidebar)
4. Click: "Create function" or "Add function"
5. Function name: calculateGlobalLeaderboard
6. Trigger: HTTPS
7. Copy code from: functions/index.js
8. Paste into editor
9. Click: Deploy
10. Wait 2-5 minutes
11. Copy the function URL shown
```

### 2. Set Up Cron (3 minutes)

**cron-job.org Method:**
```
1. Go to: https://cron-job.org
2. Sign up (free)
3. Click: "Create cronjob"
4. Title: WhatWord Global Leaderboard
5. Address: [Your function URL]?key=whatword-leaderboard-2024-secret
6. Schedule: Daily at 00:00 UTC
7. Click: "Create cronjob"
8. Click: "Run now" to test
```

### 3. Test (1 minute)

**Browser Test:**
```
Open: [Your function URL]?key=whatword-leaderboard-2024-secret

Should see: {"success": true, "message": "Global leaderboard calculated successfully"}
```

**Check Firestore:**
```
Firebase Console → Firestore → Look for "globalLeaderboard" collection
Should see: easy, regular, hard documents with rankings
```

---

## Function URL Format

After deployment, your URL will look like:
```
https://us-central1-whatword-a3f4b.cloudfunctions.net/calculateGlobalLeaderboard
```

Add the secret key:
```
https://us-central1-whatword-a3f4b.cloudfunctions.net/calculateGlobalLeaderboard?key=whatword-leaderboard-2024-secret
```

---

## Secret Key

**Default**: `whatword-leaderboard-2024-secret`

**To change it:**
1. Firebase Console → Functions → Environment Variables
2. Add: `CRON_SECRET_KEY` = `your-new-secret-here`
3. Update cron job URL with new key

---

## What It Does

- Runs daily at midnight UTC
- Calculates top 100 global rankings
- Filters users inactive for 7+ days
- Requires minimum 20 games
- Stores in: `globalLeaderboard/{difficulty}`

---

## Troubleshooting

**"Unauthorized" error:**
→ Check secret key matches in URL and environment variable

**No data in leaderboard:**
→ Wait a few minutes, check function logs, verify users have 20+ games

**Function not deploying:**
→ Check Firebase Console logs, verify code is complete

---

See `DEPLOYMENT_GUIDE.md` for detailed step-by-step instructions.

