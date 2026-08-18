// ===== Firebase 設定 =====
// 已設定 → 啟用「跨裝置即時同步」(Firestore)。
// 連不上時系統會自動退回「本機模式」(localStorage)，網頁/APK 仍可正常運作。

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDyca-tySP5q259uWe2LcEHRRt-BCs-jDc",
  authDomain: "dried-fish-brunch.firebaseapp.com",
  projectId: "dried-fish-brunch",
  storageBucket: "dried-fish-brunch.firebasestorage.app",
  messagingSenderId: "109591710302",
  appId: "1:109591710302:web:c28ba1576d82d0802802cf",
  measurementId: "G-VQ3GZLB92V"
};

// ===== 本站專用：餐點備註快捷選項 =====
// core/shared.js 的預設是店內版；顧客手機點餐頁沿用原本自己的選項（飲料要有去冰／少冰）。
// 這個檔比 core/shared.js 先載入，定義了就會蓋過 core 的預設。
const SITE_NOTE_OPTIONS = {
  toast: ['不要沙拉', '不要蕃茄醬', '不要黑胡椒', '不要生菜', '不要蕃茄片', '不要小黃瓜'],
  egg: ['不要醬油膏', '不要辣椒醬', '不要蔥', '不要胡椒'],
  drink: [], // 飲料不提供冰量/糖度快捷選項（店主 2026-08-18 要求移除），顧客仍可用「其他備註」欄
  snack: ['不要胡椒鹽', '不要蕃茄醬', '要辣'],
  default: ['不要沙拉', '不要蕃茄醬', '不要黑胡椒', '不要生菜'],
};

// ===== 推播通知設定（餐點完成時通知顧客手機）=====
// 兩個值都要填：① vapidKey（顧客端用） ② notifyEndpoint（廚房端用）
const PUSH_CONFIG = {
  // Firebase 主控台 → 專案設定 → Cloud Messaging → 網路推送憑證（Web Push certificates）→ 產生金鑰對
  vapidKey: 'BLJ8kVxrh5r1K529hX2hf7X8mjgalB5lWfA3StFGXLxbPsSO-2xlJCLXaXjDQh7BLO7-Gom1YRvurFEHk1_pkgE',
  // push-server 部署到 Vercel 後的網址，結尾加 /api/notify
  notifyEndpoint: 'https://push-server-rho.vercel.app/api/notify',
  // 顧客送出訂單 → 推播到後端(廚房/收銀)裝置
  notifyBackendEndpoint: 'https://push-server-rho.vercel.app/api/notify-backend',
};
