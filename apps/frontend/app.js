/**
 * NOTIYALO — Fixed Frontend Auth + API Layer
 * Drop this into your <script> tag in index.html
 * replacing everything from "const API = ..." to the end
 */

const logger = {
    info:  (...args) => console.info('[Notiyalo]', ...args),
    warn:  (...args) => console.warn('[Notiyalo]', ...args),
    error: (...args) => console.error('[Notiyalo ERROR]', ...args),
};

const API = 'https://notiyalo.onrender.com';
let allNotes = [];
let selectedNote = null;
let aiRunCount = 0;
let authMode = 'login';
let autoSaveTimer = null;
let aiAutoTimer = null;

/* ─── TOKEN MANAGEMENT ─── */
function getToken() {
    return localStorage.getItem('token');
}

function saveTokens(token, refresh) {
    localStorage.setItem('token', token);
    if (refresh) localStorage.setItem('refresh', refresh);
}

function clearTokens() {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh');
    localStorage.removeItem('username');
}

// Silent token refresh — called automatically when a 401 is received
async function refreshAccessToken() {
    const refresh = localStorage.getItem('refresh');
    if (!refresh) return null;
    try {
        const res = await fetch(`${API}/api/auth/refresh/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh })
        });
        if (!res.ok) return null;
        const data = await res.json();
        localStorage.setItem('token', data.token);
        return data.token;
    } catch {
        return null;
    }
}

// Wrapper around fetch — automatically retries once with refreshed token on 401
async function apiFetch(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`,
        ...(options.headers || {})
    };

    let res = await fetch(`${API}${url}`, { ...options, headers });

    // Token expired — try to refresh silently
    if (res.status === 401) {
        const newToken = await refreshAccessToken();
        if (!newToken) {
            // Refresh also failed — log out
            logout();
            return null;
        }
        headers['Authorization'] = `Bearer ${newToken}`;
        res = await fetch(`${API}${url}`, { ...options, headers });
    }

    return res;
}

class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

async function apiRequest(url, options = {}) {
    const res = await apiFetch(url, options);
    if (!res) return null;

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        const msg = data?.error || `Request failed (${res.status})`;
        logger.error(`API error on ${url}:`, msg);
        throw new ApiError(msg, res.status);
    }

    return data;
}

/* ─── AUTH ─── */

let _otpEmail = '';         // email confirmed in step 1
let _resendTimer = null;    // countdown interval handle
const RESEND_COOLDOWN = 60; // seconds

// ── Helpers ──

function authError(msg) {
    const el = document.getElementById('auth-error');
    const ok = document.getElementById('auth-success');
    el.textContent = msg;
    el.classList.add('show');
    ok.classList.remove('show');
}

function authSuccess(msg) {
    const el = document.getElementById('auth-success');
    const err = document.getElementById('auth-error');
    el.textContent = msg;
    el.classList.add('show');
    err.classList.remove('show');
}

function authClearMessages() {
    document.getElementById('auth-error').classList.remove('show');
    document.getElementById('auth-success').classList.remove('show');
}

function setAuthBtn(btnId, text, disabled) {
    const btn = document.getElementById(btnId);
    btn.textContent = text;
    btn.disabled = disabled;
}

function togglePw(inputId, btn) {
    const input = document.getElementById(inputId);
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.textContent = isHidden ? '🙈' : '👁';
}

// Password strength indicator
document.addEventListener('DOMContentLoaded', () => {
    const pwInput = document.getElementById('su-password');
    if (pwInput) {
        pwInput.addEventListener('input', function () {
            const bar = document.getElementById('su-pw-strength');
            const v = this.value;
            let score = 0;
            if (v.length >= 8)                          score++;
            if (/[A-Z]/.test(v))                        score++;
            if (/[0-9]/.test(v))                        score++;
            if (/[^A-Za-z0-9]/.test(v))                 score++;
            const colors = ['#ff4040','#ff8c00','#facc15','#6dfabc'];
            const widths  = ['25%','50%','75%','100%'];
            bar.style.width = v.length ? widths[score - 1] || '25%' : '0%';
            bar.style.background = v.length ? colors[score - 1] || '#ff4040' : 'transparent';
        });
    }
});

