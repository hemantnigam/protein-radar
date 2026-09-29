import { Platform, AppState } from 'react-native';
import { LOCAL_ALARM_SOUNDS, LocalSoundItem } from '../constants/alarmSounds';
import { alarmSoundService } from './alarmSoundService';

export interface NotificationPayload {
  title: string;
  body: string;
  productId?: string;
  pincode?: string;
}

// Safely load Notifee
let notifeeModule: any = null;
try {
  notifeeModule = require('@notifee/react-native').default;
  if (notifeeModule && typeof notifeeModule.onBackgroundEvent === 'function') {
    notifeeModule.onBackgroundEvent(async ({ detail }: any) => {
      if (detail?.pressAction?.id === 'stop_alarm') {
        if (detail?.notification?.id) {
          await notifeeModule.cancelNotification(detail.notification.id);
        }
      }
    });
  }
} catch (_e) {
  notifeeModule = null;
}

// Safely load Expo Notifications
let expoNotifications: any = null;
try {
  expoNotifications = require('expo-notifications');
  if (expoNotifications && expoNotifications.setNotificationHandler) {
    expoNotifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  }
} catch (_e) {
  expoNotifications = null;
}

async function ensureNotificationChannel(soundId: string = 'digital_clock_beep'): Promise<string> {
  if (Platform.OS !== 'android') return 'default';

  const soundItem: LocalSoundItem =
    LOCAL_ALARM_SOUNDS.find((s) => s.id === soundId) || LOCAL_ALARM_SOUNDS[0];
  const soundResName = soundItem.filename.replace(/\.wav$/i, '');
  const targetChannelId = `radar_siren_v3_${soundItem.id}`;
  const channelIds = [targetChannelId, `radar_ch_${soundItem.id}`, `amul_ch_${soundItem.id}`];

  for (const channelId of channelIds) {
    if (notifeeModule) {
      try {
        await notifeeModule.createChannel({
          id: channelId,
          name: `Restock Siren: ${soundItem.name}`,
          importance: 4, // AndroidImportance.HIGH
          visibility: 1, // AndroidVisibility.PUBLIC
          sound: soundResName,
          vibration: true,
          vibrationPattern: [300, 500, 300, 500],
          badge: true,
          bypassDnd: true,
        });
      } catch (err) {
        console.log('⚠️ [Notifee createChannel error]:', err);
      }
    }

    if (expoNotifications && expoNotifications.setNotificationChannelAsync) {
      try {
        await expoNotifications.setNotificationChannelAsync(channelId, {
          name: `Restock Siren: ${soundItem.name}`,
          importance: 5, // AndroidImportance.MAX
          sound: soundResName,
          vibrationPattern: [0, 500, 250, 500],
          lightColor: '#2563EB',
          enableVibrate: true,
          showBadge: true,
          bypassDnd: true,
        });
      } catch (_e) {}
    }
  }

  return targetChannelId;
}

