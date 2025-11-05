# Simple Guide: Global Leaderboard on FREE Firebase Plan

## ✅ What You Can Do For FREE

1. **HTTP Cloud Function** - FREE (2 million calls/month free)
2. **External Cron Service** - FREE (cron-job.org)
3. **Firestore Storage** - FREE (generous free tier)
4. **Total Cost: $0/month**

## ❌ What Requires Paid Plan

- Scheduled Cloud Functions (we don't need this - we use HTTP + external cron instead)

---

## The Simple Solution (3 Steps)

### Step 1: Create HTTP Function (FREE)
Instead of scheduled function, we use HTTP function that can be called by anyone with the secret key.

### Step 2: Deploy Function (FREE)
Deploy via Firebase Console - completely free on Spark plan.

### Step 3: Set Up Free Cron (FREE)
Use cron-job.org to call your HTTP function daily - completely free.

---

## Visual Breakdown

```
┌─────────────────────────────────────────────────────────┐
│  YOUR FREE SETUP                                          │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  1. Firebase HTTP Function (FREE)                       │
│     └─> Deployed via Firebase Console                   │
│     └─> Free tier: 2 million calls/month                │
│                                                           │
│  2. External Cron Service (FREE)                         │
│     └─> cron-job.org (free account)                     │
│     └─> Calls your function daily                        │
│                                                           │
│  3. Firestore Database (FREE)                           │
│     └─> Stores leaderboard results                      │
│     └─> Generous free tier                               │
│                                                           │
│  TOTAL COST: $0/month                                    │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

---

## What You Need To Do

### PART A: Deploy Function (10 minutes)

1. **Go to Firebase Console**
   - https://console.firebase.google.com/
   - Select project: `whatword-a3f4b`
   - Click: Functions (left sidebar)

2. **Create Function**
   - Click: "Create function" or "Add function"
   - Name: `calculateGlobalLeaderboard`
   - Trigger: Select **"HTTPS"** (this is FREE on Spark plan)
   - Authentication: "Allow unauthenticated"

3. **Add Code**
   - Open file: `functions/index.js` from your project
   - Copy ALL the code
   - Paste into Firebase Console editor

4. **Deploy**
   - Click: "Deploy" button
   - Wait 2-5 minutes
   - Copy the URL that appears (looks like: `https://us-central1-whatword-a3f4b.cloudfunctions.net/calculateGlobalLeaderboard`)

### PART B: Set Up Cron (5 minutes)

1. **Go to cron-job.org**
   - https://cron-job.org
   - Sign up (free account)

2. **Create Cron Job**
   - Click: "Create cronjob"
   - Title: `WhatWord Leaderboard`
   - Address: `[YOUR FUNCTION URL]?key=whatword-leaderboard-2024-secret`
     - Replace `[YOUR FUNCTION URL]` with the URL from Step A4
   - Schedule: Daily at 00:00 UTC
   - Click: "Create cronjob"

3. **Test It**
   - Click: "Run now" button
   - Check execution log - should say "Success"

### PART C: Verify (2 minutes)

1. **Test Function**
   - Open browser
   - Go to: `[YOUR FUNCTION URL]?key=whatword-leaderboard-2024-secret`
   - Should see: `{"success": true, ...}`

2. **Check Firestore**
   - Firebase Console → Firestore
   - Look for: `globalLeaderboard` collection
   - Should see: `easy`, `regular`, `hard` documents

---

## Important Points

✅ **HTTP Functions are FREE** on Spark plan (2 million/month free)  
✅ **External cron is FREE** (cron-job.org free tier)  
✅ **Firestore is FREE** (generous free tier)  
✅ **Total cost: $0/month**

❌ **Scheduled Functions require Blaze plan** - but we don't need them!

---

## Example Function URL

After deployment, you'll get:
```
https://us-central1-whatword-a3f4b.cloudfunctions.net/calculateGlobalLeaderboard
```

Add secret key for cron:
```
https://us-central1-whatword-a3f4b.cloudfunctions.net/calculateGlobalLeaderboard?key=whatword-leaderboard-2024-secret
```

---

## What Happens Daily

1. **Midnight UTC**: cron-job.org calls your function URL
2. **Function runs**: Calculates global leaderboard (FREE)
3. **Results stored**: In Firestore `globalLeaderboard` collection (FREE)
4. **Users see**: Updated rankings in app

All FREE on Spark plan!

---

## Still Confused?

Think of it like this:
- **Scheduled Function** = Firebase automatically runs it daily (requires paid plan)
- **HTTP Function + Cron** = External service calls your function daily (100% FREE)

Both do the same thing, but HTTP + cron works on free plan!

