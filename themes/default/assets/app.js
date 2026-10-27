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

  /* 界面控件开关，见后台「播放设置」 */
  var flags = {
    screenshot: box.getAttribute('data-screenshot') === '1',
    pip: box.getAttribute('data-pip') === '1',
    webfullscreen: box.getAttribute('data-webfullscreen') === '1',
    setting: box.getAttribute('data-setting') === '1',
    loop: box.getAttribute('data-loop') === '1' && box.getAttribute('data-autonext') !== '1',
  };

  var video = null;
  if (kind === 'artplayer' && window.Artplayer) {
    video = initArtPlayer(box, src, isHls, autoplay, flags);
  } else if (kind === 'dplayer' && window.DPlayer) {
    video = initDPlayer(box, src, isHls, autoplay, flags);
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

  function initDPlayer(container, url, hls, auto, flags) {
    flags = flags || {};
    if (hls && !window.Hls) return initNative(container, url, hls, auto, flags);

    var player;
    try {
      player = new window.DPlayer({
        container: container,
        autoplay: auto,
        hotkey: false,
        screenshot: !!flags.screenshot,
        setting: !!flags.setting,
        loop: !!flags.loop,
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

    if (flags.pip) addPipButton(container, player.video);

    return player.video || null;
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
        autoplay: auto,
        hotkey: false,
        autoSize: false,
        airplay: true,
        screenshot: !!flags.screenshot,
        pip: !!flags.pip,
        fullscreenWeb: !!flags.webfullscreen,
        setting: !!flags.setting,
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

  /* DPlayer 没有画中画开关，用浏览器原生画中画补一个按钮 */
  function addPipButton(container, element) {
    if (!element || !document.pictureInPictureEnabled) return;
    if (container.querySelector('.lcm-pip')) return;

    var button = document.createElement('button');
    button.className = 'lcm-pip';
    button.type = 'button';
    button.title = '画中画';
    button.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">' +
      '<path d="M19 11h-8v6h8v-6zm4 8V5a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2zm-2 .02H3V5h18v14z"/></svg>';
    button.style.cssText =
      'position:absolute;top:10px;right:10px;z-index:15;display:flex;align-items:center;justify-content:center;' +
      'width:32px;height:32px;padding:0;border:none;border-radius:4px;cursor:pointer;' +
      'color:#fff;background:rgba(0,0,0,.45);opacity:.8';
    button.addEventListener('mouseenter', function () {
      button.style.opacity = '1';
    });
    button.addEventListener('mouseleave', function () {
      button.style.opacity = '0.8';
    });
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      try {
        if (document.pictureInPictureElement) {
          document.exitPictureInPicture();
        } else {
          element.requestPictureInPicture();
        }
      } catch (error) {
        /* 忽略：浏览器不支持或用户拒绝 */
      }
    });
    container.appendChild(button);
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
