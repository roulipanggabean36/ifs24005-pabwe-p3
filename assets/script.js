/**
 * DompetKu — Praktikum 3 PABWE (JavaScript)
 * Fitur: Tab switcher, Expense Tracker, Bookmark Manager, Quiz App
 * Semua data disimpan di localStorage (key berbeda per fitur).
 */
"use strict";

/* =====================================================================
   1. UTILITAS UMUM
   ===================================================================== */

/** Ambil satu elemen; lempar error jika tidak ada (membantu debug DOM) */
function $(selector, root = document) {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`Elemen tidak ditemukan: ${selector}`);
  return el;
}

function $all(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

/** Buat elemen dengan class dan teks (textContent aman dari injeksi HTML) */
function h(tag, className = "", text = "") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

/** ID unik untuk tiap item */
function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Baca array dari localStorage.
 * Data rusak / tidak sesuai bentuk (isValid) dibuang agar aplikasi tidak error.
 */
function loadList(key, isValid = () => true) {
  try {
    const data = JSON.parse(localStorage.getItem(key));
    if (!Array.isArray(data)) return [];
    return data.filter((item) => item && typeof item === "object" && isValid(item));
  } catch {
    return [];
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* penyimpanan penuh / diblokir: abaikan agar aplikasi tetap jalan */
  }
}

/** Tampilkan / sembunyikan pesan error pada form */
function showError(el, message) {
  el.classList.remove("hidden");
  el.innerHTML = "";
  el.append(h("i", "ti ti-alert-circle text-lg shrink-0"), h("span", "", message));
}

function clearError(el) {
  el.classList.add("hidden");
  el.textContent = "";
}

/** Isi <select> dari array string */
function fillOptions(select, values, firstLabel = null) {
  select.innerHTML = "";
  if (firstLabel) select.append(new Option(firstLabel, "all"));
  values.forEach((v) => select.append(new Option(v, v)));
}

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 2,
});

function formatDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Tanggal hari ini (zona waktu lokal) format YYYY-MM-DD */
function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/* Key localStorage — dibedakan per fitur agar data tidak saling menimpa */
const KEYS = {
  tab: "dompetku-p3-active-tab",
  expenses: "dompetku-p3-expenses",
  bookmarks: "dompetku-p3-bookmarks",
  quizHigh: "dompetku-p3-quiz-highscore",
};

/* =====================================================================
   2. MODAL (dipakai bersama oleh semua fitur)
   ===================================================================== */

const modalDelete = $("#modal-delete");
const deleteConfirm = $("#delete-confirm");
let pendingDelete = null; // fungsi yang dijalankan saat hapus dikonfirmasi

function openModal(modal) {
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.body.classList.add("overflow-hidden");
  const first = modal.querySelector("input, select, #delete-confirm");
  if (first) first.focus();
}

function closeModal(modal) {
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  if (modal === modalDelete) pendingDelete = null;
  // Kunci scroll baru dilepas jika tidak ada modal lain yang terbuka
  if (!$all("[data-modal]").some((m) => !m.classList.contains("hidden"))) {
    document.body.classList.remove("overflow-hidden");
  }
}

/** Buka modal konfirmasi hapus untuk item tertentu */
function askDelete(heading, label, onConfirm) {
  $("#delete-heading").textContent = heading;
  $("#delete-label").textContent = `"${label}"`;
  pendingDelete = onConfirm;
  openModal(modalDelete);
}

deleteConfirm.addEventListener("click", () => {
  const action = pendingDelete;
  closeModal(modalDelete);
  if (action) action();
});

// Tutup lewat backdrop, tombol X, atau tombol Batal (semua punya atribut data-close)
$all("[data-modal]").forEach((modal) => {
  modal.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) closeModal(modal);
  });
});

// Tombol Escape menutup semua modal yang terbuka
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  $all("[data-modal]").forEach((m) => {
    if (!m.classList.contains("hidden")) closeModal(m);
  });
});

/* =====================================================================
   3. TAB SWITCHER
   ===================================================================== */

const tabButtons = $all(".tab-btn");
const panels = {
  expense: $("#panel-expense"),
  bookmark: $("#panel-bookmark"),
  quiz: $("#panel-quiz"),
};

const ACTIVE_CLASSES = ["bg-indigo-700", "text-white", "shadow"];
const INACTIVE_CLASSES = ["text-slate-600", "hover:bg-slate-100"];

