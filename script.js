const STORAGE_KEY = "lifeProgressEntries";

let entries = [];
let currentMonth = new Date();
let longPressTimer = null;
let longPressTargetId = null;
let editingEntryId = null;
// 新增：用來記錄目前正在編輯的日期 (預設為 null 代表今天)
let targetDate = null; 

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
  updateHeaderDate(); // 初始化日期顯示
  setupEventListeners();
}

// 更新 Header 日期顯示
function updateHeaderDate() {
    const displayDate = targetDate ? targetDate : new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    
    if(dateEl) {
        dateEl.textContent = displayDate.toLocaleDateString('en-US', options);
        // 如果是補寫舊日記，換個顏色提醒
        if (targetDate) {
            dateEl.classList.add('editing-past');
            dateEl.textContent += " (Writing Past)";
        } else {
            dateEl.classList.remove('editing-past');
        }
    }
}

function setupEventListeners() {
  saveBtn.addEventListener("click", handleSave);

  bottomTabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      // 如果切換回 Write Tab 且沒有特別指定 targetDate，則重置為今天
      if (targetId === 'tab-write' && !editingEntryId) {
          targetDate = null;
          updateHeaderDate();
          clearInputs();
          saveBtn.textContent = "Save";
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
    if (term.length > 0) {
        toggleView("list");
    }
    renderList(term);
  });

  modalCloseBtn.addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", closeModal);
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
    toggleView("calendar");
    renderCalendar();
  }
}

// 啟動補寫模式
function startNewEntryForDate(dateStr) {
    // dateStr format: YYYY-MM-DD
    const [y, m, d] = dateStr.split("-").map(Number);
    targetDate = new Date(y, m - 1, d); // Month is 0-indexed
    
    updateHeaderDate();
    clearInputs();
    saveBtn.textContent = "Save Past Entry";
    
    closeModal();
    switchTab("tab-write");
}

function handleSave() {
  const cc = ccInput.value.trim();
  const plan = planInput.value.trim();
  const note = noteInput.value.trim();

  if (!cc && !plan && !note) return alert("Please fill in at least one field.");

  // 如果有 targetDate (補寫)，就用 targetDate，否則用現在時間
  const now = targetDate ? new Date(targetDate) : new Date();
  
  // 保持當下時間的時分秒，避免排序問題 (如果是補寫，時間設為中午12點以示區別)
  if (!targetDate) {
      now.setHours(new Date().getHours(), new Date().getMinutes());
  } else {
      now.setHours(12, 0, 0); 
  }

  if (editingEntryId) {
    const index = entries.findIndex(e => e.id === editingEntryId);
    if (index !== -1) {
      entries[index].chiefComplaint = cc;
      entries[index].plan = plan;
      entries[index].note = note;
      entries[index].updatedAt = new Date().getTime(); // Update timestamp is actual now
    }
    editingEntryId = null;
    saveBtn.textContent = "Save";
    targetDate = null; // Reset
    updateHeaderDate();
    switchTab("tab-history");
  } else {
    const newEntry = {
      id: Date.now().toString(),
      createdAt: now.getTime(), // This controls the date logic
      dateKey: toDateKey(now),
      chiefComplaint: cc,
      plan: plan,
      note: note
    };
    entries.unshift(newEntry);
    
    // Save 後重置狀態
    targetDate = null;
    updateHeaderDate();
    saveBtn.textContent = "Save";
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
    const hasEntry = entries.some(e => e.dateKey === dateStr);
    
    const cell = document.createElement("div");
    cell.className = "calendar-cell";
    if (hasEntry) cell.classList.add("calendar-cell-has-entry");
    else cell.classList.add("calendar-cell-empty");
    
    cell.innerHTML = `<div class="calendar-cell-inner">${d}</div>`;
    
    // Click: Open Modal
    const inner = cell.querySelector('.calendar-cell-inner');
    inner.addEventListener("click", () => openDateModal(dateStr));
    
    // Long Press on Date: Create Entry (補寫)
    addLongPressEvent(inner, dateStr, 'date');
    
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
    
    item.addEventListener("click", () => {
        item.classList.toggle("expanded");
    });
    
    // Long Press on Item: Edit/Delete
    addLongPressEvent(item, e.id, 'item');
    
    historyList.appendChild(item);
  });
}

// 通用的長按處理
// type: 'item' (歷史紀錄) or 'date' (日曆日期)
function addLongPressEvent(el, idOrDate, type) {
  el.addEventListener("touchstart", (e) => {
    // 只有當不是為了展開清單時才觸發長按
    longPressTimer = setTimeout(() => handleLongPress(idOrDate, type), 600);
  }, {passive: true});
  
  el.addEventListener("touchend", () => clearTimeout(longPressTimer));
  el.addEventListener("touchmove", () => clearTimeout(longPressTimer)); // 移動手指取消長按

  // 電腦版滑鼠長按
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
        // 長按日期：直接跳轉去補寫
        if(confirm(`Create new entry for ${idOrDate}?`)) {
            startNewEntryForDate(idOrDate);
        }
    }
}

function openActionSheet(id) {
  longPressTargetId = id;
  actionSheet.classList.remove("hidden");
  // 震動反饋 (手機才有感)
  if (navigator.vibrate) navigator.vibrate(50);
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
    
    // Reset targetDate just in case, logic follows createdAt
    targetDate = null;
    updateHeaderDate();

    closeActionSheet();
    closeModal();
    switchTab("tab-write");
  }
}

function openDateModal(dateKey) {
  modalDateLabel.textContent = dateKey;
  modalEntries.innerHTML = "";
  
  const daysEntries = entries.filter(e => e.dateKey === dateKey);
  
  if (daysEntries.length === 0) {
      // 無資料：顯示按鈕來新增
      modalEntries.innerHTML = `
        <div class="no-data-msg">No progress notes recorded.</div>
        <button id="addPastEntryBtn" class="btn-secondary">Create Entry for ${dateKey}</button>
      `;
      // 綁定按鈕事件
      setTimeout(() => {
          const btn = document.getElementById("addPastEntryBtn");
          if(btn) btn.addEventListener("click", () => startNewEntryForDate(dateKey));
      }, 0);

  } else {
      daysEntries.forEach(e => {
        const div = document.createElement("div");
        div.className = "history-item"; 
        div.innerHTML = `
           <div class="history-item-date">Entry</div>
           <div class="history-item-title">${e.chiefComplaint || '-'}</div>
           <div class="history-item-details" style="display:block; margin-top:8px; border:none;">
             <strong>Plan:</strong> ${e.plan}<br>
             <strong>Note:</strong> ${e.note}
           </div>
        `;
        // Modal 裡也可以長按編輯
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