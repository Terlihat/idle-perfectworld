// ==========================================
// SISTEM UNIVERSAL RPG MODAL (Pengganti Alert/Confirm/Prompt)
// ==========================================

export function setupRPGModal() {
    window.showModal = function ({ type, msg, title, inputType = 'text' }) {
        return new Promise((resolve) => {
            const modal = document.getElementById('rpg-modal');
            const box = document.getElementById('rpg-modal-box');
            const elTitle = document.getElementById('rpg-modal-title');
            const elMsg = document.getElementById('rpg-modal-msg');
            const elInput = document.getElementById('rpg-modal-input');
            const btnCancel = document.getElementById('btn-rpg-cancel');
            const btnOk = document.getElementById('btn-rpg-ok');

            if (!modal) {
                console.error("HTML Modal belum dipasang!");
                return resolve(type === 'prompt' ? null : (type !== 'confirm'));
            }

            // Kustomisasi Warna berdasarkan Tipe
            let colorTheme = '#00d2ff'; // Default Biru
            if (type === 'alert') colorTheme = '#ffcc00'; // Kuning (Peringatan)
            if (type === 'confirm') colorTheme = '#ff9800'; // Oranye (Pertanyaan)

            elTitle.innerText = title;
            elTitle.style.color = colorTheme;
            box.style.borderColor = colorTheme;
            btnOk.style.background = colorTheme;

            elMsg.innerHTML = String(msg).replace(/\n/g, '<br>');

            // Reset Event Listener agar tidak bertumpuk
            const newBtnOk = btnOk.cloneNode(true);
            const newBtnCancel = btnCancel.cloneNode(true);
            btnOk.parentNode.replaceChild(newBtnOk, btnOk);
            btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);

            // Atur Mode
            if (type === 'prompt') {
                elInput.style.display = 'block';
                elInput.type = inputType;
                elInput.value = '';
                newBtnCancel.style.display = 'block';
            } else if (type === 'confirm') {
                elInput.style.display = 'none';
                newBtnCancel.style.display = 'block';
            } else { // Alert
                elInput.style.display = 'none';
                newBtnCancel.style.display = 'none';
            }

            modal.style.display = 'flex';
            if (type === 'prompt') elInput.focus();

            // Eksekusi Tombol
            newBtnOk.addEventListener('click', () => {
                modal.style.display = 'none';
                resolve(type === 'prompt' ? elInput.value : true);
            });

            newBtnCancel.addEventListener('click', () => {
                modal.style.display = 'none';
                resolve(type === 'prompt' ? null : false);
            });
        });
    };

    // ALIAS FUNGSI UNTUK MEMPERMUDAH PEMANGGILAN
    window.rpgAlert = (msg, title = "Pesan Sistem") => window.showModal({ type: 'alert', msg, title });
    window.rpgConfirm = (msg, title = "Konfirmasi") => window.showModal({ type: 'confirm', msg, title });
    window.rpgPrompt = (msg, title = "Input", inputType = "text") => window.showModal({ type: 'prompt', msg, title, inputType });

    // OVERRIDE ALERT BAWAAN BROWSER AGAR MODUL LAIN OTOMATIS KEREN
    window.alert = function (msg) { window.rpgAlert(msg); };
}