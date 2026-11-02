(function () {
  var btn = document.querySelector('[data-ep-sort]');
  if (!btn) return;

  var desc = false;

  btn.addEventListener('click', function () {
    desc = !desc;
    btn.textContent = desc ? '倒序' : '正序';

    Array.prototype.forEach.call(document.querySelectorAll('.ep-panel .episode-grid'), function (grid) {
      var nodes = Array.prototype.slice.call(grid.children);
      nodes.reverse();
      Array.prototype.forEach.call(nodes, function (node) {
        grid.appendChild(node);
      });
    });
  });
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
            startPlayback(element, target, container);
          },
        },
      });
    } catch (error) {
      return initNative(container, url, hls, auto);
    }

    return art.video || null;
  }

  /* 播放内核：能原生播 HLS 就用原生，否则用 hls.js；任一方失败换另一方再试一次。
     苹果全系（含 Alook、微信）原生更稳，桌面 Chrome 等只能走 hls.js。 */
  function startPlayback(element, target, container) {
    var nativeType = element.canPlayType('application/vnd.apple.mpegurl');
    var canHls = !!(window.Hls && window.Hls.isSupported());
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
      element.src = target;
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

    if (nativeType) return useNative();
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


