(function () {
  const root = document.documentElement;
  const THEME_KEY = 'photo-portfolio-theme';

  function applyTheme(theme) {
    if (theme === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved || (prefersDark ? 'dark' : 'light'));

    document.getElementById('theme-toggle').addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem(THEME_KEY, next);
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

  function initGearModal(gearUrl) {
    const modal = document.getElementById('gear-modal');
    const content = document.getElementById('gear-content');
    let loaded = false;

    async function open() {
      modal.hidden = false;
      if (loaded) return;
      const text = await (async () => {
        try {
          const res = await fetch(gearUrl || 'gear.md', { cache: 'no-store' });
          return res.ok ? await res.text() : null;
        } catch (e) {
          return null;
        }
      })();
      content.innerHTML = text ? renderMarkdown(text) : '<p>Could not load gear.md.</p>';
      loaded = true;
    }

    function close() {
      modal.hidden = true;
    }

    document.getElementById('gear-toggle').addEventListener('click', open);
    document.getElementById('gear-close').addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) close();
    });
  }

  function renderHero(config) {
    const name = config.photographerName || 'Your Name Here';
    document.title = `${name} — Photography`;
    document.getElementById('photographer-name').textContent = name;

    const taglineEl = document.getElementById('tagline');
    taglineEl.textContent = config.tagline || '';
    taglineEl.hidden = !config.tagline;

    root.style.setProperty('--accent', config.accentColor || 'oklch(0.58 0.13 35)');

    const footer = document.getElementById('site-footer');
    footer.textContent = config.footer || '';
    footer.hidden = !config.footer;

    // The header buttons the photographer chose: a short name (an emoji or up to 4 letters) on the button, the full name for screen readers and as a tooltip.
    const row = document.getElementById('social-row');
    row.innerHTML = '';
    (config.buttons || []).forEach((btn) => {
      if (!btn || !btn.url) return;
      const a = document.createElement('a');
      a.href = btn.url;
      if (!/^mailto:/i.test(btn.url)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      a.className = 'social-link';
      a.setAttribute('aria-label', btn.name || btn.short);
      a.title = btn.name || '';
      a.textContent = btn.short;
      row.appendChild(a);
    });
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
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'photo-item';
        item.title = 'View full-size photo';

        const img = document.createElement('img');
        img.src = entry.file;
        img.loading = 'lazy';
        img.alt = entry.alt || '';
        if (entry.width && entry.height) {
          img.width = entry.width;
          img.height = entry.height;
        }
        item.appendChild(img);
        item.addEventListener('click', () => openLightbox(entry));
        gallery.appendChild(item);
      });
      return;
    }

    hint.hidden = false;
    const heights = [360, 260, 420, 300, 340, 460, 280, 400, 320, 380, 300, 440];
    heights.forEach((h, i) => {
      const item = document.createElement('div');
      item.className = 'placeholder-item';
      item.style.height = `${h}px`;
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
    initGearModal(config.gearUrl);
    renderHero(config);
    renderGallery(await loadJSON('images/manifest.json'), openLightbox);
  }

  init();
})();
