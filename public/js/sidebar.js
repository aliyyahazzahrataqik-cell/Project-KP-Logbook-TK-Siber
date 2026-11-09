/**
 * TK SIBER (iTales) - UNIFIED SIDEBAR & USER SESSION MANAGER
 * Menjamin keseragaman navigasi, ikon lengkap, warna, logo, dan hak akses di seluruh halaman.
 */

window.renderAppSidebar = async function(activeKey) {
    try {
        const res = await fetch('/api/me', { cache: 'no-store' });
        if (!res.ok) {
            window.location.replace('/login');
            return null;
        }

        const user = await res.json();
        const role = user.role;
        const uname = user.username || (role === 'admin' ? 'Administrator' : 'Guru');

        // Update User Name & Inisial di Header
        const nameEls = document.querySelectorAll('#user-display-name, #user-name');
        nameEls.forEach(el => el.textContent = uname);

        const avatarEls = document.querySelectorAll('#avatar-initial, #user-avatar');
        avatarEls.forEach(el => el.textContent = uname.charAt(0).toUpperCase());

        const roleEls = document.querySelectorAll('#user-role-label, .profile-role');
        roleEls.forEach(el => {
            if (role === 'admin') el.innerHTML = '<i class="fa-solid fa-shield-halved" style="color:#124b3c; margin-right:4px;"></i> Administrator · Online';
            else if (role === 'guru') el.innerHTML = '<i class="fa-solid fa-chalkboard-user" style="color:#124b3c; margin-right:4px;"></i> Guru · Online';
            else if (role === 'orang_tua') el.innerHTML = '<i class="fa-solid fa-hands-holding-child" style="color:#124b3c; margin-right:4px;"></i> Orang Tua · Online';
        });

        // Update Subtitle Brand Sidebar dengan Ikon
        const brandSubEls = document.querySelectorAll('.sidebar-brand p, .sidebar-brand .brand-text p, #sidebar-role-label');
        brandSubEls.forEach(el => {
            if (role === 'admin') el.innerHTML = '<i class="fa-solid fa-shield-halved" style="margin-right: 4px; font-size: 10px;"></i> Panel Administrator';
            else if (role === 'guru') el.innerHTML = '<i class="fa-solid fa-chalkboard-user" style="margin-right: 4px; font-size: 10px;"></i> Ruang Pendidik';
            else if (role === 'orang_tua') el.innerHTML = '<i class="fa-solid fa-hands-holding-child" style="margin-right: 4px; font-size: 10px;"></i> Portal Orang Tua';
        });

        // Update Menu Navigasi Sidebar
        const navEl = document.getElementById('sidebar-nav') || document.querySelector('.sidebar-menu');
        if (navEl) {
            let menuHtml = '';

            if (role === 'admin') {
                // Admin memiliki akses penuh ke seluruh manajemen sistem
                menuHtml = `
                    <span class="sidebar-section"><i class="fa-solid fa-layer-group"></i> Menu Utama</span>
                    <a href="/dashboard-admin" class="menu-item ${activeKey === 'dashboard' ? 'active' : ''}">
                        <i class="fa-solid fa-gauge-high"></i> Dashboard
                    </a>
                    <a href="/kelola-akun" class="menu-item ${activeKey === 'kelola-akun' ? 'active' : ''}">
                        <i class="fa-solid fa-users-gear"></i> Kelola Akun
                    </a>
                    <a href="/kelola-pengumuman" class="menu-item ${activeKey === 'kelola-pengumuman' ? 'active' : ''}">
                        <i class="fa-solid fa-bullhorn"></i> Kelola Pengumuman
                    </a>
                    <a href="/kelola-menu" class="menu-item ${activeKey === 'kelola-menu' ? 'active' : ''}">
                        <i class="fa-solid fa-utensils"></i> Kelola Menu
                    </a>
                    <span class="sidebar-section"><i class="fa-solid fa-graduation-cap"></i> Akademik</span>
                    <a href="/kelola-kelas" class="menu-item ${activeKey === 'kelola-kelas' ? 'active' : ''}">
                        <i class="fa-solid fa-chalkboard"></i> Kelola Kelas
                    </a>
                    <a href="/kelola-anak" class="menu-item ${activeKey === 'kelola-anak' ? 'active' : ''}">
                        <i class="fa-solid fa-children"></i> Kelola Anak
                    </a>
                    <a href="/kelola-jadwal" class="menu-item ${activeKey === 'kelola-jadwal' ? 'active' : ''}">
                        <i class="fa-solid fa-calendar-days"></i> Kelola Jadwal
                    </a>
                    <a href="/kelola-logbook" class="menu-item ${activeKey === 'kelola-logbook' ? 'active' : ''}">
                        <i class="fa-solid fa-book-bookmark"></i> Kelola Logbook
                    </a>
                `;
            } else if (role === 'guru') {
                // Guru: fokus pengajaran dan logbook siswa
                menuHtml = `
                    <span class="sidebar-section"><i class="fa-solid fa-chalkboard-user"></i> Menu Guru</span>
                    <a href="/dashboard-guru" class="menu-item ${activeKey === 'dashboard' ? 'active' : ''}">
                        <i class="fa-solid fa-house"></i> Dashboard
                    </a>
                    <a href="/kelola-kelas" class="menu-item ${activeKey === 'kelola-kelas' ? 'active' : ''}">
                        <i class="fa-solid fa-chalkboard"></i> Kelola Kelas
                    </a>
                    <a href="/kelola-anak" class="menu-item ${activeKey === 'kelola-anak' ? 'active' : ''}">
                        <i class="fa-solid fa-children"></i> Kelola Anak
                    </a>
                    <a href="/kelola-jadwal" class="menu-item ${activeKey === 'kelola-jadwal' ? 'active' : ''}">
                        <i class="fa-solid fa-calendar-days"></i> Kelola Jadwal
                    </a>
                    <a href="/kelola-menu" class="menu-item ${activeKey === 'kelola-menu' ? 'active' : ''}">
                        <i class="fa-solid fa-utensils"></i> Kelola Menu
                    </a>
                    <a href="/kelola-logbook" class="menu-item ${activeKey === 'kelola-logbook' ? 'active' : ''}">
                        <i class="fa-solid fa-book-bookmark"></i> Kelola Logbook
                    </a>
                `;
            } else if (role === 'orang_tua') {
                menuHtml = `
                    <span class="sidebar-section"><i class="fa-solid fa-layer-group"></i> Menu Utama</span>
                    <a href="/dashboard-ortu" class="menu-item ${activeKey === 'dashboard' ? 'active' : ''}">
                        <i class="fa-solid fa-house"></i> Dashboard
                    </a>
                `;
            }

            navEl.innerHTML = menuHtml;
        }

        return user;
    } catch(err) {
        console.error('Gagal inisialisasi sidebar:', err);
        return null;
    }
};

// Fungsi Logout Universal & Bersih
window.keluarAplikasi = function(e) {
    if (e) e.preventDefault();
    try {
        sessionStorage.clear();
        localStorage.clear();
        sessionStorage.setItem('kpalya_logged_out', 'true');
    } catch(err) {}
    window.location.href = '/logout';
};

// Cegah bfcache setelah logout
window.addEventListener('pageshow', async function(event) {
    if (event.persisted || sessionStorage.getItem('kpalya_logged_out') === 'true') {
        try {
            const r = await fetch('/api/me', { cache: 'no-store' });
            if (!r.ok) window.location.replace('/login');
        } catch(e) {
            window.location.replace('/login');
        }
    }
});
