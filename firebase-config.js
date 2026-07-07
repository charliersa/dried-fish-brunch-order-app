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

// ===== 推播通知設定（餐點完成時通知顧客手機）=====
// 兩個值都要填：① vapidKey（顧客端用） ② notifyEndpoint（廚房端用）
const PUSH_CONFIG = {
  // Firebase 主控台 → 專案設定 → Cloud Messaging → 網路推送憑證（Web Push certificates）→ 產生金鑰對
  vapidKey: 'BLJ8kVxrh5r1K529hX2hf7X8mjgalB5lWfA3StFGXLxbPsSO-2xlJCLXaXjDQh7BLO7-Gom1YRvurFEHk1_pkgE',
  // push-server 部署到 Vercel 後的網址，結尾加 /api/notify
  notifyEndpoint: 'https://push-server-rho.vercel.app/api/notify',
};
