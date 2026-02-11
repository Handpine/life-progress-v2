console.log("Script Started - Vibe Coding!"); 

const STORAGE_KEY = "lifeProgressEntries";
const API_KEY_STORAGE = "geminiApiKey";
const SB_URL_STORAGE = "sbUrl";
const SB_KEY_STORAGE = "sbKey";

let entries = [];
let currentMonth = new Date();
let longPressTimer = null;
let longPressTargetId = null;
let editingEntryId = null;
let targetDate = null; 
let supabaseClient = null; 
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
const editEntryBtn = document.getElementById("editEntryBtn");
const deleteEntryBtn = document.getElementById("deleteEntryBtn");
const cancelActionBtn = document.getElementById("cancelActionBtn");
const regenerateAiBtn = document.getElementById("regenerateAiBtn");

// Confirm Modal
const confirmModal = document.getElementById("confirmModal");
const confirmBackdrop = document.getElementById("confirmBackdrop");
const confirmMessage = document.getElementById("confirmMessage");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");
const confirmOkayBtn = document.getElementById("confirmOkayBtn");

// Settings & Auth
const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const settingsBackdrop = document.getElementById("settingsBackdrop");
const settingsCloseBtn = document.getElementById("settingsCloseBtn");
const apiKeyInput = document.getElementById("apiKeyInput");
const saveApiKeyBtn = document.getElementById("saveApiKeyBtn");
const keyStatus = document.getElementById("keyStatus");

const sbUrlInput = document.getElementById("sbUrlInput");
const sbKeyInput = document.getElementById("sbKeyInput");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const btnLogin = document.getElementById("btnLogin");
const btnSignUp = document.getElementById("btnSignUp");
const btnLogout = document.getElementById("btnLogout");
const userStatus = document.getElementById("userStatus");
const loginForm = document.getElementById("loginForm");
const userEmailDisplay = document.getElementById("userEmailDisplay");
const authMsg = document.getElementById("authMsg");

const aiActionArea = document.getElementById("aiActionArea");
const aiActionText = document.getElementById("aiActionText");
const generateSummaryBtn = document.getElementById("generateSummaryBtn");
const loadingOverlay = document.getElementById("loadingOverlay");
const loadingText = document.getElementById("loadingText");

let confirmCallback = null;
let pendingSummaryType = null; 

async function init() {
  console.log("Init running...");
  updateHeaderDate(); 
  setupEventListeners();
  
  // Initialize Supabase if creds exist
  const sbUrl = localStorage.getItem(SB_URL_STORAGE);
  const sbKey = localStorage.getItem(SB_KEY_STORAGE);
  
  if (sbUrl && sbKey) {
      initSupabase(sbUrl, sbKey);
  } else {
      // Fallback to local only
      entries = loadLocalEntries();
      renderInitialViews();
      checkAiTriggers();
  }
}

function initSupabase(url, key) {
    if (!window.supabase) {
        console.error("Supabase SDK not loaded");
        return;
    }
    try {
        supabaseClient = window.supabase.createClient(url, key);
        sbUrlInput.value = url;
        sbKeyInput.value = key;
        checkUserSession();
    } catch (e) {
        console.error("Supabase init error", e);
    }
}

async function checkUserSession() {
    if(!supabaseClient) return;
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        currentUser = session.user;
        updateAuthUI(true);
        await syncEntries(); 
    } else {
        updateAuthUI(false);
        entries = loadLocalEntries(); 
        renderInitialViews();
    }
}

function updateAuthUI(isLoggedIn) {
    if (isLoggedIn) {
        loginForm.classList.add("hidden");
        userStatus.classList.remove("hidden");
        userEmailDisplay.textContent = currentUser.email;
    } else {
        loginForm.classList.remove("hidden");
        userStatus.classList.add("hidden");
    }
}

