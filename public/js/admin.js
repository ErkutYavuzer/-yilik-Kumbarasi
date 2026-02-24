const socket = io();
let wishes = [];
let modalAction = null;
let autoTimer = null;
let autoIndex = 0;

// ─── AUTHENTICATION ───
if (sessionStorage.getItem('adminAuth') === 'true') {
    document.getElementById('auth-overlay').style.display = 'none';
}
function checkAuth() {
    const pass = document.getElementById('auth-pass').value;
    if (pass === '1234') {
        sessionStorage.setItem('adminAuth', 'true');
        document.getElementById('auth-overlay').style.display = 'none';
        showToast('Giriş başarılı');
    } else {
        document.getElementById('auth-error').style.display = 'block';
        setTimeout(() => document.getElementById('auth-error').style.display = 'none', 3000);
    }
}

// ─── UI MODE (Dark / Light) ───
const savedMode = localStorage.getItem('adminUIMode') || 'dark';
setUIMode(savedMode);

function setUIMode(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    localStorage.setItem('adminUIMode', mode);
    const pillDark = document.getElementById('pill-dark');
    const pillLight = document.getElementById('pill-light');
    if (pillDark) pillDark.classList.toggle('active', mode === 'dark');
    if (pillLight) pillLight.classList.toggle('active', mode === 'light');
}

// ─── SIDEBAR TOGGLE ───
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';

if (isCollapsed) {
    sidebar.classList.add('collapsed');
}

if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
        const collapsed = sidebar.classList.toggle('collapsed');
        localStorage.setItem('sidebarCollapsed', collapsed);
    });
}

// ─── SYSTEM STATUS ───
function updateStatus(id, state, text) {
    const indicator = document.getElementById(`status-${id}`);
    const textEl = document.getElementById(`status-${id}-text`);
    if (indicator) {
        indicator.className = 'status-indicator ' + state;
    }
    if (textEl) {
        textEl.textContent = text;
        textEl.className = 'status-value ' + state;
    }
}

// Socket Connection Status
socket.on('connect', () => {
    updateStatus('socket', 'online', 'Bağlı');
});

socket.on('disconnect', () => {
    updateStatus('socket', 'offline', 'Bağlantı Kesildi');
});

// Periodic Server Check
async function checkServerStatus() {
    try {
        const start = Date.now();
        const res = await fetch('/api/wishes', { method: 'HEAD' });
        const latency = Date.now() - start;
        if (res.ok) {
            updateStatus('server', 'online', `Aktif (${latency}ms)`);
        } else {
            updateStatus('server', 'warning', 'Sorunlu');
        }
    } catch (e) {
        updateStatus('server', 'offline', 'Erişilemiyor');
    }
}

setInterval(checkServerStatus, 5000);
checkServerStatus();

// Auto Spotlight Status Check
async function checkAutoStatus() {
    try {
        const res = await fetch('/api/auto-spotlight/status');
        const data = await res.json();
        const text = data.active ? `Aktif (${data.delay}s)` : 'Kapalı';
        const state = data.active ? 'online' : 'offline';
        updateStatus('slideshow', state, text);

        // UI elemanlarını senkronize et
        const startBtn = document.getElementById('auto-start-btn');
        const stopBtn = document.getElementById('auto-stop-btn');
        const statusEl = document.getElementById('auto-status');
        const delayEl = document.getElementById('auto-delay');

        if (startBtn && stopBtn && statusEl) {
            startBtn.style.display = data.active ? 'none' : '';
            stopBtn.style.display = data.active ? '' : 'none';
            statusEl.classList.toggle('active', data.active);
            if (data.delay && delayEl) delayEl.value = data.delay;
        }
    } catch (e) { }
}
setInterval(checkAutoStatus, 3000);
checkAutoStatus();

// ─── VIEW MODE (Table / Grid) ───
let viewMode = localStorage.getItem('adminViewMode') || 'table';

function setViewMode(mode) {
    viewMode = mode;
    localStorage.setItem('adminViewMode', mode);

    const tableBtn = document.getElementById('view-table-btn');
    const gridBtn = document.getElementById('view-grid-btn');
    if (tableBtn) tableBtn.classList.toggle('active', mode === 'table');
    if (gridBtn) gridBtn.classList.toggle('active', mode === 'grid');

    renderWishes();
}

