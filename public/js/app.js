/**
 * public/js/app.js
 * Frontend logic — ติดต่อ backend ผ่าน API
 */

// ─── Screen Utility ───────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizePhone(phone) {
  return phone.replace(/[-\s]/g, '');
}

function isValidPhone(phone) {
  const normalized = normalizePhone(phone);
  return /^0\d{9}$/.test(normalized);
}

function getFieldErrorNode(fieldId) {
  const group = document.getElementById(fieldId).closest('.form-group');
  let node = group.querySelector('.field-error');
  if (!node) {
    node = document.createElement('div');
    node.className = 'field-error';
    group.appendChild(node);
  }
  return node;
}

function setFieldError(fieldId, message) {
  const input = document.getElementById(fieldId);
  const errorNode = getFieldErrorNode(fieldId);
  input.classList.add('input-invalid');
  errorNode.textContent = message;
}

function clearFieldError(fieldId) {
  const input = document.getElementById(fieldId);
  const errorNode = getFieldErrorNode(fieldId);
  input.classList.remove('input-invalid');
  errorNode.textContent = '';
}

function clearValidationErrors() {
  ['fname', 'lname', 'phone', 'email', 'company', 'position', 'interest', 'note'].forEach(clearFieldError);
}

function getFormMessageNode() {
  const formCard = document.querySelector('#form-screen .form-card');
  let node = document.getElementById('formInlineMessage');
  if (!node) {
    node = document.createElement('div');
    node.id = 'formInlineMessage';
    node.className = 'form-inline-message';
    formCard.appendChild(node);
  }
  return node;
}

function setFormMessage(message, tone) {
  const node = getFormMessageNode();
  node.textContent = message || '';
  node.className = `form-inline-message${tone ? ` ${tone}` : ''}`;
}

// ─── Form Submit ──────────────────────────────────────────────
async function submitForm() {
  clearValidationErrors();
  setFormMessage('');

  const fields = {
    fname:    document.getElementById('fname').value.trim(),
    lname:    document.getElementById('lname').value.trim(),
    phone:    document.getElementById('phone').value.trim(),
    email:    document.getElementById('email').value.trim(),
    company:  document.getElementById('company').value.trim(),
    position: document.getElementById('position').value.trim(),
    interest: document.getElementById('interest').value,
    note:     document.getElementById('note').value.trim(),
  };

  const requiredLabels = {
    fname: 'กรุณากรอกชื่อ',
    lname: 'กรุณากรอกนามสกุล',
    phone: 'กรุณากรอกเบอร์โทรศัพท์',
    email: 'กรุณากรอกอีเมล',
    company: 'กรุณากรอกชื่อบริษัท / องค์กร',
    position: 'กรุณาเลือกตำแหน่งงาน',
    interest: 'กรุณาเลือกความสนใจ'
  };

  const missingFields = Object.keys(requiredLabels).filter(key => !fields[key]);
  if (missingFields.length > 0) {
    missingFields.forEach(fieldId => setFieldError(fieldId, requiredLabels[fieldId]));
    document.getElementById(missingFields[0]).focus();
    setFormMessage('กรุณาตรวจสอบข้อมูลที่กรอก', 'error');
    return;
  }

  if (!isValidPhone(fields.phone)) {
    setFieldError('phone', 'กรุณากรอกเบอร์โทร 10 หลัก เช่น 0812345678');
    document.getElementById('phone').focus();
    setFormMessage('กรุณาตรวจสอบข้อมูลที่กรอก', 'error');
    return;
  }

  if (!isValidEmail(fields.email)) {
    setFieldError('email', 'รูปแบบอีเมลไม่ถูกต้อง เช่น name@example.com');
    document.getElementById('email').focus();
    setFormMessage('กรุณาตรวจสอบข้อมูลที่กรอก', 'error');
    return;
  }

  fields.phone = normalizePhone(fields.phone);

  try {
    // ตรวจสอบอีเมล/เบอร์ซ้ำก่อน
    const checkRes = await fetch('/api/check-duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: fields.phone, email: fields.email })
    });
    const checkData = await checkRes.json();

    if (!checkRes.ok) {
      throw new Error(checkData.error || 'ตรวจสอบข้อมูลซ้ำไม่สำเร็จ');
    }

    if (checkData.duplicate) {
      showDuplicateScreen(checkData.record, checkData.field);
      return;
    }
  } catch (_) {
    setFormMessage('ไม่สามารถเชื่อมต่อ server ได้ กรุณาลองใหม่อีกครั้ง', 'error');
    return;
  }

  window._pendingFields = fields;
  showScreen('loading-screen');
  startBoxAnimation();
}

// ─── Box Animation ────────────────────────────────────────────
function startBoxAnimation() {
  const lid = document.getElementById('boxLid');
  lid.classList.remove('shake', 'open-lid');
  void lid.offsetWidth;
  lid.classList.add('shake');

  setTimeout(() => {
    lid.classList.remove('shake');
    lid.classList.add('open-lid');
    createSparkles();
  }, 2000);

  setTimeout(async () => {
    try {
      const res  = await fetch('/api/draw', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(window._pendingFields),
      });
      const data = await res.json();

      if (!res.ok) {
        showScreen('form-screen');
        setFormMessage(data.error || 'เกิดข้อผิดพลาด', 'error');
        return;
      }

      showResult(data.prize, window._pendingFields);
    } catch (err) {
      showScreen('form-screen');
      setFormMessage('ไม่สามารถเชื่อมต่อ server ได้ กรุณาลองใหม่อีกครั้ง', 'error');
    }
  }, 3200);
}

