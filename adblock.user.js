// ==UserScript==
// @name         广告拦截 · AdBlock Lite
// @namespace    local.xbrowser.adblock
// @version      1.2.0
// @description  拦截广告与追踪请求、清理广告元素、隐藏广告位，支持 YouTube 广告跳过。轻量、无规则订阅、不吃内存。
// @author       me
// @match        *://*/*
// @run-at       document-start
// @grant        none
// @updateURL    https://orange123eee.github.io/xb-plugins/adblock.user.js
// @downloadURL  https://orange123eee.github.io/xb-plugins/adblock.user.js
// ==/UserScript==

(function () {
  'use strict';

  var VERSION = '1.2.0';
  var HOST = location.hostname.toLowerCase();

  // 已经跑过就别重复注入（有些站会二次执行）
  if (window.__xbAdblock) return;
  window.__xbAdblock = VERSION;

  // 本站被关掉了就别动
  var OFF_KEY = 'xbab.off:' + HOST;
  try { if (localStorage.getItem(OFF_KEY) === '1') return; } catch (e) {}

  // ---------- 拦截名单 ----------
  // 只放"纯广告/追踪"域名，宁缺毋滥，避免把网站功能拦坏
  var HOSTS = [
    // Google 广告
    'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
    'adservice.google.com', 'pagead2.googlesyndication.com', 'adclick.g.doubleclick.net',
    // 国际广告交易平台
    'adnxs.com', 'adsrvr.org', 'rubiconproject.com', 'pubmatic.com', 'casalemedia.com',
    'openx.net', 'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com',
    'revcontent.com', 'mgid.com', 'adform.net', 'smartadserver.com', 'teads.tv',
    'adroll.com', 'bidswitch.net', 'sharethrough.com', 'triplelift.com',
    // 弹窗 / 成人流量联盟
    'popads.net', 'popcash.net', 'propellerads.com', 'propellerpops.com',
    'adcash.com', 'exoclick.com', 'exosrv.com', 'juicyads.com', 'trafficjunky.net',
    'adsterra.com', 'ad-maven.com', 'clickadu.com', 'hilltopads.net', 'onclckds.com',
    'tsyndicate.com', 'trafficstars.com', 'adnium.com', 'a-ads.com',
    // 同类站常见（ExoClick / TrafficJunky / Adsterra 系的新域名）
    'exdynsrv.com', 'realsrv.com', 'magsrv.com', 'pemsrv.com', 'adsco.re',
    'zlinkd.com', 's.zlinkd.com', 'pmtk.io', 'adspy.de', 'trafficfactory.biz',
    'onclickalgo.com', 'onclickmega.com', 'onclckmn.com', 'tsyndicate.net',
    'creative-sb1.com', 'creative-bcf.com', 'a.magsrv.com', 'syndication.exdynsrv.com',
    'juicyads.net', 'js.juicyads.com', 'puhtml.com', 'adnium.net', 'cams.gratis',
    // missav 这类站实测用到的
    'snaptrckr.fun', 'rallytrck.website', 'mayzaent.com', 'mavrtracktor.com',
    'googletagmanager.com', 'googletagservices.com',
    // 统计 / 追踪
    'scorecardresearch.com', 'quantserve.com', 'hotjar.com', 'mouseflow.com',
    'fullstory.com', 'smartlook.com', 'clarity.ms', 'branch.io',
    // 国内
    'pos.baidu.com', 'cbjs.baidu.com', 'cpro.baidu.com', 'hm.baidu.com',
    'cnzz.com', 'umeng.com', 'growingio.com', 'sensorsdata.cn',
    'atm.youku.com', 'valf.atm.youku.com', 'ad.m.iqiyi.com', 'api.cupid.iqiyi.com',
    'ads.mgtv.com', 'ad.video.qq.com', 'adslvseed.qq.com'
  ];

  // 编译成一个正则，热路径上只跑一次匹配
  var RE = new RegExp('(^|\\.)(' + HOSTS.map(function (d) {
    return d.replace(/\./g, '\\.');
  }).join('|') + ')$', 'i');

  var stat = { req: 0, el: 0, css: 0, yt: 0 };
  window.__ab = { version: VERSION, stats: stat, hosts: HOSTS };

  function isBlocked(url) {
    if (!url) return false;
    var u;
    try { u = new URL(url, location.href); } catch (e) { return false; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    var h = u.hostname.toLowerCase();
    if (!h || h === HOST) return false;          // 同站资源不拦
    return RE.test(h);
  }

  function bump(kind, url) {
    stat[kind]++;
    try { if (window.__abLog) console.log('[adblock] 拦截', kind, url); } catch (e) {}
    maybeShowBadge();
  }

  // ---------- 1. 网络层 ----------
  // fetch：直接回一个空响应，让调用方不至于因为 reject 而崩
  var _fetch = window.fetch;
  if (typeof _fetch === 'function') {
    window.fetch = function (input) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (isBlocked(url)) {
        bump('req', url);
        return Promise.resolve(new Response('', { status: 200, statusText: 'OK' }));
      }
      return _fetch.apply(this, arguments);
    };
  }

  // XHR：open 时打标记，send 时直接 abort
  var XO = XMLHttpRequest.prototype.open;
  var XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, url) {
    if (isBlocked(url)) {
      this.__xbAb = true;
      bump('req', url);
      return;
    }
    return XO.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this.__xbAb) { try { this.abort(); } catch (e) {} return; }
    return XS.apply(this, arguments);
  };

  // sendBeacon：追踪打点常用
  if (navigator.sendBeacon) {
    var _sb = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      if (isBlocked(url)) { bump('req', url); return true; }
      return _sb(url, data);
    };
  }

  // setAttribute('src'/'href')
  var _setAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, val) {
    if ((name === 'src' || name === 'href') && isBlocked(val)) {
      bump('el', val);
      return;
    }
    return _setAttr.apply(this, arguments);
  };

  // el.src = '...' 这种赋值走的是属性 setter，得单独拦
  function hookSrcProp(ctor) {
    if (!ctor || !ctor.prototype) return;
    var d = Object.getOwnPropertyDescriptor(ctor.prototype, 'src');
    if (!d || !d.set) return;
    try {
      Object.defineProperty(ctor.prototype, 'src', {
        configurable: true,
        enumerable: d.enumerable,
        get: d.get,
        set: function (v) {
          if (isBlocked(v)) { bump('el', v); return; }
          return d.set.call(this, v);
        }
      });
    } catch (e) {}
  }
  hookSrcProp(window.HTMLScriptElement);
  hookSrcProp(window.HTMLIFrameElement);
  hookSrcProp(window.HTMLImageElement);

  // ---------- 2. 元素清理 ----------
  var AD_SELECTORS = [
    'ins.adsbygoogle', '.adsbygoogle',
    'iframe[src*="doubleclick.net"]', 'iframe[src*="googlesyndication"]',
    'iframe[src*="amazon-adsystem"]', 'iframe[src*="adservice.google"]',
    '[id^="google_ads_iframe"]', '[id^="div-gpt-ad"]', '[id^="aswift_"]',
    '.ad-banner', '.ad-container', '.ad-wrapper', '.ad-slot', '.ad-unit',
    '.ad-placeholder', '.advertisement', '.advertising', '.advert', '.adsbox',
    '.ad_box', '.ad-wrap', '.banner-ad', '.sponsor-ad',
    '#BAIDU_SSP__wrapper', '.ec_ad', '.ec-tuiguang',
    '.ytp-ad-overlay-container', '.ytp-ad-image-overlay', '#player-ads', '#masthead-ad'
  ];
  var AD_SEL = AD_SELECTORS.join(',');

  // 让广告元素失效。注意：HTML 还在解析时不能直接 removeChild ——
  // 解析器的插入点会指向已摘除的节点，导致后面整段内容被吞掉（踩过）
  function nukeIfAd(n) {
    if (!n || n.nodeType !== 1) return false;
    var tag = n.tagName;
    if (tag !== 'IFRAME' && tag !== 'SCRIPT' && tag !== 'IMG' && tag !== 'EMBED' &&
        tag !== 'OBJECT' && tag !== 'LINK' && tag !== 'SOURCE') return false;
    var src = n.getAttribute && (n.getAttribute('src') || n.getAttribute('data') || n.getAttribute('href'));
    if (!src || !isBlocked(src)) return false;
    bump('req', src);

    try {
      if (document.readyState === 'loading') {
        // 解析中：先"废掉"，等 DOMContentLoaded 再真删
        n.__xbAbDead = true;
        if (tag === 'SCRIPT') n.setAttribute('type', 'javascript/blocked');
        else if (tag === 'IFRAME') n.setAttribute('src', 'about:blank');
        else n.removeAttribute('src');
        n.style.setProperty('display', 'none', 'important');
      } else if (n.parentNode) {
        n.parentNode.removeChild(n);
      }
    } catch (e) {}
    return true;
  }

  // 解析完成后，把标记过的一次性清掉
  function cleanDead() {
    var dead;
    try { dead = document.querySelectorAll('iframe,script,img,embed,object,link,source'); } catch (e) { return; }
    for (var i = 0; i < dead.length; i++) {
      if (dead[i].__xbAbDead) {
        try { if (dead[i].parentNode) dead[i].parentNode.removeChild(dead[i]); } catch (e) {}
      }
    }
  }

  function sweep(root) {
    if (!root || !root.querySelectorAll) return;
    // 先摘掉 src 命中黑名单的元素（含 HTML 里写死的 iframe/script）
    var bad;
    try { bad = root.querySelectorAll('iframe[src],script[src],img[src],embed[src],object[data],source[src]'); } catch (e) { bad = []; }
    for (var b = 0; b < bad.length; b++) nukeIfAd(bad[b]);

    var list;
    try { list = root.querySelectorAll(AD_SEL); } catch (e) { return; }
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.__xbAb) continue;
      el.__xbAb = true;
      // 只藏不删：删掉可能让某些站的布局或脚本报错
      try { el.style.setProperty('display', 'none', 'important'); } catch (e) {}
      stat.el++;
    }
  }

  // 动态插入的广告靠这个抓
  var mo = null;
  function startObserver() {
    if (mo || !document.documentElement) return;
    mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (nukeIfAd(n)) continue;                    // 广告元素直接摘掉
          if (n.matches && n.matches(AD_SEL)) {
            n.style.setProperty('display', 'none', 'important');
            stat.el++;
          }
          if (n.querySelectorAll) sweep(n);
        }
      }
    });
    try {
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  }

  // ---------- 3. 样式层 ----------
  function injectCss() {
    var parent = document.head || document.documentElement;
    if (!parent) return false;                  // 根节点还没出来，交给 whenRoot 重试
    var css = AD_SEL + '{display:none !important}';
    var s = document.createElement('style');
    s.textContent = css;
    s.setAttribute('data-xb-ab', '1');
    parent.appendChild(s);
    stat.css = 1;
    return true;
  }

  // ---------- 4. YouTube ----------
  var isYT = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(HOST);
  function ytTick() {
    if (!isYT) return;
    var player = document.querySelector('.html5-video-player.ad-showing');
    if (!player) return;

    // 有"跳过"就点
    var skip = player.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-skip-button-container button');
    if (skip) {
      try { skip.click(); stat.yt++; } catch (e) {}
      return;
    }
    // 不能跳的（贴片）直接拖到结尾
    var v = player.querySelector('video');
    if (v && isFinite(v.duration) && v.duration > 0) {
      try {
        if (v.currentTime < v.duration - 0.4) {
          v.currentTime = v.duration;
          stat.yt++;
        }
      } catch (e) {}
    }
    // 顺手关掉广告浮层
    var ov = player.querySelector('.ytp-ad-overlay-container');
    if (ov) { try { ov.style.display = 'none'; } catch (e) {} }
  }

  // ---------- 5. 徽标（只在拦到东西时短暂出现） ----------
  var badgeEl = null, badgeTimer = 0, badgeShown = false, badgeWait = 0;

  function maybeShowBadge() {
    if (badgeShown) return;
    if (stat.req + stat.el + stat.yt < 2) return;
    // body 还没出来就先等着，别把 badgeShown 提前置位
    if (!document.body) {
      if (!badgeWait) {
        badgeWait = setInterval(function () {
          if (document.body) { clearInterval(badgeWait); badgeWait = 0; maybeShowBadge(); }
        }, 300);
      }
      return;
    }
    badgeShown = true;
    buildBadge();
  }

  function buildBadge() {
    if (badgeEl || !document.body) return;
    var host = document.createElement('div');
    host.id = '__xb_ab_badge__';
    host.style.cssText = 'position:fixed;left:10px;bottom:14px;z-index:2147483000;font:12px/1 -apple-system,"PingFang SC",sans-serif;';

    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

    var pill = document.createElement('div');
    pill.style.cssText = [
      'display:inline-flex;align-items:center;gap:5px',
      'background:rgba(20,22,28,.86);color:#e8ecf3',
      'padding:6px 11px;border-radius:20px',
      'box-shadow:0 2px 10px rgba(0,0,0,.35)',
      'backdrop-filter:blur(6px);cursor:pointer;user-select:none',
      'opacity:0;transition:opacity .25s'
    ].join(';');

    var dot = document.createElement('span');
    dot.textContent = '🛡';
    dot.style.cssText = 'font-size:11px;line-height:1';

    var txt = document.createElement('span');
    txt.textContent = '已拦截';
    txt.style.cssText = 'font-size:11.5px';

    var num = document.createElement('b');
    num.textContent = '0';
    num.style.cssText = 'font-size:11.5px;color:#7fbcf5';

    pill.appendChild(dot);
    pill.appendChild(txt);
    pill.appendChild(num);
    root.appendChild(pill);
    document.body.appendChild(host);
    badgeEl = { host: host, pill: pill, num: num };

    requestAnimationFrame(function () { pill.style.opacity = '1'; });
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(hideBadge, 2600);

    pill.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      showPanel();
    });
  }

  function refreshBadge() {
    if (badgeEl) badgeEl.num.textContent = String(stat.req + stat.el + stat.yt);
  }

  function hideBadge() {
    if (!badgeEl) return;
    badgeEl.pill.style.opacity = '0';
    setTimeout(function () {
      if (badgeEl && badgeEl.host && badgeEl.host.parentNode) {
        badgeEl.host.parentNode.removeChild(badgeEl.host);
      }
      badgeEl = null;
    }, 260);
  }

  // 本页加载过的外部域名（用来诊断"这站还有广告"）
  function collectHosts() {
    var m = {}, out = [];
    try {
      var es = performance.getEntriesByType('resource') || [];
      for (var i = 0; i < es.length; i++) {
        var h = '';
        try { h = new URL(es[i].name).hostname.toLowerCase(); } catch (e) { continue; }
        if (!h || h === HOST) continue;
        m[h] = (m[h] || 0) + 1;
      }
    } catch (e) {}
    for (var k in m) out.push([k, m[k]]);
    out.sort(function (a, b) { return b[1] - a[1]; });
    return out;
  }

  function diagText() {
    var list = collectHosts();
    var lines = ['# 广告拦截诊断 v' + VERSION, '页面: ' + location.href,
      '拦截: 请求 ' + stat.req + ' · 元素 ' + stat.el + ' · 视频广告 ' + stat.yt, '', '外部域名:'];
    for (var i = 0; i < list.length; i++) {
      lines.push((RE.test(list[i][0]) ? '[已拦] ' : '[未拦] ') + list[i][0] + ' x' + list[i][1]);
    }
    return lines.join('\n');
  }

  function showPanel() {
    if (!badgeEl) return;
    clearTimeout(badgeTimer);
    var root = badgeEl.host.shadowRoot || badgeEl.host;
    if (root.querySelector('.xb-card')) return;   // 已经打开了

    var card = document.createElement('div');
    card.className = 'xb-card';
    card.style.cssText = [
      'background:#171a20;color:#e8ecf3;border:1px solid #2a3038',
      'border-radius:12px;padding:12px 13px;margin-bottom:8px;width:252px',
      'box-shadow:0 6px 24px rgba(0,0,0,.5)',
      'font:12.5px/1.6 -apple-system,"PingFang SC",sans-serif',
      'max-height:60vh;overflow:auto'
    ].join(';');

    var n = stat.req + stat.el + stat.yt;
    var head = '<div style="font-weight:600;margin-bottom:5px">广告拦截 v' + VERSION + '</div>' +
      '<div style="color:#9aa4b2;font-size:12px">本页拦截 <b style="color:#7fbcf5">' + n + '</b> 个' +
      '<span style="color:#5f6a7a">（请求 ' + stat.req + ' · 元素 ' + stat.el + (stat.yt ? ' · 视频 ' + stat.yt : '') + '）</span></div>';

    var hosts = collectHosts().slice(0, 10);
    var rows = hosts.map(function (p) {
      var hit = RE.test(p[0]);
      return '<div style="display:flex;justify-content:space-between;gap:8px;font-size:11.5px;line-height:1.75;' +
        'color:' + (hit ? '#6fa8e0' : '#c2cad6') + '">' +
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + p[0] + '</span>' +
        '<span style="color:#5f6a7a;flex:none">' + p[1] + '</span></div>';
    }).join('');

    card.innerHTML = head +
      '<div style="margin-top:9px;padding-top:7px;border-top:1px solid #262c36;color:#7a8494;font-size:11px;margin-bottom:3px">本页外部域名</div>' +
      (rows || '<div style="color:#5f6a7a;font-size:11.5px">没有外部资源</div>');

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;margin-top:10px';

    function mkBtn(text, primary) {
      var b = document.createElement('button');
      b.textContent = text;
      b.style.cssText = 'flex:1;height:30px;border-radius:8px;font-size:11.5px;' +
        (primary ? 'border:0;background:#2f6fd0;color:#fff' : 'border:1px solid #3a4150;background:#22272f;color:#cfd6e0');
      return b;
    }

    var copyBtn = mkBtn('复制诊断', false);
    var offBtn = mkBtn('本站关闭', false);
    var okBtn = mkBtn('关闭', true);

    row.appendChild(copyBtn);
    row.appendChild(offBtn);
    row.appendChild(okBtn);
    card.appendChild(row);
    root.insertBefore(card, badgeEl.pill);

    copyBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var txt = diagText();
      function done() { copyBtn.textContent = '已复制 ✓'; }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt, done); });
          return;
        }
      } catch (err) {}
      fallbackCopy(txt, done);
    });

    offBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      try { localStorage.setItem(OFF_KEY, '1'); } catch (err) {}
      location.reload();
    });

    okBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      hideBadge();
    });

    // 8 秒不操作就收起来（面板开着的时候别自己消失太快）
    badgeTimer = setTimeout(hideBadge, 8000);
  }

  // 剪贴板不可用时的兜底：塞个 textarea 让用户长按复制
  function fallbackCopy(txt, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.cssText = 'position:fixed;left:8px;bottom:60px;width:70%;height:90px;font-size:10px;z-index:2147483001';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      if (ok) { ta.remove(); done(); }
      else { ta.setSelectionRange(0, txt.length); }
    } catch (e) {}
  }

  // ---------- 6. 启动 ----------
  // document-start 时 <html> 可能还不存在，等它出现再干活
  function whenRoot(fn) {
    if (document.documentElement) { fn(); return; }
    var tries = 0;
    var t = setInterval(function () {
      if (document.documentElement || ++tries > 500) {
        clearInterval(t);
        if (document.documentElement) fn();
      }
    }, 10);
  }

  whenRoot(function () {
    injectCss();
    startObserver();
    sweep(document.documentElement);
  });

  document.addEventListener('DOMContentLoaded', function () {
    cleanDead();
    sweep(document);
    if (isYT) setInterval(ytTick, 600);
  });
  window.addEventListener('load', function () { cleanDead(); });

  // 徽标上的数字保持最新
  setInterval(refreshBadge, 1200);

  // 对外暴露一点调试信息
  window.__ab.isBlocked = isBlocked;
  window.__ab.enableLog = function (on) { window.__abLog = !!on; };
})();
