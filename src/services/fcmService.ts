import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStockStore } from '../store/useStockStore';
import { RestockEvent } from '../types/store';
import { NotificationService } from './notificationService';

const FCM_TOKEN_STORAGE_KEY = '@amul_fcm_token';

function getFirebaseMessagingInstance(): any {
  if (Platform.OS === 'web') return null;
  try {
    const mod = require('@react-native-firebase/messaging');
    if (!mod) return null;
    if (typeof mod.getMessaging === 'function') {
      return mod.getMessaging();
    }
    if (mod.default && typeof mod.default.getMessaging === 'function') {
      return mod.default.getMessaging();
    }
    if (typeof mod === 'function') {
      return mod();
    }
    if (typeof mod.default === 'function') {
      return mod.default();
    }
    if (typeof mod.onMessage === 'function') {
      return mod;
    }
    if (mod.default && typeof mod.default.onMessage === 'function') {
      return mod.default;
    }
    return null;
  } catch (err) {
    console.log('⚠️ [FCMService] Error resolving Firebase Messaging instance:', err);
    return null;
  }
}

let expoNotificationsModule: any = null;
try {
  if (Platform.OS !== 'web') {
    expoNotificationsModule = require('expo-notifications');
  }
} catch (_e) {
  expoNotificationsModule = null;
}

class FCMService {
  private currentToken: string | null = null;
  private isInitialized = false;
  private processedMessageIds = new Set<string>();

  /**
   * Helper to format a valid FCM topic string
   */
  getTopicName(pincode: string, productId: string): string {
    const cleanPin = (pincode || 'all').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanProd = productId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `restock_${cleanPin}_${cleanProd}`.slice(0, 80);
  }

  async initialize(onTokenReceived?: (token: string) => void): Promise<string> {
    const fb = getFirebaseMessagingInstance();

    if (fb) {
      // 1. Foreground messages (Scenario B - In-App Restock Siren) - Register IMMEDIATELY
      try {
        if (typeof fb.onMessage === 'function') {
          fb.onMessage(async (remoteMessage: any) => {
            console.log('📩 [FCMService] Foreground message received via Firebase:', remoteMessage);
            await this.handleIncomingRestockPayload(remoteMessage);
          });
          console.log('✅ [FCMService] Firebase onMessage listener attached successfully');
        }
      } catch (onMsgErr) {
        console.log('⚠️ [FCMService] onMessage setup error:', onMsgErr);
      }

      // 2. Background notification tap
      try {
        if (typeof fb.onNotificationOpenedApp === 'function') {
          fb.onNotificationOpenedApp(async (remoteMessage: any) => {
            console.log('📲 [FCMService] App opened from background notification via Firebase:', remoteMessage);
          });
        }
      } catch (_opErr) {}

      // 3. Cold start notification
      try {
        if (typeof fb.getInitialNotification === 'function') {
          const initialMessage = await fb.getInitialNotification();
          if (initialMessage) {
            console.log('🚀 [FCMService] App launched from notification intent');
          }
        }
      } catch (_initErr) {}

      // 4. Request Permission
      try {
        if (typeof fb.requestPermission === 'function') {
          await fb.requestPermission();
        }
      } catch (permErr) {
        console.log('⚠️ [FCMService] requestPermission note:', permErr);
      }

      // 5. iOS registration
      if (Platform.OS === 'ios') {
        try {
          if (typeof fb.registerDeviceForRemoteMessages === 'function' && !fb.isDeviceRegisteredForRemoteMessages) {
            await fb.registerDeviceForRemoteMessages();
          }
        } catch (_iosErr) {}
      }

      // 6. Token refresh listener
      try {
        if (typeof fb.onTokenRefresh === 'function') {
          fb.onTokenRefresh(async (newToken: string) => {
            this.currentToken = newToken;
            await AsyncStorage.setItem(FCM_TOKEN_STORAGE_KEY, newToken);
            console.log('🔄 [FCMService] FCM Token refreshed:', newToken.slice(0, 15) + '...');
            if (onTokenReceived) {
              onTokenReceived(newToken);
            }
          });
        }
      } catch (_trErr) {}
    }

    const token = await this.getToken();
    if (onTokenReceived && token) {
      onTokenReceived(token);
    }

    this.isInitialized = true;
    return token;
  }

