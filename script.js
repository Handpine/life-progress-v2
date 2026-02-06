const STORAGE_KEY = "lifeProgressEntries";

let entries = [];
let currentMonth = new Date();
let longPressTimer = null;
let longPressTargetId = null;
let editingEntryId = null;

// DOM Elements
const dateEl = document.getElementById("currentDate");
const saveBtn = document.getElementById("saveBtn");
const ccInput = document.getElementById("ccInput");
const planInput = document.getElementById("planInput");
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

function init() {
  entries = loadEntries();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  if(dateEl) dateEl.textContent = new Date().toLocaleDateString('en-US', options);
  
  setupEventListeners();
  // Don't render history immediately, wait for tab switch
}

function setupEventListeners() {
  saveBtn.addEventListener("click", handleSave);

  bottomTabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      switchTab(targetId);
    });
  });

  calendarViewBtn.addEventListener("click", () => toggleView("calendar"));
  listViewBtn.addEventListener("click", () => toggleView("list"));
  
  prevMonthBtn.addEventListener("click", () => changeMonth(-1));
  nextMonthBtn.addEventListener("click", () => changeMonth(1));

  // Search Logic: Auto-switch to list view when typing
  searchInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    if (term.length > 0) {
        toggleView("list"); // Force list view to see results
    }
    renderList(term);
  });

  // Modal closing logic (Backdrop click)
  modalCloseBtn.addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", closeModal);

  // Action Sheet closing logic
  cancelActionBtn.addEventListener("click", closeActionSheet);
  actionSheetBackdrop.addEventListener("click", closeActionSheet);
  
  deleteEntryBtn.addEventListener("click", handleDeleteEntry);
  editEntryBtn.addEventListener("click", handleEditEntry);
}

function closeModal() {
    entryModal.classList.add("hidden");
}

function switchTab(tabId) {
  document.querySelectorAll(".tab-page").forEach(p => p.classList.add("tab-page-hidden"));
  document.getElementById(tabId).classList.remove("tab-page-hidden");
  
  bottomTabButtons.forEach(b => b.classList.remove("tab-btn-active"));
  document.querySelector(`[data-target="${tabId}"]`).classList.add("tab-btn-active");
  
  if (tabId === "tab-history") {
    // Reset to Calendar view by default when entering history
    // unless user was searching? Let's just default to Calendar for cleanliness.
    toggleView("calendar");
    renderCalendar(); // Explicitly render calendar
  }
}

function handleSave() {
  const cc = ccInput.value.trim();
  const plan = planInput.value.trim();
  const note = noteInput.value.trim();

  if (!cc && !plan && !note) return alert("Please fill in at least one field.");

  const now = new Date();
  
  if (editingEntryId) {
    const index = entries.findIndex(e => e.id === editingEntryId);
    if (index !== -1) {
      entries[index].chiefComplaint = cc;
      entries[index].plan = plan;
      entries[index].note = note;
      entries[index].updatedAt = now.getTime();
    }
    editingEntryId = null;
    saveBtn.textContent = "Save";
    switchTab("tab-history");
  } else {
    const newEntry = {
      id: Date.now().toString(),
      createdAt: now.getTime(),
      dateKey: toDateKey(now),
      chiefComplaint: cc,
      plan: plan,
      note: note
    };
    entries.unshift(newEntry);
  }

  saveEntries();
  clearInputs();
}

function clearInputs() {
  ccInput.value = "";
  planInput.value = "";
  noteInput.value = "";
}

