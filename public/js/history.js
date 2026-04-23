let allHistoryRecords = [];
let filteredHistoryRecords = [];

function openClearHistoryModal() {
  document.getElementById('clearHistoryModal').classList.add('open');
}

function closeClearHistoryModal() {
  document.getElementById('clearHistoryModal').classList.remove('open');
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
  tbody.innerHTML = `<tr><td colspan="9" class="history-status${tone ? ` ${tone}` : ''}">${message}</td></tr>`;
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

function renderHistoryTable(records) {
  const tbody = document.getElementById('historyBody');
  tbody.innerHTML = '';

  if (records.length === 0) {
    setHistoryMessage('ไม่พบข้อมูลตามคำค้นหา');
    return;
  }

  records.forEach((record, index) => {
    const row = document.createElement('tr');
    const safeName = escapeHtml(`${record.fname} ${record.lname}`);
    const safePhone = escapeHtml(record.phone);
    const safeCompany = escapeHtml(record.company);
    const safePosition = escapeHtml(record.position);
    const safeNote = escapeHtml(record.note || '-');
    const safeAdminNote = escapeHtml(record.admin_note || '');
    const safePrize = escapeHtml(`${record.icon} ${record.prize}`);
    row.innerHTML = `
      <td style="opacity:.4">${records.length - index}</td>
      <td>${safeName}</td>
      <td>${safePhone}</td>
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
    `;
    tbody.appendChild(row);
  });
}

function applySearchFilter() {
  const keyword = document.getElementById('historySearchInput').value.trim().toLowerCase();

  if (!keyword) {
    filteredHistoryRecords = [...allHistoryRecords];
    renderHistoryTable(filteredHistoryRecords);
    return;
  }

  filteredHistoryRecords = allHistoryRecords.filter(record => {
    const text = [
      record.fname,
      record.lname,
      record.phone,
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
    const response = await fetch('/api/history');
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
    const response = await fetch(`/api/admin/history/${recordId}/admin-note`, {
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
    const response = await fetch('/api/admin/history/clear', {
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
    setHistoryMessage(data.message || 'ลบประวัติผู้รับรางวัลเรียบร้อย', 'success');
  } catch (error) {
    setHistoryMessage(error.message || 'ล้างประวัติไม่สำเร็จ', 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'ยืนยันล้างประวัติทั้งหมด';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('historyBody').addEventListener('click', event => {
    const target = event.target;
    if (target.classList.contains('staff-note-save')) {
      saveStaffNote(target.dataset.id);
    }
  });

  document.getElementById('historySearchInput').addEventListener('input', applySearchFilter);
  document.getElementById('exportHistoryCsvBtn').addEventListener('click', exportHistoryCsv);
  document.getElementById('openClearHistoryModalBtn').addEventListener('click', openClearHistoryModal);
  document.getElementById('closeClearHistoryModalBtn').addEventListener('click', closeClearHistoryModal);
  document.getElementById('confirmClearHistoryBtn').addEventListener('click', clearHistory);
  document.getElementById('clearHistoryModal').addEventListener('click', event => {
    if (event.target.id === 'clearHistoryModal') {
      closeClearHistoryModal();
    }
  });

  await loadHistory();
});
