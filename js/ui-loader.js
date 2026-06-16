// File: js/ui-loader.js

export async function loadUIComponents() {
    // Daftar komponen yang akan dimuat
    const components = [
        { id: 'panel-guild', file: './components/guild.html' },
        { id: 'panel-mailbox', file: './components/mailbox.html' },
        { id: 'panel-bank', file: './components/bank.html' },
        { id: 'panel-auction', file: './components/auction.html' },
        { id: 'panel-blacksmith', file: './components/blacksmith.html' }
    ];

    for (let comp of components) {
        try {
            const response = await fetch(comp.file);
            if (response.ok) {
                const htmlContent = await response.text();
                document.getElementById(comp.id).innerHTML = htmlContent;
            } else {
                console.error(`Gagal memuat komponen: ${comp.file}`);
            }
        } catch (err) {
            console.error(`Error mengambil file ${comp.file}:`, err);
        }
    }
}