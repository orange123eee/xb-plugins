// ==UserScript==
// @name         阅读增强 · 畅读
// @namespace    local.xbrowser.reader
// @version      1.0.0
// @description  小说/长文阅读增强：自动抓取下一章无缝合并（免翻页连续滚动）、正文净化（去软广/推荐位）、字号行距主题调节、阅读进度记忆（重开续读）。检测到长文时右侧出现「畅读」页签。
// @author       me
// @match        *://*/*
// @run-at       document-end
// @grant        none
// @updateURL    https://orange123eee.github.io/xb-plugins/reader.user.js
// @downloadURL  https://orange123eee.github.io/xb-plugins/reader.user.js
// ==/UserScript==

// 思路借鉴 AutoPagerize（next 链接发现 + 无限拼接）与 ReaderMode（正文识别 + 排版接管），
// 面向中文小说站做了"下一章"文本识别与正文净化。只在用户开启后介入页面。

(function () {
  'use strict';

  if (window.__XB_READER__) return;
  window.__XB_READER__ = true;

  var VERSION = '1.0.0';
  var HOST = location.hostname;
  var IS_TOP = true;
  try { IS_TOP = (window.top === window.self); } catch (e) { IS_TOP = false; }

  /* ------------------------------------------------------------------ *
   *  配置与进度
   * ------------------------------------------------------------------ */

  var CFG_KEY = 'xbre.cfg';
  var cfg = { size: 19, lh: 1.9, width: 640, theme: 'paper' };   // theme: paper/dark/light
  try {
    var saved = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
    if (saved) for (var k in cfg) if (saved[k] != null) cfg[k] = saved[k];
  } catch (e) {}
  function saveCfg() {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {}
  }
  function posKey() { return 'xbre.pos:' + HOST + location.pathname; }

  var THEMES = {
    paper: { bg: '#f6f1e4', fg: '#33302a', sub: '#8a8272', link: '#0a66c2' },
    dark:  { bg: '#121316', fg: '#b8bcc4', sub: '#6b7078', link: '#7fa9ff' },
    light: { bg: '#ffffff', fg: '#222222', sub: '#888888', link: '#0a66c2' }
  };

  /* ------------------------------------------------------------------ *
   *  正文识别 / 下一章发现 / 净化
   * ------------------------------------------------------------------ */

  var CONTENT_SEL = '.content,#content,.contentbox,.content_box,.read,.readbox,.txt,#txt,' +
    '#chaptercontent,#content1,.article-content,.article-body,.article,#article,' +
    '.novel-content,.noveltext,.readcontent,.read-content,.book-reader,.txtnav,' +
    '#htmlContent,.showtxt,#showtxt,.show-content,.reader-content,.entry-content';

  // 识别正文容器：选择器候选按文本量打分，都不中则退回"子段最多的层块"
  function pickContent(doc) {
    var best = null, bestLen = 0;
    var cands = doc.querySelectorAll(CONTENT_SEL);
    for (var i = 0; i < cands.length; i++) {
      var len = (cands[i].textContent || '').length;
      if (len > bestLen) { best = cands[i]; bestLen = len; }
    }
    if (!best) {
      var divs = doc.querySelectorAll('article,div,section');
      for (var j = 0; j < divs.length; j++) {
        var ps = divs[j].querySelectorAll('p');
        if (ps.length < 2) continue;
        var l2 = (divs[j].textContent || '').length;
        if (l2 > bestLen) { best = divs[j]; bestLen = l2; }
      }
    }
    if (!best || bestLen < 200) return null;
    return { el: best, len: bestLen };
  }

  // 下一章链接：rel=next > 文案匹配 > class/id 匹配；返回绝对地址或 null
  var NEXT_TEXT = /^\s*(下一[章页頁节篇]|下章|下页|next)\s*[»›→]?\s*$/i;
  var NEXT_HINT = /(next|nextpage|xiayi|xiayi|xiazhang)/i;

  function findNextLink(doc, baseUrl) {
    var rel = doc.querySelector('link[rel=next][href], a[rel=next][href]');
    if (rel) return abs(rel.getAttribute('href'), baseUrl);
    var as = doc.querySelectorAll('a[href]');
    for (var i = 0; i < as.length; i++) {
      var a = as[i];
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#' || /^(javascript|mailto|tel):/i.test(href)) continue;
      var txt = (a.textContent || '').trim();
      var hit = NEXT_TEXT.test(txt) && txt.length < 16;
      if (!hit) {
        var cls = (a.className || '') + ' ' + (a.id || '');
        hit = NEXT_HINT.test(cls) && txt.length < 16;
      }
      if (hit) return abs(href, baseUrl);
    }
    return null;
  }

  function abs(href, baseUrl) {
    try {
      var u = new URL(href, baseUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      if (u.href === baseUrl) return null;
      return u.href;
    } catch (e) { return null; }
  }

  // 正文净化：脚本/框架剔除 + 常见软广/提示行剔除（只动短行，保守）
  var JUNK_RE = /(本站最新|最新网址|章节错误|点举报|点击举报|求收藏|求订阅|推荐票|月票|更新最快|首发于|转载自|请收藏|加入书签|方便阅读|APP.{0,4}(阅读|下载)|下载APP|打开APP|(手机|移动)版阅读)/;

  function cleanEl(el) {
    var dead = el.querySelectorAll('script,style,iframe,noscript,link,object,embed,ins');
    for (var i = 0; i < dead.length; i++) { try { dead[i].parentNode.removeChild(dead[i]); } catch (e) {} }
    var ps = el.querySelectorAll('p,div,span,font');
    for (var j = 0; j < ps.length; j++) {
      var n = ps[j];
      if (!n.parentNode) continue;
      var txt = (n.textContent || '').trim();
      if (!txt) { if (!n.querySelector('img,br')) { try { n.parentNode.removeChild(n); } catch (e) {} } continue; }
      if (txt.length < 120 && JUNK_RE.test(txt)) { try { n.parentNode.removeChild(n); } catch (e) {} }
    }
  }

  /* ------------------------------------------------------------------ *
   *  状态
   * ------------------------------------------------------------------ */

  var on = false;
  var contentEl = null;
  var nextUrl = null;
  var merging = false;
  var endReached = false;
  var hostAutoKey = 'xbre.on:' + HOST;

  /* ------------------------------------------------------------------ *
   *  UI（shadow 隔离：页签 / 设置条 / 提示）
   * ------------------------------------------------------------------ */

  var hostEl = null, root = null, tabEl = null, barEl = null, tipEl = null;

  function buildUI() {
    if (hostEl) return;
    hostEl = document.createElement('div');
    hostEl.id = '__xb_reader__';
    hostEl.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:2147483000;';
    root = hostEl.attachShadow ? hostEl.attachShadow({ mode: 'open' }) : hostEl;
    var css = document.createElement('style');
    css.textContent = [
      ':host{all:initial}',
      '*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}',
      '.tab{position:absolute;right:0;top:40%;pointer-events:auto;display:none;',
      'writing-mode:vertical-rl;letter-spacing:4px;padding:12px 7px;border-radius:8px 0 0 8px;',
      'background:linear-gradient(160deg,rgba(41,44,52,.95),rgba(20,22,27,.95));color:#e9ebef;',
      'font:600 13px/1 -apple-system,"PingFang SC","Noto Sans SC",sans-serif;',
      'border:1px solid rgba(255,255,255,.14);border-right:0;box-shadow:0 4px 16px rgba(0,0,0,.4);',
      'cursor:pointer;user-select:none;transition:transform .15s}',
      '.tab:active{transform:translateX(3px)}',
      '.tab.on{display:block}',
      '.bar{position:absolute;top:calc(8px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);',
      'pointer-events:auto;display:none;align-items:center;gap:7px;padding:7px 10px;border-radius:11px;',
      'background:rgba(20,22,27,.92);border:1px solid rgba(255,255,255,.1);box-shadow:0 6px 22px rgba(0,0,0,.45);',
      'backdrop-filter:blur(10px)}',
      '.bar.on{display:flex}',
      '.bar button{border:0;background:rgba(255,255,255,.09);color:#e9ebef;border-radius:8px;',
      'padding:7px 10px;font:600 12.5px/1 -apple-system,"PingFang SC",sans-serif;transition:transform .12s,background .15s}',
      '.bar button:active{transform:scale(.94);background:rgba(255,255,255,.2)}',
      '.bar .close{background:rgba(251,114,153,.22);color:#ff9dbb}',
      '.tip{position:absolute;bottom:9%;left:50%;transform:translateX(-50%);pointer-events:none;',
      'display:none;background:rgba(17,19,23,.9);color:#e9ebef;padding:8px 14px;border-radius:9px;',
      'font:12.5px/1.4 -apple-system,"PingFang SC",sans-serif;border:1px solid rgba(255,255,255,.08)}',
      '.tip.on{display:block}'
    ].join('');
    root.appendChild(css);

    tabEl = document.createElement('div');
    tabEl.className = 'tab';
    tabEl.textContent = '畅 读';
    root.appendChild(tabEl);

    barEl = document.createElement('div');
    barEl.className = 'bar';
    buildBar();
    root.appendChild(barEl);

    tipEl = document.createElement('div');
    tipEl.className = 'tip';
    root.appendChild(tipEl);

    tabEl.addEventListener('click', function () { setOn(!on); });
    document.documentElement.appendChild(hostEl);
  }

  function showTip(txt, ms) {
    if (!tipEl) return;
    tipEl.textContent = txt;
    tipEl.classList.add('on');
    clearTimeout(showTip._t);
    showTip._t = setTimeout(function () { tipEl.classList.remove('on'); }, ms || 2000);
  }

  var docStyle = null;
  function applyTheme() {
    if (!docStyle) return;   // 畅读未开启，样式节点还没建
    var t = THEMES[cfg.theme] || THEMES.paper;
    var st = docStyle;
    st.textContent = [
      'html.xbre-on{--xb-bg:' + t.bg + ';--xb-fg:' + t.fg + ';--xb-sub:' + t.sub + ';--xb-link:' + t.link + '}',
      'html.xbre-on body{background:' + t.bg + ' !important;color:' + t.fg + ' !important;}',
      'html.xbre-on .xbre-root{font-size:' + cfg.size + 'px !important;line-height:' + cfg.lh + ' !important;',
      'max-width:' + cfg.width + 'px !important;margin-left:auto !important;margin-right:auto !important;',
      'color:' + t.fg + ' !important;padding:12px 4px !important;}',
      'html.xbre-on .xbre-root, html.xbre-on .xbre-root *:not(a):not(img):not(button):not(input):not(select):not(textarea):not(video){',
      'color:' + t.fg + ' !important;background-color:transparent !important;box-shadow:none !important;}',
      'html.xbre-on .xbre-root a{color:' + t.link + ' !important}',
      'html.xbre-on .xbre-root img{max-width:100% !important;height:auto !important}',
      'html.xbre-on .xbre-root p{margin:0 0 .95em !important;}',
      '.xbre-div{text-align:center;color:' + t.sub + ' !important;margin:2.2em 0 !important;font-size:.92em;}',
      '.xbre-chunk{margin-top:1.6em;}'
    ].join('');
  }

  function buildBar() {
    var mk = function (label, fn, cls) {
      var b = document.createElement('button');
      b.textContent = label;
      b.setAttribute('data-xbr', label);
      if (cls) b.className = cls;
      b.addEventListener('click', function () { fn(); });
      barEl.appendChild(b);
      return b;
    };
    mk('A-', function () { cfg.size = Math.max(14, cfg.size - 1); applyTheme(); saveCfg(); });
    mk('A+', function () { cfg.size = Math.min(30, cfg.size + 1); applyTheme(); saveCfg(); });
    mk('行距', function () { cfg.lh = cfg.lh >= 2.3 ? 1.7 : Math.round((cfg.lh + 0.2) * 10) / 10; applyTheme(); saveCfg(); showTip('行距 ' + cfg.lh); });
    mk('主题', function () {
      cfg.theme = cfg.theme === 'paper' ? 'dark' : cfg.theme === 'dark' ? 'light' : 'paper';
      applyTheme(); saveCfg();
      showTip('主题：' + (cfg.theme === 'paper' ? '纸黄' : cfg.theme === 'dark' ? '夜间' : '纯白'));
    });
    mk('退出', function () { setOn(false); }, 'close');
  }

  /* ------------------------------------------------------------------ *
   *  畅读开关 / 自动合并 / 进度
   * ------------------------------------------------------------------ */

  function setOn(v) {
    if (v === on) return;
    on = v;
    if (on) {
      if (!contentEl) { var c = pickContent(document); if (!c) { showTip('本页没识别到正文'); on = false; return; } contentEl = c.el; }
      contentEl.classList.add('xbre-root');
      document.documentElement.classList.add('xbre-on');
      if (!docStyle) {
        docStyle = document.createElement('style');
        docStyle.id = 'xbre-doc-style';
        (document.head || document.documentElement).appendChild(docStyle);
      }
      applyTheme();
      barEl.classList.add('on');
      tabEl.classList.remove('on');
      try { localStorage.setItem(hostAutoKey, '1'); } catch (e) {}
      // 恢复进度（同一路径看过的接着读）
      try {
        var y = parseInt(localStorage.getItem(posKey()) || '0', 10);
        if (y > 300) setTimeout(function () { try { window.scrollTo(0, y); } catch (e) {} }, 200);
      } catch (e) {}
      if (nextUrl == null) nextUrl = findNextLink(document, location.href);
      showTip(nextUrl ? '畅读模式：读完本页自动接下一章' : '畅读模式（本页无下一章）');
      watchScroll();
    } else {
      contentEl.classList.remove('xbre-root');
      document.documentElement.classList.remove('xbre-on');
      if (docStyle) docStyle.textContent = '';
      barEl.classList.remove('on');
      tabEl.classList.add('on');
      try { localStorage.removeItem(hostAutoKey); } catch (e) {}
      savePos(true);
    }
  }

  function appendDivider(title) {
    var d = document.createElement('div');
    d.className = 'xbre-div';
    d.textContent = '— ' + (title || ('第 ' + (chapterCount + 1) + ' 页')) + ' —';
    contentEl.appendChild(d);
  }

  function chapterTitle(doc) {
    var h = doc.querySelector('h1,.title,#title,.bookname,h2');
    var t = h ? h.textContent.trim() : (doc.title || '').split(/[_|–-]/)[0].trim();
    return t.slice(0, 40);
  }

  function mergeNext() {
    if (merging || endReached || !nextUrl) return;
    merging = true;
    showTip('正在加载下一章…', 8000);
    var url = nextUrl;
    fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var c = pickContent(doc);
      if (!c || (c.el.textContent || '').trim().length < 50) throw new Error('下一页没有正文');
      cleanEl(c.el);
      appendDivider(chapterTitle(doc));
      var chunk = document.createElement('div');
      chunk.className = 'xbre-chunk';
      while (c.el.firstChild) chunk.appendChild(c.el.firstChild);
      contentEl.appendChild(chunk);
      nextUrl = findNextLink(doc, url);
      if (!nextUrl) {
        endReached = true;
        var end = document.createElement('div');
        end.className = 'xbre-div';
        end.textContent = '— 已是最新章节 —';
        contentEl.appendChild(end);
        showTip('已到最后一章', 2600);
      } else {
        showTip('已合并，继续滚动');
      }
      if (on) applyTheme();
    }).catch(function (e) {
      // 跨域章节（fetch 被 CORS 拒）或站点结构怪异：不再自动，提示手动
      try { window.__xbrErr = String((e && e.message) || e); } catch (e2) {}   // 现场：自动翻页失败原因
      var msg = (e && /fetch|NetworkError|CORS/i.test(String(e))) ? '跨域章节无法自动翻页，请点下一章' : '自动翻页失败，请手动点下一章';
      showTip(msg, 3200);
      endReached = true;
    }).then(function () {
      merging = false;
      // 合并完还在页面底部（长章一次合并不够）就继续
      if (!endReached && nextUrl && window.innerHeight + window.scrollY >= document.body.scrollHeight - window.innerHeight * 1.5) {
        setTimeout(mergeNext, 200);
      }
    });
  }

  function watchScroll() {
    var saveT = 0;
    window.addEventListener('scroll', function () {
      if (!on) return;
      // 合并触发：不设节流——mergeNext 自带 merging 重入保护，
      // 节流反而会让"400ms 内滚到底"的快速滚动漏触发（本机 fetch 快时必现）
      if (!merging && !endReached && nextUrl &&
          window.innerHeight + window.scrollY >= document.body.scrollHeight - window.innerHeight * 1.5) {
        mergeNext();
      }
      // 进度保存（节流 800ms）
      var now = Date.now();
      if (now - saveT > 800) {
        saveT = now;
        savePos();
      }
    }, { passive: true });
  }

  var lastSaved = -1;
  function savePos(force) {
    try {
      var y = Math.round(window.scrollY || 0);
      if (y < 200 && !force) return;
      if (Math.abs(y - lastSaved) < 100 && !force) return;
      lastSaved = y;
      localStorage.setItem(posKey(), String(y));
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ *
   *  检测与启动
   * ------------------------------------------------------------------ */

  function detectAndShow() {
    if (!IS_TOP || on) return;
    var c = pickContent(document);
    if (!c) return;
    // 正文里大多是链接 → 这是目录/列表页，不是正文页
    var as = c.el.querySelectorAll('a');
    var linkLen = 0;
    for (var i = 0; i < as.length; i++) linkLen += (as[i].textContent || '').length;
    if (linkLen > c.len * 0.55) return;
    var paras = c.el.querySelectorAll('p').length;
    var nu = findNextLink(document, location.href);
    if (c.len < 400 || (paras < 3 && !nu)) return;
    buildUI();
    tabEl.classList.add('on');
    nextUrl = nu;
    // 这个站点开过畅读 → 自动进入
    try { if (localStorage.getItem(hostAutoKey) === '1') setOn(true); } catch (e) {}
  }

  function start() {
    if (!IS_TOP) return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(detectAndShow, 400); }, { once: true });
    } else {
      setTimeout(detectAndShow, 400);
    }
  }

  // 只读诊断钩子：远程诊断/测试用（对齐 adblock 的 __ab、视频提取器的 __xbvk）
  try {
    window.__xbr = {
      version: VERSION,
      get on() { return on; },
      get hasPageTab() { return !!(tabEl && tabEl.classList.contains('on')); },
      get nextUrl() { return nextUrl; },
      get merging() { return merging; },
      get endReached() { return endReached; },
      get chapterCount() { return chapterCount; },
      get cfg() { try { return JSON.parse(JSON.stringify(cfg)); } catch (e) { return null; } },
      contentLen: function () { return contentEl ? (contentEl.textContent || '').length : -1; }
    };
  } catch (e) {}

  start();
})();
