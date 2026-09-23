const express = require('express');
const cors = require('cors');

// --- CẤU HÌNH CỦA BẠN ---
const BOT_TOKEN = '8326965315:AAGx_Byqs3qaD8tXevZY8dl8K3ogvMV3l-Y'; 
const ADMIN_ID = 8377928865;

// Thay vì dùng proxy tele.bd-pro.net, dùng API chính thức của Telegram:
const TELEGRAM_API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

const app = express();
app.use(cors());
app.use(express.json());

// Structure: validKeys[key] = { expireAt: timestamp, deviceId: "mã-máy-đầu-tiên" }
let validKeys = {};

function generateRandomKey(prefix = 'VIP') {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return `${prefix}-${result}`;
}

async function sendMessage(chatId, text) {
    try {
        await fetch(`${TELEGRAM_API_BASE}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'Markdown' })
        });
    } catch (e) {
        console.error('❌ Lỗi gửi tin:', e.message);
    }
}

async function clearWebhook() {
    try { await fetch(`${TELEGRAM_API_BASE}/deleteWebhook`); } catch(e) {}
}

let lastUpdateId = 0;
async function pollTelegram() {
    await clearWebhook();
    console.log('📡 Bot đã sẵn sàng nhận lệnh...');

    while (true) {
        try {
            const res = await fetch(`${TELEGRAM_API_BASE}/getUpdates?offset=${lastUpdateId + 1}&timeout=10`);
            const data = await res.json();
            if (data.ok && data.result) {
                for (const update of data.result) {
                    lastUpdateId = update.update_id;
                    if (update.message && update.message.text) {
                        handleCommand(update.message);
                    }
                }
            }
        } catch (e) {
            await new Promise(r => setTimeout(r, 4000));
        }
    }
}

function handleCommand(msg) {
    const chatId = msg.chat.id;
    const text = msg.text.trim();
    const args = text.split(' ');
    const cmd = args[0].toLowerCase();

    // Lệnh User
    if (cmd === '/start') {
        return sendMessage(chatId, "👋 Chào mừng! Nhắn `/getkey` để nhận Key dùng thử 24h.");
    }
    
    if (cmd === '/getkey') {
        const newKey = generateRandomKey('FREE');
        validKeys[newKey] = { expireAt: Date.now() + (24 * 60 * 60 * 1000), deviceId: null };
        return sendMessage(chatId, `🎉 *Tạo Key Miễn Phí Thành Công!*\n🔑 Key: \`${newKey}\`\n⏳ Hạn dùng: 24 Giờ\n🔒 *Lưu ý:* Key chỉ kích hoạt được trên 1 thiết bị!`);
    }

    // --- BỘ LỆNH ADMIN ---
    if (chatId !== ADMIN_ID) return;

    // 1. Tạo Key tùy chỉnh: /createkey <TÊN_KEY> <SỐ_GIỜ>
    if (cmd === '/createkey') {
        const customKey = args[1];
        const hours = parseInt(args[2]) || 24;

        if (!customKey) {
            return sendMessage(chatId, "⚠️ Cú pháp: `/createkey <TÊN_KEY> <SỐ_GIỜ>`");
        }

        validKeys[customKey] = { expireAt: Date.now() + (hours * 60 * 60 * 1000), deviceId: null };
        return sendMessage(chatId, `👑 *ADMIN TẠO KEY THÀNH CÔNG*\n🔑 Key: \`${customKey}\`\n⏱ Thời hạn: ${hours} Giờ`);
    }

    // 2. Tạo Key ngẫu nhiên: /genkey <SỐ_GIỜ>
    if (cmd === '/genkey') {
        const hours = parseInt(args[1]) || 24;
        const newKey = generateRandomKey('ADMIN');
        validKeys[newKey] = { expireAt: Date.now() + (hours * 60 * 60 * 1000), deviceId: null };
        return sendMessage(chatId, `👑 *ADMIN TẠO KEY NGẪU NHIÊN*\n🔑 Key: \`${newKey}\`\n⏱ Thời hạn: ${hours} Giờ`);
    }

    // 3. Reset thiết bị cho 1 key: /resetkey <KEY>
    if (cmd === '/resetkey') {
        const keyToReset = args[1];
        if (validKeys[keyToReset]) {
            validKeys[keyToReset].deviceId = null;
            return sendMessage(chatId, `🔓 Đã gỡ trói thiết bị cho Key \`${keyToReset}\`. Giờ có thể đăng nhập ở máy mới!`);
        } else {
            return sendMessage(chatId, "❌ Key này không tồn tại.");
        }
    }

    // 4. Danh sách key: /listkey
    if (cmd === '/listkey') {
        const keys = Object.keys(validKeys);
        if (keys.length === 0) return sendMessage(chatId, "📋 Chưa có Key nào.");

        let msgText = "📋 *DANH SÁCH KEY HOẠT ĐỘNG:*\n\n";
        const now = Date.now();
        keys.forEach(k => {
            const timeLeft = Math.max(0, Math.round((validKeys[k].expireAt - now) / (1000 * 60)));
            const devStatus = validKeys[k].deviceId ? "🔒 Đã gắn máy" : "🔓 Chưa gắn máy";
            msgText += `• \`${k}\`: Còn ${timeLeft} phút | ${devStatus}\n`;
        });
        return sendMessage(chatId, msgText);
    }

    // 5. Xóa key: /delkey <KEY>
    if (cmd === '/delkey') {
        const keyToDel = args[1];
        if (validKeys[keyToDel]) {
            delete validKeys[keyToDel];
            return sendMessage(chatId, `🗑 Đã xóa Key \`${keyToDel}\`.`);
        } else {
            return sendMessage(chatId, "❌ Key không tồn tại.");
        }
    }
}

// --- API XÁC THỰC KEY TÍCH HỢP HWID & TRẢ VỀ THỜI HẠN ---
app.get('/api/verify', (req, res) => {
    const key = req.query.key;
    const deviceId = req.query.deviceId;

    if (!key || !validKeys[key]) {
        return res.json({ success: false, message: '❌ Key không tồn tại hoặc không chính xác!' });
    }

    if (Date.now() > validKeys[key].expireAt) {
        delete validKeys[key];
        return res.json({ success: false, message: '❌ Key này đã hết hạn sử dụng!' });
    }

    // Kiểm tra khóa thiết bị (1 Key - 1 Thiết bị)
    if (!validKeys[key].deviceId) {
        // Lần đầu đăng nhập -> Trói Key vào thiết bị này
        validKeys[key].deviceId = deviceId;
    } else if (validKeys[key].deviceId !== deviceId) {
        // Đã kích hoạt trên thiết bị khác
        return res.json({ success: false, message: '🚫 Key này đã được sử dụng trên thiết bị khác!' });
    }

    return res.json({ 
        success: true, 
        message: '✅ Xác thực thành công!',
        expireAt: validKeys[key].expireAt 
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server đang chạy tại Port ${PORT}`);
    pollTelegram();
});