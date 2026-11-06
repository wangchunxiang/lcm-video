(function () {
  var epBox = document.querySelector('#ep-groups');
  var epGroups = null;
  try {
    epGroups = epBox ? JSON.parse(epBox.textContent) : null;
  } catch (err) {
    epGroups = null;
  }
  var epVodId = epBox ? Number(epBox.dataset.vod) : 0;
  var epLineId = epBox ? Number(epBox.dataset.line) : 0;
  var epCurrent = epBox ? Number(epBox.dataset.ep) : 0;
  /* 每条线路在当前集的播放参数，换线路时用它就地重建播放器 */
  var lineData = [];
  /* 站名与片名用于就地换线路后同步浏览器标题 */
  var siteMeta = {};
  try {
    var lineBox = document.getElementById('line-data');
    lineData = lineBox ? JSON.parse(lineBox.textContent) : [];
    var metaBox = document.getElementById('play-conf');
    siteMeta = metaBox ? JSON.parse(metaBox.textContent) : {};
  } catch (err) {
    lineData = [];
    siteMeta = {};
  }
  /* 正序/倒序按影片分别记忆：同一部片跨线路、跨页面保持，换一部片回到正序 */
  var epDescKey = 'lcm:ep-desc:' + (epVodId || 0);
  var epDesc = false;
  try {
    epDesc = window.localStorage.getItem(epDescKey) === '1';
  } catch (err) {
    epDesc = false;
  }

  /* 当前线路的数据分组 */
  function currentGroup() {
    if (!epGroups) return null;
    return epGroups.filter(function (item) { return item.id === epLineId; })[0] || null;
  }

  /* 「立即播放」跟着排序走：倒序时播最后一集，正序时播第一集 */
  function syncPlayBtn() {
    var btn = document.querySelector('[data-hero-play]');
    if (!btn) return;
    var group = currentGroup();
    if (!group || !group.items.length) return;
    var target = epDesc ? group.items[group.items.length - 1] : group.items[0];
    btn.href = '/play/' + epVodId + '/' + group.id + '/' + target.i;
  }

  /* 排序不再翻转现有 DOM，而是按数据顺序重画，正反向都能回到正确顺序 */
  function renderLine(group) {
    if (!group) return;
    epLineId = group.id;
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

    var items = epDesc ? group.items.slice().reverse() : group.items;
    grid.textContent = '';
    items.forEach(function (ep) {
      var link = document.createElement('a');
      link.className = 'episode-btn';
      link.href = '/play/' + epVodId + '/' + group.id + '/' + ep.i;
      link.title = ep.n;
      link.textContent = ep.n;
      if (epCurrent && group.id === epLineId && ep.i === epCurrent) {
        link.className = 'episode-btn current';
      }
      grid.appendChild(link);
    });
    syncPlayBtn();
  }

  function bindSort() {
    var btn = document.querySelector('[data-ep-sort]');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.textContent = epDesc ? '倒序' : '正序';

    btn.addEventListener('click', function () {
      epDesc = !epDesc;
      btn.textContent = epDesc ? '倒序' : '正序';
      try {
        window.localStorage.setItem(epDescKey, epDesc ? '1' : '0');
      } catch (err) {
        /* 隐私模式下写不进去，忽略 */
      }
      var group = epGroups
        ? epGroups.filter(function (item) { return item.id === epLineId; })[0]
        : null;
      if (group) {
        renderLine(group);
        return;
      }
      /* 没有随页下发的数据时退回 DOM 翻转 */
      Array.prototype.forEach.call(document.querySelectorAll('.episode-grid, .m-ep-grid'), function (grid) {
        var nodes = Array.prototype.slice.call(grid.children);
        nodes.reverse();
        Array.prototype.forEach.call(nodes, function (node) {
          grid.appendChild(node);
        });
      });
    });
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
        if (!group) return;
        event.preventDefault();
        renderLine(group);
        Array.prototype.forEach.call(document.querySelectorAll('.ep-tab'), function (item) {
          item.classList.toggle('is-active', item === tab);
        });
      });
    });
  }

  function bindLineDD() {
    var root = document.querySelector('[data-line-dd]');
    if (!root || root.dataset.bound) return;
    root.dataset.bound = '1';

    var btn = root.querySelector('[data-line-dd-btn]');
    var panel = root.querySelector('[data-line-dd-panel]');
    var nameEl = root.querySelector('[data-line-dd-name]');
    var countEl = root.querySelector('[data-line-dd-count]');
    if (!btn || !panel) return;

    function close() {
      panel.hidden = true;
      btn.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    }

    btn.addEventListener('click', function (event) {
      event.stopPropagation();
      var open = panel.hidden;
      panel.hidden = !open;
      btn.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    document.addEventListener('click', function (event) {
      if (!panel.hidden && !root.contains(event.target)) close();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') close();
    });

    /* 上/下一集在首末集要能在链接和不可点之间互相切换 */
    var NAV_ICON = {
      prev: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
      next: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>'
    };

    function setNav(kind, href, text, off) {
      var node = document.querySelector('[data-ep-' + kind + ']');
      if (!node) return;
      var tag = off ? 'span' : 'a';
      if (node.tagName.toLowerCase() === tag) {
        if (!off) node.href = href;
        return;
      }
      var fresh = document.createElement(tag);
      fresh.setAttribute('data-ep-' + kind, '');
      fresh.innerHTML = text;
      if (off) {
        fresh.className = 'is-off';
      } else {
        fresh.href = href;
      }
      node.replaceWith(fresh);
    }

    /* 就地换线路后，把右栏的线路名、集名、上下集和地址一起对齐 */
    function syncSide(group, playItem, id) {
      renderLine(group);
      Array.prototype.forEach.call(root.querySelectorAll('[data-ep-line]'), function (other) {
        var on = Number(other.getAttribute('data-ep-line')) === id;
        other.classList.toggle('is-active', on);
        other.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      if (nameEl) nameEl.textContent = group.name;
      if (countEl) countEl.textContent = group.items.length + ' 集';

      /* 换了线路，按钮上的速度是旧线路的，先清掉 */
      var btnMs = document.querySelector('[data-line-ms]');
      if (btnMs) { btnMs.hidden = true; btnMs.textContent = ''; }

      var ep = Math.max(1, Math.min(Number(playItem.ep) || 1, group.items.length));
      var epName = '';
      group.items.forEach(function (entry) {
        if (entry.i === ep) epName = entry.n;
      });
      var title = document.querySelector('[data-ep-title]');
      if (title) title.textContent = epName;

      var base = '/play/' + epVodId + '/' + id + '/';
      setNav('prev', base + (ep - 1), NAV_ICON.prev + '上一集', ep <= 1);
      setNav('next', base + (ep + 1), '下一集' + NAV_ICON.next, ep >= group.items.length);
      history.replaceState(null, '', base + ep);
      document.title =
        (siteMeta.vod_name ? siteMeta.vod_name + ' ' : '') +
        epName +
        ' - ' +
        group.name +
        (siteMeta.site_name ? ' - ' + siteMeta.site_name : '');
      close();
    }

    Array.prototype.forEach.call(root.querySelectorAll('[data-ep-line]'), function (item) {
      item.addEventListener('click', function (event) {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        var id = Number(item.getAttribute('data-ep-line'));
        var group = epGroups
          ? epGroups.filter(function (g) { return g.id === id; })[0]
          : null;
        var playItem = lineData.filter(function (line) { return line.id === id; })[0];
        if (!group) { close(); return; }
        event.preventDefault();

        /* 有播放参数就就地换线路，不再整页刷新 */
        if (playItem && window.__lcmMountLine) {
          epCurrent = Math.max(1, Math.min(Number(playItem.ep) || 1, group.items.length));
          window.__lcmMountLine(playItem);
          syncSide(group, playItem, id);
          return;
        }

        renderLine(group);
        Array.prototype.forEach.call(root.querySelectorAll('[data-ep-line]'), function (other) {
          var on = other === item;
          other.classList.toggle('is-active', on);
          other.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        if (nameEl) nameEl.textContent = group.name;
        if (countEl) countEl.textContent = group.items.length + ' 集';
        history.replaceState(null, '', item.href);
        close();
      });
    });
  }

  /* 按毫秒数上色：800 以内绿、2000 以内黄、再慢红 */
  function paintSpeed(box, data) {
    if (!box) return;
    if (data && data.ok) {
      box.textContent = data.ms + ' ms';
      box.className = 'ms ' + (data.ms < 800 ? 'is-fast' : data.ms <= 2000 ? 'is-mid' : 'is-slow');
      return;
    }
    if (data && data.reason === 'iframe') {
      box.textContent = '网页';
      box.className = 'ms';
    } else if (data && data.reason === 'timeout') {
      box.textContent = '超时';
      box.className = 'ms is-slow';
    } else {
      box.textContent = '失败';
      box.className = 'ms is-slow';
    }
  }

  /* 线路并发测速：一次点击同时打所有线路，谁的先回来谁先填 */
  function bindSpeed() {
    var btn = document.querySelector('[data-line-speed]');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      var items = Array.prototype.slice.call(document.querySelectorAll('[data-ep-line]'));
      if (!items.length) return;
      btn.disabled = true;
      btn.textContent = '测速中';
      var ep = epCurrent || 1;
      var pending = items.length;

      function done() {
        pending -= 1;
        if (pending > 0) return;
        btn.disabled = false;
        btn.textContent = '测速';
      }

      var btnMs = document.querySelector('[data-line-ms]');
      if (btnMs) { btnMs.hidden = true; btnMs.textContent = ''; }

      items.forEach(function (item) {
        var box = item.querySelector('[data-ms]');
        if (box) {
          box.textContent = '…';
          box.className = 'ms';
        }
        var lineId = item.getAttribute('data-ep-line');
        fetch('/api/play/speed/' + epVodId + '/' + lineId + '?ep=' + ep)
          .then(function (res) { return res.json(); })
          .then(function (data) {
            paintSpeed(box, data);
            if (btnMs && item.classList.contains('is-active')) {
              paintSpeed(btnMs, data);
              btnMs.hidden = false;
            }
          })
          .catch(function () { paintSpeed(box, null); })
          .then(done);
      });
    });
  }

  bindTabs();
  bindSort();
  bindLineDD();
  bindSpeed();
  syncPlayBtn();

  /* 上次是倒序时，首屏按数据重画一次，避免按钮显示倒序但列表还是正序 */
  if (epDesc && epGroups) {
    var initGroup = epGroups.filter(function (g) { return g.id === epLineId; })[0] || epGroups[0];
    if (initGroup) renderLine(initGroup);
  }
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
  var mount = document.querySelector('.play-wrap .player') || document.querySelector('.m-player-wrap');
  var loadingEl = document.querySelector('[data-player-loading]');

  /* 底图先解码再挂到占位层上，否则未解码完的图片会从上往下逐行刷出来 */
  (function preloadLoadingArt() {
    if (!loadingEl) return;
    var art = new Image();
    var markReady = function () {
      loadingEl.classList.add('is-ready');
    };
    art.src = loadingEl.getAttribute('data-loading-src') || '/assets/img/loading.webp';
    if (art.decode) {
      art.decode().then(markReady).catch(markReady);
    } else if (art.complete) {
      markReady();
    } else {
      art.onload = markReady;
      art.onerror = markReady;
    }
  })();

  function showLoading() {
    if (loadingEl) loadingEl.classList.remove('is-hidden');
  }

  function hideLoading() {
    if (loadingEl) loadingEl.classList.add('is-hidden');
  }
  if (!mount) return;

  /* 自己给 video 赋 src 时，Artplayer 的 src 代理会再次回调 customType，这里用来打断重入 */
  var assigning = false;
  /* 换线路先销毁旧实例，避免新旧播放器同时挂在页面上 */
  var artInstance = null;
  var hlsList = [];
  var restored = false;

  /* 后台「播放设置」的开关随页面下发一次，换线路重建播放器时继续沿用 */
  var conf = {};
  (function () {
    var confBox = document.getElementById('play-conf');
    if (!confBox) return;
    try {
      conf = JSON.parse(confBox.textContent) || {};
    } catch (err) {
      conf = {};
    }
  })();

  /* 按 #player 上的 data-* 挂载播放器；iframe 线路没有 #player，直接跳过 */
  function mountPlayer() {
    var box = mount.querySelector('#player');
    if (!box) return;
    showLoading();
    var src = box.getAttribute('data-src') || '';
    if (!src) {
      hideLoading();
      showTip(box, '该线路暂不支持在线播放');
      return;
    }
    var isHls = box.getAttribute('data-hls') === '1';
    var autoplay = box.getAttribute('data-autoplay') === '1';

    /* 界面控件开关，见后台「播放设置」 */
    var flags = {
      screenshot: box.getAttribute('data-screenshot') === '1',
      fullscreen: box.getAttribute('data-fullscreen') === '1',
      webfullscreen: box.getAttribute('data-webfullscreen') === '1',
      setting: box.getAttribute('data-setting') === '1',
      lang: box.getAttribute('data-lang') || 'zh-cn',
      poster: box.getAttribute('data-poster') || '',
    };

    var video = window.Artplayer
      ? initArtPlayer(box, src, isHls, autoplay, flags)
      : initNative(box, src, isHls, autoplay, flags);

    if (video) attachBehaviors(video, box);
  }


  /* 播放结束后自动跳下一集、本地记录播放进度 */
  function attachBehaviors(element, container) {
    if (loadingEl) {
      element.addEventListener('loadeddata', hideLoading);
      element.addEventListener('playing', hideLoading);
      element.addEventListener('waiting', showLoading);
      element.addEventListener('error', hideLoading);
    }
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

    try {
      artInstance = new window.Artplayer({
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

    return artInstance.video || null;
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
      hlsList.push(instance);
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

  function destroyPlayer() {
    if (artInstance) {
      try {
        artInstance.destroy();
      } catch (err) {
        /* 实例可能已随 DOM 移除 */
      }
      artInstance = null;
    }
    hlsList.forEach(function (instance) {
      try {
        instance.destroy();
      } catch (err) {
        /* 已销毁 */
      }
    });
    hlsList = [];
  }

  /* 换线路：只重建播放器区域，页面其它部分保持不动 */
  function mountLine(item) {
    if (!item) return;
    destroyPlayer();

    var vodId = conf.vod_id || '';
    var ep = Number(item.ep) || 1;
    var next = item.count && ep < Number(item.count) ? '/play/' + vodId + '/' + item.id + '/' + (ep + 1) : '';

    if (item.iframe_url) {
      showLoading();
      var frame = document.createElement('iframe');
      frame.src = item.iframe_url;
      frame.setAttribute('allowfullscreen', '');
      frame.setAttribute('allow', 'autoplay; fullscreen; encrypted-media');
      frame.setAttribute('frameborder', '0');
      frame.setAttribute('scrolling', 'no');
      frame.addEventListener('load', hideLoading);
      mount.replaceChildren(frame);
      return;
    }

    var box = document.createElement('div');
    box.id = 'player';
    box.className = 'player-box';
    var attrs = {
      'data-src': item.play_url || '',
      'data-hls': item.is_hls === '1' ? '1' : '0',
      'data-autoplay': '1',
      'data-autonext': conf.autonext || '0',
      'data-resume': conf.resume || '0',
      'data-screenshot': conf.screenshot || '0',
      'data-webfullscreen': conf.webfullscreen || '0',
      'data-fullscreen': conf.fullscreen || '0',
      'data-setting': conf.setting || '0',
      'data-lang': conf.lang || 'zh-cn',
      'data-poster': conf.poster || '',
      'data-vod-id': vodId,
      'data-ep': String(ep),
      'data-next': next,
    };
    Object.keys(attrs).forEach(function (key) {
      box.setAttribute(key, attrs[key]);
    });
    mount.replaceChildren(box);
    mountPlayer();
  }

  window.__lcmMountLine = mountLine;
  mountPlayer();

  /* 首屏就是 iframe 线路时，等它加载完再收起占位 */
  (function () {
    var frame = mount.querySelector('iframe');
    if (!frame) return;
    showLoading();
    frame.addEventListener('load', hideLoading);
    setTimeout(hideLoading, 1500);
  })();
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

  /* 封面兜底：命中缓存或 bfcache 恢复时 load 事件可能已经过去，这里补一次 */
  document.querySelectorAll('img.cover-img').forEach(function (img) {
    if (img.complete && img.naturalWidth > 0) img.classList.add('is-loaded');
  });
})();