// --- Sync Logic ---
async function syncEntries() {
    if (!supabaseClient || !currentUser) return;
    showLoading("Syncing...");
    
    const { data, error } = await supabaseClient
        .from('entries')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Sync error:", error);
        alert("Sync failed: " + error.message);
    } else {
        entries = data.map(row => {
            return {
                id: row.id, 
                dateKey: row.date_key,
                createdAt: new Date(row.created_at).getTime(),
                type: row.type || 'entry',
                summaryType: row.summary_type,
                chiefComplaint: row.chief_complaint, 
                plan: row.plan,
                gratitude: row.gratitude,
                note: row.note,
                updatedAt: row.updated_at
            };
        });
        
        saveLocalEntries(); 
        renderInitialViews();
    }
    hideLoading();
}

async function uploadEntry(entry) {
    if (!supabaseClient || !currentUser) {
        saveLocalEntries();
        return;
    }
    
    // [修正點] 加入 type 的防呆機制，如果沒有 type 就預設為 'entry'
    const dbPayload = {
        id: entry.id,
        user_id: currentUser.id,
        date_key: entry.dateKey,
        created_at: new Date(entry.createdAt).toISOString(),
        type: entry.type || 'entry', // 這裡加了保險
        summary_type: entry.summaryType,
        chief_complaint: entry.chiefComplaint,
        plan: entry.plan,
        gratitude: entry.gratitude,
        note: entry.note,
        updated_at: entry.updatedAt
    };

    const { error } = await supabaseClient
        .from('entries')
        .upsert(dbPayload, { onConflict: 'id' });

    if (error) {
        console.error("Upload error", error);
        alert("Cloud save failed, saved locally.");
    }
    
    saveLocalEntries();
}

async function deleteEntryCloud(id) {
    if (supabaseClient && currentUser) {
        const { error } = await supabaseClient.from('entries').delete().eq('id', id);
        if (error) console.error("Delete error", error);
    }
    saveLocalEntries();
}

// --- Auth Actions ---
async function handleLogin() {
    const url = sbUrlInput.value.trim();
    const key = sbKeyInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if(!url || !key) return showAuthMsg("Please enter Supabase URL & Key", true);
    if(!email || !password) return showAuthMsg("Please enter Email & Password", true);

    localStorage.setItem(SB_URL_STORAGE, url);
    localStorage.setItem(SB_KEY_STORAGE, key);
    initSupabase(url, key);

    showLoading("Logging in...");
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    hideLoading();

    if (error) {
        showAuthMsg(error.message, true);
    } else {
        showAuthMsg("Login success!", false);
        currentUser = data.user;
        updateAuthUI(true);
        await syncEntries();
        setTimeout(() => settingsModal.classList.add("hidden"), 1000);
    }
}

async function handleSignUp() {
    const url = sbUrlInput.value.trim();
    const key = sbKeyInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if(!url || !key) return showAuthMsg("Please enter Supabase URL & Key", true);
    if(!email || !password) return showAuthMsg("Please enter Email & Password", true);

    localStorage.setItem(SB_URL_STORAGE, url);
    localStorage.setItem(SB_KEY_STORAGE, key);
    initSupabase(url, key);

    showLoading("Creating account...");
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    hideLoading();

    if (error) {
        showAuthMsg(error.message, true);
    } else {
        showAuthMsg("Account created! You are logged in.", false);
        currentUser = data.user;
        updateAuthUI(true);
        await syncEntries(); 
    }
}

async function handleLogout() {
    if(supabaseClient) await supabaseClient.auth.signOut();
    currentUser = null;
    updateAuthUI(false);
    entries = []; 
    saveLocalEntries();
    renderInitialViews();
    showAuthMsg("Logged out.", false);
}

function showAuthMsg(msg, isError) {
    authMsg.textContent = msg;
    authMsg.style.color = isError ? "red" : "green";
}

// --- Standard UI ---

function renderInitialViews() {
    if (document.getElementById('tab-history') && !document.getElementById('tab-history').classList.contains('tab-page-hidden')) {
        if(calendarView.classList.contains("list-view-hidden")) {
            renderList(searchInput.value || "");
        } else {
            renderCalendar();
        }
    }
    checkAiTriggers();
}

function showLoading(text) {
    loadingText.textContent = text;
    loadingOverlay.classList.remove("hidden");
}

