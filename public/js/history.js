let allHistoryRecords = [];
let filteredHistoryRecords = [];
const HISTORY_COLSPAN = 11;
const HISTORY_PAGE_SIZE = 10;
let currentHistoryPage = 1;
let pendingDeleteHistoryId = null;
let pendingDeleteButton = null;

function authFetch(url, options) {
  return window.Auth.authFetch(url, options);
}

function openClearHistoryModal() {
  document.getElementById('clearHistoryModal').classList.add('open');
}

function closeClearHistoryModal() {
  document.getElementById('clearHistoryModal').classList.remove('open');
}

function openDeleteHistoryModal(recordId, buttonRef) {
  const historyId = Number(recordId);
  if (!Number.isInteger(historyId) || historyId <= 0) {
    setHistoryMessage('รหัสประวัติไม่ถูกต้อง', 'error');
    return;
  }

  pendingDeleteHistoryId = historyId;
  pendingDeleteButton = buttonRef || null;
  document.getElementById('confirmDeleteHistoryBtn').textContent = 'ยืนยันลบรายการนี้';
  document.getElementById('confirmDeleteHistoryBtn').disabled = false;
  document.getElementById('deleteHistoryModal').classList.add('open');
}

function closeDeleteHistoryModal() {
  document.getElementById('deleteHistoryModal').classList.remove('open');
  pendingDeleteHistoryId = null;
  pendingDeleteButton = null;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setHistoryMessage(message, tone) {
  const tbody = document.getElementById('historyBody');
  tbody.innerHTML = `<tr><td colspan="${HISTORY_COLSPAN}" class="history-status${tone ? ` ${tone}` : ''}">${message}</td></tr>`;
  updateHistoryPagination(0, 1);
}

function toDateTimeText(dateValue) {
  const dt = new Date(dateValue);
  return dt.toLocaleDateString('th-TH', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  }) + ' ' + dt.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getHistoryTotalPages(totalRecords) {
  return Math.max(1, Math.ceil(totalRecords / HISTORY_PAGE_SIZE));
}

function updateHistoryPagination(totalRecords, totalPages) {
  const container = document.getElementById('historyPagination');
  const info = document.getElementById('historyPaginationInfo');
  const firstBtn = document.getElementById('historyPageFirstBtn');
  const prevBtn = document.getElementById('historyPagePrevBtn');
  const nextBtn = document.getElementById('historyPageNextBtn');
  const lastBtn = document.getElementById('historyPageLastBtn');

  if (!container || !info || !firstBtn || !prevBtn || !nextBtn || !lastBtn) {
    return;
  }

  const hasRecords = totalRecords > 0;
  container.hidden = !hasRecords;

  if (!hasRecords) {
    info.textContent = '';
    firstBtn.disabled = true;
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    lastBtn.disabled = true;
    return;
  }

  info.textContent = `หน้า ${currentHistoryPage} / ${totalPages} (ทั้งหมด ${totalRecords} รายชื่อ)`;
  firstBtn.disabled = currentHistoryPage <= 1;
  prevBtn.disabled = currentHistoryPage <= 1;
  nextBtn.disabled = currentHistoryPage >= totalPages;
  lastBtn.disabled = currentHistoryPage >= totalPages;
}

function goToHistoryPage(pageNumber) {
  if (filteredHistoryRecords.length === 0) {
    return;
  }

  const totalPages = getHistoryTotalPages(filteredHistoryRecords.length);
  currentHistoryPage = Math.min(totalPages, Math.max(1, pageNumber));
  renderHistoryTable(filteredHistoryRecords);
}

function renderHistoryTable(records) {
  const tbody = document.getElementById('historyBody');
  tbody.innerHTML = '';

  if (records.length === 0) {
    setHistoryMessage('ไม่พบข้อมูลตามคำค้นหา');
    return;
  }

  const totalPages = getHistoryTotalPages(records.length);
  if (currentHistoryPage > totalPages) {
    currentHistoryPage = totalPages;
  }
  if (currentHistoryPage < 1) {
    currentHistoryPage = 1;
  }

  const startIndex = (currentHistoryPage - 1) * HISTORY_PAGE_SIZE;
  const pageRecords = records.slice(startIndex, startIndex + HISTORY_PAGE_SIZE);

  pageRecords.forEach((record, index) => {
    const row = document.createElement('tr');
    const safeName = escapeHtml(`${record.fname} ${record.lname}`);
    const safePhone = escapeHtml(record.phone);
    const safeEmail = escapeHtml(record.email || '-');
    const safeCompany = escapeHtml(record.company);
    const safePosition = escapeHtml(record.position);
    const safeNote = escapeHtml(record.note || '-');
    const safeAdminNote = escapeHtml(record.admin_note || '');
    const safePrize = escapeHtml(`${record.icon} ${record.prize}`);
    const displayNumber = records.length - (startIndex + index);
    row.innerHTML = `
      <td style="opacity:.4">${displayNumber}</td>
      <td>${safeName}</td>
      <td>${safePhone}</td>
      <td>${safeEmail}</td>
      <td>${safeCompany}</td>
      <td>${safePosition}</td>
      <td class="lead-note-cell">${safeNote}</td>
      <td>
        <div class="staff-note-editor">
          <textarea class="staff-note-input" data-id="${record.id}" maxlength="1000" placeholder="เช่น นัด demo วันที่..., ส่งข้อมูล POC..., ติดตามภายในสัปดาห์นี้">${safeAdminNote}</textarea>
          <button type="button" class="history-btn staff-note-save" data-id="${record.id}">บันทึกทีมงาน</button>
        </div>
      </td>
      <td>${safePrize}</td>
      <td style="white-space:nowrap">${toDateTimeText(record.created_at)}</td>
      <td>
        <button type="button" class="history-btn admin-danger-btn history-row-delete" data-id="${record.id}">ลบรายการ</button>
      </td>
    `;
    tbody.appendChild(row);
  });

  updateHistoryPagination(records.length, totalPages);
}

function applySearchFilter() {
  const keyword = document.getElementById('historySearchInput').value.trim().toLowerCase();

  if (!keyword) {
    filteredHistoryRecords = [...allHistoryRecords];
    currentHistoryPage = 1;
    renderHistoryTable(filteredHistoryRecords);
    return;
  }

  filteredHistoryRecords = allHistoryRecords.filter(record => {
    const text = [
      record.fname,
      record.lname,
      record.phone,
      record.email,
      record.company,
      record.position,
      record.note,
      record.admin_note,
      record.prize,
      record.unit,
      record.icon,
      record.created_at
    ].join(' ').toLowerCase();

    return text.includes(keyword);
  });

  currentHistoryPage = 1;
  renderHistoryTable(filteredHistoryRecords);
}

function toCsvCell(value) {
  const text = String(value || '');
  return `"${text.replace(/"/g, '""')}"`;
}

function exportHistoryCsv() {
  if (filteredHistoryRecords.length === 0) {
    setHistoryMessage('ไม่มีข้อมูลสำหรับ export', 'error');
    return;
  }

  const headers = [
    '#',
    'ชื่อ',
    'นามสกุล',
    'เบอร์โทร',
    'อีเมล',
    'บริษัท',
    'ตำแหน่ง',
    'ความสนใจ',
    'หมายเหตุลูกค้า',
    'บันทึกทีมงาน',
    'รางวัล',
    'หน่วย',
    'วันเวลา'
  ];

  const rows = filteredHistoryRecords.map((record, index) => [
    filteredHistoryRecords.length - index,
    record.fname,
    record.lname,
    record.phone,
    record.email,
    record.company,
    record.position,
    record.interest,
    record.note || '',
    record.admin_note || '',
    record.prize,
    record.unit,
    toDateTimeText(record.created_at)
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(toCsvCell).join(','))
    .join('\n');

  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0')
  ].join('');
  const fileName = `history-export-${stamp}.csv`;

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

async function loadHistory() {
  try {
    const response = await authFetch('/api/history');
    const history = await response.json();

    if (!response.ok) {
      throw new Error('โหลดข้อมูลไม่สำเร็จ');
    }

    allHistoryRecords = Array.isArray(history) ? history : [];

    if (allHistoryRecords.length === 0) {
      setHistoryMessage('ยังไม่มีประวัติการสุ่ม');
      return;
    }

    applySearchFilter();
  } catch (_) {
    setHistoryMessage('โหลดข้อมูลไม่สำเร็จ', 'error');
  }
}

async function saveStaffNote(recordId) {
  const input = document.querySelector(`.staff-note-input[data-id="${recordId}"]`);
  const button = document.querySelector(`.staff-note-save[data-id="${recordId}"]`);
  if (!input || !button) return;

  const adminNote = input.value.trim();
  if (adminNote.length > 1000) {
    setHistoryMessage('หมายเหตุทีมงานยาวเกินไป (ไม่เกิน 1000 ตัวอักษร)', 'error');
    input.focus();
    return;
  }

  button.disabled = true;
  button.textContent = 'กำลังบันทึก...';

  try {
    const response = await authFetch(`/api/admin/history/${recordId}/admin-note`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminNote })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'บันทึกหมายเหตุทีมงานไม่สำเร็จ');
    }

    await loadHistory();
  } catch (error) {
    setHistoryMessage(error.message || 'บันทึกหมายเหตุทีมงานไม่สำเร็จ', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'บันทึกทีมงาน';
  }
}

