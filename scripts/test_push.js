const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 1. Load Firebase Service Account
let serviceAccount = null;
const possiblePaths = [
  path.join(process.env.HOME, 'Downloads/amul-flash-firebase-adminsdk-fbsvc-8e9ff19e13.json'),
  path.join(__dirname, '../service-account.json'),
];

for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    serviceAccount = JSON.parse(fs.readFileSync(p, 'utf8'));
    break;
  }
}

if (!serviceAccount) {
  console.error('❌ Could not find Firebase service account JSON file.');
  process.exit(1);
}

// 2. Fetch Latest FCM Token from Supabase
const SUPABASE_URL = 'https://armxxjwogyfelkysgzcx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFybXh4andvZ3lmZWxreXNnemN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4OTg4NTQsImV4cCI6MjEwMzQ3NDg1NH0.GZ3SdsV6mit1SHf-uxEbS6UzhFRtfCAMmSSbMUDk6zY';

const SOUND_MAP = {
  digital_clock_beep: 'mixkit_alarm_digital_clock_beep_989',
  alert_alarm: 'mixkit_alert_alarm_1005',
  battleship_alarm: 'mixkit_battleship_alarm_1001',
  digital_buzzer: 'mixkit_digital_clock_digital_alarm_buzzer_992',
  spaceship_alarm: 'mixkit_spaceship_alarm_998',
  classic_winner: 'mixkit_classic_winner_alarm_1997',
  sound_alert_hall: 'mixkit_sound_alert_in_hall_1006',
  interface_hint: 'mixkit_interface_hint_notification_911',
};

async function fetchLatestDevice() {
  const arg = process.argv[2];
  if (arg && arg.length > 50) {
    // Direct FCM Token passed
    return { token: arg, soundId: 'alert_alarm' };
  }

  let url = `${SUPABASE_URL}/rest/v1/devices?select=fcm_token,selected_sound_id,phone_number,is_active&is_active=eq.true&order=last_active_at.desc&limit=1`;
  if (arg && /^\d{10}$/.test(arg)) {
    // 10-digit Phone Number passed
    url = `${SUPABASE_URL}/rest/v1/devices?select=fcm_token,selected_sound_id,phone_number,is_active&phone_number=eq.${arg}&is_active=eq.true&order=last_active_at.desc&limit=1`;
    console.log(`📱 Searching active device for phone number: ${arg}`);
  }

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  const data = await res.json();
  if (data && data.length > 0 && data[0].fcm_token) {
    if (data[0].phone_number) {
      console.log(`👤 Linked to user account: ${data[0].phone_number}`);
    }
    return {
      token: data[0].fcm_token,
      soundId: data[0].selected_sound_id || 'alert_alarm',
    };
  }
  return null;
}

// 3. Generate Google OAuth2 Token
async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${b64(header)}.${b64(claim)}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  const signature = sign.sign(serviceAccount.private_key, 'base64url');
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await res.json();
  return tokenData.access_token;
}

// 4. Main Send Routine
async function main() {
  console.log('🔍 Fetching device token and ringtone preference from Supabase...');
  const device = await fetchLatestDevice();

  if (!device || !device.token) {
    console.error('❌ No registered devices found in Supabase. Please open the app and tap "Cloud Radar Sync".');
    process.exit(1);
  }

  const targetToken = device.token;
  const soundId = process.argv[3] || device.soundId || 'alert_alarm';
  const soundResName = SOUND_MAP[soundId] || 'mixkit_alarm_digital_clock_beep_989';

  console.log(`🎯 Targeting device: ${targetToken.slice(0, 18)}...`);
  console.log(`🎵 Selected Alarm Ringtone: ${soundId} (${soundResName})`);
  console.log('🔑 Authenticating with Google Firebase...');
  const accessToken = await getAccessToken();

  console.log('🚨 Dispatching restock alarm notification to your phone...');
  const nowTs = String(Date.now());
  const payload = {
    message: {
      token: targetToken,
      notification: {
        title: '⚡ Restock Alert: Protein Blueberry Lassi',
        body: 'Stock is live for Hub 110044 (30 units)! Tap to buy now.',
      },
      data: {
        productId: '66505ff5145c16635e6cc74d',
        pincode: '110044',
        title: '⚡ Restock Alert: Protein Blueberry Lassi',
        body: 'Stock is live for Hub 110044 (30 units)! Tap to buy now.',
        soundId: soundId,
        unitsAdded: '30',
        timestamp: nowTs,
      },
      android: {
        priority: 'high',
        notification: {
          channel_id: `radar_ch_${soundId}`,
          sound: soundResName,
          default_sound: false,
          notification_priority: 'PRIORITY_MAX',
          visibility: 'PUBLIC',
          tag: `amul_drop_${nowTs}`,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: `${soundResName}.wav`,
            badge: 1,
            'content-available': 1,
          },
        },
      },
    },
  };

  const url = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await res.json();
  if (result.name) {
    console.log('✅ TEST ALERT DELIVERED TO YOUR PHONE SUCCESSFULLY!');
    console.log(`📲 Channel: amul_ch_${soundId} | Sound: ${soundResName}`);
    console.log('📲 Check your phone screen now!');
  } else {
    console.error('❌ FCM Error response:', result);
  }
}

main().catch((err) => console.error('❌ Error:', err));