function createSparkles() {
  const container = document.getElementById('sparkles');
  container.innerHTML = '';
  const colors = ['#ffd700', '#ff6b6b', '#63b3ed', '#68d391', '#fc8181'];
  for (let i = 0; i < 20; i++) {
    const spark = document.createElement('div');
    spark.className = 'spark';
    const angle = (i / 20) * 360 + Math.random() * 18;
    const dist  = 60 + Math.random() * 80;
    spark.style.cssText = [
      `background:${colors[i % colors.length]}`,
      `--dx:${(Math.cos(angle * Math.PI / 180) * dist).toFixed(1)}px`,
      `--dy:${(Math.sin(angle * Math.PI / 180) * dist).toFixed(1)}px`,
      `animation:sparkOut 0.8s ease-out ${(Math.random() * 0.3).toFixed(2)}s forwards`
    ].join(';');
    container.appendChild(spark);
  }
}

// ─── Result Screen ────────────────────────────────────────────
async function showResult(prize, fields) {
  document.getElementById('winnerName').textContent = `${fields.fname} ${fields.lname}`;
  document.getElementById('prizeIcon').textContent  = prize.icon;
  document.getElementById('prizeName').textContent  = prize.name;
  document.getElementById('prizeQty').textContent   = `ได้รับ 1 ${prize.unit}`;

  // โหลด stock ที่เหลือจาก server
  try {
    const stock = await fetch('/api/stock').then(r => r.json());
    document.getElementById('stockSummary').textContent =
      stock.map(p => `${p.icon} ${p.name}: เหลือ ${p.remaining} ${p.unit}`).join('  ·  ');
  } catch (_) {}

  showScreen('result-screen');
  launchConfetti();
}

// ─── Duplicate Screen ─────────────────────────────────────────
function showDuplicateScreen(record, duplicateField) {
  const dt      = new Date(record.created_at);
  const dateStr = dt.toLocaleDateString('th-TH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  const descNode = document.querySelector('.dup-desc');
  if (descNode) {
    descNode.textContent = duplicateField === 'email'
      ? 'อีเมลนี้เคยร่วมกิจกรรมและรับรางวัลไปแล้ว'
      : 'หมายเลขโทรศัพท์นี้เคยร่วมกิจกรรมและรับรางวัลไปแล้ว';
  }
  document.getElementById('dupName').textContent  = `${record.fname} ${record.lname}`;
  document.getElementById('dupPrize').textContent = `${record.icon} ${record.prize}`;
  document.getElementById('dupDate').textContent  = dateStr;
  showScreen('duplicate-screen');
}

// ─── Confetti ─────────────────────────────────────────────────
function launchConfetti() {
  const colors = ['#ffd700', '#ff6b6b', '#63b3ed', '#68d391', '#c084fc'];
  for (let i = 0; i < 60; i++) {
    setTimeout(() => {
      const el       = document.createElement('div');
      el.className   = 'confetti-piece';
      const size     = 6 + Math.random() * 8;
      const duration = (1.5 + Math.random() * 2).toFixed(2);
      el.style.cssText = [
        `width:${size}px`,
        `height:${(size * (0.4 + Math.random() * 0.8)).toFixed(1)}px`,
        `background:${colors[Math.floor(Math.random() * colors.length)]}`,
        `left:${(Math.random() * 100).toFixed(1)}vw`,
        `top:-10px`,
        `opacity:${(0.7 + Math.random() * 0.3).toFixed(2)}`,
        `animation:confettiFall ${duration}s linear forwards`
      ].join(';');
      document.body.appendChild(el);
      setTimeout(() => el.remove(), parseFloat(duration) * 1000 + 200);
    }, i * 30);
  }
}

// ─── Restart ──────────────────────────────────────────────────
function restart() {
  ['fname', 'lname', 'phone', 'email', 'company', 'position'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('note').value = '';
  document.getElementById('interest').value = '';
  const lid = document.getElementById('boxLid');
  lid.classList.remove('shake', 'open-lid');
  document.getElementById('sparkles').innerHTML = '';
  clearValidationErrors();
  setFormMessage('');
  showScreen('form-screen');
}

// ─── Event Listeners ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  ['fname', 'lname', 'phone', 'email', 'company', 'position', 'interest', 'note'].forEach(id => {
    const eventName = id === 'interest' || id === 'position' ? 'change' : 'input';
    document.getElementById(id).addEventListener(eventName, () => {
      clearFieldError(id);
      setFormMessage('');
    });
  });

  document.getElementById('submitBtn').addEventListener('click', submitForm);
  document.getElementById('restartBtn').addEventListener('click', restart);
  document.getElementById('dupRestartBtn').addEventListener('click', restart);
  document.getElementById('interest').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitForm();
  });
});
