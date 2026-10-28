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
    pip: box.getAttribute('data-pip') === '1',
    fullscreen: box.getAttribute('data-fullscreen') === '1',
    webfullscreen: box.getAttribute('data-webfullscreen') === '1',
    setting: box.getAttribute('data-setting') === '1',
    miniProgress: box.getAttribute('data-mini-progress') === '1',
    autoMini: box.getAttribute('data-auto-mini') === '1',
    playbackRate: box.getAttribute('data-playback-rate') === '1',
    aspectRatio: box.getAttribute('data-aspect-ratio') === '1',
    flip: box.getAttribute('data-flip') === '1',
    lang: box.getAttribute('data-lang') || 'zh-cn',
    poster: box.getAttribute('data-poster') || '',
    loop: box.getAttribute('data-loop') === '1' && box.getAttribute('data-autonext') !== '1',
  };

  var video = null;
  if (window.Artplayer) {
    video = initArtPlayer(box, src, isHls, autoplay, flags);
  } else {
    video = initNative(box, src, isHls, autoplay, flags);
  }

  if (video) {
    applyOptions(video, box);
    attachBehaviors(video, box);
  }

  /* 初始音量、静音、键盘快捷键 */
  function applyOptions(element, container) {
    var volume = parseInt(container.getAttribute('data-volume') || '80', 10);
    if (isNaN(volume)) volume = 80;
    volume = Math.min(100, Math.max(0, volume));

    var muted = container.getAttribute('data-muted') === '1';

    var setVolume = function () {
      try {
        element.volume = volume / 100;
        element.muted = muted;
      } catch (error) {
        /* 忽略：部分浏览器在不允许操作时抛错 */
      }
      element.removeEventListener('loadedmetadata', setVolume);
    };
    setVolume();
    element.addEventListener('loadedmetadata', setVolume);

    if (container.getAttribute('data-hotkey') === '1') bindHotkeys(element);
  }

  function bindHotkeys(element) {
    document.addEventListener('keydown', function (event) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      var tag = (event.target && event.target.tagName ? event.target.tagName : '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      var key = event.key;
      if (key === ' ' || key === 'Spacebar') {
        event.preventDefault();
        if (element.paused) {
          var played = element.play();
          if (played && played.catch) played.catch(function () {});
        } else {
          element.pause();
        }
      } else if (key === 'ArrowLeft') {
        event.preventDefault();
        element.currentTime = Math.max(0, element.currentTime - 10);
      } else if (key === 'ArrowRight') {
        event.preventDefault();
        var max = element.duration || element.currentTime + 10;
        element.currentTime = Math.min(max, element.currentTime + 10);
      } else if (key === 'ArrowUp') {
        event.preventDefault();
        element.muted = false;
        element.volume = Math.min(1, element.volume + 0.1);
      } else if (key === 'ArrowDown') {
        event.preventDefault();
        element.volume = Math.max(0, element.volume - 0.1);
      }
    });
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
    return { enableWorker: true, lowLatencyMode: false };
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
        hotkey: false,
        autoSize: false,
        airplay: true,
        screenshot: !!flags.screenshot,
        pip: !!flags.pip,
        fullscreen: !flags.fullscreen ? false : true,
        fullscreenWeb: !!flags.webfullscreen,
        setting: !!flags.setting,
        playbackRate: !!flags.playbackRate,
        aspectRatio: !!flags.aspectRatio,
        flip: !!flags.flip,
        miniProgressBar: !!flags.miniProgress,
        autoMini: !!flags.autoMini,
        loop: !!flags.loop,
        customType: {
          m3u8: function (element, target) {
            var instance = new window.Hls(hlsConfig());
            instance.loadSource(target);
            instance.attachMedia(element);
            instance.on(window.Hls.Events.ERROR, function (_event, data) {
              if (data && data.fatal) showTip(container, '该线路暂不支持在线播放');
            });
          },
        },
      });
    } catch (error) {
      return initNative(container, url, hls, auto);
    }

    return art.video || null;
  }

  function initNative(container, url, hls, auto, flags) {
    flags = flags || {};
    var element = document.createElement('video');
    element.loop = !!flags.loop;
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

    if (window.Hls && window.Hls.isSupported()) {
      var instance = new window.Hls(hlsConfig());
      instance.loadSource(url);
      instance.attachMedia(element);
      instance.on(window.Hls.Events.ERROR, function (_event, data) {
        if (data && data.fatal) showTip(container, '该线路暂不支持在线播放');
      });
    } else if (element.canPlayType('application/vnd.apple.mpegurl')) {
      element.src = url;
    } else {
      showTip(container, '您的浏览器不支持在线播放');
    }

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
