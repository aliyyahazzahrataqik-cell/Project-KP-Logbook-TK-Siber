CREATE DATABASE IF NOT EXISTS logbook_tk;
USE logbook_tk;

-- =========================================
-- TABEL KELAS
-- =========================================
CREATE TABLE kelas (
    id_kelas INT AUTO_INCREMENT PRIMARY KEY,
    nama_kelas VARCHAR(50) NOT NULL,
    tahun_ajaran VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================
-- TABEL ANAK
-- =========================================
CREATE TABLE anak (
    id_anak INT AUTO_INCREMENT PRIMARY KEY,
    nama_lengkap VARCHAR(100) NOT NULL,
    nama_panggilan VARCHAR(50) NULL,
    nisn VARCHAR(20) NOT NULL UNIQUE,
    jenis_kelamin ENUM('L', 'P') NOT NULL,
    id_kelas INT NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (id_kelas)
        REFERENCES kelas(id_kelas)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

-- =========================================
-- TABEL USERS / AKUN
-- =========================================
CREATE TABLE users (
    id_user INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'guru', 'orang_tua') NOT NULL,
    id_anak INT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (id_anak)
        REFERENCES anak(id_anak)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

-- =========================================
-- TABEL JADWAL
-- =========================================
CREATE TABLE jadwal (
    id_jadwal INT AUTO_INCREMENT PRIMARY KEY,
    id_kelas INT NOT NULL,
    hari ENUM(
        'Senin',
        'Selasa',
        'Rabu',
        'Kamis',
        'Jumat',
        'Sabtu'
    ) NOT NULL,
    jam_mulai TIME NOT NULL,
    jam_selesai TIME NOT NULL,
    kegiatan VARCHAR(150) NOT NULL,
    keterangan TEXT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (id_kelas)
        REFERENCES kelas(id_kelas)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

-- =========================================
-- TABEL LOGBOOK
-- =========================================
CREATE TABLE logbook (
    id_logbook INT AUTO_INCREMENT PRIMARY KEY,
    id_kelas INT NOT NULL,
    tanggal DATE NOT NULL,
    created_by INT NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (id_kelas)
        REFERENCES kelas(id_kelas)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    FOREIGN KEY (created_by)
        REFERENCES users(id_user)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    UNIQUE KEY unique_logbook_harian (id_kelas, tanggal)
);

-- =========================================
-- TABEL KEGIATAN LOGBOOK
-- =========================================
CREATE TABLE kegiatan_logbook (
    id_kegiatan INT AUTO_INCREMENT PRIMARY KEY,
    id_logbook INT NOT NULL,
    kategori VARCHAR(100) NOT NULL,
    judul VARCHAR(150) NOT NULL,
    deskripsi TEXT NOT NULL,
    urutan INT DEFAULT 0,

    FOREIGN KEY (id_logbook)
        REFERENCES logbook(id_logbook)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

-- =========================================
-- TABEL CATATAN ANAK
-- =========================================
CREATE TABLE catatan_anak (
    id_catatan INT AUTO_INCREMENT PRIMARY KEY,
    id_logbook INT NOT NULL,
    id_anak INT NOT NULL,
    catatan TEXT NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (id_logbook)
        REFERENCES logbook(id_logbook)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    FOREIGN KEY (id_anak)
        REFERENCES anak(id_anak)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    UNIQUE KEY unique_catatan_anak_harian (id_logbook, id_anak)
);

-- =========================================
-- TABEL DOKUMENTASI
-- =========================================
CREATE TABLE dokumentasi (
    id_dokumentasi INT AUTO_INCREMENT PRIMARY KEY,
    id_logbook INT NOT NULL,
    id_anak INT NULL,
    file_foto VARCHAR(255) NOT NULL,
    keterangan VARCHAR(255) NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (id_logbook)
        REFERENCES logbook(id_logbook)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    FOREIGN KEY (id_anak)
        REFERENCES anak(id_anak)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

-- =========================================
-- TABEL MENU MAKAN
-- =========================================
CREATE TABLE menu_makan (
    id_menu INT AUTO_INCREMENT PRIMARY KEY,
    hari ENUM('Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat') NOT NULL UNIQUE,
    menu VARCHAR(150) NOT NULL,
    keterangan VARCHAR(255) NULL
);

-- =========================================
-- TABEL PENGUMUMAN & BERITA PUBLIK
-- =========================================
CREATE TABLE pengumuman (
    id_pengumuman INT AUTO_INCREMENT PRIMARY KEY,
    judul VARCHAR(255) NOT NULL,
    kategori ENUM('Penting', 'Agenda', 'Libur', 'Prestasi', 'Umum') DEFAULT 'Umum',
    isi TEXT NOT NULL,
    tanggal DATE NOT NULL,
    penulis VARCHAR(100) DEFAULT 'Admin TK Siber',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
);


-- =========================================
-- ============= DATA AWAL ================
-- =========================================

-- DATA KELAS
INSERT INTO kelas (nama_kelas, tahun_ajaran)
VALUES
('TK A', '2026/2027'),
('TK B', '2026/2027');

-- DATA USER (Password: password123)
INSERT INTO users (username, password, role)
VALUES
('admin', '$2b$10$VyTtYTzkFLKUFUjN5GvUXOJDDmwPPwOF9BZk15P6eU4yF45TH9Xpu', 'admin'),
('guru', '$2b$10$VyTtYTzkFLKUFUjN5GvUXOJDDmwPPwOF9BZk15P6eU4yF45TH9Xpu', 'guru');

-- DATA MENU MAKAN
INSERT INTO menu_makan (hari, menu, keterangan) VALUES
('Senin', 'Chicken Katsu', 'Nasi + Chicken Katsu + Sop Sayur'),
('Selasa', 'Oreg Tempe Manis', 'Nasi + Oreg Tempe + Sayur Bayam'),
('Rabu', 'Sop Bening Bakso', 'Nasi + Sop Sayur Bakso Telur'),
('Kamis', 'Jamur Krispi Gurih', 'Nasi + Jamur Krispi + Sayur Asem'),
('Jumat', 'Tempe & Telur Karage', 'Nasi + Tempe Telur Karage + Buah');

-- DATA JADWAL KEGIATAN
INSERT INTO jadwal (id_kelas, hari, jam_mulai, jam_selesai, kegiatan, keterangan) VALUES
-- SENIN (TK A & TK B)
(1, 'Senin', '08:00:00', '08:30:00', 'Pembukaan & Doa Pagi', 'Lingkaran pagi dan presensi'),
(1, 'Senin', '08:30:00', '09:30:00', 'Mengenal Huruf & Kata', 'Literasi awal buku cerita'),
(1, 'Senin', '09:30:00', '10:15:00', 'Istirahat & Snack Time', 'Cuci tangan & makan sehat'),
(1, 'Senin', '10:15:00', '11:00:00', 'Bermain Balok & Motorik', 'Kreativitas kelompok'),
(1, 'Senin', '11:00:00', '11:30:00', 'Refleksi & Penutupan', 'Doa pulang & penjemputan'),
(2, 'Senin', '08:00:00', '08:30:00', 'Pembukaan & Doa Pagi', 'Lingkaran pagi dan presensi'),
(2, 'Senin', '08:30:00', '09:30:00', 'Membaca Mandiri & Menulis', 'Persiapan calistung ceria'),
(2, 'Senin', '09:30:00', '10:15:00', 'Istirahat & Snack Time', 'Makan bersama'),
(2, 'Senin', '10:15:00', '11:00:00', 'Eksplorasi Sains Dasar', 'Percobaan warna & air'),
(2, 'Senin', '11:00:00', '11:30:00', 'Doa & Penutupan', 'Pulang'),
-- SELASA (TK A & TK B)
(1, 'Selasa', '08:00:00', '08:30:00', 'Senam Pagi Ceria', 'Halaman sekolah'),
(1, 'Selasa', '08:30:00', '09:30:00', 'Mewarnai & Menggambar', 'Pengenalan bentuk & warna'),
(1, 'Selasa', '09:30:00', '10:15:00', 'Istirahat & Makan', 'Makan bekal'),
(1, 'Selasa', '10:15:00', '11:30:00', 'Menyanyi & Gerak Irama', 'Lagu anak nusantara'),
(2, 'Selasa', '08:00:00', '08:30:00', 'Senam Pagi Ceria', 'Halaman sekolah'),
(2, 'Selasa', '08:30:00', '09:30:00', 'Melukis Tematik & Kolase', 'Kreativitas motorik halus'),
(2, 'Selasa', '09:30:00', '10:15:00', 'Istirahat & Makan', 'Makan bekal bersama'),
(2, 'Selasa', '10:15:00', '11:30:00', 'Bahasa Inggris Ceria', 'Pengenalan kata dasar dan lagu'),
-- RABU (TK A & TK B)
(1, 'Rabu', '08:00:00', '08:30:00', 'Berdoa & Murajaah Surat Pendek', 'Hafalan Al-Ikhlas & An-Nas'),
(1, 'Rabu', '08:30:00', '09:30:00', 'Berhitung Menyenangkan', 'Menggunakan kancing angka'),
(1, 'Rabu', '09:30:00', '10:15:00', 'Istirahat', 'Bermain di halaman'),
(1, 'Rabu', '10:15:00', '11:30:00', 'Bercerita / Dongeng Pagi', 'Kisah fabel kejujuran'),
(2, 'Rabu', '08:00:00', '08:30:00', 'Berdoa & Murajaah Hafalan', 'Surat pendek & doa harian'),
(2, 'Rabu', '08:30:00', '09:30:00', 'Matematika Dasar & Pola Logika', 'Penjumlahan objek visual'),
(2, 'Rabu', '09:30:00', '10:15:00', 'Istirahat', 'Bermain aktif bersama'),
(2, 'Rabu', '10:15:00', '11:30:00', 'Bermain Peran & Percakapan', 'Melatih kepercayaan diri'),
-- KAMIS (TK A & TK B)
(1, 'Kamis', '08:00:00', '08:45:00', 'Praktek Kemandirian', 'Pembiasaan adab harian'),
(1, 'Kamis', '08:45:00', '09:45:00', 'Kreativitas Origami', 'Membuat burung & perahu'),
(1, 'Kamis', '09:45:00', '10:30:00', 'Istirahat & Minum Susu', 'Gizi seimbang'),
(1, 'Kamis', '10:30:00', '11:30:00', 'Permainan Tradisional', 'Ular naga & lompat tali'),
(2, 'Kamis', '08:00:00', '08:45:00', 'Eksplorasi Lingkungan & Alam', 'Mengenal tanaman sekolah'),
(2, 'Kamis', '08:45:00', '09:45:00', 'Prakarya & Keterampilan Tangan', 'Membuat kreasi daur ulang'),
(2, 'Kamis', '09:45:00', '10:30:00', 'Istirahat & Minum Susu', 'Makan sehat'),
(2, 'Kamis', '10:30:00', '11:30:00', 'Olahraga Kelincahan & Ketangkasan', 'Halaman sekolah'),
-- JUMAT (TK A & TK B)
(1, 'Jumat', '08:00:00', '08:45:00', 'Pembiasaan Ibadah & Wudhu', 'Praktek sholat dhuha ceria'),
(1, 'Jumat', '08:45:00', '09:45:00', 'Infaq & Kisah Sahabat Nabi', 'Karakter berbagi sesama'),
(1, 'Jumat', '09:45:00', '10:30:00', 'Makan Bersama Menu Sehat', 'Sayur & buah segar'),
(1, 'Jumat', '10:30:00', '11:00:00', 'Doa & Penutupan', 'Jumat berkah & pulang'),
(2, 'Jumat', '08:00:00', '08:45:00', 'Praktik Ibadah & Tata Krama', 'Sholat dhuha & akhlak mulia'),
(2, 'Jumat', '08:45:00', '09:45:00', 'Infaq Ceria & Storytelling Islami', 'Kisah keteladanan'),
(2, 'Jumat', '09:45:00', '10:30:00', 'Makan Bersama Menu Sehat', 'Sayur & buah segar'),
(2, 'Jumat', '10:30:00', '11:00:00', 'Evaluasi Pekanan & Doa', 'Jumat berkah & kepulangan');

-- DATA PENGUMUMAN
INSERT INTO pengumuman (judul, kategori, isi, tanggal, penulis) VALUES
('Penerimaan Peserta Didik Baru (PPDB) Tahun Ajaran 2026/2027 Telah Dibuka', 'Penting', 'TK Siber UINSSC resmi membuka pendaftaran peserta didik baru untuk kelompok bermain TK A dan TK B. Pendaftaran dapat dilakukan langsung di kantor sekretariat sekolah atau melalui narahubung resmi kami pada jam kerja (08.00 - 14.00 WIB). Kuota terbatas untuk memastikan kualitas pembelajaran yang optimal.', '2026-03-01', 'Admin TK Siber'),
('Pemeriksaan Kesehatan Gigi dan Mulut Bersama Tim Medis', 'Agenda', 'Diberitahukan kepada seluruh orang tua/wali murid bahwa pada hari Rabu depan akan diselenggarakan pemeriksaan kesehatan gigi dan mulut rutin untuk anak-anak TK A dan TK B bekerjasama dengan klinik kesehatan universitas. Mohon memastikan ananda hadir tepat waktu dan sarapan sehat terlebih dahulu.', '2026-03-10', 'Admin TK Siber'),
('Informasi Libur dan Pembelajaran Mandiri Awal Ramadhan 1447 H', 'Libur', 'Berdasarkan kalender pendidikan, kegiatan belajar mengajar di sekolah diliburkan pada awal Ramadhan. Kegiatan pembelajaran tatap muka akan kembali aktif pada pekan berikutnya dengan jam belajar tematik Ramadhan ceria.', '2026-03-20', 'Admin TK Siber');