/** Tampilkan satu panel saja, tandai tombol aktif, simpan pilihan */
function switchTab(name) {
  if (!panels[name]) name = "expense";

  Object.entries(panels).forEach(([key, panel]) => {
    panel.classList.toggle("hidden", key !== name);
  });

  tabButtons.forEach((btn) => {
    const active = btn.dataset.tab === name;
    btn.setAttribute("aria-selected", String(active));
    ACTIVE_CLASSES.forEach((c) => btn.classList.toggle(c, active));
    INACTIVE_CLASSES.forEach((c) => btn.classList.toggle(c, !active));
  });

  try {
    localStorage.setItem(KEYS.tab, name);
  } catch {
    /* abaikan */
  }
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

/* =====================================================================
   4. EXPENSE TRACKER
   ===================================================================== */

const CATEGORIES = [
  "Makanan", "Transportasi", "Belanja", "Tagihan",
  "Pendidikan", "Hiburan", "Gaji", "Lainnya",
];

/** Pastikan data transaksi dari localStorage punya bentuk yang benar */
function isValidTransaction(t) {
  return (
    typeof t.id === "string" &&
    typeof t.title === "string" &&
    typeof t.category === "string" &&
    (t.type === "Pemasukan" || t.type === "Pengeluaran") &&
    Number.isFinite(t.amount) &&
    typeof t.date === "string" &&
    Number.isFinite(t.createdAt)
  );
}

let transactions = loadList(KEYS.expenses, isValidTransaction);
let editingExpenseId = null;

// Form tambah
const expenseForm = $("#expense-form");
const expenseFields = {
  title: $("#expense-title"),
  amount: $("#expense-amount"),
  type: $("#expense-type"),
  category: $("#expense-category"),
  date: $("#expense-date"),
};
const expenseError = $("#expense-error");

// Form ubah (modal)
const modalExpense = $("#modal-expense");
const editExpenseForm = $("#edit-expense-form");
const editExpenseFields = {
  title: $("#edit-expense-title"),
  amount: $("#edit-expense-amount"),
  type: $("#edit-expense-type"),
  category: $("#edit-expense-category"),
  date: $("#edit-expense-date"),
};
const editExpenseError = $("#edit-expense-error");

// Pencarian, filter, sort, tampilan
const expenseSearch = $("#expense-search");
const expenseFilterType = $("#expense-filter-type");
const expenseFilterCategory = $("#expense-filter-category");
const expenseSort = $("#expense-sort");
const expenseList = $("#expense-list");
const expenseEmpty = $("#expense-empty");

fillOptions(expenseFields.category, CATEGORIES);
fillOptions(editExpenseFields.category, CATEGORIES);
fillOptions(expenseFilterCategory, CATEGORIES, "Semua kategori");
expenseFields.date.value = today();

function saveTransactions() {
  saveJSON(KEYS.expenses, transactions);
}

/**
 * Baca + validasi field transaksi.
 * Mengembalikan { error } jika tidak valid, atau { data } jika valid.
 */
function readTransaction(fields) {
  const title = fields.title.value.trim();
  const category = fields.category.value;
  const type = fields.type.value;
  const date = fields.date.value;
  const rawAmount = fields.amount.value.trim();

  if (!title) return { error: "Judul transaksi wajib diisi." };
  if (!category) return { error: "Pilih kategori transaksi." };
  if (!rawAmount) return { error: "Jumlah wajib diisi." };

  const amount = Number(rawAmount);
  if (!Number.isFinite(amount)) return { error: "Jumlah harus berupa angka yang valid." };
  if (amount <= 0) return { error: "Jumlah harus lebih dari 0." };
  if (!date) return { error: "Tanggal wajib diisi." };

  return { data: { title, category, type, amount, date } };
}

/** Hitung dan tampilkan total pemasukan, pengeluaran, dan saldo */
function renderSummary() {
  const sum = (type) =>
    transactions.filter((t) => t.type === type).reduce((acc, t) => acc + t.amount, 0);
  const income = sum("Pemasukan");
  const expense = sum("Pengeluaran");
  const balance = income - expense;

  $("#sum-income").textContent = rupiah.format(income);
  $("#sum-expense").textContent = rupiah.format(expense);
  const balanceEl = $("#sum-balance");
  balanceEl.textContent = rupiah.format(balance);
  balanceEl.classList.toggle("text-rose-700", balance < 0);
  balanceEl.classList.toggle("text-indigo-900", balance >= 0);
}

/** Filter + sort, lalu bangun ulang daftar lewat DOM */
function renderExpenses() {
  renderSummary();

  const query = expenseSearch.value.trim().toLowerCase();
  const typeFilter = expenseFilterType.value;
  const categoryFilter = expenseFilterCategory.value;

  let items = transactions.filter(
    (t) =>
      t.title.toLowerCase().includes(query) &&
      (typeFilter === "all" || t.type === typeFilter) &&
      (categoryFilter === "all" || t.category === categoryFilter)
  );

  items = [...items].sort((a, b) => {
    switch (expenseSort.value) {
      case "oldest":
        return a.date.localeCompare(b.date) || a.createdAt - b.createdAt;
      case "amount-desc":
        return b.amount - a.amount;
      case "amount-asc":
        return a.amount - b.amount;
      case "newest":
      default:
        return b.date.localeCompare(a.date) || b.createdAt - a.createdAt;
    }
  });

  // Empty state jika belum ada data sama sekali
  const noData = transactions.length === 0;
  expenseEmpty.classList.toggle("hidden", !noData);
  expenseList.classList.toggle("hidden", noData);
  expenseList.innerHTML = "";
  if (noData) return;

  // Tidak ada hasil untuk pencarian / filter
  if (items.length === 0) {
    expenseList.append(
      h("li", "rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600",
        "Tidak ada transaksi yang cocok dengan pencarian atau filter.")
    );
    return;
  }

  items.forEach((t) => {
    const isIncome = t.type === "Pemasukan";
    const li = h("li", "flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-slate-200 px-4 py-3");
    li.dataset.id = t.id;

    const info = h("div", "flex-1 min-w-0");
    info.append(h("p", "font-semibold text-slate-900 truncate", t.title));
    const meta = h("div", "mt-1 flex flex-wrap items-center gap-1.5");
    meta.append(
      h("span", `badge ${isIncome ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`, t.type),
      h("span", "badge bg-slate-100 text-slate-700", t.category),
      h("span", "text-xs text-slate-500", formatDate(t.date))
    );
    info.append(meta);

    const amount = h(
      "p",
      `font-display font-bold shrink-0 ${isIncome ? "text-emerald-700" : "text-rose-700"}`,
      `${isIncome ? "+" : "−"} ${rupiah.format(t.amount)}`
    );

    const actions = h("div", "flex items-center gap-1.5 shrink-0");
    const editBtn = h("button", "btn btn-sm btn-outline");
    editBtn.type = "button";
    editBtn.innerHTML = '<i class="ti ti-pencil"></i> Ubah';
    editBtn.addEventListener("click", () => openEditExpense(t.id));

    const delBtn = h("button", "btn btn-sm border border-rose-200 text-rose-700 hover:bg-rose-50");
    delBtn.type = "button";
    delBtn.innerHTML = '<i class="ti ti-trash"></i> Hapus';
    delBtn.addEventListener("click", () =>
      askDelete("Hapus transaksi", t.title, () => {
        transactions = transactions.filter((x) => x.id !== t.id);
        saveTransactions();
        renderExpenses();
      })
    );

    actions.append(editBtn, delBtn);
    li.append(info, amount, actions);
    expenseList.append(li);
  });
}

function openEditExpense(id) {
  const t = transactions.find((x) => x.id === id);
  if (!t) return;
  editingExpenseId = id;
  editExpenseFields.title.value = t.title;
  editExpenseFields.amount.value = t.amount;
  editExpenseFields.type.value = t.type;
  editExpenseFields.category.value = t.category;
  editExpenseFields.date.value = t.date;
  clearError(editExpenseError);
  openModal(modalExpense);
}

// Tambah transaksi
expenseForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const result = readTransaction(expenseFields);
  if (result.error) return showError(expenseError, result.error);

  clearError(expenseError);
  transactions.push({ id: uid(), createdAt: Date.now(), ...result.data });
  saveTransactions();

  // Reset form, pertahankan tipe & tanggal hari ini
  expenseFields.title.value = "";
  expenseFields.amount.value = "";
  expenseFields.date.value = today();
  renderExpenses();
  expenseFields.title.focus();
});

