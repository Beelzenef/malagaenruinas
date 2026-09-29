(function () {
  'use strict';

  const REGISTRY = 'data/sections.json';
  const dateFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const shortDateFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // Rejects javascript:, data: and any other non-http(s) scheme coming from data files.
  function safeUrl(value) {
    if (typeof value !== 'string' || value.trim() === '') return null;
    try {
      const url = new URL(value, window.location.href);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch (e) {
      return null;
    }
  }

  function parseDate(value) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  function byDateDesc(a, b) {
    return (parseDate(b.date) || 0) - (parseDate(a.date) || 0);
  }

  async function fetchJson(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(path + ': ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error(path + ': formato inválido');
    return data;
  }

  function sourceLink(name, href) {
    const url = safeUrl(href);
    const label = name || 'Fuente';
    if (!url) return document.createTextNode(label);
    const a = el('a', null, label);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  function renderCard(item) {
    const li = el('li', 'card');
    const date = parseDate(item.date);
    if (date) {
      const time = el('time', 'card-date', dateFmt.format(date));
      time.dateTime = item.date;
      li.appendChild(time);
    }
    li.appendChild(el('h3', 'card-location', item.location || 'Ubicación no especificada'));
    li.appendChild(el('p', 'card-description', item.description || ''));
    const source = el('p', 'card-source', 'Fuente: ');
    source.appendChild(sourceLink(item.source_name, item.source_link));
    li.appendChild(source);
    return li;
  }

  function renderMosaic(images) {
    const list = el('ul', 'mosaic');
    images.forEach(function (img) {
      const src = safeUrl(img.src);
      if (!src) return;
      const li = el('li');
      const figure = el('figure');
      const image = el('img');
      image.src = src;
      image.alt = img.alt || '';
      image.loading = 'lazy';
      image.decoding = 'async';
      figure.appendChild(image);

      if (img.caption || img.source_name) {
        const caption = el('figcaption');
        if (img.caption) caption.appendChild(document.createTextNode(img.caption));
        if (img.source_name) {
          if (img.caption) caption.appendChild(document.createTextNode(' — '));
          caption.appendChild(sourceLink(img.source_name, img.source_link));
        }
        figure.appendChild(caption);
      }
      li.appendChild(figure);
      list.appendChild(li);
    });
    return list.children.length ? list : null;
  }

  function renderSection(section, itemsResult, imagesResult) {
    const wrap = el('section', 'section');
    wrap.id = section.id;
    wrap.setAttribute('aria-labelledby', section.id + '-title');

    const header = el('div', 'section-header');
    const h2 = el('h2', null, section.title);
    h2.id = section.id + '-title';
    header.appendChild(h2);

    const items = itemsResult.status === 'fulfilled' ? itemsResult.value.slice().sort(byDateDesc) : null;
    if (items) {
      header.appendChild(el('span', 'section-count', items.length + (items.length === 1 ? ' registro' : ' registros') + (section.year ? ' en ' + section.year : '')));
    }
    if (section.description) header.appendChild(el('p', null, section.description));
    wrap.appendChild(header);

    if (imagesResult && imagesResult.status === 'fulfilled' && imagesResult.value.length) {
      const mosaic = renderMosaic(imagesResult.value);
      if (mosaic) wrap.appendChild(mosaic);
    }

    if (!items) {
      wrap.appendChild(el('p', 'notice error', 'No se pudieron cargar los datos.'));
    } else if (!items.length) {
      wrap.appendChild(el('p', 'notice', 'Sin datos todavía.'));
    } else {
      const list = el('ul', 'cards');
      items.forEach(function (item) { list.appendChild(renderCard(item)); });
      wrap.appendChild(list);
    }
    return { node: wrap, items: items };
  }

  function renderStat(section, items) {
    const a = el('a', 'stat');
    a.href = '#' + section.id;
    a.appendChild(el('span', 'stat-value', items ? String(items.length) : '–'));
    a.appendChild(el('span', 'stat-label', section.title));
    let meta = 'Sin registros';
    if (!items) meta = 'Error al cargar';
    else if (items.length) {
      const last = parseDate(items[0].date);
      meta = last ? 'Último: ' + shortDateFmt.format(last) : '';
    }
    a.appendChild(el('span', 'stat-meta', meta));
    return a;
  }

  function renderNav(sections) {
    const nav = document.getElementById('nav-list');
    sections.forEach(function (s) {
      const li = el('li');
      const a = el('a', null, s.title);
      a.href = '#' + s.id;
      li.appendChild(a);
      nav.appendChild(li);
    });
  }

  async function init() {
    const container = document.getElementById('sections');
    const summary = document.getElementById('summary');

    let sections;
    try {
      sections = await fetchJson(REGISTRY);
    } catch (e) {
      container.appendChild(el('p', 'notice error', 'No se pudo cargar la configuración del sitio.'));
      return;
    }

    renderNav(sections);

    const results = await Promise.all(sections.map(function (s) {
      return Promise.allSettled([
        fetchJson(s.file),
        s.images ? fetchJson(s.images) : Promise.resolve([])
      ]);
    }));

    sections.forEach(function (section, i) {
      const rendered = renderSection(section, results[i][0], results[i][1]);
      container.appendChild(rendered.node);
      summary.appendChild(renderStat(section, rendered.items));
    });
  }

  function initTheme() {
    const btn = document.getElementById('theme-toggle');
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    function current() {
      return root.dataset.theme || (media.matches ? 'dark' : 'light');
    }
    function update() {
      const isDark = current() === 'dark';
      btn.textContent = isDark ? 'Claro' : 'Oscuro';
      btn.setAttribute('aria-label', isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
    }

    btn.addEventListener('click', function () {
      const next = current() === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch (e) {}
      update();
    });
    media.addEventListener('change', update);
    update();
  }

  function initBanner() {
    const banner = document.getElementById('wip-banner');
    try {
      if (localStorage.getItem('wip-dismissed') === '1') banner.hidden = true;
    } catch (e) {}
    document.getElementById('wip-close').addEventListener('click', function () {
      banner.hidden = true;
      try { localStorage.setItem('wip-dismissed', '1'); } catch (e) {}
    });
  }

  initTheme();
  initBanner();
  init();
})();
