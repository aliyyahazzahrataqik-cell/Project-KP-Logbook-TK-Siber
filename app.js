const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./config/database');

const app = express();
const PORT = 3000;

// ===================== MIDDLEWARE =====================
app.use(express.static('public', { extensions: ['html'] }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: 'itales-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 jam
}));

// ===================== AUTH GUARD =====================
function setNoCache(res) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
}

function requireLogin(req, res, next) {
    setNoCache(res);
    if (!req.session.user) return res.redirect('/login');
    next();
}

// Khusus untuk endpoint API: return 401 JSON, bukan redirect
// Ini penting agar fetch() di frontend bisa deteksi status 401 dengan benar
function requireAuth(req, res, next) {
    setNoCache(res);
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
    next();
}

function requireRole(...roles) {
    return (req, res, next) => {
        setNoCache(res);
        if (!req.session.user) return res.redirect('/login');
        if (!roles.includes(req.session.user.role)) return res.redirect('/login');
        next();
    };
}

// ===================== HALAMAN =====================

// Redirect root ke login kalau belum login
app.get('/', (req, res, next) => {
    // serve index.html (tamu) via static, tapi kalau sudah login redirect ke dashboard
    if (req.session.user) {
        if (req.session.user.role === 'admin') return res.redirect('/dashboard-admin');
        if (req.session.user.role === 'guru') return res.redirect('/dashboard-guru');
        if (req.session.user.role === 'orang_tua') return res.redirect('/dashboard-ortu');
    }
    next(); // lanjutkan ke static (index.html)
});

// Proteksi halaman internal
app.get('/dashboard-guru', requireRole('admin', 'guru'), (req, res) => {
    res.sendFile(__dirname + '/public/dashboard-guru/index.html');
});

app.get('/kelola-jadwal', requireRole('admin', 'guru'), (req, res) => {
    res.sendFile(__dirname + '/public/kelola-jadwal/index.html');
});

app.get('/kelola-anak', requireRole('admin', 'guru'), (req, res) => {
    res.sendFile(__dirname + '/public/kelola-anak/index.html');
});

app.get('/kelola-logbook', requireRole('admin', 'guru'), (req, res) => {
    res.sendFile(__dirname + '/public/kelola-logbook/index.html');
});

app.get('/dashboard-ortu', requireRole('admin', 'orang_tua'), (req, res) => {
    res.sendFile(__dirname + '/public/dashboard-ortu/index.html');
});

app.get('/dashboard-admin', requireRole('admin'), (req, res) => {
    res.sendFile(__dirname + '/public/dashboard-admin/index.html');
});

app.get('/kelola-akun', requireRole('admin'), (req, res) => {
    res.sendFile(__dirname + '/public/kelola-akun/index.html');
});

// ===================== AUTH ROUTES =====================

// POST /login
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.redirect('/login?error=Data+tidak+lengkap');
    }

    const query = `SELECT * FROM users WHERE username = ? LIMIT 1`;

    db.query(query, [username], async (err, results) => {
        if (err) {
            console.error('Login error:', err);
            return res.redirect('/login?error=Terjadi+kesalahan+server');
        }

        if (results.length === 0) {
            return res.redirect('/login?error=Username+atau+password+salah');
        }

        const user = results[0];

        // Cek password
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.redirect('/login?error=Username+atau+password+salah');
        }

        // Set session
        req.session.user = {
            id: user.id_user,
            username: user.username,
            role: user.role,
            id_anak: user.id_anak
        };

        // Redirect sesuai role
        if (user.role === 'admin') return res.redirect('/dashboard-admin');
        if (user.role === 'guru') return res.redirect('/dashboard-guru');
        if (user.role === 'orang_tua') return res.redirect('/dashboard-ortu');

        return res.redirect('/');
    });
});

