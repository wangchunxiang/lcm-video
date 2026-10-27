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

  if (kind === 'artplayer' && window.Artplayer) {
    initArtPlayer(box, src, isHls, autoplay);
  } else if (kind === 'dplayer' && window.DPlayer) {
    initDPlayer(box, src, isHls, autoplay);
  } else {
    initNative(box, src, isHls, autoplay);
  }

  function hlsConfig() {
    return { enableWorker: true, lowLatencyMode: false };
  }

  function initDPlayer(container, url, hls, auto) {
    if (hls && !window.Hls) {
      initNative(container, url, hls, auto);
      return;
    }

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
          customHls: function (video) {
            var instance = new window.Hls(hlsConfig());
            instance.loadSource(url);
            instance.attachMedia(video);
            instance.on(window.Hls.Events.ERROR, function (_event, data) {
              if (data && data.fatal) showTip(container, '该线路暂不支持在线播放');
            });
          },
        },
      });
    } catch (error) {
      initNative(container, url, hls, auto);
      return;
    }

    player.on('error', function () {
      showTip(container, '该线路暂不支持在线播放');
    });
  }

  function initArtPlayer(container, url, hls, auto) {
    if (hls && !window.Hls) {
      initNative(container, url, hls, auto);
      return;
    }

    try {
      new window.Artplayer({
        container: container,
        url: url,
        type: hls ? 'm3u8' : 'auto',
        autoplay: auto,
        autoSize: false,
        airplay: true,
        setting: false,
        customType: {
          m3u8: function (video, target) {
            var instance = new window.Hls(hlsConfig());
            instance.loadSource(target);
            instance.attachMedia(video);
            instance.on(window.Hls.Events.ERROR, function (_event, data) {
              if (data && data.fatal) showTip(container, '该线路暂不支持在线播放');
            });
          },
        },
      });
    } catch (error) {
      initNative(container, url, hls, auto);
    }
  }

  function initNative(container, url, hls, auto) {
    var video = document.createElement('video');
    video.id = 'player';
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.autoplay = auto;
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.background = '#000';
    container.replaceChildren(video);

    if (!hls) {
      video.src = url;
      video.addEventListener('error', function () {
        showTip(container, '该线路暂不支持在线播放');
      });
      return;
    }

    if (window.Hls && window.Hls.isSupported()) {
      var instance = new window.Hls(hlsConfig());
      instance.loadSource(url);
      instance.attachMedia(video);
      instance.on(window.Hls.Events.ERROR, function (_event, data) {
        if (data && data.fatal) showTip(container, '该线路暂不支持在线播放');
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
    } else {
      showTip(container, '您的浏览器不支持在线播放');
    }
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