function hideLoading() {
    loadingOverlay.classList.add("hidden");
}

// ... Date Helpers ...
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

// ... AI Logic ...
function checkAiTriggers() {
    const today = new Date();
    const dayOfWeek = today.getDay(); 
    const date = today.getDate();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isLastDay = tomorrow.getDate() === 1;

    let showAi = false;
    let type = '';
    let msg = '';

    if (isLastDay) {
        showAi = true;
        type = 'monthly';
        msg = "It's the end of the month! Generate Monthly Progress Summary?";
    } else if (dayOfWeek === 5) {
        showAi = true;
        type = 'weekly';
        msg = "It's Friday! Generate Weekly Progress Summary?";
    }

    if (showAi) {
        aiActionArea.classList.remove('hidden');
        aiActionText.textContent = msg;
        pendingSummaryType = type;
    } else {
        aiActionArea.classList.add('hidden');
        pendingSummaryType = null;
    }
}

async function handleGenerateSummary(type, overwriteId = null) {
    const apiKey = localStorage.getItem(API_KEY_STORAGE);
    if (!apiKey) {
        alert("Please set your Gemini API Key in Settings first.");
        return;
    }

    const now = new Date();
    now.setHours(23, 59, 59, 999);
    let startDate = new Date();
    
    if (type === 'weekly') {
        startDate.setDate(now.getDate() - 7);
    } else {
        startDate.setDate(1); 
    }
    startDate.setHours(0, 0, 0, 0);

    const relevantEntries = entries.filter(e => {
        if (e.type === 'summary') return false;
        const eDate = new Date(e.createdAt);
        return eDate >= startDate && eDate <= now;
    });

    if (relevantEntries.length === 0) {
        alert("No entries found for this period to summarize.");
        return;
    }

    let promptText = `You are a helpful life coach assistant. Please summarize the following progress notes for my ${type} review.
    Identify key achievements, recurring problems, things I was grateful for, and future plans.
    Format the output nicely with bullet points.
    
    Here are the entries:\n`;

    relevantEntries.forEach(e => {
        const dateStr = new Date(e.createdAt).toLocaleDateString();
        promptText += `[${dateStr}] Title: ${e.chiefComplaint || 'N/A'}\n`;
        if (e.plan) promptText += `Plan: ${e.plan}\n`;
        if (e.gratitude) promptText += `Gratitude: ${e.gratitude}\n`;
        if (e.note) promptText += `Note: ${e.note}\n`;
        promptText += `----\n`;
    });

    showLoading("Thinking...");
    try {
        const resultText = await callGeminiAPI(apiKey, promptText);
        
        const newId = overwriteId || generateUUID(); 

        const summaryEntry = {
            id: newId,
            createdAt: overwriteId ? (entries.find(e => e.id === overwriteId)?.createdAt || Date.now()) : Date.now(),
            dateKey: toDateKey(new Date()),
            type: 'summary',
            summaryType: type,
            chiefComplaint: `✨ AI ${type.charAt(0).toUpperCase() + type.slice(1)} Summary`,
            plan: '',
            gratitude: '',
            note: resultText,
            updatedAt: Date.now()
        };

        if (overwriteId) {
             const idx = entries.findIndex(e => e.id === overwriteId);
             if (idx !== -1) entries[idx] = summaryEntry;
        } else {
            entries.unshift(summaryEntry);
        }
        
        await uploadEntry(summaryEntry);
        
        hideLoading();
        aiActionArea.classList.add('hidden');
        toggleView('list');
        switchTab('tab-history');
        
    } catch (error) {
        hideLoading();
        alert("AI Generation failed: " + error.message);
    }
}

async function callGeminiAPI(key, prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || "Unknown API error");
    }
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