// ─── TAB NAVIGATION ───
function switchTab(name, btn) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const panel = document.getElementById('tab-' + name);
    if (panel) panel.classList.add('active');

    if (btn) btn.classList.add('active');

    const titles = {
        dashboard: '📊 Dashboard',
        qr: '📱 QR Kod',
        moderation: '🤖 Moderasyon',
        slideshow: '🔄 Slayt Gösterisi',
        theme: '🎨 Tema',
        upload: '📸 Dilek Ekle',
        wishes: '🏺 Tüm Dilekler',
        raffle: '🎁 Çekiliş Yönetimi',
        stats: '📈 İstatistikler'
    };
    document.getElementById('topbar-title').textContent = titles[name] || '';

    // Sekmeye özel yüklemeler
    if (name === 'stats') {
        loadStats();
    }

    if (name === 'moderation') {
        loadModerationLog();
    }

    if (name === 'wishes') {
        setViewMode(viewMode);
    }
}

// ─── SOCKET ───
socket.on('new-wish', () => loadWishes());
socket.on('wish-deleted', () => loadWishes());
socket.on('all-cleared', () => loadWishes());
socket.on('moderation-state', (data) => setModerationUI(data));

// ─── LOAD WISHES ───
let currentQuickFilter = 'all';

function getFilteredWishes() {
    let filtered = [...wishes].reverse();

    if (currentQuickFilter === 'today') {
        const todayStr = new Date().toDateString();
        filtered = filtered.filter(w => new Date(w.timestamp).toDateString() === todayStr);
    } else if (currentQuickFilter === 'photo') {
        filtered = filtered.filter(w => w.photoUrl);
    } else if (currentQuickFilter === 'text') {
        filtered = filtered.filter(w => !w.photoUrl);
    } else if (currentQuickFilter === 'spotlight') {
        filtered = filtered.filter(w => w.isSpotlight);
    }

    const searchInput = document.querySelector('#tab-wishes .search-box input');
    const q = searchInput ? searchInput.value.toLowerCase() : '';
    if (q) {
        filtered = filtered.filter(w => {
            const text = (w.childName + ' ' + (w.wishText || '') + ' ' + formatTime(w.timestamp)).toLowerCase();
            return text.includes(q);
        });
    }

    return filtered;
}

function applyQuickFilter(filter, btnElement) {
    currentQuickFilter = filter;
    document.querySelectorAll('.filter-chips .btn').forEach(b => b.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
    renderWishes();
}

async function loadWishes() {
    try {
        const res = await fetch('/api/wishes');
        wishes = await res.json();
        renderWishes();
        renderRecent();
        updateStats();
        updateBulkActions();
    } catch (e) {
        console.error(e);
    }
}

function renderWishes() {
    const tableContainer = document.getElementById('wishes-table-container');
    const gridContainer = document.getElementById('wishes-grid-container');
    const empty = document.getElementById('empty-state');

    const filteredWishes = getFilteredWishes();

    if (!filteredWishes.length) {
        if (tableContainer) tableContainer.style.display = 'none';
        if (gridContainer) gridContainer.style.display = 'none';
        if (empty) {
            empty.style.display = 'block';
            const p = empty.querySelector('p');
            if (p) p.textContent = wishes.length > 0 ? 'Filtrelere uygun dilek bulunamadı.' : 'Henüz dilek eklenmemiş.';
        }
        updateBulkActions();
        return;
    }

    if (empty) empty.style.display = 'none';

    if (viewMode === 'table') {
        if (tableContainer) tableContainer.style.display = 'block';
        if (gridContainer) gridContainer.style.display = 'none';
        renderWishesTable(filteredWishes);
    } else {
        if (tableContainer) tableContainer.style.display = 'none';
        if (gridContainer) gridContainer.style.display = 'block';
        renderWishesGrid(filteredWishes);
    }

    updateBulkActions();
}

function renderWishesTable(filteredItems = []) {
    const tbody = document.getElementById('wishes-tbody');
    if (tbody) {
        tbody.innerHTML = filteredItems.map(w => `
        <tr class="wish-row" id="w-${w.id}">
            <td><input type="checkbox" class="wish-check" value="${w.id}" onchange="updateBulkActions()"></td>
            <td>
                ${w.photoUrl ? `
                <a href="${w.photoUrl}" target="_blank" title="Fotoğrafı büyük gör">
                    <img src="${w.photoUrl}" alt="${w.childName}" loading="lazy">
                </a>
                ` : `
                <div style="width:64px; height:64px; background:var(--bg2); border: 2px dashed var(--card-border); border-radius:8px; display:flex; align-items:center; justify-content:center; color:var(--text3); cursor:help" title="Sadece metin olarak paylaşıldı"><i data-lucide="type"></i></div>
                `}
            </td>
            <td style="font-weight:600;">${w.childName}</td>
            <td><div class="ocr-text" title="${(w.wishText || 'Okunamadı veya metin yok').replace(/"/g, '&quot;')}">${w.wishText || '<span style="color:var(--text3);font-style:italic">Veri yok</span>'}</div></td>
            <td style="color:var(--text2);font-size:13px">${formatTime(w.timestamp)}</td>
            <td>
                <div class="wish-actions" style="display:flex; gap:6px;">
                    <button class="btn btn-ghost" onclick="spotlightWish('${w.id}')" style="padding:6px 10px; font-size:12px;" title="Spotlight"><i data-lucide="star" style="width:14px;height:14px;"></i> Spotlight</button>
                    <button class="btn btn-primary" onclick="editWish('${w.id}', \`${w.childName.replace(/`/g, '\\`')}\`, \`${(w.wishText || '').replace(/`/g, '\\`')}\`)" style="padding:6px 10px; font-size:12px;" title="Düzenle"><i data-lucide="pencil" style="width:14px;height:14px;"></i></button>
                    <button class="btn btn-danger" onclick="confirmDelete('${w.id}', \`${w.childName.replace(/`/g, '\\`')}\`)" style="padding:6px 10px; font-size:12px;" title="Sil"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
                </div>
            </td>
        </tr>
        `).join('');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

