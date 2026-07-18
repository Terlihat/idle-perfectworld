// ==========================================
// SISTEM UI: PESAN PRIBADI (WHISPER)
// ==========================================
import { collection, query, orderBy, onSnapshot, addDoc, doc, getDoc, updateDoc, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export function setupPrivateChatUI(db, getUidCallback, getUsernameCallback) {
    let unsubPrivateChat = null;

    // 1. Tambahkan Animasi Berkedip (Blinking)
    if (!document.getElementById('pm-custom-styles')) {
        const style = document.createElement('style');
        style.id = 'pm-custom-styles';
        style.innerHTML = `
            @keyframes pm-blink {
                0% { background-color: #161b22; }
                50% { background-color: #2ea043; } /* Hijau Terang */
                100% { background-color: #161b22; }
            }
            .pm-alert { animation: pm-blink 1.5s infinite !important; }
        `;
        document.head.appendChild(style);
    }

    // 2. Fungsi Buka Chat
    window.openPrivateChat = function (targetUid, targetName) {
        const currentUserUid = getUidCallback();
        const playerUsername = getUsernameCallback();
        let chatModal = document.getElementById('modal-private-chat');
        const chatId = [currentUserUid, targetUid].sort().join('_');

        if (!chatModal) {
            chatModal = document.createElement('div');
            chatModal.id = 'modal-private-chat';
            chatModal.setAttribute('data-state', 'maximized');
            chatModal.style.cssText = "position:fixed; top:20%; left:30%; width:300px; background:#0d1117; border:1px solid #30363d; border-radius:8px; z-index:1000; display:flex; flex-direction:column; box-shadow: 0 5px 25px rgba(0,0,0,0.9); transition: width 0.2s, top 0.2s, left 0.2s, bottom 0.2s, right 0.2s;";

            const emojis = ['😀', '😂', '😅', '😍', '😎', '😭', '😡', '👍', '🙏', '🎉', '💀', '🔥', '⚔️', '🛡️', '💰', '🌲'];
            const emojiHtml = emojis.map(e => `<span class="pm-emoji-btn" style="cursor:pointer; font-size:18px; padding:2px;">${e}</span>`).join('');

            chatModal.innerHTML = `
                <div id="pm-drag-handle" style="background:#161b22; padding:10px; border-bottom:1px solid #30363d; border-radius:8px 8px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; user-select:none; transition: background-color 0.3s;">
                    <b style="color:#58a6ff; pointer-events:none;">💬 <span id="pm-target-name"></span></b>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <button onclick="window.toggleMinimizeChat()" style="background:transparent; border:none; color:#fff; cursor:pointer; font-size:14px;">—</button>
                        <button onclick="window.closePrivateChat()" style="background:transparent; border:none; color:#ff4c4c; cursor:pointer; font-size:14px;">✖</button>
                    </div>
                </div>
                
                <div id="pm-body" style="display:flex; flex-direction:column; width:100%;">
                    <div id="pm-messages" style="height:250px; overflow-y:auto; padding:10px; display:flex; flex-direction:column; gap:8px; font-size:12px; position:relative;"></div>
                    
                    <div id="pm-emoji-picker" style="display:none; position:absolute; bottom:55px; left:10px; background:#161b22; border:1px solid #30363d; border-radius:6px; padding:8px; width:220px; flex-wrap:wrap; gap:5px; z-index:1001;">
                        ${emojiHtml}
                    </div>

                    <div id="pm-item-picker" style="display:none; position:absolute; bottom:55px; left:10px; background:#161b22; border:1px solid #30363d; border-radius:6px; padding:8px; width:260px; max-height:180px; overflow-y:auto; flex-direction:column; gap:5px; z-index:1001;">
                    </div>
                    
                    <div style="padding:10px; border-top:1px solid #30363d; display:flex; gap:5px; align-items:center;">
                        <button id="pm-emoji-toggle" style="background:transparent; border:none; cursor:pointer; font-size:18px; padding:0 2px;">😀</button>
                        <button id="pm-item-toggle" style="background:transparent; border:none; cursor:pointer; font-size:18px; padding:0 2px;" title="Kirim Item">🎁</button>
                        <input type="text" id="pm-input" placeholder="Tulis pesan..." style="flex:1; padding:8px; background:#010409; color:white; border:1px solid #30363d; border-radius:4px; outline:none;">
                        <button id="pm-send-btn" style="background:#238636; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer; font-weight:bold;">Kirim</button>
                    </div>
                </div>
            `;
            document.body.appendChild(chatModal);

            // DRAG & DROP LOGIC
            const dragHandle = chatModal.querySelector('#pm-drag-handle');
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

            dragHandle.onmousedown = function (e) {
                if (chatModal.getAttribute('data-state') === 'minimized') return;
                if (e.target.tagName === 'BUTTON') return;
                e.preventDefault();
                pos3 = e.clientX; pos4 = e.clientY;
                document.onmouseup = closeDragElement;
                document.onmousemove = elementDrag;
                dragHandle.style.cursor = 'grabbing';
                chatModal.style.transition = 'none';
            };
            function elementDrag(e) {
                e.preventDefault();
                pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
                pos3 = e.clientX; pos4 = e.clientY;
                chatModal.style.top = (chatModal.offsetTop - pos2) + "px";
                chatModal.style.left = (chatModal.offsetLeft - pos1) + "px";
            }
            function closeDragElement() {
                document.onmouseup = null; document.onmousemove = null;
                if (chatModal.getAttribute('data-state') !== 'minimized') dragHandle.style.cursor = 'grab';
                chatModal.style.transition = 'width 0.2s, top 0.2s, left 0.2s, bottom 0.2s, right 0.2s';
            }

            dragHandle.onclick = function (e) {
                if (e.target.tagName === 'BUTTON') return;
                if (chatModal.getAttribute('data-state') === 'minimized') window.toggleMinimizeChat();
            };

            // EMOJI & ITEM TOGGLE LOGIC
            const emojiToggle = chatModal.querySelector('#pm-emoji-toggle');
            const emojiPicker = chatModal.querySelector('#pm-emoji-picker');
            const itemToggle = chatModal.querySelector('#pm-item-toggle');
            const itemPicker = chatModal.querySelector('#pm-item-picker');
            const inputField = chatModal.querySelector('#pm-input');

            emojiToggle.onclick = () => {
                itemPicker.style.display = 'none';
                emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'flex' : 'none';
            };

            chatModal.querySelectorAll('.pm-emoji-btn').forEach(btn => {
                btn.onclick = (e) => {
                    inputField.value += e.target.innerText;
                    emojiPicker.style.display = 'none';
                    inputField.focus();
                };
            });

            itemToggle.onclick = () => {
                emojiPicker.style.display = 'none';
                if (itemPicker.style.display === 'flex') {
                    itemPicker.style.display = 'none';
                    return;
                }
                itemPicker.style.display = 'flex';

                const inv = window.currentInventoryData || {};
                const itemKeys = Object.keys(inv).filter(k => inv[k] > 0);

                if (itemKeys.length === 0) {
                    itemPicker.innerHTML = `<div style="text-align:center; color:#aaa;">Tas Anda Kosong.</div>`;
                    return;
                }

                let invHtml = `<div style="font-weight:bold; color:#ffca28; margin-bottom:5px; text-align:center;">Pilih Item untuk Dikirim</div>`;
                itemKeys.forEach(itemName => {
                    invHtml += `
                        <div style="display:flex; justify-content:space-between; align-items:center; background:#0d1117; padding:5px; border-radius:4px; border:1px solid #30363d;">
                            <span style="color:white; font-size:12px;">${itemName} (x${inv[itemName]})</span>
                            <button onclick="window.processSendItem('${targetUid}', '${itemName}', ${inv[itemName]})" style="background:#0366d6; color:white; border:none; padding:3px 6px; border-radius:3px; cursor:pointer; font-size:11px;">Kirim</button>
                        </div>
                    `;
                });
                itemPicker.innerHTML = invHtml;
            };
        }

        chatModal.setAttribute('data-target-uid', targetUid);
        chatModal.setAttribute('data-chat-id', chatId);

        if (chatModal.getAttribute('data-state') === 'minimized') window.toggleMinimizeChat();

        document.getElementById('pm-target-name').innerText = targetName;
        chatModal.style.display = 'flex';
        document.getElementById('pm-emoji-picker').style.display = 'none';
        document.getElementById('pm-item-picker').style.display = 'none';

        // FIREBASE LOGIC & RENDER PESAN
        const msgContainer = document.getElementById('pm-messages');
        msgContainer.innerHTML = '<div style="color:#aaa; text-align:center;">Memuat pesan...</div>';

        updateDoc(doc(db, "users", currentUserUid), {
            [`unreadMessages.${targetUid}`]: false
        }).catch(err => console.log("Gagal menghapus badge:", err));

        window.processSendItem = async function (tUid, itemName, maxAmount) {
            const amountStr = prompt(`Berapa banyak ${itemName} yang ingin dikirim? (Maks: ${maxAmount})`, "1");
            if (!amountStr) return;
            const amount = parseInt(amountStr);
            if (isNaN(amount) || amount <= 0 || amount > maxAmount) return window.rpgAlert("Jumlah tidak valid!");

            try {
                const userRef = doc(db, "users", currentUserUid);
                const userSnap = await getDoc(userRef);
                let currentInv = userSnap.data().inventory || {};

                if (!currentInv[itemName] || currentInv[itemName] < amount) return window.rpgAlert("Item tidak mencukupi!");

                currentInv[itemName] -= amount;
                if (currentInv[itemName] <= 0) delete currentInv[itemName];
                await updateDoc(userRef, { inventory: currentInv });

                await addDoc(collection(db, "privateChats", chatId, "messages"), {
                    senderUid: currentUserUid,
                    senderName: playerUsername,
                    type: "gift",
                    gift: { name: itemName, amount: amount },
                    isClaimed: false,
                    isRead: false,
                    timestamp: Date.now()
                });

                updateDoc(doc(db, "users", tUid), { [`unreadMessages.${currentUserUid}`]: true }).catch(err => console.log(err));
                document.getElementById('pm-item-picker').style.display = 'none';
            } catch (err) { console.error(err); window.rpgAlert("Gagal mengirim item."); }
        };

        const q = query(collection(db, "privateChats", chatId, "messages"), orderBy("timestamp", "asc"));
        if (unsubPrivateChat) unsubPrivateChat();
        let isFirstLoad = true;

        unsubPrivateChat = onSnapshot(q, (snapshot) => {
            msgContainer.innerHTML = '';
            if (snapshot.empty) msgContainer.innerHTML = '<div style="color:#aaa; text-align:center;">Belum ada pesan. Sapa temanmu!</div>';

            let unreadDocsToUpdate = [];

            snapshot.forEach((docSnap) => {
                const msg = docSnap.data();
                const isMe = msg.senderUid === currentUserUid;

                if (!isMe && msg.isRead === false) {
                    const modalState = document.getElementById('modal-private-chat').getAttribute('data-state');
                    if (modalState === 'maximized') {
                        unreadDocsToUpdate.push(docSnap.ref);
                    }
                }

                const dateObj = new Date(msg.timestamp);
                const timeString = dateObj.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

                const readIcon = isMe ? (msg.isRead ? `<span style="color:#58a6ff; margin-left:4px; font-size:10px;">✔✔</span>` : `<span style="color:#aaa; margin-left:4px; font-size:10px;">✔</span>`) : '';

                let contentHtml = "";
                if (msg.type === "gift") {
                    const isClaimed = msg.isClaimed;
                    if (isMe) {
                        contentHtml = `
                            <div style="border:1px dashed #e3b341; background:rgba(227,179,65,0.1); padding:8px; border-radius:4px; text-align:center;">
                                <div style="font-size:16px;">🎁</div>
                                Mengirim <b>${msg.gift.amount}x ${msg.gift.name}</b><br>
                                <span style="font-size:10px; color:${isClaimed ? '#a6e3a1' : '#aaa'};">${isClaimed ? '✔ Telah Diambil' : 'Menunggu Diambil...'}</span>
                            </div>`;
                    } else {
                        if (isClaimed) {
                            contentHtml = `
                                <div style="border:1px dashed #58a6ff; background:rgba(88,166,255,0.1); padding:8px; border-radius:4px; text-align:center; color:#aaa;">
                                    🎁 <b>${msg.gift.amount}x ${msg.gift.name}</b><br><span style="font-size:10px;">(Telah Anda Ambil)</span>
                                </div>`;
                        } else {
                            contentHtml = `
                                <div style="border:1px dashed #2ea043; background:rgba(46,160,67,0.1); padding:8px; border-radius:4px; text-align:center;">
                                    <div style="font-size:16px;">🎁</div>
                                    <b>${msg.gift.amount}x ${msg.gift.name}</b><br>
                                    <button onclick="window.claimChatGift('${chatId}', '${docSnap.id}')" style="margin-top:5px; background:#2ea043; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; font-weight:bold; width:100%;">Ambil Item</button>
                                </div>`;
                        }
                    }
                } else {
                    contentHtml = `<span style="color:white; font-size:13px;">${msg.text}</span>`;
                }

                msgContainer.innerHTML += `
                    <div style="align-self: ${isMe ? 'flex-end' : 'flex-start'}; background: ${isMe ? '#238636' : '#1f2428'}; padding:6px 10px; border-radius:8px; max-width:80%; word-wrap:break-word; box-shadow:0 2px 5px rgba(0,0,0,0.2);">
                        ${contentHtml}
                        <div style="font-size:9px; color:${isMe ? '#a6e3a1' : '#aaa'}; display:flex; justify-content:${isMe ? 'flex-end' : 'flex-start'}; align-items:center; margin-top:4px;">
                            <span>${timeString}</span> ${readIcon}
                        </div>
                    </div>
                `;
            });

            unreadDocsToUpdate.forEach(ref => updateDoc(ref, { isRead: true }).catch(e => console.log(e)));

            if (!isFirstLoad) {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === "added" && change.doc.data().senderUid !== currentUserUid) {
                        const modalState = document.getElementById('modal-private-chat').getAttribute('data-state');
                        if (modalState === 'minimized') document.getElementById('pm-drag-handle').classList.add('pm-alert');
                    }
                });
            }
            isFirstLoad = false;
            msgContainer.scrollTop = msgContainer.scrollHeight;
        });

        const sendBtn = document.getElementById('pm-send-btn');
        const inputField = document.getElementById('pm-input');
        const newSendBtn = sendBtn.cloneNode(true);
        sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);

        newSendBtn.addEventListener('click', async () => {
            const text = inputField.value.trim();
            if (!text) return;
            inputField.value = '';
            document.getElementById('pm-emoji-picker').style.display = 'none';
            document.getElementById('pm-item-picker').style.display = 'none';

            await addDoc(collection(db, "privateChats", chatId, "messages"), {
                senderUid: currentUserUid,
                senderName: playerUsername,
                type: "text",
                text: text,
                isRead: false,
                timestamp: Date.now()
            });

            updateDoc(doc(db, "users", targetUid), { [`unreadMessages.${currentUserUid}`]: true }).catch(err => console.log(err));
        });

        inputField.onkeypress = function (e) { if (e.key === 'Enter') newSendBtn.click(); };
    };

    // 3. Fungsi Minimize Chat
    window.toggleMinimizeChat = function () {
        const currentUserUid = getUidCallback();
        const chatModal = document.getElementById('modal-private-chat');
        if (!chatModal) return;

        const state = chatModal.getAttribute('data-state');
        const body = document.getElementById('pm-body');
        const dragHandle = document.getElementById('pm-drag-handle');

        if (state === 'maximized') {
            chatModal.setAttribute('data-last-top', chatModal.style.top);
            chatModal.setAttribute('data-last-left', chatModal.style.left);

            body.style.display = 'none';
            chatModal.style.top = 'auto'; chatModal.style.left = 'auto';
            chatModal.style.bottom = '10px'; chatModal.style.right = '10px';
            chatModal.style.width = '200px';
            chatModal.setAttribute('data-state', 'minimized');

            dragHandle.style.cursor = 'pointer';
            dragHandle.title = "Klik untuk membuka pesan";
        } else {
            body.style.display = 'flex';
            chatModal.style.bottom = 'auto'; chatModal.style.right = 'auto';
            chatModal.style.top = chatModal.getAttribute('data-last-top') || '20%';
            chatModal.style.left = chatModal.getAttribute('data-last-left') || '30%';
            chatModal.style.width = '300px';
            chatModal.setAttribute('data-state', 'maximized');

            dragHandle.classList.remove('pm-alert');
            dragHandle.style.cursor = 'grab';
            dragHandle.title = "";

            const msgContainer = document.getElementById('pm-messages');
            msgContainer.scrollTop = msgContainer.scrollHeight;

            const tUid = chatModal.getAttribute('data-target-uid');
            const cId = chatModal.getAttribute('data-chat-id');
            if (tUid && cId) {
                updateDoc(doc(db, "users", currentUserUid), { [`unreadMessages.${tUid}`]: false }).catch(e => console.log(e));
                const qUnread = query(collection(db, "privateChats", cId, "messages"), where("isRead", "==", false));
                getDocs(qUnread).then(snaps => {
                    snaps.forEach(d => {
                        if (d.data().senderUid === tUid) updateDoc(d.ref, { isRead: true });
                    });
                });
            }
        }
    };

    // 4. Fungsi Tutup Chat
    window.closePrivateChat = function () {
        const chatModal = document.getElementById('modal-private-chat');
        if (chatModal) chatModal.style.display = 'none';
        if (unsubPrivateChat) {
            unsubPrivateChat();
            unsubPrivateChat = null;
        }
    };

    // 5. Fungsi Klaim Hadiah
    window.claimChatGift = async function (chatId, msgId) {
        const currentUserUid = getUidCallback();
        try {
            const msgRef = doc(db, "privateChats", chatId, "messages", msgId);
            const msgSnap = await getDoc(msgRef);
            if (!msgSnap.exists()) return window.rpgAlert("Pesan tidak ditemukan!");

            const msgData = msgSnap.data();
            if (msgData.isClaimed) return window.rpgAlert("Hadiah ini sudah diambil!");
            if (msgData.senderUid === currentUserUid) return window.rpgAlert("Anda tidak bisa mengklaim hadiah sendiri!");

            const userRef = doc(db, "users", currentUserUid);
            const userSnap = await getDoc(userRef);
            const userData = userSnap.data();

            let currentInv = userData.inventory || {};
            const itemName = msgData.gift.name;
            const itemAmount = msgData.gift.amount;

            currentInv[itemName] = (currentInv[itemName] || 0) + itemAmount;

            await updateDoc(userRef, { inventory: currentInv });
            await updateDoc(msgRef, { isClaimed: true });

            window.rpgAlert(`Berhasil mengambil ${itemAmount}x ${itemName}!`, "Hadiah Diterima");
        } catch (err) {
            console.error("Gagal klaim hadiah:", err);
            window.rpgAlert("Terjadi kesalahan saat mengambil hadiah.");
        }
    };
}