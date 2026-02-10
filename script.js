// ==========================================
// CONFIGURATION
// ==========================================
// 1. 請填入你的 Supabase 資訊 (從 Settings > API 複製)
const SUPABASE_URL = "https://rusnrvsoglpprwltqcnr.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1c25ydnNvZ2xwcHJ3bHRxY25yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MDU3MzUsImV4cCI6MjA4NjI4MTczNX0.Gj0iJKduA2NuwNiR7-Se7J6cza201DAiWBRkv8KyMjo";

// 2. 這是存 AI Key 的地方 (不用改)
const API_KEY_STORAGE_KEY = "geminiApiKey"; 
// ==========================================

// 初始化 Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let entries = [];
let currentMonth = new Date();
let longPressTimer = null;
let longPressTargetId = null;
let editingEntryId = null;
let targetDate = null; 
let currentUser = null;

// DOM Elements
const dateEl = document.getElementById("currentDate");
const saveBtn = document.getElementById("saveBtn");
const ccInput = document.getElementById("ccInput");
const planInput = document.getElementById("planInput");
const gratitudeInput = document.getElementById("gratitudeInput");
const noteInput = document.getElementById("noteInput");

const bottomTabButtons = document.querySelectorAll(".tab-btn");
const searchInput = document.getElementById("searchInput");
const calendarViewBtn = document.getElementById("calendarViewBtn");
const listViewBtn = document.getElementById("listViewBtn");
const calendarView = document.getElementById("calendarView");
const listView = document.getElementById("listView");
const historyList = document.getElementById("historyList");
const calendarGrid = document.getElementById("calendarGrid");
const calendarMonthLabel = document.getElementById("calendarMonthLabel");
const prevMonthBtn = document.getElementById("prevMonthBtn");
const nextMonthBtn = document.getElementById("nextMonthBtn");

const entryModal = document.getElementById("entryModal");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalCloseBtn = document.getElementById("modalCloseBtn");
const modalDateLabel = document.getElementById("modalDateLabel");
const modalEntries = document.getElementById("modalEntries");

const actionSheet = document.getElementById("actionSheet");
const actionSheetBackdrop = document.getElementById("actionSheetBackdrop");
const actionSheetButtons = document.getElementById("actionSheetButtons"); 
const cancelActionBtn = document.getElementById("cancelActionBtn");

const confirmModal = document.getElementById("confirmModal");
const confirmBackdrop = document.getElementById("confirmBackdrop");
const confirmMessage = document.getElementById("confirmMessage");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");
const confirmOkayBtn = document.getElementById("confirmOkayBtn");

const notificationBanner = document.getElementById("notificationBanner");
const notificationText = document.getElementById("notificationText");
const notificationActionBtn = document.getElementById("notificationActionBtn");
const notificationCloseBtn = document.getElementById("notificationCloseBtn");
const aiSummaryBtn = document.getElementById("aiSummaryBtn");
const loadingOverlay = document.getElementById("loadingOverlay");
const loadingText = document.getElementById("loadingText");

// Auth Elements
const authModal = document.getElementById("authModal");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const signInBtn = document.getElementById("signInBtn");
const signUpBtn = document.getElementById("signUpBtn");
const authErrorMsg = document.getElementById("authErrorMsg");
const logoutBtn = document.getElementById("logoutBtn");

// API Key Modal
const apiKeyModal = document.getElementById("apiKeyModal");
const apiKeyInput = document.getElementById("apiKeyInput");
const apiKeyCloseBtn = document.getElementById("apiKeyCloseBtn");
const saveApiKeyBtn = document.getElementById("saveApiKeyBtn");

let confirmCallback = null;
let pendingSummaryType = null;

async function init() {
  updateHeaderDate(); 
  setupEventListeners();
  setupAutoBullet();
  
  // 檢查使用者登入狀態
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
      currentUser = session.user;
      logoutBtn.classList.remove("hidden");
      authModal.style.display = "none"; // Hide auth
      await fetchEntries(); // Load data from cloud
      checkSummaryReminder();
      if (!document.getElementById('tab-history').classList.contains('tab-page-hidden')) {
        renderCalendar();
      }
  } else {
      // Show login modal
      authModal.style.display = "flex";
  }

  // 監聽登入狀態改變
  supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
          currentUser = session.user;
          logoutBtn.classList.remove("hidden");
          authModal.style.display = "none";
          await fetchEntries();
      } else {
          currentUser = null;
          entries = [];
          logoutBtn.classList.add("hidden");
          authModal.style.display = "flex";
          renderCalendar(); // clear view
          renderList();
      }
  });
}

