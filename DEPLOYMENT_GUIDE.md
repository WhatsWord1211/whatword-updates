# Step-by-Step Guide: Deploy Global Leaderboard Function

## Part 1: Deploy via Firebase Console

### Step 1: Open Firebase Console
1. Go to: https://console.firebase.google.com/
2. Sign in with your Google account (wilderbssmstr@gmail.com)
3. Select your project: **whatword-a3f4b**

### Step 2: Navigate to Functions
1. In the left sidebar, click **"Functions"**
2. If you see "Get started", click it
3. If you already have functions, you'll see the Functions dashboard

### Step 3: Deploy via Inline Editor (Easiest Method)
1. Click **"Create function"** or **"Add function"** button
2. You'll see an inline code editor

### Step 4: Copy the Function Code
1. Open the file `functions/index.js` from your project
2. Copy ALL the code from that file
3. Paste it into the Firebase Console editor

### Step 5: Configure the Function
1. **Function name**: `calculateGlobalLeaderboard`
2. **Region**: Choose `us-central1` (or your preferred region)
3. **Trigger type**: Select **"HTTPS"** (not Scheduled)
4. **Authentication**: Select **"Allow unauthenticated"** (we'll protect with secret key)

### Step 6: Set Environment Variables (Optional but Recommended)
1. Before deploying, click **"Runtime, build, and connections settings"**
2. Scroll to **"Environment variables"**
3. Click **"Add variable"**
4. Add:
   - **Variable**: `CRON_SECRET_KEY`
   - **Value**: `whatword-leaderboard-2024-secret` (or generate your own random string)
5. Click **"Save"**

### Step 7: Deploy
1. Click **"Deploy"** button
2. Wait 2-5 minutes for deployment to complete
3. You'll see a success message with the function URL

### Step 8: Copy the Function URL
After deployment, you'll see something like:
```
https://us-central1-whatword-a3f4b.cloudfunctions.net/calculateGlobalLeaderboard
```

**Copy this URL** - you'll need it for the cron service.

---

## Part 2: Set Up Free Cron Service (cron-job.org)

### Step 1: Create Account
1. Go to: https://cron-job.org
2. Click **"Sign up"** (top right)
3. Sign up with email (free account is fine)
4. Verify your email if needed

### Step 2: Create Cron Job
1. Once logged in, click **"Create cronjob"** button
2. Fill in the form:

**General Settings:**
- **Title**: `WhatWord Global Leaderboard`
- **Address**: Paste your function URL + secret key
  ```
  https://us-central1-whatword-a3f4b.cloudfunctions.net/calculateGlobalLeaderboard?key=whatword-leaderboard-2024-secret
  ```
  (Replace `whatword-leaderboard-2024-secret` with your actual secret key if you changed it)

**Schedule:**
- **Execution**: Select **"Daily"**
- **Time**: `00:00` (midnight)
- **Timezone**: `UTC`

**Other Settings:**
- **Activation**: Make sure it's **"Enabled"**
- **Request method**: `GET` (default)

### Step 3: Save
1. Click **"Create cronjob"** button at bottom
2. You'll see it in your cron jobs list

### Step 4: Test It
1. Click the **"Run now"** button next to your cron job
2. Check the **"Execution log"** tab
3. You should see a successful execution

---

## Part 3: Test the Function Manually

### Option 1: Test via Browser
1. Open a new browser tab
2. Go to: `https://us-central1-whatword-a3f4b.cloudfunctions.net/calculateGlobalLeaderboard?key=whatword-leaderboard-2024-secret`
3. You should see JSON response: `{"success": true, "message": "Global leaderboard calculated successfully", ...}`

### Option 2: Test via Firebase Console
1. Go to Firebase Console → Functions
2. Click on `calculateGlobalLeaderboard`
3. Click **"Test function"** tab
4. Click **"Test"** button
5. Check the logs for success

---

## Part 4: Verify It's Working

### Step 1: Check Firestore
1. Go to Firebase Console → Firestore Database
2. Look for collection: `globalLeaderboard`
3. You should see documents: `easy`, `regular`, `hard`
4. Each document should have `entries` array with ranked players

### Step 2: Check Function Logs
1. Go to Firebase Console → Functions
2. Click on `calculateGlobalLeaderboard`
3. Click **"Logs"** tab
4. You should see execution logs showing the calculation

### Step 3: Test in App
1. Open your WhatWord app
2. Go to Leaderboard screen
3. Tap **"Global"** tab
4. You should see the global rankings!

---

## Troubleshooting

### Function deployment fails
- Make sure you copied the entire `index.js` code
- Check that `package.json` dependencies are correct
- Check Firebase Console logs for errors

### Function returns "Unauthorized"
- Check that the secret key in the URL matches the one in environment variables
- Or update the secret key in `functions/index.js` line 28

### No data in globalLeaderboard
- Wait a few minutes after first execution
- Check function logs for errors
- Verify users have 20+ games and are active within 7 days

### Cron job not running
- Check cron-job.org execution log
- Verify the URL is correct
- Make sure cron job is "Enabled"

---

## What Happens Next

- **Daily at midnight UTC**: Cron service calls your function
- **Function calculates**: Top 100 rankings for each difficulty
- **Stores results**: In `globalLeaderboard/{difficulty}` documents
- **Users see**: Updated rankings in the Global tab

The first calculation will include all existing users who:
- Have 20+ games in a difficulty
- Have played within the last 7 days
- Have games in the `leaderboard` collection

---

## Need Help?

If you get stuck at any step, let me know which step and what error you're seeing!

