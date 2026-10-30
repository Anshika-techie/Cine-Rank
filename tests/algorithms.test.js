// Run:  node tests/algorithms.test.js
const assert = require('assert');
const Algo = require('../js/algorithms.js');
const fs = require('fs');
const path = require('path');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('FAIL  ' + name + '\n' + e.stack); process.exitCode = 1; }
}

// deterministic PRNG
let seed = 12345;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

/* ----- load the real dataset the app uses ----- */
const src = fs.readFileSync(path.join(__dirname, '../js/data.js'), 'utf8');
const window = {}; new Function('window', src)(window);
const movies = window.MOVIES_DATA.map(r => ({
  id: r[0], title: r[1], titleLower: r[1].toLowerCase(), year: r[2], genres: r[3].split('|'),
  rating: r[4], votes: r[5], runtime: r[6], language: r[7], platform: r[8]
}));
const idx = Algo.buildIndex(movies);

test('dataset has 3,000+ records', () => assert.ok(movies.length >= 3000));
test('titles are unique', () => assert.strictEqual(new Set(movies.map(m => m.titleLower)).size, movies.length));

test('mergeSort matches Array.sort on random numbers', () => {
  for (let t = 0; t < 50; t++) {
    const a = Array.from({ length: Math.floor(rnd() * 300) }, () => Math.floor(rnd() * 100));
    assert.deepStrictEqual(Algo.mergeSort(a, (x, y) => x - y), a.slice().sort((x, y) => x - y));
  }
});
test('mergeSort handles empty / single / no mutation', () => {
  assert.deepStrictEqual(Algo.mergeSort([], (a, b) => a - b), []);
  assert.deepStrictEqual(Algo.mergeSort([5], (a, b) => a - b), [5]);
  const a = [3, 1, 2]; Algo.mergeSort(a, (x, y) => x - y); assert.deepStrictEqual(a, [3, 1, 2]);
});
test('mergeSort is stable', () => {
  const a = Array.from({ length: 500 }, (_, i) => ({ k: Math.floor(rnd() * 5), i }));
  const s = Algo.mergeSort(a, (x, y) => x.k - y.k);
  for (let i = 1; i < s.length; i++) {
    assert.ok(s[i - 1].k < s[i].k || (s[i - 1].k === s[i].k && s[i - 1].i < s[i].i));
  }
});

test('lowerBound basics', () => {
  const a = [1, 3, 3, 5, 9];
  assert.strictEqual(Algo.lowerBound(a, 0), 0);
  assert.strictEqual(Algo.lowerBound(a, 3), 1);
  assert.strictEqual(Algo.lowerBound(a, 4), 3);
  assert.strictEqual(Algo.lowerBound(a, 10), 5);
  assert.strictEqual(Algo.lowerBound([], 1), 0);
});
test('prefixRange equals linear startsWith', () => {
  const keys = idx.sortedTitles;
  for (const p of ['a', 'the', 'the s', 'zz', 'sil', 'x', '']) {
    const [lo, hi] = Algo.prefixRange(keys, p);
    const exp = keys.filter(k => k.startsWith(p));
    assert.deepStrictEqual(keys.slice(lo, hi), exp, 'prefix ' + p);
  }
});

test('MinHeap pops in ascending order', () => {
  const h = new Algo.MinHeap((a, b) => a - b);
  const a = Array.from({ length: 200 }, () => Math.floor(rnd() * 1000));
  a.forEach(v => h.push(v));
  const out = []; while (h.size) out.push(h.pop());
  assert.deepStrictEqual(out, a.slice().sort((x, y) => x - y));
});
test('topN equals sort-and-slice', () => {
  const a = Array.from({ length: 400 }, () => Math.floor(rnd() * 1000));
  for (const k of [0, 1, 5, 50, 400, 500]) {
    const exp = a.slice().sort((x, y) => y - x).slice(0, k);
    assert.deepStrictEqual(Algo.topN(a, k, x => x), exp);
  }
});

test('sorted titles are really sorted', () => {
  for (let i = 1; i < idx.sortedTitles.length; i++) assert.ok(idx.sortedTitles[i - 1] <= idx.sortedTitles[i]);
});
test('every order array is a permutation of all indices', () => {
  for (const k of Object.keys(idx.orders)) {
    assert.strictEqual(new Set(idx.orders[k]).size, movies.length, k);
  }
});

const base = { query: '', genres: [], genreMode: 'any', yearMin: 1950, yearMax: 2025, minRating: 0, minVotes: 0,
  platform: '', language: '', favoritesOnly: false, favSet: new Set(), sortKey: 'rating', dir: 'desc' };

