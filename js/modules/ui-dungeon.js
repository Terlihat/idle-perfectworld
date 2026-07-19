// ===========================================
// SISTEM UI: DUNGEON MONSTER LIST
// ===========================================

export function setupDungeonUI(db, dungeonAPI) {
    const { fetchMonsterData, calculateMonsterDrops, getDungeonMonstersList } = dungeonAPI;

    // Pasang kembali ke 'window' agar bisa dipanggil oleh sistem pertarungan lama Anda
    window.fetchMonsterData = async function (monsterId) {
        return await fetchMonsterData(db, monsterId);
    };

    window.calculateMonsterDrops = function (dropsArray) {
        return calculateMonsterDrops(dropsArray);
    };

    // Fungsi Render ke Dropdown HTML
    window.loadDungeonMonstersList = async function () {
        const selectBox = document.getElementById('dungeon-select');
        if (!selectBox) return;

        try {
            const monstersArray = await getDungeonMonstersList(db);

            if (!monstersArray || monstersArray.length === 0) {
                selectBox.innerHTML = '<option value="">❌ Belum ada monster di database</option>';
                return;
            }

            selectBox.innerHTML = '';
            monstersArray.forEach(m => {
                const levelText = m.levelReq ? `(Lv. ${m.levelReq})` : '';
                selectBox.innerHTML += `<option value="${m.id}">💀 ${m.name} ${levelText} - HP: ${m.hp}</option>`;
            });

        } catch (err) {
            console.error("Gagal memuat daftar monster untuk UI:", err);
            selectBox.innerHTML = '<option value="">⚠️ Gagal terhubung ke server</option>';
        }
    };
}