  /**
   * Handle incoming FCM message payload and trigger in-app alarm and notifications
   */
  public async handleIncomingRestockPayload(remoteMessage: any) {
    if (!remoteMessage) return;

    const msgId = remoteMessage.messageId || `${remoteMessage.data?.productId}_${remoteMessage.data?.timestamp}`;
    if (msgId && this.processedMessageIds.has(msgId)) {
      console.log('🔁 [FCMService] Skipping duplicate message:', msgId);
      return;
    }
    if (msgId) {
      this.processedMessageIds.add(msgId);
    }

    const data = remoteMessage.data || {};
    const notification = remoteMessage.notification || {};

    const rawTs = data.timestamp || remoteMessage.sentTime;
    const sentTime = rawTs ? Number(rawTs) : 0;
    // If message is older than 2 minutes, ignore it to prevent false alarms
    if (sentTime && Date.now() - sentTime > 120000) {
      console.log('⏳ [FCMService] Ignoring stale message older than 2 minutes');
      return;
    }

    let productId = data.productId || data.product_id;
    if (!productId && typeof data.body === 'string' && data.body.includes('productId')) {
      try {
        const parsed = JSON.parse(data.body);
        productId = parsed.productId || parsed.product_id;
      } catch (_e) {}
    }

    const pincode = data.pincode || useStockStore.getState().selectedPincode.pincode || '';
    const title = notification.title || data.title || '⚡ Restock Alert!';

    console.log('🚨 [FCMService] Incoming restock alert for productId:', productId, 'title:', title);

    if (!productId) {
      const trackedKeys = Object.keys(useStockStore.getState().trackedProductsMap);
      productId = trackedKeys[0] || useStockStore.getState().products[0]?.id || '66505ff5145c16635e6cc74d';
    }

    const cleanTitle = title.replace(/^⚡\s*(Restock Alert:\s*)?/i, '');
    const restockEvent: RestockEvent = {
      id: `fcm_${Date.now()}_${productId}`,
      productId: productId,
      productName: cleanTitle || 'Protein Product',
      pincode: pincode,
      timestamp: Date.now(),
      unitsAdded: Number(data.unitsAdded || data.stockCount || 30),
      survivalDurationSecs: 300,
      variantName: data.variantName || 'Standard Pack',
    };

    // 1. Fire full-screen in-app alarm siren & overlay (Scenario B)
    useStockStore.getState().triggerAlarmEvent(restockEvent);

    // 2. Explicitly trigger high-priority notification with sound via NotificationService
    const chosenSoundId = data.soundId || useStockStore.getState().selectedAlarmSoundId || 'alert_alarm';
    NotificationService.sendRestockNotification(
      {
        title: title,
        body: notification.body || data.body || `Stock is live for Hub ${pincode}! Tap to buy.`,
        productId: productId,
        pincode: pincode,
      },
      chosenSoundId
    ).catch(() => {});

    // 3. Log to activity logs
    useStockStore.getState().addActivityLog({
      type: 'restock',
      title: `Cloud Restock Alert: ${restockEvent.productName}`,
      description: pincode ? `Cloud drop alert delivered for Hub ${pincode}` : 'Cloud drop alert delivered',
      pincode: pincode,
      status: 'success',
    });
  }

  /**
   * Subscribe device to a product / pincode topic
   */
  async subscribeToTopic(topic: string): Promise<boolean> {
    const fb = getFirebaseMessagingInstance();
    if (!fb || typeof fb.subscribeToTopic !== 'function') return false;
    try {
      await fb.subscribeToTopic(topic);
      console.log(`📡 [FCMService] Subscribed to topic: ${topic}`);
      return true;
    } catch (err) {
      console.log(`⚠️ [FCMService] Error subscribing to topic ${topic}:`, err);
      return false;
    }
  }

  /**
   * Unsubscribe device from a topic
   */
  async unsubscribeFromTopic(topic: string): Promise<boolean> {
    const fb = getFirebaseMessagingInstance();
    if (!fb || typeof fb.unsubscribeFromTopic !== 'function') return false;
    try {
      await fb.unsubscribeFromTopic(topic);
      console.log(`📡 [FCMService] Unsubscribed from topic: ${topic}`);
      return true;
    } catch (err) {
      console.log(`⚠️ [FCMService] Error unsubscribing from topic ${topic}:`, err);
      return false;
    }
  }

  async getToken(): Promise<string> {
    if (this.currentToken && !this.currentToken.startsWith('dev_')) return this.currentToken;

    const saved = await AsyncStorage.getItem(FCM_TOKEN_STORAGE_KEY);
    if (saved && !saved.startsWith('dev_')) {
      this.currentToken = saved;
      return saved;
    }

    // 1. Try Firebase Messaging SDK
    const fb = getFirebaseMessagingInstance();
    if (fb && typeof fb.getToken === 'function') {
      try {
        const token = await fb.getToken();
        if (token && typeof token === 'string' && token.length > 25) {
          this.currentToken = token;
          await AsyncStorage.setItem(FCM_TOKEN_STORAGE_KEY, token);
          console.log('🔥 [FCMService] Fetched valid FCM Token via Firebase SDK:', token.slice(0, 15) + '...');
          return token;
        }
      } catch (err) {
        console.log('⚠️ [FCMService] Firebase getToken error:', err);
      }
    }

    // 2. Try Expo Notifications getDevicePushTokenAsync (returns native FCM token on Android)
    if (expoNotificationsModule && expoNotificationsModule.getDevicePushTokenAsync) {
      try {
        const pushTokenObj = await expoNotificationsModule.getDevicePushTokenAsync();
        const nativeToken = pushTokenObj?.data;
        if (nativeToken && typeof nativeToken === 'string' && nativeToken.length > 25) {
          this.currentToken = nativeToken;
          await AsyncStorage.setItem(FCM_TOKEN_STORAGE_KEY, nativeToken);
          console.log('🔥 [FCMService] Fetched valid FCM Token via Expo Notifications:', nativeToken.slice(0, 15) + '...');
          return nativeToken;
        }
      } catch (err) {
        console.log('⚠️ [FCMService] Expo getDevicePushTokenAsync error:', err);
      }
    }

    // 3. Fallback: persistent device installation identifier
    let fallbackId = await AsyncStorage.getItem('@amul_device_uuid');
    if (!fallbackId) {
      fallbackId = `dev_${Platform.OS}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      await AsyncStorage.setItem('@amul_device_uuid', fallbackId);
    }
    this.currentToken = fallbackId;
    return fallbackId;
  }
}

export const fcmService = new FCMService();

// Register background message handler outside of component lifecycle
try {
  const fb = getFirebaseMessagingInstance();
  if (fb && typeof fb.setBackgroundMessageHandler === 'function') {
    fb.setBackgroundMessageHandler(async (remoteMessage: any) => {
      console.log('🌙 [FCMService] Background message received via Firebase:', remoteMessage);
      await fcmService.handleIncomingRestockPayload(remoteMessage);
    });
  }
} catch (_bgErr) {}