// ... UI Helpers ...
function showConfirmModal(message, isDangerous, callback) {
    confirmMessage.textContent = message;
    confirmCallback = callback;
    if (isDangerous) {
        confirmOkayBtn.classList.remove('btn-primary');
        confirmOkayBtn.classList.add('action-sheet-btn-danger');
        confirmOkayBtn.textContent = "Delete";
    } else {
        confirmOkayBtn.classList.remove('action-sheet-btn-danger');
        confirmOkayBtn.classList.add('btn-primary'); 
        confirmOkayBtn.style.marginTop = '0'; 
        confirmOkayBtn.style.boxShadow = 'none';
        confirmOkayBtn.textContent = "Create";
    }
    confirmModal.classList.remove("hidden");
}

function closeConfirmModal() {
    confirmModal.classList.add("hidden");
    confirmCallback = null;
    confirmOkayBtn.style.marginTop = ''; 
    confirmOkayBtn.style.boxShadow = '';
}

function setupEventListeners() {
  saveBtn.addEventListener("click", handleSave);

  bottomTabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      if (targetId === 'tab-write') {
          if (!editingEntryId && !targetDate) {
              targetDate = null;
              updateHeaderDate();
              clearInputs();
              saveBtn.textContent = "Save";
          }
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
    if (term.length > 0) { toggleView("list"); }
    renderList(term);
  });

  modalCloseBtn.addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", closeModal);
  cancelActionBtn.addEventListener("click", closeActionSheet);
  actionSheetBackdrop.addEventListener("click", closeActionSheet);
  deleteEntryBtn.addEventListener("click", handleDeleteEntryClick);
  editEntryBtn.addEventListener("click", handleEditEntry);

  confirmBackdrop.addEventListener("click", closeConfirmModal);
  confirmCancelBtn.addEventListener("click", closeConfirmModal);
  confirmOkayBtn.addEventListener("click", () => {
      if (confirmCallback) confirmCallback();
      closeConfirmModal();
  });

  // Settings
  settingsBtn.addEventListener("click", () => {
      const existingKey = localStorage.getItem(API_KEY_STORAGE);
      if(existingKey) apiKeyInput.value = existingKey;
      
      const existingUrl = localStorage.getItem(SB_URL_STORAGE);
      const existingSbKey = localStorage.getItem(SB_KEY_STORAGE);
      if(existingUrl) sbUrlInput.value = existingUrl;
      if(existingSbKey) sbKeyInput.value = existingSbKey;
      
      checkUserSession(); 
      settingsModal.classList.remove("hidden");
  });
  settingsCloseBtn.addEventListener("click", () => settingsModal.classList.add("hidden"));
  settingsBackdrop.addEventListener("click", () => settingsModal.classList.add("hidden"));
  saveApiKeyBtn.addEventListener("click", () => {
      const key = apiKeyInput.value.trim();
      if(key) {
          localStorage.setItem(API_KEY_STORAGE, key);
          keyStatus.style.display = 'block';
          setTimeout(() => { keyStatus.style.display = 'none'; }, 1000);
      }
  });

  // Auth Buttons
  btnLogin.addEventListener("click", handleLogin);
  btnSignUp.addEventListener("click", handleSignUp);
  btnLogout.addEventListener("click", handleLogout);

  generateSummaryBtn.addEventListener("click", () => {
      if(pendingSummaryType) handleGenerateSummary(pendingSummaryType);
  });
  
  regenerateAiBtn.addEventListener("click", () => {
      if (longPressTargetId) {
          const entry = entries.find(e => e.id === longPressTargetId);
          if (entry && entry.type === 'summary') {
              closeActionSheet();
              handleGenerateSummary(entry.summaryType, entry.id);
          }
      }
  });

  if (planInput) enableAutoBullets(planInput);
  if (gratitudeInput) enableAutoBullets(gratitudeInput);
}

function enableAutoBullets(textarea) {
    textarea.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const start = this.selectionStart;
            const end = this.selectionEnd;
            const value = this.value;
            this.value = value.substring(0, start) + "\n• " + value.substring(end);
            this.selectionStart = this.selectionEnd = start + 3;
        }
    });
    textarea.addEventListener('focus', function() {
        if (this.value.trim() === '') { this.value = "• "; }
    });
}

function closeModal() { entryModal.classList.add("hidden"); }

