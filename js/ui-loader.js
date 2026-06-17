// File: js/ui-loader.js

export async function loadUIComponents() {
    const components = [
        { id: 'panel-guild', file: './components/guild.html' },
        { id: 'panel-mailbox', file: './components/mailbox.html' },
        { id: 'panel-bank', file: './components/bank.html' },
        { id: 'panel-auction', file: './components/auction.html' },
        { id: 'panel-blacksmith', file: './components/blacksmith.html' },
        { id: 'panel-dungeon', file: './components/dungeon.html' },
        { id: 'panel-party', file: './components/party.html' },
        { id: 'panel-quest', file: './components/quest.html' },
        { id: 'panel-mall', file: './components/mall.html' },
        { id: 'panel-shop', file: './components/shop.html' }
    ];

    for (let comp of components) {
        try {
            const response = await fetch(comp.file);
            if (response.ok) {
                const htmlContent = await response.text();
                const element = document.getElementById(comp.id);
                if (element) {
                    element.innerHTML = htmlContent;
                }
            } else {
                console.error(`Gagal memuat komponen: ${comp.file} (Status: ${response.status})`);
            }
        } catch (err) {
            console.error(`Error mengambil file ${comp.file}:`, err);
        }
    }
}