function renderWishesGrid(filteredItems = []) {
    const grid = document.getElementById('wishes-grid');
    if (grid) {
        grid.innerHTML = filteredItems.map(w => `
        <div class="grid-wish-card wish-row">
            <input type="checkbox" class="wish-check grid-wish-check" value="${w.id}" onchange="updateBulkActions()">
            <div class="grid-wish-img-container">
                ${w.photoUrl ? `
                    <img src="${w.photoUrl}" alt="${w.childName}" class="grid-wish-img" loading="lazy">
                ` : `
                    <div style="width:100%; height:100%; background:var(--bg2); display:flex; align-items:center; justify-content:center; color:var(--text3);"><i data-lucide="type" style="width:48px;height:48px;opacity:0.6;"></i></div>
                `}
            </div>
            <div class="grid-wish-content">
                <div class="grid-wish-name">${w.childName}</div>
                <div class="grid-wish-time">${formatTime(w.timestamp)}</div>
                <div class="grid-wish-text" title="${(w.wishText || '').replace(/"/g, '&quot;')}">${w.wishText || 'Metin yok'}</div>
                <div class="grid-wish-actions">
                    <button class="btn btn-ghost" onclick="spotlightWish('${w.id}')" title="Spotlight"><i data-lucide="star" style="width:16px;height:16px;"></i></button>
                    <button class="btn btn-primary" onclick="editWish('${w.id}', \`${w.childName.replace(/`/g, '\\`')}\`, \`${(w.wishText || '').replace(/`/g, '\\`')}\`)" title="Düzenle"><i data-lucide="pencil" style="width:16px;height:16px;"></i></button>
                    <button class="btn btn-danger" onclick="confirmDelete('${w.id}', \`${w.childName.replace(/`/g, '\\`')}\` )" title="Sil"><i data-lucide="trash-2" style="width:16px;height:16px;"></i></button>
                </div>
            </div>
        </div>
        `).join('');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

// ─── BULK ACTIONS ───
function toggleSelectAll(checkbox) {
    document.querySelectorAll('.wish-check').forEach(c => {
        c.checked = checkbox.checked;
    });
    updateBulkActions();
}

function updateBulkActions() {
    const selected = document.querySelectorAll('.wish-check:checked');
    const bulkBar = document.getElementById('bulk-actions');
    const countEl = document.getElementById('selected-count');
    const selectAllCheck = document.getElementById('select-all-wishes');

    if (selected.length > 0) {
        if (bulkBar) bulkBar.style.display = 'flex';
        if (countEl) countEl.textContent = selected.length;
    } else {
        if (bulkBar) bulkBar.style.display = 'none';
    }

    // Select all check'i senkronize et
    if (selectAllCheck) {
        const total = document.querySelectorAll('.wish-check').length;
        selectAllCheck.checked = total > 0 && selected.length === total;
    }
}

