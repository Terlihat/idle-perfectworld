// ==========================================
// SISTEM UI: KLAIM KODE REDEEM
// ==========================================

export function setupRedeemUI(db, getUidCallback, redeemAPI) {
    const { claimGiftCodeTransaction } = redeemAPI;

    window.claimGiftCode = async function () {
        const inputEl = document.getElementById('input-redeem-code');
        if (!inputEl) return;

        let codeName = inputEl.value.trim().toUpperCase();
        codeName = codeName.replace(/\s+/g, ''); // Hapus spasi berlebih

        if (!codeName) return window.rpgAlert("❌ Silakan masukkan kode redeem terlebih dahulu!");

        const currentUserUid = getUidCallback();

        try {
            // Mengubah kursor jadi loading agar pemain tidak klik berkali-kali
            inputEl.disabled = true;

            // Lempar tugas ke sistem database dan tunggu balasannya
            const successMessage = await claimGiftCodeTransaction(db, currentUserUid, codeName);
            
            // Tampilkan pesan sukses
            window.rpgAlert(successMessage, "Klaim Berhasil");
            inputEl.value = ""; // Kosongkan input setelah berhasil

        } catch (err) {
            // Menangkap error dari validasi transaksi database
            window.rpgAlert(err.message, "Gagal Klaim");
        } finally {
            // Apapun yang terjadi (berhasil/gagal), aktifkan kembali inputannya
            inputEl.disabled = false;
        }
    };
}