// ── Tab switching ──

function switchTab(mode) {
    authClearMessages();

    document.getElementById('tab-login').classList.toggle('active', mode === 'login');
    document.getElementById('tab-signup').classList.toggle('active', mode === 'signup');

    document.getElementById('panel-signup').style.display      = mode === 'signup' ? 'block' : 'none';
    document.getElementById('panel-login-step1').style.display = mode === 'login'  ? 'block' : 'none';
    document.getElementById('panel-login-step2').style.display = 'none';

    // Focus the first field
    setTimeout(() => {
        const el = mode === 'login'
            ? document.getElementById('login-email')
            : document.getElementById('su-username');
        if (el) el.focus();
    }, 50);
}

function goBackToStep1() {
    authClearMessages();
    _stopResendTimer();
    document.getElementById('panel-login-step2').style.display = 'none';
    document.getElementById('panel-login-step1').style.display = 'block';
    document.getElementById('login-otp').value = '';
    document.getElementById('login-email').focus();
}

// ── Signup ──

async function handleSignup() {
    authClearMessages();

    const username = document.getElementById('su-username').value.trim();
    const email    = document.getElementById('su-email').value.trim().toLowerCase();
    const password = document.getElementById('su-password').value;

    // Frontend validation
    if (!username || !email || !password) {
        return authError('Please fill in all fields');
    }
    if (username.length < 3) {
        return authError('Username must be at least 3 characters');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return authError('Username: letters, numbers and underscores only');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return authError('Please enter a valid email address');
    }
    if (password.length < 8) {
        return authError('Password must be at least 8 characters');
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        return authError('Password must contain at least one letter and one number');
    }

    setAuthBtn('btn-signup', 'Creating account...', true);

    try {
        const res  = await fetch(`${API}/api/auth/signup/`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ username, email, password }),
        });
        const data = await res.json();

        if (res.ok && data.token) {
            saveTokens(data.token, data.refresh);
            localStorage.setItem('username', data.username || username);
            initApp(data.username || username);
        } else {
            authError(data.error || 'Signup failed. Please try again.');
        }
    } catch {
        authError('Could not connect to server. Please try again.');
    } finally {
        setAuthBtn('btn-signup', 'Create Account →', false);
    }
}

// ── OTP Step 1: send code ──

async function handleSendOTP() {
    authClearMessages();

    const email = document.getElementById('login-email').value.trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return authError('Please enter a valid email address');
    }

    setAuthBtn('btn-send-otp', 'Sending...', true);

    try {
        const res  = await fetch(`${API}/api/auth/request-otp/`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ email }),
        });
        const data = await res.json();

        if (res.status === 429) {
            return authError(data.error || 'Please wait before requesting another code');
        }
        if (res.status === 503) {
            return authError('Email service is temporarily unavailable. Try again in a moment.');
        }

        // Always advance to step 2 — backend never confirms if email exists
        _otpEmail = email;
        document.getElementById('otp-email-display').textContent = email;
        document.getElementById('otp-attempts-hint').textContent = '';
        document.getElementById('login-otp').value = '';
        document.getElementById('panel-login-step1').style.display = 'none';
        document.getElementById('panel-login-step2').style.display = 'block';
        document.getElementById('login-otp').focus();
        authSuccess(data.message || 'Check your inbox for the 6-digit code');
        _startResendTimer();
    } catch {
        authError('Could not connect to server. Please try again.');
    } finally {
        setAuthBtn('btn-send-otp', 'Send Code →', false);
    }
}

// ── OTP Step 2: verify code ──