test('rating sort desc is non-increasing; asc is non-decreasing', () => {
  const d = Algo.filterMovies(idx, base).map(i => movies[i].rating);
  for (let i = 1; i < d.length; i++) assert.ok(d[i - 1] >= d[i]);
  const a = Algo.filterMovies(idx, { ...base, dir: 'asc' }).map(i => movies[i].rating);
  for (let i = 1; i < a.length; i++) assert.ok(a[i - 1] <= a[i]);
  assert.strictEqual(d.length, movies.length);
});
test('title sort "best first" is A to Z', () => {
  const t = Algo.filterMovies(idx, { ...base, sortKey: 'title', dir: 'desc' }).map(i => movies[i].titleLower);
  for (let i = 1; i < t.length; i++) assert.ok(t[i - 1] <= t[i]);
});

test('indexed filter === naive filter (identical results AND order) on 300 random queries', () => {
  const words = ['the', 'silent', 'last', 'tok', 'kyo', 'and', 'of', 'zzz', 'a', 'neon wild', 'the sil', 'ash', 'in'];
  const genres = idx.genreList;
  const keys = Object.keys(Algo.SORT_KEYS);
  for (let t = 0; t < 300; t++) {
    const gsel = genres.filter(() => rnd() < 0.15);
    const o = {
      query: rnd() < 0.6 ? words[Math.floor(rnd() * words.length)] : '',
      genres: gsel, genreMode: rnd() < 0.5 ? 'any' : 'all',
      yearMin: 1950 + Math.floor(rnd() * 40), yearMax: 1990 + Math.floor(rnd() * 36),
      minRating: Math.floor(rnd() * 8), minVotes: Math.floor(rnd() * 5000),
      platform: rnd() < 0.3 ? 'Netflix' : '', language: rnd() < 0.2 ? 'English' : '',
      favoritesOnly: rnd() < 0.1, favSet: new Set([1, 5, 77, 400, 1234]),
      sortKey: keys[Math.floor(rnd() * keys.length)], dir: rnd() < 0.5 ? 'asc' : 'desc'
    };
    // movies need a score for the 'score' key
    assert.deepStrictEqual(Algo.filterMovies(idx, o), Algo.naiveFilter(movies, o), JSON.stringify(o));
  }
});

test('search: multi-word AND, prefix matching, empty query', () => {
  assert.strictEqual(Algo.searchMask(idx, ''), null);
  const m = Algo.searchMask(idx, 'silent hor');
  for (let i = 0; i < movies.length; i++) {
    const w = Algo.tokenize(movies[i].title);
    const exp = w.some(x => x.startsWith('silent')) && w.some(x => x.startsWith('hor'));
    assert.strictEqual(m[i] === 1, exp, movies[i].title);
  }
});
test('autocomplete returns only title-prefix matches', () => {
  const r = Algo.autocomplete(idx, 'the s', 8);
  assert.ok(r.length > 0 && r.length <= 8);
  r.forEach(i => assert.ok(movies[i].titleLower.startsWith('the s')));
  assert.deepStrictEqual(Algo.autocomplete(idx, '', 5), []);
});
test('binaryFindTitle === linearFindTitle', () => {
  for (let t = 0; t < 200; t++) {
    const m = movies[Math.floor(rnd() * movies.length)];
    assert.strictEqual(Algo.binaryFindTitle(idx, m.titleLower), Algo.linearFindTitle(movies, m.titleLower));
  }
  assert.strictEqual(Algo.binaryFindTitle(idx, 'definitely not a movie'), -1);
});

test('weightedRating pulls low-vote items toward the mean', () => {
  const hi = Algo.weightedRating(9.5, 10, 1000, 6.5);
  const hi2 = Algo.weightedRating(9.5, 100000, 1000, 6.5);
  assert.ok(hi < hi2 && hi > 6.5 && hi2 < 9.5);
});

test('benchmark: indexed filtering is not slower than naive', () => {
  const o = { ...base, query: 'the', genres: ['Drama'], minRating: 6 };
  const time = fn => { const t = process.hrtime.bigint(); for (let i = 0; i < 100; i++) fn(); return Number(process.hrtime.bigint() - t) / 1e6; };
  Algo.filterMovies(idx, o); Algo.naiveFilter(movies, o); // warm up
  const fast = time(() => Algo.filterMovies(idx, o));
  const slow = time(() => Algo.naiveFilter(movies, o));
  console.log(`      100 runs: indexed ${fast.toFixed(1)} ms vs naive ${slow.toFixed(1)} ms`);
  assert.ok(fast < slow);
});

console.log(`\n${passed} tests passed` + (process.exitCode ? ' (with failures)' : ''));
