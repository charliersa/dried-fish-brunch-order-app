/* 小魚乾 · 顧客端在線人數（後台的「現在幾人在看」）
   顧客頁：<script src="presence.js" data-page="手機點餐"></script>
           → 每 60 秒往 Firestore presence/<deviceId> 寫一次心跳；分頁切到背景就停、
             回到前景馬上補一次；離開頁面時把自己那筆刪掉，後台就會即時少一人。
             另外 5 分鐘沒有任何操作就當作沒人在看（店內點餐機整天開著不會灌水）
   後台　：<script src="presence.js"></script> ＋ xygPresence.watch(cb)
           → cb({ total, byPage })，只算 STALE_MS 內還有心跳的人

   放在各站自己的目錄（跟 shared.js 平行），不進 core submodule。
   集合名稱走 shared.js 的 ensureDb()，所以 /test/ 會自動變成 test_presence。
   ※ Firestore 規則要允許 presence（與 test_presence）讀寫，否則人數永遠是 0。
*/
(function () {
  'use strict';

  var COLL = 'presence';
  var BEAT_MS = 60000;    // 心跳間隔：每人每分鐘 1 次寫入
  var STALE_MS = 150000;  // 超過 2.5 分鐘沒心跳＝已離開
  var IDLE_MS = 300000;   // 5 分鐘沒有任何操作＝沒人在看（店內點餐機整天開著也不會一直算人）
  var TICK_MS = 15000;    // 後台重新計算的間隔（讓過期的人自己消失）
  var PURGE_MS = 7200000; // 清掉 2 小時以上的殘留紀錄

  function db() {
    try {
      return typeof ensureDb === 'function' ? ensureDb() : null;
    } catch (e) {
      return null;
    }
  }

  function myId() {
    try {
      if (typeof getDeviceId === 'function') return getDeviceId();
    } catch (e) {}
    // 沒有 shared.js 時的退路（正常不會走到）
    var k = 'xyg-device-id', id = null;
    try { id = localStorage.getItem(k); } catch (e) {}
    if (!id) {
      id = 'D' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      try { localStorage.setItem(k, id); } catch (e) {}
    }
    return id;
  }

  /* ---------------- 顧客端：送心跳 ---------------- */
  function beat(page) {
    var d = db();
    if (!d) return;
    var ref;
    try { ref = d.collection(COLL).doc(myId()); } catch (e) { return; }

    var timer = null;
    var lastActive = Date.now();
    var listed = false;   // 目前有沒有把自己算進去

    // 店內點餐機整天開著，沒人碰也會一直回報 → 一段時間沒有任何操作就不算「在看」
    function active() {
      return Date.now() - lastActive < IDLE_MS;
    }

    function ping() {
      if (!active()) {
        if (listed) drop();          // 剛變成閒置 → 立刻從人數中拿掉，不用等過期
        return;
      }
      // 先當成已列入：離線時 set() 的 Promise 會一直卡著不 resolve，
      // 等它回來才記錄的話，之後就再也不會把自己刪掉了
      listed = true;
      ref.set({ ts: Date.now(), page: page || '顧客端' })
        .catch(function (e) { console.warn('[presence] 心跳失敗', e && e.code); });
    }

    function drop() {
      listed = false;
      ref.delete().catch(function () {});
    }

    function startTimer() {
      if (timer) return;
      ping();
      timer = setInterval(ping, BEAT_MS);
    }

    function stopTimer() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    }

    function touch() {
      var wasIdle = !active();
      lastActive = Date.now();
      if (wasIdle && timer) ping();   // 閒置後又有人操作 → 馬上報到
    }

    ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(function (ev) {
      window.addEventListener(ev, touch, { passive: true });
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        stopTimer();
      } else {
        lastActive = Date.now();      // 切回前景等於有人在看
        startTimer();
      }
    });

    // 關掉／切走頁面：盡力刪掉自己那筆，來不及也沒關係，後台 2.5 分鐘後會判定離線
    window.addEventListener('pagehide', function () {
      stopTimer();
      drop();
    });

    if (document.visibilityState !== 'hidden') startTimer();
  }

  /* ---------------- 後台：看人數 ---------------- */
  function watch(cb) {
    var d = db();
    if (!d) return function () {};

    var docs = {};
    var unsub = null;

    function emit() {
      var cutoff = Date.now() - STALE_MS;
      var total = 0, byPage = {};
      Object.keys(docs).forEach(function (id) {
        var p = docs[id];
        if (!p || !(p.ts >= cutoff)) return;
        total++;
        var name = p.page || '顧客端';
        byPage[name] = (byPage[name] || 0) + 1;
      });
      cb({ total: total, byPage: byPage });
    }

    function subscribe() {
      if (unsub) { try { unsub(); } catch (e) {} }
      // 只訂閱還活著的紀錄；門檻每分鐘換新的，久沒回來的人就會從結果裡掉出去
      unsub = d.collection(COLL).where('ts', '>=', Date.now() - STALE_MS).onSnapshot(
        function (snap) {
          docs = {};
          snap.forEach(function (doc) { docs[doc.id] = doc.data() || {}; });
          emit();
        },
        function (e) {
          console.warn('[presence] 讀取中斷', e && e.code);
          docs = {};
          emit();
        }
      );
    }

    subscribe();
    // 沒有新快照進來時也要重算（有人離開是「不再寫入」，不會觸發 onSnapshot）
    var tick = setInterval(emit, TICK_MS);
    var resub = setInterval(subscribe, BEAT_MS);
    purge(d);

    return function () {
      clearInterval(tick);
      clearInterval(resub);
      if (unsub) { try { unsub(); } catch (e) {} }
    };
  }

  // 沒能在離開時刪掉的殘留紀錄，開後台時順手清一批，別讓集合無限長大
  function purge(d) {
    try {
      d.collection(COLL).where('ts', '<', Date.now() - PURGE_MS).limit(200).get()
        .then(function (snap) {
          if (snap.empty) return;
          var batch = d.batch();
          snap.forEach(function (doc) { batch.delete(doc.ref); });
          return batch.commit();
        })
        .catch(function () {});
    } catch (e) {}
  }

  window.xygPresence = { beat: beat, watch: watch, STALE_MS: STALE_MS };

  // 有 data-page 就是顧客頁面，直接開始送心跳
  var tag = document.currentScript ||
    document.querySelector('script[src$="presence.js"]');
  var page = tag && tag.getAttribute('data-page');
  if (page) beat(page);
})();
