/* 小魚乾 · PWA 安裝提示
   各站共用、無相依。用法：<script src="pwa-install.js" data-note="..." defer></script>
   - Android / 桌面 Chrome：攔 beforeinstallprompt，顯示「安裝」橫幅
   - iPhone Safari：顯示「分享 → 加入主畫面」圖解
   - LINE / FB 內建瀏覽器：提示改用外部瀏覽器開啟（內建瀏覽器無法安裝）
   - 已安裝（standalone）→ 完全不顯示
   另外：畫面上任何有 data-pwa-install 屬性的元素，會在可安裝時自動顯示、點擊即開啟安裝
*/
(function () {
  'use strict';

  var DISMISS_KEY = 'xyg-pwa-install-dismissed';
  var DISMISS_DAYS = 14;

  var self_script = document.currentScript ||
    document.querySelector('script[src$="pwa-install.js"]');
  var NOTE = (self_script && self_script.getAttribute('data-note')) ||
    '開啟更快，離線也看得到菜單';

  var ua = navigator.userAgent;
  var isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isInApp = /Line\/|FBAN|FBAV|Instagram|MicroMessenger/i.test(ua);
  var standalone = window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (standalone) return;                    // 已經是 App 模式，不用提示
  if (isIOS && !/Safari/.test(ua) && !isInApp) return;  // iOS 上非 Safari 也裝不了

  function appName() {
    var m = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    return (m && m.content) || document.title || '小魚乾';
  }

  function dismissed() {
    try {
      var t = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
      return t && (Date.now() - t) < DISMISS_DAYS * 864e5;
    } catch (e) { return false; }
  }

  function remember() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {}
  }

  /* ---------- 樣式 ---------- */
  var css = '' +
    '#xyg-pwa{position:fixed;top:0;left:0;right:0;z-index:9000;display:flex;justify-content:center;' +
    'padding:calc(env(safe-area-inset-top) + 8px) 10px 8px;pointer-events:none;' +
    'transform:translateY(-130%);transition:transform .32s cubic-bezier(.2,.8,.3,1);}' +
    '#xyg-pwa.on{transform:none;}' +
    '#xyg-pwa .box{pointer-events:auto;width:100%;max-width:520px;display:flex;align-items:center;gap:11px;' +
    'background:#fff;color:#1c5e7a;border-radius:16px;padding:11px 12px;' +
    'box-shadow:0 10px 26px rgba(20,50,65,.28);' +
    'font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;}' +
    '#xyg-pwa img{width:42px;height:42px;border-radius:12px;flex:0 0 auto;}' +
    '#xyg-pwa .txt{flex:1 1 auto;min-width:0;line-height:1.35;}' +
    '#xyg-pwa .t1{font-weight:900;font-size:14px;}' +
    '#xyg-pwa .t2{font-size:12px;color:#4690ae;margin-top:1px;}' +
    '#xyg-pwa button{font:inherit;cursor:pointer;}' +
    '#xyg-pwa .go{flex:0 0 auto;border:none;background:#ec6398;color:#fff;font-weight:900;font-size:13px;' +
    'padding:9px 15px;border-radius:999px;box-shadow:0 4px 12px rgba(216,75,132,.35);}' +
    '#xyg-pwa .x{flex:0 0 auto;border:none;background:transparent;color:#8fb6c8;font-size:19px;' +
    'line-height:1;padding:4px 2px;}' +
    '#xyg-guide{position:fixed;inset:0;z-index:9001;background:rgba(20,50,65,.5);display:flex;' +
    'align-items:flex-end;justify-content:center;' +
    'font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;}' +
    '#xyg-guide .card{width:100%;max-width:520px;background:#f4fafd;color:#1c5e7a;' +
    'border-radius:22px 22px 0 0;padding:20px 20px calc(env(safe-area-inset-bottom) + 24px);}' +
    '#xyg-guide h3{margin:0 0 4px;font-size:17px;}' +
    '#xyg-guide p{margin:0 0 14px;font-size:13px;color:#4690ae;}' +
    '#xyg-guide ol{margin:0;padding-left:20px;font-size:14px;line-height:2;}' +
    '#xyg-guide .k{display:inline-block;background:#fff;border:1px solid #d3e9f2;border-radius:8px;' +
    'padding:1px 8px;font-weight:800;}' +
    '#xyg-guide .close{margin-top:18px;width:100%;border:none;background:#1c5e7a;color:#fff;' +
    'font-weight:900;font-size:15px;padding:13px;border-radius:14px;cursor:pointer;font-family:inherit;}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ---------- 橫幅 ---------- */
  var deferred = null;   // beforeinstallprompt 事件
  var bar = null;

  function iconSrc() {
    var l = document.querySelector('link[rel="apple-touch-icon"]');
    return (l && l.getAttribute('href')) || 'icon-192.png';
  }

  function showBar(title, btnText, onGo) {
    if (bar || dismissed()) return;
    bar = document.createElement('div');
    bar.id = 'xyg-pwa';
    bar.innerHTML =
      '<div class="box">' +
      '<img src="' + iconSrc() + '" alt="">' +
      '<div class="txt"><div class="t1"></div><div class="t2"></div></div>' +
      '<button type="button" class="go"></button>' +
      '<button type="button" class="x" aria-label="關閉">&times;</button>' +
      '</div>';
    bar.querySelector('.t1').textContent = title;
    bar.querySelector('.t2').textContent = NOTE;
    bar.querySelector('.go').textContent = btnText;
    bar.querySelector('.go').addEventListener('click', onGo);
    bar.querySelector('.x').addEventListener('click', function () {
      remember();
      hideBar();
    });
    document.body.appendChild(bar);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { bar.classList.add('on'); });
    });
  }

  function hideBar() {
    if (!bar) return;
    var b = bar;
    bar = null;
    b.classList.remove('on');
    setTimeout(function () { b.remove(); }, 350);
  }

  /* ---------- iOS / 內建瀏覽器圖解 ---------- */
  function showGuide() {
    var wrap = document.createElement('div');
    wrap.id = 'xyg-guide';
    var steps = isInApp
      ? '<ol>' +
        '<li>點右上角 <span class="k">⋯</span> 或 <span class="k">↗</span></li>' +
        '<li>選 <span class="k">用預設瀏覽器開啟</span></li>' +
        '<li>再依照瀏覽器的「加入主畫面」安裝</li>' +
        '</ol>'
      : '<ol>' +
        '<li>點畫面最下方的 <span class="k">分享 ⬆️</span></li>' +
        '<li>往下滑，選 <span class="k">加入主畫面</span></li>' +
        '<li>右上角按 <span class="k">新增</span> 就完成了</li>' +
        '</ol>';
    wrap.innerHTML =
      '<div class="card">' +
      '<h3>' + (isInApp ? '請用瀏覽器開啟才能安裝' : '把「' + appName() + '」放到主畫面') + '</h3>' +
      '<p>' + (isInApp ? 'LINE／FB 內建瀏覽器無法安裝 App。' : NOTE) + '</p>' +
      steps +
      '<button type="button" class="close">知道了</button>' +
      '</div>';
    function close(e) {
      if (e.target === wrap || e.target.classList.contains('close')) {
        wrap.remove();
        remember();
        hideBar();
      }
    }
    wrap.addEventListener('click', close);
    document.body.appendChild(wrap);
  }

  /* ---------- 頁面上的自訂觸發鈕 ---------- */
  function triggers() {
    return Array.prototype.slice.call(document.querySelectorAll('[data-pwa-install]'));
  }

  function showTriggers() {
    triggers().forEach(function (el) { el.style.display = ''; });
  }

  // 立刻掛上點擊事件（defer 執行時 DOM 已經在了），避免按鈕先亮出來卻還沒作用
  triggers().forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      install();
    });
  });

  function start() {
    if (deferred) {
      showTriggers();
      showBar('安裝「' + appName() + '」', '安裝', install);
    } else if (isIOS || isInApp) {
      showTriggers();
      showBar(isInApp ? '用瀏覽器開啟更好用' : '加到主畫面像 App 一樣用',
        isInApp ? '看說明' : '怎麼裝', showGuide);
    }
  }

  function install() {
    if (!deferred) {
      showGuide();
      return;
    }
    try {
      deferred.prompt();
      deferred.userChoice.then(function (r) {
        if (r.outcome !== 'accepted') remember();
        deferred = null;
        hideBar();
      });
    } catch (e) {          // 同一個事件只能用一次，重按就直接收起來
      deferred = null;
      hideBar();
    }
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    showTriggers();
    if (!bar) showBar('安裝「' + appName() + '」', '安裝', install);
  });

  window.addEventListener('appinstalled', function () {
    try { localStorage.removeItem(DISMISS_KEY); } catch (e) {}
    deferred = null;
    hideBar();
    triggers().forEach(function (el) { el.style.display = 'none'; });
  });

  // 給外部呼叫：window.xygInstall() → 不管有沒有被關掉都再問一次
  window.xygInstall = function () {
    try { localStorage.removeItem(DISMISS_KEY); } catch (e) {}
    install();
  };

  // 等 beforeinstallprompt 有機會先觸發，再決定要顯示哪一種提示
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 1800); });
  } else {
    setTimeout(start, 1800);
  }
})();
