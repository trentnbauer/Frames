(function () {
  const root = document.documentElement;
  const THEME_KEY = 'photo-portfolio-theme';

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    const label = document.getElementById('theme-label');
    const icon = document.getElementById('theme-icon');
    if (label) label.textContent = theme === 'dark' ? 'Light' : 'Dark';
    if (icon) icon.textContent = theme === 'dark' ? '\u2600' : '\u263E';
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) { /* storage blocked */ }
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    applyTheme(saved || (prefersLight ? 'light' : 'dark'));
    document.getElementById('theme-toggle').addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* not remembered */ }
    });
  }

  async function loadJSON(url) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderInline(text) {
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  function renderMarkdown(md) {
    let html = '';
    let inList = false;
    md.split('\n').forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) {
        if (inList) { html += '</ul>'; inList = false; }
        return;
      }
      const heading = line.match(/^(#{1,3})\s+(.*)/);
      if (heading) {
        if (inList) { html += '</ul>'; inList = false; }
        html += `<h${heading[1].length}>${renderInline(heading[2])}</h${heading[1].length}>`;
        return;
      }
      const listItem = line.match(/^[-*]\s+(.*)/);
      if (listItem) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += `<li>${renderInline(listItem[1])}</li>`;
        return;
      }
      if (inList) { html += '</ul>'; inList = false; }
      html += `<p>${renderInline(line)}</p>`;
    });
    if (inList) html += '</ul>';
    return html;
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  async function renderGear(gearUrl) {
    const content = document.getElementById('gear-content');
    const data = await loadJSON('gear.json');
    if (data && !data.empty) {
      let html = data.intro ? '<p class="gear-intro">' + esc(data.intro) + '</p>' : '';
      if (data.showWant) {
        html += '<div class="gear-block"><div class="gear-head"><h2>Want to buy</h2><span>' + data.want.length + ' ' + (data.want.length === 1 ? 'item' : 'items') + '</span></div><div class="gear-list">' +
          data.want.map((w) => {
            const inner = '<span class="n">' + w.n + '</span><span>' + esc(w.name) + (w.url ? ' \u2197' : '') + '</span><span class="price">' + (w.price ? '$' + esc(w.price) : '') + '</span>';
            return w.url ? '<a class="gear-row want" href="' + esc(w.url) + '" target="_blank" rel="noopener noreferrer">' + inner + '</a>' : '<div class="gear-row want">' + inner + '</div>';
          }).join('') + '</div></div>';
      }
      html += data.groups.map((g) => '<div class="gear-block"><div class="gear-head"><h2>' + esc(g.title) + '</h2><span>' + g.count + '</span></div><div class="gear-list">' +
        g.items.map((it) => '<div class="gear-row"><div><span>' + esc(it.name) + '</span>' + (it.note ? '<span class="note">' + esc(it.note) + '</span>' : '') + '</div><span class="tag">' + esc(it.tag) + '</span></div>').join('') + '</div></div>').join('');
      content.innerHTML = html;
      return;
    }
    const res = await fetch(gearUrl || 'gear.md', { cache: 'no-store' }).catch(() => null);
    const text = res && res.ok ? await res.text() : null;
    content.innerHTML = text ? renderMarkdown(text) : '<p>Nothing listed yet.</p>';
  }

  /** The site's pages: Photographs, Gear (when there is any), then the photographer's own links. */
  function initNav(config, hasGear) {
    const nav = document.getElementById('site-nav');
    const work = document.getElementById('work');
    const gear = document.getElementById('gear');
    nav.innerHTML = '';
    const show = (which) => {
      work.hidden = which !== 'work';
      gear.hidden = which !== 'gear';
      nav.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', b.dataset.page === which ? 'page' : 'false'));
    };
    const tab = (label, page) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.page = page; b.textContent = label; b.addEventListener('click', () => show(page)); nav.appendChild(b); };
    tab('Index', 'work');
    if (hasGear) tab('Gear', 'gear');
    (config.buttons || []).forEach((btn) => {
      if (!btn || !btn.url) return;
      const a = document.createElement('a');
      a.href = btn.url;
      if (!/^mailto:/i.test(btn.url)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      a.setAttribute('aria-label', btn.name || btn.short);
      a.title = btn.name || '';
      a.textContent = (btn.name || btn.short) + ' \u2197';
      nav.appendChild(a);
    });
    show('work');
  }

  function renderHero(config) {
    const name = config.photographerName || 'Your Name Here';
    document.title = `${name} — Photography`;
    const nameEl = document.getElementById('photographer-name');
    const parts = name.trim().split(/\s+/);
    nameEl.textContent = '';
    nameEl.appendChild(document.createTextNode(parts[0]));
    if (parts.length > 1) { nameEl.appendChild(document.createElement('br')); nameEl.appendChild(document.createTextNode(parts.slice(1).join(' '))); }
    // The photographer's profile picture, if they set one, shown beside the name.
    const avatar = document.getElementById('photographer-avatar');
    if (config.avatar) { avatar.src = config.avatar; avatar.hidden = false; } else avatar.hidden = true;

    const taglineEl = document.getElementById('tagline');
    taglineEl.textContent = config.tagline || '';
    taglineEl.hidden = !config.tagline;

    root.style.setProperty('--accent', config.accentColor || 'oklch(0.58 0.13 35)');

    const footer = document.getElementById('site-footer');
    footer.textContent = config.footer || '';
    footer.hidden = !config.footer;

    const country = document.getElementById('country');
    document.getElementById('country-name').textContent = config.country || '';
    country.hidden = !config.country;
  }

  function resetViewportZoom() {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) return;
    const original = viewport.getAttribute('content');
    viewport.setAttribute('content', `${original}, maximum-scale=1.0`);
    setTimeout(() => viewport.setAttribute('content', original), 350);
  }

  function initLightbox() {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const spinner = document.getElementById('lightbox-spinner');
    const caption = document.getElementById('lightbox-caption');
    let loadToken = 0;
    let historyPushed = false;

    function open(entry) {
      const token = ++loadToken;
      const src = entry.original || entry.file;
      lightboxImg.alt = entry.alt || '';
      lightbox.hidden = false;

      if (!historyPushed) {
        history.pushState({ lightboxOpen: true }, '');
        historyPushed = true;
      }

      if (entry.file) {
        lightboxImg.src = entry.file;
        lightboxImg.classList.add('is-loading');
        spinner.hidden = false;
      }

      const captionText = [entry.camera, entry.film].filter(Boolean).join(' · ');
      caption.textContent = captionText;
      caption.hidden = !captionText;

      const full = new Image();
      full.onload = () => {
        if (token !== loadToken) return;
        lightboxImg.src = src;
        lightboxImg.classList.remove('is-loading');
        spinner.hidden = true;
      };
      full.src = src;
    }

    function close({ fromPopstate } = {}) {
      if (lightbox.hidden) return;
      loadToken++;
      lightbox.hidden = true;
      lightboxImg.src = '';
      lightboxImg.classList.remove('is-loading');
      spinner.hidden = true;
      resetViewportZoom();

      if (historyPushed) {
        historyPushed = false;
        // Closed via button/backdrop/Escape rather than the Back button itself —
        // pop the state we pushed on open so a later Back press doesn't land on it.
        if (!fromPopstate) history.back();
      }
    }

    document.getElementById('lightbox-close').addEventListener('click', () => close());
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !lightbox.hidden) close();
    });
    window.addEventListener('popstate', () => close({ fromPopstate: true }));

    return open;
  }

  function renderGallery(manifest, openLightbox) {
    const gallery = document.getElementById('gallery');
    const hint = document.getElementById('empty-hint');
    gallery.innerHTML = '';

    if (manifest && manifest.length) {
      hint.hidden = true;
      manifest.forEach((entry) => {
        const ar = entry.width && entry.height ? entry.width / entry.height : 1.5;
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'photo-item';
        item.title = 'View full-size photo';
        item.style.flex = `${Math.round(ar * 100)} 1 ${Math.round(ar * 220)}px`;
        item.style.aspectRatio = String(ar);

        const img = document.createElement('img');
        img.src = entry.file;
        img.loading = 'lazy';
        img.alt = entry.alt || '';
        item.appendChild(img);
        item.addEventListener('click', () => openLightbox(entry));
        gallery.appendChild(item);
      });
      gallery.appendChild(document.createElement('i')); // keeps a short last row from stretching across the page
      return;
    }

    hint.hidden = false;
    const heights = [360, 260, 420, 300, 340, 460, 280, 400, 320, 380, 300, 440];
    heights.forEach((h, i) => {
      const item = document.createElement('div');
      item.className = 'placeholder-item';
      const par = [1.5, 1.33, 0.67, 1.5, 1, 1.5][i % 6];
      item.style.flex = `${par * 100} 1 ${par * 220}px`;
      item.style.aspectRatio = String(par);
      const label = document.createElement('div');
      label.className = 'placeholder-label';
      label.textContent = `image ${String(i + 1).padStart(2, '0')}`;
      item.appendChild(label);
      gallery.appendChild(item);
    });
  }

  async function init() {
    initTheme();
    const openLightbox = initLightbox();
    const config = (await loadJSON('config.json')) || {};
    renderHero(config);
    const gearData = await loadJSON('gear.json');
    const hasGear = !!config.gearUrl || !!(gearData && !gearData.empty);
    initNav(config, hasGear);
    if (hasGear) renderGear(config.gearUrl);
    renderGallery(await loadJSON('images/manifest.json'), openLightbox);
  }

  init();
})();
