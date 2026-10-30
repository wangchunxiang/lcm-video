/* 移动端交互：筛选收起、选集抽屉、列表触底加载 */
(function () {
  var toggle = document.querySelector('[data-toggle-filter]');
  var panel = document.querySelector('[data-filter-panel]');
  if (toggle && panel) {
    var open = false;
    toggle.addEventListener('click', function () {
      open = !open;
      panel.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    });
  }
})();

(function () {
  var sheet = document.querySelector('[data-eps-sheet]');
  if (!sheet) return;

  function setOpen(open) {
    sheet.classList.toggle('is-open', open);
    sheet.setAttribute('aria-hidden', String(!open));
    document.documentElement.style.overflow = open ? 'hidden' : '';
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-open-eps]'), function (el) {
    el.addEventListener('click', function () {
      setOpen(true);
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-close-eps]'), function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      setOpen(false);
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sheet.classList.contains('is-open')) setOpen(false);
  });
})();

(function () {
  var wrap = document.querySelector('.m-more-wrap');
  var link = document.getElementById('m-more');
  var list = document.getElementById('m-list');
  if (!wrap || !link || !list) return;

  var loading = false;

  function done() {
    wrap.remove();
    var end = document.createElement('p');
    end.className = 'm-end';
    end.textContent = '已全部加载';
    list.parentNode.insertBefore(end, list.nextSibling);
  }

  function load() {
    if (loading || !link.getAttribute('href')) return;
    loading = true;
    link.classList.add('is-loading');
    var url = link.getAttribute('href');

    fetch(url, { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var nextList = doc.getElementById('m-list');
        var nextLink = doc.getElementById('m-more');
        if (!nextList) throw new Error('empty response');

        Array.prototype.slice.call(nextList.children).forEach(function (node) {
          if (node.nodeType === 1) list.appendChild(node);
        });

        loading = false;
        link.classList.remove('is-loading');
        if (nextLink && nextLink.getAttribute('href') && nextLink.getAttribute('href') !== url) {
          link.setAttribute('href', nextLink.getAttribute('href'));
        } else {
          done();
        }
      })
      .catch(function () {
        loading = false;
        link.classList.remove('is-loading');
        link.textContent = '加载失败，点击重试';
      });
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (entry) { return entry.isIntersecting; })) load();
    }, { rootMargin: '200px 0px' });
    io.observe(wrap);
  } else {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      load();
    });
  }
})();

