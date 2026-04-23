let adminMessageTimer = null;

function setAdminMessage(message, tone) {
  const target = document.getElementById('adminMessage');
  if (!target) {
    return;
  }

  target.textContent = message || '';
  target.className = `admin-toast open${tone ? ` ${tone}` : ''}`;

  if (adminMessageTimer) {
    window.clearTimeout(adminMessageTimer);
  }

  if (!message) {
    target.className = 'admin-toast';
    return;
  }

  adminMessageTimer = window.setTimeout(() => {
    target.className = 'admin-toast';
  }, tone === 'error' ? 4500 : 2800);
}

function openPrizeModal() {
  document.getElementById('prizeModal').classList.add('open');
  document.getElementById('prizeName').focus();
}

function closePrizeModal() {
  document.getElementById('prizeModal').classList.remove('open');
}

function openClearStockModal() {
  document.getElementById('clearStockModal').classList.add('open');
}

function closeClearStockModal() {
  document.getElementById('clearStockModal').classList.remove('open');
}

function openAdjustQuantityModal(prizeId, prizeName, currentQuantity) {
  document.getElementById('adjustQuantityModal').classList.add('open');
  document.getElementById('adjustPrizeName').value = prizeName;
  document.getElementById('adjustQuantityInput').value = currentQuantity;
  document.getElementById('confirmAdjustCheckbox').checked = false;
  document.getElementById('adjustQuantityInput').focus();
  // Store the prize ID in the modal for later use
  document.getElementById('adjustQuantityModal').dataset.prizeId = prizeId;
}

function closeAdjustQuantityModal() {
  document.getElementById('adjustQuantityModal').classList.remove('open');
  document.getElementById('adjustQuantityForm').reset();
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  values.push(current.trim());
  return values;
}

function parseCsvToItems(csvText) {
  const lines = csvText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    throw new Error('ไฟล์ CSV ว่างเปล่า');
  }

  const firstCols = parseCsvLine(lines[0]).map(v => v.toLowerCase());
  const hasHeader = firstCols.includes('name') && firstCols.includes('unit') && firstCols.includes('quantity');
  const startIndex = hasHeader ? 1 : 0;
  const items = [];

  for (let i = startIndex; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 3) {
      throw new Error(`รูปแบบ CSV ไม่ถูกต้องที่บรรทัด ${i + 1}`);
    }

    const name = cols[0];
    const unit = cols[1];
    const quantity = Number(cols[2]);
    if (!name || !unit || !Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(`ข้อมูลไม่ถูกต้องที่บรรทัด ${i + 1}`);
    }

    items.push({ name, unit, quantity });
  }

  if (items.length === 0) {
    throw new Error('ไม่พบข้อมูลที่นำเข้าได้ในไฟล์ CSV');
  }
  return items;
}

async function importCsv() {
  const fileInput = document.getElementById('csvFileInput');
  const file = fileInput.files[0];
  if (!file) {
    setAdminMessage('กรุณาเลือกไฟล์ CSV ก่อน import', 'error');
    return;
  }

  try {
    const csvText = await file.text();
    const items = parseCsvToItems(csvText);
    setAdminMessage('กำลังนำเข้าข้อมูล CSV...', '');

    const response = await fetch('/api/admin/prizes/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'นำเข้าของรางวัลไม่สำเร็จ');
    }

    fileInput.value = '';
    setAdminMessage(data.message || 'นำเข้าของรางวัลสำเร็จ', 'success');
    await loadStock();
  } catch (error) {
    setAdminMessage(error.message || 'นำเข้าของรางวัลไม่สำเร็จ', 'error');
  }
}