async function handleVerifyOTP() {
    authClearMessages();

    const code = document.getElementById('login-otp').value.trim();

    if (!code || !/^\d{6}$/.test(code)) {
        return authError('Enter the 6-digit code from your email');
    }

    setAuthBtn('btn-verify-otp', 'Verifying...', true);

    try {
        const res  = await fetch(`${API}/api/auth/verify-otp/`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ email: _otpEmail, code }),
        });
        const data = await res.json();

        if (res.ok && data.token) {
            _stopResendTimer();
            saveTokens(data.token, data.refresh);
            localStorage.setItem('username', data.username || data.email);
            initApp(data.username || data.email);
        } else {
            // Show remaining attempts hint if backend sends it
            if (data.error && data.error.includes('attempt')) {
                document.getElementById('otp-attempts-hint').textContent = data.error;
                authError('Incorrect code');
            } else {
                authError(data.error || 'Verification failed. Request a new code.');
            }
            // Clear the input for retry
            document.getElementById('login-otp').value = '';
            document.getElementById('login-otp').focus();
        }
    } catch {
        authError('Could not connect to server. Please try again.');
    } finally {
        setAuthBtn('btn-verify-otp', 'Verify & Login →', false);
    }
}

// ── Resend OTP ──

async function handleResendOTP() {
    authClearMessages();
    document.getElementById('login-otp').value = '';
    document.getElementById('otp-attempts-hint').textContent = '';
    _stopResendTimer();
    setAuthBtn('btn-resend-otp', 'Sending...', true);

    try {
        const res  = await fetch(`${API}/api/auth/request-otp/`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ email: _otpEmail }),
        });
        const data = await res.json();

        if (res.status === 429) {
            authError(data.error || 'Please wait before requesting another code');
        } else {
            authSuccess('New code sent! Check your inbox.');
            _startResendTimer();
        }
    } catch {
        authError('Could not send. Try again in a moment.');
    } finally {
        document.getElementById('btn-resend-otp').textContent = 'Resend code';
    }
}

// ── Resend countdown timer ──

function _startResendTimer() {
    let secs = RESEND_COOLDOWN;
    const btn = document.getElementById('btn-resend-otp');
    const timerSpan = document.getElementById('resend-timer');
    btn.disabled = true;
    timerSpan.textContent = `(${secs}s)`;
    _resendTimer = setInterval(() => {
        secs--;
        if (secs <= 0) {
            _stopResendTimer();
        } else {
            timerSpan.textContent = `(${secs}s)`;
        }
    }, 1000);
}

function _stopResendTimer() {
    if (_resendTimer) {
        clearInterval(_resendTimer);
        _resendTimer = null;
    }
    const btn = document.getElementById('btn-resend-otp');
    const timerSpan = document.getElementById('resend-timer');
    if (btn) btn.disabled = false;
    if (timerSpan) timerSpan.textContent = '';
}

// ── Keyboard shortcuts ──

document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const authScreen = document.getElementById('auth-screen');
    if (!authScreen || authScreen.style.display === 'none') return;

    const step2Visible = document.getElementById('panel-login-step2')?.style.display !== 'none';
    const step1Visible = document.getElementById('panel-login-step1')?.style.display !== 'none';
    const signupVisible = document.getElementById('panel-signup')?.style.display !== 'none';

    if (signupVisible) handleSignup();
    else if (step2Visible) handleVerifyOTP();
    else if (step1Visible) handleSendOTP();
});

function initApp(username) {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    const initial = (username || 'U')[0].toUpperCase();
    document.getElementById('user-avatar').textContent = initial;
    document.getElementById('user-name-display').textContent = username || 'User';
    loadNotes();
    setupEditor3D();
}

