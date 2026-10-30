# 🎬 CineRank — Movie Ratings Explorer

<p align="center">

  **Discover. Explore. Compare. Rank.**

  A fast, responsive movie exploration platform powered by Data Structures and Algorithms.

  [🌐 Live Demo](https://cine-rank-omega.vercel.app/) · [📂 GitHub Repository](https://github.com/Anshika-techie/Cine-Rank)

</p>

---

## 🚀 About The Project

**CineRank** is a responsive web application designed to explore, search, filter, and rank over 3,000 movie records inspired by IMDb and Netflix datasets.

Built using **HTML5, CSS3, and Vanilla JavaScript**, the application combines an interactive user interface with efficient Data Structures and Algorithms to make movie discovery faster and more efficient.

Unlike applications built with heavy frameworks, CineRank uses a hand-written frontend and custom algorithm implementations to handle searching, sorting, filtering, and ranking operations.

### 🌐 Live Application

**Try CineRank here:**

https://cine-rank-omega.vercel.app/

---

## ✨ Key Features

### 🔍 Smart Search & Discovery
- Real-time movie search with autocomplete suggestions.
- Keyboard navigation using Arrow Keys, Enter, and Escape.
- Press `/` to quickly focus the search bar.
- Efficient title searching using an inverted index.

### 🎯 Advanced Filtering
- Filter movies by genre, rating, release year, and votes.
- Filter by streaming platform and language.
- Support for Any / All genre matching.

### 📊 Sorting & Ranking
- Sort movies by rating, popularity, release year, runtime, and title.
- Weighted IMDb-style rating system.
- Top Picks based on weighted ratings.
- Reverse sorting with a single click.

### 🎨 Interactive User Interface
- Responsive movie grid and list layouts.
- Dark and light themes.
- Infinite scrolling.
- Rating distribution histogram.
- Top 5 movie recommendations for the current view.
- Interactive movie details modal.
- Find Similar Movies functionality.
- Persistent personal watchlist using LocalStorage.

### ⚡ Performance & Accessibility
- Custom optimized searching and sorting algorithms.
- Benchmark feature to compare indexed and naive approaches.
- Responsive mobile filter drawer.
- Keyboard accessibility and ARIA support.
- Reduced-motion accessibility support.

### 📁 CSV Data Import
- Import external IMDb and Netflix CSV datasets.
- Automatic column detection.
- Support for different dataset formats.

---

## 🧠 Data Structures & Algorithms Used

One of the main objectives of CineRank is to demonstrate how DSA concepts can improve the performance of real-world applications.

The implementations are available in `js/algorithms.js`.

| Problem | Algorithm / Data Structure | Time Complexity |
|---|---|---|
| Movie Sorting | Bottom-Up Merge Sort | O(n log n) |
| Fast Re-sorting | Pre-sorted Index Arrays | O(n) |
| Title Searching | Inverted Index + Binary Search | O(log W + k), plus result processing |
| Autocomplete | Binary Search (Lower Bound) | O(log n + k) |
| Genre Filtering | Bitmasking | O(1) per movie |
| Top-K Movie Selection | Min-Heap | O(n log k) |
| Movie Ranking | Weighted Rating Formula | O(1) per movie |

**Why these algorithms?**

- Merge Sort provides stable and efficient sorting.
- Inverted Index reduces unnecessary full-dataset searches.
- Binary Search enables faster prefix matching.
- Bitmasking makes genre checks efficient.
- Min-Heap helps select Top-K movies without sorting the entire dataset.
- Pre-sorted indexes avoid repeatedly sorting the same data.

### IMDb-Style Weighted Rating

CineRank uses a weighted rating formula to calculate movie rankings:

\[
WR = \frac{v}{v+m}R + \frac{m}{v+m}C
\]

Where:

- `R` = Movie's average rating
- `v` = Number of votes for the movie
- `m` = Minimum votes threshold
- `C` = Mean rating across the dataset

This helps balance a movie's average rating with the number of votes it has received.

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| HTML5 | Application structure |
| CSS3 | Styling, animations and responsive design |
| JavaScript (ES6+) | Application logic and interactivity |
| Data Structures & Algorithms | Optimized searching, sorting and ranking |
| LocalStorage | Persistent watchlist and preferences |
| CSV | External movie dataset import |
| Vercel | Application deployment |
| Git & GitHub | Version control and source code management |

**No frontend frameworks or build tools are required.**

---

## 📂 Dataset Information

CineRank comes with a generated sample dataset containing **3,200 movie records**, stored in:

`js/data.js`

Users can also import their own CSV files using the built-in **Import CSV** feature.

Supported dataset examples:

- IMDb Top 1000 Movies
- Netflix Movies and TV Shows

The application automatically detects supported column names, including:

| Field | Supported Columns |
|---|---|
| Title | `title`, `Series_Title` |
| Year | `year`, `Released_Year`, `release_year` |
| Genre | `genre`, `listed_in` |
| Rating | `rating`, `IMDB_Rating`, `imdb_score` |
| Votes | `votes`, `No_of_Votes` |
| Runtime | `runtime`, `duration` |
| Language | `language` |
| Platform | `platform` |

Invalid rows without a valid title, year, or numeric rating are skipped.

---

## 💻 Getting Started

CineRank is a lightweight frontend application. No installation or build process is needed.

### 1. Clone the Repository

```bash
git clone https://github.com/Anshika-techie/Cine-Rank.git
```

### 2. Navigate to the Project

```bash
cd Cine-Rank
```

### 3. Run the Application

**Option 1:**

Open `index.html` directly in your browser.

**Option 2: Using Python HTTP Server**

```bash
python3 -m http.server 8000
```

Open the following URL:

```text
http://localhost:8000
```

---

## 🧪 Testing

CineRank includes automated tests for its core algorithms and CSV functionality.

### Run Algorithm Tests

```bash
node tests/algorithms.test.js
```

Covers sorting, binary search, heap operations, indexing, and indexed-versus-naive search comparisons.

### Run CSV Tests

```bash
node tests/csv.test.js
```

Tests CSV parsing and automatic column detection.

### Optional End-to-End Tests

Install Playwright if required:

```bash
pip install playwright
```

Then run:

```bash
python3 tests/e2e_playwright.py
```

---

## 🗂️ Project Structure

```text
Cine-Rank/
│
├── index.html
│
├── css/
│   └── style.css
│
├── js/
│   ├── algorithms.js
│   ├── app.js
│   ├── csv.js
│   └── data.js
│
├── tests/
│   ├── algorithms.test.js
│   ├── csv.test.js
│   └── e2e_playwright.py
│
├── tools/
│   └── generate_data.py
│
└── README.md
```

### File Description

- `index.html` — Main application markup.
- `css/style.css` — Responsive design, animations and styling.
- `js/algorithms.js` — Searching, sorting, indexing, filtering and heap implementations.
- `js/app.js` — Main application controller and UI interactions.
- `js/csv.js` — CSV parsing and column detection.
- `js/data.js` — Generated sample movie dataset.
- `tests/` — Automated algorithm, CSV and browser tests.
- `tools/` — Dataset generation utility.

---

## 🎯 Project Objectives

- Apply Data Structures and Algorithms to a practical application.
- Understand the performance differences between optimized and naive approaches.
- Build an interactive and responsive frontend without external frameworks.
- Implement efficient movie searching, filtering, and ranking.
- Demonstrate the practical use of JavaScript and algorithmic problem-solving.

---

## 🔮 Future Improvements

- Integration with a live movie database API.
- User authentication and cloud-based watchlists.
- Personalized movie recommendations.
- Advanced movie comparison features.
- Additional streaming platform integrations.

---

## 👩‍💻 Developer

**Anshika-techie**

GitHub: [@Anshika-techie](https://github.com/Anshika-techie)

---

<p align="center">

  **🎬 CineRank — Making Movie Discovery Smarter!**

  Built with HTML, CSS, JavaScript and DSA.

</p>