// GET & POST /logout — logout bersih dan hapus cookie
app.all('/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

// GET /api/me — info user yang login (untuk dipakai di frontend)
// Pakai requireAuth agar return 401 JSON (bukan redirect) saat tidak ada session
app.get('/api/me', requireAuth, (req, res) => {
    res.json(req.session.user);
});

// ===================== API JADWAL =====================

// GET /api/jadwal-hari-ini (untuk halaman tamu & dashboard)
app.get('/api/jadwal-hari-ini', (req, res) => {
    const hariSekarang = new Date().toLocaleDateString('id-ID', { weekday: 'long' });

    const query = `
        SELECT
            jadwal.id_jadwal,
            jadwal.jam_mulai,
            jadwal.jam_selesai,
            jadwal.kegiatan,
            jadwal.keterangan,
            kelas.nama_kelas
        FROM jadwal
        JOIN kelas ON jadwal.id_kelas = kelas.id_kelas
        WHERE jadwal.hari = ?
        ORDER BY jadwal.jam_mulai
    `;

    db.query(query, [hariSekarang], (err, results) => {
        if (err) return res.status(500).json({ error: 'Gagal mengambil jadwal' });
        res.json({ hari: hariSekarang, jadwal: results });
    });
});

// GET /api/jadwal?hari=Senin&kelas=1
app.get('/api/jadwal', requireLogin, (req, res) => {
    const { hari, kelas } = req.query;
    let query = `
        SELECT jadwal.*, kelas.nama_kelas
        FROM jadwal
        JOIN kelas ON jadwal.id_kelas = kelas.id_kelas
        WHERE 1=1
    `;
    const params = [];

    if (hari) { query += ` AND jadwal.hari = ?`; params.push(hari); }
    if (kelas) { query += ` AND jadwal.id_kelas = ?`; params.push(kelas); }
    query += ` ORDER BY jadwal.jam_mulai`;

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ error: 'Gagal mengambil jadwal' });
        res.json(results);
    });
});

// POST /api/jadwal
app.post('/api/jadwal', requireRole('admin', 'guru'), (req, res) => {
    const { id_kelas, hari, jam_mulai, jam_selesai, kegiatan, keterangan } = req.body;
    if (!id_kelas || !hari || !jam_mulai || !jam_selesai || !kegiatan) {
        return res.status(400).json({ error: 'Data tidak lengkap' });
    }

    const query = `INSERT INTO jadwal (id_kelas, hari, jam_mulai, jam_selesai, kegiatan, keterangan) VALUES (?, ?, ?, ?, ?, ?)`;
    db.query(query, [id_kelas, hari, jam_mulai, jam_selesai, kegiatan, keterangan || null], (err, result) => {
        if (err) return res.status(500).json({ error: 'Gagal menambah jadwal' });
        res.json({ success: true, id: result.insertId });
    });
});

// PUT /api/jadwal/:id
app.put('/api/jadwal/:id', requireRole('admin', 'guru'), (req, res) => {
    const { id } = req.params;
    const { hari, jam_mulai, jam_selesai, kegiatan, keterangan } = req.body;

    const query = `UPDATE jadwal SET hari=?, jam_mulai=?, jam_selesai=?, kegiatan=?, keterangan=? WHERE id_jadwal=?`;
    db.query(query, [hari, jam_mulai, jam_selesai, kegiatan, keterangan || null, id], (err) => {
        if (err) return res.status(500).json({ error: 'Gagal update jadwal' });
        res.json({ success: true });
    });
});

// DELETE /api/jadwal/:id
app.delete('/api/jadwal/:id', requireRole('admin', 'guru'), (req, res) => {
    db.query(`DELETE FROM jadwal WHERE id_jadwal = ?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Gagal hapus jadwal' });
        res.json({ success: true });
    });
});

// ===================== API ANAK =====================

// GET /api/anak
app.get('/api/anak', requireLogin, (req, res) => {
    const query = `
        SELECT anak.*, kelas.nama_kelas
        FROM anak
        JOIN kelas ON anak.id_kelas = kelas.id_kelas
        ORDER BY kelas.nama_kelas, anak.nama_lengkap
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Gagal mengambil data anak' });
        res.json(results);
    });
});

// POST /api/anak
app.post('/api/anak', requireRole('admin', 'guru'), (req, res) => {
    const { nama_lengkap, nisn, jenis_kelamin, id_kelas } = req.body;
    if (!nama_lengkap || !nisn || !jenis_kelamin || !id_kelas) {
        return res.status(400).json({ error: 'Data tidak lengkap' });
    }

    db.query(
        `INSERT INTO anak (nama_lengkap, nisn, jenis_kelamin, id_kelas) VALUES (?, ?, ?, ?)`,
        [nama_lengkap, nisn, jenis_kelamin, id_kelas],
        (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'NISN sudah terdaftar' });
                return res.status(500).json({ error: 'Gagal tambah anak' });
            }
            res.json({ success: true, id: result.insertId });
        }
    );
});

// PUT /api/anak/:id
app.put('/api/anak/:id', requireRole('admin', 'guru'), (req, res) => {
    const { nama_lengkap, nisn, jenis_kelamin, id_kelas } = req.body;
    if (!nama_lengkap || !nisn || !jenis_kelamin || !id_kelas) {
        return res.status(400).json({ error: 'Data tidak lengkap' });
    }

    db.query(
        `UPDATE anak SET nama_lengkap=?, nisn=?, jenis_kelamin=?, id_kelas=? WHERE id_anak=?`,
        [nama_lengkap, nisn, jenis_kelamin, id_kelas, req.params.id],
        (err) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'NISN sudah terdaftar' });
                return res.status(500).json({ error: 'Gagal update data anak' });
            }
            res.json({ success: true });
        }
    );
});