// Simpan perubahan dari modal
editExpenseForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const result = readTransaction(editExpenseFields);
  if (result.error) return showError(editExpenseError, result.error);

  const t = transactions.find((x) => x.id === editingExpenseId);
  if (t) {
    Object.assign(t, result.data);
    saveTransactions();
    renderExpenses();
  }
  editingExpenseId = null;
  closeModal(modalExpense);
});

[expenseSearch].forEach((el) => el.addEventListener("input", renderExpenses));
[expenseFilterType, expenseFilterCategory, expenseSort].forEach((el) =>
  el.addEventListener("change", renderExpenses)
);

/* =====================================================================
   5. BOOKMARK / LINK MANAGER
   ===================================================================== */

/** Pastikan data bookmark dari localStorage punya bentuk yang benar */
function isValidBookmark(b) {
  return (
    typeof b.id === "string" &&
    typeof b.title === "string" &&
    typeof b.url === "string" &&
    typeof b.category === "string" &&
    typeof b.note === "string" &&
    Number.isFinite(b.createdAt)
  );
}

let bookmarks = loadList(KEYS.bookmarks, isValidBookmark);
let editingBookmarkId = null;

const bookmarkForm = $("#bookmark-form");
const bookmarkFields = {
  title: $("#bookmark-title"),
  url: $("#bookmark-url"),
  category: $("#bookmark-category"),
  note: $("#bookmark-note"),
};
const bookmarkError = $("#bookmark-error");