// --- Supabase Data Logic ---
async function fetchEntries() {
    if (!currentUser) return;
    showLoading(true, "Syncing...");
    
    // 從 Supabase 抓取資料，按時間倒序
    const { data, error } = await supabase
        .from('entries')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching entries:', error);
        alert('Failed to sync data.');
    } else {
        entries = data || [];
        renderCalendar();
        renderList(searchInput.value.toLowerCase());
    }
    showLoading(false);
}

async function saveEntryToCloud(entry) {
    if (!currentUser) return;
    
    // 轉換成 snake_case 對應資料庫欄位
    const dbEntry = {
        user_id: currentUser.id,
        created_at: new Date(entry.createdAt).toISOString(),
        date_key: entry.dateKey,
        type: entry.type || 'daily',
        chief_complaint: entry.chiefComplaint,
        plan: entry.plan,
        gratitude: entry.gratitude,
        note: entry.note,
        title: entry.title,
        summary_type: entry.summaryType
    };

    // 如果有 ID 代表是更新 (但我們通常用 created_at 或是另外存 id)
    // 這裡我們簡單點，直接 insert 新的，如果是編輯則用 update
    // 為了配合原本邏輯，我們檢查 entry.id (如果是新建的，是 Date.now() 字串)
    // 但 Supabase 的 id 是 int，所以我們需要一個映射。
    // 這裡改寫邏輯：我們把 id 留空讓 Supabase 自動生成，
    // 或是如果我們在編輯，我們需要知道 Supabase 的 id。
    
    // **修正策略**：
    // 為了讓本地邏輯最小變動，我們在 fetchEntries 時，會拿到 Supabase 的 id。
    // 在 save 時，如果 entry 有 id (且是數字)，則 Update。否則 Insert。
    
    const isUpdate = typeof entry.id === 'number'; 
    
    let error;
    if (isUpdate) {
        const { error: updateError } = await supabase
            .from('entries')
            .update(dbEntry)
            .eq('id', entry.id);
        error = updateError;
    } else {
        const { data, error: insertError } = await supabase
            .from('entries')
            .insert([dbEntry])
            .select(); // 回傳新建的資料以取得 ID
        
        if (data && data.length > 0) {
            // 更新本地 entry 的 id，這樣下次就知道是編輯了
            entry.id = data[0].id; 
        }
        error = insertError;
    }

    if (error) {
        console.error('Error saving:', error);
        alert('Failed to save to cloud.');
    } else {
        // Success
        await fetchEntries(); // Refresh local list to be sure
    }
}

async function deleteEntryFromCloud(id) {
    if (!currentUser) return;
    const { error } = await supabase
        .from('entries')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting:', error);
        alert('Failed to delete.');
    } else {
        await fetchEntries();
    }
}

// --- Auth Logic ---
async function handleSignIn() {
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) return showAuthError("Please fill all fields.");
    
    showLoading(true, "Signing in...");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    showLoading(false);
    
    if (error) showAuthError(error.message);
}

async function handleSignUp() {
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) return showAuthError("Please fill all fields.");
    
    showLoading(true, "Creating account...");
    const { data, error } = await supabase.auth.signUp({ email, password });
    showLoading(false);
    
    if (error) {
        showAuthError(error.message);
    } else {
        alert("Registration successful! You are logged in.");
    }
}

async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Error logging out:', error);
}

function showAuthError(msg) {
    authErrorMsg.textContent = msg;
}

// --- Notification Logic ---
function checkSummaryReminder() {
    const today = new Date();
    const dayOfWeek = today.getDay(); 
    const date = today.getDate();
    const tomorrow = new Date(today); tomorrow.setDate(date + 1);
    const isLastDayOfMonth = tomorrow.getDate() === 1;

    let msg = "";
    let type = "";

    if (isLastDayOfMonth) {
        msg = "It's the end of the month! Create a Monthly Summary?";
        type = "monthly";
    } else if (dayOfWeek === 5) {
        msg = "Happy Friday! Time for a Weekly Summary?";
        type = "weekly";
    }

    if (msg) {
        const todayKey = toDateKey(today);
        const alreadySummarized = entries.some(e => e.date_key === todayKey && e.type === 'summary');
        if (!alreadySummarized) {
            notificationText.textContent = msg;
            notificationBanner.classList.remove("hidden");
            notificationActionBtn.onclick = () => {
                notificationBanner.classList.add("hidden");
                handleAISummary(type);
            };
        }
    }
}