function confirmDeleteSelected() {
    const selected = document.querySelectorAll('.wish-check:checked');
    if (selected.length === 0) return;

    document.getElementById('modal-text').textContent = `${selected.length} adet dilek silinecek. Geri alınamaz.`;
    modalAction = () => deleteSelectedWishes();
    document.getElementById('modal-confirm-btn').textContent = 'Seçilenleri Sil';
    document.getElementById('modal-overlay').classList.add('show');
}

async function deleteSelectedWishes() {
    const selected = Array.from(document.querySelectorAll('.wish-check:checked')).map(c => c.value);

    let deletedCount = 0;
    for (const id of selected) {
        try {
            await fetch(`/api/wishes/${id}`, { method: 'DELETE' });
            deletedCount++;
        } catch (e) {
            console.error('Silme hatası id:', id, e);
        }
    }

    showToast(`🗑️ ${deletedCount} adet dilek silindi`);
    loadWishes();
}

function renderRecent() {
    const grid = document.getElementById('recent-grid');
    if (!grid) return;
    const recent = [...wishes].reverse().slice(0, 6);
    if (!recent.length) {
        grid.innerHTML = '<div style="color:var(--text3);font-size:14px;padding:20px;">Henüz dilek yok</div>';
        return;
    }
    grid.innerHTML = recent.map(w => `
    <div class="wish-item">
        ${w.photoUrl ? `
        <img src="${w.photoUrl}" alt="${w.childName}" loading="lazy">
        ` : `
        <div style="width:100%; height:120px; background:var(--bg2); border-radius:8px; display:flex; align-items:center; justify-content:center; color:var(--text3);"><i data-lucide="type" style="width:40px;height:40px;opacity:0.6;"></i></div>
        `}
        <div class="wish-meta">
            <div class="wish-name" style="font-size:13px">${w.childName}</div>
            <div class="wish-time">${formatTime(w.timestamp)}</div>
            <div class="wish-actions" style="display:flex; gap:4px; margin-top:6px;">
                <button class="btn btn-ghost" onclick="spotlightWish('${w.id}')" style="font-size:11px;padding:5px 8px; flex:1" title="Spotlight"><i data-lucide="star" style="width:14px;height:14px;"></i></button>
                <button class="btn btn-primary" onclick="editWish('${w.id}', \`${w.childName.replace(/`/g, '\\`')}\`, \`${(w.wishText || '').replace(/`/g, '\\`')}\`)" style="font-size:11px;padding:5px 8px;" title="Düzenle"><i data-lucide="pencil" style="width:14px;height:14px;"></i></button>
                <button class="btn btn-danger" onclick="confirmDelete('${w.id}', \`${w.childName.replace(/`/g, '\\`')}\`)" style="font-size:11px;padding:5px 8px" title="Sil"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
            </div>
        </div>
    </div>
`).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function updateStats() {
    const total = wishes.length;
    const today = wishes.filter(w => new Date(w.timestamp).toDateString() === new Date().toDateString()).length;
    const spotW = wishes.find(w => w.isSpotlight);

    const totalEl = document.getElementById('stat-total');
    const todayEl = document.getElementById('stat-today');
    const spotlightEl = document.getElementById('stat-spotlight');
    const badgeEl = document.getElementById('sidebar-count');

    if (totalEl) totalEl.textContent = total;
    if (todayEl) todayEl.textContent = today;
    if (spotlightEl) spotlightEl.textContent = spotW ? spotW.childName : '—';
    if (badgeEl) badgeEl.textContent = total + ' Dilek';

    // Stats tab stats
    const total2El = document.getElementById('stat-total-2');
    const today2El = document.getElementById('stat-today-2');
    if (total2El) total2El.textContent = total;
    if (today2El) today2El.textContent = today;
}

