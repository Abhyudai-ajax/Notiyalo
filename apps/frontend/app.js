/**
 * NOTIYALO — Fixed Frontend Auth + API Layer
 * Drop this into your <script> tag in index.html
 * replacing everything from "const API = ..." to the end
 */

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

/* ─── AUTH ─── */

let otpStep = 1;
let otpEmail = '';

function switchTab(mode) {

    authMode = mode;

    document.querySelectorAll('.auth-tab').forEach((t, i) =>
        t.classList.toggle('active', i === (mode === 'login' ? 0 : 1))
    );

    document.getElementById('auth-error').classList.remove('show');

    otpStep = 1;

    renderAuthStep();

    // Show/hide signup-only fields
    const isSignup = mode === 'signup';

    document.getElementById('username-field').style.display =
        isSignup ? 'block' : 'none';

    document.getElementById('email-field').style.display =
        isSignup ? 'block' : 'none';

    document.getElementById('password-field').style.display =
        isSignup ? 'block' : 'none';

    document.getElementById('otp-email-field').style.display =
        isSignup ? 'none' : 'block';
}

function renderAuthStep() {

    const isLogin = authMode === 'login';

    const step1 = document.getElementById('auth-step-1');
    const step2 = document.getElementById('auth-step-2');

    if (isLogin) {

        step1.style.display =
            otpStep === 1 ? 'block' : 'none';

        step2.style.display =
            otpStep === 2 ? 'block' : 'none';

        document.getElementById('auth-submit').textContent =
            otpStep === 1
                ? 'Send OTP →'
                : 'Verify & Login →';

    } else {

        step1.style.display = 'block';
        step2.style.display = 'none';

        document.getElementById('auth-submit').textContent =
            'Create Account →';
    }
}

