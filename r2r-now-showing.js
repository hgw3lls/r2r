(function () {
  const config = window.R2R_PATCH_CONFIG || {};
  if (config.enableNowShowing === false) {
    return;
  }

  const DEFAULT_SOURCE = 'https://raw.githubusercontent.com/hgw3lls/1945-cle/main/nowshowing.json';
  const SOURCE_URL = typeof config.nowShowingSource === 'string' && config.nowShowingSource.trim()
    ? config.nowShowingSource.trim()
    : DEFAULT_SOURCE;
  const INLINE_DATA = config.nowShowingData;
  const ALIAS_OVERRIDES = (config.nowShowingAliases && typeof config.nowShowingAliases === 'object')
    ? config.nowShowingAliases
    : null;

  const STYLE_ID = 'r2r-now-showing-style';
  const OVERLAY_ID = 'r2r-now-showing-overlay';
  const FLOAT_SECTION_ID = 'r2r-now-showing-float';
  const POPUP_CLASS = 'r2r-now-showing-popup';
  const POPUP_SELECTOR = [
    '.mapboxgl-popup-content',
    '.maplibregl-popup-content',
    '.leaflet-popup-content',
    '.popup-content',
    '.rs-popup',
    '.map-popup',
    '#popup',
    '.popup'
  ].join(',');

  const state = {
    dataPromise: null,
    records: [],
    slugToRecord: new Map(),
    overlay: null,
    overlayFocusReturn: null,
    floatSection: null,
    floatWrapper: null,
    popupObserver: null,
    floatObserver: null
  };

  function slugify(value) {
    if (!value && value !== 0) { return ''; }
    return String(value)
      .toLowerCase()
      .replace(/&amp;/g, '&')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function cleanText(value) {
    if (!value && value !== 0) { return ''; }
    return String(value).replace(/\s+/g, ' ').trim();
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) { return; }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID} {
        position: fixed;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        padding: clamp(20px, 6vmin, 64px);
        z-index: 16000;
        color: #f8fafc;
      }
      #${OVERLAY_ID}.is-open {
        display: flex;
      }
      #${OVERLAY_ID} .r2r-ns-scrim {
        position: absolute;
        inset: 0;
        background: linear-gradient(160deg, rgba(8, 11, 22, 0.95), rgba(15, 23, 42, 0.92));
        backdrop-filter: blur(8px);
      }
      #${OVERLAY_ID} .r2r-ns-panel {
        position: relative;
        z-index: 1;
        width: min(720px, 100%);
        max-height: min(90vh, 720px);
        background: rgba(13, 20, 35, 0.96);
        border: 1px solid rgba(148, 163, 184, 0.35);
        border-radius: 24px;
        box-shadow: 0 40px 90px rgba(10, 15, 35, 0.55);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      #${OVERLAY_ID} .r2r-ns-panel:focus {
        outline: none;
        box-shadow: 0 0 0 3px rgba(244, 244, 245, 0.55), 0 40px 90px rgba(10, 15, 35, 0.55);
      }
      #${OVERLAY_ID} .r2r-ns-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: clamp(12px, 3vmin, 24px);
        padding: clamp(20px, 4vmin, 32px);
        border-bottom: 1px solid rgba(148, 163, 184, 0.25);
      }
      #${OVERLAY_ID} .r2r-ns-title {
        margin: 0;
        font-size: clamp(20px, 4.4vmin, 32px);
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      #${OVERLAY_ID} .r2r-ns-subtitle {
        margin: 4px 0 0;
        font-size: clamp(12px, 2.2vmin, 16px);
        opacity: 0.75;
      }
      #${OVERLAY_ID} .r2r-ns-close {
        border: 1px solid rgba(148, 163, 184, 0.45);
        border-radius: 999px;
        background: transparent;
        color: inherit;
        padding: 6px 14px;
        font-size: clamp(11px, 2vmin, 13px);
        letter-spacing: 0.12em;
        text-transform: uppercase;
        cursor: pointer;
        transition: background 0.2s ease, opacity 0.2s ease;
      }
      #${OVERLAY_ID} .r2r-ns-close:hover {
        background: rgba(148, 163, 184, 0.2);
      }
      #${OVERLAY_ID} .r2r-ns-body {
        padding: clamp(20px, 4vmin, 36px);
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: clamp(18px, 3.8vmin, 32px);
      }
      #${OVERLAY_ID} .r2r-ns-movie {
        display: flex;
        gap: clamp(16px, 3.5vmin, 28px);
        align-items: flex-start;
        padding: clamp(16px, 3.5vmin, 26px);
        border-radius: 20px;
        background: rgba(15, 23, 42, 0.55);
        border: 1px solid rgba(148, 163, 184, 0.25);
        box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.35);
      }
      #${OVERLAY_ID} .r2r-ns-poster {
        width: clamp(92px, 22vmin, 148px);
        border-radius: 14px;
        object-fit: cover;
        background: rgba(8, 11, 22, 0.55);
        box-shadow: 0 18px 44px rgba(0, 0, 0, 0.45);
        flex-shrink: 0;
      }
      #${OVERLAY_ID} .r2r-ns-poster[data-empty="true"] {
        display: none;
      }
      #${OVERLAY_ID} .r2r-ns-meta {
        display: flex;
        flex-direction: column;
        gap: clamp(10px, 2vmin, 14px);
        width: 100%;
      }
      #${OVERLAY_ID} .r2r-ns-meta h3 {
        margin: 0;
        font-size: clamp(18px, 3.6vmin, 26px);
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      #${OVERLAY_ID} .r2r-ns-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        font-size: clamp(11px, 1.9vmin, 13px);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        opacity: 0.82;
      }
      #${OVERLAY_ID} .r2r-ns-tags span {
        padding: 2px 10px;
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, 0.35);
        background: rgba(15, 23, 42, 0.6);
      }
      #${OVERLAY_ID} .r2r-ns-showtimes {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        font-size: clamp(11px, 2vmin, 13px);
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      #${OVERLAY_ID} .r2r-ns-showtimes span {
        padding: 4px 12px;
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, 0.25);
        background: rgba(148, 163, 184, 0.18);
      }
      #${OVERLAY_ID} .r2r-ns-synopsis {
        margin: 0;
        font-size: clamp(13px, 2.1vmin, 16px);
        line-height: 1.62;
        max-width: 60ch;
        opacity: 0.92;
      }
      #${OVERLAY_ID} .r2r-ns-empty {
        margin: 0;
        font-size: clamp(13px, 2vmin, 16px);
        opacity: 0.78;
      }
      .${POPUP_CLASS} {
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid rgba(148, 163, 184, 0.25);
        font-family: inherit;
      }
      .${POPUP_CLASS} h4 {
        margin: 0 0 6px;
        font-size: 0.82rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .${POPUP_CLASS} ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .${POPUP_CLASS} li {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 0.8rem;
        letter-spacing: 0.04em;
      }
      .${POPUP_CLASS} li span:last-child {
        opacity: 0.72;
      }
      .${POPUP_CLASS} button.r2r-ns-more {
        margin-top: 8px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: transparent;
        border: 1px solid currentColor;
        border-radius: 999px;
        padding: 4px 12px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 0.75rem;
        cursor: pointer;
        color: inherit;
      }
      .${POPUP_CLASS} button.r2r-ns-more:hover {
        background: rgba(148, 163, 184, 0.2);
      }
      .${POPUP_CLASS} button.r2r-ns-jump {
        background: none;
        border: none;
        color: inherit;
        font: inherit;
        padding: 0;
        text-align: left;
        cursor: pointer;
      }
      .${POPUP_CLASS} button.r2r-ns-jump:hover {
        text-decoration: underline;
      }
      .r2r-now-showing-floating-panel {
        position: fixed;
        right: clamp(16px, 3vw, 36px);
        bottom: clamp(16px, 4vmin, 40px);
        width: clamp(240px, 30vw, 340px);
        z-index: 14000;
        background: rgba(13, 20, 35, 0.94);
        border: 1px solid rgba(148, 163, 184, 0.25);
        border-radius: 22px;
        box-shadow: 0 24px 70px rgba(8, 15, 35, 0.55);
        backdrop-filter: blur(8px);
        color: #f8fafc;
        padding: 18px;
      }
      .r2r-now-showing-floating-panel.collapsed .r2r-now-showing-float-wrapper {
        display: none;
      }
      .r2r-now-showing-floating-panel .r2r-ns-float-toggle {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: none;
        border: none;
        color: inherit;
        font: inherit;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        cursor: pointer;
        margin-bottom: 12px;
      }
      .r2r-now-showing-floating-panel .r2r-ns-float-arrow {
        font-size: 0.75rem;
        letter-spacing: 0.06em;
      }
      #${FLOAT_SECTION_ID} {
        font-family: inherit;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      #${FLOAT_SECTION_ID} .r2r-ns-float-title {
        margin: 0;
        font-size: clamp(13px, 2.2vmin, 16px);
        letter-spacing: 0.12em;
        text-transform: uppercase;
        opacity: 0.85;
      }
      #${FLOAT_SECTION_ID} .r2r-now-showing-float-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      #${FLOAT_SECTION_ID} .r2r-now-showing-float-item {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 16px;
        background: rgba(15, 23, 42, 0.45);
        border: 1px solid rgba(148, 163, 184, 0.25);
      }
      #${FLOAT_SECTION_ID} .r2r-now-showing-float-item h4 {
        margin: 0;
        font-size: clamp(12px, 2vmin, 15px);
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      #${FLOAT_SECTION_ID} .r2r-now-showing-float-item ul {
        margin: 0;
        padding-left: 18px;
        display: grid;
        gap: 4px;
        font-size: clamp(11px, 1.9vmin, 13px);
      }
      #${FLOAT_SECTION_ID} .r2r-now-showing-float-item button {
        align-self: flex-start;
        border: 1px solid rgba(148, 163, 184, 0.4);
        border-radius: 999px;
        background: transparent;
        color: inherit;
        padding: 4px 12px;
        font-size: clamp(11px, 1.9vmin, 13px);
        letter-spacing: 0.12em;
        text-transform: uppercase;
        cursor: pointer;
      }
      #${FLOAT_SECTION_ID} .r2r-now-showing-float-item button:hover {
        background: rgba(148, 163, 184, 0.2);
      }
      body.r2r-now-showing-open {
        overflow: hidden;
      }
    `;
    document.head.appendChild(style);
  }

  function normaliseMovie(movie, index) {
    if (!movie || typeof movie !== 'object') { return null; }
    const title = cleanText(movie.title || movie.name || movie.film || ('Movie ' + (index + 1)));
    const poster = cleanText(movie.poster || movie.image || movie.art || movie.thumbnail || '');
    const runtime = cleanText(movie.runtime || movie.length || movie.duration || '');
    const rating = cleanText(movie.rating || movie.mpaa || movie.certificate || '');
    const release = cleanText(movie.release || movie.releaseDate || movie.year || '');
    const synopsis = cleanText(movie.synopsis || movie.description || movie.summary || '');

    let showtimes = [];
    if (Array.isArray(movie.showtimes)) {
      showtimes = movie.showtimes.map(cleanText).filter(Boolean);
    } else if (typeof movie.showtimes === 'string') {
      showtimes = movie.showtimes.split(/[,
\|\/]+/).map(cleanText).filter(Boolean);
    }

    let genres = [];
    if (Array.isArray(movie.genres)) {
      genres = movie.genres.map(cleanText).filter(Boolean);
    } else if (typeof movie.genre === 'string') {
      genres = movie.genre.split(/[,\|\/]+/).map(cleanText).filter(Boolean);
    }

    return {
      title,
      poster,
      runtime,
      rating,
      release,
      synopsis,
      showtimes,
      genres
    };
  }

  function extractMovieList(entry) {
    if (!entry || typeof entry !== 'object') { return []; }
    let rawList = [];
    if (Array.isArray(entry.nowShowing)) {
      rawList = entry.nowShowing;
    } else if (Array.isArray(entry.movies)) {
      rawList = entry.movies;
    } else if (Array.isArray(entry.films)) {
      rawList = entry.films;
    } else if (entry.nowShowing && typeof entry.nowShowing === 'object') {
      rawList = Object.values(entry.nowShowing);
    }
    return rawList
      .map(normaliseMovie)
      .filter(Boolean);
  }

  function normaliseTheatre(entry) {
    if (!entry || typeof entry !== 'object') { return null; }
    const name = cleanText(entry.name || entry.title || entry.label || entry.venue || entry.theatre || entry.theater || '');
    const slug = slugify(entry.slug || entry.id || name || entry.code || entry.key);
    if (!name || !slug) { return null; }
    const address = cleanText(entry.address || entry.location || entry.subtitle || entry.street || '');
    const movies = extractMovieList(entry);
    if (!movies.length) { return null; }
    const aliases = [];
    if (Array.isArray(entry.aliases)) {
      entry.aliases.forEach(alias => {
        const cleaned = cleanText(alias);
        if (cleaned) { aliases.push(cleaned); }
      });
    }
    if (Array.isArray(entry.altNames)) {
      entry.altNames.forEach(alias => {
        const cleaned = cleanText(alias);
        if (cleaned) { aliases.push(cleaned); }
      });
    }
    if (entry.nickname) {
      const nickname = cleanText(entry.nickname);
      if (nickname) { aliases.push(nickname); }
    }
    return {
      id: entry.id || slug,
      slug,
      name,
      address,
      movies,
      aliases,
      raw: entry
    };
  }

  function parseTheatrePayload(payload) {
    let entries = [];
    if (Array.isArray(payload)) {
      entries = payload;
    } else if (payload && typeof payload === 'object') {
      if (Array.isArray(payload.theatres)) {
        entries = payload.theatres;
      } else if (Array.isArray(payload.theaters)) {
        entries = payload.theaters;
      } else if (Array.isArray(payload.locations)) {
        entries = payload.locations;
      } else {
        Object.keys(payload).forEach(key => {
          const value = payload[key];
          if (Array.isArray(value)) {
            entries = entries.concat(value);
          }
        });
      }
    }
    const seen = new Map();
    const records = [];
    entries.forEach(entry => {
      const record = normaliseTheatre(entry);
      if (!record) { return; }
      const existing = seen.get(record.slug);
      if (existing) {
        const existingTitles = new Set(existing.movies.map(movie => movie.title));
        record.movies.forEach(movie => {
          if (!existingTitles.has(movie.title)) {
            existing.movies.push(movie);
          }
        });
        record.aliases.forEach(alias => {
          if (!existing.aliases.includes(alias)) {
            existing.aliases.push(alias);
          }
        });
      } else {
        seen.set(record.slug, record);
        records.push(record);
      }
    });
    return records;
  }

  function applyAliasOverrides(records) {
    if (!ALIAS_OVERRIDES) { return; }
    const lookup = new Map();
    records.forEach(record => {
      lookup.set(record.slug, record);
      lookup.set(slugify(record.name), record);
      if (record.id) { lookup.set(slugify(record.id), record); }
    });
    Object.keys(ALIAS_OVERRIDES).forEach(alias => {
      const target = ALIAS_OVERRIDES[alias];
      const aliasSlug = slugify(alias);
      const targetSlug = slugify(target);
      if (!aliasSlug || !targetSlug) { return; }
      const record = lookup.get(targetSlug);
      if (!record) { return; }
      if (!record.aliases.includes(alias)) {
        record.aliases.push(alias);
      }
      state.slugToRecord.set(aliasSlug, record);
    });
  }

  function rebuildLookup(records) {
    state.slugToRecord.clear();
    records.forEach(record => {
      state.slugToRecord.set(record.slug, record);
      state.slugToRecord.set(slugify(record.name), record);
      if (record.id) {
        state.slugToRecord.set(slugify(record.id), record);
      }
      record.aliases.forEach(alias => {
        const slug = slugify(alias);
        if (slug) {
          state.slugToRecord.set(slug, record);
        }
      });
    });
    applyAliasOverrides(records);
  }

  async function loadData() {
    if (state.dataPromise) {
      return state.dataPromise;
    }
    state.dataPromise = (async () => {
      try {
        let payload = INLINE_DATA;
        if (!payload) {
          const response = await fetch(SOURCE_URL, { cache: 'force-cache' });
          if (!response.ok) {
            throw new Error('Now showing fetch failed: ' + response.status);
          }
          payload = await response.json();
        }
        const records = parseTheatrePayload(payload);
        if (!records.length) {
          console.warn('[R2R] Now Showing payload did not contain theatres.');
        }
        rebuildLookup(records);
        state.records = records;
        return records;
      } catch (error) {
        console.warn('[R2R] Unable to load Now Showing data:', error);
        state.records = [];
        rebuildLookup([]);
        return [];
      }
    })();
    return state.dataPromise;
  }

  function ensureOverlay() {
    if (state.overlay && document.body.contains(state.overlay)) {
      return state.overlay;
    }
    ensureStyles();
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <div class="r2r-ns-scrim"></div>
      <div class="r2r-ns-panel" tabindex="-1">
        <div class="r2r-ns-header">
          <div>
            <h2 class="r2r-ns-title">Now Showing</h2>
            <div class="r2r-ns-subtitle"></div>
          </div>
          <button type="button" class="r2r-ns-close">Close</button>
        </div>
        <div class="r2r-ns-body"></div>
      </div>
    `;
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.classList.contains('r2r-ns-scrim')) {
        closeOverlay();
      }
    });
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeOverlay();
      }
    });
    const closeButton = overlay.querySelector('.r2r-ns-close');
    closeButton.addEventListener('click', () => closeOverlay());
    document.body.appendChild(overlay);
    state.overlay = overlay;
    return overlay;
  }

  function closeOverlay() {
    if (!state.overlay) { return; }
    state.overlay.classList.remove('is-open');
    state.overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('r2r-now-showing-open');
    if (state.overlayFocusReturn && typeof state.overlayFocusReturn.focus === 'function') {
      try { state.overlayFocusReturn.focus(); } catch (_) {}
    }
    state.overlayFocusReturn = null;
  }

  function formatMeta(movie) {
    const parts = [];
    if (movie.rating) { parts.push(movie.rating); }
    if (movie.runtime) { parts.push(movie.runtime); }
    if (movie.release) { parts.push(movie.release); }
    return parts.join(' • ');
  }

  function renderOverlay(record) {
    const overlay = ensureOverlay();
    const title = overlay.querySelector('.r2r-ns-title');
    const subtitle = overlay.querySelector('.r2r-ns-subtitle');
    const body = overlay.querySelector('.r2r-ns-body');
    title.textContent = record ? record.name : 'Now Showing';
    subtitle.textContent = record && record.address ? record.address : '';
    body.innerHTML = '';
    if (!record || !record.movies.length) {
      const empty = document.createElement('p');
      empty.className = 'r2r-ns-empty';
      empty.textContent = 'Movie information is not available for this theatre yet.';
      body.appendChild(empty);
      return;
    }
    record.movies.forEach((movie, index) => {
      const item = document.createElement('article');
      item.className = 'r2r-ns-movie';
      const poster = document.createElement('img');
      poster.className = 'r2r-ns-poster';
      if (movie.poster) {
        poster.src = movie.poster;
        poster.alt = movie.title + ' poster';
        poster.removeAttribute('data-empty');
      } else {
        poster.setAttribute('data-empty', 'true');
        poster.alt = '';
      }
      const meta = document.createElement('div');
      meta.className = 'r2r-ns-meta';
      const heading = document.createElement('h3');
      heading.textContent = movie.title;
      heading.id = `${record.slug}-movie-${index}`;
      meta.appendChild(heading);
      const tags = document.createElement('div');
      tags.className = 'r2r-ns-tags';
      const metaLine = formatMeta(movie);
      if (metaLine) {
        const metaSpan = document.createElement('span');
        metaSpan.textContent = metaLine;
        tags.appendChild(metaSpan);
      }
      if (movie.genres && movie.genres.length) {
        movie.genres.forEach(genre => {
          const span = document.createElement('span');
          span.textContent = genre;
          tags.appendChild(span);
        });
      }
      if (tags.children.length) {
        meta.appendChild(tags);
      }
      if (movie.showtimes && movie.showtimes.length) {
        const showtimes = document.createElement('div');
        showtimes.className = 'r2r-ns-showtimes';
        movie.showtimes.forEach(time => {
          const span = document.createElement('span');
          span.textContent = time;
          showtimes.appendChild(span);
        });
        meta.appendChild(showtimes);
      }
      if (movie.synopsis) {
        const synopsis = document.createElement('p');
        synopsis.className = 'r2r-ns-synopsis';
        synopsis.textContent = movie.synopsis;
        meta.appendChild(synopsis);
      }
      item.appendChild(poster);
      item.appendChild(meta);
      body.appendChild(item);
    });
  }

  function openOverlay(record) {
    if (!record) { return; }
    ensureStyles();
    const overlay = ensureOverlay();
    renderOverlay(record);
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('r2r-now-showing-open');
    state.overlayFocusReturn = document.activeElement;
    const panel = overlay.querySelector('.r2r-ns-panel');
    if (panel && typeof panel.focus === 'function') {
      setTimeout(() => {
        try { panel.focus(); } catch (_) {}
      }, 0);
    }
  }

  function ensureFloatSection() {
    ensureStyles();
    if (!state.floatSection) {
      const section = document.createElement('section');
      section.id = FLOAT_SECTION_ID;
      section.className = 'r2r-now-showing-float-section';
      const heading = document.createElement('h3');
      heading.className = 'r2r-ns-float-title';
      heading.textContent = 'Now Showing';
      const list = document.createElement('div');
      list.className = 'r2r-now-showing-float-list';
      section.appendChild(heading);
      section.appendChild(list);
      state.floatSection = section;
    }
    const host = document.querySelector('.rs-float');
    if (host && host !== state.floatSection.parentElement) {
      host.appendChild(state.floatSection);
      if (state.floatWrapper && state.floatWrapper.parentElement) {
        state.floatWrapper.parentElement.removeChild(state.floatWrapper);
        state.floatWrapper = null;
      }
    }
    if (!host && (!state.floatSection.parentElement || !state.floatSection.parentElement.classList || !state.floatSection.parentElement.classList.contains('r2r-now-showing-float-wrapper'))) {
      ensureFloatWrapper();
    }
    return state.floatSection;
  }

  function ensureFloatWrapper() {
    if (state.floatWrapper && document.body.contains(state.floatWrapper)) {
      return state.floatWrapper;
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'r2r-now-showing-floating-panel';
    wrapper.innerHTML = `
      <button class="r2r-ns-float-toggle" type="button" aria-expanded="true">
        <span>Now Showing</span>
        <span class="r2r-ns-float-arrow">▼</span>
      </button>
      <div class="r2r-now-showing-float-wrapper"></div>
    `;
    const toggle = wrapper.querySelector('.r2r-ns-float-toggle');
    const arrow = wrapper.querySelector('.r2r-ns-float-arrow');
    toggle.addEventListener('click', () => {
      const collapsed = wrapper.classList.toggle('collapsed');
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      arrow.textContent = collapsed ? '▲' : '▼';
    });
    document.body.appendChild(wrapper);
    const container = wrapper.querySelector('.r2r-now-showing-float-wrapper');
    container.appendChild(state.floatSection);
    state.floatWrapper = wrapper;
    return wrapper;
  }

  function renderFloatList(records) {
    const section = ensureFloatSection();
    if (!section) { return; }
    const list = section.querySelector('.r2r-now-showing-float-list');
    if (!list) { return; }
    list.innerHTML = '';
    records.forEach(record => {
      const item = document.createElement('div');
      item.className = 'r2r-now-showing-float-item';
      const heading = document.createElement('h4');
      heading.textContent = record.name;
      item.appendChild(heading);
      const movies = document.createElement('ul');
      record.movies.forEach(movie => {
        const li = document.createElement('li');
        li.textContent = movie.title;
        movies.appendChild(li);
      });
      item.appendChild(movies);
      const action = document.createElement('button');
      action.type = 'button';
      action.textContent = 'More details';
      action.addEventListener('click', () => openOverlay(record));
      item.appendChild(action);
      list.appendChild(item);
    });
  }

  function findRecordBySlug(value) {
    const slug = slugify(value);
    if (!slug) { return null; }
    return state.slugToRecord.get(slug) || null;
  }

  function findRecordByName(value) {
    const slug = slugify(value);
    if (!slug) { return null; }
    const direct = state.slugToRecord.get(slug);
    if (direct) { return direct; }
    for (let i = 0; i < state.records.length; i++) {
      const record = state.records[i];
      if (slugify(record.name).includes(slug) || slug.includes(slugify(record.name))) {
        return record;
      }
      for (let j = 0; j < record.aliases.length; j++) {
        const aliasSlug = slugify(record.aliases[j]);
        if (aliasSlug && (aliasSlug === slug || slug.includes(aliasSlug) || aliasSlug.includes(slug))) {
          return record;
        }
      }
    }
    return null;
  }

  function collectNameCandidates(node) {
    const names = [];
    if (!node || node.nodeType !== 1) { return names; }
    const selectors = [
      '[data-theatre-name]',
      '[data-theater-name]',
      '[data-venue-name]',
      '.theatre-name',
      '.theater-name',
      '.venue-name',
      '.popup-title',
      '.title',
      '.name',
      'h1',
      'h2',
      'h3',
      'h4',
      'strong'
    ];
    selectors.forEach(sel => {
      const el = node.querySelector(sel);
      if (el && el.textContent) {
        const text = cleanText(el.textContent);
        if (text) { names.push(text); }
      }
    });
    if (!names.length && node.textContent) {
      const condensed = cleanText(node.textContent);
      if (condensed) {
        names.push(condensed);
      }
    }
    return names;
  }

  function resolveRecordFromNode(node) {
    if (!node || node.nodeType !== 1) { return null; }
    let current = node;
    while (current && current.nodeType === 1 && current !== document.body) {
      const dataset = current.dataset || {};
      const keys = ['theatreId', 'theaterId', 'theatre', 'theater', 'locationId', 'location', 'venue', 'slug', 'id'];
      for (let i = 0; i < keys.length; i++) {
        const value = dataset[keys[i]];
        if (!value) { continue; }
        const record = findRecordBySlug(value);
        if (record) { return record; }
      }
      current = current.parentElement;
    }
    const names = collectNameCandidates(node);
    for (let i = 0; i < names.length; i++) {
      const record = findRecordByName(names[i]);
      if (record) { return record; }
    }
    return null;
  }

  function buildPopupBlock(container, record) {
    if (!container) { return; }
    let block = container.querySelector('.' + POPUP_CLASS);
    if (!block) {
      block = document.createElement('div');
      block.className = POPUP_CLASS;
      container.appendChild(block);
    }
    block.innerHTML = '';
    const heading = document.createElement('h4');
    heading.textContent = 'Now Showing';
    block.appendChild(heading);
    const list = document.createElement('ul');
    record.movies.forEach(movie => {
      const li = document.createElement('li');
      const title = document.createElement('span');
      title.textContent = movie.title;
      li.appendChild(title);
      const meta = document.createElement('span');
      meta.textContent = formatMeta(movie);
      li.appendChild(meta);
      list.appendChild(li);
    });
    block.appendChild(list);
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'r2r-ns-more';
    more.textContent = 'More details';
    more.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openOverlay(record);
    });
    block.appendChild(more);
  }

  function isPopupNode(node) {
    if (!node || node.nodeType !== 1) { return false; }
    if (typeof node.matches === 'function' && node.matches(POPUP_SELECTOR)) { return true; }
    const className = typeof node.className === 'string' ? node.className : '';
    const id = typeof node.id === 'string' ? node.id : '';
    return /popup/i.test(className) || /popup/i.test(id);
  }

  function findPopupContainer(node) {
    if (!node || node.nodeType !== 1) { return null; }
    if (typeof node.matches === 'function' && node.matches(POPUP_SELECTOR)) {
      return node;
    }
    return node.querySelector(POPUP_SELECTOR) || node;
  }

  function tryEnhancePopup(node) {
    if (!node || node.__r2rNowShowingBound) { return; }
    node.__r2rNowShowingBound = true;
    loadData().then(() => {
      if (!state.records.length) { return; }
      const container = findPopupContainer(node);
      const record = resolveRecordFromNode(container);
      if (!record) {
        node.__r2rNowShowingBound = false;
        return;
      }
      buildPopupBlock(container, record);
    });
  }

  function primePopupObserver() {
    if (state.popupObserver) { return; }
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) { return; }
          if (isPopupNode(node)) {
            tryEnhancePopup(node);
          }
          const nested = node.querySelectorAll ? node.querySelectorAll(POPUP_SELECTOR) : [];
          nested.forEach(child => tryEnhancePopup(child));
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    state.popupObserver = observer;
    document.querySelectorAll(POPUP_SELECTOR).forEach(node => tryEnhancePopup(node));
  }

  function primeFloatObserver() {
    if (state.floatObserver) { return; }
    const observer = new MutationObserver(() => {
      ensureFloatSection();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    state.floatObserver = observer;
  }

  function init() {
    ensureStyles();
    loadData().then(records => {
      if (records.length) {
        renderFloatList(records);
      }
      primePopupObserver();
      primeFloatObserver();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.R2R_NOW_SHOWING = {
    open: (slugOrRecord) => {
      if (!slugOrRecord) { return; }
      if (typeof slugOrRecord === 'object' && slugOrRecord.movies) {
        openOverlay(slugOrRecord);
        return;
      }
      loadData().then(() => {
        const record = findRecordBySlug(slugOrRecord) || findRecordByName(slugOrRecord);
        if (record) {
          openOverlay(record);
        }
      });
    },
    data: () => state.records.slice(),
    refresh: () => {
      state.dataPromise = null;
      return loadData().then(records => {
        renderFloatList(records);
        document.querySelectorAll(POPUP_SELECTOR).forEach(node => {
          node.__r2rNowShowingBound = false;
          tryEnhancePopup(node);
        });
        return records;
      });
    }
  };
})();