function switchTab(tabId) {
  document.querySelectorAll(".tab-page").forEach(p => p.classList.add("tab-page-hidden"));
  const target = document.getElementById(tabId);
  if (target) target.classList.remove("tab-page-hidden");
  
  bottomTabButtons.forEach(b => b.classList.remove("tab-btn-active"));
  const activeBtn = document.querySelector(`[data-target="${tabId}"]`);
  if (activeBtn) activeBtn.classList.add("tab-btn-active");
 
  if (tabId === "tab-history") {
    if (calendarView.classList.contains("list-view-hidden")) {
         renderList(searchInput.value.toLowerCase());
    } else {
         renderCalendar();
    }
  }
}

function startNewEntryForDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const newTarget = new Date(y, m - 1, d);
    if (isFutureDate(newTarget)) {
        alert("You cannot write notes for the future.");
        return;
    }
    targetDate = newTarget;
    updateHeaderDate();
    clearInputs();
    if (isPastDate(targetDate)) {
        saveBtn.textContent = "Save Past Entry";
    } else {
        saveBtn.textContent = "Save";
    }
    closeModal();
    switchTab("tab-write");
}

async function handleSave() {
  const cc = ccInput.value.trim();
  const plan = planInput.value.trim();
  const gratitude = gratitudeInput ? gratitudeInput.value.trim() : "";
  const note = noteInput.value.trim();

  if (!cc && !plan && !gratitude && !note) return alert("Please fill in at least one field.");

  const now = targetDate ? new Date(targetDate) : new Date();
  if (!targetDate) {
      now.setHours(new Date().getHours(), new Date().getMinutes());
  } else {
      now.setHours(12, 0, 0); 
  }

  // Create or Update
  if (editingEntryId) {
    const index = entries.findIndex(e => e.id === editingEntryId);
    if (index !== -1) {
      entries[index].chiefComplaint = cc;
      entries[index].plan = plan;
      entries[index].gratitude = gratitude;
      entries[index].note = note;
      entries[index].updatedAt = new Date().getTime();
      
      // Upload update
      await uploadEntry(entries[index]);
    }
    editingEntryId = null;
    saveBtn.textContent = "Save";
    targetDate = null;
    updateHeaderDate();
    switchTab("tab-history");
   
  } else {
    const newEntry = {
      id: generateUUID(),
      createdAt: now.getTime(),
      dateKey: toDateKey(now),
      chiefComplaint: cc,
      plan: plan,
      gratitude: gratitude,
      note: note,
      type: 'entry' // [修正點] 加入 type，避免資料庫報錯
    };
    entries.unshift(newEntry);
    
    // Upload new
    await uploadEntry(newEntry);
   
    targetDate = null;
    updateHeaderDate();
    saveBtn.textContent = "Save";
    clearInputs();
  }
}

function clearInputs() {
  if(ccInput) ccInput.value = "";
  if(planInput) planInput.value = "";
  if(gratitudeInput) gratitudeInput.value = "";
  if(noteInput) noteInput.value = "";
}

