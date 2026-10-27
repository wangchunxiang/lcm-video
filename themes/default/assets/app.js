(function () {
  var box = document.getElementById('player');
  if (!box) return;

  var src = box.getAttribute('data-src') || '';
  var isHls = box.getAttribute('data-hls') === '1';
  var kind = box.getAttribute('data-player') || 'dplayer';
  var autoplay = box.getAttribute('data-autoplay') === '1';

  if (!src) {
    showTip(box, '该线路暂不支持在线播放');
    return;
  }

  var video = null;
  if (kind === 'artplayer' && window.Artplayer) {
    video = initArtPlayer(box, src, isHls, autoplay);
  } else if (kind === 'dplayer' && window.DPlayer) {
    video = initDPlayer(box, src, isHls, autoplay);
  } else {
    video = initNative(box, src, isHls, autoplay);
  }

  if (video) attachBehaviors(video, box);

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

    if (!resume || !storageKey || !ep) return;

    var saved = readProgress(storageKey);
    if (saved && String(saved.ep) === String(ep) && saved.time > 5) {
      var seek = function () {
        if (!element.duration || saved.time < element.duration - 5) {
          try {
            element.currentTime = saved.time;
          } catch (error) {
            /* 忽略：部分流不支持跳转 */
          }
        }
        element.removeEventListener('loadedmetadata', seek);
      };
      element.addEventListener('loadedmetadata', seek);
    }

    var last = 0;
    element.addEventListener('timeupdate', function () {
      var now = Date.now();
      if (now - last < 5000) return;
      last = now;
      writeProgress(storageKey, ep, Math.floor(element.currentTime));
    });
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

  function initDPlayer(container, url, hls, auto) {
    if (hls && !window.Hls) return initNative(container, url, hls, auto);

    var player;
    try {
      player = new window.DPlayer({
        container: container,
        autoplay: auto,
        preload: 'metadata',
        theme: '#ff5c8a',
        video: {
          url: url,
          type: hls ? 'customHls' : 'auto',
        },
        customType: {
          customHls: function (element) {
            var instance = new window.Hls(hlsConfig());
            instance.loadSource(url);
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

    player.on('error', function () {
      showTip(container, '该线路暂不支持在线播放');
    });

    return player.video || null;
  }

  function initArtPlayer(container, url, hls, auto) {
    if (hls && !window.Hls) return initNative(container, url, hls, auto);

    var art;
    try {
      art = new window.Artplayer({
        container: container,
        url: url,
        type: hls ? 'm3u8' : 'auto',
        autoplay: auto,
        autoSize: false,
        airplay: true,
        setting: false,
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

  function initNative(container, url, hls, auto) {
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
