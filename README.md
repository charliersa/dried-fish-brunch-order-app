# 小魚乾 · 顧客手機點餐（獨立版）

這是「顧客手機點餐 + 即時叫號」的**獨立、自成一體**資料夾，可單獨部署給客人使用，與店內後台（廚房／收銀／管理）系統分開。

## 內容
- `index.html` — 顧客點餐頁（含公共叫號板），開啟資料夾即此頁
- `shared.js` — 共用資料/同步邏輯（菜單、Firestore 同步、裝置碼）
- `firebase-config.js` — Firebase 連線設定（**與店內系統相同**，訂單才會進到店家後台）
- `manifest.json`、`sw.js` — PWA（可安裝、可離線）
- `icon-192.svg`、`icon-512.svg` — App 圖示

## 它怎麼跟店家系統連動
透過 `firebase-config.js` 連到**同一個 Firestore**。顧客在這裡送出的訂單，會即時出現在店家的廚房／收銀；廚房按「完成」，這裡的叫號板會跳出可取餐號碼。菜單也來自雲端，店家在管理後台改菜單即同步生效。

## 部署方式（擇一）
- **任何靜態主機**：把整個 `order-app` 資料夾內容上傳即可（Netlify、Vercel、GitHub Pages、自家主機…）。
- **GitHub Pages（獨立 repo）**：把本資料夾內容放到新 repo 根目錄，啟用 Pages。
- 需以 **https**（或 localhost）開啟，Service Worker 與離線功能才會生效。

## 給客人用
把部署後的網址做成 **QR code** 貼在桌上／櫃檯，客人掃描即可點餐；點完隨時再開連結看「叫號板」確認自己號碼好了沒。

## 測試層 `test/`（改版先在這裡驗證，不影響營業）

`test/` 是整份點餐頁的複本，網址 https://charliersa.github.io/dried-fish-brunch-order-app/test/ 。
只要路徑含 `/test/`，`shared.js` 會自動切成測試模式，**資料與正式站完全分開**：

- Firestore 集合全部加 `test_` 前綴 → 測試訂單不會出現在廚房、收銀、叫號螢幕
- localStorage 的 key 也加前綴 → 不會蓋掉顧客正在進行中的訂單
- 推播端點清空 → 測試單不會震到店裡與顧客的手機
- 畫面最上方顯示橘色「🧪 測試站」橫幅

**改版流程**：改動先進 `test/` → 在測試站確認 → **打烊後**再把 `test/` 的檔案覆蓋到根目錄（正式站）。
給客人的 QR code 一律指向正式站（根目錄），不要指向 `test/`。

> Firestore 安全規則要允許 `test_` 開頭的集合讀寫，測試站才連得上。

## 維護注意
- `shared.js`、`firebase-config.js` 是從主專案複製過來的。**若日後主專案改了菜單預設或同步邏輯，要重新複製**這兩個檔過來（菜單若是在管理後台改、走雲端，則不必）。
- 本資料夾的 `sw.js` 快取版本獨立（`xyg-customer-pwa-v1`），與店內系統的 SW 互不影響。