function toggleView(view) {
  if (view === "calendar") {
    calendarView.classList.remove("list-view-hidden"); 
    listView.classList.add("list-view-hidden");
    calendarViewBtn.classList.add("toggle-btn-active");
    listViewBtn.classList.remove("toggle-btn-active");
    renderCalendar();
  } else {
    calendarView.classList.add("list-view-hidden");
    listView.classList.remove("list-view-hidden");
    calendarViewBtn.classList.remove("toggle-btn-active");
    listViewBtn.classList.add("toggle-btn-active");
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

  for (let i = 0; i < firstDay; i++) {
    const cell = document.createElement("div");
    calendarGrid.appendChild(cell);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dateObj = new Date(y, m, d);
    
    const hasEntry = entries.some(e => e.dateKey === dateStr && e.type !== 'summary');
    const hasSummary = entries.some(e => e.dateKey === dateStr && e.type === 'summary');
   
    const cell = document.createElement("div");
    cell.className = "calendar-cell";
   
    if (hasEntry) {
        cell.classList.add("calendar-cell-has-entry");
    } else if (hasSummary) {
        cell.classList.add("calendar-cell-has-summary"); 
    } else {
        cell.classList.add("calendar-cell-empty");
        if (isFutureDate(dateObj)) {
            cell.style.opacity = "0.5";
        }
    }
   
    cell.innerHTML = `<div class="calendar-cell-inner">${d}</div>`;
    const inner = cell.querySelector('.calendar-cell-inner');
    inner.addEventListener("click", () => openDateModal(dateStr));
    if (!isFutureDate(dateObj)) {
        addLongPressEvent(inner, dateStr, 'date');
    }
    calendarGrid.appendChild(cell);
  }
}

function changeMonth(delta) {
  currentMonth.setMonth(currentMonth.getMonth() + delta);
  renderCalendar();
}

function renderList(filterText = "") {
  historyList.innerHTML = "";
  const sorted = sortEntriesDescending(entries);
  const filtered = sorted.filter(e => {
    const text = (e.chiefComplaint + (e.plan || "") + (e.gratitude || "") + (e.note || "")).toLowerCase();
    return text.includes(filterText);
  });

  if (filtered.length === 0) {
      historyList.innerHTML = "<div class='no-data-msg'>No records found.</div>";
      return;
  }

  filtered.forEach(e => {
    const item = document.createElement("div");
    item.className = "history-item";
    const isSummary = e.type === 'summary';
    if (isSummary) { item.classList.add('history-item-summary'); }
    const dateStr = new Date(e.createdAt).toLocaleDateString();
   
    item.innerHTML = `
      <div class="history-item-header">
         <div>
            <div class="history-item-date">${dateStr}</div>
            <div class="history-item-title">${e.chiefComplaint || 'Progress Note'}</div>
         </div>
         <div class="history-item-expand-icon">▼</div>
      </div>
      <div class="history-item-details">
         ${e.plan ? `<strong>Plan:</strong><div class="list-text">${e.plan}</div><br>` : ''}
         ${e.gratitude ? `<strong>Gratitude:</strong><div class="list-text" style="color:#2E7D32;">${e.gratitude}</div><br>` : ''}
         ${e.note ? `<strong>${isSummary ? 'AI Analysis:' : 'Note:'}</strong><div class="list-text">${e.note}</div>` : ''}
      </div>
    `;
    item.addEventListener("click", () => { item.classList.toggle("expanded"); });
    addLongPressEvent(item, e.id, 'item');
    historyList.appendChild(item);
  });
}

function addLongPressEvent(el, idOrDate, type) {
  el.addEventListener("touchstart", (e) => {
    longPressTimer = setTimeout(() => handleLongPress(idOrDate, type), 600);
  }, {passive: true});
  el.addEventListener("touchend", () => clearTimeout(longPressTimer));
  el.addEventListener("touchmove", () => clearTimeout(longPressTimer)); 
  el.addEventListener("mousedown", () => {
     longPressTimer = setTimeout(() => handleLongPress(idOrDate, type), 600);
  });
  el.addEventListener("mouseup", () => clearTimeout(longPressTimer));
  el.addEventListener("mouseleave", () => clearTimeout(longPressTimer));
}

function handleLongPress(idOrDate, type) {
    if (type === 'item') {
        openActionSheet(idOrDate);
    } else if (type === 'date') {
        const hasData = entries.some(e => e.dateKey === idOrDate);
        if (hasData) {
            openDateModal(idOrDate);
        } else {
            showConfirmModal(`Create new entry for ${idOrDate}?`, false, () => {
                startNewEntryForDate(idOrDate);
            });
        }
    }
}

function openActionSheet(id) {
  longPressTargetId = id;
  const entry = entries.find(e => e.id === id);
  if (entry && entry.type === 'summary') {
      regenerateAiBtn.classList.remove('hidden');
      editEntryBtn.classList.add('hidden'); 
  } else {
      regenerateAiBtn.classList.add('hidden');
      editEntryBtn.classList.remove('hidden');
  }
  actionSheet.classList.remove("hidden");
  if (navigator.vibrate) navigator.vibrate(50);
}

function closeActionSheet() {
  actionSheet.classList.add("hidden");
  longPressTargetId = null;
}

function handleDeleteEntryClick() {
    if (!longPressTargetId) return;
    closeActionSheet(); 
    showConfirmModal("Delete this entry?", true, executeDeleteEntry);
}

function executeDeleteEntry() {
  const entry = entries.find(e => e.id === longPressTargetId);
  const dateKey = entry ? entry.dateKey : null;

  // Cloud Delete
  deleteEntryCloud(longPressTargetId);

  entries = entries.filter(e => e.id !== longPressTargetId);
  
  if (!calendarView.classList.contains("list-view-hidden")) {
      renderCalendar();
  } else {
      renderList(searchInput.value.toLowerCase());
  }
  if (!entryModal.classList.contains("hidden") && dateKey) {
      openDateModal(dateKey); 
  }
}

function handleEditEntry() {
  if (!longPressTargetId) return;
  const entry = entries.find(e => e.id === longPressTargetId);
  if (entry) {
      if(entry.type === 'summary') {
          alert("To update a summary, please use 'Regenerate' or delete it.");
          return;
      }
    if(ccInput) ccInput.value = entry.chiefComplaint || "";
    if(planInput) planInput.value = entry.plan || "";
    if(gratitudeInput) gratitudeInput.value = entry.gratitude || ""; 
    if(noteInput) noteInput.value = entry.note || "";
    editingEntryId = entry.id;
   
    const d = new Date(entry.createdAt);
    targetDate = d;
    updateHeaderDate();

    if (isPastDate(d)) {
         saveBtn.textContent = "Save Past Entry";
    } else {
         saveBtn.textContent = "Save";
    }
    closeActionSheet();
    closeModal();
    switchTab("tab-write");
  }
}

function openDateModal(dateKey) {
  modalDateLabel.textContent = dateKey;
  modalEntries.innerHTML = "";
  const daysEntries = entries.filter(e => e.dateKey === dateKey);
  const [y, m, d] = dateKey.split("-").map(Number);
  const target = new Date(y, m - 1, d);

  if (daysEntries.length === 0) {
      let html = `<div class="no-data-msg">No progress notes recorded.</div>`;
      if (!isFutureDate(target)) {
          html += `<button id="addPastEntryBtn" class="btn-secondary">Create Entry for ${dateKey}</button>`;
      }
      modalEntries.innerHTML = html;
      setTimeout(() => {
          const btn = document.getElementById("addPastEntryBtn");
          if(btn) btn.addEventListener("click", () => startNewEntryForDate(dateKey));
      }, 0);
  } else {
      daysEntries.forEach(e => {
        const div = document.createElement("div");
        div.className = "history-item"; 
        if (e.type === 'summary') { div.classList.add('history-item-summary'); }
        div.innerHTML = `
           <div class="history-item-date">${e.type === 'summary' ? 'AI Summary' : 'Entry'}</div>
           <div class="history-item-title">${e.chiefComplaint || '-'}</div>
           <div class="history-item-details" style="display:block; margin-top:8px; border:none;">
             ${e.plan ? `<strong>Plan:</strong><div class="list-text">${e.plan}</div><br>` : ''}
             ${e.gratitude ? `<strong>Gratitude:</strong><div class="list-text" style="color:#2E7D32;">${e.gratitude}</div><br>` : ''}
             ${e.note ? `<strong>${e.type === 'summary' ? 'Analysis' : 'Note'}:</strong><div class="list-text">${e.note}</div>` : ''}
           </div>
        `;
        addLongPressEvent(div, e.id, 'item');
        modalEntries.appendChild(div);
      });
  }
  entryModal.classList.remove("hidden");
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function loadLocalEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLocalEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function sortEntriesDescending(arr) {
  return arr.slice().sort((a, b) => b.createdAt - a.createdAt);
}

// Fallback ID generator if crypto.randomUUID() fails (e.g. non-secure context)
function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback timestamp + random
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

init();