// --- Standard App Logic (Adapted for Cloud Data Structure) ---
// Note: entry properties are now snake_case from DB: chief_complaint, date_key, etc.

function isFutureDate(dateObj) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateObj);
    target.setHours(0, 0, 0, 0);
    return target > today;
}

function isPastDate(dateObj) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateObj);
    target.setHours(0, 0, 0, 0);
    return target < today;
}

function updateHeaderDate() {
    const displayDate = targetDate ? targetDate : new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    if(dateEl) {
        dateEl.textContent = displayDate.toLocaleDateString('en-US', options);
        if (targetDate && isPastDate(targetDate)) {
            dateEl.classList.add('editing-past');
            dateEl.textContent += " (Writing Past)";
        } else {
            dateEl.classList.remove('editing-past');
        }
    }
}

function setupAutoBullet() {
    const bulletFields = [planInput, gratitudeInput];
    bulletFields.forEach(field => {
        field.addEventListener('focus', () => { if (field.value.trim() === "") field.value = "• "; });
        field.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const start = field.selectionStart;
                const value = field.value;
                field.value = value.substring(0, start) + "\n• " + value.substring(field.selectionEnd);
                field.selectionStart = field.selectionEnd = start + 3;
            }
        });
        field.addEventListener('blur', () => { if (field.value.trim() === "•") field.value = ""; });
    });
}

function formatToBullets(text) {
    if (!text) return '-';
    const lines = text.split('\n').filter(line => line.trim() !== "" && line.trim() !== "•");
    if (lines.length === 0) return '-';
    let html = '<ul class="bullet-list">';
    lines.forEach(line => {
        const cleanText = line.replace(/^[•\s*·-]+/, '').trim();
        if (cleanText) html += `<li class="bullet-item">${cleanText}</li>`;
    });
    html += '</ul>';
    return html;
}

// API Key
function getApiKey() { return localStorage.getItem(API_KEY_STORAGE_KEY); }
function promptForApiKey() { apiKeyInput.value = ""; apiKeyModal.classList.remove("hidden"); }
function handleSaveApiKey() {
    const key = apiKeyInput.value.trim();
    if (key) {
        localStorage.setItem(API_KEY_STORAGE_KEY, key);
        apiKeyModal.classList.add("hidden");
        if (pendingSummaryType) { handleAISummary(pendingSummaryType); pendingSummaryType = null; }
        else { handleAISummary(); }
    } else { alert("Please enter a valid API Key."); }
}

// AI Summary
async function handleAISummary(forcedType = null) {
    const apiKey = getApiKey();
    if (!apiKey) { pendingSummaryType = forcedType; promptForApiKey(); return; }

    let summaryType = forcedType;
    if (!summaryType) {
        const today = new Date();
        const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
        const isMonthEnd = tomorrow.getDate() === 1;
        summaryType = isMonthEnd ? 'monthly' : 'weekly';
    }

    const today = new Date();
    let startDate = new Date();
    let title = "";
    if (summaryType === 'weekly') {
        startDate.setDate(today.getDate() - 6);
        title = `Weekly Summary (${toDateKey(startDate)} ~ ${toDateKey(today)})`;
    } else {
        startDate.setDate(1);
        title = `Monthly Summary (${today.toLocaleString('default', {month:'long'})})`;
    }

    // Filter cloud entries
    const targetEntries = entries.filter(e => {
        const d = new Date(e.created_at);
        return d >= startDate && d <= today && e.type !== 'summary';
    });

    if (targetEntries.length === 0) { alert("No entries found for this period."); return; }

    let promptData = targetEntries.map(e => `
Date: ${e.date_key}
Chief Complaint: ${e.chief_complaint || ''}
Plan: ${e.plan || ''}
Gratitude: ${e.gratitude || ''}
Note: ${e.note || ''}
----------------`).join("\n");

    const prompt = `You are a helpful life coach. Summarize these notes for a ${summaryType} review. 
    Focus on key challenges, gratitude themes, and progress. Encouraging tone, bullet points.
    ${promptData}`;

    showLoading(true, "Gemini is thinking...");
    try {
        const summaryText = await callGeminiAPI(prompt, apiKey);
        // Save Summary to Cloud
        const newSummary = {
            createdAt: Date.now(),
            dateKey: toDateKey(today),
            type: 'summary',
            summaryType: summaryType,
            title: title,
            note: summaryText
        };
        await saveEntryToCloud(newSummary);
        switchTab('tab-history');
        alert("Summary Generated!");
    } catch (error) {
        console.error(error);
        if (error.message.includes("403")) {
             alert("Invalid API Key."); localStorage.removeItem(API_KEY_STORAGE_KEY); promptForApiKey();
        } else { alert("Failed to generate summary."); }
    } finally { showLoading(false); }
}

