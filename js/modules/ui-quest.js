// ==========================================
// FITUR: Render UI Misi Harian & Bounty
// ==========================================
export function renderQuestUI(questData) {
    const btnTake = document.getElementById('btn-take-quest');
    const dTitle = document.getElementById('quest-daily-title');
    const dProg = document.getElementById('quest-daily-prog');
    const btnClaimD = document.getElementById('btn-claim-daily');

    const bTitle = document.getElementById('quest-bounty-title');
    const bProg = document.getElementById('quest-bounty-prog');
    const btnClaimB = document.getElementById('btn-claim-bounty');

    if (!btnTake) return; // Mencegah error jika HTML belum termuat

    const today = new Date().toLocaleDateString('id-ID');

    // JIKA PEMAIN SUDAH PUNYA MISI HARI INI
    if (questData && questData.lastReset === today) {
        btnTake.style.display = 'none'; // Sembunyikan tombol ambil misi

        // Render Misi Harian (Daily)
        if (questData.daily) {
            const dq = questData.daily;
            if (dTitle) dTitle.innerText = dq.title;
            if (dProg) dProg.innerText = `${dq.progress} / ${dq.target}`;

            if (dq.isClaimed) {
                if (btnClaimD) { btnClaimD.style.display = 'inline-block'; btnClaimD.innerText = "Selesai"; btnClaimD.disabled = true; btnClaimD.style.background = "#555"; btnClaimD.style.color = "#888"; }
            } else if (dq.progress >= dq.target) {
                if (btnClaimD) { btnClaimD.style.display = 'inline-block'; btnClaimD.innerText = "Klaim Hadiah"; btnClaimD.disabled = false; btnClaimD.style.background = "#ffca28"; btnClaimD.style.color = "#000"; }
            } else {
                if (btnClaimD) btnClaimD.style.display = 'none';
            }
        }

        // Render Misi Bounty
        if (questData.bounty) {
            const bq = questData.bounty;
            if (bTitle) bTitle.innerText = bq.title;
            if (bProg) bProg.innerText = `${bq.progress} / ${bq.target}`;

            if (bq.isClaimed) {
                if (btnClaimB) { btnClaimB.style.display = 'inline-block'; btnClaimB.innerText = "Selesai"; btnClaimB.disabled = true; btnClaimB.style.background = "#555"; btnClaimB.style.color = "#888"; }
            } else if (bq.progress >= bq.target) {
                if (btnClaimB) { btnClaimB.style.display = 'inline-block'; btnClaimB.innerText = "Klaim Hadiah"; btnClaimB.disabled = false; btnClaimB.style.background = "#ffca28"; btnClaimB.style.color = "#000"; }
            } else {
                if (btnClaimB) btnClaimB.style.display = 'none';
            }
        }
    }
    // JIKA PEMAIN BARU ATAU HARI SUDAH BERGANTI
    else {
        btnTake.style.display = 'block'; // Tampilkan tombol ambil misi
        if (dTitle) dTitle.innerText = "-";
        if (dProg) dProg.innerText = "0/0";
        if (btnClaimD) btnClaimD.style.display = 'none';
        if (bTitle) bTitle.innerText = "-";
        if (bProg) bProg.innerText = "0/0";
        if (btnClaimB) btnClaimB.style.display = 'none';
    }
}