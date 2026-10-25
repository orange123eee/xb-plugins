// ==UserScript==
// @name         广告拦截 · AdBlock Lite
// @namespace    local.xbrowser.adblock
// @version      2.2.2
// @description  拦截广告/追踪请求、popunder 弹窗与广告元素；广告库假加载骗过反拦截检测；通用"跳过广告"自动点；YouTube 接口级去广。内置精简规则，不订阅外部列表。
// @author       me
// @match        *://*/*
// @run-at       document-start
// @grant        none
// @updateURL    https://orange123eee.github.io/xb-plugins/adblock.user.js
// @downloadURL  https://orange123eee.github.io/xb-plugins/adblock.user.js
// ==/UserScript==

// 思路与规则来源（只借鉴方法，不打包它们的完整列表）：
//   - gorhill/uBlock：||host^ 后缀匹配、$popup 语义、json-prune 删 YouTube 广告字段
//   - brave/adblock-rust、@cliqz/adblocker：网络规则与 cosmetic 规则分层、第三方判定
//   - EasyList / EasyPrivacy / AdGuard Base：常见广告域名、通用 cosmetic 选择器（GPLv3 / CC-BY-SA）
// 用户脚本无法像扩展那样用 webRequest 在请求发出前拦截，这里用 fetch/XHR/元素属性钩子 + 选择器隐藏做轻量版。

