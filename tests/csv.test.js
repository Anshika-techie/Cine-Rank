// Run:  node tests/csv.test.js
const assert = require('assert');
const { parseCSV, toDataset } = require('../js/csv.js');
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('FAIL  ' + name + '\n' + e.stack); process.exitCode = 1; }
}

test('parseCSV: quotes, commas, escaped quotes, CRLF, BOM', () => {
  const t = '﻿a,b,c\r\n1,"x, y","he said ""hi"""\r\n2,,\r\n';
  assert.deepStrictEqual(parseCSV(t), [['a', 'b', 'c'], ['1', 'x, y', 'he said "hi"'], ['2', '', '']]);
});
test('parseCSV: newline inside quotes, no trailing newline', () => {
  assert.deepStrictEqual(parseCSV('a,b\n"l1\nl2",z'), [['a', 'b'], ['l1\nl2', 'z']]);
});

test('Kaggle IMDb top-1000 style', () => {
  const csv = 'Poster_Link,Series_Title,Released_Year,Runtime,Genre,IMDB_Rating,No_of_Votes\n' +
    'x,"The Godfather",1972,175 min,"Crime, Drama",9.2,"1,620,367"\n' +
    'x,Inception,2010,148 min,"Action, Adventure, Sci-Fi",8.8,2067042\n';
  const r = toDataset(csv);
  assert.ok(!r.error);
  assert.deepStrictEqual(r.rows[0], [0, 'The Godfather', 1972, 'Crime|Drama', 9.2, 1620367, 175, 'Unknown', 'Dataset']);
  assert.strictEqual(r.rows[1][3], 'Action|Adventure|Sci-Fi');
});

test('Netflix style: maturity "rating" column is rejected, imdb_score used', () => {
  const csv = 'show_id,type,title,release_year,rating,duration,listed_in,imdb_score,imdb_votes\n' +
    's1,Movie,Dick Johnson Is Dead,2020,PG-13,90 min,Documentaries,7.4,5000\n' +
    's2,Movie,Blood & Water,2021,TV-MA,100 min,"Dramas, International Movies",6.1,2300\n';
  const r = toDataset(csv, { platform: 'Netflix' });
  assert.ok(!r.error, r.error);
  assert.strictEqual(r.rows.length, 2);
  assert.strictEqual(r.rows[0][4], 7.4);
  assert.strictEqual(r.rows[0][8], 'Netflix');
});

test('skips invalid / duplicate rows and reports count', () => {
  const csv = 'title,year,rating\nA,2000,7\nA,2000,7\n,2001,5\nB,abc,5\nC,2002,x\nD,1999,85\n';
  const r = toDataset(csv);
  assert.strictEqual(r.rows.length, 2); // A and D
  assert.strictEqual(r.skipped, 4);
  assert.strictEqual(r.rows[1][4], 8.5); // 0-100 scale converted
});

test('errors: empty file, missing columns', () => {
  assert.ok(toDataset('').error);
  assert.ok(toDataset('title,year\nA,2000\n').error);
});

console.log(`\n${passed} tests passed` + (process.exitCode ? ' (with failures)' : ''));
