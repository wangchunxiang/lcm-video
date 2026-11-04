(function () {
  /* 正序/倒序是跨线路的状态，切换线路后保持不变 */
  var epDesc = false;

  function sortGrid() {
    Array.prototype.forEach.call(document.querySelectorAll('.episode-grid, .m-ep-grid'), function (grid) {
      var nodes = Array.prototype.slice.call(grid.children);
      if (epDesc) nodes.reverse();
      Array.prototype.forEach.call(nodes, function (node) {
        grid.appendChild(node);
      });
    });
  }

  function bindSort() {
    var btn = document.querySelector('[data-ep-sort]');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.textContent = epDesc ? '倒序' : '正序';

    btn.addEventListener('click', function () {
      epDesc = !epDesc;
      btn.textContent = epDesc ? '倒序' : '正序';
      sortGrid();
    });
  }

  /* 切换线路：剧集数据随详情页一次性下发，这里直接渲染，不发请求 */
  var epBox = document.querySelector('#ep-groups');
  var epGroups = null;
  try {
    epGroups = epBox ? JSON.parse(epBox.textContent) : null;
  } catch (err) {
    epGroups = null;
  }
  var epVodId = epBox ? Number(epBox.dataset.vod) : 0;

  function renderLine(group) {
    var panel = document.querySelector('.ep-panel');
    if (!panel) return;

    if (!group.items.length) {
      panel.innerHTML = '<p class="empty-tip">该线路暂无剧集</p>';
      return;
    }

    var grid = panel.querySelector('.episode-grid');
    if (!grid) {
      panel.innerHTML = '<div class="ep-scroll"><div class="episode-grid"></div></div>';
      grid = panel.querySelector('.episode-grid');
    }

    grid.textContent = '';
    group.items.forEach(function (ep) {
      var link = document.createElement('a');
      link.className = 'episode-btn';
      link.href = '/play/' + epVodId + '/' + group.id + '/' + ep.i;
      link.title = ep.n;
      link.textContent = ep.n;
      grid.appendChild(link);
    });
    /* 按当前排序状态重排新线路的格子 */
    sortGrid();
  }

  function bindTabs() {
    Array.prototype.forEach.call(document.querySelectorAll('.ep-tab'), function (tab) {
      if (tab.dataset.bound) return;
      tab.dataset.bound = '1';
      tab.addEventListener('click', function (event) {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        var href = tab.href;
        var match = href.match(/line=(\d+)/);
        var group = match && epGroups
          ? epGroups.filter(function (item) { return item.id === Number(match[1]); })[0]
          : null;
        /* 没有随页下发的数据时退回整页跳转 */
        if (!group) return;
        event.preventDefault();
        renderLine(group);
        Array.prototype.forEach.call(document.querySelectorAll('.ep-tab'), function (item) {
          item.classList.toggle('is-active', item === tab);
        });
        history.replaceState(null, '', href);
      });
    });
  }

  bindSort();
  bindTabs();
})();

(function () {
  var triggers = document.querySelectorAll('[data-intro-float]');
  if (!triggers.length) return;

  var panel = document.querySelector('[data-intro-float-panel]');
  if (!panel) return;

  var body = panel.querySelector('.intro-float-bd');

  function close() {
    panel.classList.remove('is-open');
    if (body) body.scrollTop = 0;
  }

  Array.prototype.forEach.call(triggers, function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = panel.classList.toggle('is-open');
      if (!open && body) body.scrollTop = 0;
    });
  });

  document.addEventListener('click', function (e) {
    if (!panel.classList.contains('is-open')) return;
    if (panel.contains(e.target)) return;
    close();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });
})();

(function () {
  var tabs = document.querySelectorAll('[data-ep-tab]');
  if (!tabs.length) return;

  Array.prototype.forEach.call(tabs, function (tab) {
    tab.addEventListener('click', function () {
      var id = tab.getAttribute('data-ep-tab');

      Array.prototype.forEach.call(tabs, function (item) {
        item.classList.toggle('is-active', item === tab);
        item.classList.toggle('is-on', item === tab);
      });

      Array.prototype.forEach.call(document.querySelectorAll('[data-ep-panel]'), function (panel) {
        panel.classList.toggle('is-active', panel.getAttribute('data-ep-panel') === id);
      });
    });
  });
})();

