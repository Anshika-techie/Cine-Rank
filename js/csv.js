/*
 * CineRank - CSV import
 * Understands the common Kaggle IMDb / Netflix layouts by detecting columns by name.
 * Output rows use the same shape as js/data.js:
 *   [id, title, year, "Genre|Genre", rating, votes, runtime, language, platform]
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CSVImport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // RFC-4180 style parser: quoted fields, escaped quotes, CRLF/LF, BOM
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const rows = [];
    let row = [], cur = '', inQ = false;
    const endRow = () => {
      row.push(cur); cur = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += c;
      } else if (c === '"' && cur === '') inQ = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; endRow(); }
      else cur += c;
    }
    if (cur !== '' || row.length) endRow();
    return rows;
  }

  const NAMES = {
    title: ['title', 'series_title', 'movie_title', 'movie_name', 'original_title', 'primarytitle', 'name', 'movie'],
    year: ['year', 'released_year', 'release_year', 'releaseyear', 'startyear', 'start_year', 'release_date', 'released'],
    genres: ['genres', 'genre', 'listed_in', 'category', 'categories'],
    rating: ['imdb_rating', 'imdb_score', 'imdbrating', 'averagerating', 'average_rating', 'vote_average', 'rating', 'score', 'imdb'],
    votes: ['no_of_votes', 'numvotes', 'num_votes', 'votes', 'vote_count', 'imdb_votes', 'imdbvotes'],
    runtime: ['runtime', 'runtime_minutes', 'runtimeminutes', 'duration', 'length', 'runtime_min'],
    language: ['language', 'original_language', 'languages'],
    platform: ['platform', 'streaming', 'service', 'source']
  };

  const num = s => {
    const m = String(s == null ? '' : s).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : NaN;
  };
  const yearOf = s => { const m = String(s || '').match(/\b(18|19|20)\d{2}\b/); return m ? parseInt(m[0], 10) : NaN; };

  function toDataset(text, opts) {
    opts = opts || {};
    const table = parseCSV(String(text));
    if (table.length < 2) return { error: 'The file has no data rows.' };
    const head = table[0].map(h => h.trim().toLowerCase().replace(/[\s\-.]+/g, '_'));
    const body = table.slice(1);

    const findText = names => { for (const n of names) { const i = head.indexOf(n); if (i !== -1) return i; } return -1; };
    // numeric columns: prefer the first candidate whose sampled values are mostly numbers
    // (Netflix's "rating" column is a maturity rating like PG-13, so it must be rejected)
    const findNumeric = (names, parser) => {
      const sample = body.slice(0, 60);
      for (const n of names) {
        const i = head.indexOf(n);
        if (i === -1) continue;
        const ok = sample.filter(r => !isNaN(parser(r[i]))).length;
        if (sample.length && ok / sample.length > 0.5) return i;
      }
      return -1;
    };

    const col = {
      title: findText(NAMES.title),
      year: findNumeric(NAMES.year, yearOf),
      genres: findText(NAMES.genres),
      rating: findNumeric(NAMES.rating, num),
      votes: findNumeric(NAMES.votes, num),
      runtime: findNumeric(NAMES.runtime, num),
      language: findText(NAMES.language),
      platform: findText(NAMES.platform)
    };
    if (col.title < 0 || col.rating < 0) {
      return { error: "Couldn't find a title column and a numeric rating column. Expected headers like title / imdb_rating." };
    }

    const rows = [];
    let skipped = 0;
    const seen = new Set();
    for (const r of body) {
      const title = (r[col.title] || '').trim();
      let rating = col.rating >= 0 ? num(r[col.rating]) : NaN;
      if (rating > 10 && rating <= 100) rating = rating / 10; // 0-100 scale
      const year = col.year >= 0 ? yearOf(r[col.year]) : NaN;
      if (!title || isNaN(rating) || rating < 0 || rating > 10 || isNaN(year)) { skipped++; continue; }
      const key = title.toLowerCase() + '|' + year;
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);
      let genres = col.genres >= 0 ? String(r[col.genres] || '').split(/[,|;/]/).map(s => s.trim()).filter(Boolean) : [];
      if (!genres.length) genres = ['Unknown'];
      genres = Array.from(new Set(genres)).slice(0, 6);
      const votes = col.votes >= 0 && !isNaN(num(r[col.votes])) ? Math.max(0, Math.round(num(r[col.votes]))) : 0;
      const runtime = col.runtime >= 0 && !isNaN(num(r[col.runtime])) ? Math.max(0, Math.round(num(r[col.runtime]))) : 0;
      const language = col.language >= 0 ? (r[col.language] || '').trim() || 'Unknown' : 'Unknown';
      const platform = col.platform >= 0 ? (r[col.platform] || '').trim() || (opts.platform || 'Dataset') : (opts.platform || 'Dataset');
      rows.push([rows.length, title, year, genres.join('|'), Math.round(rating * 10) / 10, votes, runtime, language, platform]);
    }
    if (!rows.length) return { error: 'No valid rows found (need a title, a year and a numeric rating).' };
    return { rows, skipped, columns: col, header: head };
  }

  return { parseCSV, toDataset };
});