function formatTime(ts) {
    return new Date(ts).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function filterWishes() {
    renderWishes();
}

// ─── ACTIONS ───
async function spotlightWish(id) {
    const res = await fetch(`/api/spotlight/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
        showToast(`${data.wish.childName} öne çıkarıldı!`);
        loadWishes();
    }
}

async function spotlightOff() {
    await fetch('/api/spotlight-off', { method: 'POST' }).catch(() => { });
    showToast('Spotlight kapatıldı');
    loadWishes();
}

async function deleteWish(id) {
    await fetch(`/api/wishes/${id}`, { method: 'DELETE' });
    showToast('Dilek silindi');
    loadWishes();
}

async function clearAllWishes() {
    await fetch('/api/wishes', { method: 'DELETE' });
    showToast('Tüm dilekler silindi');
    loadWishes();
}

// ─── MODAL & EDIT ───
let editingWishId = null;

function editWish(id, name, text) {
    editingWishId = id;
    document.getElementById('edit-name').value = name;
    document.getElementById('edit-text').value = text;
    document.getElementById('edit-modal').classList.add('show');
}

function closeEditModal() {
    editingWishId = null;
    document.getElementById('edit-modal').classList.remove('show');
    document.getElementById('edit-name').value = '';
    document.getElementById('edit-text').value = '';
}

async function saveEditedWish() {
    if (!editingWishId) return;
    const newName = document.getElementById('edit-name').value.trim();
    const newText = document.getElementById('edit-text').value.trim();
    const btn = document.getElementById('edit-save-btn');

    if (!newName) {
        showToast('⚠️ İsim boş bırakılamaz');
        return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ Kaydediliyor...';

    try {
        const res = await fetch(`/api/wishes/${editingWishId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ childName: newName, wishText: newText })
        });

        const data = await res.json();
        if (data.success) {
            showToast('Dilek başarıyla güncellendi!');
            closeEditModal();
            loadWishes();
        } else {
            showToast('Güncelleme hatası: ' + (data.error || 'Bilinmeyen Hata'));
        }
    } catch (err) {
        showToast('Bağlantı hatası!');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Kaydet';
    }
}

function confirmDelete(id, name) {
    document.getElementById('modal-text').textContent = `"${name}" dileği silinecek. Geri alınamaz.`;
    modalAction = () => deleteWish(id);
    document.getElementById('modal-confirm-btn').textContent = 'Sil';
    document.getElementById('modal-overlay').classList.add('show');
}

function confirmClearAll() {
    document.getElementById('modal-text').textContent = 'Tüm dilekler ve fotoğraflar silinecek. Geri alınamaz.';
    modalAction = clearAllWishes;
    document.getElementById('modal-confirm-btn').textContent = 'Tümünü Sil';
    document.getElementById('modal-overlay').classList.add('show');
}

const confirmBtn = document.getElementById('modal-confirm-btn');
if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
        if (modalAction) { modalAction(); modalAction = null; }
        closeModal();
    });
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('show');
}

// ─── UPLOAD ───
async function adminUpload() {
    const file = document.getElementById('admin-photo').files[0];
    const name = document.getElementById('admin-name').value.trim();
    if (!file && !name) { showToast('⚠️ Bilgileri girin'); return; }
    const btn = document.getElementById('admin-upload-btn');
    btn.disabled = true; btn.textContent = '⏳ Yükleniyor...';
    const fd = new FormData();
    if (file) fd.append('photo', file);
    fd.append('childName', name);
    try {
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success) {
            showToast('Dilek eklendi!');
            document.getElementById('admin-photo').value = '';
            document.getElementById('admin-name').value = '';
            loadWishes();
        } else {
            showToast('Hata: ' + (data.error || 'Bilinmeyen Hata'));
        }
    } catch (e) { showToast('Bağlantı hatası'); }
    btn.disabled = false; btn.innerHTML = '<i data-lucide="sparkles" style="width:16px;height:16px;"></i> Ekle';
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ─── THEME ───
async function setTheme(theme) {
    await fetch('/api/theme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme }) });
    document.querySelectorAll('.theme-option').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
    showToast('Tema değiştirildi!');
}

async function loadCurrentTheme() {
    try {
        const res = await fetch('/api/theme');
        const data = await res.json();
        document.querySelectorAll('.theme-option').forEach(b => b.classList.toggle('active', b.dataset.theme === data.theme));
    } catch (e) { }
}

// ─── AUTO SPOTLIGHT ───
async function startAutoSpotlight() {
    if (!wishes.length) { showToast('⚠️ Dilek yok!'); return; }
    const delay = document.getElementById('auto-delay').value;
    const res = await fetch('/api/auto-spotlight/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delay: parseInt(delay) })
    });
    const data = await res.json();
    if (data.success) {
        showToast('▶️ Slayt gösterisi başladı');
        checkAutoStatus();
    }
}