(function () {
  var box = document.getElementById('player');
  if (!box) return;

  /* 自己给 video 赋 src 时，Artplayer 的 src 代理会再次回调 customType，这里用来打断重入 */
  var assigning = false;

  var src = box.getAttribute('data-src') || '';
  var isHls = box.getAttribute('data-hls') === '1';
  var autoplay = box.getAttribute('data-autoplay') === '1';

  if (!src) {
    showTip(box, '该线路暂不支持在线播放');
    return;
  }

  /* 界面控件开关，见后台「播放设置」 */
  var flags = {
    screenshot: box.getAttribute('data-screenshot') === '1',
    fullscreen: box.getAttribute('data-fullscreen') === '1',
    webfullscreen: box.getAttribute('data-webfullscreen') === '1',
    setting: box.getAttribute('data-setting') === '1',
    lang: box.getAttribute('data-lang') || 'zh-cn',
    poster: box.getAttribute('data-poster') || '',
  };

  var video = null;
  if (window.Artplayer) {
    video = initArtPlayer(box, src, isHls, autoplay, flags);
  } else {
    video = initNative(box, src, isHls, autoplay, flags);
  }

  if (video) {
    attachBehaviors(video, box);
  }


  /* 播放结束后自动跳下一集、本地记录播放进度 */
  function attachBehaviors(element, container) {
    var autonext = container.getAttribute('data-autonext') === '1';
    var resume = container.getAttribute('data-resume') === '1';
    var nextUrl = container.getAttribute('data-next') || '';
    var vodId = container.getAttribute('data-vod-id') || '';
    var ep = container.getAttribute('data-ep') || '';
    var storageKey = vodId ? 'lcm:progress:' + vodId : '';

    if (autonext && nextUrl) {
      element.addEventListener('ended', function () {
        if (storageKey) writeProgress(storageKey, ep, 0);
        window.location.href = nextUrl;
      });
    }

    if (resume && storageKey && ep) {
      var saved = readProgress(storageKey);
      if (saved && String(saved.ep) === String(ep) && saved.time > 5) {
        restored = true;
        element.addEventListener('loadedmetadata', function seekSaved() {
          if (!element.duration || saved.time < element.duration - 5) {
            try {
              element.currentTime = saved.time;
            } catch (error) {
              /* 忽略：部分流不支持跳转 */
            }
          }
          element.removeEventListener('loadedmetadata', seekSaved);
        });
      }

      var last = 0;
      element.addEventListener('timeupdate', function () {
        var now = Date.now();
        if (now - last < 5000) return;
        last = now;
        writeProgress(storageKey, ep, Math.floor(element.currentTime));
      });
    }

  }

  function readProgress(key) {
    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) return null;
      var value = JSON.parse(raw);
      return value && typeof value.time === 'number' ? value : null;
    } catch (error) {
      return null;
    }
  }

  function writeProgress(key, ep, time) {
    try {
      window.localStorage.setItem(key, JSON.stringify({ ep: ep, time: time, at: Date.now() }));
    } catch (error) {
      /* 忽略：无痕模式等场景下不可写 */
    }
  }

  function hlsConfig() {
    /* maxAudioFramesDrift：源站每 20 秒一个 discontinuity，音频帧时间戳会跳，
       默认容差 1 帧容易丢帧/补帧，表现为持续呲啦声，放宽到 5 帧后消失 */
    return { enableWorker: true, lowLatencyMode: false, maxAudioFramesDrift: 5 };
  }

  function initArtPlayer(container, url, hls, auto, flags) {
    flags = flags || {};
    if (hls && !window.Hls) return initNative(container, url, hls, auto, flags);

    var art;
    try {
      art = new window.Artplayer({
        container: container,
        url: url,
        type: hls ? 'm3u8' : 'auto',
        poster: flags.poster || '',
        lang: flags.lang,
        autoplay: auto,
        hotkey: true,
        theme: '#2563eb',
        autoSize: false,
        airplay: true,
        screenshot: !!flags.screenshot,
        fullscreen: !flags.fullscreen ? false : true,
        fullscreenWeb: !!flags.webfullscreen,
        setting: !!flags.setting,
        customType: {
          m3u8: function (element, target) {
            if (assigning) return;
            startPlayback(element, target, container);
          },
        },
      });
    } catch (error) {
      return initNative(container, url, hls, auto);
    }

    return art.video || null;
  }

  /* 播放内核：苹果系（含 Alook、微信）优先原生，其它有 MSE 的走 hls.js；任一方失败换另一方再试一次。
     注意：Chrome 对 application/vnd.apple.mpegurl 会返回 "maybe"，不能只看 canPlayType 就选原生。 */
  function startPlayback(element, target, container) {
    var nativeType = element.canPlayType('application/vnd.apple.mpegurl');
    var canHls = !!(window.Hls && window.Hls.isSupported());
    var ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    var switched = false;

    function fail() {
      showTip(container, '该线路暂不支持在线播放');
    }

    function useNative() {
      var onError = function () {
        element.removeEventListener('error', onError);
        if (!switched && canHls) {
          switched = true;
          useHls();
          return;
        }
        fail();
      };
      element.addEventListener('error', onError);
      assigning = true;
      try {
        element.src = target;
      } finally {
        assigning = false;
      }
      if (element.autoplay) element.play().catch(function () {});
    }

    function useHls() {
      if (!canHls) {
        if (nativeType) return useNative();
        return fail();
      }
      var instance = new window.Hls(hlsConfig());
      instance.on(window.Hls.Events.ERROR, function (_event, data) {
        if (!data || !data.fatal) return;
        instance.destroy();
        if (!switched && nativeType) {
          switched = true;
          useNative();
          return;
        }
        fail();
      });
      instance.loadSource(target);
      instance.attachMedia(element);
    }

    if (nativeType && (ios || !canHls)) return useNative();
    if (canHls) return useHls();
    return useNative();
  }

  function initNative(container, url, hls, auto, flags) {
    flags = flags || {};
    var element = document.createElement('video');
    element.controls = true;
    element.playsInline = true;
    element.preload = 'metadata';
    element.autoplay = auto;
    element.style.width = '100%';
    element.style.height = '100%';
    element.style.background = '#000';
    container.replaceChildren(element);

    if (!hls) {
      element.src = url;
      element.addEventListener('error', function () {
        showTip(container, '该线路暂不支持在线播放');
      });
      return element;
    }

    startPlayback(element, url, container);

    return element;
  }

  function showTip(container, text) {
    if (container.querySelector('.player-tip')) return;
    var tip = document.createElement('div');
    tip.className = 'player-tip';
    tip.textContent = text;
    tip.style.cssText =
      'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
      'color:#fff;font-size:14px;background:rgba(0,0,0,.7);z-index:20';
    container.appendChild(tip);
  }
})();

