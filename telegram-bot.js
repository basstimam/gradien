const { Builder, By, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
require('console-stamp')(console, {
  format: ':date(yyyy/mm/dd HH:MM:ss.l)'
});

// Konfigurasi untuk extension dan Telegram bot
const extensionId = "caacbgbklghmpodbdafajbgdnegacfmo";
const EXTENSION_FILENAME = "app.crx";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36";

// Ambil konfigurasi login dari environment variables
// Jika tidak tersedia, gunakan nilai default yang harus diganti
const USER = process.env.APP_USER || "";
const PASSWORD = process.env.APP_PASS || "";

// Konfigurasi Telegram statis
const TELEGRAM_BOT_TOKEN = "7781646205:AAGm-JZbvv8-LXW5Ol-h4QcFdGOGzxyQHi0";
let TELEGRAM_CHAT_ID = "";  // Akan diisi setelah mendapatkan chat_id

// Periksa konfigurasi login
if (!USER || !PASSWORD) {
  console.error("❌ Mohon atur APP_USER dan APP_PASS di environment variables");
  process.exit(1);
}

async function getDriverOptions() {
  const options = new chrome.Options();

  // Tambahkan berbagai opsi Chrome
  options.addArguments("--window-size=1920,1080");
  options.addArguments("--start-maximized");
  options.addArguments(`user-agent=${USER_AGENT}`);
  options.addArguments("--disable-dev-shm-usage");
  options.addArguments("--no-sandbox");
  options.addArguments("--remote-allow-origins=*");

  return options;
}

async function takeScreenshot(driver, filename) {
  const data = await driver.takeScreenshot();
  fs.writeFileSync(filename, Buffer.from(data, "base64"));
  console.log(`📸 Screenshot berhasil diambil dan disimpan: ${filename}`);
  return path.resolve(process.cwd(), filename);
}

async function openExtensionPage(driver) {
  try {
    await driver.get(`chrome-extension://${extensionId}/popup.html`);
    console.log("🌐 Halaman extension berhasil dibuka");
    return true;
  } catch (error) {
    console.error(`❌ Error saat membuka halaman extension: ${error.message}`);
    return false;
  }
}

async function getChatId() {
  try {
    console.log("🔍 Mendapatkan daftar update terbaru dari bot...");
    const response = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`);
    
    if (response.data && response.data.ok && response.data.result && response.data.result.length > 0) {
      // Ambil chat_id dari update terakhir
      const updates = response.data.result;
      const lastUpdate = updates[updates.length - 1];
      
      if (lastUpdate.message && lastUpdate.message.chat) {
        const chatId = lastUpdate.message.chat.id;
        console.log(`✅ Berhasil mendapatkan chat_id: ${chatId}`);
        return chatId.toString();
      }
    }
    
    console.log("⚠️ Tidak dapat menemukan chat_id, gunakan chat_id default jika ada");
    return "";
  } catch (error) {
    console.error(`❌ Error saat mendapatkan chat_id: ${error.message}`);
    return "";
  }
}

async function sendToTelegram(filePath, caption) {
  try {
    // Pastikan kita punya chat_id
    if (!TELEGRAM_CHAT_ID) {
      TELEGRAM_CHAT_ID = await getChatId();
      
      if (!TELEGRAM_CHAT_ID) {
        console.error("❌ Tidak dapat mengirim ke Telegram: chat_id tidak ditemukan");
        console.log("ℹ️ Silakan kirim pesan ke bot Telegram Anda terlebih dahulu untuk mendapatkan chat_id");
        return false;
      }
    }
    
    console.log("🚀 Mengirim screenshot ke Telegram...");
    
    const form = new FormData();
    form.append('chat_id', TELEGRAM_CHAT_ID);
    form.append('caption', caption);
    form.append('photo', fs.createReadStream(filePath));
    
    const response = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, 
      form, 
      { headers: form.getHeaders() }
    );
    
    if (response.data && response.data.ok) {
      console.log("✅ Screenshot berhasil dikirim ke Telegram!");
      return true;
    } else {
      console.error("❌ Gagal mengirim ke Telegram:", response.data);
      return false;
    }
  } catch (error) {
    console.error("❌ Error saat mengirim ke Telegram:", error.message);
    return false;
  }
}

async function main() {
  let driver = null;
  
  try {
    console.log("🔄 Memulai browser untuk mengambil screenshot extension...");
    
    // Setup opsi browser
    const options = await getDriverOptions();
    options.addExtensions(path.resolve(__dirname, EXTENSION_FILENAME));
    console.log(`✅ Extension ditambahkan: ${EXTENSION_FILENAME}`);

    // Buat driver
    driver = await new Builder()
      .forBrowser("chrome")
      .setChromeOptions(options)
      .build();
    console.log("✅ Browser berhasil dimulai!");

    // Login ke platform
    console.log("🔑 Melakukan login ke https://app.gradient.network/...");
    try {
      await driver.get("https://app.gradient.network/");
      
      // Cek apakah halaman login muncul
      try {
        const emailInput = By.css('[placeholder="Enter Email"]');
        const passwordInput = By.css('[type="password"]');
        const loginButton = By.css("button");

        await driver.wait(until.elementLocated(emailInput), 30000);
        await driver.wait(until.elementLocated(passwordInput), 30000);
        await driver.wait(until.elementLocated(loginButton), 30000);

        await driver.findElement(emailInput).sendKeys(USER);
        await driver.findElement(passwordInput).sendKeys(PASSWORD);
        await driver.findElement(loginButton).click();
        
        console.log("✅ Login berhasil dilakukan!");
      } catch (loginError) {
        console.log("ℹ️ Form login tidak ditemukan, mungkin sudah login");
      }

      // Tunggu beberapa saat agar login selesai
      await driver.sleep(5000);

      // Buka extension di tab baru
      console.log("🔄 Membuka extension di tab baru...");
      await driver.switchTo().newWindow('tab');
      await openExtensionPage(driver);
      
      // Tunggu extension sepenuhnya dimuat
      await driver.sleep(5000);
      
      // Ambil screenshot
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const screenshotPath = await takeScreenshot(driver, `gradient-extension-${timestamp}.png`);
      
      // Kirim screenshot ke Telegram
      const caption = `🤖 Gradient Extension Screenshot - ${new Date().toLocaleString()}`;
      await sendToTelegram(screenshotPath, caption);
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      
      // Coba ambil screenshot walaupun terjadi error
      try {
        if (driver) {
          const errorScreenshotPath = await takeScreenshot(driver, "error-screenshot.png");
          await sendToTelegram(errorScreenshotPath, "❌ Error ketika mengakses extension");
        }
      } catch (screenshotError) {
        console.error("❌ Tidak dapat mengambil screenshot error:", screenshotError.message);
      }
    } finally {
      // Tutup browser
      if (driver) {
        console.log("🔄 Menutup browser...");
        await driver.quit();
        console.log("✅ Browser berhasil ditutup");
      }
    }
  } catch (mainError) {
    console.error(`❌ Fatal error: ${mainError.message}`);
    process.exit(1);
  }
}

main().catch(console.error); 