async function stopAutoSpotlight() {
    const res = await fetch('/api/auto-spotlight/stop', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
        showToast('⏹️ Slayt gösterisi durduruldu');
        checkAutoStatus();
    }
}

// ─── ENTERPRISE UX FEATURES ───

// Focus Mode (F tuşuyla gizle)
function toggleFocusMode() {
    document.body.classList.toggle('focus-mode');
    showToast(document.body.classList.contains('focus-mode') ? 'Odak Modu Açıldı (Çıkmak için F)' : 'Odak Modu Kapatıldı');
}

// Global Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
    // Input alanındaysak kısayolları yoksay
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key.toLowerCase()) {
        case 'f':
            toggleFocusMode();
            break;
        case 's':
            const startBtn = document.getElementById('auto-start-btn');
            const isPlaying = startBtn && startBtn.style.display === 'none';
            if (isPlaying) stopAutoSpotlight(); else startAutoSpotlight();
            break;
        case 'escape':
            // Varsa modalları kapat, yoksa spotlight kapat
            const overlay = document.getElementById('modal-overlay');
            const editObj = document.getElementById('edit-modal');
            if (overlay && overlay.classList.contains('show')) {
                closeModal();
            } else if (editObj && editObj.classList.contains('show')) {
                closeEditModal();
            } else {
                spotlightOff();
            }
            break;
    }
});

// ─── MODERATION ───
async function loadModerationState() {
    try {
        const res = await fetch('/api/moderation');
        const data = await res.json();
        setModerationUI(data);
        loadModerationLog();
    } catch (e) { }
}

async function loadModerationLog() {
    const tbody = document.getElementById('mod-log-tbody');
    if (!tbody) return;
    try {
        const res = await fetch('/api/moderation/log');
        const data = await res.json();
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text3);">Kayıt bulunamadı.</td></tr>';
            return;
        }
        tbody.innerHTML = data.reverse().map(log => `
            <tr>
                <td style="font-weight:600;">${log.childName}</td>
                <td style="font-size:12px; color:var(--text2);"><div style="display:flex; align-items:center; gap:4px;">${log.wishText || (log.photoUrl ? '<i data-lucide="image" style="width:12px;height:12px;"></i> Fotoğraf' : '-')}</div></td>
                <td style="color:var(--red); font-size:12px;"><div style="display:flex; align-items:center; gap:4px;"><i data-lucide="shield-alert" style="width:12px;height:12px;"></i> ${log.rejectedReason || 'Uygunsuz'}</div></td>
                <td style="font-size:11px; color:var(--text3);">${formatTime(log.rejectedAt)}</td>
            </tr>
        `).join('');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--red);">Yükleme hatası!</td></tr>';
    }
}

async function toggleModeration() {
    try {
        const res = await fetch('/api/moderation/toggle', { method: 'POST' });
        const data = await res.json();
        setModerationUI(data);
        showToast(data.enabled ? '🤖 Moderasyon AÇILDI' : '⚠️ Moderasyon KAPATILDI');
    } catch (e) { showToast('❌ Hata'); }
}

