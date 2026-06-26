// 共享資料與常用函數
const MENU = [
  {
    id: 'toast',
    name: '吐司類',
    icon: '🍞',
    items: [
      { id: 't1', name: '起司蛋', price: 30 },
      { id: 't2', name: '蔬菜蛋', price: 30 },
      { id: 't3', name: '豬排蛋', price: 40 },
      { id: 't4', name: '麥香雞', price: 35 },
      { id: 't5', name: '鮪魚蛋', price: 40 },
    ],
  },
  {
    id: 'egg',
    name: '蛋餅類',
    icon: '🥞',
    items: [
      { id: 'e1', name: '起司', price: 30 },
      { id: 'e2', name: '蔬菜', price: 30 },
      { id: 'e3', name: '豬排', price: 40 },
      { id: 'e4', name: '鮪魚', price: 40 },
      { id: 'e5', name: '黃金泡菜', price: 40 },
    ],
  },
  {
    id: 'drink',
    name: '飲料類',
    icon: '🥤',
    temp: true,
    items: [
      { id: 'd1', name: '有糖豆漿', price: 25 },
      { id: 'd2', name: '紅茶', price: 20 },
      { id: 'd3', name: '奶茶', price: 30 },
      { id: 'd4', name: '鮮奶茶', price: 35 },
    ],
  },
  {
    id: 'snack',
    name: '點心類',
    icon: '🍰',
    items: [
      { id: 's1', name: '薯條', price: 35 },
      { id: 's2', name: '雞塊', price: 40 },
      { id: 's3', name: '蘿蔔糕', price: 40 },
    ],
  },
];

// ===== 餐點備註：可「用按的」快速選項（依菜單分類 id 對應，找不到就用 default）=====
// 想改文字／增減選項，直接編輯這裡即可（顧客點餐的商品詳情彈窗會用到）。
const NOTE_OPTIONS = {
  toast: ['不要沙拉', '不要蕃茄醬', '不要黑胡椒', '不要生菜', '不要蕃茄片', '不要小黃瓜'],
  egg: ['不要醬油膏', '不要辣椒醬', '不要蔥', '不要胡椒'],
  drink: ['去冰', '少冰', '微糖', '半糖', '無糖'],
  snack: ['不要胡椒鹽', '不要蕃茄醬', '要辣'],
  default: ['不要沙拉', '不要蕃茄醬', '不要黑胡椒', '不要生菜'],
};

function noteOptionsFor(catId) {
  return NOTE_OPTIONS[catId] || NOTE_OPTIONS.default;
}

const STORAGE_KEY = 'xyg-order-system';

function loadOrders() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch (error) {
    return [];
  }
}

function saveOrders(orders) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

// ===== 共用 Firebase 連線 =====
let _persistEnabled = false;
function ensureDb() {
  const hasConfig = typeof firebase !== 'undefined'
    && typeof FIREBASE_CONFIG !== 'undefined'
    && FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey;
  if (!hasConfig) return null;
  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    const db = firebase.firestore();
    // 離線持久化：把雲端資料快取到 IndexedDB，離線可讀寫、回連自動同步（必須在第一次操作前啟用一次）
    if (!_persistEnabled) {
      _persistEnabled = true;
      try {
        db.enablePersistence({ synchronizeTabs: true })
          .catch(e => console.warn('離線持久化未啟用：', e && e.code));
      } catch (e) { console.warn('離線持久化呼叫失敗', e); }
    }
    return db;
  } catch (e) {
    console.warn('Firebase 初始化失敗', e);
    return null;
  }
}

// ===== 裝置識別（離線單號防撞）=====
// 每台裝置首次開啟產生固定 deviceId；deviceCode 是顯示在取餐號前的代碼（可由 ?dev=A 或設定覆寫）
function getDeviceId() {
  let id = null;
  try { id = localStorage.getItem('xyg-device-id'); } catch (e) {}
  if (!id) {
    id = 'D' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try { localStorage.setItem('xyg-device-id', id); } catch (e) {}
  }
  return id;
}