/* 页头：页面顶部的透明，往下滚一点再浮出底色（避免顶部出现分割线） */
(function () {
  var header = document.querySelector('.site-header');
  if (!header) return;
  function sync() {
    header.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', sync, { passive: true });
  sync();
})();

/* 搜索框：有内容时显示自定义清除按钮，点击清空并保持焦点 */
(function () {
  var box = document.querySelector('.search-box');
  if (!box) return;
  var input = box.querySelector('input[type="search"]');
  var clear = box.querySelector('[data-search-clear]');
  if (!input || !clear) return;

  function sync() {
    clear.hidden = input.value.length === 0;
  }

  input.addEventListener('input', sync);
  clear.addEventListener('click', function () {
    input.value = '';
    input.focus();
    sync();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  sync();
})();

/* 详情页：简介展开/收起 + 分享复制链接 */
(function () {
  var intro = document.querySelector('[data-intro]');
  var introOpen = document.querySelector('[data-intro-open]');
  var introModal = document.querySelector('[data-intro-modal]');

  var introText = document.querySelector('[data-intro-text]');

  if (intro && introText) {
    var fullText = introText.textContent;
    function fitIntro() {
      if (introOpen) introOpen.style.display = '';
      var fontSize = parseFloat(getComputedStyle(intro).fontSize) || 15;
      /* 每字按字号估宽（全角中文的最宽情况），宁可早截一点也不溢行 */
      var charW = fontSize;
      var perLine = Math.max(8, Math.floor(intro.clientWidth / charW));
      var maxChars = perLine * 2 - 5;
      if (fullText.length <= maxChars) {
        introText.textContent = fullText;
        if (introOpen) introOpen.style.display = 'none';
        return;
      }
      introText.textContent = fullText.slice(0, maxChars) + '…';
    }
    fitIntro();
    var fitTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(fitTimer);
      fitTimer = setTimeout(fitIntro, 120);
    });
  }

  if (introOpen && introModal) {
    function openIntro() {
      introModal.hidden = false;
      var body = introModal.querySelector('.intro-modal-bd');
      if (body) body.scrollTop = 0;
    }
    function closeIntro() {
      introModal.hidden = true;
    }
    introOpen.addEventListener('click', function (event) {
      event.stopPropagation();
      openIntro();
    });
    document.addEventListener('click', function (event) {
      if (introModal.hidden) return;
      if (introModal.contains(event.target) || introOpen.contains(event.target)) return;
      closeIntro();
    });
    var introClose = introModal.querySelector('[data-intro-close]');
    if (introClose) introClose.addEventListener('click', closeIntro);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !introModal.hidden) closeIntro();
    });
  }

  function toast(text) {
    var box = document.querySelector('.site-toast');
    if (!box) {
      box = document.createElement('div');
      box.className = 'site-toast';
      document.body.appendChild(box);
    }
    box.textContent = text;
    box.classList.add('is-show');
    clearTimeout(box._timer);
    box._timer = setTimeout(function () {
      box.classList.remove('is-show');
    }, 1800);
  }

  var qrTrigger = document.querySelector('[data-qr]');
  var qrPanel = document.querySelector('[data-qr-panel]');
  if (!qrTrigger || !qrPanel) return;

  var qrBox = qrPanel.querySelector('[data-qr-code]');
  var qrBuilt = false;

  function buildQr() {
    if (qrBuilt || typeof window.qrcode !== 'function' || !qrBox) return;
    var qr = window.qrcode(0, 'M');
    qr.addData(window.location.href);
    qr.make();
    qrBox.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2 });
    qrBuilt = true;
  }

  // 悬停即生成并展示，点击用于键盘/触屏
  qrTrigger.addEventListener('mouseenter', buildQr);
  qrTrigger.addEventListener('focus', buildQr);
  qrTrigger.addEventListener('click', function (event) {
    event.preventDefault();
    buildQr();
    qrPanel.classList.toggle('is-open');
  });
  document.addEventListener('click', function (event) {
    if (!qrPanel.classList.contains('is-open')) return;
    if (qrTrigger.contains(event.target) || qrPanel.contains(event.target)) return;
    qrPanel.classList.remove('is-open');
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') qrPanel.classList.remove('is-open');
  });
})();