async function saveModerationSettings() {
    const settings = {
        checkText: document.getElementById('mod-text').checked,
        checkImage: document.getElementById('mod-image').checked,
        strictness: document.getElementById('mod-strictness').value,
    };
    try {
        const res = await fetch('/api/moderation/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        const data = await res.json();
        setModerationUI(data);
        showToast('💾 Moderasyon ayarları kaydedildi');
    } catch (e) { showToast('❌ Kaydetme hatası'); }
}

function setModerationUI(data) {
    const toggle = document.getElementById('mod-toggle');
    const badge = document.getElementById('mod-badge');
    const statMod = document.getElementById('stat-mod');
    const on = data.enabled !== false;
    if (toggle) toggle.checked = on;
    if (badge) {
        badge.textContent = on ? '✅ AÇIK' : '🚫 KAPALI';
        badge.className = 'mod-status-pill ' + (on ? 'on' : 'off');
    }
    if (statMod) {
        statMod.textContent = on ? 'AÇIK' : 'KAPALI';
        statMod.style.color = on ? 'var(--green)' : 'var(--red)';
    }
    const strictEl = document.getElementById('mod-strictness');
    if (strictEl && data.strictness) strictEl.value = data.strictness;
    const textEl = document.getElementById('mod-text');
    if (textEl && data.checkText !== undefined) {
        textEl.checked = data.checkText;
        const textLabel = document.getElementById('mod-text-label');
        if (textLabel) textLabel.textContent = data.checkText ? 'Açık' : 'Kapalı';
    }
    const imgEl = document.getElementById('mod-image');
    if (imgEl && data.checkImage !== undefined) {
        imgEl.checked = data.checkImage;
        const imgLabel = document.getElementById('mod-image-label');
        if (imgLabel) imgLabel.textContent = data.checkImage ? 'Açık' : 'Kapalı';
    }
}

// ─── EKRAN AYARLARI ───
async function loadDisplaySettings() {
    try {
        const res = await fetch('/api/display-settings');
        const data = await res.json();
        setDisplaySettingsUI(data);
    } catch (e) { }
}

async function saveDisplaySettings() {
    const settings = {
        speedMultiplier: parseFloat(document.getElementById('display-speed').value),
        scaleMultiplier: parseFloat(document.getElementById('display-scale').value)
    };
    try {
        const res = await fetch('/api/display-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        const data = await res.json();
        setDisplaySettingsUI(data);
        showToast('📺 Ekran ayarları güncellendi');
    } catch (e) { showToast('❌ Kaydetme hatası'); }
}

function setDisplaySettingsUI(data) {
    if (data.speedMultiplier !== undefined) {
        const el = document.getElementById('display-speed');
        if (el) el.value = data.speedMultiplier;
    }
    if (data.scaleMultiplier !== undefined) {
        const el = document.getElementById('display-scale');
        if (el) el.value = data.scaleMultiplier;
    }
}

// ─── RAFFLE (ÇEKİLİŞ) ───
async function startRaffle() {
    const btnStart = document.getElementById('btn-raffle-start');
    btnStart.disabled = true;
    btnStart.innerHTML = '⏳ Çekiliyor...';

    try {
        const res = await fetch('/api/raffle/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ count: 1 })
        });

        const data = await res.json();

        if (data.success && data.winners) {
            showToast('🎁 Sıradaki talihli ekranda belirdi!');

            // Butonları güncelle
            btnStart.style.display = 'none';
            document.getElementById('btn-raffle-close').style.display = 'flex';

            // Admin logunu göster (Yığılmalı)
            const listEl = document.getElementById('raffle-results-list');
            const newWinner = `<li style="background:var(--card-hover); padding:10px 15px; border-radius:8px; border-left:4px solid var(--accent); display:flex; justify-content:space-between;">
                    <span style="font-weight:bold;">Sıradaki Talihli</span>
                    <span>${data.winners[0].childName}</span>
                 </li>`;
            listEl.innerHTML += newWinner;
            document.getElementById('raffle-results-container').style.display = 'block';
        } else {
            showToast('❌ Hata: ' + (data.error || 'Çekiliş yapılamadı'));
            btnStart.disabled = false;
            btnStart.innerHTML = '<i data-lucide="party-popper" style="width:20px;height:20px;"></i> Sıradaki Talihliyi Çek';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    } catch (e) {
        showToast('❌ Bağlantı hatası!');
        btnStart.disabled = false;
        btnStart.innerHTML = '<i data-lucide="party-popper" style="width:20px;height:20px;"></i> Sıradaki Talihliyi Çek';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

async function closeRaffleDisplay() {
    try {
        await fetch('/api/raffle/close', { method: 'POST' });
        showToast('⏹️ Çekiliş ekranı kapatıldı.');

        // Formu sıfırla
        document.getElementById('btn-raffle-start').style.display = 'flex';
        document.getElementById('btn-raffle-start').disabled = false;
        document.getElementById('btn-raffle-start').innerHTML = '<i data-lucide="party-popper" style="width:20px;height:20px;"></i> Sıradaki Talihliyi Çek';
        if (typeof lucide !== 'undefined') lucide.createIcons();
        document.getElementById('btn-raffle-close').style.display = 'none';

        // Seçim varsa kapat
    } catch (e) {
        showToast('Hata oluştu');
    }
}

async function resetRaffleMemory() {
    if (!confirm('Çekiliş hafızasını sıfırlamak (çıkanların tekrar çıkabilmesine izin vermek) istediğinizden emin misiniz?')) return;
    try {
        const res = await fetch('/api/raffle/reset', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast('🔄 Çekiliş hafızası sıfırlandı.');
            document.getElementById('raffle-results-list').innerHTML = '';
            document.getElementById('raffle-results-container').style.display = 'none';
        }
    } catch (e) {
        showToast('Hata oluştu');
    }
}


// ─── STATS (İSTATİSTİKLER) ───
let myChart = null;

async function loadStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();

        if (data.success) {
            const stats = data.stats;

            // Özet Kartları
            const sToday = document.getElementById('stat-today-2');
            const sMonth = document.getElementById('stat-month');
            const sTotal = document.getElementById('stat-total-2');
            if (sToday) sToday.textContent = stats.todayWishes;
            if (sMonth) sMonth.textContent = stats.thisMonthWishes;
            if (sTotal) sTotal.textContent = stats.totalWishes;

            // Tabloyu Doldur (Geçmiş Günler)
            const tbody = document.getElementById('stats-tbody');
            if (tbody) {
                if (stats.wishesByDate && stats.wishesByDate.length > 0) {
                    tbody.innerHTML = stats.wishesByDate.map(row =>
                        `<tr>
                            <td>${row.date}</td>
                            <td><span style="font-weight:600; color:var(--accent);">${row.count}</span> Dilek</td>
                         </tr>`
                    ).join('');
                } else {
                    tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;color:var(--text3)">Henüz Veri Yok</td></tr>`;
                }
            }

            // Grafiği Çiz
            if (myChart) {
                myChart.destroy();
            }

            const chartData = [...stats.wishesByDate].reverse();
            const ctxEl = document.getElementById('statsChart');
            if (ctxEl) {
                const ctx = ctxEl.getContext('2d');
                Chart.defaults.color = "rgba(255,255,255,0.7)";
                Chart.defaults.font.family = "'Inter', sans-serif";

                myChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: chartData.map(r => r.date),
                        datasets: [{
                            label: 'Gönderilen Dilek Sayısı',
                            data: chartData.map(r => r.count),
                            borderColor: '#FF6B6B',
                            backgroundColor: 'rgba(255, 107, 107, 0.2)',
                            borderWidth: 3,
                            pointBackgroundColor: '#4ECDC4',
                            pointBorderColor: '#fff',
                            pointRadius: 5,
                            pointHoverRadius: 7,
                            fill: true,
                            tension: 0.3
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                backgroundColor: 'rgba(15,17,23,0.9)',
                                titleColor: '#fff',
                                bodyColor: '#FF6B6B',
                                padding: 10,
                                cornerRadius: 8
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                grid: { color: 'rgba(255,255,255,0.05)' },
                                ticks: { stepSize: 1 }
                            },
                            x: { grid: { display: false } }
                        }
                    }
                });
            }
        }
    } catch (e) {
        console.error("Stats Error:", e);
        showToast("❌ İstatistikler çekilemedi!");
    }
}

