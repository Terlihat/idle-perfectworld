// ===================================================
// SISTEM RENDER UI CRAFTING
// ===================================================

export function renderCraftingUI(playerInvData, playerLevel, playerGold) {
    const grid = document.getElementById('crafting-recipe-grid');
    if (!grid) return;
    if (typeof CRAFTING_RECIPES === 'undefined') return;

    window._craftingCache = { inv: playerInvData || {}, lvl: playerLevel || 1, gold: playerGold || 0 };

    let html = "";

    for (const recipeName in CRAFTING_RECIPES) {
        const recipe = CRAFTING_RECIPES[recipeName];
        const itemName = recipe.resultItem;

        let iconHtml = "📦";
        try {
            iconHtml = (typeof getIconHTML === 'function') ? getIconHTML(itemName) : window.getIconHTML(itemName);
        } catch (e) { }

        // KITA HAPUS KOTAK BUATAN. Cukup gunakan pembungkus transparan agar ikon asli Anda bebas bernapas!
        html += `
        <div title="${recipeName}" 
             onclick="window.showCraftingDetails('${recipeName}')"
             style="cursor: pointer; display: inline-block; margin: 2px; transition: 0.2s; filter: drop-shadow(0 0 2px rgba(0,0,0,0.5));"
             onmouseover="this.style.filter='drop-shadow(0 0 6px #ffca28)'"
             onmouseout="this.style.filter='drop-shadow(0 0 2px rgba(0,0,0,0.5))'">
             ${iconHtml}
        </div>`;
    }

    grid.innerHTML = html;

    // Tambahkan pengaman tambahan (?) agar tidak error jika id 'crafting-details' belum termuat
    const detailsElement = document.getElementById('crafting-details');
    if (detailsElement) {
        const activeRecipe = detailsElement.getAttribute('data-active-recipe');
        if (activeRecipe && CRAFTING_RECIPES[activeRecipe]) {
            window.showCraftingDetails(activeRecipe);
        }
    }
}

window.showCraftingDetails = function (recipeName) {
    const detailsContainer = document.getElementById('crafting-details');
    if (!detailsContainer) return;

    detailsContainer.setAttribute('data-active-recipe', recipeName);

    const recipe = CRAFTING_RECIPES[recipeName];
    if (!recipe) return;

    const cache = window._craftingCache || { inv: {}, lvl: 1, gold: 0 };
    const playerInvData = cache.inv;
    const playerLevel = cache.lvl;
    const playerGold = cache.gold;

    const safeGetIcon = (name) => {
        try { return (typeof getIconHTML === 'function') ? getIconHTML(name) : window.getIconHTML(name); }
        catch (e) { return "📦"; }
    };

    let mainIconHtml = safeGetIcon(recipe.resultItem);
    let matsHtml = "";

    for (const [matName, qtyNeeded] of Object.entries(recipe.materials)) {
        const playerHas = playerInvData[matName] || 0;
        const qtyColor = playerHas >= qtyNeeded ? "#a6e3a1" : "#ff4c4c";
        let matIconHtml = safeGetIcon(matName);

        // Angka material kini diposisikan mengambang indah di atas ikon asli Anda
        matsHtml += `
            <div title="${matName}" style="position: relative; display: inline-block; margin: 0 4px;">
                ${matIconHtml}
                <div style="position: absolute; bottom: -5px; right: -5px; font-size: 11px; font-weight: bold; color: ${qtyColor}; background: rgba(0,0,0,0.85); padding: 2px 5px; border-radius: 4px; border: 1px solid #444; z-index: 10;">
                    ${playerHas}/${qtyNeeded}
                </div>
            </div>
        `;
    }

    const lvlColor = playerLevel >= recipe.reqLevel ? "#fff" : "#ff4c4c";
    const goldColor = playerGold >= recipe.reqGold ? "#ffca28" : "#ff4c4c";

    detailsContainer.innerHTML = `
        <div title="${recipeName}" style="margin-bottom: 20px; display: flex; justify-content: center; align-items: center; filter: drop-shadow(0 0 10px rgba(255, 202, 40, 0.4));">
            <div style="transform: scale(1.3); pointer-events: none;">
                ${mainIconHtml}
            </div>
        </div>
        
        <h4 style="color: #ffca28; margin: 0 0 10px 0;">${recipeName}</h4>
        
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
            <div style="font-size: 11px; background: #1f2428; padding: 4px 10px; border-radius: 3px; border: 1px solid #444; color: ${lvlColor};">🎯 Lv.${recipe.reqLevel}</div>
            <div style="font-size: 11px; background: #1f2428; padding: 4px 10px; border-radius: 3px; border: 1px solid #444; color: ${goldColor};">💰 ${recipe.reqGold.toLocaleString()}</div>
        </div>

        <div style="font-size: 11px; color: #aaa; margin-bottom: 12px;">Dibutuhkan:</div>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-bottom: 20px;">
            ${matsHtml}
        </div>

        <button onclick="window.craftItemAction(db, currentUserUid, '${recipeName}')" 
                style="background: #238636; color: white; border: none; padding: 10px 20px; border-radius: 4px; font-weight: bold; cursor: pointer; width: 90%; transition: 0.2s; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
            ⚒️ TEMPA SEKARANG
        </button>
    `;
};