const modalBookmark = $("#modal-bookmark");
const editBookmarkForm = $("#edit-bookmark-form");
const editBookmarkFields = {
  title: $("#edit-bookmark-title"),
  url: $("#edit-bookmark-url"),
  category: $("#edit-bookmark-category"),
  note: $("#edit-bookmark-note"),
};
const editBookmarkError = $("#edit-bookmark-error");

const bookmarkSearch = $("#bookmark-search");
const bookmarkSort = $("#bookmark-sort");
const bookmarkList = $("#bookmark-list");
const bookmarkEmpty = $("#bookmark-empty");

function saveBookmarks() {
  saveJSON(KEYS.bookmarks, bookmarks);
}

/** Validasi URL: wajib diawali http:// atau https:// dan bisa di-parse */
function isValidUrl(value) {
  if (!/^https?:\/\/\S+$/i.test(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** Baca + validasi field bookmark */
function readBookmark(fields) {
  const title = fields.title.value.trim();
  const url = fields.url.value.trim();
  const category = fields.category.value.trim();
  const note = fields.note.value.trim();

  if (!title) return { error: "Nama bookmark wajib diisi." };
  if (!url) return { error: "URL wajib diisi." };
  if (!isValidUrl(url)) {
    return { error: "URL tidak valid. Gunakan awalan http:// atau https:// (contoh: https://example.com)." };
  }
  if (!category) return { error: "Kategori / tag wajib diisi." };

  return { data: { title, url, category, note } };
}

function renderBookmarks() {
  const query = bookmarkSearch.value.trim().toLowerCase();

  let items = bookmarks.filter(
    (b) =>
      b.title.toLowerCase().includes(query) ||
      b.url.toLowerCase().includes(query) ||
      b.category.toLowerCase().includes(query)
  );

  items = [...items].sort((a, b) => {
    switch (bookmarkSort.value) {
      case "title-asc":
        return a.title.localeCompare(b.title, "id");
      case "title-desc":
        return b.title.localeCompare(a.title, "id");
      case "newest":
      default:
        return b.createdAt - a.createdAt;
    }
  });

  const noData = bookmarks.length === 0;
  bookmarkEmpty.classList.toggle("hidden", !noData);
  bookmarkList.classList.toggle("hidden", noData);
  bookmarkList.innerHTML = "";
  if (noData) return;

  if (items.length === 0) {
    bookmarkList.append(
      h("li", "rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600",
        "Tidak ada bookmark yang cocok dengan pencarian.")
    );
    return;
  }

  items.forEach((b) => {
    const li = h("li", "flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-slate-200 px-4 py-3");
    li.dataset.id = b.id;

    const info = h("div", "flex-1 min-w-0");

    // Judul = tautan yang dibuka di tab baru
    const titleLink = h("a", "font-semibold text-indigo-800 hover:underline block truncate", b.title);
    titleLink.href = b.url;
    titleLink.target = "_blank";
    titleLink.rel = "noopener noreferrer";

    const urlLink = h("a", "text-xs text-slate-500 hover:underline block truncate", b.url);
    urlLink.href = b.url;
    urlLink.target = "_blank";
    urlLink.rel = "noopener noreferrer";

    info.append(titleLink, urlLink);
    const meta = h("div", "mt-1.5 flex flex-wrap items-center gap-2");
    meta.append(h("span", "badge bg-indigo-100 text-indigo-800", b.category));
    if (b.note) meta.append(h("span", "text-xs text-slate-600", b.note));
    info.append(meta);

    const actions = h("div", "flex items-center gap-1.5 shrink-0");
    const editBtn = h("button", "btn btn-sm btn-outline");
    editBtn.type = "button";
    editBtn.innerHTML = '<i class="ti ti-pencil"></i> Ubah';
    editBtn.addEventListener("click", () => openEditBookmark(b.id));

    const delBtn = h("button", "btn btn-sm border border-rose-200 text-rose-700 hover:bg-rose-50");
    delBtn.type = "button";
    delBtn.innerHTML = '<i class="ti ti-trash"></i> Hapus';
    delBtn.addEventListener("click", () =>
      askDelete("Hapus bookmark", b.title, () => {
        bookmarks = bookmarks.filter((x) => x.id !== b.id);
        saveBookmarks();
        renderBookmarks();
      })
    );

    actions.append(editBtn, delBtn);
    li.append(info, actions);
    bookmarkList.append(li);
  });
}

function openEditBookmark(id) {
  const b = bookmarks.find((x) => x.id === id);
  if (!b) return;
  editingBookmarkId = id;
  editBookmarkFields.title.value = b.title;
  editBookmarkFields.url.value = b.url;
  editBookmarkFields.category.value = b.category;
  editBookmarkFields.note.value = b.note;
  clearError(editBookmarkError);
  openModal(modalBookmark);
}

bookmarkForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const result = readBookmark(bookmarkFields);
  if (result.error) return showError(bookmarkError, result.error);

  clearError(bookmarkError);
  bookmarks.push({ id: uid(), createdAt: Date.now(), ...result.data });
  saveBookmarks();
  bookmarkForm.reset();
  renderBookmarks();
  bookmarkFields.title.focus();
});

editBookmarkForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const result = readBookmark(editBookmarkFields);
  if (result.error) return showError(editBookmarkError, result.error);

  const b = bookmarks.find((x) => x.id === editingBookmarkId);
  if (b) {
    Object.assign(b, result.data);
    saveBookmarks();
    renderBookmarks();
  }
  editingBookmarkId = null;
  closeModal(modalBookmark);
});

