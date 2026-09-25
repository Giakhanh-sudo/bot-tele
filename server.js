const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// CẤU HÌNH BOT TELEGRAM & ADMIN
// ==========================================
// Nhập Token Telegram Bot của bạn (hoặc cài biến môi trường BOT_TOKEN trên Render)
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN_HERE';

// Nhập ID Telegram cá nhân của bạn (Admin) vào danh sách này
const ADMIN_IDS = [123456789]; 

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Đường dẫn lưu trữ dữ liệu local trên Server
const KEYS_FILE = path.join(__dirname, 'keys.json');
const STATUS_FILE = path.join(__dirname, 'status.json');
const TOKENS_FILE = path.join(__dirname, 'tokens.json');

app.use(cors());
app.use(express.json());

// ==========================================
// HÀM XỬ LÝ DỮ LIỆU (FILE STORAGE)
// ==========================================
function loadKeys() {
    if (!fs.existsSync(KEYS_FILE)) return {};
    try { return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')); } catch { return {}; }
}

function saveKeys(data) {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function loadStatus() {
    if (!fs.existsSync(STATUS_FILE)) {
        return {
            isMaintenance: false,
            message: "HỆ THỐNG ĐANG BẢO TRÌ ĐỂ CẬP NHẬT!\nVUI LÒNG QUAY LẠI SAU ÍT PHÚT.",
            notice: {
                active: false,
                id: "notice_1",
                title: "THÔNG BÁO TỪ HỆ THỐNG",
                message: "Chào mừng bạn đến với hệ thống SENKOO!"
            }
        };
    }
    try { return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')); } catch { return { isMaintenance: false }; }
}

function saveStatus(data) {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function loadTokens() {
    if (!fs.existsSync(TOKENS_FILE)) return [];
    try { return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8')); } catch { return []; }
}

function saveTokensData(tokens) {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf8');
}

function parseDuration(timeStr) {
    if (!timeStr) return null;
    const match = timeStr.match(/^(\d+)([mhd])$/i);
    if (!match) return null;

    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
        case 'm': return amount * 60 * 1000;             // Phút
        case 'h': return amount * 60 * 60 * 1000;        // Giờ
        case 'd': return amount * 24 * 60 * 60 * 1000;   // Ngày
        default: return null;
    }
}

function generateRandomString(length = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// ==========================================
// API DÀNH CHO CLIENT (INDEX.HTML)
// ==========================================

// 1. Lấy trạng thái bảo trì & thông báo hệ thống
app.get('/api/status', (req, res) => {
    res.json(loadStatus());
});

// 2. Xác thực Key & HWID
app.get('/api/verify', (req, res) => {
    const { key, deviceId } = req.query;
    const statusData = loadStatus();

    if (statusData.isMaintenance) {
        return res.json({
            success: false,
            isMaintenance: true,
            message: statusData.message
        });
    }

    if (!key) {
        return res.json({ success: false, message: '❌ Chưa nhập Key!' });
    }

    const keysData = loadKeys();
    const keyInfo = keysData[key];

    if (!keyInfo) {
        return res.json({ success: false, message: '❌ Key không tồn tại trên hệ thống!' });
    }

    if (Date.now() > keyInfo.expireAt) {
        return res.json({ success: false, message: '⏰ Key này đã hết hạn sử dụng!' });
    }

    if (keyInfo.deviceId && keyInfo.deviceId !== deviceId) {
        return res.json({ success: false, message: '❌ Key đã được liên kết với thiết bị khác!' });
    }

    if (!keyInfo.deviceId && deviceId) {
        keyInfo.deviceId = deviceId;
        saveKeys(keysData);
    }

    return res.json({
        success: true,
        message: '✅ Xác thực Key thành công!',
        expireAt: keyInfo.expireAt
    });
});

// 3. API Đồng bộ Token
app.post('/api/save-tokens', (req, res) => {
    const { key, deviceId, tokens } = req.body;
    if (!tokens || !Array.isArray(tokens)) {
        return res.json({ success: false, message: '❌ Dữ liệu Token không hợp lệ!' });
    }

    // Lưu vào kho Token chung
    let allTokens = loadTokens();
    tokens.forEach(tk => {
        if (tk && !allTokens.includes(tk)) {
            allTokens.push(tk);
        }
    });
    saveTokensData(allTokens);

    // Cập nhật Token riêng theo Key
    const keysData = loadKeys();
    if (key && keysData[key]) {
        keysData[key].tokens = tokens;
        keysData[key].lastUpdated = Date.now();
        saveKeys(keysData);
    }

    return res.json({ success: true, message: 'Đã lưu danh sách Token thành công!' });
});

// ==========================================
// TELEGRAM BOT COMMANDS (ADMIN KEY)
// ==========================================

function isAdmin(msg) {
    return ADMIN_IDS.includes(msg.from.id);
}

// 📌 BẢNG ĐIỀU KHIỂN BOT ADMIN
const sendAdminMenu = (chatId) => {
    const menuText = 
        '🤖 **BẢNG ĐIỀU KHIỂN BOT ADMIN SENKOO**\n\n' +
        '🔹 `/taokey <số_lượng> <mã_key> <thời_gian>` : Tạo Key VIP mới\n' +
        '🔹 `/listtokens` : Xem danh sách Token đã lưu\n' +
        '🔹 `/baotri on` : Bật bảo trì hệ thống\n' +
        '🔹 `/baotri off` : Tắt bảo trì hệ thống\n' +
        '🔹 `/thongbao [Nội dung]` : Bật Popup thông báo trên Tool\n' +
        '🔹 `/tatthongbao` : Tắt Popup thông báo';
    bot.sendMessage(chatId, menuText, { parse_mode: 'Markdown' });
};

bot.onText(/\/(start|help|menu)/, (msg) => {
    if (!isAdmin(msg)) return bot.sendMessage(msg.chat.id, '❌ Bạn không có quyền sử dụng Bot!');
    sendAdminMenu(msg.chat.id);
});

// 1. LỆNH /taokey <số_lượng> <mã_key> <thời_gian>
bot.onText(/\/taokey(?:\s+(.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAdmin(msg)) return bot.sendMessage(chatId, '❌ Bạn không có quyền sử dụng lệnh này!');

    const argsString = match[1];
    if (!argsString) {
        return bot.sendMessage(chatId, 
            '⚠️ **CÚ PHÁP CHƯA ĐÚNG!**\n\n' +
            '👉 **Cú pháp:** `/taokey <số_lượng> <mã_key> <thời_gian>`\n\n' +
            '💡 **Ví dụ:**\n' +
            '• `/taokey 1 VIPKEY123 24h` (Tạo 1 Key cố định)\n' +
            '• `/taokey 5 SENKO 30d` (Tạo 5 Key ngẫu nhiên dạng SENKO-XXXXXX)\n' +
            '• Đơn vị thời gian: `m` (phút), `h` (giờ), `d` (ngày)', 
            { parse_mode: 'Markdown' }
        );
    }

    const args = argsString.trim().split(/\s+/);
    if (args.length < 3) {
        return bot.sendMessage(chatId, '❌ Thiếu tham số! Cú pháp: `<số_lượng> <mã_key> <thời_gian>`', { parse_mode: 'Markdown' });
    }

    const count = parseInt(args[0]);
    const keyPrefix = args[1].toUpperCase();
    const durationMs = parseDuration(args[2]);

    if (isNaN(count) || count <= 0) return bot.sendMessage(chatId, '❌ Số lượng key phải lớn hơn 0!');
    if (count > 50) return bot.sendMessage(chatId, '❌ Tối đa tạo 50 key mỗi lần!');
    if (!durationMs) return bot.sendMessage(chatId, '❌ Đơn vị thời gian không đúng (VD: 30m, 12h, 7d)!', { parse_mode: 'Markdown' });

    const now = Date.now();
    const expireAt = now + durationMs;
    const keysData = loadKeys();
    const createdKeys = [];

    for (let i = 0; i < count; i++) {
        let finalKey = (count === 1) ? keyPrefix : `${keyPrefix}-${generateRandomString(6)}`;
        while (keysData[finalKey]) {
            finalKey = `${keyPrefix}-${generateRandomString(6)}`;
        }

        keysData[finalKey] = {
            createdAt: now,
            expireAt: expireAt,
            durationMs: durationMs,
            deviceId: null,
            createdAdmin: msg.from.id
        };
        createdKeys.push(finalKey);
    }

    saveKeys(keysData);

    const expireDateStr = new Date(expireAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    let responseMsg = `✅ **TẠO KEY THÀNH CÔNG (${count})**\n`;
    responseMsg += `⏳ **Thời hạn:** ${args[2]} (Hết hạn: \`${expireDateStr}\`)\n\n`;
    responseMsg += `🔑 **DANH SÁCH KEY:**\n`;
    createdKeys.forEach(k => responseMsg += `\`${k}\`\n`);

    bot.sendMessage(chatId, responseMsg, { parse_mode: 'Markdown' });
});

// 2. LỆNH /listtokens
bot.onText(/\/listtokens/, (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(msg)) return bot.sendMessage(chatId, '❌ Bạn không có quyền sử dụng lệnh này!');

    const tokens = loadTokens();
    if (tokens.length === 0) {
        return bot.sendMessage(chatId, '📂 Chưa có Token nào được lưu trên hệ thống!');
    }

    let responseMsg = `📋 **DANH SÁCH TOKEN ĐÃ LƯU (${tokens.length})**\n\n`;
    tokens.forEach((tk, idx) => {
        responseMsg += `${idx + 1}. \`${tk}\`\n`;
    });

    if (responseMsg.length > 4000) {
        const chunks = responseMsg.match(/[\s\S]{1,3800}/g);
        chunks.forEach(chunk => bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' }));
    } else {
        bot.sendMessage(chatId, responseMsg, { parse_mode: 'Markdown' });
    }
});

// 3. LỆNH /baotri <on|off>
bot.onText(/\/baotri(?:\s+(.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAdmin(msg)) return bot.sendMessage(chatId, '❌ Bạn không có quyền sử dụng lệnh này!');

    const option = match[1] ? match[1].trim().toLowerCase() : '';
    const statusData = loadStatus();

    if (option === 'on') {
        statusData.isMaintenance = true;
        saveStatus(statusData);
        return bot.sendMessage(chatId, '🛠️ **ĐÃ BẬT CHẾ ĐỘ BẢO TRÌ!**\nTất cả người dùng sẽ bị khóa Tool tạm thời.', { parse_mode: 'Markdown' });
    } else if (option === 'off') {
        statusData.isMaintenance = false;
        saveStatus(statusData);
        return bot.sendMessage(chatId, '🟢 **ĐÃ TẮT CHẾ ĐỘ BẢO TRÌ!**\nHệ thống đã mở lại bình thường.', { parse_mode: 'Markdown' });
    } else {
        return bot.sendMessage(chatId, '⚠️ **Cú pháp:** `/baotri on` (Bật) hoặc `/baotri off` (Tắt)', { parse_mode: 'Markdown' });
    }
});

// 4. LỆNH /thongbao [Nội dung]
bot.onText(/\/thongbao(?:\s+(.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAdmin(msg)) return bot.sendMessage(chatId, '❌ Bạn không có quyền sử dụng lệnh này!');

    const noticeText = match[1] ? match[1].trim() : '';
    if (!noticeText) {
        return bot.sendMessage(chatId, '⚠️ **Vui lòng nhập nội dung!**\nVí dụ: `/thongbao Tool vừa nâng cấp phiên bản mới!`', { parse_mode: 'Markdown' });
    }

    const statusData = loadStatus();
    statusData.notice = {
        active: true,
        id: 'notice_' + Date.now(),
        title: '📢 THÔNG BÁO TỪ HỆ THỐNG',
        message: noticeText
    };
    saveStatus(statusData);

    return bot.sendMessage(chatId, `📢 **ĐÃ BẬT POPUP THÔNG BÁO TRÊN TOOL!**\n\nNội dung:\n"${noticeText}"`, { parse_mode: 'Markdown' });
});

// 5. LỆNH /tatthongbao
bot.onText(/\/tatthongbao/, (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(msg)) return bot.sendMessage(chatId, '❌ Bạn không có quyền sử dụng lệnh này!');

    const statusData = loadStatus();
    if (!statusData.notice) statusData.notice = {};
    statusData.notice.active = false;
    saveStatus(statusData);

    return bot.sendMessage(chatId, '🔕 **ĐÃ TẮT POPUP THÔNG BÁO TRÊN TOOL!**', { parse_mode: 'Markdown' });
});

// Khởi chạy Express Server
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại Port: ${PORT}`);
});
