const axios = require('axios');

const TELEGRAM_BOT_TOKEN = "7781646205:AAGm-JZbvv8-LXW5Ol-h4QcFdGOGzxyQHi0";

async function getChatId() {
  try {
    console.log("🔍 Mendapatkan chat_id dari bot Telegram...");
    const response = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`);
    
    if (response.data && response.data.ok && response.data.result && response.data.result.length > 0) {
      console.log("📋 Daftar update yang ditemukan:");
      
      response.data.result.forEach((update, index) => {
        if (update.message && update.message.chat) {
          console.log(`${index + 1}. Chat ID: ${update.message.chat.id}`);
          console.log(`   Nama: ${update.message.chat.first_name || 'N/A'} ${update.message.chat.last_name || ''}`);
          console.log(`   Username: @${update.message.chat.username || 'N/A'}`);
          console.log(`   Pesan: "${update.message.text || 'N/A'}"`);
          console.log(`   Tanggal: ${new Date(update.message.date * 1000).toLocaleString()}`);
          console.log("---");
        }
      });
      
      // Ambil chat_id terakhir
      const lastUpdate = response.data.result[response.data.result.length - 1];
      if (lastUpdate.message && lastUpdate.message.chat) {
        const chatId = lastUpdate.message.chat.id;
        console.log(`✅ Chat ID yang akan digunakan: ${chatId}`);
        console.log(`\n📝 Tambahkan baris ini ke file .env Anda:`);
        console.log(`TELEGRAM_CHAT_ID=${chatId}`);
        return chatId;
      }
    } else {
      console.log("❌ Tidak ada update ditemukan.");
      console.log("💡 Pastikan Anda sudah mengirim pesan ke bot Telegram terlebih dahulu.");
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
}

getChatId();