function setLoginMessage(message, tone) {
  const node = document.getElementById('loginMessage');
  if (!node) return;
  node.textContent = message || '';
  node.className = `form-inline-message${tone ? ` ${tone}` : ''}`;
}

function getRedirectPath() {
  const url = new URL(window.location.href);
  const redirect = url.searchParams.get('redirect') || '/admin.html';
  if (!redirect.startsWith('/')) return '/admin.html';
  if (redirect.startsWith('/login.html')) return '/admin.html';
  return redirect;
}

async function submitLogin(event) {
  event.preventDefault();
  setLoginMessage('');

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (!username || !password) {
    setLoginMessage('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน', 'error');
    return;
  }

  const submitBtn = document.getElementById('loginSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'กำลังเข้าสู่ระบบ...';

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'เข้าสู่ระบบไม่สำเร็จ');
    }

    window.Auth.setToken(data.token || '');
    window.location.replace(getRedirectPath());
  } catch (error) {
    setLoginMessage(error.message || 'เข้าสู่ระบบไม่สำเร็จ', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'เข้าสู่ระบบ';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.Auth.getToken()) {
    window.location.replace(getRedirectPath());
    return;
  }

  document.getElementById('loginForm').addEventListener('submit', submitLogin);
});
