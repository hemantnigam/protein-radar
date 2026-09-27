# Protein Radar 24/7 Cloud Stock Poller (Supabase + FCM)

This directory contains the backend cloud infrastructure that monitors Amul stock drops 24/7 and delivers real-time push alerts to devices even when the mobile app is killed or the device is asleep.

---

## 🚀 Setup Guide

### 1. Supabase Database Setup
1. Go to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Open the **SQL Editor**.
3. Copy the contents of [`schema.sql`](./schema.sql) and click **Run**.
4. (Optional) Run the `pg_cron` snippet at the bottom of `schema.sql` to enable the built-in 1-minute automated poller inside Postgres.

### 2. Deploy Supabase Edge Function
Deploy the updated stock radar edge function:
```bash
# Link your local project (if not linked)
npx supabase link --project-ref armxxjwogyfelkysgzcx

# Deploy the edge function
npx supabase functions deploy amul-radar-cron --no-verify-jwt
```

### 3. Set Edge Function Secrets
In Supabase Dashboard -> **Edge Functions** -> **Secrets** (or via `npx supabase secrets set`):
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

> **Note:** Upstash Redis is no longer required! Previous stock state and 5-minute alert cooldowns are persisted directly in the `stock_cache` table in Supabase PostgreSQL for 100% free scalability.

---

## ⚡ How It Works Under The Hood

1. **Client Registration:** When the mobile app opens, `fcmService` registers the device token in `devices`.
2. **Topic Subscription:** When a user tracks a product, the device subscribes to the FCM Topic `restock_{pincode}_{productId}`.
3. **Dynamic Category Polling:** Every minute, `amul-radar-cron` scans only the categories actively monitored in each regional hub (e.g. `protein`, `paneer-and-curd`).
4. **PostgreSQL Diffing & Cooldown:** The Edge Function reads previous state from `stock_cache`. If stock goes from `0 ➔ >0` and is not in cooldown, it triggers an alert.
5. **Instant Push Alert:** Dispatches to the FCM Topic in a single fast HTTP call (<100ms for 1,000+ users), with parallel fallback for custom alarm sounds.
6. **Analytics Logging:** Logs detected restocks and units into `restock_events`.