// DELETE /api/anak/:id
app.delete('/api/anak/:id', requireRole('admin', 'guru'), (req, res) => {
    db.query(`DELETE FROM anak WHERE id_anak = ?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Gagal hapus anak' });
        res.json({ success: true });
    });
});

// ===================== API KELAS =====================

app.get('/api/kelas', requireLogin, (req, res) => {
    db.query(`SELECT * FROM kelas ORDER BY nama_kelas`, (err, results) => {
        if (err) return res.status(500).json({ error: 'Gagal mengambil data kelas' });
        res.json(results);
    });
});

// ===================== API USERS (ADMIN) =====================

// GET /api/users
app.get('/api/users', requireRole('admin'), (req, res) => {
    const query = `
        SELECT u.id_user, u.username, u.role, u.created_at,
               a.nama_lengkap AS nama_anak, k.nama_kelas
        FROM users u
        LEFT JOIN anak a ON u.id_anak = a.id_anak
        LEFT JOIN kelas k ON a.id_kelas = k.id_kelas
        ORDER BY u.role, u.username
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Gagal mengambil data users' });
        res.json(results);
    });
});

// POST /api/users — buat akun baru (admin only)
app.post('/api/users', requireRole('admin'), async (req, res) => {
    const { username, password, role, id_anak } = req.body;
    if (!username || !password || !role) {
        return res.status(400).json({ error: 'Data tidak lengkap' });
    }

    try {
        const hashed = await bcrypt.hash(password, 10);
        db.query(
            `INSERT INTO users (username, password, role, id_anak) VALUES (?, ?, ?, ?)`,
            [username, hashed, role, id_anak || null],
            (err, result) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Username sudah dipakai' });
                    return res.status(500).json({ error: 'Gagal buat akun' });
                }
                res.json({ success: true, id: result.insertId });
            }
        );
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/users/:id
app.delete('/api/users/:id', requireRole('admin'), (req, res) => {
    db.query(`DELETE FROM users WHERE id_user = ?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Gagal hapus akun' });
        res.json({ success: true });
    });
});

// ===================== API DASHBOARD STATS =====================

app.get('/api/dashboard-stats', requireLogin, (req, res) => {
    const hariSekarang = new Date().toLocaleDateString('id-ID', { weekday: 'long' });

    const queries = {
        kegiatan: `SELECT COUNT(*) AS total FROM jadwal WHERE hari = ?`,
        anak: `SELECT COUNT(*) AS total FROM anak`,
        kelas: `SELECT COUNT(*) AS total FROM kelas`
    };

    const results = {};
    let done = 0;
    const total = Object.keys(queries).length;

    db.query(queries.kegiatan, [hariSekarang], (err, rows) => {
        results.kegiatan_hari_ini = err ? 0 : rows[0].total;
        if (++done === total) res.json(results);
    });

    db.query(queries.anak, (err, rows) => {
        results.total_anak = err ? 0 : rows[0].total;
        if (++done === total) res.json(results);
    });

    db.query(queries.kelas, (err, rows) => {
        results.total_kelas = err ? 0 : rows[0].total;
        if (++done === total) res.json(results);
    });
});

// ===================== AUTO SEED DEFAULT ACCOUNTS =====================
async function autoSeedUsers() {
    db.query(`SELECT COUNT(*) as count FROM users`, async (err, rows) => {
        if (!err && rows && rows[0].count === 0) {
            const hash = '$2b$10$VyTtYTzkFLKUFUjN5GvUXOJDDmwPPwOF9BZk15P6eU4yF45TH9Xpu'; // password: password123
            const query = `
                INSERT INTO users (username, password, role) VALUES
                ('admin', ?, 'admin'),
                ('guru', ?, 'guru')
            `;
            db.query(query, [hash, hash], (insertErr) => {
                if (!insertErr) {
                    console.log('✅ Akun default berhasil dibuat otomatis:');
                    console.log('   - Guru : username "guru"  | password "password123"');
                    console.log('   - Admin: username "admin" | password "password123"');
                }
            });
        }
    });
}

// ===================== START =====================
app.listen(PORT, () => {
    autoSeedUsers();
    console.log(`Server iTales berjalan di http://localhost:${PORT} 🚀`);
});