bookmarkSearch.addEventListener("input", renderBookmarks);
bookmarkSort.addEventListener("change", renderBookmarks);

/* =====================================================================
   6. QUIZ APP
   ===================================================================== */

const QUIZ_TIME = 15; // detik per soal

/** Bank soal: array of object { q, options, answer (indeks opsi benar) } */
const QUESTIONS = [
  { q: "Tag HTML yang dipakai untuk membuat tautan adalah…",
    options: ["<link>", "<a>", "<href>", "<url>"], answer: 1 },
  { q: "Properti CSS untuk mengubah warna teks adalah…",
    options: ["font-color", "text-color", "color", "foreground"], answer: 2 },
  { q: "Method JavaScript untuk mengambil elemen berdasarkan id adalah…",
    options: ["getElementById()", "getElement()", "queryId()", "selectById()"], answer: 0 },
  { q: "Apa hasil dari typeof null di JavaScript?",
    options: ["\"null\"", "\"undefined\"", "\"object\"", "\"number\""], answer: 2 },
  { q: "Kata kunci untuk variabel yang tidak dapat diberi nilai ulang adalah…",
    options: ["var", "let", "static", "const"], answer: 3 },
  { q: "Method array untuk menambahkan elemen di akhir array adalah…",
    options: ["push()", "pop()", "shift()", "unshift()"], answer: 0 },
  { q: "Operator === pada JavaScript membandingkan…",
    options: ["Nilai saja", "Tipe saja", "Nilai dan tipe data", "Alamat memori"], answer: 2 },
  { q: "Method untuk mengubah objek JavaScript menjadi string JSON adalah…",
    options: ["JSON.parse()", "JSON.stringify()", "JSON.toString()", "JSON.encode()"], answer: 1 },
  { q: "Atribut HTML agar tautan terbuka di tab baru adalah…",
    options: ["target=\"_self\"", "rel=\"tab\"", "target=\"_blank\"", "open=\"new\""], answer: 2 },
  { q: "Event yang dipicu saat sebuah <form> dikirim adalah…",
    options: ["click", "submit", "change", "send"], answer: 1 },
];