async function loadStock() {
  const tbody = document.getElementById('stockBody');

  try {
    const response = await fetch('/api/stock');
    const stock = await response.json();
    tbody.innerHTML = '';

    if (!response.ok) {
      throw new Error('โหลด stock ไม่สำเร็จ');
    }

    if (stock.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="history-status">ยังไม่มีของรางวัล</td></tr>';
      return;
    }

    stock.forEach((item, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="opacity:.4">${index + 1}</td>
        <td>${item.icon} ${item.name}</td>
        <td>${item.unit}</td>
        <td>${item.remaining}</td>
        <td style="text-align:center;">
          <button type="button" class="stock-adjust-btn" data-id="${item.id}" data-name="${item.icon} ${item.name}" data-current="${item.remaining}">
            ⚙️ ปรับจำนวน
          </button>
        </td>
      `;
      tbody.appendChild(row);
    });

    // Add event listeners to adjust buttons
    document.querySelectorAll('.stock-adjust-btn').forEach(btn => {
      btn.addEventListener('click', event => {
        openAdjustQuantityModal(event.target.dataset.id, event.target.dataset.name, event.target.dataset.current);
      });
    });
  } catch (_) {
    tbody.innerHTML = '<tr><td colspan="5" class="history-status error">โหลด stock ไม่สำเร็จ</td></tr>';
  }
}

async function submitPrizeForm(event) {
  event.preventDefault();

  const payload = {
    name: document.getElementById('prizeName').value.trim(),
    unit: document.getElementById('prizeUnit').value.trim(),
    quantity: Number(document.getElementById('prizeQuantity').value)
  };

  if (!payload.name || !payload.unit || !Number.isInteger(payload.quantity) || payload.quantity <= 0) {
    setAdminMessage('กรอกข้อมูลของรางวัลให้ครบและใส่จำนวนมากกว่า 0', 'error');
    return;
  }

  setAdminMessage('กำลังบันทึกข้อมูล...', '');

  try {
    const response = await fetch('/api/admin/prizes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'บันทึกข้อมูลไม่สำเร็จ');
    }

    document.getElementById('adminPrizeForm').reset();
    setAdminMessage(data.message || 'บันทึกของรางวัลเรียบร้อย', 'success');
    closePrizeModal();
    await loadStock();
  } catch (error) {
    setAdminMessage(error.message || 'บันทึกข้อมูลไม่สำเร็จ', 'error');
  }
}

async function clearStock() {
  const confirmBtn = document.getElementById('confirmClearStockBtn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'กำลังเคลียร์...';

  try {
    const response = await fetch('/api/admin/stock/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'เคลียร์ stock ไม่สำเร็จ');
    }

    setAdminMessage(data.message || 'เคลียร์ stock เรียบร้อย', 'success');
    closeClearStockModal();
    await loadStock();
  } catch (error) {
    setAdminMessage(error.message || 'เคลียร์ stock ไม่สำเร็จ', 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'ยืนยันเคลียร์ทั้งหมด';
  }
}

async function submitAdjustQuantityForm(event) {
  event.preventDefault();

  const modal = document.getElementById('adjustQuantityModal');
  const prizeId = modal.dataset.prizeId;
  const newQuantity = Number(document.getElementById('adjustQuantityInput').value);
  const isConfirmed = document.getElementById('confirmAdjustCheckbox').checked;

  if (!isConfirmed) {
    setAdminMessage('กรุณากาถูกช่อง ยืนยันการปรับจำนวน', 'error');
    return;
  }

  if (!Number.isInteger(newQuantity) || newQuantity < 0) {
    setAdminMessage('กรุณากรอกจำนวนที่ถูกต้อง (ต้องเป็นตัวเลขไม่น้อยกว่า 0)', 'error');
    return;
  }

  setAdminMessage('กำลังบันทึกการปรับจำนวน...', '');

  try {
    const response = await fetch(`/api/admin/stock/${prizeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: newQuantity })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'ปรับปรุง stock ไม่สำเร็จ');
    }

    setAdminMessage(data.message || 'ปรับปรุง stock เรียบร้อย', 'success');
    closeAdjustQuantityModal();
    await loadStock();
  } catch (error) {
    setAdminMessage(error.message || 'ปรับปรุง stock ไม่สำเร็จ', 'error');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('openPrizeModalBtn').addEventListener('click', openPrizeModal);
  document.getElementById('closePrizeModalBtn').addEventListener('click', closePrizeModal);
  document.getElementById('openClearStockModalBtn').addEventListener('click', openClearStockModal);
  document.getElementById('closeClearStockModalBtn').addEventListener('click', closeClearStockModal);
  document.getElementById('closeAdjustQuantityModalBtn').addEventListener('click', closeAdjustQuantityModal);
  document.getElementById('confirmClearStockBtn').addEventListener('click', clearStock);
  document.getElementById('importCsvBtn').addEventListener('click', importCsv);
  document.getElementById('prizeModal').addEventListener('click', event => {
    if (event.target.id === 'prizeModal') {
      closePrizeModal();
    }
  });
  document.getElementById('clearStockModal').addEventListener('click', event => {
    if (event.target.id === 'clearStockModal') {
      closeClearStockModal();
    }
  });
  document.getElementById('adjustQuantityModal').addEventListener('click', event => {
    if (event.target.id === 'adjustQuantityModal') {
      closeAdjustQuantityModal();
    }
  });
  document.getElementById('adminPrizeForm').addEventListener('submit', submitPrizeForm);
  document.getElementById('adjustQuantityForm').addEventListener('submit', submitAdjustQuantityForm);
  await loadStock();
});