async function handleAuth() {

    const errEl = document.getElementById('auth-error');
    const btn = document.getElementById('auth-submit');

    errEl.classList.remove('show');

    // SIGNUP FLOW

    if (authMode === 'signup') {

        const username =
            document.getElementById('auth-username').value.trim();

        const email =
            document.getElementById('auth-email').value.trim();

        const password =
            document.getElementById('auth-password').value;

        if (!username || !email || !password) {

            errEl.textContent =
                'Please fill in all fields';

            errEl.classList.add('show');

            return;
        }

        const emailRegex =
            /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

        if (!emailRegex.test(email)) {

            errEl.textContent =
                'Please enter a valid email address';

            errEl.classList.add('show');

            return;
        }

        if (password.length < 8) {

            errEl.textContent =
                'Password must be at least 8 characters';

            errEl.classList.add('show');

            return;
        }

        if (username.length < 3) {

            errEl.textContent =
                'Username must be at least 3 characters';

            errEl.classList.add('show');

            return;
        }

        btn.disabled = true;
        btn.textContent = 'Please wait...';

        try {

            const res = await fetch(`${API}/api/auth/signup/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username,
                    email,
                    password
                })
            });

            const data = await res.json();

            if (res.ok && data.token) {

                saveTokens(data.token, data.refresh);

                localStorage.setItem(
                    'username',
                    data.username || username
                );

                initApp(data.username || username);

            } else {

                errEl.textContent =
                    data.error || 'Signup failed';

                errEl.classList.add('show');
            }

        } catch {

            errEl.textContent =
                'Server error — try again in 30s';

            errEl.classList.add('show');

        } finally {

            btn.disabled = false;
            btn.textContent = 'Create Account →';
        }

        return;
    }

    // OTP LOGIN FLOW

    if (otpStep === 1) {

        const email =
            document.getElementById('auth-otp-email')
                .value
                .trim()
                .toLowerCase();

        const emailRegex =
            /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

        if (!email || !emailRegex.test(email)) {

            errEl.textContent =
                'Please enter a valid email address';

            errEl.classList.add('show');

            return;
        }

        btn.disabled = true;
        btn.textContent = 'Sending...';

        try {

            const res = await fetch(
                `${API}/api/auth/request-otp/`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email })
                }
            );

            const data = await res.json();

            if (res.ok) {

                otpEmail = email;

                otpStep = 2;

                renderAuthStep();

                document.getElementById('otp-hint').textContent =
                    `Code sent to ${email}`;

            } else {

                errEl.textContent =
                    data.error || 'Failed to send OTP';

                errEl.classList.add('show');
            }

        } catch {

            errEl.textContent =
                'Server error — try again in 30s';

            errEl.classList.add('show');

        } finally {

            btn.disabled = false;

            renderAuthStep();
        }

    } else {

        const code =
            document.getElementById('auth-otp-code')
                .value
                .trim();

        if (!code || code.length !== 6) {

            errEl.textContent =
                'Enter the 6-digit code from your email';

            errEl.classList.add('show');

            return;
        }

        btn.disabled = true;
        btn.textContent = 'Verifying...';

        try {

            const res = await fetch(
                `${API}/api/auth/verify-otp/`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email: otpEmail,
                        code
                    })
                }
            );

            const data = await res.json();

            if (res.ok && data.access) {

                saveTokens(data.access, data.refresh);

                localStorage.setItem(
                    'username',
                    data.email
                );

                initApp(data.email);

            } else {

                errEl.textContent =
                    data.error || 'Invalid OTP';

                errEl.classList.add('show');
            }

        } catch {

            errEl.textContent =
                'Server error — try again';

            errEl.classList.add('show');

        } finally {

            btn.disabled = false;

            btn.textContent =
                'Verify & Login →';
        }
    }
}

// NEW ENTER KEY LOGIC

document.addEventListener('keydown', e => {

    if (
        e.key === 'Enter' &&
        document.getElementById('auth-screen').style.display !== 'none'
    ) {
        handleAuth();
    }
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
    clearTokens();
    document.getElementById('app').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
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
    try {
        const res = await apiFetch('/api/notes/');
        if (!res) return;
        const data = await res.json();
        allNotes = Array.isArray(data) ? data : [];
        renderStats();
        renderNotes(allNotes);
    } catch (e) {
        console.error('loadNotes failed:', e);
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
        // FIXED: was PUT to wrong URL — now PATCH to correct endpoint
        const res = await apiFetch(`/api/notes/update/${selectedNote.id}/`, {
            method: 'PATCH',
            body: JSON.stringify({
                title: document.getElementById('detail-title').value,
                content: document.getElementById('detail-content').value,
                tags: selectedNote.tags || 'general'
            })
        });
        if (res && res.ok) {
            toast('Saved ✓');
            const updated = await res.json();
            // Update local cache without full reload
            const idx = allNotes.findIndex(n => n.id === selectedNote.id);
            if (idx !== -1) allNotes[idx] = updated;
            selectedNote = updated;
        } else {
            toast('Save failed', 'error');
        }
    } catch (e) {
        console.error('saveDetailNote failed:', e);
    }
}

async function deleteNote() {
    if (!selectedNote || !confirm('Delete this note?')) return;
    await deleteNoteById(selectedNote.id);
    closeNoteDetail();
}

async function deleteNoteById(id) {
    try {
        const res = await apiFetch(`/api/notes/delete/${id}/`, { method: 'DELETE' });
        if (res && res.ok) {
            toast('Note deleted');
            allNotes = allNotes.filter(n => n.id !== id);
            renderNotes(allNotes);
            renderStats();
        } else {
            toast('Error deleting', 'error');
        }
    } catch (e) {
        toast('Error deleting', 'error');
    }
}

async function saveNote() {
    const title = document.getElementById('note-title').value.trim();
    const content = document.getElementById('note-content').value.trim();
    if (!content) { toast('Write something first!', 'error'); return; }

    const btn = document.getElementById('save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        const res = await apiFetch('/api/notes/create/', {
            method: 'POST',
            body: JSON.stringify({ title: title || 'Untitled', content, tags: 'general' })
        });
        if (!res || !res.ok) throw new Error('Failed');
        const newNote = await res.json();
        allNotes.unshift(newNote);
        renderStats();
        toast('Note saved ✓');
        document.getElementById('note-title').value = '';
        document.getElementById('note-content').value = '';
        document.getElementById('char-count').textContent = '0 chars';
        document.getElementById('ai-body').innerHTML = `<div class="ai-placeholder"><div class="ai-placeholder-icon">🔮</div><p>Write something to get AI insights</p></div>`;
    } catch (e) {
        toast('Error saving note', 'error');
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
        const res = await apiFetch('/api/ai/summary/', {
            method: 'POST',
            body: JSON.stringify({ content })
        });
        if (!res || !res.ok) throw new Error('HTTP ' + (res?.status || '?'));
        const data = await res.json();
        renderAISummary('ai-body', data);
        aiRunCount++;
        document.getElementById('stat-ai').textContent = aiRunCount;
    } catch (e) {
        document.getElementById('ai-body').innerHTML = `<div style="padding:20px;color:#ff8080;font-size:13px">Failed to generate — try again in a moment</div>`;
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
        const res = await apiFetch('/api/ai/summary/', {
            method: 'POST',
            body: JSON.stringify({ content })
        });
        if (!res || !res.ok) throw new Error();
        const data = await res.json();
        renderAISummary('detail-ai-body', data);
        aiRunCount++;
        document.getElementById('stat-ai').textContent = aiRunCount;
    } catch (e) {
        body.innerHTML = `<div style="padding:20px;color:#ff8080;font-size:13px">Failed to analyse</div>`;
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
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    input.style.height = 'auto';
    appendMsg('user', q);
    chatHistory.push({ role: 'user', content: q });
    const btn = document.getElementById('send-btn');
    btn.disabled = true;
    appendTyping();
    try {
        const res = await apiFetch('/api/ai/chat/', {
            method: 'POST',
            body: JSON.stringify({ question: q })
        });
        if (!res || !res.ok) throw new Error('HTTP ' + (res?.status || '?'));
        const data = await res.json();
        removeTyping();
        const answer = data.answer || 'No response';
        appendMsg('ai', answer);
        chatHistory.push({ role: 'assistant', content: answer });
    } catch (e) {
        removeTyping();
        appendMsg('ai', "Couldn't reach AI right now — try again in a moment 🔌");
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