function toggleView(view) {
  if (view === "calendar") {
    calendarView.classList.remove("list-view-hidden"); 
    listView.classList.add("list-view-hidden");
    calendarViewBtn.classList.add("toggle-btn-active");
    listViewBtn.classList.remove("toggle-btn-active");
    renderCalendar(); // Ensure render
  } else {
    calendarView.classList.add("list-view-hidden");
    listView.classList.remove("list-view-hidden");
    calendarViewBtn.classList.remove("toggle-btn-active");
    listViewBtn.classList.add("toggle-btn-active");
    renderList(searchInput.value.toLowerCase()); // Render list (keep search term if any)
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
    const hasEntry = entries.some(e => e.dateKey === dateStr);
    
    const cell = document.createElement("div");
    cell.className = "calendar-cell";
    if (hasEntry) cell.classList.add("calendar-cell-has-entry");
    else cell.classList.add("calendar-cell-empty");
    
    cell.innerHTML = `<div class="calendar-cell-inner">${d}</div>`;
    
    // Attach click to inner circle for ripple effect
    cell.querySelector('.calendar-cell-inner').addEventListener("click", () => openDateModal(dateStr));
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
    const text = (e.chiefComplaint + e.plan + e.note).toLowerCase();
    return text.includes(filterText);
  });

  if (filtered.length === 0) {
      historyList.innerHTML = "<div class='no-data-msg'>No records found.</div>";
      return;
  }

  filtered.forEach(e => {
    const item = document.createElement("div");
    item.className = "history-item";
    const dateStr = new Date(e.createdAt).toLocaleDateString();
    
    // Structure for expansion
    item.innerHTML = `
      <div class="history-item-header">
         <div>
            <div class="history-item-date">${dateStr}</div>
            <div class="history-item-title">${e.chiefComplaint || 'Progress Note'}</div>
         </div>
         <div class="history-item-expand-icon">▼</div>
      </div>
      <div class="history-item-details">
         <strong>Plan:</strong><br>${e.plan || '-'}<br><br>
         <strong>Note:</strong><br>${e.note || '-'}
      </div>
    `;
    
    // Click to expand logic
    item.addEventListener("click", (evt) => {
        // Don't trigger if we are long-pressing (optional, but good UX)
        item.classList.toggle("expanded");
    });
    
    addLongPressEvent(item, e.id);
    historyList.appendChild(item);
  });
}

function addLongPressEvent(el, id) {
  el.addEventListener("touchstart", () => {
    longPressTimer = setTimeout(() => openActionSheet(id), 600);
  });
  el.addEventListener("touchend", () => clearTimeout(longPressTimer));
  el.addEventListener("mousedown", () => {
     longPressTimer = setTimeout(() => openActionSheet(id), 600);
  });
  el.addEventListener("mouseup", () => clearTimeout(longPressTimer));
}

function openActionSheet(id) {
  longPressTargetId = id;
  // Prevent expansion if long pressing (hacky but works)
  // Logic handled in renderList mostly
  actionSheet.classList.remove("hidden");
}

function closeActionSheet() {
  actionSheet.classList.add("hidden");
  longPressTargetId = null;
}

function handleDeleteEntry() {
  if (!longPressTargetId) return;
  if (confirm("Delete this entry?")) {
    entries = entries.filter(e => e.id !== longPressTargetId);
    saveEntries();
    // Re-render current view
    if (!calendarView.classList.contains("list-view-hidden")) {
        renderCalendar();
    } else {
        renderList(searchInput.value.toLowerCase());
    }
    closeActionSheet();
  }
}

function handleEditEntry() {
  if (!longPressTargetId) return;
  const entry = entries.find(e => e.id === longPressTargetId);
  if (entry) {
    ccInput.value = entry.chiefComplaint;
    planInput.value = entry.plan;
    noteInput.value = entry.note;
    editingEntryId = entry.id;
    saveBtn.textContent = "Update Progress";
    
    closeActionSheet();
    closeModal(); // Close modal if open
    switchTab("tab-write");
  }
}

function openDateModal(dateKey) {
  modalDateLabel.textContent = dateKey;
  modalEntries.innerHTML = "";
  
  const daysEntries = entries.filter(e => e.dateKey === dateKey);
  
  if (daysEntries.length === 0) {
      modalEntries.innerHTML = `<div class="no-data-msg">No progress notes recorded for this day.</div>`;
  } else {
      daysEntries.forEach(e => {
        const div = document.createElement("div");
        div.className = "history-item"; 
        // Reuse list style but simpler for modal
        div.innerHTML = `
           <div class="history-item-date">Entry</div>
           <div class="history-item-title">${e.chiefComplaint || '-'}</div>
           <div class="history-item-details" style="display:block; margin-top:8px; border:none;">
             <strong>Plan:</strong> ${e.plan}<br>
             <strong>Note:</strong> ${e.note}
           </div>
        `;
        addLongPressEvent(div, e.id);
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

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function sortEntriesDescending(arr) {
  return arr.slice().sort((a, b) => b.createdAt - a.createdAt);
}

async function generateGeminiSummary(notes, rangeType, apiKey) {}

init();