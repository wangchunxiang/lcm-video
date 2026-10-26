(function () {
  var video = document.getElementById('player');
  var src = video && video.getAttribute('data-hls');
  if (!video || !src) return;

  if (window.Hls && window.Hls.isSupported()) {
    var hls = new window.Hls({ enableWorker: true, lowLatencyMode: false });
    hls.loadSource(src);
    hls.attachMedia(video);
    hls.on(window.Hls.Events.ERROR, function (_event, data) {
      if (data && data.fatal) {
        showTip('该线路暂不支持在线播放');
      }
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;
  } else {
    showTip('您的浏览器不支持在线播放');
  }

  function showTip(text) {
    var box = document.createElement('div');
    box.className = 'player-tip';
    box.textContent = text;
    box.style.cssText =
      'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
      'color:#fff;font-size:14px;background:rgba(0,0,0,.7);z-index:2';
    video.parentNode.appendChild(box);
  }
})();
