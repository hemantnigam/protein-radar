# ⚡ Protein Radar

> Real-time high-protein restock monitor, drop siren alerts, and fast checkout assistant.

**Protein Radar** is a high-performance React Native (Expo) mobile application designed to track high-demand, quick-selling protein products (such as High Protein Whey, Protein Lassi, Paneer, Buttermilk) across multiple pincodes in India with zero-latency drop alerts.

---

## 🚀 Key Features

- **⚡ Live Stock Radar**: Real-time stock polling and inventory tracking across configured pincodes.
- **🚨 High-Priority Drop Sirens**: Fullscreen drop alarm overlay with 8 customizable audio alert sounds.
- **🔔 Low-Latency Push Notifications**: Instant Firebase Cloud Messaging (FCM) & background fetch synchronization.
- **🛒 1-Tap Quick Buy**: Quick cart and checkout launch for lightning-fast orders before products sell out.
- **📊 Restock Analytics & Trends**: Visual charts and historical drop trends to predict upcoming restock windows.
- **📱 Android Home Screen Widget**: At-a-glance live stock monitor via `react-native-android-widget`.
- **💳 Micro-Passes & Subscription Tiers**: Seamless pass activation and VIP unlock capabilities.

---

## 🛠 Tech Stack

- **Framework**: [React Native](https://reactnative.dev/) with [Expo SDK 57](https://expo.dev) & [Expo Router](https://docs.expo.dev/router/introduction)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Backend & Database**: [Supabase](https://supabase.com/) (PostgreSQL, Edge Functions, Cron triggers)
- **Notifications & Push**: Firebase Cloud Messaging (FCM), `@notifee/react-native`, `expo-notifications`
- **Audio & Media**: `expo-audio` with custom alarm tones
- **Widgets**: `react-native-android-widget`
- **Styling & UI**: Custom Design Tokens, React Native Reanimated, Lucide Icons

---

## 📂 Project Structure

```
protein-radar/
├── assets/             # Icons, splash screens, and images
├── plugins/            # Custom Expo config plugins (e.g., manifest tweaks)
├── scripts/            # Utility scripts (e.g., push notification testing)
├── src/
│   ├── app/            # Expo Router file-based routes & tabs
│   ├── components/     # Reusable UI components & modals
│   ├── constants/      # App constants, themes, and alarm sound lists
│   ├── hooks/          # Custom React hooks
│   ├── music/          # Custom alarm ringtones and alert audio files
│   ├── services/       # Store API, Supabase, FCM, and Background Sync
│   ├── store/          # Zustand state stores (Session, Stock, Subscriptions)
│   └── types/          # TypeScript definitions
├── supabase/           # Supabase edge functions, schemas, and migrations
├── app.json            # Expo app configuration
├── eas.json            # EAS Build & Submit configuration
└── package.json
```

---

## 🏁 Getting Started

### 1. Prerequisites

- **Node.js**: v18 or higher
- **npm** or **yarn**
- **Expo CLI** / **EAS CLI**: `npm install -g eas-cli`
- Android Studio (for Android build/emulator) or Xcode (for iOS simulator)

### 2. Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/hemantnigam/protein-radar.git
cd protein-radar
npm install
```

### 3. Environment Variables

Create a `.env` file in the root directory:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Add your `google-services.json` in the root folder for Android Firebase services.

### 4. Running the Development Build

Because this app utilizes native modules (Firebase, Notifee, Android Widgets), generate and run a development build:

```bash
# Start Metro bundler
npx expo start

# Run on Android development build
npx expo run:android

# Run on iOS development build
npx expo run:ios
```

---

## ⚙️ Scripts

| Command | Description |
| :--- | :--- |
| `npm start` | Start the Expo development server |
| `npm run android` | Launch on Android device / emulator |
| `npm run ios` | Launch on iOS simulator |
| `npm run lint` | Run ESLint checks |
| `npx eas build` | Build standalone APK / AAB / IPA with EAS Build |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