export const NotificationService = {
  async initialize() {
    if (Platform.OS === 'web') return;

    if (notifeeModule) {
      try {
        await notifeeModule.requestPermission();
      } catch (err) {
        console.log('⚠️ [NotificationService initialize error]:', err);
      }
    }

    if (expoNotifications && expoNotifications.requestPermissionsAsync) {
      try {
        await expoNotifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });
      } catch (_e) {}
    }

    // Pre-register channels for all alarm sounds
    for (const s of LOCAL_ALARM_SOUNDS) {
      try {
        await ensureNotificationChannel(s.id);
      } catch (_e) {}
    }
  },

  async sendRestockNotification(payload: NotificationPayload, soundId: string = 'digital_clock_beep') {
    if (Platform.OS === 'web') return;

    const soundItem: LocalSoundItem =
      LOCAL_ALARM_SOUNDS.find((s) => s.id === soundId) || LOCAL_ALARM_SOUNDS[0];
    const soundResName = soundItem.filename.replace(/\.wav$/i, '');

    // Trigger custom audio playback via expo-audio when app is active in foreground only if alarm is not already ringing
    if (AppState.currentState === 'active' && !alarmSoundService.getIsRinging()) {
      try {
        alarmSoundService.previewSound(soundItem.id);
      } catch (_e) {}
    }

    const channelId = await ensureNotificationChannel(soundItem.id);

    // 1. Primary delivery via Notifee
    if (notifeeModule && notifeeModule.displayNotification) {
      try {
        await notifeeModule.displayNotification({
          title: payload.title,
          body: payload.body,
          data: {
            productId: payload.productId || '',
            pincode: payload.pincode || '',
            soundId: soundItem.id,
          },
          android: {
            channelId: channelId,
            importance: 4,
            visibility: 1,
            category: 'alarm',
            sound: soundResName,
            loopSound: true, // Continuously loop custom audio like an alarm clock
            ongoing: true, // Prioritize at top of notification shade
            autoCancel: false,
            pressAction: {
              id: 'default',
              launchActivity: 'default',
            },
            actions: [
              {
                title: '🛑 Stop Alarm',
                pressAction: {
                  id: 'stop_alarm',
                },
              },
              {
                title: '🛒 Open App',
                pressAction: {
                  id: 'open_app',
                  launchActivity: 'default',
                },
              },
            ],
            vibrationPattern: [300, 500, 300, 500],
          },
          ios: {
            sound: soundItem.filename,
          },
        });
        console.log('🔔 [NotificationService] Restock notification dispatched via Notifee with sound:', soundResName);
        return;
      } catch (err) {
        console.log('❌ [NotificationService displayNotification error]:', err);
      }
    }

    // 2. Fallback via Expo Notifications
    if (expoNotifications && expoNotifications.scheduleNotificationAsync) {
      try {
        await expoNotifications.scheduleNotificationAsync({
          content: {
            title: payload.title,
            body: payload.body,
            sound: soundResName,
            channelId: channelId,
            data: {
              productId: payload.productId || '',
              pincode: payload.pincode || '',
            },
          },
          trigger: null, // Immediate trigger
        });
        console.log('🔔 [NotificationService] Restock notification dispatched via Expo Notifications');
      } catch (expoErr) {
        console.log('❌ [NotificationService expoNotifications error]:', expoErr);
      }
    }
  },

  async scheduleDelayedNotification(
    payload: NotificationPayload,
    delaySeconds: number = 5,
    soundId: string = 'digital_clock_beep'
  ) {
    if (Platform.OS === 'web') return;

    const soundItem: LocalSoundItem =
      LOCAL_ALARM_SOUNDS.find((s) => s.id === soundId) || LOCAL_ALARM_SOUNDS[0];
    const soundResName = soundItem.filename.replace(/\.wav$/i, '');

    console.log(`⏱️ [NotificationService] Scheduling ${delaySeconds}s delayed looping alarm with sound: ${soundResName}`);

    const channelId = await ensureNotificationChannel(soundItem.id);
    const triggerTime = Date.now() + delaySeconds * 1000;

    // 1. Primary: Trigger notification via Notifee timestamp trigger
    if (notifeeModule && notifeeModule.createTriggerNotification) {
      try {
        await notifeeModule.createTriggerNotification(
          {
            title: payload.title,
            body: payload.body,
            data: {
              productId: payload.productId || '',
              pincode: payload.pincode || '',
            },
            android: {
              channelId: channelId,
              importance: 4,
              visibility: 1,
              sound: soundResName,
              loopSound: true, // Continuously loop custom audio like an alarm clock
              ongoing: true, // Prioritize at top of notification shade
              autoCancel: true,
              pressAction: {
                id: 'default',
                launchActivity: 'default',
              },
              actions: [
                {
                  title: '🛑 Stop Alarm',
                  pressAction: {
                    id: 'stop_alarm',
                  },
                },
                {
                  title: '🛒 Open App',
                  pressAction: {
                    id: 'open_app',
                    launchActivity: 'default',
                  },
                },
              ],
              vibrationPattern: [300, 500, 300, 500],
            },
            ios: {
              sound: soundItem.filename,
            },
          },
          {
            type: 0, // TriggerType.TIMESTAMP
            timestamp: triggerTime,
          }
        );
        console.log('✅ [NotificationService] Notifee timestamp trigger scheduled successfully with sound:', soundResName);
        return;
      } catch (err) {
        console.log('⚠️ [Notifee createTriggerNotification error]:', err);
      }
    }

    // 2. Fallback / Complementary: Expo Notifications TimeInterval Trigger
    if (expoNotifications && expoNotifications.scheduleNotificationAsync) {
      try {
        await expoNotifications.scheduleNotificationAsync({
          content: {
            title: payload.title,
            body: payload.body,
            sound: soundResName,
            channelId: channelId,
            data: {
              productId: payload.productId || '',
              pincode: payload.pincode || '',
            },
          },
          trigger: {
            type: 'timeInterval',
            seconds: delaySeconds,
            repeats: false,
          } as any,
        });
      } catch (_e) {}
    }
  },

  async cancelAllNotifications() {
    if (notifeeModule && notifeeModule.cancelAllNotifications) {
      try {
        await notifeeModule.cancelAllNotifications();
      } catch (_e) {}
    }
    if (expoNotifications && expoNotifications.cancelAllScheduledNotificationsAsync) {
      try {
        await expoNotifications.cancelAllScheduledNotificationsAsync();
      } catch (_e) {}
    }
  },
};