function getDeviceCode() {
  let c = null;
  try { c = localStorage.getItem('xyg-device-code'); } catch (e) {}
  if (!c) {
    const id = getDeviceId();
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    c = String.fromCharCode(65 + (h % 26)); // 衍生一個字母當預設
  }
  return c;
}

function setDeviceCode(code) {
  code = (code || '').trim().toUpperCase().slice(0, 2);
  if (code) { try { localStorage.setItem('xyg-device-code', code); } catch (e) {} }
  return getDeviceCode();
}

// 讓店員可用網址 ?dev=A 一次設定該台裝置代碼（之後該裝置就記住）
function applyDeviceCodeFromUrl() {
  try {
    const p = new URLSearchParams(location.search).get('dev');
    if (p) setDeviceCode(p);
  } catch (e) {}
}

// ===== 資料同步層：Firebase 雲端即時同步，localStorage 離線備援 =====
// 線上（有設定 firebase-config.js）→ 跨裝置即時同步
// 離線 / APK / 未設定 → 自動退回單機 localStorage
const SYNC = {
  db: null,
  mode: 'local', // 'cloud' | 'local'
  onChange: null,
  pollTimer: null,
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// 註冊資料變更監聽；callback 會在初次與每次資料變動時被呼叫，帶入最新訂單陣列
// opts.today = true → 只訂閱「今天」的訂單（點餐/廚房/收銀/叫號用，避免下載全部歷史）
// 不帶 opts → 訂閱全部歷史（管理後台報表用）
function initSync(onChange, opts) {
  opts = opts || {};
  SYNC.onChange = onChange;
  const db = ensureDb();
  if (db) {
    SYNC.db = db;
    SYNC.mode = 'cloud';
    let query = db.collection('orders').orderBy('createdAt', 'asc');
    if (opts.today) {
      query = db.collection('orders').where('createdAt', '>=', startOfToday()).orderBy('createdAt', 'asc');
    }
    query.onSnapshot(
      snap => {
        const list = snap.docs.map(doc => Object.assign({ id: doc.id }, doc.data()));
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) {}
        if (SYNC.onChange) SYNC.onChange(list);
      },
      err => {
        console.warn('雲端同步中斷，改用本機模式', err);
        startLocalSync();
      }
    );
    return;
  }
  startLocalSync();
}

function startLocalSync() {
  SYNC.mode = 'local';
  const tick = () => { if (SYNC.onChange) SYNC.onChange(loadOrders()); };
  tick();
  if (SYNC.pollTimer) clearInterval(SYNC.pollTimer);
  SYNC.pollTimer = setInterval(tick, 2000);
}

function syncAddOrder(order) {
  if (SYNC.mode === 'cloud' && SYNC.db) {
    return SYNC.db.collection('orders').doc(String(order.id)).set(order)
      .catch(e => console.warn('新增訂單失敗', e));
  }
  const orders = loadOrders();
  orders.push(order);
  saveOrders(orders);
  if (SYNC.onChange) SYNC.onChange(orders);
  return Promise.resolve();
}

function syncUpdateOrder(id, changes) {
  if (SYNC.mode === 'cloud' && SYNC.db) {
    return SYNC.db.collection('orders').doc(String(id)).update(changes)
      .catch(e => console.warn('更新訂單失敗', e));
  }
  const orders = loadOrders();
  const order = orders.find(o => o.id === id);
  if (order) { Object.assign(order, changes); saveOrders(orders); }
  if (SYNC.onChange) SYNC.onChange(orders);
  return Promise.resolve();
}

// opts.todayOnly = true → 只清除今天的訂單（保留歷史，報表不受影響）
function syncClearOrders(opts) {
  opts = opts || {};
  if (SYNC.mode === 'cloud' && SYNC.db) {
    const base = SYNC.db.collection('orders');
    const getP = opts.todayOnly ? base.where('createdAt', '>=', startOfToday()).get() : base.get();
    return getP.then(snap => {
      const batch = SYNC.db.batch();
      snap.docs.forEach(doc => batch.delete(doc.ref));
      return batch.commit();
    }).catch(e => console.warn('清除訂單失敗', e));
  }
  if (opts.todayOnly) {
    const remain = loadOrders().filter(o => !isToday(o.createdAt));
    saveOrders(remain);
    if (SYNC.onChange) SYNC.onChange(remain);
  } else {
    saveOrders([]);
    if (SYNC.onChange) SYNC.onChange([]);
  }
  return Promise.resolve();
}

