// ==========================================
// SISTEM UNIVERSAL RPG MODAL (Pengganti Alert/Confirm/Prompt)
// ==========================================

export function setupRPGModal() {
    window.showModal = function ({ type, msg, title, inputType = 'text', maxValue = null }) {
        return new Promise((resolve) => {
            const modal = document.getElementById('rpg-modal');
            const box = document.getElementById('rpg-modal-box');
            const elTitle = document.getElementById('rpg-modal-title');
            const elMsg = document.getElementById('rpg-modal-msg');
            const elInput = document.getElementById('rpg-modal-input');
            const btnMax = document.getElementById('btn-rpg-max');
            const btnCancel = document.getElementById('btn-rpg-cancel');
            const btnOk = document.getElementById('btn-rpg-ok');

            if (!modal) {
                console.error("HTML Modal belum dipasang!");
                return resolve(type === 'prompt' ? null : (type !== 'confirm'));
            }

            let colorTheme = '#00d2ff';
            if (type === 'alert') colorTheme = '#ffcc00';
            if (type === 'confirm') colorTheme = '#ff9800';

            elTitle.innerText = title;
            elTitle.style.color = colorTheme;
            box.style.borderColor = colorTheme;
            btnOk.style.background = colorTheme;
            elMsg.innerHTML = String(msg).replace(/\n/g, '<br>');

            const newBtnOk = btnOk.cloneNode(true);
            const newBtnCancel = btnCancel.cloneNode(true);
            btnOk.parentNode.replaceChild(newBtnOk, btnOk);
            btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);

            if (type === 'prompt') {
                elInput.style.display = 'block';
                elInput.type = inputType;
                elInput.value = '';
                newBtnCancel.style.display = 'block';

                if (maxValue !== null && btnMax) {
                    btnMax.style.display = 'block';
                    btnMax.onclick = () => { elInput.value = maxValue; };
                } else if (btnMax) {
                    btnMax.style.display = 'none';
                }

            } else if (type === 'confirm') {
                elInput.style.display = 'none';
                if (btnMax) btnMax.style.display = 'none';
                newBtnCancel.style.display = 'block';
            } else {
                elInput.style.display = 'none';
                if (btnMax) btnMax.style.display = 'none';
                newBtnCancel.style.display = 'none';
            }

            modal.style.display = 'flex';
            if (type === 'prompt') elInput.focus();

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

    window.rpgAlert = (msg, title = "Pesan Sistem") => window.showModal({ type: 'alert', msg, title });
    window.rpgConfirm = (msg, title = "Konfirmasi") => window.showModal({ type: 'confirm', msg, title });

    window.rpgPrompt = (msg, title = "Input", inputType = "text", maxValue = null) =>
        window.showModal({ type: 'prompt', msg, title, inputType, maxValue });

    window.alert = function (msg) { window.rpgAlert(msg); };
}