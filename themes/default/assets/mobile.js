/* 移动端交互：通用抽屉、筛选开合、列表触底加载、页头滚动 */
(function () {
  var sheets = Array.prototype.slice.call(document.querySelectorAll('[data-sheet]'));
  if (!sheets.length) return;

  var active = null;

  function setOpen(sheet, open) {
    if (!sheet) return;
    if (open) {
      sheets.forEach(function (item) {
        if (item !== sheet && item.classList.contains('is-open')) setOpen(item, false);
      });
    }
    sheet.classList.toggle('is-open', open);
    sheet.setAttribute('aria-hidden', String(!open));
    if (open) {
      active = sheet;
      document.documentElement.style.overflow = 'hidden';
      var closer = sheet.querySelector('[data-sheet-close]');
      if (closer) closer.focus({ preventScroll: true });
    } else {
      if (active === sheet) active = null;
      if (!document.querySelector('.m-sheet.is-open')) {
        document.documentElement.style.overflow = '';
      }
    }
  }

  document.addEventListener('click', function (event) {
    var opener = event.target.closest && event.target.closest('[data-sheet-open]');
    if (opener) {
      event.preventDefault();
      setOpen(document.getElementById(opener.getAttribute('data-sheet-open')), true);
      return;
    }

    var closer = event.target.closest && event.target.closest('[data-sheet-close]');
    if (closer) {
      event.preventDefault();
      setOpen(closer.closest('.m-sheet'), false);
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && active) setOpen(active, false);
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
    }, { rootMargin: '240px 0px' });
    io.observe(wrap);
  } else {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      load();
    });
  }
})();

(function () {
  var header = document.querySelector('.m-header');
  if (!header) return;

  function sync() {
    header.classList.toggle('is-scrolled', window.scrollY > 6);
  }

  window.addEventListener('scroll', sync, { passive: true });
  sync();
})();
