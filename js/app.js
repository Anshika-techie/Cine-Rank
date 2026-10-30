/* CineRank – UI controller. Algorithms live in algorithms.js, CSV parsing in csv.js */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = n => Number(n).toLocaleString('en-US');
  const PAGE = 24;
  const VOTE_STEPS = [0, 1000, 5000, 10000, 25000, 50000, 100000];
  const fmtVotes = v => (v >= 1000 ? (v / 1000) + 'K' : String(v));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('cinerank:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('cinerank:' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };

  /* ---------------- state ---------------- */
  let movies = [], index = null, rankByRating = null;
  let bounds = { yMin: 1900, yMax: 2025 };
  let current = [];          // indices of movies matching the current filters, in display order
  let rendered = 0;
  let favKeys = new Set(store.get('fav', []));
  let favIds = new Set();
  let datasetLabel = '';

  const state = {};
  function defaults() {
    return {
      query: '', genres: new Set(), genreMode: 'any',
      yearMin: bounds.yMin, yearMax: bounds.yMax, minRating: 0, votesIdx: 0,
      platform: '', language: '', favoritesOnly: false, sortKey: 'rating', dir: 'desc'
    };
  }
  function resetState() { Object.assign(state, defaults()); }

  /* ---------------- dataset ---------------- */
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function initials(title) {
    const words = title.replace(/['’]s\b/g, '').split(/[\s\-–:]+/).filter(w => w && !/^(the|a|an|of|and|in)$/i.test(w));
    const pick = (words.length ? words : [title]).slice(0, 2).map(w => Array.from(w)[0] || '');
    return pick.join('').toUpperCase();
  }
  function hues(m) { const h = hash(m.title); return [h % 360, (h % 360 + 40 + ((h >>> 9) % 90)) % 360]; }
  const runtimeText = r => (r > 0 ? (r >= 60 ? Math.floor(r / 60) + 'h ' + (r % 60 ? (r % 60) + 'm' : '') : r + ' min') : '—');

  function loadDataset(rows, label) {
    movies = rows.map((r, i) => {
      const title = String(r[1]);
      const m = {
        id: i, title, titleLower: title.toLowerCase(), year: r[2] | 0, genres: String(r[3]).split('|').filter(Boolean),
        rating: +r[4], votes: +r[5] | 0, runtime: +r[6] | 0, language: r[7] || 'Unknown', platform: r[8] || 'Dataset', score: 0
      };
      m.key = m.titleLower + '|' + m.year;
      const hh = hues(m); m.h1 = hh[0]; m.h2 = hh[1]; m.ini = initials(title);
      return m;
    });
    // weighted rating (IMDb formula): m = 70th percentile of votes, C = mean rating
    const sortedVotes = Algo.mergeSort(movies.map(m => m.votes), (a, b) => a - b);
    const mVotes = Math.max(1, sortedVotes[Math.floor(sortedVotes.length * 0.7)] || 1);
    const C = movies.reduce((s, m) => s + m.rating, 0) / movies.length;
    movies.forEach(m => { m.score = Algo.weightedRating(m.rating, m.votes, mVotes, C); });

    index = Algo.buildIndex(movies);
    rankByRating = new Int32Array(movies.length);
    const ord = index.orders.rating; // ascending ("worst first")
    for (let p = 0; p < ord.length; p++) rankByRating[ord[p]] = ord.length - p;

    const years = movies.map(m => m.year);
    bounds = { yMin: Math.min.apply(null, years), yMax: Math.max.apply(null, years) };
    datasetLabel = label || '';
    rebuildFavIds();
    resetState();
    buildControls();
    animateStats();
    $('#heroCount').textContent = fmt(movies.length);
    $('#dataNote').innerHTML = label
      ? 'Showing <b>' + esc(label) + '</b> — ' + fmt(movies.length) + ' movies loaded from your CSV.'
      : 'Showing the bundled sample dataset. Use <b>Import CSV</b> to load the real Kaggle file.';
  }

  function rebuildFavIds() {
    favIds = new Set();
    movies.forEach(m => { if (favKeys.has(m.key)) favIds.add(m.id); });
    $('#favCount').textContent = favIds.size;
  }

  /* ---------------- controls ---------------- */
  function buildControls() {
    // genre chips
    $('#genreChips').innerHTML = index.genreList.map(g => '<button type="button" class="chip" data-genre="' + esc(g) + '" aria-pressed="false">' + esc(g) + '</button>').join('');
    // selects
    const opts = (sel, values) => {
      const el = $(sel); const first = el.firstElementChild.outerHTML;
      el.innerHTML = first + values.map(v => '<option>' + esc(v) + '</option>').join('');
    };
    const uniq = key => Array.from(new Set(movies.map(m => m[key]))).sort();
    opts('#platformSel', uniq('platform'));
    opts('#languageSel', uniq('language'));
    // year sliders
    ['#yearMin', '#yearMax'].forEach(s => { const el = $(s); el.min = bounds.yMin; el.max = bounds.yMax; });
    syncControls();
  }

  function syncControls() {
    $$('.chip').forEach(c => { const on = state.genres.has(c.dataset.genre); c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); });
    $$('#genreMode button').forEach(b => b.classList.toggle('on', b.dataset.mode === state.genreMode));
    $('#ratingRange').value = state.minRating;
    $('#ratingOut').textContent = state.minRating > 0 ? '≥ ' + state.minRating.toFixed(1) : 'Any';
    $('#yearMin').value = state.yearMin; $('#yearMax').value = state.yearMax;
    $('#yearOut').textContent = state.yearMin + ' – ' + state.yearMax;
    $('#votesRange').value = state.votesIdx;
    $('#votesOut').textContent = state.votesIdx > 0 ? '≥ ' + fmtVotes(VOTE_STEPS[state.votesIdx]) : 'Any';
    $('#platformSel').value = state.platform;
    $('#languageSel').value = state.language;
    $('#favOnly').checked = state.favoritesOnly;
    $('#sortSel').value = state.sortKey;
    $('#dirBtn').classList.toggle('flip', state.dir === 'asc');
    $('#searchInput').value = state.query;
  }

  function opts() {
    return {
      query: state.query, genres: Array.from(state.genres), genreMode: state.genreMode,
      yearMin: state.yearMin, yearMax: state.yearMax, minRating: state.minRating,
      minVotes: VOTE_STEPS[state.votesIdx], platform: state.platform, language: state.language,
      favoritesOnly: state.favoritesOnly, favSet: favIds, sortKey: state.sortKey, dir: state.dir
    };
  }

  /* ---------------- update pipeline ---------------- */
  let raf = 0;
  function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); }

  function update() {
    const t0 = performance.now();
    current = Algo.filterMovies(index, opts());
    const dt = performance.now() - t0;

    $('#resultCount').textContent = fmt(current.length) + (current.length === 1 ? ' movie' : ' movies');
    $('#perf').innerHTML = 'Filtered &amp; ranked ' + fmt(movies.length) + ' titles in <b>' + (dt < 1 ? (dt * 1000).toFixed(0) + ' µs' : dt.toFixed(2) + ' ms') + '</b> (pre-sorted index + binary search)';
    renderActiveChips();

    const grid = $('#grid');
    grid.innerHTML = ''; rendered = 0;
    const has = current.length > 0;
    grid.hidden = !has; $('#empty').hidden = has; $('#insights').hidden = !has;
    if (has) { renderInsights(); renderMore(); } else updateMore();
  }

  function cardHTML(i, k) {
    const m = movies[i], fav = favIds.has(m.id);
    return '<article class="card" style="--i:' + k + ';--h1:' + m.h1 + ';--h2:' + m.h2 + '">' +
      '<div class="poster"><span class="initials">' + esc(m.ini) + '</span>' +
      '<span class="badge-rate">★ ' + m.rating.toFixed(1) + '</span><span class="badge-plat">' + esc(m.platform) + '</span></div>' +
      '<div class="info"><h3>' + esc(m.title) + '</h3>' +
      '<div class="sub"><span class="list-rate">★ ' + m.rating.toFixed(1) + '</span>' + m.year + ' · ' + runtimeText(m.runtime) + '</div>' +
      '<div class="gen">' + m.genres.slice(0, 3).map(g => '<span class="tag">' + esc(g) + '</span>').join('') + '</div></div>' +
      '<button class="open" data-open="' + m.id + '" aria-label="Open details for ' + esc(m.title) + '"></button>' +
      '<button class="fav-btn' + (fav ? ' on' : '') + '" data-fav="' + m.id + '" aria-pressed="' + fav + '" aria-label="' + (fav ? 'Remove from' : 'Add to') + ' watchlist">' + (fav ? '♥' : '♡') + '</button>' +
      '</article>';
  }

  function renderMore() {
    if (rendered >= current.length) { updateMore(); return; }
    const end = Math.min(current.length, rendered + PAGE);
    let html = '';
    for (let p = rendered, k = 0; p < end; p++, k++) html += cardHTML(current[p], k);
    $('#grid').insertAdjacentHTML('beforeend', html);
    rendered = end;
    updateMore();
    requestAnimationFrame(fillViewport);
  }
  function updateMore() { $('#more').hidden = rendered >= current.length; }
  // if the sentinel is still near the viewport after a batch, keep loading
  function fillViewport() {
    if (rendered >= current.length) return;
    if ($('#sentinel').getBoundingClientRect().top < window.innerHeight + 500) renderMore();
  }

  function renderActiveChips() {
    const c = [];
    const add = (key, label, val) => c.push('<span class="a-chip">' + esc(label) + '<button data-clear="' + key + '"' + (val != null ? ' data-val="' + esc(val) + '"' : '') + ' aria-label="Remove filter ' + esc(label) + '">✕</button></span>');
    if (state.query.trim()) add('query', '“' + state.query.trim() + '”');
    state.genres.forEach(g => add('genre', g, g));
    if (state.genres.size > 1) c.push('<span class="a-chip" style="padding-right:12px">match ' + state.genreMode + '</span>');
    if (state.minRating > 0) add('rating', 'Rating ≥ ' + state.minRating.toFixed(1));
    if (state.yearMin !== bounds.yMin || state.yearMax !== bounds.yMax) add('year', state.yearMin + '–' + state.yearMax);
    if (state.votesIdx > 0) add('votes', 'Votes ≥ ' + fmtVotes(VOTE_STEPS[state.votesIdx]));
    if (state.platform) add('platform', state.platform);
    if (state.language) add('language', state.language);
    if (state.favoritesOnly) add('fav', 'Watchlist');
    $('#activeChips').innerHTML = c.join('');
  }

  function renderInsights() {
    const top = Algo.topN(current, 5, i => movies[i].score);
    $('#topList').innerHTML = top.map(i => '<li data-open="' + i + '" tabindex="0"><span class="t-title">' + esc(movies[i].title) + '</span><span class="t-rate">★ ' + movies[i].rating.toFixed(1) + '</span></li>').join('');
    const buckets = new Array(10).fill(0);
    current.forEach(i => { buckets[Math.min(9, Math.floor(movies[i].rating))]++; });
    const max = Math.max.apply(null, buckets) || 1;
    $('#hist').innerHTML = buckets.map((n, b) =>
      '<div class="bar" title="' + b + '.0 – ' + b + '.9: ' + fmt(n) + ' movies"><i style="height:' + Math.max(2, Math.round(n / max * 92)) + '%;animation-delay:' + (b * 40) + 'ms"></i>' + b + '</div>').join('');
  }

  /* ---------------- stats animation ---------------- */
  function animateCount(el, target, decimals) {
    decimals = decimals || 0;
    if (reduceMotion) { el.textContent = decimals ? target.toFixed(decimals) : fmt(target); return; }
    const start = performance.now(), dur = 1000;
    (function tick(now) {
      const p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3), v = target * e;
      el.textContent = decimals ? v.toFixed(decimals) : fmt(Math.round(v));
      if (p < 1) requestAnimationFrame(tick);
    })(start);
  }
  function animateStats() {
    const avg = movies.reduce((s, m) => s + m.rating, 0) / movies.length;
    animateCount($('#statMovies'), movies.length);
    animateCount($('#statAvg'), avg, 2);
    animateCount($('#statGenres'), index.genreList.length);
    animateCount($('#statYears'), bounds.yMax - bounds.yMin + 1);
  }

  /* ---------------- toast ---------------- */
  let toastT = 0;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800);
  }

  /* ---------------- favourites ---------------- */
  function toggleFav(id) {
    const m = movies[id]; if (!m) return;
    const on = !favKeys.has(m.key);
    if (on) favKeys.add(m.key); else favKeys.delete(m.key);
    store.set('fav', Array.from(favKeys));
    rebuildFavIds();
    $$('[data-fav="' + id + '"]').forEach(b => {
      b.classList.toggle('on', on); b.textContent = on ? '♥' : '♡';
      b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', (on ? 'Remove from' : 'Add to') + ' watchlist');
    });
    if (openId === id) setModalFav(on);
    toast(on ? 'Added to watchlist' : 'Removed from watchlist');
    if (state.favoritesOnly) schedule();
  }

  /* ---------------- modal ---------------- */
  let openId = -1, lastFocus = null, activeModal = null;
  function lockScroll(on) { document.body.style.overflow = on ? 'hidden' : ''; }
  function showModal(el) { lastFocus = document.activeElement; el.hidden = false; activeModal = el; lockScroll(true); const f = $('.modal-close', el); if (f) f.focus(); }
  function closeModal() {
    if (!activeModal) return;
    activeModal.hidden = true; activeModal = null; openId = -1; lockScroll(false);
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  function setModalFav(on) { $('#mFav').textContent = on ? '♥ In your watchlist' : '☆ Add to watchlist'; }

  function openMovie(id) {
    const m = movies[id]; if (!m) return;
    openId = id;
    const poster = $('#mPoster');
    poster.style.setProperty('--h1', m.h1); poster.style.setProperty('--h2', m.h2);
    poster.innerHTML = '<span>' + esc(m.ini) + '</span>';
    $('#mTitle').textContent = m.title;
    $('#mMeta').innerHTML = '<span>' + m.year + '</span><span>' + runtimeText(m.runtime) + '</span><span>' + esc(m.language) + '</span>';
    $('#mGenres').innerHTML = m.genres.map(g => '<span class="tag">' + esc(g) + '</span>').join('');
    $('#mRing').style.setProperty('--pct', (m.rating * 10).toFixed(0));
    $('#mRingVal').textContent = m.rating.toFixed(1);
    $('#mVotes').textContent = m.votes ? fmt(m.votes) + ' votes' : 'No vote data';
    $('#mScore').textContent = m.score.toFixed(2);
    $('#mInfo').innerHTML =
      '<div><small>Rank by rating</small><b>#' + fmt(rankByRating[id]) + ' of ' + fmt(movies.length) + '</b></div>' +
      '<div><small>Platform</small><b>' + esc(m.platform) + '</b></div>' +
      '<div><small>Release year</small><b>' + m.year + '</b></div>' +
      '<div><small>Language</small><b>' + esc(m.language) + '</b></div>';
    setModalFav(favKeys.has(m.key));
    showModal($('#modal'));
  }

  /* ---------------- suggestions ---------------- */
  let sugIds = [], sugActive = -1;
  function highlight(raw, tokens) {
    if (!tokens.length) return esc(raw);
    const re = new RegExp('(^|[^\\p{L}\\p{N}])(' + tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'giu');
    let out = '', last = 0, mt;
    while ((mt = re.exec(raw))) {
      const s = mt.index + mt[1].length;
      out += esc(raw.slice(last, s)) + '<mark>' + esc(mt[2]) + '</mark>';
      last = s + mt[2].length;
    }
    return out + esc(raw.slice(last));
  }
  function suggest(text) {
    const box = $('#suggestions');
    if (!text.trim()) { box.hidden = true; sugIds = []; return; }
    const ids = Algo.autocomplete(index, text, 6);
    if (ids.length < 6) { // fill with best word-prefix matches
      const mask = Algo.searchMask(index, text), ord = index.orders.score, seen = new Set(ids);
      if (mask) for (let p = ord.length - 1; p >= 0 && ids.length < 6; p--) { const i = ord[p]; if (mask[i] && !seen.has(i)) ids.push(i); }
    }
    sugIds = ids; sugActive = -1;
    if (!ids.length) { box.innerHTML = '<li style="cursor:default;color:var(--muted)">No titles found</li>'; box.hidden = false; return; }
    const tokens = Algo.tokenize(text);
    box.innerHTML = ids.map((i, k) => {
      const m = movies[i];
      return '<li role="option" data-sug="' + k + '"><span class="s-dot" style="background:linear-gradient(135deg,hsl(' + m.h1 + ' 70% 48%),hsl(' + m.h2 + ' 65% 28%))"></span>' +
        '<span class="s-main"><span class="s-title" style="display:block">' + highlight(m.title, tokens) + '</span><span class="s-sub">' + m.year + ' · ' + esc(m.genres.slice(0, 2).join(', ')) + '</span></span>' +
        '<span class="s-rate">★ ' + m.rating.toFixed(1) + '</span></li>';
    }).join('');
    box.hidden = false;
  }
  function pickSuggestion(k) {
    const i = sugIds[k]; if (i == null) return;
    state.query = movies[i].title; $('#searchInput').value = state.query;
    $('#suggestions').hidden = true; schedule();
  }
  function moveActive(d) {
    const items = $$('#suggestions li[data-sug]'); if (!items.length) return;
    sugActive = (sugActive + d + items.length) % items.length;
    items.forEach((li, k) => li.classList.toggle('active', k === sugActive));
    items[sugActive].scrollIntoView({ block: 'nearest' });
  }

  /* ---------------- benchmark ---------------- */
  const fmtT = ms => (ms < 0.01 ? (ms * 1000).toFixed(2) + ' µs' : ms < 1 ? (ms * 1000).toFixed(1) + ' µs' : ms.toFixed(2) + ' ms');
  function time(fn, iters) { fn(); const t = performance.now(); for (let i = 0; i < iters; i++) fn(); return (performance.now() - t) / iters; }
  const tick = () => new Promise(r => setTimeout(r, 20));

  async function runBenchmark() {
    const out = $('#benchOut'), btn = $('#runBench');
    btn.disabled = true; btn.textContent = 'Running…'; out.innerHTML = '';
    await tick();
    const base = { query: '', genres: [], genreMode: 'any', yearMin: bounds.yMin, yearMax: bounds.yMax, minRating: 0, minVotes: 0, platform: '', language: '', favoritesOnly: false, favSet: new Set(), sortKey: 'rating', dir: 'desc' };
    const g = index.genreList[0];
    const rows = [];

    const o1 = Object.assign({}, base, { query: 'the', genres: [g], minRating: 5 });
    rows.push({ name: 'Search + filter + rank', note: 'inverted index + pre-sorted order vs substring scan + sort each time', slow: time(() => Algo.naiveFilter(movies, o1), 30), fast: time(() => Algo.filterMovies(index, o1), 30) });
    await tick();

    const o2 = Object.assign({}, base, { sortKey: 'votes' });
    rows.push({ name: 'Re-sort ' + fmt(movies.length) + ' records', note: 'one O(n) pass over a pre-sorted array vs a full O(n log n) sort', slow: time(() => Algo.naiveFilter(movies, o2), 30), fast: time(() => Algo.filterMovies(index, o2), 30) });
    await tick();

    const sample = []; for (let i = 0; i < 400; i++) sample.push(movies[(i * 7919) % movies.length].titleLower);
    rows.push({ name: 'Find an exact title (×400)', note: 'binary search O(log n) vs linear scan O(n)', slow: time(() => { for (const t of sample) Algo.linearFindTitle(movies, t); }, 15), fast: time(() => { for (const t of sample) Algo.binaryFindTitle(index, t); }, 15) });
    await tick();

    const allIdx = movies.map((_, i) => i);
    rows.push({ name: 'Top 10 by weighted score', note: 'min-heap O(n log k) vs sorting everything', slow: time(() => allIdx.slice().sort((a, b) => movies[b].score - movies[a].score).slice(0, 10), 30), fast: time(() => Algo.topN(allIdx, 10, i => movies[i].score), 30) });

    out.innerHTML = rows.map((r, k) => {
      const sp = r.fast > 0 ? r.slow / r.fast : Infinity;
      const w = Math.max(2, Math.min(100, (r.fast / r.slow) * 100));
      return '<div class="b-row" style="animation-delay:' + (k * 90) + 'ms"><h4><span>' + esc(r.name) + '</span><em>' + (isFinite(sp) ? (sp >= 10 ? Math.round(sp) : sp.toFixed(1)) + '× faster' : 'instant') + '</em></h4>' +
        '<div class="muted" style="font-size:12.5px">' + esc(r.note) + '</div>' +
        '<div class="b-bar slow"><span>Naive</span><div class="track"><i style="width:100%"></i></div><span>' + fmtT(r.slow) + '</span></div>' +
        '<div class="b-bar fast"><span>CineRank</span><div class="track"><i style="width:' + w + '%"></i></div><span>' + fmtT(r.fast) + '</span></div></div>';
    }).join('');
    btn.disabled = false; btn.textContent = 'Run again';
  }

  /* ---------------- CSV import ---------------- */
  async function importCSV(file) {
    if (!file) return;
    toast('Reading ' + file.name + '…');
    try {
      const text = await file.text();
      const res = CSVImport.toDataset(text, { platform: /netflix/i.test(file.name) ? 'Netflix' : 'Dataset' });
      if (res.error) { toast(res.error); return; }
      loadDataset(res.rows, file.name);
      update();
      toast('Loaded ' + fmt(res.rows.length) + ' movies' + (res.skipped ? ' (' + fmt(res.skipped) + ' rows skipped)' : ''));
    } catch (e) {
      toast('Could not read that file.');
    }
  }

  /* ---------------- events ---------------- */
  function bind() {
    // search
    const input = $('#searchInput');
    input.addEventListener('input', () => { state.query = input.value; suggest(input.value); schedule(); });
    input.addEventListener('focus', () => { if (input.value.trim()) suggest(input.value); });
    input.addEventListener('keydown', e => {
      const open = !$('#suggestions').hidden;
      if (e.key === 'ArrowDown' && open) { e.preventDefault(); moveActive(1); }
      else if (e.key === 'ArrowUp' && open) { e.preventDefault(); moveActive(-1); }
      else if (e.key === 'Enter') { if (open && sugActive >= 0) { e.preventDefault(); pickSuggestion(sugActive); } else $('#suggestions').hidden = true; }
      else if (e.key === 'Escape') { $('#suggestions').hidden = true; input.blur(); }
    });
    $('#suggestions').addEventListener('mousedown', e => { const li = e.target.closest('li[data-sug]'); if (li) { e.preventDefault(); pickSuggestion(+li.dataset.sug); } });
    document.addEventListener('click', e => { if (!e.target.closest('#searchBox')) $('#suggestions').hidden = true; });

    // filters
    $('#genreChips').addEventListener('click', e => {
      const b = e.target.closest('.chip'); if (!b) return;
      const g = b.dataset.genre; state.genres.has(g) ? state.genres.delete(g) : state.genres.add(g);
      syncControls(); schedule();
    });
    $('#genreMode').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.genreMode = b.dataset.mode; syncControls(); schedule(); });
    $('#ratingRange').addEventListener('input', e => { state.minRating = +e.target.value; syncControls(); schedule(); });
    $('#votesRange').addEventListener('input', e => { state.votesIdx = +e.target.value; syncControls(); schedule(); });
    $('#yearMin').addEventListener('input', e => { state.yearMin = +e.target.value; if (state.yearMin > state.yearMax) state.yearMax = state.yearMin; syncControls(); schedule(); });
    $('#yearMax').addEventListener('input', e => { state.yearMax = +e.target.value; if (state.yearMax < state.yearMin) state.yearMin = state.yearMax; syncControls(); schedule(); });
    $('#platformSel').addEventListener('change', e => { state.platform = e.target.value; syncControls(); schedule(); });
    $('#languageSel').addEventListener('change', e => { state.language = e.target.value; syncControls(); schedule(); });
    $('#favOnly').addEventListener('change', e => { state.favoritesOnly = e.target.checked; syncControls(); schedule(); });
    const reset = () => { resetState(); syncControls(); $('#suggestions').hidden = true; schedule(); };
    $('#resetBtn').addEventListener('click', reset);
    $('#emptyReset').addEventListener('click', reset);

    // active chips
    $('#activeChips').addEventListener('click', e => {
      const b = e.target.closest('[data-clear]'); if (!b) return;
      const d = defaults(), k = b.dataset.clear;
      if (k === 'query') state.query = '';
      else if (k === 'genre') state.genres.delete(b.dataset.val);
      else if (k === 'rating') state.minRating = 0;
      else if (k === 'year') { state.yearMin = d.yearMin; state.yearMax = d.yearMax; }
      else if (k === 'votes') state.votesIdx = 0;
      else if (k === 'platform') state.platform = '';
      else if (k === 'language') state.language = '';
      else if (k === 'fav') state.favoritesOnly = false;
      syncControls(); schedule();
    });

    // sort & view
    $('#sortSel').addEventListener('change', e => { state.sortKey = e.target.value; state.dir = 'desc'; syncControls(); schedule(); });
    $('#dirBtn').addEventListener('click', () => { state.dir = state.dir === 'desc' ? 'asc' : 'desc'; syncControls(); schedule(); });
    $('#viewSeg').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      $$('#viewSeg button').forEach(x => x.classList.toggle('on', x === b));
      $('#grid').classList.toggle('list', b.dataset.view === 'list');
      store.set('view', b.dataset.view);
    });

    // cards, top list
    $('#grid').addEventListener('click', e => {
      const f = e.target.closest('[data-fav]'); if (f) { toggleFav(+f.dataset.fav); return; }
      const o = e.target.closest('[data-open]'); if (o) openMovie(+o.dataset.open);
    });
    const openFromTop = e => { const li = e.target.closest('[data-open]'); if (li) openMovie(+li.dataset.open); };
    $('#topList').addEventListener('click', openFromTop);
    $('#topList').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFromTop(e); } });

    // modal
    $('#modal').addEventListener('click', e => { if (e.target === e.currentTarget || e.target.closest('[data-close]')) closeModal(); });
    $('#benchModal').addEventListener('click', e => { if (e.target === e.currentTarget || e.target.closest('[data-close]')) closeModal(); });
    $('#mFav').addEventListener('click', () => { if (openId >= 0) toggleFav(openId); });
    $('#mSimilar').addEventListener('click', () => {
      const m = movies[openId]; if (!m) return;
      const gs = m.genres; closeModal();
      state.genres = new Set(gs); state.genreMode = 'any'; state.query = '';
      state.sortKey = 'score'; state.dir = 'desc'; syncControls(); schedule();
      $('.results').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
      toast('Showing movies in ' + gs.join(' / '));
    });
    $('#benchBtn').addEventListener('click', () => { $('#benchOut').innerHTML = ''; $('#runBench').textContent = 'Run benchmark'; showModal($('#benchModal')); });
    $('#runBench').addEventListener('click', runBenchmark);

    // keyboard
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (activeModal) closeModal(); else closeFilters(); return; }
      if (e.key === 'Tab' && activeModal) { // simple focus trap
        const f = $$('button, [href], input, select', activeModal).filter(x => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        return;
      }
      if (e.key === '/' && !activeModal && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { e.preventDefault(); $('#searchInput').focus(); }
    });

    // mobile filter drawer
    const openFilters = () => { $('#filters').classList.add('open'); $('#scrim').classList.add('show'); };
    function closeFilters() { $('#filters').classList.remove('open'); $('#scrim').classList.remove('show'); }
    $('#openFilters').addEventListener('click', openFilters);
    $('#closeFilters').addEventListener('click', closeFilters);
    $('#scrim').addEventListener('click', closeFilters);
    window.closeFilters = closeFilters;

    // misc
    $('#moreBtn').addEventListener('click', renderMore);
    $('#csvInput').addEventListener('change', e => { importCSV(e.target.files[0]); e.target.value = ''; });
    $('#themeBtn').addEventListener('click', () => {
      const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      setTheme(t); store.set('theme', t);
    });
    $('#toTop').addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }));

    // scroll effects
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY, h = document.documentElement.scrollHeight - window.innerHeight;
        $('#scrollProgress').style.transform = 'scaleX(' + (h > 0 ? Math.min(1, y / h) : 0) + ')';
        $('#topbar').classList.toggle('scrolled', y > 8);
        $('#toTop').classList.toggle('show', y > 700);
        ticking = false;
      });
    }, { passive: true });

    // infinite scroll
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => { if (es[0].isIntersecting) renderMore(); }, { rootMargin: '600px 0px' }).observe($('#sentinel'));
    }
  }
  function closeFilters() { if (window.closeFilters) window.closeFilters(); }

  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === 'dark' ? '#0b0b14' : '#f6f6fb';
  }

  /* ---------------- boot ---------------- */
  function boot() {
    setTheme(store.get('theme', 'dark'));
    if (!window.MOVIES_DATA || !window.MOVIES_DATA.length) { $('#perf').textContent = 'Dataset missing – run tools/generate_data.py or import a CSV.'; }
    loadDataset(window.MOVIES_DATA || [], '');
    const view = store.get('view', 'grid');
    if (view === 'list') { $('#grid').classList.add('list'); $$('#viewSeg button').forEach(b => b.classList.toggle('on', b.dataset.view === 'list')); }
    bind();
    update();
  }
  boot();
})();