(function () {
  'use strict';

  var VERSION = '2.2.2';
  var HOST = location.hostname.toLowerCase();

  if (window.__xbAdblock) return;
  window.__xbAdblock = VERSION;

  var OFF_KEY = 'xbab.off:' + HOST;
  try { if (localStorage.getItem(OFF_KEY) === '1') return; } catch (e) {}

  /* ------------------------------------------------------------------ *
   *  规则数据
   * ------------------------------------------------------------------ */

  // 只放"纯广告/追踪"域名，宁缺毋滥，避免把网站功能拦坏
  var BLOCK_HOSTS = [
    // Google 广告
    'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
    'adservice.google.com', 'pagead2.googlesyndication.com', 'adclick.g.doubleclick.net',
    'pubads.g.doubleclick.net', 'securepubads.g.doubleclick.net', 'tpc.googlesyndication.com',
    'googletagmanager.com', 'googletagservices.com', '2mdn.net',
    // 国际广告交易平台 / 视频广告
    'adnxs.com', 'adnxs-simple.com', 'adsrvr.org', 'rubiconproject.com', 'pubmatic.com',
    'casalemedia.com', 'openx.net', 'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com',
    'revcontent.com', 'mgid.com', 'adform.net', 'smartadserver.com', 'teads.tv',
    'adroll.com', 'bidswitch.net', 'sharethrough.com', 'triplelift.com',
    'indexexchange.com', 'sovrn.com', 'lijit.com', 'gumgum.com', 'yieldmo.com',
    'districtm.io', '33across.com', 'spotxchange.com', 'spotx.tv', 'springserve.com',
    'tremorhub.com', 'telaria.com', 'innovid.com', 'flashtalking.com', 'sizmek.com',
    'serving-sys.com', 'moatads.com', 'undertone.com', 'yieldlab.net', 'stickyadstv.com',
    'freewheel.tv', 'amazon-adsystem.com', 'assoc-amazon.com',
    'ads-twitter.com', 'static.ads-twitter.com', 'ads.linkedin.com', 'ads.pinterest.com',
    'ads.reddit.com', 'ads.yahoo.com', 'adtech.yahooinc.com', 'analytics.tiktok.com',
    'loopme.me', 'adcolony.com', 'unityads.unity3d.com', 'applovin.com', 'vungle.com',
    'chartboost.com', 'plista.com', 'zergnet.com', 'dianomi.com', 'nativo.com',
    'content.ad', 'adblade.com', 'mgid.com',
    // 弹窗 / 成人流量联盟
    'popads.net', 'popcash.net', 'propellerads.com', 'propellerpops.com',
    'adcash.com', 'exoclick.com', 'exosrv.com', 'juicyads.com', 'juicyads.net',
    'trafficjunky.net', 'trafficjunky.com', 'trafficstars.com',
    'adsterra.com', 'ad-maven.com', 'clickadu.com', 'hilltopads.net', 'onclckds.com',
    'tsyndicate.com', 'tsyndicate.net', 'adnium.com', 'adnium.net', 'a-ads.com',
    // ExoClick / TrafficJunky / Adsterra 系常见轮换域名
    'exdynsrv.com', 'realsrv.com', 'magsrv.com', 'pemsrv.com', 'adsco.re',
    'zlinkd.com', 'pmtk.io', 'adspy.de', 'trafficfactory.biz',
    'onclickalgo.com', 'onclickmega.com', 'onclckmn.com',
    'creative-sb1.com', 'creative-bcf.com', 'puhtml.com', 'cams.gratis',
    // 真实站点里见到的
    'snaptrckr.fun', 'rallytrck.website', 'mayzaent.com', 'mavrtracktor.com',
    'myavlive.com', 'mycomic.com', 'jerkdolls.com', 'theporndude.com',
    // v2.1.0：广告联盟新马甲 / 轮换域名（hilltopads 主域、propeller 新品牌 monetag、聚合与弹窗网）
    'hilltopads.com', 'monetag.com', 'adspyglass.com', 'clickaine.com',
    'popmyads.com', 'bidgear.com', 'zeropark.com',
    // v2.2.1：epo18.com 诊断实录（nannvshuo.com 是正文图片/AI 域，勿拦）
    'histats.com', 'dtscout.com', 'mrktmtrcs.net',
    'sp0.baidu.com', 'zz.bdstatic.com',
    'ozovokyytivwif.com', 'qlplayerr.cyou',
    // 统计 / 追踪
    'google-analytics.com', 'analytics.google.com',
    'scorecardresearch.com', 'quantserve.com', 'hotjar.com', 'mouseflow.com',
    'fullstory.com', 'smartlook.com', 'clarity.ms', 'branch.io',
    'mixpanel.com', 'amplitude.com', 'segment.com', 'segment.io', 'heapanalytics.com',
    'statcounter.com', 'posthog.com',
    // 国内
    'pos.baidu.com', 'cbjs.baidu.com', 'cpro.baidu.com', 'hm.baidu.com',
    'cnzz.com', 'umeng.com', 'growingio.com', 'sensorsdata.cn', 'tanx.com',
    'alimama.com', 'mmstat.com',
    'atm.youku.com', 'valf.atm.youku.com', 'ad.m.iqiyi.com', 'api.cupid.iqiyi.com',
    'ads.mgtv.com', 'ad.video.qq.com', 'adslvseed.qq.com'
  ];

  // 例外（@@||host^）：以后遇到误杀往这里加
  var ALLOW_HOSTS = [];

  // 联盟导流链接：不一定作为资源加载，但点了会跳出站外
  // 注意：bit.ly 这类通用短链不放进来（大量正常内容在用），
  // 恶意短链由 popupWrapper 的"包装跳转 + 第三方"判断兜底
  var LINK_HOSTS = ['mycomic.com', 'jerkdolls.com', 'theporndude.com', 'myavlive.com'];

  var HOST_MAP = Object.create(null);
  var ALLOW_MAP = Object.create(null);
  var LINK_MAP = Object.create(null);
  var HOST_HINT = null;
  (function () {
    var i;
    for (i = 0; i < BLOCK_HOSTS.length; i++) HOST_MAP[BLOCK_HOSTS[i]] = 1;
    for (i = 0; i < ALLOW_HOSTS.length; i++) ALLOW_MAP[ALLOW_HOSTS[i]] = 1;
    for (i = 0; i < LINK_HOSTS.length; i++) LINK_MAP[LINK_HOSTS[i]] = 1;
    // innerHTML 预筛选：字符串里根本没有广告域名就不跑属性正则
    try {
      HOST_HINT = new RegExp('(' + BLOCK_HOSTS.concat(LINK_HOSTS).map(function (d) {
        return d.replace(/\./g, '\\.');
      }).join('|') + ')', 'i');
    } catch (e) { HOST_HINT = null; }
  })();

  // 精简版公共后缀表：只用于区分"同站/CDN"和第三方，完整表见 publicsuffix.org
  var MULTI_SUFFIX = Object.create(null);
  ('com.cn,net.cn,org.cn,gov.cn,edu.cn,co.uk,org.uk,ac.uk,co.jp,ne.jp,or.jp,' +
   'com.au,net.au,org.au,com.br,com.tw,com.hk,com.sg,com.mx,com.ar,com.tr,com.ru,' +
   'com.ua,com.pl,co.kr,co.in,co.nz,co.za,co.il,com.my,com.ph,com.vn,com.id,' +
   'com.pk,com.bd,com.eg,com.sa,github.io,pages.dev,netlify.app,vercel.app'
  ).split(',').forEach(function (s) { MULTI_SUFFIX[s] = 1; });

  function baseDomain(host) {
    if (!host) return '';
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.indexOf(':') >= 0) return host;
    var p = host.split('.');
    if (p.length <= 2) return host;
    var last2 = p.slice(-2).join('.');
    if (MULTI_SUFFIX[last2] && p.length >= 3) return p.slice(-3).join('.');
    return last2;
  }
  var PAGE_BASE = baseDomain(HOST);

  function thirdParty(host) {
    if (!host) return false;
    if (host === HOST) return false;
    return baseDomain(host) !== PAGE_BASE;
  }

  function inSuffixMap(map, host) {
    var h = host;
    while (h) {
      if (map[h]) return true;
      var i = h.indexOf('.');
      if (i < 0) break;
      h = h.slice(i + 1);
    }
    return false;
  }
  function hostBlocked(host) {
    if (!host || host === HOST) return false;
    return inSuffixMap(HOST_MAP, host);
  }
  function hostAllowed(host) {
    return inSuffixMap(ALLOW_MAP, host);
  }

  // URL 路径规则：只在第三方请求上生效，避免误伤站内资源
  var PATH_RES = [
    /\/(pagead|gampad|adsense|adserver|adservice|advert|advertising|adslot|adunit|adframe|ad_iframe|adsbygoogle|ad_tag|ad-tag)([\/._-]|$)/i,
    /\/(prebid|vast|vpaid|adxml|impression|beacon|tracking|tracker|pixel)([\/._-]|$)/i,
    /\/(popunder|popads?|popcash|onclick|clickunder|smartpop)([\/._-]|$)/i
  ];
  function pathBlocked(pathname) {
    if (!pathname) return false;
    for (var i = 0; i < PATH_RES.length; i++) {
      if (PATH_RES[i].test(pathname)) return true;
    }
    return false;
  }

  // 同站 /pop?url=https://外部广告 这类弹窗包装
  var POPUP_PATH_RE = /(^|\/)(pop|pops|popup|popunder|popads?|interstitial|smartpop|clickunder)(\/|$)/i;
  var POPUP_PARAM_RE = /(^|[?&])(url|u|to|target|dest|destination|redirect|redir|r|link|href)=/i;

  function parseQuery(search) {
    var out = Object.create(null);
    var s = String(search || '').replace(/^\?/, '');
    if (!s) return out;
    if (typeof URLSearchParams === 'function') {
      try {
        var usp = new URLSearchParams(s);
        usp.forEach(function (v, k) { out[k] = v; });
        return out;
      } catch (e) {}
    }
    var parts = s.split('&');
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split('=');
      try {
        out[decodeURIComponent(kv[0] || '').toLowerCase()] =
          decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
      } catch (e) {}
    }
    return out;
  }

  // 判断 window.open / <a> 是不是"包装后跳到站外"的弹窗
  function popupWrapper(url) {
    if (!url) return false;
    try {
      var u = new URL(url, location.href);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      if (!POPUP_PATH_RE.test(u.pathname)) return false;
      if (!POPUP_PARAM_RE.test(u.search)) return false;
      var hard = /(^|\/)(popunder|popads?|smartpop|clickunder)(\/|$)/i.test(u.pathname);
      var q = parseQuery(u.search);
      for (var k in q) {
        var v = q[k];
        if (!v || !/^https?:\/\//i.test(v)) continue;
        var t;
        try { t = new URL(v); } catch (e) { continue; }
        if (t.hostname && t.hostname.toLowerCase() === HOST) return false;   // 站内弹窗，放行
        if (hostBlocked(t.hostname.toLowerCase()) || linkBlockedUrl(v)) return true;
        if (thirdParty(t.hostname.toLowerCase())) return true;
      }
      return hard;
    } catch (e) { return false; }
  }

  function linkBlockedUrl(url) {
    if (!url) return false;
    try {
      var u = new URL(url, location.href);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      var h = u.hostname.toLowerCase();
      if (!h || h === HOST) return false;
      if (hostAllowed(h)) return false;
      return !!LINK_MAP[h] || inSuffixMap(LINK_MAP, h) || hostBlocked(h);
    } catch (e) { return false; }
  }

  // 判定结果缓存：同一 URL 会被 setAttribute / observer / fetch 多次检查
  var urlCache = Object.create(null);
  var urlCacheN = 0;

  // 同站（第一方）也要拦的"硬广告"命名：只收弹窗系命名和 /ads.js|/pop.js 这种
  // 不可能正常命名的文件（允许 .min/.pack 等压缩后缀），站内自己的 /ad/、/banner/ 路径仍然不动
  var HARD_PATH_RE = /(^|\/)(popunder|popads|smartpop|clickunder)([\/._-]|$)|\/(ads?|pop|popup|popunder|video-ads?)([-.](min|pack|prod))*\.js(\?|#|$)/i;

  function classify(url, type) {
    if (!url) return '';
    try {
      var u = new URL(url, location.href);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
      var h = u.hostname.toLowerCase();
      if (!h) return '';
      if (h !== HOST && hostAllowed(h)) return '';
      if (h !== HOST && inSuffixMap(HOST_MAP, h)) return 'host';
      if (!thirdParty(h)) {
        // 第一方/同 base 域（含子域）：只拦"硬广告"命名，其余全放行
        return HARD_PATH_RE.test(u.pathname) ? 'path1p' : '';
      }
      if (type !== 'stylesheet' && type !== 'font' && pathBlocked(u.pathname)) return 'path';
    } catch (e) {}
    return '';
  }

  function isBlocked(url, type) {
    if (!url) return false;
    var key = (type || 'other') + '|' + url;
    if (key in urlCache) return urlCache[key];
    var res = !!classify(url, type);
    if (urlCacheN > 600) { urlCache = Object.create(null); urlCacheN = 0; }
    urlCache[key] = res;
    urlCacheN++;
    return res;
  }

  /* ------------------------------------------------------------------ *
   *  统计 / 调试
   * ------------------------------------------------------------------ */

  var stat = { req: 0, el: 0, pop: 0, yt: 0, ytapi: 0, skip: 0 };
  window.__ab = {
    version: VERSION,
    stats: stat,
    hosts: BLOCK_HOSTS,
    isBlocked: isBlocked,
    classify: classify,
    thirdParty: thirdParty,
    popupWrapper: popupWrapper,
    isYouTubeApi: isYouTubeApi
  };

  function totalBlocked() {
    return stat.req + stat.el + stat.pop + stat.yt + stat.ytapi + stat.skip;
  }
  function bump(kind, url) {
    stat[kind]++;
    try { if (window.__abLog) console.log('[adblock] 拦截', kind, url); } catch (e) {}
    maybeShowBadge();
  }

  /* ------------------------------------------------------------------ *
   *  用户手势：没有交互就弹窗，多半是 popunder
   * ------------------------------------------------------------------ */

  var lastGestureAt = 0;
  function markGesture() { lastGestureAt = Date.now(); }
  (function () {
    var evs = ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'click'];
    for (var i = 0; i < evs.length; i++) {
      try { window.addEventListener(evs[i], markGesture, { capture: true, passive: true }); } catch (e) {}
    }
  })();

  function hadGesture(ms) {
    try {
      if (navigator.userActivation && navigator.userActivation.isActive) return true;
    } catch (e) {}
    return Date.now() - lastGestureAt < (ms || 1600);
  }

  /* ------------------------------------------------------------------ *
   *  1. 网络层
   * ------------------------------------------------------------------ */

  // YouTube 播放接口里删掉广告字段（uBO 的 json-prune 思路）
  var AD_JSON_KEYS = {
    adPlacements: 1, playerAds: 1, adSlots: 1,
    adBreakHeartbeatParams: 1
  };
  function isYouTubeApi(url) {
    try {
      var u = new URL(url, location.href);
      if (!/(^|\.)youtube(-nocookie)?\.com$/i.test(u.hostname)) return false;
      // 只裁播放接口；feed 广告交给 CSS 隐藏
      return /\/youtubei\/v1\/player([\/?]|$)/.test(u.pathname);
    } catch (e) { return false; }
  }
  function pruneYouTubeAds(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 10) return false;
    var hit = false, k;
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) {
        if (obj[i] && typeof obj[i] === 'object' && pruneYouTubeAds(obj[i], depth + 1)) hit = true;
      }
      return hit;
    }
    for (k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      if (AD_JSON_KEYS[k]) {
        try { delete obj[k]; hit = true; } catch (e) {}
        continue;
      }
      if (obj[k] && typeof obj[k] === 'object' && pruneYouTubeAds(obj[k], depth + 1)) hit = true;
    }
    return hit;
  }
  window.__ab.pruneYouTube = pruneYouTubeAds;

  // fetch：广告请求回空响应；YouTube 接口顺手裁剪广告字段
  var _fetch = window.fetch;
  if (typeof _fetch === 'function') {
    window.fetch = function (input) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (isBlocked(url, 'xhr')) {
        bump('req', url);
        try { return Promise.resolve(new Response('', { status: 200, statusText: 'OK' })); }
        catch (e) { return Promise.reject(new Error('blocked')); }
      }
      var p = _fetch.apply(this, arguments);
      if (!isYouTubeApi(url)) return p;
      return p.then(function (resp) {
        if (!resp || !resp.ok || !resp.clone) return resp;
        var ct = '';
        try { ct = resp.headers.get('content-type') || ''; } catch (e) {}
        if (ct && ct.indexOf('json') < 0) return resp;
        return resp.clone().text().then(function (txt) {
          var data;
          try { data = JSON.parse(txt); } catch (e) { return resp; }
          if (!pruneYouTubeAds(data, 0)) return resp;
          stat.ytapi++;
          maybeShowBadge();
          try {
            var headers = new Headers(resp.headers);
            headers.delete('content-length');
            headers.delete('content-encoding');
            return new Response(JSON.stringify(data), {
              status: resp.status, statusText: resp.statusText, headers: headers
            });
          } catch (e) { return resp; }
        }).catch(function () { return resp; });
      });
    };
  }

  // XHR：仍然调用真正的 open（否则 setRequestHeader 会抛异常），send 时再 abort
  var XO = XMLHttpRequest.prototype.open;
  var XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, url) {
    this.__xbAb = isBlocked(url, 'xhr');
    this.__xbAbUrl = url;
    return XO.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this.__xbAb) {
      bump('req', this.__xbAbUrl);
      try { this.abort(); } catch (e) {}
      return;
    }
    return XS.apply(this, arguments);
  };

  // sendBeacon：追踪打点常用
  if (navigator.sendBeacon) {
    var _sb = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      if (isBlocked(url, 'xhr')) { bump('req', url); return true; }
      return _sb(url, data);
    };
  }

  /* ------------------------------------------------------------------ *
   *  广告库"假加载"空壳（反反拦截）
   *  很多站点检测到广告脚本没加载就拒绝服务（黑屏 / 不给播）。
   *  广告脚本被我们拦掉后，这里补一个"看起来加载成功"的空壳：
   *  任何方法都能调、关键属性都是真值；站点自己后来赋真值会自然覆盖。
   * ------------------------------------------------------------------ */

  function noopChain() {
    var cmdObj = {
      push: function (f) { try { if (typeof f === 'function') f(); } catch (e) {} return 1; }
    };
    var p;
    try {
      var target = function () {};
      p = new Proxy(target, {
        get: function (t, k) {
          if (k === 'apiReady' || k === 'pubadsReady' || k === 'loaded') return true;
          if (k === 'cmd' || k === 'que') return cmdObj;
          if (k === 'targetingKeys' || k === 'getSlots') return function () { return []; };
          if (k === 'fetchBids') return function (o, cb) { try { if (cb) cb([]); } catch (e) {} };
          var own = Reflect.get(t, k);
          if (own !== undefined) return own;
          return function () { return p; };
        },
        apply: function () { return p; }
      });
      return p;
    } catch (e) {
      // 老内核没有 Proxy：固定方法名简版
      var o = {};
      ['pubads', 'defineSlot', 'defineOutOfPageSlot', 'enableServices', 'enableSingleRequest',
        'setTargeting', 'addService', 'collapseEmptyDivs', 'disableInitialLoad', 'refresh',
        'addEventListener', 'setCentering', 'defineSizeMapping', 'addSize', 'build',
        'clear', 'destroySlots', 'setDisplayBids', 'init'
      ].forEach(function (m) { o[m] = function () { return o; }; });
      o.apiReady = true;
      o.pubadsReady = true;
      o.loaded = true;
      o.getSlots = o.targetingKeys = function () { return []; };
      o.fetchBids = function (opt, cb) { try { if (cb) cb([]); } catch (e2) {} };
      o.cmd = cmdObj;
      o.que = cmdObj;
      return o;
    }
  }

  // googletag（GPT）必须兜：站点把它当基础设施用，脚本被拦又没壳的话，
  // 站内代码第一行 googletag.cmd.push 就抛异常，连正文都跟着挂
  try {
    if (!window.googletag) window.googletag = noopChain();
    else if (!window.googletag.cmd) window.googletag.cmd = noopChain().cmd;
  } catch (e) {}
  try { if (!window.adsbygoogle) window.adsbygoogle = noopChain(); } catch (e) {}
  try { if (!window.apstag) window.apstag = noopChain(); } catch (e) {}
  try { if (!window.pbjs) window.pbjs = noopChain(); } catch (e) {}   // prebid：que.push 模式

  // setAttribute('src'/'href'/'data'/'poster'/'srcset')
  var ATTRS = { src: 1, href: 1, data: 1, poster: 1, srcset: 1 };
  var _setAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, val) {
    var n = String(name).toLowerCase();
    if (ATTRS[n]) {
      var hit = n === 'srcset' ? srcsetBlocked(val) : isBlocked(val, 'other');
      if (hit) {
        bump('el', val);
        return;
      }
    }
    return _setAttr.apply(this, arguments);
  };

  function srcsetBlocked(val) {
    if (!val) return false;
    var parts = String(val).split(',');
    for (var i = 0; i < parts.length; i++) {
      var u = parts[i].replace(/^\s+/, '').split(/\s+/)[0];
      if (u && isBlocked(u, 'image')) return true;
    }
    return false;
  }

  // 动态 innerHTML 里的广告资源：在插入前把命中规则的 src/href 摘掉。
  // 解析器直接吐出来的静态标签仍然拦不住（用户脚本的先天限制），但模板字符串能挡。
  function scrubHtml(html) {
    if (!html || typeof html !== 'string' || html.length > 500000) return html;
    if (html.indexOf('//') < 0) return html;
    if (HOST_HINT && !HOST_HINT.test(html)) return html;
    if (html.indexOf('src') < 0 && html.indexOf('href') < 0 && html.indexOf('data') < 0) return html;
    return html.replace(/\b(src|href|data|poster|srcset)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
      function (m, attr, all, dq, sq, uq) {
        var v = dq !== undefined ? dq : (sq !== undefined ? sq : (uq || ''));
        if (!v) return m;
        var hit = String(attr).toLowerCase() === 'srcset' ? srcsetBlocked(v) : isBlocked(v, 'other');
        return hit ? 'data-xb-ab="1"' : m;
      });
  }

  function hookHtmlProp(proto) {
    if (!proto) return;
    var d = Object.getOwnPropertyDescriptor(proto, 'innerHTML');
    if (!d || !d.set) return;
    try {
      Object.defineProperty(proto, 'innerHTML', {
        configurable: true,
        enumerable: d.enumerable,
        get: d.get,
        set: function (v) {
          var r = d.set.call(this, scrubHtml(v));
          // ShadowRoot.innerHTML 会连我们注入的 <style> 一起清掉，重设后补回来
          if (this.nodeType === 11) { try { injectCssInto(this); } catch (e) {} }
          return r;
        }
      });
    } catch (e) {}
  }
  hookHtmlProp(window.Element && Element.prototype);
  hookHtmlProp(window.ShadowRoot && ShadowRoot.prototype);

  if (window.Element && Element.prototype.insertAdjacentHTML) {
    var _iah = Element.prototype.insertAdjacentHTML;
    Element.prototype.insertAdjacentHTML = function (pos, html) {
      return _iah.call(this, pos, scrubHtml(html));
    };
  }

  // el.src = '...' / link.href = '...' 这类属性赋值走 setter，单独拦
  function hookUrlProp(ctor, prop, type) {
    if (!ctor || !ctor.prototype) return;
    var d = Object.getOwnPropertyDescriptor(ctor.prototype, prop);
    if (!d || !d.set) return;
    try {
      Object.defineProperty(ctor.prototype, prop, {
        configurable: true,
        enumerable: d.enumerable,
        get: d.get,
        set: function (v) {
          if (isBlocked(v, type || 'other')) {
            bump('el', v);
            // 图片被拦后留着空 src 会显示破图图标，顺手藏掉
            if (type === 'image' && this.style) {
              try { this.style.setProperty('display', 'none', 'important'); } catch (e) {}
            }
            return;
          }
          return d.set.call(this, v);
        }
      });
    } catch (e) {}
  }
  hookUrlProp(window.HTMLScriptElement, 'src', 'script');
  hookUrlProp(window.HTMLIFrameElement, 'src', 'iframe');
  hookUrlProp(window.HTMLImageElement, 'src', 'image');
  hookUrlProp(window.HTMLImageElement, 'srcset', 'image');
  hookUrlProp(window.HTMLMediaElement, 'src', 'media');
  hookUrlProp(window.HTMLSourceElement, 'src', 'media');
  hookUrlProp(window.HTMLSourceElement, 'srcset', 'image');
  hookUrlProp(window.HTMLLinkElement, 'href', 'stylesheet');
  hookUrlProp(window.HTMLObjectElement, 'data', 'other');
  hookUrlProp(window.HTMLEmbedElement, 'src', 'other');

  // <a href> 指到广告/导流域名：不赋值（静态链接由 hideAdLink 处理）
  function hookAnchorHref(ctor) {
    if (!ctor || !ctor.prototype) return;
    var d = Object.getOwnPropertyDescriptor(ctor.prototype, 'href');
    if (!d || !d.set) return;
    try {
      Object.defineProperty(ctor.prototype, 'href', {
        configurable: true,
        enumerable: d.enumerable,
        get: d.get,
        set: function (v) {
          if (linkBlockedUrl(v)) { bump('el', v); return; }
          return d.set.call(this, v);
        }
      });
    } catch (e) {}
  }
  hookAnchorHref(window.HTMLAnchorElement);
  hookAnchorHref(window.HTMLAreaElement);

  // window.open：广告域名、/pop?url= 包装、无手势的站外 popunder 全部拦掉
  var _open = window.open;
  window.open = function (url, name, features) {
    var u = '';
    try { u = (url == null) ? '' : String(url); } catch (e) {}
    var blocked = false;
    if (u) {
      if (isBlocked(u, 'popup') || linkBlockedUrl(u) || popupWrapper(u)) blocked = true;
    } else if (!hadGesture(1600)) {
      blocked = true;   // 没交互就开空白窗，典型 popunder
    }
    if (!blocked && !hadGesture(1600)) {
      try {
        var t = new URL(u || 'about:blank', location.href);
        if (t.protocol !== 'about:' && thirdParty(t.hostname.toLowerCase())) blocked = true;
      } catch (e) {}
    }
    if (blocked) {
      bump('pop', u || '(blank)');
      return fakePopup();
    }
    return _open.apply(window, arguments);
  };

  function fakePopup() {
    var doc = null;
    try { doc = document.implementation.createHTMLDocument(''); } catch (e) {}
    var loc = {
      href: 'about:blank', protocol: 'about:', host: '', hostname: '',
      pathname: 'blank', search: '', hash: '',
      assign: function () {}, replace: function () {}, reload: function () {},
      toString: function () { return 'about:blank'; }
    };
    return {
      // closed 必须是 false：popunder 脚本看到窗口"已关闭"会立刻重开，形成死循环
      closed: false, name: '', opener: null,
      document: doc, location: loc,
      focus: function () {}, blur: function () {}, close: function () {},
      postMessage: function () {}, moveTo: function () {}, resizeTo: function () {},
      alert: function () {}, confirm: function () { return false; }, prompt: function () { return null; },
      addEventListener: function () {}, removeEventListener: function () {},
      dispatchEvent: function () { return true; }
    };
  }

  /* ------------------------------------------------------------------ *
   *  2. 元素清理
   * ------------------------------------------------------------------ */

  var AD_SELECTORS = [
    'ins.adsbygoogle', '.adsbygoogle',
    'iframe[src*="doubleclick.net"]', 'iframe[src*="googlesyndication"]',
    'iframe[src*="amazon-adsystem"]', 'iframe[src*="adservice.google"]',
    'iframe[src*="snaptrckr"]', 'iframe[src*="rallytrck"]',
    'iframe[src*="mavrtracktor"]', 'iframe[src*="mayzaent"]',
    'iframe[src*="myavlive.com"]',
    '[id^="google_ads_iframe"]', '[id^="div-gpt-ad"]', '[id^="aswift_"]',
    '[id^="ad_"]', '[id^="ads"]', '[id^="ad-"]', '[id^="advert"]',
    '[id^="banner_"]', '[id^="banner-"]',
    '[class^="ad-"]', '[class^="ads"]', '[class^="advert"]',
    '[class*=" ad-"]', '[class*=" ad_"]', '[class*="-ad-"]', '[class*="_ad_"]',
    '[data-ad]', '[data-ad-slot]', '[data-ad-unit]', '[data-ad-client]', '[data-google-query-id]',
    '.ad-banner', '.ad-container', '.ad-wrapper', '.ad-slot', '.ad-unit',
    '.ad-placeholder', '.advertisement', '.advertising', '.advert', '.adsbox',
    '.ad_box', '.ad-wrap', '.banner-ad', '.sponsor-ad',
    '.popunder', '.popup-ad', '.ad-popup', '.interstitial-ad',
    '#BAIDU_SSP__wrapper', '.ec_ad', '.ec-tuiguang',
    '.ytp-ad-overlay-container', '.ytp-ad-image-overlay', '.ytp-ad-module',
    '.video-ads', '.ytp-ad-player-overlay-layout',
    '#player-ads', '#masthead-ad',
    'ytd-display-ad-renderer', 'ytd-promoted-sparkles-web-renderer',
    'ytd-in-feed-ad-layout-renderer', 'ytd-banner-promo-renderer',
    'ytd-statement-banner-renderer', 'ytd-ad-slot-renderer',
    'ytd-video-masthead-ad-v3-renderer',
    '.jw-ads', '.vjs-ad-overlay', '.ima-ad-container', '#ima-ad-container'
  ];

  var HAS_SUPPORT = false;
  try { HAS_SUPPORT = !!(window.CSS && CSS.supports && CSS.supports('selector(:has(*))')); } catch (e) {}
  // 把"装着广告 iframe 的外层空盒子"一起收掉；只在支持的核上注入
  var AD_HAS_SELECTORS = HAS_SUPPORT ? [
    'div:has(> iframe[src*="snaptrckr"])',
    'div:has(> iframe[src*="rallytrck"])',
    'div:has(> iframe[src*="mavrtracktor"])',
    'div:has(> iframe[src*="mayzaent"])',
    'div:has(> iframe[src*="myavlive.com"])'
  ] : [];

  var AD_SEL = AD_SELECTORS.join(',');
  var CSS_TEXT = AD_SEL + '{display:none !important}';
  if (AD_HAS_SELECTORS.length) {
    CSS_TEXT += '\n' + AD_HAS_SELECTORS.join(',') + '{display:none !important}';
  }

  // HTML 还在解析时不能直接 removeChild ——
  // 解析器的插入点会指向已摘除节点，导致后面整段内容被吞掉（踩过）
  function isAdTag(n) {
    var t = n.tagName;
    return t === 'IFRAME' || t === 'SCRIPT' || t === 'IMG' || t === 'EMBED' ||
      t === 'OBJECT' || t === 'LINK' || t === 'SOURCE' || t === 'VIDEO' ||
      t === 'AUDIO' || t === 'TRACK';
  }

  function nukeIfAd(n) {
    if (!n || n.nodeType !== 1 || !isAdTag(n)) return false;
    var src = n.getAttribute && (
      n.getAttribute('src') || n.getAttribute('data') ||
      n.getAttribute('href') || n.getAttribute('poster')
    );
    var srcset = n.getAttribute && n.getAttribute('srcset');
    var blocked = src && isBlocked(src, 'other');
    var blockedSet = !blocked && srcset && srcsetBlocked(srcset);
    if (!blocked && !blockedSet) return false;
    bump('req', src || srcset);

    try {
      if (document.readyState === 'loading') {
        n.__xbAbDead = true;
        if (n.tagName === 'SCRIPT') n.setAttribute('type', 'javascript/blocked');
        else if (n.tagName === 'IFRAME') n.setAttribute('src', 'about:blank');
        else if (blockedSet && n.removeAttribute) n.removeAttribute('srcset');
        // 按元素实际使用的属性删，否则广告照样加载
        else if (n.tagName === 'OBJECT' && n.removeAttribute) n.removeAttribute('data');
        else if (n.tagName === 'LINK' && n.removeAttribute) n.removeAttribute('href');
        else if (n.removeAttribute) n.removeAttribute('src');
        n.style.setProperty('display', 'none', 'important');
      } else if (n.parentNode) {
        n.parentNode.removeChild(n);
      }
    } catch (e) {}
    return true;
  }

  // 解析完成后，把标记过的一次性清掉
  function cleanDead(root) {
    root = root || document;
    var dead;
    try { dead = root.querySelectorAll('iframe,script,img,embed,object,link,source,video,audio'); } catch (e) { return; }
    for (var i = 0; i < dead.length; i++) {
      if (dead[i].__xbAbDead) {
        try { if (dead[i].parentNode) dead[i].parentNode.removeChild(dead[i]); } catch (e) {}
      }
    }
  }

  // meta refresh 跳到广告/弹窗地址
  function nukeMeta(m) {
    if (!m || m.tagName !== 'META') return false;
    var eq = '';
    try { eq = String(m.getAttribute('http-equiv') || '').toLowerCase(); } catch (e) {}
    if (eq !== 'refresh') return false;
    var content = m.getAttribute('content') || '';
    var match = /url\s*=\s*['"]?([^'";]+)/i.exec(content);
    var url = match ? match[1] : '';
    if (!url) return false;
    if (!isBlocked(url, 'popup') && !popupWrapper(url) && !linkBlockedUrl(url)) return false;
    bump('req', url);
    // 尽力而为：Chromium 可能已在解析时排好刷新定时器，摘掉节点也未必能取消导航
    try { if (m.parentNode) m.parentNode.removeChild(m); } catch (e) {}
    return true;
  }

  function hideEl(el) {
    if (!el || el.nodeType !== 1 || el.__xbAbHide) return false;
    el.__xbAbHide = true;
    try { el.style.setProperty('display', 'none', 'important'); } catch (e) {}
    stat.el++;
    maybeShowBadge();
    return true;
  }

  function hideAdLink(a) {
    if (!a || (a.tagName !== 'A' && a.tagName !== 'AREA') || a.__xbAbLink) return false;
    var href = a.getAttribute('href');
    if (!linkBlockedUrl(href)) return false;
    a.__xbAbLink = true;
    stat.el++;
    try { a.style.setProperty('display', 'none', 'important'); } catch (e) {}
    return true;
  }

  function scanLinks(root) {
    if (!root || !root.querySelectorAll) return;
    var list;
    try { list = root.querySelectorAll('a[href]'); } catch (e) { return; }
    for (var i = 0; i < list.length; i++) hideAdLink(list[i]);
  }

  function sweep(root) {
    if (!root || !root.querySelectorAll) return;
    // 先摘掉 src 命中黑名单的元素（含 HTML 里写死的 iframe/script）
    var bad;
    try {
      bad = root.querySelectorAll(
        'iframe[src],script[src],img[src],img[srcset],embed[src],object[data],' +
        'source[src],source[srcset],video[src],audio[src],link[href]'
      );
    } catch (e) { bad = []; }
    for (var b = 0; b < bad.length; b++) nukeIfAd(bad[b]);

    var metas;
    try { metas = root.querySelectorAll('meta[http-equiv]'); } catch (e) { metas = []; }
    for (var mi = 0; mi < metas.length; mi++) nukeMeta(metas[mi]);

    var list;
    try { list = root.querySelectorAll(AD_SEL); } catch (e) { return; }
    for (var i = 0; i < list.length; i++) hideEl(list[i]);

    scanLinks(root);
  }

  /* ------------------------------------------------------------------ *
   *  3. 样式 / Shadow DOM / 动态节点
   * ------------------------------------------------------------------ */

  var shadowRoots = [];
  var shadowObserved = 0;

  function injectCssInto(root) {
    if (!root) return false;
    try {
      var isDoc = root.nodeType === 9;
      var parent = isDoc ? (root.head || root.documentElement) : root;
      if (!parent) return false;
      if (parent.querySelector && parent.querySelector('style[data-xb-ab]')) return true;
      var doc = isDoc ? root : (root.ownerDocument || document);
      var s = doc.createElement('style');
      s.setAttribute('data-xb-ab', '1');
      s.textContent = CSS_TEXT;
      parent.appendChild(s);
      return true;
    } catch (e) { return false; }
  }

  function ensureCss() {
    var s = null;
    try { s = document.querySelector('style[data-xb-ab]'); } catch (e) {}
    if (!s) injectCssInto(document);
  }

  // 页面重设 innerHTML / 清空 shadow root 时，样式可能被一起清掉
  function ensureAllCss() {
    ensureCss();
    for (var i = 0; i < shadowRoots.length; i++) {
      try { injectCssInto(shadowRoots[i]); } catch (e) {}
    }
  }

  // 抓动态插入的广告；批量处理，避免每个节点都跑全量 querySelectorAll
  var pendingRoots = [];
  var pendingTimer = 0;
  var cssFlushCount = 0;

  function observeRoot(root) {
    if (!root || root.__xbAbObserved) return;
    root.__xbAbObserved = true;
    try {
      new MutationObserver(onMutations).observe(root, { childList: true, subtree: true });
    } catch (e) {}
  }

  function hitNode(n) {
    if (!n || n.nodeType !== 1) return false;
    if (nukeIfAd(n)) return true;
    if (n.tagName === 'META' && nukeMeta(n)) return true;
    if (n.tagName === 'A' || n.tagName === 'AREA') hideAdLink(n);
    if (n.shadowRoot) {
      injectCssInto(n.shadowRoot);
      observeRoot(n.shadowRoot);
      pendingRoots.push(n.shadowRoot);
    }
    return false;
  }

  function onMutations(muts) {
    for (var i = 0; i < muts.length; i++) {
      var added = muts[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (n.nodeType !== 1) continue;
        hitNode(n);
        if (n.firstElementChild) pendingRoots.push(n);
      }
    }
    scheduleSweep();
  }

  function scheduleSweep() {
    if (pendingTimer) return;
    pendingTimer = setTimeout(flushSweep, 120);
  }

  function flushSweep() {
    pendingTimer = 0;
    var roots = pendingRoots;
    pendingRoots = [];
    // 全量补样式要遍历所有 shadow root，分频执行（DOMContentLoaded/load 时也会补）
    var wantCss = (++cssFlushCount & 7) === 0;
    if (!roots.length) { if (wantCss) ensureAllCss(); return; }

    // 去掉被其他待扫节点包含的，减少重复扫描
    var list = [];
    for (var i = 0; i < roots.length && list.length < 80; i++) {
      var r = roots[i];
      if (!r || r.__xbAbGone) continue;
      var nested = false;
      for (var j = 0; j < list.length; j++) {
        if (list[j] !== r && list[j].contains && list[j].contains(r)) { nested = true; break; }
      }
      if (!nested) list.push(r);
    }
    for (var k = 0; k < list.length; k++) {
      try { if (list[k].isConnected !== false) sweep(list[k]); } catch (e) {}
    }
    if (wantCss) ensureAllCss();
  }

  // attachShadow 钩子：open/closed 都能拿到 root，样式和 observer 一次装好
  (function () {
    if (!Element.prototype || !Element.prototype.attachShadow) return;
    var _attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function () {
      var root = _attach.apply(this, arguments);
      if (buildingBadge) return root;   // 我们自己的徽标不用处理
      try {
        injectCssInto(root);
        if (shadowObserved < 100) {
          shadowRoots.push(root);
          observeRoot(root);
          shadowObserved++;
          scheduleSweep();
        }
      } catch (e) {}
      return root;
    };
  })();

  /* ------------------------------------------------------------------ *
   *  4. YouTube
   * ------------------------------------------------------------------ */

  var isYT = /(^|\.)youtube\.com$|(^|\.)youtube-nocookie\.com$|(^|\.)youtu\.be$/.test(HOST);

  // 首次加载的广告在内联 JSON（window.ytInitialPlayerResponse）里，fetch 钩子拦不到：
  // 本脚本跑在 document-start，给这个属性装个 setter 陷阱，
  // 页面内联脚本赋值的一瞬间就裁掉广告字段，播放器读到的已是干净数据
  if (isYT) {
    try {
      var ytPrVal = window.ytInitialPlayerResponse;
      Object.defineProperty(window, 'ytInitialPlayerResponse', {
        configurable: true,
        enumerable: true,
        get: function () { return ytPrVal; },
        set: function (v) {
          try {
            if (v && typeof v === 'object' && pruneYouTubeAds(v, 0)) {
              stat.ytapi++;
              maybeShowBadge();
            }
          } catch (e) {}
          ytPrVal = v;
        }
      });
    } catch (e) {}
  }

  var ytWasAd = false, ytRate = 1, ytMuted = false, ytCounted = false;

  function hideYtOverlays(player) {
    var sel = ['.ytp-ad-overlay-container', '.ytp-ad-overlay-slot', '.ytp-ad-image-overlay',
      '.ytp-ad-player-overlay-layout', '.ytp-ad-survey', '.ytp-ad-feedback-dialog'];
    for (var i = 0; i < sel.length; i++) {
      var el = player.querySelector(sel[i]);
      if (el) { try { el.style.setProperty('display', 'none', 'important'); } catch (e) {} }
    }
  }

  function ytTick() {
    if (!isYT) return;
    var player = document.querySelector('.html5-video-player');
    if (!player) return;
    var ad = player.classList.contains('ad-showing');

    if (!ad) {
      hideYtOverlays(player);
      if (ytWasAd) {
        ytWasAd = false;
        var v0 = player.querySelector('video');
        if (v0) {
          try { if (v0.playbackRate > 2) v0.playbackRate = ytRate || 1; } catch (e) {}
          try { v0.muted = ytMuted; } catch (e) {}
        }
      }
      return;
    }

    if (!ytWasAd) {
      ytWasAd = true;
      ytCounted = false;
      var v1 = player.querySelector('video');
      if (v1) {
        try { ytRate = v1.playbackRate || 1; ytMuted = !!v1.muted; } catch (e) {}
      }
    }

    // 有"跳过"就点
    var skip = player.querySelector(
      '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, ' +
      '.ytp-ad-skip-button-container button, .ytp-ad-skip-button-slot button'
    );
    if (skip) {
      try { skip.click(); } catch (e) {}
    }

    // 不能跳的贴片：静音 + 拉快到结尾
    var v = player.querySelector('video');
    if (v) {
      try { v.muted = true; } catch (e) {}
      try { if (v.playbackRate < 8) v.playbackRate = 16; } catch (e) {}
      try {
        if (isFinite(v.duration) && v.duration > 0 && v.currentTime < v.duration - 0.5) {
          v.currentTime = Math.max(0, v.duration - 0.1);
        }
      } catch (e) {}
    }
    if (!ytCounted) { ytCounted = true; stat.yt++; maybeShowBadge(); }
    hideYtOverlays(player);
  }

  /* ------------------------------------------------------------------ *
   *  4.5 通用播放器"跳过广告"自动点（不限站点）
   *  明确文案（跳过广告 / 关闭广告 / Skip this ad）直接点；
   *  裸"跳过 / Skip"要求离 video 足够近才点，防止误点站内其他跳转
   * ------------------------------------------------------------------ */

  var SKIP_EXACT = /^(跳过广告|跳过此广告|关闭广告|跳过 ?ads?|skip ?ads?|skip this ad|关闭 ?ads?|免广告继续|continue to video)$/i;
  var SKIP_HAS = /跳过广告|跳过此广告|关闭广告|skip this ad|skip ad/i;
  var SKIP_BARE = /^(跳过|skip|close ad)$/i;

  function nearVideo(el) {
    var n = el;
    for (var i = 0; i < 6 && n && n !== document.body; i++) {
      n = n.parentElement;
      if (n && n.querySelector && n.querySelector('video')) return true;
    }
    return false;
  }

  function skipTick() {
    if (!document.querySelector || !document.querySelector('video')) return;
    var btns;
    try {
      btns = document.querySelectorAll('button,a,[role=button],div[class*="skip" i],span[class*="skip" i]');
    } catch (e) {
      try { btns = document.querySelectorAll('button,a,[role=button]'); } catch (e2) { return; }
    }
    var now2 = Date.now();
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (b.__xbSkipAt && now2 - b.__xbSkipAt < 2500) continue;
      var txt = '';
      try { txt = (b.textContent || '').trim().replace(/\s+/g, ' '); } catch (e) {}
      if (!txt || txt.length > 18) continue;
      var hit = SKIP_EXACT.test(txt) || SKIP_HAS.test(txt);
      if (!hit && SKIP_BARE.test(txt)) hit = nearVideo(b);
      if (!hit) continue;
      if (!(b.offsetWidth > 0 && b.offsetHeight > 0)) continue;   // 还没显示（倒计时中）不点
      b.__xbSkipAt = now2;
      try {
        b.click();
        stat.skip++;
        maybeShowBadge();
      } catch (e) {}
    }
  }

  /* ------------------------------------------------------------------ *
   *  5. 徽标 / 面板
   * ------------------------------------------------------------------ */

  var badgeEl = null, badgeTimer = 0, badgeShown = false, badgeWait = 0, badgeTick = 0;
  var buildingBadge = false;   // 自家徽标的 shadow root 不用注入广告 CSS / observer

  function maybeShowBadge() {
    if (badgeShown) return;
    if (totalBlocked() < 2) return;
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

    var root;
    buildingBadge = true;
    try { root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host; }
    finally { buildingBadge = false; }

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
    if (badgeEl) badgeEl.num.textContent = String(totalBlocked());
  }

  function hideBadge() {
    if (!badgeEl) return;
    clearInterval(badgeTick);   // 徽标没了就别再空转刷新
    badgeTick = 0;
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
    var m = Object.create(null), out = [];
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
      '拦截: 请求 ' + stat.req + ' · 元素 ' + stat.el + ' · 弹窗 ' + stat.pop +
      ' · 视频 ' + stat.yt + ' · 跳过 ' + stat.skip + ' · YouTube接口 ' + stat.ytapi, '', '外部域名:'];
    for (var i = 0; i < list.length; i++) {
      var cls = classify('https://' + list[i][0] + '/', 'other');
      lines.push((cls ? '[已拦:' + cls + '] ' : '[未拦] ') + list[i][0] + ' x' + list[i][1]);
    }
    return lines.join('\n');
  }

  function showPanel() {
    if (!badgeEl) return;
    clearTimeout(badgeTimer);
    var root = badgeEl.host.shadowRoot || badgeEl.host;
    if (root.querySelector('.xb-card')) return;

    var card = document.createElement('div');
    card.className = 'xb-card';
    card.style.cssText = [
      'background:#171a20;color:#e8ecf3;border:1px solid #2a3038',
      'border-radius:12px;padding:12px 13px;margin-bottom:8px;width:252px',
      'box-shadow:0 6px 24px rgba(0,0,0,.5)',
      'font:12.5px/1.6 -apple-system,"PingFang SC",sans-serif',
      'max-height:60vh;overflow:auto'
    ].join(';');

    var n = totalBlocked();
    var head = '<div style="font-weight:600;margin-bottom:5px">广告拦截 v' + VERSION + '</div>' +
      '<div style="color:#9aa4b2;font-size:12px">本页拦截 <b style="color:#7fbcf5">' + n + '</b> 个' +
      '<span style="color:#5f6a7a">（请求 ' + stat.req + ' · 元素 ' + stat.el +
      (stat.pop ? ' · 弹窗 ' + stat.pop : '') +
      (stat.yt ? ' · 视频 ' + stat.yt : '') +
      (stat.skip ? ' · 跳过 ' + stat.skip : '') +
      (stat.ytapi ? ' · YT接口 ' + stat.ytapi : '') + '）</span></div>';

    var hosts = collectHosts().slice(0, 10);
    var rows = hosts.map(function (p) {
      var cls = classify('https://' + p[0] + '/', 'other');
      return '<div style="display:flex;justify-content:space-between;gap:8px;font-size:11.5px;line-height:1.75;' +
        'color:' + (cls ? '#6fa8e0' : '#c2cad6') + '">' +
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

    badgeTimer = setTimeout(hideBadge, 8000);
  }

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

  /* ------------------------------------------------------------------ *
   *  6. 启动
   * ------------------------------------------------------------------ */

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
    injectCssInto(document);
    observeRoot(document.documentElement);
    sweep(document.documentElement);
  });

  // 兜底：万一链接没被藏掉（比如页面自己又加回来），点击也拦一下
  document.addEventListener('click', function (e) {
    var t = e.target;
    while (t && t.nodeType === 1 && t.tagName !== 'A') t = t.parentNode;
    if (t && t.tagName === 'A' && linkBlockedUrl(t.getAttribute('href'))) {
      e.preventDefault();
      e.stopPropagation();
      stat.el++;
      maybeShowBadge();
    }
  }, true);

  document.addEventListener('DOMContentLoaded', function () {
    cleanDead();
    sweep(document);
    ensureAllCss();
    setInterval(skipTick, 700);   // 通用"跳过广告"自动点
    skipTick();
    if (isYT) {
      setInterval(ytTick, 600);
      ytTick();
    }
  });

  window.addEventListener('load', function () {
    cleanDead();
    sweep(document);
    ensureAllCss();
  });

  // 徽标上的数字保持最新
  badgeTick = setInterval(refreshBadge, 1200);

  window.__ab.enableLog = function (on) { window.__abLog = !!on; };
  window.__ab.sweep = sweep;
  window.__ab.injectCss = function () { return injectCssInto(document); };
})();