// State aplikasi kuis
const quiz = {
  index: 0,          // nomor soal aktif
  score: 0,
  answered: false,   // apakah soal aktif sudah dijawab
  timeLeft: QUIZ_TIME,
  timerId: null,
  answers: [],       // indeks opsi yang dipilih user per soal (-1 = waktu habis)
  results: [],       // "benar" | "salah" | "waktu habis" per soal
};

const quizViews = {
  start: $("#quiz-start"),
  play: $("#quiz-play"),
  result: $("#quiz-result"),
};
const quizHighEl = $("#quiz-highscore");
const quizProgressLabel = $("#quiz-progress-label");
const quizLiveScore = $("#quiz-live-score");
const quizTimerText = $("#quiz-timer-text");
const quizTimerBar = $("#quiz-timer-bar");
const quizQuestion = $("#quiz-question");
const quizOptions = $("#quiz-options");
const quizFeedback = $("#quiz-feedback");
const quizNext = $("#quiz-next");

$("#quiz-total-label").textContent = String(QUESTIONS.length);
$("#quiz-time-label").textContent = String(QUIZ_TIME);

function getHighScore() {
  const v = localStorage.getItem(KEYS.quizHigh);
  return v === null ? null : Number(v);
}

function showHighScore() {
  const high = getHighScore();
  quizHighEl.textContent = high === null ? "—" : `${high} / ${QUESTIONS.length}`;
}

function showQuizView(name) {
  Object.entries(quizViews).forEach(([key, el]) => el.classList.toggle("hidden", key !== name));
}

function stopTimer() {
  if (quiz.timerId !== null) {
    clearInterval(quiz.timerId);
    quiz.timerId = null;
  }
}

function updateTimerUI() {
  quizTimerText.textContent = String(quiz.timeLeft);
  quizTimerBar.style.width = `${(quiz.timeLeft / QUIZ_TIME) * 100}%`;
  const urgent = quiz.timeLeft <= 5;
  quizTimerBar.classList.toggle("bg-rose-500", urgent);
  quizTimerBar.classList.toggle("bg-indigo-600", !urgent);
}

/** Timer per soal: berkurang tiap detik, habis = dianggap salah */
function startTimer() {
  stopTimer();
  quiz.timeLeft = QUIZ_TIME;
  updateTimerUI();
  quiz.timerId = setInterval(() => {
    // Jeda otomatis jika pengguna sedang membuka tab lain
    if (panels.quiz.classList.contains("hidden")) return;
    quiz.timeLeft -= 1;
    updateTimerUI();
    if (quiz.timeLeft <= 0) handleAnswer(-1);
  }, 1000);
}

/** Reset state lalu mulai dari soal pertama */
function startQuiz() {
  stopTimer();
  quiz.index = 0;
  quiz.score = 0;
  quiz.answered = false;
  quiz.answers = [];
  quiz.results = [];
  showQuizView("play");
  renderQuestion();
}

/** Render soal aktif berdasarkan state */
function renderQuestion() {
  const item = QUESTIONS[quiz.index];
  quiz.answered = false;

  quizProgressLabel.textContent = `Soal ${quiz.index + 1} dari ${QUESTIONS.length}`;
  quizLiveScore.textContent = String(quiz.score);
  quizQuestion.textContent = item.q;

  quizFeedback.classList.add("hidden");
  quizNext.classList.add("hidden");
  quizOptions.innerHTML = "";

  item.options.forEach((text, i) => {
    const btn = h("button",
      "quiz-option flex items-center gap-3 text-left rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium hover:border-indigo-500 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition");
    btn.type = "button";
    btn.append(
      h("span", "badge bg-slate-100 text-slate-700 shrink-0", String.fromCharCode(65 + i)),
      h("span", "", text)
    );
    btn.addEventListener("click", () => handleAnswer(i));
    quizOptions.append(btn);
  });

  startTimer();
}

