// ==========================================
// KONFIGURASI SISTEM VIP (0 - 10)
// ==========================================

export const VIP_CONFIG = {
    0: { reqExp: 0,      goldBonusPct: 0,   expBonusPct: 0,   extraMaxStamina: 0 },
    1: { reqExp: 100,    goldBonusPct: 5,   expBonusPct: 5,   extraMaxStamina: 10 },  // +5% Gold/Exp
    2: { reqExp: 500,    goldBonusPct: 10,  expBonusPct: 10,  extraMaxStamina: 20 },  // +10% Gold/Exp
    3: { reqExp: 1000,   goldBonusPct: 15,  expBonusPct: 15,  extraMaxStamina: 30 },
    4: { reqExp: 2500,   goldBonusPct: 20,  expBonusPct: 20,  extraMaxStamina: 40 },
    5: { reqExp: 5000,   goldBonusPct: 30,  expBonusPct: 30,  extraMaxStamina: 50 },  // Sultan Menengah
    6: { reqExp: 10000,  goldBonusPct: 40,  expBonusPct: 40,  extraMaxStamina: 60 },
    7: { reqExp: 20000,  goldBonusPct: 50,  expBonusPct: 50,  extraMaxStamina: 70 },
    8: { reqExp: 50000,  goldBonusPct: 65,  expBonusPct: 65,  extraMaxStamina: 80 },
    9: { reqExp: 100000, goldBonusPct: 80,  expBonusPct: 80,  extraMaxStamina: 90 },
    10:{ reqExp: 250000, goldBonusPct: 100, expBonusPct: 100, extraMaxStamina: 100 }  // Sultan Puncak (+100% alias 2x lipat)
};

// Fungsi Pintar untuk Mengambil Data VIP Pemain
export function getVipStats(vipLevel) {
    // Jika vipLevel tidak valid atau melebihi 10, gunakan mentok di 10. Jika belum ada, gunakan 0.
    const level = vipLevel ? Math.min(Math.max(0, vipLevel), 10) : 0;
    return VIP_CONFIG[level];
}