function syncModeLabel() {
  return SYNC.mode === 'cloud' ? '☁️ 雲端即時同步' : '🔄 本機儲存';
}

// ===== 營運設定同步層：菜單 + 員工/食材/設備/成本（Firestore doc config/admin，localStorage 備援）=====
const DEFAULT_ENT = {
  staff: [
    { id: 'st1', name: '阿美', role: '內場煎台', wage: 200, hours: 176 },
    { id: 'st2', name: '小宇', role: '外場收銀', wage: 185, hours: 160 },
    { id: 'st3', name: '阿志', role: '外送兼職', wage: 183, hours: 88 },
  ],
  ingredients: [
    { id: 'ig1', name: '白吐司', unit: '條', stock: 22, lowAt: 12, supplier: '義美食品' },
    { id: 'ig2', name: '雞蛋', unit: '顆', stock: 180, lowAt: 80, supplier: '大成' },
    { id: 'ig3', name: '豆漿', unit: '公升', stock: 9, lowAt: 10, supplier: '義美食品' },
    { id: 'ig4', name: '起司片', unit: '片', stock: 95, lowAt: 50, supplier: '安佳' },
    { id: 'ig5', name: '豬排', unit: '片', stock: 40, lowAt: 30, supplier: '卜蜂' },
    { id: 'ig6', name: '紅茶葉', unit: '包', stock: 14, lowAt: 6, supplier: '立頓' },
  ],
  equipment: [
    { id: 'eq1', name: '瓦斯煎台', status: '正常', lastService: '2026/05/18' },
    { id: 'eq2', name: '冷藏冰箱', status: '保養中', lastService: '2026/06/10' },
    { id: 'eq3', name: '飲料冷飲機', status: '正常', lastService: '2026/04/22' },
    { id: 'eq4', name: '烤吐司機', status: '維修中', lastService: '2026/06/20' },
    { id: 'eq5', name: 'POS 收銀機', status: '正常', lastService: '2026/03/30' },
  ],
  costs: [
    { id: 'c1', label: '店租', amount: 42000 },
    { id: 'c2', label: '食材進貨', amount: 56000 },
    { id: 'c3', label: '水電瓦斯', amount: 13500 },
    { id: 'c4', label: '耗材雜支', amount: 6800 },
  ],
};

// 目前生效的菜單（會被設定同步更新）；預設用 MENU 並補上 active/soldOut 欄位
let CURRENT_MENU = MENU.map(cat => Object.assign({}, cat, {
  items: cat.items.map(it => Object.assign({ active: true, soldOut: false }, it)),
}));

const CONFIG_LS = 'xyg-config';
const CONFIG = { db: null, mode: 'local', onChange: null, pollTimer: null, data: null };

function defaultConfig() {
  return { menu: CURRENT_MENU, ent: JSON.parse(JSON.stringify(DEFAULT_ENT)) };
}

function normalizeConfig(d) {
  if (!d) d = defaultConfig();
  d.menu = (d.menu && d.menu.length) ? d.menu : CURRENT_MENU;
  d.ent = Object.assign({ staff: [], ingredients: [], equipment: [], costs: [] }, d.ent || {});
  return d;
}

// 註冊營運設定變更監聽；callback 帶入 { menu, ent }
function initConfig(onChange) {
  CONFIG.onChange = onChange;
  const db = ensureDb();
  if (db) {
    CONFIG.db = db;
    CONFIG.mode = 'cloud';
    db.collection('config').doc('admin').onSnapshot(
      snap => {
        let d = snap.exists ? snap.data() : null;
        if (!d) { d = defaultConfig(); db.collection('config').doc('admin').set(d).catch(() => {}); }
        d = normalizeConfig(d);
        CONFIG.data = d;
        CURRENT_MENU = d.menu;
        const json = JSON.stringify(d);
        if (json === CONFIG._lastJson) return; // 設定沒變就不重畫
        CONFIG._lastJson = json;
        if (CONFIG.onChange) CONFIG.onChange(d);
      },
      err => { console.warn('設定同步中斷，改用本機', err); startLocalConfig(); }
    );
    return;
  }
  startLocalConfig();
}