async function callGeminiAPI(prompt, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

// Modals
function showConfirmModal(message, isDangerous, callback) {
    confirmMessage.textContent = message;
    confirmCallback = callback;
    if (isDangerous) {
        confirmOkayBtn.className = "action-sheet-btn action-sheet-btn-danger";
        confirmOkayBtn.textContent = "Delete";
    } else {
        confirmOkayBtn.className = "btn-primary";
        confirmOkayBtn.style.marginTop = "0"; confirmOkayBtn.style.boxShadow = "none";
        confirmOkayBtn.textContent = "Confirm";
    }
    confirmModal.classList.remove("hidden");
}
function closeConfirmModal() { confirmModal.classList.add("hidden"); confirmCallback = null; }
function showLoading(show, text = "Loading...") {
    if (show) { loadingText.textContent = text; loadingOverlay.classList.remove("hidden"); }
    else { loadingOverlay.classList.add("hidden"); }
}

// Event Listeners
function setupEventListeners() {
  saveBtn.addEventListener("click", handleSave);
  bottomTabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      if (targetId === 'tab-write' && !editingEntryId) {
          targetDate = null; updateHeaderDate(); clearInputs(); saveBtn.textContent = "Save";
      }
      switchTab(targetId);
    });
  });
  calendarViewBtn.addEventListener("click", () => toggleView("calendar"));
  listViewBtn.addEventListener("click", () => toggleView("list"));
  prevMonthBtn.addEventListener("click", () => changeMonth(-1));
  nextMonthBtn.addEventListener("click", () => changeMonth(1));
  searchInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    if (term.length > 0) toggleView("list");
    renderList(term);
  });
  modalCloseBtn.addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", closeModal);
  cancelActionBtn.addEventListener("click", closeActionSheet);
  actionSheetBackdrop.addEventListener("click", closeActionSheet);
  notificationCloseBtn.addEventListener("click", () => notificationBanner.classList.add("hidden"));
  aiSummaryBtn.addEventListener("click", () => handleAISummary());
  confirmBackdrop.addEventListener("click", closeConfirmModal);
  confirmCancelBtn.addEventListener("click", closeConfirmModal);
  confirmOkayBtn.addEventListener("click", () => { if (confirmCallback) confirmCallback(); closeConfirmModal(); });
  apiKeyCloseBtn.addEventListener("click", () => apiKeyModal.classList.add("hidden"));
  saveApiKeyBtn.addEventListener("click", handleSaveApiKey);
  
  // Auth Listeners
  signInBtn.addEventListener("click", handleSignIn);
  signUpBtn.addEventListener("click", handleSignUp);
  logoutBtn.addEventListener("click", handleLogout);
}

function switchTab(tabId) {
  document.querySelectorAll(".tab-page").forEach(p => p.classList.add("tab-page-hidden"));
  document.getElementById(tabId).classList.remove("tab-page-hidden");
  bottomTabButtons.forEach(b => b.classList.remove("tab-btn-active"));
  document.querySelector(`[data-target="${tabId}"]`).classList.add("tab-btn-active");
  if (tabId === "tab-history") { toggleView("list"); }
}

function closeModal() { entryModal.classList.add("hidden"); }
function closeActionSheet() { actionSheet.classList.add("hidden"); longPressTargetId = null; }

async function handleSave() {
  const cc = ccInput.value.trim();
  const plan = planInput.value.trim();
  const gratitude = gratitudeInput.value.trim();
  const note = noteInput.value.trim();

  if (!cc && !plan && !gratitude && !note) return alert("Please fill in at least one field.");

  const now = targetDate ? new Date(targetDate) : new Date();
  if (!targetDate) now.setHours(new Date().getHours(), new Date().getMinutes());
  else now.setHours(12, 0, 0);

  const entryData = {
      createdAt: now.getTime(),
      dateKey: toDateKey(now),
      type: 'daily',
      chiefComplaint: cc,
      plan: plan,
      gratitude: gratitude,
      note: note
  };

  if (editingEntryId) {
      entryData.id = editingEntryId; // for update
  }

  showLoading(true, "Saving...");
  await saveEntryToCloud(entryData);
  showLoading(false);
  
  clearInputs();
  targetDate = null;
  editingEntryId = null;
  updateHeaderDate();
  saveBtn.textContent = "Save";
  alert("Saved!");
}

