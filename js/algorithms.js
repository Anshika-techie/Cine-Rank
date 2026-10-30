/*
 * CineRank - data structures & algorithms
 * ---------------------------------------------------------------
 *  mergeSort      O(n log n) stable, iterative bottom-up
 *  lowerBound     O(log n) binary search (first index >= target)
 *  prefixRange    O(log n) range of sorted keys sharing a prefix
 *  MinHeap/topN   O(n log k) top-k selection
 *  buildIndex     builds: pre-sorted order arrays (one per sort key),
 *                 sorted word list + inverted index (word -> movie ids),
 *                 genre bitmasks, sorted titles for autocomplete
 *  searchIds      O(t * (log W + m)) word-prefix search via binary search
 *  filterMovies   O(n) single pass over a pre-sorted order (no re-sorting)
 *  naiveFilter    the "before" version: substring scan + Array.sort per query
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Algo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- Merge sort (stable, bottom-up) ---------- */
  function mergeSort(arr, cmp) {
    const n = arr.length;
    if (n < 2) return arr.slice();
    let src = arr.slice();
    let dst = new Array(n);
    for (let width = 1; width < n; width *= 2) {
      for (let i = 0; i < n; i += 2 * width) {
        const mid = Math.min(i + width, n);
        const hi = Math.min(i + 2 * width, n);
        let l = i, r = mid, k = i;
        while (l < mid && r < hi) {
          // take right only if strictly smaller -> stability
          dst[k++] = cmp(src[r], src[l]) < 0 ? src[r++] : src[l++];
        }
        while (l < mid) dst[k++] = src[l++];
        while (r < hi) dst[k++] = src[r++];
      }
      const t = src; src = dst; dst = t;
    }
    return src;
  }

  /* ---------- Binary search ---------- */
  // first index i with arr[i] >= target (arr sorted ascending, strings or numbers)
  function lowerBound(arr, target) {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid] < target) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  // [lo, hi) slice of sorted string array whose entries start with prefix
  function prefixRange(sortedKeys, prefix) {
    const lo = lowerBound(sortedKeys, prefix);
    const hi = lowerBound(sortedKeys, prefix + '￿');
    return [lo, hi];
  }

  /* ---------- Min-heap & top-k ---------- */
  class MinHeap {
    constructor(cmp) { this.a = []; this.cmp = cmp; }
    get size() { return this.a.length; }
    peek() { return this.a[0]; }
    push(v) {
      const a = this.a; a.push(v);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (this.cmp(a[i], a[p]) < 0) { [a[i], a[p]] = [a[p], a[i]]; i = p; } else break;
      }
    }
    pop() {
      const a = this.a;
      if (!a.length) return undefined;
      const top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let s = i;
          if (l < a.length && this.cmp(a[l], a[s]) < 0) s = l;
          if (r < a.length && this.cmp(a[r], a[s]) < 0) s = r;
          if (s === i) break;
          [a[i], a[s]] = [a[s], a[i]]; i = s;
        }
      }
      return top;
    }
  }

  // k best items by `score` (descending). O(n log k)
  function topN(items, k, score) {
    if (k <= 0) return [];
    const heap = new MinHeap((x, y) => score(x) - score(y));
    for (let i = 0; i < items.length; i++) {
      if (heap.size < k) heap.push(items[i]);
      else if (score(items[i]) > score(heap.peek())) { heap.pop(); heap.push(items[i]); }
    }
    return mergeSort(heap.a, (x, y) => score(y) - score(x));
  }

  /* ---------- Text helpers ---------- */
  function tokenize(s) {
    return String(s).toLowerCase().split(/[^a-z0-9À-￿]+/).filter(Boolean);
  }

  /* ---------- Index ---------- */
  const SORT_KEYS = {
    rating:  (a, b) => b.rating - a.rating || b.votes - a.votes,
    votes:   (a, b) => b.votes - a.votes,
    year:    (a, b) => b.year - a.year,
    title:   (a, b) => (a.titleLower < b.titleLower ? -1 : a.titleLower > b.titleLower ? 1 : 0),
    runtime: (a, b) => b.runtime - a.runtime,
    score:   (a, b) => b.score - a.score
  };

  // Every comparator gets id as the final tie-breaker so ordering is total & deterministic
  function withTie(cmp) { return (a, b) => cmp(a, b) || a.id - b.id; }

  function buildIndex(movies) {
    const n = movies.length;

    // Genre -> bit position (supports up to 31 genres in one int bitmask)
    const genreList = [];
    const genreBit = new Map();
    movies.forEach(m => m.genres.forEach(g => {
      if (!genreBit.has(g)) { genreBit.set(g, genreList.length); genreList.push(g); }
    }));
    genreList.sort();
    genreList.forEach((g, i) => genreBit.set(g, i));
    const maskFits = genreList.length <= 31;
    movies.forEach(m => {
      let mask = 0;
      if (maskFits) m.genres.forEach(g => { mask |= (1 << genreBit.get(g)); });
      m.genreMask = mask;
    });

    // Pre-sorted order arrays (indices into `movies`), ascending by key.
    // "Descending" is just iterating from the end -> no re-sort on toggle.
    const orders = {};
    const idx = movies.map((_, i) => i);
    for (const key of Object.keys(SORT_KEYS)) {
      const cmp = withTie(SORT_KEYS[key]);
      // SORT_KEYS are written "best first"; reverse so orders[key] is ascending
      orders[key] = mergeSort(idx, (i, j) => cmp(movies[j], movies[i]));
    }

    // Sorted titles (for autocomplete) -> parallel array of movie indices
    // orders.title is stored "worst first" (Z->A), so reverse it to get A->Z for binary search
    const byTitle = orders.title.slice().reverse();
    const sortedTitles = byTitle.map(i => movies[i].titleLower);

    // Inverted index: word -> ascending array of movie indices
    const inv = new Map();
    for (let i = 0; i < n; i++) {
      const seen = new Set();
      for (const w of tokenize(movies[i].title)) {
        if (seen.has(w)) continue;
        seen.add(w);
        let list = inv.get(w);
        if (!list) { list = []; inv.set(w, list); }
        list.push(i);
      }
    }
    const sortedWords = mergeSort(Array.from(inv.keys()), (a, b) => (a < b ? -1 : a > b ? 1 : 0));

    return { n, movies, genreList, genreBit, maskFits, orders, sortedTitles, byTitle, inv, sortedWords };
  }

  /* ---------- Search ---------- */
  // Matches movies where EVERY query token is a prefix of some title word.
  // Returns a Uint8Array mask (1 = match) or null when the query is empty.
  function searchMask(index, query) {
    const tokens = tokenize(query);
    if (!tokens.length) return null;
    const n = index.n;
    let result = null;
    for (const tok of tokens) {
      const [lo, hi] = prefixRange(index.sortedWords, tok);
      const cur = new Uint8Array(n);
      for (let w = lo; w < hi; w++) {
        const list = index.inv.get(index.sortedWords[w]);
        for (let k = 0; k < list.length; k++) cur[list[k]] = 1;
      }
      if (result === null) result = cur;
      else for (let i = 0; i < n; i++) result[i] = result[i] & cur[i];
    }
    return result;
  }

  // Title-prefix autocomplete using binary search on the sorted title array
  function autocomplete(index, text, limit) {
    const q = String(text).trim().toLowerCase();
    if (!q) return [];
    const [lo, hi] = prefixRange(index.sortedTitles, q);
    const out = [];
    for (let i = lo; i < hi && out.length < limit; i++) out.push(index.byTitle[i]);
    return out;
  }

  /* ---------- Filtering (indexed path) ---------- */
  // opts: {query, genres:[names], genreMode:'any'|'all', yearMin, yearMax, minRating,
  //        minVotes, platform, language, favoritesOnly, favSet, sortKey, dir:'asc'|'desc'}
  function filterMovies(index, opts) {
    const movies = index.movies;
    const mask = searchMask(index, opts.query || '');
    let selMask = 0;
    const selGenres = opts.genres || [];
    if (index.maskFits) selMask = selGenres.reduce((m, g) => m | (1 << index.genreBit.get(g)), 0);
    const all = opts.genreMode === 'all';
    const order = index.orders[opts.sortKey] || index.orders.rating;
    // orders are ascending; sortKeys named "best first" mean 'desc' is the natural default
    const desc = opts.dir !== 'asc';
    const out = [];
    const n = order.length;
    for (let s = 0; s < n; s++) {
      const i = desc ? order[n - 1 - s] : order[s];
      const m = movies[i];
      if (mask && !mask[i]) continue;
      if (m.year < opts.yearMin || m.year > opts.yearMax) continue;
      if (m.rating < opts.minRating) continue;
      if (m.votes < opts.minVotes) continue;
      if (opts.platform && m.platform !== opts.platform) continue;
      if (opts.language && m.language !== opts.language) continue;
      if (opts.favoritesOnly && !(opts.favSet && opts.favSet.has(m.id))) continue;
      if (selMask) {
        const hit = m.genreMask & selMask;
        if (all ? hit !== selMask : hit === 0) continue;
      } else if (selGenres.length && !index.maskFits) {
        const has = g => m.genres.indexOf(g) !== -1;
        if (all ? !selGenres.every(has) : !selGenres.some(has)) continue;
      }
      out.push(i);
    }
    return out;
  }

  /* ---------- Naive baseline (for the benchmark) ---------- */
  function naiveFilter(movies, opts) {
    const tokens = tokenize(opts.query || '');
    const sel = opts.genres || [];
    const all = opts.genreMode === 'all';
    const res = [];
    for (let i = 0; i < movies.length; i++) {
      const m = movies[i];
      if (tokens.length) {
        const words = tokenize(m.title);
        const ok = tokens.every(t => words.some(w => w.startsWith(t)));
        if (!ok) continue;
      }
      if (m.year < opts.yearMin || m.year > opts.yearMax) continue;
      if (m.rating < opts.minRating || m.votes < opts.minVotes) continue;
      if (opts.platform && m.platform !== opts.platform) continue;
      if (opts.language && m.language !== opts.language) continue;
      if (opts.favoritesOnly && !(opts.favSet && opts.favSet.has(m.id))) continue;
      if (sel.length) {
        const has = g => m.genres.indexOf(g) !== -1;
        if (all ? !sel.every(has) : !sel.some(has)) continue;
      }
      res.push(i);
    }
    const cmp = withTie(SORT_KEYS[opts.sortKey] || SORT_KEYS.rating);
    const dir = opts.dir === 'asc' ? -1 : 1; // SORT_KEYS are best-first (== desc)
    res.sort((a, b) => dir * cmp(movies[a], movies[b]));
    return res;
  }

  /* ---------- Misc ---------- */
  // IMDb-style weighted rating: (v/(v+m))*R + (m/(v+m))*C
  function weightedRating(rating, votes, m, C) { return (votes / (votes + m)) * rating + (m / (votes + m)) * C; }

  // Linear search baseline (used only in the benchmark)
  function linearFindTitle(movies, titleLower) {
    for (let i = 0; i < movies.length; i++) if (movies[i].titleLower === titleLower) return i;
    return -1;
  }
  function binaryFindTitle(index, titleLower) {
    const p = lowerBound(index.sortedTitles, titleLower);
    return p < index.n && index.sortedTitles[p] === titleLower ? index.byTitle[p] : -1;
  }

  return {
    mergeSort, lowerBound, prefixRange, MinHeap, topN, tokenize,
    buildIndex, searchMask, autocomplete, filterMovies, naiveFilter,
    weightedRating, linearFindTitle, binaryFindTitle, SORT_KEYS, withTie
  };
});