function startLocalConfig() {
  CONFIG.mode = 'local';
  const tick = () => {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(CONFIG_LS) || 'null'); } catch (e) {}
    d = normalizeConfig(d);
    CONFIG.data = d;
    CURRENT_MENU = d.menu;
    const json = JSON.stringify(d);
    if (json === CONFIG._lastJson) return; // 設定沒變就不重畫
    CONFIG._lastJson = json;
    if (CONFIG.onChange) CONFIG.onChange(d);
  };
  tick();
  if (CONFIG.pollTimer) clearInterval(CONFIG.pollTimer);
  CONFIG.pollTimer = setInterval(tick, 3000);
}

function saveConfig(data) {
  data = normalizeConfig(data);
  CONFIG.data = data;
  CURRENT_MENU = data.menu;
  if (CONFIG.mode === 'cloud' && CONFIG.db) {
    return CONFIG.db.collection('config').doc('admin').set(data).catch(e => console.warn('設定儲存失敗', e));
  }
  try { localStorage.setItem(CONFIG_LS, JSON.stringify(data)); } catch (e) {}
  if (CONFIG.onChange) CONFIG.onChange(data);
  return Promise.resolve();
}

function saveMenu(menu) {
  return saveConfig(Object.assign({}, CONFIG.data || defaultConfig(), { menu }));
}
function saveEnt(ent) {
  return saveConfig(Object.assign({}, CONFIG.data || defaultConfig(), { ent }));
}

function getItem(itemId) {
  return CURRENT_MENU.flatMap(cat => cat.items).find(item => item.id === itemId);
}

function isToday(timestamp) {
  return new Date(timestamp).toLocaleDateString('zh-TW') === new Date().toLocaleDateString('zh-TW');
}

// 取餐號 = 裝置代碼 + 本機當日序號（每台只數自己的單，離線也不會跨裝置撞號）
function orderNo(orders) {
  const me = getDeviceId();
  const mineToday = orders.filter(o => isToday(o.createdAt) && o.deviceId === me).length;
  return getDeviceCode() + String(mineToday + 1).padStart(2, '0');
}

function todayKey() {
  const d = new Date();
  return '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
}

// 全店唯一取餐號（顧客手機用）：線上以 Firestore 交易在 config/counter-YYYYMMDD 原子遞增，保證不撞號；
// 離線或失敗回傳 null，由呼叫端退回 orderNo() 的裝置前綴方案。
async function nextDailyNo() {
  const db = ensureDb();
  if (!db) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null; // 離線直接退回備援，避免交易卡住
  try {
    const ref = db.collection('config').doc('counter-' + todayKey());
    const seq = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const cur = (snap.exists && snap.data() && snap.data().seq) ? snap.data().seq : 0;
      const next = cur + 1;
      tx.set(ref, { seq: next }, { merge: true });
      return next;
    });
    return String(seq).padStart(2, '0');
  } catch (e) {
    console.warn('取號交易失敗，改用裝置前綴', e);
    return null;
  }
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showMessage(text) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toast.hideTimer);
  toast.hideTimer = setTimeout(() => toast.classList.remove('show'), 2000);
}