function clearInputs() { ccInput.value = ""; planInput.value = ""; gratitudeInput.value = ""; noteInput.value = ""; }
function toggleView(view) {
  if (view === "calendar") {
    calendarView.classList.remove("list-view-hidden"); listView.classList.add("list-view-hidden");
    calendarViewBtn.classList.add("toggle-btn-active"); listViewBtn.classList.remove("toggle-btn-active");
    renderCalendar();
  } else {
    calendarView.classList.add("list-view-hidden"); listView.classList.remove("list-view-hidden");
    calendarViewBtn.classList.remove("toggle-btn-active"); listViewBtn.classList.add("toggle-btn-active");
    renderList(searchInput.value.toLowerCase());
  }
}

function renderCalendar() {
  calendarGrid.innerHTML = "";
  const y = currentMonth.getFullYear();
  const m = currentMonth.getMonth();
  calendarMonthLabel.textContent = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  for (let i = 0; i < firstDay; i++) calendarGrid.appendChild(document.createElement("div"));
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dateObj = new Date(y, m, d);
    // Cloud entries use date_key
    const hasEntry = entries.some(e => e.date_key === dateStr && e.type !== 'summary');
    const cell = document.createElement("div");
    cell.className = `calendar-cell ${hasEntry ? 'calendar-cell-has-entry' : 'calendar-cell-empty'}`;
    if (isFutureDate(dateObj)) cell.style.opacity = "0.5";
    cell.innerHTML = `<div class="calendar-cell-inner">${d}</div>`;
    const inner = cell.querySelector('.calendar-cell-inner');
    inner.addEventListener("click", () => openDateModal(dateStr));
    if (!isFutureDate(dateObj)) addLongPressEvent(inner, dateStr, 'date');
    calendarGrid.appendChild(cell);
  }
}

function changeMonth(delta) { currentMonth.setMonth(currentMonth.getMonth() + delta); renderCalendar(); }

function renderList(filterText = "") {
  historyList.innerHTML = "";
  // Already sorted by fetch
  const filtered = entries.filter(e => {
    const content = e.type === 'summary' 
        ? (e.title + e.note).toLowerCase()
        : (e.chief_complaint + (e.plan||'') + (e.gratitude||'') + (e.note||'')).toLowerCase();
    return content.includes(filterText);
  });

  if (filtered.length === 0) { historyList.innerHTML = "<div class='no-data-msg'>No records.</div>"; return; }
  
  filtered.forEach(e => {
    const item = document.createElement("div");
    const dateStr = new Date(e.created_at).toLocaleDateString();

    if (e.type === 'summary') {
        item.className = "history-item history-item-summary";
        item.innerHTML = `
            <div class="history-item-header">
                <div>
                    <div class="history-item-date">${dateStr} • AI Generated</div>
                    <div class="history-item-title">✨ ${e.title}</div>
                </div>
                <div class="history-item-expand-icon">▼</div>
            </div>
            <div class="history-item-details"><div class="summary-content">${e.note}</div></div>`;
    } else {
        item.className = "history-item";
        item.innerHTML = `
            <div class="history-item-header">
                <div>
                    <div class="history-item-date">${dateStr}</div>
                    <div class="history-item-title">${e.chief_complaint || 'Progress Note'}</div>
                </div>
                <div class="history-item-expand-icon">▼</div>
            </div>
            <div class="history-item-details">
                <strong>Plan</strong>${formatToBullets(e.plan)}
                <strong>Gratitude</strong>${formatToBullets(e.gratitude)}
                <strong>Note</strong><p>${e.note || '-'}</p>
            </div>`;
    }
    item.addEventListener("click", () => item.classList.toggle("expanded"));
    addLongPressEvent(item, e.id, 'item');
    historyList.appendChild(item);
  });
}

function addLongPressEvent(el, idOrDate, type) {
  el.addEventListener("touchstart", () => longPressTimer = setTimeout(() => handleLongPress(idOrDate, type), 600), {passive: true});
  el.addEventListener("touchend", () => clearTimeout(longPressTimer));
  el.addEventListener("touchmove", () => clearTimeout(longPressTimer));
  el.addEventListener("mousedown", () => longPressTimer = setTimeout(() => handleLongPress(idOrDate, type), 600));
  el.addEventListener("mouseup", () => clearTimeout(longPressTimer));
}