function logout() {
    const refresh = localStorage.getItem('refresh');
    // Fire-and-forget — blacklist token on backend
    if (refresh) {
        fetch(`${API}/api/auth/logout/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ refresh }),
        }).catch(() => {}); // never block logout on network failure
    }
    clearTokens();
    document.getElementById('app').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
    // Reset to login tab
    switchTab('login');
}

/* ─── ON PAGE LOAD ─── */
window.addEventListener('DOMContentLoaded', async () => {
    const token = getToken();
    const username = localStorage.getItem('username');

    if (token) {
        // Verify token is still valid by calling /me
        try {
            const res = await fetch(`${API}/api/auth/me/`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                initApp(data.username || username);
            } else {
                // Try silent refresh before giving up
                const newToken = await refreshAccessToken();
                if (newToken) {
                    initApp(username);
                } else {
                    clearTokens(); // Token dead — show login
                }
            }
        } catch {
            // Network error — still show app if token exists (offline tolerance)
            initApp(username);
        }
    }

    setupEditor3D();

    document.getElementById('note-content').addEventListener('input', function () {
        document.getElementById('char-count').textContent = this.value.length + ' chars';
    });

    document.getElementById('detail-content').addEventListener('input', function () {
        document.getElementById('detail-char-count').textContent = this.value.length + ' chars';
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(saveDetailNote, 1500);   // auto-save after 1.5s idle
        clearTimeout(aiAutoTimer);
        aiAutoTimer = setTimeout(generateDetailSummary, 3000); // AI after 3s idle
    });
});

/* ─── 3D TILT ─── */
function setupEditor3D() {
    const card = document.getElementById('editor-3d');
    if (!card) return;
    card.addEventListener('mousemove', e => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `perspective(1000px) rotateY(${x * 6}deg) rotateX(${-y * 4}deg)`;
    });
    card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateY(0) rotateX(0)';
    });
}

/* ─── NAV ─── */
function switchSection(id, el) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('section-' + id).classList.add('active');
    el.classList.add('active');
    if (id === 'notes') { loadNotes(); closeNoteDetail(); }
}

/* ─── TOAST ─── */
function toast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show ' + (type || '');
    setTimeout(() => t.className = 'toast', 2500);
}

/* ─── NOTES ─── */
async function loadNotes() {
    const grid = document.getElementById('notes-grid');
    grid.innerHTML = shimmerHTML(); // show skeleton while loading
    try {
        const data = await apiRequest('/api/notes/');
        if (!data) return;
        allNotes = Array.isArray(data) ? data : [];
        renderStats();
        renderNotes(allNotes);
    } catch (e) {
        logger.error('loadNotes failed:', e);
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⚠️</div>
                <div class="empty-text">Couldn't load notes</div>
                <div class="empty-sub">${escHtml(e.message || 'Check your connection and try again')}</div>
                <button onclick="loadNotes()" style="margin-top:12px;padding:8px 16px;border-radius:8px;background:var(--accent);color:white;border:none;cursor:pointer">Retry</button>
            </div>`;
    }
}

function renderStats() {
    document.getElementById('stat-total').textContent = allNotes.length;
    const week = allNotes.filter(n => {
        const d = new Date(n.updated_at || n.created_at || Date.now());
        return (Date.now() - d) < 7 * 86400000;
    }).length;
    document.getElementById('stat-recent').textContent = week;
    const tags = [...new Set(
        allNotes.flatMap(n => (n.tags || '').split(',').map(t => t.trim()).filter(Boolean))
    )].length;
    document.getElementById('stat-tags').textContent = tags;
}

function renderNotes(notes) {
    const grid = document.getElementById('notes-grid');
    const label = document.getElementById('notes-count-label');
    label.textContent = `${notes.length} note${notes.length !== 1 ? 's' : ''}`;
    if (!notes.length) {
        grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🔭</div><div class="empty-text">No notes yet</div><div class="empty-sub">Create your first note in the Dashboard</div></div>`;
        return;
    }
    grid.innerHTML = notes.map(n => `
        <div class="note-card" onclick="openNote(${n.id})">
            <button class="note-delete-btn" onclick="event.stopPropagation();deleteNoteById(${n.id})">✕</button>
            <div class="note-card-title">${escHtml(n.title || 'Untitled')}</div>
            <div class="note-card-preview">${escHtml((n.content || '').slice(0, 150))}</div>
            <div class="note-card-footer">
                <div class="note-tag">${escHtml((n.tags || 'general').split(',')[0].trim())}</div>
                <div class="note-date">${timeAgo(n.updated_at || n.created_at)}</div>
            </div>
        </div>
    `).join('');
}

function filterNotes() {
    const q = document.getElementById('search-input').value.toLowerCase();
    const filtered = allNotes.filter(n =>
        (n.title || '').toLowerCase().includes(q) ||
        (n.content || '').toLowerCase().includes(q) ||
        (n.tags || '').toLowerCase().includes(q)
    );
    renderNotes(filtered);
}

function openNote(id) {
    selectedNote = allNotes.find(n => n.id === id);
    if (!selectedNote) return;
    document.getElementById('notes-content').style.display = 'none';
    document.getElementById('note-detail-view').style.display = 'block';
    document.getElementById('notes-back-btn').style.display = 'flex';
    document.getElementById('notes-page-title').textContent = 'Edit Note';
    document.getElementById('detail-title').value = selectedNote.title || '';
    document.getElementById('detail-content').value = selectedNote.content || '';
    document.getElementById('detail-char-count').textContent = (selectedNote.content || '').length + ' chars';
    document.getElementById('detail-ai-body').innerHTML = `<div class="ai-placeholder"><div class="ai-placeholder-icon">🤖</div><p>Edit your note and AI will analyse it automatically</p></div>`;
}

function closeNoteDetail() {
    selectedNote = null;
    document.getElementById('notes-content').style.display = 'block';
    document.getElementById('note-detail-view').style.display = 'none';
    document.getElementById('notes-back-btn').style.display = 'none';
    document.getElementById('notes-page-title').textContent = 'My Notes';
}

async function saveDetailNote() {
    if (!selectedNote) return;
    try {
        const title = sanitizeInput(document.getElementById('detail-title').value);
        const content = sanitizeInput(document.getElementById('detail-content').value);
        
        // FIXED: was PUT to wrong URL — now PATCH to correct endpoint
        const updated = await apiRequest(`/api/notes/update/${selectedNote.id}/`, {
            method: 'PATCH',
            body: JSON.stringify({
                title: title,
                content: content,
                tags: selectedNote.tags || 'general'
            })
        });
        if (updated) {
            toast('Saved ✓');
            // Update local cache without full reload
            const idx = allNotes.findIndex(n => n.id === selectedNote.id);
            if (idx !== -1) allNotes[idx] = updated;
            selectedNote = updated;
        } else {
            toast('Save failed', 'error');
        }
    } catch (e) {
        logger.error('saveDetailNote failed:', e);
        toast(e.message || 'Error saving note', 'error');
    }
}

async function deleteNote() {
    if (!selectedNote || !confirm('Delete this note?')) return;
    await deleteNoteById(selectedNote.id);
    closeNoteDetail();
}

async function deleteNoteById(id) {
    try {
        const data = await apiRequest(`/api/notes/delete/${id}/`, { method: 'DELETE' });
        if (data) {
            toast('Note deleted');
            allNotes = allNotes.filter(n => n.id !== id);
            renderNotes(allNotes);
            renderStats();
        } else {
            toast('Error deleting', 'error');
        }
    } catch (e) {
        toast(e.message || 'Error deleting', 'error');
    }
}

async function saveNote() {
    const title = sanitizeInput(document.getElementById('note-title').value);
    const content = sanitizeInput(document.getElementById('note-content').value);
    if (!content) { toast('Write something first!', 'error'); return; }

    const btn = document.getElementById('save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        const newNote = await apiRequest('/api/notes/create/', {
            method: 'POST',
            body: JSON.stringify({ title: title || 'Untitled', content, tags: 'general' })
        });
        if (!newNote) throw new Error('Failed');
        allNotes.unshift(newNote);
        renderStats();
        toast('Note saved ✓');
        document.getElementById('note-title').value = '';
        document.getElementById('note-content').value = '';
        document.getElementById('char-count').textContent = '0 chars';
        document.getElementById('ai-body').innerHTML = `<div class="ai-placeholder"><div class="ai-placeholder-icon">🔮</div><p>Write something to get AI insights</p></div>`;
    } catch (e) {
        toast(e.message || 'Error saving note', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Note ✓';
    }
}

/* ─── AI ─── */
async function generateSummary() {
    const content = document.getElementById('note-content').value.trim();
    if (!content) { toast('Write something first!', 'error'); return; }

    const btn = document.getElementById('ai-gen-btn');
    btn.disabled = true;
    document.getElementById('ai-btn-text').innerHTML = `<div class="ai-loading"><div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div></div>`;
    document.getElementById('ai-body').innerHTML = shimmerHTML();

    try {
        const data = await apiRequest('/api/ai/summary/', {
            method: 'POST',
            body: JSON.stringify({ content })
        });
        if (!data) throw new Error('Failed');
        renderAISummary('ai-body', data);
        aiRunCount++;
        document.getElementById('stat-ai').textContent = aiRunCount;
    } catch (e) {
        document.getElementById('ai-body').innerHTML = `<div style="padding:20px;color:#ff8080;font-size:13px">${escHtml(e.message || 'Failed to generate — try again in a moment')}</div>`;
    } finally {
        btn.disabled = false;
        document.getElementById('ai-btn-text').textContent = '✦ Generate AI Summary';
    }
}

async function generateDetailSummary() {
    const content = document.getElementById('detail-content').value.trim();
    if (!content) return;
    const body = document.getElementById('detail-ai-body');
    body.innerHTML = shimmerHTML();
    try {
        const data = await apiRequest('/api/ai/summary/', {
            method: 'POST',
            body: JSON.stringify({ content })
        });
        if (!data) throw new Error();
        renderAISummary('detail-ai-body', data);
        aiRunCount++;
        document.getElementById('stat-ai').textContent = aiRunCount;
    } catch (e) {
        body.innerHTML = `<div style="padding:20px;color:#ff8080;font-size:13px">${escHtml(e.message || 'Failed to analyse')}</div>`;
    }
}

function shimmerHTML() {
    return `<div style="padding:20px;display:flex;flex-direction:column;gap:10px">
        <div class="shimmer" style="height:14px;width:60%"></div>
        <div class="shimmer" style="height:14px;width:90%"></div>
        <div class="shimmer" style="height:14px;width:75%"></div>
    </div>`;
}

function renderAISummary(elId, data) {
    const el = document.getElementById(elId);
    el.innerHTML = `<div class="ai-result">
        <div class="ai-section-label blue">✦ Summary</div>
        <div class="ai-text">${escHtml(data.summary || '')}</div>
        ${data.insights?.length ? `
            <div class="ai-section-label green" style="margin-top:16px">⚡ Key Insights</div>
            ${data.insights.map(i => `<div class="ai-insight">${escHtml(i)}</div>`).join('')}
        ` : ''}
        ${data.title ? `
            <div class="ai-section-label pink" style="margin-top:16px">✨ Suggested Title</div>
            <div class="ai-suggested-title">${escHtml(data.title)}</div>
        ` : ''}
    </div>`;
}

/* ─── AI CHAT ─── */
const chatHistory = [];

function chatKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}
function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const q = sanitizeInput(input.value);
    if (!q) return;
    input.value = '';
    input.style.height = 'auto';
    appendMsg('user', q);
    chatHistory.push({ role: 'user', content: q });
    const btn = document.getElementById('send-btn');
    btn.disabled = true;
    appendTyping();
    try {
        const data = await apiRequest('/api/ai/chat/', {
            method: 'POST',
            body: JSON.stringify({ question: q })
        });
        if (!data) throw new Error('Failed');
        removeTyping();
        const answer = data.answer || 'No response';
        appendMsg('ai', answer);
        chatHistory.push({ role: 'assistant', content: answer });
    } catch (e) {
        removeTyping();
        appendMsg('ai', e.message || "Couldn't reach AI right now — try again in a moment 🔌");
    } finally {
        btn.disabled = false;
    }
}

function appendMsg(role, text) {
    const msgs = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.innerHTML = `<div class="msg-avatar">${role === 'user' ? '👤' : '✦'}</div><div class="msg-bubble">${escHtml(text)}</div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
}

function appendTyping() {
    const msgs = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'msg ai';
    div.id = 'typing-msg';
    div.innerHTML = `<div class="msg-avatar">✦</div><div class="msg-bubble"><div class="typing-indicator"><div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div></div></div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
}
function removeTyping() {
    const t = document.getElementById('typing-msg');
    if (t) t.remove();
}
function clearChat() {
    document.getElementById('chat-messages').innerHTML = `<div class="msg ai"><div class="msg-avatar">✦</div><div class="msg-bubble">Chat cleared! What's up? 🌊</div></div>`;
    chatHistory.length = 0;
}

/* ─── UTILS ─── */
function sanitizeInput(str) {
    if (typeof str !== 'string') return '';
    return str
        .trim()
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\x00/g, '');
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function timeAgo(dateStr) {
    if (!dateStr) return 'just now';
    const diff = (Date.now() - new Date(dateStr)) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
}