async function clearHistory() {
  const confirmBtn = document.getElementById('confirmClearHistoryBtn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'กำลังล้าง...';

  try {
    const response = await authFetch('/api/admin/history/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'ล้างประวัติไม่สำเร็จ');
    }

    closeClearHistoryModal();
    document.getElementById('historySearchInput').value = '';
    allHistoryRecords = [];
    filteredHistoryRecords = [];
    currentHistoryPage = 1;
    setHistoryMessage(data.message || 'ลบประวัติผู้รับรางวัลเรียบร้อย', 'success');
  } catch (error) {
    setHistoryMessage(error.message || 'ล้างประวัติไม่สำเร็จ', 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'ยืนยันล้างประวัติทั้งหมด';
  }
}

async function deleteHistoryRow(recordId) {
  const historyId = Number(recordId ?? pendingDeleteHistoryId);
  if (!Number.isInteger(historyId) || historyId <= 0) {
    setHistoryMessage('รหัสประวัติไม่ถูกต้อง', 'error');
    closeDeleteHistoryModal();
    return;
  }

  const button = pendingDeleteButton || document.querySelector(`.history-row-delete[data-id="${historyId}"]`);
  const confirmDeleteBtn = document.getElementById('confirmDeleteHistoryBtn');
  if (button) {
    button.disabled = true;
    button.textContent = 'กำลังลบ...';
  }
  if (confirmDeleteBtn) {
    confirmDeleteBtn.disabled = true;
    confirmDeleteBtn.textContent = 'กำลังลบ...';
  }

  try {
    const response = await authFetch(`/api/admin/history/${historyId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'ลบรายการไม่สำเร็จ');
    }

    closeDeleteHistoryModal();
    await loadHistory();
  } catch (error) {
    setHistoryMessage(error.message || 'ลบรายการไม่สำเร็จ', 'error');
    if (confirmDeleteBtn) {
      confirmDeleteBtn.disabled = false;
      confirmDeleteBtn.textContent = 'ยืนยันลบรายการนี้';
    }
    if (button) {
      button.disabled = false;
      button.textContent = 'ลบรายการ';
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!window.Auth.requireAdminAuth()) {
    return;
  }

  document.getElementById('logoutBtn').addEventListener('click', () => window.Auth.logout());
  document.getElementById('historyBody').addEventListener('click', event => {
    const target = event.target;
    if (target.classList.contains('staff-note-save')) {
      saveStaffNote(target.dataset.id);
      return;
    }
    if (target.classList.contains('history-row-delete')) {
      openDeleteHistoryModal(target.dataset.id, target);
    }
  });

  document.getElementById('historySearchInput').addEventListener('input', applySearchFilter);
  document.getElementById('exportHistoryCsvBtn').addEventListener('click', exportHistoryCsv);
  document.getElementById('historyPageFirstBtn').addEventListener('click', () => goToHistoryPage(1));
  document.getElementById('historyPagePrevBtn').addEventListener('click', () => goToHistoryPage(currentHistoryPage - 1));
  document.getElementById('historyPageNextBtn').addEventListener('click', () => goToHistoryPage(currentHistoryPage + 1));
  document.getElementById('historyPageLastBtn').addEventListener('click', () => goToHistoryPage(getHistoryTotalPages(filteredHistoryRecords.length)));
  document.getElementById('openClearHistoryModalBtn').addEventListener('click', openClearHistoryModal);
  document.getElementById('closeClearHistoryModalBtn').addEventListener('click', closeClearHistoryModal);
  document.getElementById('confirmClearHistoryBtn').addEventListener('click', clearHistory);
  document.getElementById('closeDeleteHistoryModalBtn').addEventListener('click', closeDeleteHistoryModal);
  document.getElementById('confirmDeleteHistoryBtn').addEventListener('click', () => deleteHistoryRow());
  document.getElementById('clearHistoryModal').addEventListener('click', event => {
    if (event.target.id === 'clearHistoryModal') {
      closeClearHistoryModal();
    }
  });
  document.getElementById('deleteHistoryModal').addEventListener('click', event => {
    if (event.target.id === 'deleteHistoryModal') {
      closeDeleteHistoryModal();
    }
  });

  await loadHistory();
});