function handleLongPress(idOrDate, type) {
    if (type === 'item') {
        longPressTargetId = idOrDate;
        const entry = entries.find(e => e.id === idOrDate);
        actionSheetButtons.innerHTML = ""; 
        
        if (entry && entry.type === 'summary') {
            const regenBtn = document.createElement("button");
            regenBtn.className = "action-sheet-btn action-sheet-btn-primary";
            regenBtn.textContent = "Summarize Again";
            regenBtn.onclick = regenerateSummary;
            actionSheetButtons.appendChild(regenBtn);
        } else {
            const editBtn = document.createElement("button");
            editBtn.className = "action-sheet-btn";
            editBtn.textContent = "Edit";
            editBtn.onclick = handleEditEntry;
            actionSheetButtons.appendChild(editBtn);
        }
        const delBtn = document.createElement("button");
        delBtn.className = "action-sheet-btn action-sheet-btn-danger";
        delBtn.textContent = "Delete";
        delBtn.onclick = () => { closeActionSheet(); showConfirmModal("Delete this entry?", true, executeDeleteEntry); };
        actionSheetButtons.appendChild(delBtn);

        actionSheet.classList.remove("hidden");
        if (navigator.vibrate) navigator.vibrate(50);
    } else if (type === 'date') {
        const hasData = entries.some(e => e.date_key === idOrDate && e.type !== 'summary');
        if (hasData) openDateModal(idOrDate);
        else showConfirmModal(`Create entry for ${idOrDate}?`, false, () => startNewEntryForDate(idOrDate));
    }
}

async function regenerateSummary() {
    closeActionSheet();
    const entry = entries.find(e => e.id === longPressTargetId);
    if (!entry) return;
    await deleteEntryFromCloud(entry.id);
    await handleAISummary(entry.summary_type);
}

async function executeDeleteEntry() {
    showLoading(true, "Deleting...");
    await deleteEntryFromCloud(longPressTargetId);
    showLoading(false);
    
    // Refresh modal if open
    if (!entryModal.classList.contains("hidden")) {
         const entry = entries.find(e => e.id === longPressTargetId); 
         if(entry) openDateModal(entry.date_key); else closeModal(); 
    }
}

function handleEditEntry() {
  const entry = entries.find(e => e.id === longPressTargetId);
  if (entry) {
    ccInput.value = entry.chief_complaint || "";
    planInput.value = entry.plan || "";
    gratitudeInput.value = entry.gratitude || "";
    noteInput.value = entry.note || "";
    editingEntryId = entry.id;
    targetDate = new Date(entry.created_at);
    updateHeaderDate();
    saveBtn.textContent = isPastDate(targetDate) ? "Save Past Entry" : "Save";
    closeActionSheet(); closeModal(); switchTab("tab-write");
  }
}

function startNewEntryForDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    targetDate = new Date(y, m - 1, d);
    updateHeaderDate(); clearInputs();
    saveBtn.textContent = isPastDate(targetDate) ? "Save Past Entry" : "Save";
    closeModal(); switchTab("tab-write");
}

function openDateModal(dateKey) {
  modalDateLabel.textContent = dateKey;
  modalEntries.innerHTML = "";
  const daysEntries = entries.filter(e => e.date_key === dateKey && e.type !== 'summary');
  if (daysEntries.length === 0) {
      modalEntries.innerHTML = `<div class="no-data-msg">No records.</div>${!isFutureDate(new Date(dateKey.split('-')[0], dateKey.split('-')[1]-1, dateKey.split('-')[2])) ? `<button id="addPastEntryBtn" class="btn-secondary">Create Entry</button>` : ''}`;
      setTimeout(() => { const btn = document.getElementById("addPastEntryBtn"); if(btn) btn.addEventListener("click", () => startNewEntryForDate(dateKey)); }, 0);
  } else {
      daysEntries.forEach(e => {
        const div = document.createElement("div"); div.className = "history-item"; 
        div.innerHTML = `<div class="history-item-date">Entry</div><div class="history-item-title">${e.chief_complaint || '-'}</div><div class="history-item-details" style="display:block; margin-top:8px; border:none;"><strong>Plan</strong>${formatToBullets(e.plan)}<strong>Gratitude</strong>${formatToBullets(e.gratitude)}<strong>Note</strong><p>${e.note || '-'}</p></div>`;
        addLongPressEvent(div, e.id, 'item'); modalEntries.appendChild(div);
      });
  }
  entryModal.classList.remove("hidden");
}

function toDateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

init();