/** Nilai jawaban. choice = -1 berarti waktu habis. */
function handleAnswer(choice) {
  if (quiz.answered) return;
  quiz.answered = true;
  stopTimer();

  const item = QUESTIONS[quiz.index];
  const correct = choice === item.answer;
  const timeout = choice === -1;

  if (correct) quiz.score += 1;
  quiz.answers.push(choice);
  quiz.results.push(correct ? "benar" : timeout ? "waktu habis" : "salah");
  quizLiveScore.textContent = String(quiz.score);

  // Tandai opsi benar / salah dan kunci semua tombol
  $all(".quiz-option", quizOptions).forEach((btn, i) => {
    btn.disabled = true;
    btn.classList.remove("hover:border-indigo-500", "hover:bg-indigo-50");
    if (i === item.answer) {
      btn.classList.replace("border-slate-300", "border-emerald-500");
      btn.classList.replace("bg-white", "bg-emerald-50");
    } else if (i === choice) {
      btn.classList.replace("border-slate-300", "border-rose-500");
      btn.classList.replace("bg-white", "bg-rose-50");
    } else {
      btn.classList.add("opacity-60");
    }
  });

  // Feedback singkat
  const answerText = item.options[item.answer];
  const message = correct
    ? "Benar! Jawabanmu tepat."
    : timeout
      ? `Waktu habis. Jawaban yang benar: ${answerText}`
      : `Kurang tepat. Jawaban yang benar: ${answerText}`;
  quizFeedback.className = `alert-box ${
    correct ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"
  }`;
  quizFeedback.innerHTML = "";
  quizFeedback.append(
    h("i", `ti ${correct ? "ti-circle-check" : "ti-circle-x"} text-lg shrink-0`),
    h("span", "", message)
  );

  const isLast = quiz.index === QUESTIONS.length - 1;
  quizNext.innerHTML = isLast
    ? 'Lihat hasil <i class="ti ti-flag-check"></i>'
    : 'Soal berikutnya <i class="ti ti-arrow-right"></i>';
  quizNext.classList.remove("hidden");
  quizNext.focus();
}

quizNext.addEventListener("click", () => {
  if (!quiz.answered) return;
  quiz.index += 1;
  if (quiz.index >= QUESTIONS.length) finishQuiz();
  else renderQuestion();
});

/** Tampilkan skor akhir dan perbarui skor terbaik */
function finishQuiz() {
  stopTimer();
  showQuizView("result");

  const total = QUESTIONS.length;
  $("#quiz-final-score").textContent = `${quiz.score} / ${total}`;

  const previous = getHighScore();
  let message;
  if (previous === null || quiz.score > previous) {
    localStorage.setItem(KEYS.quizHigh, String(quiz.score));
    message = previous === null
      ? "Skor pertamamu tersimpan sebagai skor terbaik."
      : `Rekor baru! Skor terbaik sebelumnya ${previous} / ${total}.`;
  } else {
    message = `Skor terbaikmu masih ${previous} / ${total}. Coba lagi untuk melampauinya.`;
  }
  $("#quiz-final-message").textContent = message;

  // Ringkasan jumlah benar / salah / waktu habis
  const count = (label) => quiz.results.filter((r) => r === label).length;
  const stats = [
    ["Benar", count("benar"), "bg-emerald-50 text-emerald-800 border-emerald-200"],
    ["Salah", count("salah"), "bg-rose-50 text-rose-800 border-rose-200"],
    ["Waktu habis", count("waktu habis"), "bg-amber-50 text-amber-800 border-amber-200"],
  ];
  const statsEl = $("#quiz-stats");
  statsEl.innerHTML = "";
  stats.forEach(([label, value, style]) => {
    const li = h("li", `rounded-xl border px-3 py-2 ${style}`);
    li.append(h("p", "font-display text-xl font-bold", String(value)), h("p", "text-xs", label));
    statsEl.append(li);
  });

  showHighScore();
}

$("#quiz-start-btn").addEventListener("click", startQuiz);
$("#quiz-retry").addEventListener("click", startQuiz);

/* =====================================================================
   7. INISIALISASI
   ===================================================================== */

renderExpenses();
renderBookmarks();
showHighScore();
showQuizView("start");

// Pulihkan tab terakhir yang dibuka (default: expense)
let savedTab = "expense";
try {
  savedTab = localStorage.getItem(KEYS.tab) || "expense";
} catch {
  /* abaikan */
}
switchTab(savedTab);