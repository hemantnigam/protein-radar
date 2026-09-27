-- =========================================================
-- Amul Flash Supabase Database Schema (Clean Fresh Slate)
-- Run this script in the Supabase SQL Editor (supabase.com/dashboard)
-- =========================================================

-- 1. Reset & Drop Old Tables (Fresh Clean State)
DROP TABLE IF EXISTS public.tracked_subscriptions CASCADE;
DROP TABLE IF EXISTS public.devices CASCADE;
DROP TABLE IF EXISTS public.restock_events CASCADE;
DROP TABLE IF EXISTS public.stock_cache CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_stale_devices CASCADE;

-- 2. Devices Table (Attached to User Mobile Number)
CREATE TABLE public.devices (
    fcm_token TEXT PRIMARY KEY,
    phone_number TEXT,
    platform TEXT,
    selected_sound_id TEXT DEFAULT 'alert_alarm',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_devices_phone ON public.devices (phone_number);
CREATE INDEX idx_devices_last_active ON public.devices (last_active_at DESC);

-- 3. Tracked Subscriptions Table (Owned by User Mobile Number & Synced Across Devices)
CREATE TABLE public.tracked_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT,
    fcm_token TEXT REFERENCES public.devices(fcm_token) ON DELETE SET NULL,
    product_id TEXT NOT NULL,
    product_title TEXT NOT NULL,
    pincode TEXT NOT NULL DEFAULT 'all',
    store_id TEXT NOT NULL DEFAULT '66505ff5145c16635e6cc74d',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_phone_product_pincode UNIQUE (phone_number, product_id, pincode)
);

-- Indexes for lightning fast polling lookups by cloud cron
CREATE INDEX idx_subs_active_pincode_store 
ON public.tracked_subscriptions (is_active, pincode, store_id);

CREATE INDEX idx_subs_product_id 
ON public.tracked_subscriptions (product_id);

CREATE INDEX idx_subs_phone_number 
ON public.tracked_subscriptions (phone_number);

-- 4. User Subscriptions Table (30-Day VIP Trial & Paid Sachet Pass Management)
CREATE TABLE public.user_subscriptions (
    phone_number TEXT PRIMARY KEY,
    plan_name TEXT NOT NULL DEFAULT '30_day_welcome_trial',
    starts_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    payment_id TEXT,
    amount_paid INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_subs_expires_at 
ON public.user_subscriptions (expires_at);

-- 5. Restock Events Table (Drop History & Analytics - Permanent Log)
CREATE TABLE public.restock_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id TEXT NOT NULL,
    product_title TEXT NOT NULL,
    pincode TEXT,
    store_id TEXT,
    stock_count INTEGER DEFAULT 0,
    units_added INTEGER DEFAULT 0,
    detected_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_restock_detected_at 
ON public.restock_events (detected_at DESC);

-- 6. Persistent Stock Cache Table (Replaces external Redis for 100% free state diff & cooldown)
CREATE TABLE public.stock_cache (
    pincode TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_title TEXT,
    store_id TEXT,
    is_in_stock BOOLEAN NOT NULL DEFAULT false,
    stock_count INTEGER NOT NULL DEFAULT 0,
    last_alerted_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (pincode, product_id)
);

CREATE INDEX idx_stock_cache_pincode_prod 
ON public.stock_cache (pincode, product_id);

-- =========================================================
-- Row Level Security (RLS) Policies
-- =========================================================

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracked_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restock_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_cache ENABLE ROW LEVEL SECURITY;

-- Allow public insert and update for devices
CREATE POLICY "Allow public insert and update for devices"
ON public.devices
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Allow public access for tracked subscriptions
CREATE POLICY "Allow public access for tracked subscriptions"
ON public.tracked_subscriptions
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Allow public access for user subscriptions (trial and paid passes)
CREATE POLICY "Allow public access for user subscriptions"
ON public.user_subscriptions
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Allow public read of restock events, and service role write
CREATE POLICY "Allow public read of restock events"
ON public.restock_events
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow service role insert into restock events"
ON public.restock_events
FOR INSERT
TO service_role
WITH CHECK (true);

-- Allow public read and service_role write on stock_cache
CREATE POLICY "Allow public read and service_role write on stock_cache"
ON public.stock_cache
FOR ALL
TO anon, authenticated, service_role
USING (true)
WITH CHECK (true);

-- =========================================================
-- Optional: Automated 1-Minute Cron Poller via pg_cron & pg_net
-- (Run this in Supabase SQL Editor to enable built-in free cron)
-- =========================================================
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;
--
-- SELECT cron.schedule(
--   'protein-radar-poller',
--   '* * * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://armxxjwogyfelkysgzcx.supabase.co/functions/v1/amul-radar-cron',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer <YOUR_SUPABASE_SERVICE_ROLE_KEY>'
--     ),
--     body := '{"source": "pg_cron"}'::jsonb
--   );
--   $$
-- );
