/**
 * iTales - Client-side Image Auto Compression Helper
 * Otomatis mengompresi ukuran file dan dimensi foto sebelum diunggah ke server
 */
function compressImage(file, options = {}) {
    return new Promise((resolve) => {
        // Jika bukan file gambar, langsung teruskan file asli
        if (!file || !file.type || !file.type.startsWith('image/')) {
            return resolve(file);
        }

        const maxWidth = options.maxWidth || 1600;
        const maxHeight = options.maxHeight || 1600;
        const quality = options.quality !== undefined ? options.quality : 0.82;

        const reader = new FileReader();
        reader.onerror = () => resolve(file);
        reader.onload = (e) => {
            const img = new Image();
            img.onerror = () => resolve(file);
            img.onload = () => {
                let { width, height } = img;

                // Hitung dimensi baru proporsional agar foto tidak gepeng
                if (width > maxWidth || height > maxHeight) {
                    if (width / maxWidth > height / maxHeight) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    } else {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                // Jika format jpeg / webp, beri latar belakang putih agar transparan tidak jadi hitam
                if (file.type !== 'image/png') {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, width, height);
                }

                ctx.drawImage(img, 0, 0, width, height);

                const outputType = (file.type === 'image/png') ? 'image/png' : 'image/jpeg';
                canvas.toBlob((blob) => {
                    // Jika kompresi gagal atau ukuran malah lebih besar, pakai file asli
                    if (!blob || blob.size >= file.size) {
                        return resolve(file);
                    }
                    const ext = outputType === 'image/png' ? '.png' : '.jpg';
                    const baseName = file.name.replace(/\.[^/.]+$/, "");
                    const compressedFile = new File([blob], `${baseName}${ext}`, {
                        type: outputType,
                        lastModified: Date.now()
                    });
                    resolve(compressedFile);
                }, outputType, quality);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