function getSharedStyles() {
  return `
    :root {
      --bg-top: #e6f4fa;
      --bg-bot: #bfe0ee;
      --ink: #1c5e7a;
      --ink-soft: #4690ae;
      --pink: #ec6398;
      --pink-deep: #d84b84;
      --line: #d3e9f2;
      --card: #ffffff;
      --blue: #3e9bd1;
      --green: #3fa877;
      --amber: #e89a2b;
      --blue-bg: #e3f1fb;
      --green-bg: #e1f4ea;
      --pink-bg: #fceaf1;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      min-height: 100%;
      background: linear-gradient(180deg, var(--bg-top), var(--bg-bot));
      font-family: 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif;
      color: var(--ink);
    }

    body {
      padding-bottom: 100px;
    }

    button,
    input {
      font: inherit;
    }

    button {
      cursor: pointer;
    }

    .page {
      max-width: 1100px;
      margin: 0 auto;
    }

    header {
      position: relative;
      background: linear-gradient(120deg, var(--ink-soft), #6fb7d0);
      color: #fff;
      padding-bottom: 30px;
    }

    .top-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      padding: 16px 18px 6px;
      gap: 12px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-logo {
      width: 46px;
      height: 46px;
      border-radius: 50%;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      box-shadow: 0 3px 8px rgba(0, 0, 0, .15);
    }

    .brand-text h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 900;
      letter-spacing: 4px;
      text-shadow: 0 1px 0 rgba(30, 87, 125, .8);
    }

    .brand-text p {
      margin: 4px 0 0;
      font-size: 11px;
      letter-spacing: 3px;
      opacity: .9;
    }

    .info-chip,
    .address {
      font-size: 12px;
      opacity: .95;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .address {
      opacity: .92;
      padding: 0 18px 4px;
      gap: 5px;
    }

    .nav-pills {
      display: flex;
      gap: 8px;
      padding: 10px 18px 0;
      overflow-x: auto;
    }

    .nav-pills a,
    .nav-pills button {
      border: none;
      border-radius: 999px;
      padding: 9px 16px;
      font-size: 14px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 255, 255, .22);
      color: #fff;
      white-space: nowrap;
      text-decoration: none;
      cursor: pointer;
    }

    .nav-pills a:hover {
      background: rgba(255, 255, 255, .35);
    }

    main {
      padding: 18px 16px 40px;
    }

    .section {
      margin-bottom: 22px;
    }

    .section-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }

    .section-title h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 900;
    }

    .section-divider {
      flex: 1;
      height: 2px;
      background: var(--line);
      border-radius: 2px;
    }

    .grid {
      display: grid;
      gap: 10px;
    }

    .card {
      background: var(--card);
      border-radius: 18px;
      padding: 12px 14px;
      box-shadow: 0 2px 6px rgba(28, 94, 122, .07);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
    }

    .button-primary {
      border: none;
      border-radius: 999px;
      padding: 8px 14px;
      background: var(--pink);
      color: #fff;
      font-weight: 700;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
    }

    .pill-button {
      border: 1.5px solid var(--line);
      background: #fff;
      color: var(--ink-soft);
      cursor: pointer;
      font-size: 12px;
      font-weight: 700;
      padding: 7px 12px;
      border-radius: 999px;
    }

    .toast {
      position: fixed;
      left: 50%;
      bottom: 24px;
      transform: translateX(-50%);
      background: rgba(28, 94, 122, .95);
      color: #fff;
      padding: 12px 18px;
      border-radius: 999px;
      box-shadow: 0 8px 20px rgba(0, 0, 0, .15);
      opacity: 0;
      pointer-events: none;
      transition: opacity .2s ease;
      z-index: 90;
    }

    .toast.show {
      opacity: 1;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 14px;
    }

    .stat-card {
      background: #fff;
      border-radius: 16px;
      padding: 12px 10px;
      text-align: center;
      box-shadow: 0 2px 6px rgba(28, 94, 122, .06);
    }

    .order-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 12px;
    }

    .order-card {
      background: #fff;
      border-radius: 18px;
      padding: 14px;
      box-shadow: 0 3px 10px rgba(28, 94, 122, .08);
      border-top: 4px solid;
    }

    .order-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      gap: 8px;
      flex-wrap: wrap;
    }

    .order-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 8px;
      color: var(--ink-soft);
      flex-wrap: wrap;
    }

    .order-items {
      border-top: 1px solid var(--line);
      padding-top: 8px;
    }

    .item-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 14px;
      padding: 2px 0;
    }

    .order-note {
      font-size: 13px;
      color: var(--amber);
      margin-top: 6px;
      background: rgba(232, 154, 43, .1);
      border-radius: 8px;
      padding: 5px 8px;
    }

    .order-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid var(--line);
    }

    @media (max-width: 768px) {
      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `;
}