// ─── TOAST ───
let toastTimer;
function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ─── QR CODE ───
(async function () {
    try {
        const res = await fetch('/api/local-ip');
        const data = await res.json();
        let url = '';
        const currentHost = window.location.hostname;

        // Eğer sunucudan özel bir domain (PUBLIC_DOMAIN) ayarlanmışsa öncelikli olarak onu kullan
        if (data.isCustomUrl) {
            // Eğer HTTPS veya HTTP yoksa güvenli varsayılan olarak https ekle
            url = `https://${data.ip}/upload`;
        }
        // Eğer uygulama bir domain üzerinden (dilek-kumbarasi.mindops.net vs) açılmışsa o domaini kullan
        else if (currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
            url = `${window.location.protocol}//${window.location.host}/upload`;
        }
        // Localhost'tan girildiyse ağdaki diğer cihazların bağlanabilmesi için sunucu IP'sini kullan
        else {
            const port = window.location.port ? ':' + window.location.port : '';
            url = `http://${data.ip}${port}/upload`;
        }

        const container = document.getElementById('qr-container');
        const urlEl = document.getElementById('qr-url');

        if (container) {
            container.innerHTML = '';
            var img = document.createElement('img');
            img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(url);
            img.style.cssText = 'width:180px;height:180px;display:block;';
            container.appendChild(img);
        }
        if (urlEl) urlEl.textContent = url;
    } catch (err) {
        console.error("QR Code oluşturulamadı:", err);
    }
})();

// ─── INIT ───
loadWishes();
loadCurrentTheme();
loadModerationState();
loadDisplaySettings();
