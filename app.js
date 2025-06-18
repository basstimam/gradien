const { Builder, By, until, Capabilities } = require("selenium-webdriver")
const chrome = require("selenium-webdriver/chrome")
const url = require("url")
const fs = require("fs")
const crypto = require("crypto")
const request = require("request")
const path = require("path")
const FormData = require("form-data")
const proxy = require("selenium-webdriver/proxy")
const proxyChain = require("proxy-chain")
const axios = require("axios")
require('console-stamp')(console, {
  format: ':date(yyyy/mm/dd HH:MM:ss.l)'
})
require("dotenv").config()

const extensionId = "caacbgbklghmpodbdafajbgdnegacfmo"
const CRX_URL = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=98.0.4758.102&acceptformat=crx2,crx3&x=id%3D${extensionId}%26uc&nacl_arch=x86-64`
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36"

const USER = process.env.APP_USER || ""
const PASSWORD = process.env.APP_PASS || ""
const ALLOW_DEBUG = !!process.env.DEBUG?.length || false
const EXTENSION_FILENAME = "app.crx"
const PROXY = process.env.PROXY || undefined

// Konfigurasi Telegram statis
const TELEGRAM_BOT_TOKEN = "7781646205:AAGm-JZbvv8-LXW5Ol-h4QcFdGOGzxyQHi0"
let TELEGRAM_CHAT_ID = ""
const SEND_SCREENSHOT_TO_TELEGRAM = true
const SCREENSHOT_INTERVAL_MINUTES = 5 // Diubah dari 120 menjadi 5 menit

console.log("-> Starting...")
console.log("-> User:", USER)
console.log("-> Pass:", PASSWORD)
console.log("-> Proxy:", PROXY)
console.log("-> Debug:", ALLOW_DEBUG)
console.log("-> Send Screenshot to Telegram:", SEND_SCREENSHOT_TO_TELEGRAM)

if (!USER || !PASSWORD) {
  console.error("Please set APP_USER and APP_PASS env variables")
  process.exit()
}

if (ALLOW_DEBUG) {
  console.log(
    "-> Debugging is enabled! This will generate a screenshot and console logs on error!"
  )
}

// Fungsi untuk mendapatkan chat_id dari Telegram
async function getChatId() {
  try {
    console.log("-> Mendapatkan daftar update terbaru dari bot Telegram...")
    const response = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`)
    
    if (response.data && response.data.ok && response.data.result && response.data.result.length > 0) {
      // Ambil chat_id dari update terakhir
      const updates = response.data.result
      const lastUpdate = updates[updates.length - 1]
      
      if (lastUpdate.message && lastUpdate.message.chat) {
        const chatId = lastUpdate.message.chat.id
        console.log(`-> Berhasil mendapatkan chat_id: ${chatId}`)
        return chatId.toString()
      }
    }
    
    console.log("-> Tidak dapat menemukan chat_id")
    return ""
  } catch (error) {
    console.error(`-> Error saat mendapatkan chat_id: ${error.message}`)
    return ""
  }
}

// Fungsi untuk mengirim screenshot ke Telegram
async function sendToTelegram(filePath, caption) {
  try {
    // Pastikan kita punya chat_id
    if (!TELEGRAM_CHAT_ID) {
      TELEGRAM_CHAT_ID = await getChatId()
      
      if (!TELEGRAM_CHAT_ID) {
        console.error("-> Tidak dapat mengirim ke Telegram: chat_id tidak ditemukan")
        console.log("-> Silakan kirim pesan ke bot Telegram Anda terlebih dahulu untuk mendapatkan chat_id")
        return false
      }
    }
    
    console.log("-> Mengirim screenshot ke Telegram...")
    
    const form = new FormData()
    form.append('chat_id', TELEGRAM_CHAT_ID)
    form.append('caption', caption)
    form.append('photo', fs.createReadStream(filePath))
    
    const response = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, 
      form, 
      { headers: form.getHeaders() }
    )
    
    if (response.data && response.data.ok) {
      console.log("-> Screenshot berhasil dikirim ke Telegram!")
      return true
    } else {
      console.error("-> Gagal mengirim ke Telegram:", response.data)
      return false
    }
  } catch (error) {
    console.error(`-> Error saat mengirim ke Telegram: ${error.message}`)
    return false
  }
}

async function downloadExtension(extensionId) {
  const url = CRX_URL.replace(extensionId, extensionId)
  const headers = { "User-Agent": USER_AGENT }

  console.log("-> Downloading extension from:", url)

  // if file exists and modify time is less than 1 day, skip download
  if (fs.existsSync(EXTENSION_FILENAME) && fs.statSync(EXTENSION_FILENAME).mtime > Date.now() - 86400000) {
    console.log("-> Extension already downloaded! skip download...")
    return
  }

  return new Promise((resolve, reject) => {
    request({ url, headers, encoding: null }, (error, response, body) => {
      if (error) {
        console.error("Error downloading extension:", error)
        return reject(error)
      }
      fs.writeFileSync(EXTENSION_FILENAME, body)
      if (ALLOW_DEBUG) {
        const md5 = crypto.createHash("md5").update(body).digest("hex")
        console.log("-> Extension MD5: " + md5)
      }
      resolve()
    })
  })
}

async function takeScreenshot(driver, filename) {
  try {
  const data = await driver.takeScreenshot()
  fs.writeFileSync(filename, Buffer.from(data, "base64"))
    console.log(`-> Screenshot taken and saved: ${filename}`)
    return path.resolve(process.cwd(), filename)
  } catch (error) {
    console.error(`-> Error taking screenshot: ${error.message}`)
    return null
  }
}

async function generateErrorReport(driver) {
  //write dom
  const dom = await driver.findElement(By.css("html")).getAttribute("outerHTML")
  fs.writeFileSync("error.html", dom)

  await takeScreenshot(driver, "error.png")

  const logs = await driver.manage().logs().get("browser")
  fs.writeFileSync(
    "error.log",
    logs.map((log) => `${log.level.name}: ${log.message}`).join("\n")
  )
}

async function getDriverOptions() {
  const options = new chrome.Options()

  options.addArguments("--headless")
  options.addArguments("--single-process")
  options.addArguments(`user-agent=${USER_AGENT}`)
  options.addArguments("--remote-allow-origins=*")
  options.addArguments("--disable-dev-shm-usage")
  // options.addArguments("--incognito")
  options.addArguments('enable-automation')
  options.addArguments("--window-size=1920,1080")
  options.addArguments("--start-maximized")
  options.addArguments("--disable-renderer-backgrounding")
  options.addArguments("--disable-background-timer-throttling")
  options.addArguments("--disable-backgrounding-occluded-windows")
  options.addArguments("--disable-low-res-tiling")
  options.addArguments("--disable-client-side-phishing-detection")
  options.addArguments("--disable-crash-reporter")
  options.addArguments("--disable-oopr-debug-crash-dump")
  options.addArguments("--disable-infobars")
  options.addArguments("--dns-prefetch-disable")
  options.addArguments("--disable-crash-reporter")
  options.addArguments("--disable-in-process-stack-traces")
  options.addArguments("--disable-popup-blocking")
  options.addArguments("--disable-gpu")
  options.addArguments("--disable-web-security")
  options.addArguments("--disable-default-apps")
  options.addArguments("--ignore-certificate-errors")
  options.addArguments("--ignore-ssl-errors")
  options.addArguments("--no-sandbox")
  options.addArguments("--no-crash-upload")
  options.addArguments("--no-zygote")
  options.addArguments("--no-first-run")
  options.addArguments("--no-default-browser-check")
  options.addArguments("--remote-allow-origins=*")
  options.addArguments("--allow-running-insecure-content")
  options.addArguments("--enable-unsafe-swiftshader")

  if (!ALLOW_DEBUG) {
    // options.addArguments("--blink-settings=imagesEnabled=false")
  }

  if (PROXY) {
    console.log("-> Setting up proxy...", PROXY)

    let proxyUrl = PROXY

    // if no scheme, add http://
    if (!proxyUrl.includes("://")) {
      proxyUrl = `http://${proxyUrl}`
    }

    try {
      // Gunakan proxyChain untuk mengakomodasi berbagai format proxy
    const newProxyUrl = await proxyChain.anonymizeProxy(proxyUrl)
    console.log("-> New proxy URL:", newProxyUrl)

      // Ekstrak informasi dari URL proxy
      const parsedUrl = new URL(newProxyUrl)
      console.log("-> Proxy host:", parsedUrl.hostname)
      console.log("-> Proxy port:", parsedUrl.port)
      
      // Gunakan kedua metode untuk memastikan proxy bekerja
    options.setProxy(
      proxy.manual({
        http: newProxyUrl,
        https: newProxyUrl,
          socks: newProxyUrl, // Tambahkan ini untuk mendukung SOCKS
          bypass: 'localhost,127.0.0.1' // Bypass untuk localhost
        })
      )
      
      // Tambahkan juga sebagai argumen Chrome
      const proxyType = proxyUrl.startsWith('socks') ? 'socks5' : 'http';
      options.addArguments(`--proxy-server=${proxyType}://${parsedUrl.hostname}:${parsedUrl.port}`);
      
    console.log("-> Setting up proxy done!")
    } catch (error) {
      console.error("-> Error setting up proxy:", error.message)
      console.log("-> Will try to continue without proxy...")
    }
  } else {
    console.log("-> No proxy set!")
  }

  return options
}

async function getProxyIpInfo(driver, proxyUrl) {
  // Coba beberapa layanan untuk memeriksa IP
  const ipCheckUrls = [
    "https://myip.ipip.net",
    "https://httpbin.org/ip",
    "https://api.ipify.org"
  ];

  console.log("-> Getting proxy IP info:", proxyUrl)

  let success = false;
  let ipInfo = "";

  for (const url of ipCheckUrls) {
  try {
      console.log(`-> Checking IP using ${url}...`)
    await driver.get(url)
      await driver.wait(until.elementLocated(By.css("body")), 15000)
    const pageText = await driver.findElement(By.css("body")).getText()
    console.log("-> Proxy IP info:", pageText)
      ipInfo = pageText;
      success = true;
      break;
    } catch (error) {
      console.log(`-> Failed to check IP using ${url}:`, error.message)
    }
  }

  if (!success) {
    console.error("-> Failed to get proxy IP info from all services")
    if (PROXY) {
      console.log(`-> Please check your proxy manually: curl -vv -x ${PROXY} https://api.ipify.org`)
      console.log("-> If the proxy doesn't work, try another one or run without proxy")
    }
  }

  return ipInfo;
}

// Fungsi untuk membuka halaman ekstensi
async function openExtensionPage(driver) {
  try {
    await driver.get(`chrome-extension://${extensionId}/popup.html`);
    console.log("-> Extension page opened successfully");
    return true;
  } catch (error) {
    console.error(`-> Error opening extension page: ${error.message}`);
    return false;
  }
}

// Fungsi untuk mengklik tombol login di ekstensi
async function clickLoginButton(driver) {
  try {
    console.log("-> Mencari tombol 'Log in' di extension...");
    
    // Tunggu beberapa saat agar halaman dimuat dengan baik
    await driver.sleep(5000);
    
    // Metode 1: Cari elemen yang mengandung teks "Log in" secara tepat
    try {
      const loginElements = await driver.executeScript(`
        return Array.from(document.querySelectorAll("*")).filter(el => 
          el.textContent.trim() === "Log in" && 
          (el.className.includes("cursor-pointer") || el.style.cursor === "pointer" || el.tagName === "BUTTON" || 
           el.onclick || el.parentElement.onclick)
        );
      `);
      
      console.log(`-> Ditemukan ${loginElements.length} elemen dengan teks 'Log in'`);
      
      if (loginElements && loginElements.length > 0) {
        // Ambil screenshot sebelum klik
        await takeScreenshot(driver, "before-login.png");
        
        // Klik elemen pertama yang ditemukan
        await driver.executeScript("arguments[0].click();", loginElements[0]);
        console.log("-> Tombol 'Log in' berhasil diklik!");
        
        // Tunggu sebentar dan ambil screenshot setelah klik
        await driver.sleep(3000);
        const screenshotPath = await takeScreenshot(driver, "after-login-click.png");
        
        // Kirim screenshot ke Telegram
        if (SEND_SCREENSHOT_TO_TELEGRAM && screenshotPath) {
          await sendToTelegram(screenshotPath, "🔐 Tombol 'Log in' berhasil diklik pada extension Gradient Network");
        }
        
        return true;
      }
    } catch (error) {
      console.log(`-> Error saat mencari 'Log in' tepat: ${error.message}`);
    }
    
    // Metode 2: Cari elemen yang mengandung teks "Log in" (case insensitive)
    try {
      const loginElements = await driver.executeScript(`
        return Array.from(document.querySelectorAll("*")).filter(el => 
          el.textContent.trim().toLowerCase() === "log in" && 
          (el.className.includes("cursor-pointer") || el.style.cursor === "pointer" || el.tagName === "BUTTON" || 
           el.onclick || el.parentElement.onclick)
        );
      `);
      
      console.log(`-> Ditemukan ${loginElements.length} elemen dengan teks 'log in' (case insensitive)`);
      
      if (loginElements && loginElements.length > 0) {
        // Ambil screenshot sebelum klik
        await takeScreenshot(driver, "before-login.png");
        
        // Klik elemen pertama yang ditemukan
        await driver.executeScript("arguments[0].click();", loginElements[0]);
        console.log("-> Tombol 'log in' berhasil diklik!");
        
        // Tunggu sebentar dan ambil screenshot setelah klik
        await driver.sleep(3000);
        const screenshotPath = await takeScreenshot(driver, "after-login-click.png");
        
        // Kirim screenshot ke Telegram
        if (SEND_SCREENSHOT_TO_TELEGRAM && screenshotPath) {
          await sendToTelegram(screenshotPath, "🔐 Tombol 'log in' berhasil diklik pada extension Gradient Network");
        }
        
        return true;
      }
    } catch (error) {
      console.log(`-> Error saat mencari 'log in' case insensitive: ${error.message}`);
    }
    
    // Metode 3: Cari elemen yang mengandung teks "Log in" sebagai substring
    try {
      const loginElements = await driver.executeScript(`
        return Array.from(document.querySelectorAll("*")).filter(el => 
          el.textContent.includes("Log in") && 
          (el.className.includes("cursor-pointer") || el.style.cursor === "pointer" || el.tagName === "BUTTON" || 
           el.onclick || el.parentElement.onclick)
        );
      `);
      
      console.log(`-> Ditemukan ${loginElements.length} elemen yang mengandung 'Log in' sebagai substring`);
      
      if (loginElements && loginElements.length > 0) {
        // Ambil screenshot sebelum klik
        await takeScreenshot(driver, "before-login.png");
        
        // Klik elemen pertama yang ditemukan
        await driver.executeScript("arguments[0].click();", loginElements[0]);
        console.log("-> Tombol yang mengandung 'Log in' berhasil diklik!");
        
        // Tunggu sebentar dan ambil screenshot setelah klik
        await driver.sleep(3000);
        const screenshotPath = await takeScreenshot(driver, "after-login-click.png");
        
        // Kirim screenshot ke Telegram
        if (SEND_SCREENSHOT_TO_TELEGRAM && screenshotPath) {
          await sendToTelegram(screenshotPath, "🔐 Tombol yang mengandung 'Log in' berhasil diklik pada extension Gradient Network");
        }
        
        return true;
      }
    } catch (error) {
      console.log(`-> Error saat mencari substring 'Log in': ${error.message}`);
    }
    
    // Metode 4: Cari tombol Login sebagai fallback
    try {
      console.log("-> Mencoba mencari tombol 'Login' sebagai alternatif...");
      
      const loginElements = await driver.executeScript(`
        return Array.from(document.querySelectorAll("*")).filter(el => 
          (el.textContent.includes("Login") || el.textContent.includes("login")) && 
          (el.className.includes("cursor-pointer") || el.style.cursor === "pointer" || el.tagName === "BUTTON" || 
           el.onclick || el.parentElement.onclick)
        );
      `);
      
      if (loginElements && loginElements.length > 0) {
        // Ambil screenshot sebelum klik
        await takeScreenshot(driver, "before-login.png");
        
        // Klik elemen pertama yang ditemukan
        await driver.executeScript("arguments[0].click();", loginElements[0]);
        console.log("-> Tombol 'Login' berhasil diklik sebagai alternatif!");
        
        // Tunggu sebentar dan ambil screenshot setelah klik
        await driver.sleep(3000);
        const screenshotPath = await takeScreenshot(driver, "after-login-click.png");
        
        // Kirim screenshot ke Telegram
        if (SEND_SCREENSHOT_TO_TELEGRAM && screenshotPath) {
          await sendToTelegram(screenshotPath, "🔐 Tombol 'Login' berhasil diklik pada extension Gradient Network");
        }
        
        return true;
      }
    } catch (error) {
      console.log(`-> Error saat mencari tombol 'Login' alternatif: ${error.message}`);
    }
    
    // Jika semua metode di atas gagal, ambil screenshot kondisi saat ini dan kirim ke Telegram
    console.log("-> Tidak dapat menemukan tombol login dengan semua metode.");
    const failScreenshotPath = await takeScreenshot(driver, "login-button-not-found.png");
    
    if (SEND_SCREENSHOT_TO_TELEGRAM && failScreenshotPath) {
      await sendToTelegram(failScreenshotPath, "⚠️ Tidak dapat menemukan tombol login pada extension Gradient Network");
    }
    
    return false;
  } catch (error) {
    console.error(`-> Error dalam clickLoginButton: ${error.message}`);
    return false;
  }
}

// Fungsi untuk mengklik tombol close pada extension
async function clickCloseButton(driver) {
  try {
    console.log("-> Mencoba mengklik tombol close pada extension...");
    
    // Tunggu 2 detik
    await driver.sleep(2000);
    
    // Metode 1: Menggunakan XPath yang diberikan
    try {
      const xpath = '/html/body/div[3]/div/div[2]/div/div[1]/div/div/div/button';
      await driver.wait(until.elementLocated(By.xpath(xpath)), 5000);
      const element = await driver.findElement(By.xpath(xpath));
      
      // Ambil screenshot sebelum klik
      await takeScreenshot(driver, "before-close-button-click.png");
      
      // Tunggu 2 detik
      await driver.sleep(2000);
      
      // Klik elemen
      await driver.executeScript("arguments[0].click();", element);
      console.log("-> Tombol close berhasil diklik!");
      
      // Tunggu 2 detik dan ambil screenshot setelah klik
      await driver.sleep(2000);
      const screenshotPath = await takeScreenshot(driver, "after-close-button-click.png");
      
      // Kirim screenshot ke Telegram
      if (SEND_SCREENSHOT_TO_TELEGRAM && screenshotPath) {
        await sendToTelegram(screenshotPath, "✖️ Tombol close berhasil diklik pada extension Gradient Network");
      }
      
      return true;
    } catch (error) {
      console.log(`-> Error saat menggunakan XPath close button: ${error.message}`);
    }
    
    // Metode 2: Mencoba mencari tombol close dengan teks
    try {
      // Cari elemen yang mengandung teks "close" atau "Close"
      const closeElements = await driver.executeScript(`
        return Array.from(document.querySelectorAll("button")).filter(el => 
          el.textContent.toLowerCase().includes("close") || 
          (el.getAttribute("aria-label") && el.getAttribute("aria-label").toLowerCase().includes("close"))
        );
      `);
      
      if (closeElements && closeElements.length > 0) {
        // Tunggu 2 detik
        await driver.sleep(2000);
        
        // Klik elemen pertama yang ditemukan
        await driver.executeScript("arguments[0].click();", closeElements[0]);
        console.log("-> Tombol close berhasil diklik menggunakan pencarian teks!");
        
        // Tunggu 2 detik dan ambil screenshot setelah klik
        await driver.sleep(2000);
        const screenshotPath = await takeScreenshot(driver, "after-close-button-click.png");
        
        // Kirim screenshot ke Telegram
        if (SEND_SCREENSHOT_TO_TELEGRAM && screenshotPath) {
          await sendToTelegram(screenshotPath, "✖️ Tombol close berhasil diklik pada extension Gradient Network");
        }
        
        return true;
      }
    } catch (error) {
      console.log(`-> Error saat mencari tombol close dengan teks: ${error.message}`);
    }
    
    console.log("-> Tidak dapat menemukan tombol close.");
    return false;
  } catch (error) {
    console.error(`-> Error dalam clickCloseButton: ${error.message}`);
    return false;
  }
}

// Fungsi untuk mengklik tombol "I got it" pada extension
async function clickIGotItButton(driver) {
  try {
    console.log("-> Mencoba mengklik tombol 'I got it' pada extension...");
    
    // Tunggu 2 detik
    await driver.sleep(2000);
    
    // Metode 1: Menggunakan XPath yang diberikan
    try {
      const xpath = '/html/body/div[2]/div/div[2]/div/div[1]/div/div/div/button';
      await driver.wait(until.elementLocated(By.xpath(xpath)), 5000);
      const element = await driver.findElement(By.xpath(xpath));
      
      // Ambil screenshot sebelum klik
      await takeScreenshot(driver, "before-igotit-button-click.png");
      
      // Tunggu 2 detik
      await driver.sleep(2000);
      
      // Klik elemen
      await driver.executeScript("arguments[0].click();", element);
      console.log("-> Tombol 'I got it' berhasil diklik!");
      
      // Tunggu 2 detik dan ambil screenshot setelah klik
      await driver.sleep(2000);
      const screenshotPath = await takeScreenshot(driver, "after-igotit-button-click.png");
      
      // Kirim screenshot ke Telegram
      if (SEND_SCREENSHOT_TO_TELEGRAM && screenshotPath) {
        await sendToTelegram(screenshotPath, "👍 Tombol 'I got it' berhasil diklik pada extension Gradient Network");
      }
      
      return true;
    } catch (error) {
      console.log(`-> Error saat menggunakan XPath I got it button: ${error.message}`);
    }
    
    // Metode 2: Mencoba mencari tombol dengan teks "I got it"
    try {
      // Cari elemen yang mengandung teks "I got it"
      const gotItElements = await driver.executeScript(`
        return Array.from(document.querySelectorAll("button")).filter(el => 
          el.textContent.includes("I got it") || 
          el.textContent.includes("Got it") || 
          el.textContent.includes("got it")
        );
      `);
      
      if (gotItElements && gotItElements.length > 0) {
        // Tunggu 2 detik
        await driver.sleep(2000);
        
        // Klik elemen pertama yang ditemukan
        await driver.executeScript("arguments[0].click();", gotItElements[0]);
        console.log("-> Tombol 'I got it' berhasil diklik menggunakan pencarian teks!");
        
        // Tunggu 2 detik dan ambil screenshot setelah klik
        await driver.sleep(2000);
        const screenshotPath = await takeScreenshot(driver, "after-igotit-button-click.png");
        
        // Kirim screenshot ke Telegram
        if (SEND_SCREENSHOT_TO_TELEGRAM && screenshotPath) {
          await sendToTelegram(screenshotPath, "👍 Tombol 'I got it' berhasil diklik pada extension Gradient Network");
        }
        
        return true;
      }
    } catch (error) {
      console.log(`-> Error saat mencari tombol 'I got it' dengan teks: ${error.message}`);
    }
    
    console.log("-> Tidak dapat menemukan tombol 'I got it'.");
    return false;
  } catch (error) {
    console.error(`-> Error dalam clickIGotItButton: ${error.message}`);
    return false;
  }
}

// Fungsi untuk mengklik tombol spesifik pada extension
async function clickSpecificButton(driver) {
  try {
    console.log("-> Mencoba mengklik tombol spesifik pada extension...");
    
    // Tunggu 2 detik
    await driver.sleep(2000);
    
    // Metode 1: Menggunakan XPath yang diberikan
    try {
      const xpath = '//*[@id="root-gradient-extension-popup-20240807"]/div/div/div/div[3]';
      await driver.wait(until.elementLocated(By.xpath(xpath)), 10000);
      const element = await driver.findElement(By.xpath(xpath));
      
      // Ambil screenshot sebelum klik
      await takeScreenshot(driver, "before-specific-button-click.png");
      
      // Tunggu 2 detik
      await driver.sleep(2000);
      
      // Klik elemen
      await driver.executeScript("arguments[0].click();", element);
      console.log("-> Tombol spesifik berhasil diklik menggunakan XPath!");
      
      // Tunggu 2 detik dan ambil screenshot setelah klik
      await driver.sleep(2000);
      const screenshotPath = await takeScreenshot(driver, "after-specific-button-click.png");
      
      // Kirim screenshot ke Telegram
      if (SEND_SCREENSHOT_TO_TELEGRAM && screenshotPath) {
        await sendToTelegram(screenshotPath, "🔘 Tombol spesifik berhasil diklik pada extension Gradient Network");
      }
      
      return true;
    } catch (error) {
      console.log(`-> Error saat menggunakan XPath: ${error.message}`);
    }
    
    // Metode 2: Mencoba dengan CSS selector
    try {
      const cssSelector = '#root-gradient-extension-popup-20240807 > div > div > div > div:nth-child(3)';
      await driver.wait(until.elementLocated(By.css(cssSelector)), 5000);
      const element = await driver.findElement(By.css(cssSelector));
      
      // Ambil screenshot sebelum klik
      await takeScreenshot(driver, "before-specific-button-click.png");
      
      // Klik elemen
      await driver.executeScript("arguments[0].click();", element);
      console.log("-> Tombol spesifik berhasil diklik menggunakan CSS selector!");
      
      // Tunggu sebentar dan ambil screenshot setelah klik
      await driver.sleep(3000);
      const screenshotPath = await takeScreenshot(driver, "after-specific-button-click.png");
      
      // Kirim screenshot ke Telegram
      if (SEND_SCREENSHOT_TO_TELEGRAM && screenshotPath) {
        await sendToTelegram(screenshotPath, "🔘 Tombol spesifik berhasil diklik pada extension Gradient Network");
      }
      
      return true;
    } catch (error) {
      console.log(`-> Error saat menggunakan CSS selector: ${error.message}`);
    }
    
    // Metode 3: Mencoba menggunakan JavaScript untuk menemukan elemen ketiga
    try {
      const element = await driver.executeScript(`
        const container = document.querySelector('#root-gradient-extension-popup-20240807 > div > div > div');
        if (container && container.children && container.children.length >= 3) {
          return container.children[2]; // Elemen ketiga (0-indexed)
        }
        return null;
      `);
      
      if (element) {
        // Ambil screenshot sebelum klik
        await takeScreenshot(driver, "before-specific-button-click.png");
        
        // Klik elemen
        await driver.executeScript("arguments[0].click();", element);
        console.log("-> Tombol spesifik berhasil diklik menggunakan JavaScript!");
        
        // Tunggu sebentar dan ambil screenshot setelah klik
        await driver.sleep(3000);
        const screenshotPath = await takeScreenshot(driver, "after-specific-button-click.png");
        
        // Kirim screenshot ke Telegram
        if (SEND_SCREENSHOT_TO_TELEGRAM && screenshotPath) {
          await sendToTelegram(screenshotPath, "🔘 Tombol spesifik berhasil diklik pada extension Gradient Network");
        }
        
        return true;
      }
    } catch (error) {
      console.log(`-> Error saat menggunakan JavaScript: ${error.message}`);
    }
    
    // Jika semua metode di atas gagal, ambil screenshot kondisi saat ini dan kirim ke Telegram
    console.log("-> Tidak dapat mengklik tombol spesifik dengan semua metode.");
    const failScreenshotPath = await takeScreenshot(driver, "specific-button-not-found.png");
    
    if (SEND_SCREENSHOT_TO_TELEGRAM && failScreenshotPath) {
      await sendToTelegram(failScreenshotPath, "⚠️ Tidak dapat mengklik tombol spesifik pada extension Gradient Network");
    }
    
    return false;
  } catch (error) {
    console.error(`-> Error dalam clickSpecificButton: ${error.message}`);
    return false;
  }
}

// Fungsi untuk mengambil screenshot extension dan mengirimkannya ke Telegram
async function captureAndSendExtensionScreenshot(driver) {
  try {
    console.log("-> Capturing extension screenshot for Telegram...")
    
    // Pastikan tab extension sedang aktif
    const handles = await driver.getAllWindowHandles();
    for (let i = 0; i < handles.length; i++) {
      await driver.switchTo().window(handles[i]);
      const currentUrl = await driver.getCurrentUrl();
      
      if (currentUrl.includes(`chrome-extension://${extensionId}`)) {
        console.log("-> Extension tab is active");
        break;
      }
      
      // Jika ini adalah handle terakhir dan belum menemukan extension
      if (i === handles.length - 1) {
        console.log("-> Extension tab not found, opening extension in a new tab");
        await driver.switchTo().newWindow('tab');
        await openExtensionPage(driver);
        await driver.sleep(3000);
      }
    }
    
    // Ambil screenshot
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const filename = `gradient-extension-${timestamp}.png`;
    const screenshotPath = await takeScreenshot(driver, filename);
    
    if (screenshotPath) {
      // Kirim screenshot ke Telegram
      const caption = `🤖 Gradient Extension Screenshot - ${new Date().toLocaleString()}`;
      await sendToTelegram(screenshotPath, caption);
    }
    
    return true;
  } catch (error) {
    console.error(`-> Error capturing and sending extension screenshot: ${error.message}`);
    return false;
  }
}

// Fungsi untuk setup browser
async function setupBrowser(customProxy) {
  try {
    // Download ekstensi terlebih dahulu
    await downloadExtension(extensionId);

    // Setup opsi browser
    const options = await getDriverOptions();
    options.addExtensions(path.resolve(__dirname, EXTENSION_FILENAME));
    console.log(`-> Extension added! ${EXTENSION_FILENAME}`);

    // Enable debug jika diperlukan
    if (ALLOW_DEBUG) {
      options.addArguments("--enable-logging");
      options.addArguments("--v=1");
    }

    // Buat driver
    console.log("-> Starting browser...");
    const driver = await new Builder()
      .forBrowser("chrome")
      .setChromeOptions(options)
      .build();
    console.log("-> Browser started!");

    // Coba mendapatkan chat_id Telegram di awal
    if (SEND_SCREENSHOT_TO_TELEGRAM && !TELEGRAM_CHAT_ID) {
      TELEGRAM_CHAT_ID = await getChatId();
      if (TELEGRAM_CHAT_ID) {
        console.log(`-> Telegram chat_id ditemukan: ${TELEGRAM_CHAT_ID}`);
      } else {
        console.log("-> Telegram chat_id tidak ditemukan, silakan kirim pesan ke bot terlebih dahulu");
      }
    }

    // Periksa informasi proxy jika ada
    let proxyIpInfo = "";
    if (customProxy || PROXY) {
      try {
        proxyIpInfo = await getProxyIpInfo(driver, customProxy || PROXY);
        if (proxyIpInfo) {
          console.log("-> Successfully connected using proxy!");
        } else {
          console.log("-> Warning: Could not verify proxy, but will continue anyway...");
        }
      } catch (error) {
        console.log("-> Warning: Failed to verify proxy, will try to continue anyway...");
        const proxyToCheck = customProxy || PROXY;
        console.log(`-> You can check your proxy manually: curl -vv -x ${proxyToCheck} https://api.ipify.org`);
      }
    }

    // Login ke platform
    console.log("-> Started! Logging in https://app.gradient.network/...");
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
        
        console.log("-> Login form submitted successfully");
      } catch (loginError) {
        console.log("-> Could not find login form, checking if already logged in...");
      }

      // Akses dashboard setting
      console.log("-> Trying to access dashboard/setting directly...");
      await driver.get("https://app.gradient.network/dashboard/setting");
      
      // Tunggu halaman dashboard dimuat
      await driver.wait(until.elementLocated(By.css('body')), 30000);
      
      console.log("-> Logged in successfully!");
      await takeScreenshot(driver, "logined.png");
    } catch (navigationError) {
      console.error("-> Error navigating to Gradient Network:", navigationError.message);
      console.log("-> This could be due to network issues or the site blocking direct access.");
      console.log("-> Try using a proxy by creating a proxies.txt file.");

    if (ALLOW_DEBUG) {
        await generateErrorReport(driver);
      }
      
      throw new Error("Failed to navigate to Gradient Network.");
    }

    return { driver, proxyIpInfo };
  } catch (error) {
    console.error("-> Error in setupBrowser:", error.message);
    throw error;
  }
}

async function main(proxy) {
  let driver = null;
  
  try {
    const { driver: newDriver } = await setupBrowser(proxy);
    driver = newDriver;
    
    // Tunggu 2 detik
    await driver.sleep(2000);
    
    // Login ke app.gradient.network terlebih dahulu
    console.log("-> Navigating to app.gradient.network...");
    await driver.get("https://app.gradient.network/");
    await driver.wait(until.elementLocated(By.css('body')), 30000);
    
    // Tunggu 2 detik
    await driver.sleep(2000);
    
    // Cek apakah halaman login muncul dan login menggunakan XPath yang diberikan
    try {
      console.log("-> Mencoba login menggunakan XPath yang diberikan...");
      
      // XPath untuk input email, password, dan tombol login
      const emailInputXPath = '/html/body/div/div[2]/div/div/div/div[2]/div[1]/input';
      const passwordInputXPath = '/html/body/div/div[2]/div/div/div/div[2]/div[2]/span/input';
      const loginButtonXPath = '/html/body/div/div[2]/div/div/div/div[4]/button[1]';
      
      // Tunggu elemen-elemen muncul
      await driver.wait(until.elementLocated(By.xpath(emailInputXPath)), 30000);
      await driver.wait(until.elementLocated(By.xpath(passwordInputXPath)), 30000);
      await driver.wait(until.elementLocated(By.xpath(loginButtonXPath)), 30000);
      
      // Ambil screenshot sebelum login
      await takeScreenshot(driver, "before-login-app.png");
      
      // Tunggu 2 detik
      await driver.sleep(2000);
      
      // Input email
      await driver.findElement(By.xpath(emailInputXPath)).clear();
      await driver.findElement(By.xpath(emailInputXPath)).sendKeys(USER);
      console.log("-> Email berhasil dimasukkan");
      
      // Tunggu 2 detik
      await driver.sleep(2000);
      
      // Input password
      await driver.findElement(By.xpath(passwordInputXPath)).clear();
      await driver.findElement(By.xpath(passwordInputXPath)).sendKeys(PASSWORD);
      console.log("-> Password berhasil dimasukkan");
      
      // Tunggu 2 detik
      await driver.sleep(2000);
      
      // Klik tombol login
      await driver.findElement(By.xpath(loginButtonXPath)).click();
      console.log("-> Tombol login berhasil diklik");
      
      // Tunggu 2 detik
      await driver.sleep(2000);
      
      // Tunggu redirect ke dashboard sebagai indikator login berhasil
      console.log("-> Menunggu redirect ke halaman dashboard...");
      try {
        // Tunggu hingga URL berubah ke dashboard
        await driver.wait(async () => {
          const currentUrl = await driver.getCurrentUrl();
          return currentUrl.includes("/dashboard");
        }, 30000);
        
        console.log("-> Login berhasil! Terdeteksi redirect ke halaman dashboard");
        
        // Ambil screenshot setelah login
        const afterLoginScreenshotPath = await takeScreenshot(driver, "after-login-app.png");
        if (SEND_SCREENSHOT_TO_TELEGRAM && afterLoginScreenshotPath) {
          await sendToTelegram(afterLoginScreenshotPath, "✅ Login berhasil! Terdeteksi redirect ke halaman dashboard");
        }
      } catch (redirectError) {
        console.log("-> Tidak terdeteksi redirect ke dashboard:", redirectError.message);
        console.log("-> Akan mencoba memeriksa login dengan cara lain...");
      }
      
    } catch (loginError) {
      console.log("-> Error saat login menggunakan XPath:", loginError.message);
      console.log("-> Mencoba metode login alternatif...");
      
      // Metode login alternatif menggunakan CSS selector
      try {
        const emailInput = By.css('[placeholder="Enter Email"]');
        const passwordInput = By.css('[type="password"]');
        const loginButton = By.css("button");

        await driver.wait(until.elementLocated(emailInput), 30000);
        await driver.wait(until.elementLocated(passwordInput), 30000);
        await driver.wait(until.elementLocated(loginButton), 30000);

        // Tunggu 2 detik
        await driver.sleep(2000);

        await driver.findElement(emailInput).sendKeys(USER);
        
        // Tunggu 2 detik
        await driver.sleep(2000);
        
        await driver.findElement(passwordInput).sendKeys(PASSWORD);
        
        // Tunggu 2 detik
        await driver.sleep(2000);
        
        await driver.findElement(loginButton).click();
        
        console.log("-> Login form submitted successfully using alternative method");
        
        // Tunggu 2 detik
        await driver.sleep(2000);
        
        // Tunggu redirect ke dashboard sebagai indikator login berhasil
        console.log("-> Menunggu redirect ke halaman dashboard (metode alternatif)...");
        try {
          // Tunggu hingga URL berubah ke dashboard
          await driver.wait(async () => {
            const currentUrl = await driver.getCurrentUrl();
            return currentUrl.includes("/dashboard");
          }, 30000);
          
          console.log("-> Login berhasil! Terdeteksi redirect ke halaman dashboard");
          
          // Ambil screenshot setelah login
          const afterLoginScreenshotPath = await takeScreenshot(driver, "after-login-app-alt.png");
          if (SEND_SCREENSHOT_TO_TELEGRAM && afterLoginScreenshotPath) {
            await sendToTelegram(afterLoginScreenshotPath, "✅ Login berhasil! Terdeteksi redirect ke halaman dashboard (metode alternatif)");
          }
        } catch (redirectError) {
          console.log("-> Tidak terdeteksi redirect ke dashboard:", redirectError.message);
          console.log("-> Akan mencoba memeriksa login dengan cara lain...");
        }
      } catch (altLoginError) {
        console.log("-> Could not find login form, checking if already logged in...");
      }
    }
    
    // Cek apakah sudah login dengan mencoba mengakses dashboard langsung
    console.log("-> Memeriksa status login dengan mengakses dashboard langsung...");
    await driver.get("https://app.gradient.network/dashboard");
    
    // Tunggu 2 detik
    await driver.sleep(2000);
    
    // Cek apakah berhasil mengakses dashboard
    try {
      // Cek URL saat ini
      const currentUrl = await driver.getCurrentUrl();
      
      if (currentUrl.includes("/dashboard")) {
        console.log("-> Berhasil mengakses dashboard! Login berhasil");
        
        // Ambil screenshot dashboard
        const dashboardScreenshotPath = await takeScreenshot(driver, "dashboard-confirmed.png");
        if (SEND_SCREENSHOT_TO_TELEGRAM && dashboardScreenshotPath) {
          await sendToTelegram(dashboardScreenshotPath, "✅ Konfirmasi login berhasil: Berhasil mengakses halaman dashboard");
        }
      } else if (currentUrl.includes("/login") || currentUrl.includes("/signin")) {
        console.log("-> Gagal login! Masih di halaman login");
        
        // Ambil screenshot halaman login
        const loginFailScreenshotPath = await takeScreenshot(driver, "login-failed.png");
        if (SEND_SCREENSHOT_TO_TELEGRAM && loginFailScreenshotPath) {
          await sendToTelegram(loginFailScreenshotPath, "❌ Login gagal: Masih di halaman login");
        }
        
        // Coba login lagi atau lakukan tindakan lain
        console.log("-> Mencoba login ulang...");
        // Kode untuk login ulang bisa ditambahkan di sini
      } else {
        console.log("-> Status login tidak jelas. URL saat ini:", currentUrl);
      }
    } catch (checkError) {
      console.error("-> Error saat memeriksa status login:", checkError.message);
    }
    
    // Tunggu 2 detik
    await driver.sleep(2000);
    
    // Buka extension di tab baru
    console.log("-> Membuka extension di tab baru...");
    await driver.switchTo().newWindow('tab');
    const extensionUrl = `chrome-extension://${extensionId}/popup.html`;
    await driver.get(extensionUrl);
    
    // Tunggu 2 detik
    await driver.sleep(2000);
    
    // Ambil screenshot extension sebelum login
    const beforeExtLoginScreenshotPath = await takeScreenshot(driver, "extension-before-login.png");
    if (SEND_SCREENSHOT_TO_TELEGRAM && beforeExtLoginScreenshotPath) {
      await sendToTelegram(beforeExtLoginScreenshotPath, "🔍 Extension Gradient Network sebelum login");
    }
    
    // Tunggu 2 detik
    await driver.sleep(2000);
    
    // Coba klik tombol "I got it" jika ada
    await clickIGotItButton(driver);
    
    // Tunggu 2 detik
    await driver.sleep(2000);
    
    // Coba klik tombol "close" jika ada
    await clickCloseButton(driver);
    
    // Tunggu 2 detik
    await driver.sleep(2000);
    
    // Coba klik tombol login pada extension
    console.log("-> Mencoba klik tombol login di extension...");
    const loginSuccess = await clickLoginButton(driver);
    
    if (loginSuccess) {
      console.log("-> Berhasil mengklik tombol login di extension!");
      
      // Tunggu 2 detik
      await driver.sleep(2000);
      
      // Ambil screenshot setelah klik tombol login
      const afterExtLoginScreenshotPath = await takeScreenshot(driver, "extension-after-login-click.png");
      if (SEND_SCREENSHOT_TO_TELEGRAM && afterExtLoginScreenshotPath) {
        await sendToTelegram(afterExtLoginScreenshotPath, "🔐 Tombol login berhasil diklik pada extension Gradient Network");
      }
    } else {
      console.log("-> Gagal mengklik tombol login di extension, akan tetap melanjutkan proses...");
    }
    
    // Tunggu 2 detik
    await driver.sleep(2000);
    
    // Klik tombol spesifik pada extension
    console.log("-> Mencoba klik tombol spesifik pada extension...");
    const buttonClickSuccess = await clickSpecificButton(driver);
    
    if (buttonClickSuccess) {
      console.log("-> Berhasil mengklik tombol spesifik!");
    } else {
      console.log("-> Gagal mengklik tombol spesifik, akan tetap melanjutkan proses...");
    }
    
    // Tunggu 2 detik
    await driver.sleep(2000);
    
    // Buka kembali halaman extension dan refresh
    console.log("-> Membuka kembali halaman extension dan refresh...");
    await driver.get(extensionUrl);
    
    // Tunggu 2 detik
    await driver.sleep(2000);
    
    await driver.navigate().refresh();
    
    // Tunggu 2 detik
    await driver.sleep(2000);
    
    // Coba klik tombol "I got it" jika ada setelah refresh
    await clickIGotItButton(driver);
    
    // Tunggu 2 detik
    await driver.sleep(2000);
    
    // Coba klik tombol "close" jika ada setelah refresh
    await clickCloseButton(driver);
    
    // Tunggu 2 detik
    await driver.sleep(2000);
    
    // Ambil screenshot setelah refresh dan kirim ke Telegram
    const afterRefreshScreenshotPath = await takeScreenshot(driver, "extension-after-refresh.png");
    if (SEND_SCREENSHOT_TO_TELEGRAM && afterRefreshScreenshotPath) {
      await sendToTelegram(afterRefreshScreenshotPath, "🔄 Extension Gradient Network setelah refresh");
    }
    
    // Tunggu 2 detik
    await driver.sleep(2000);
    
    // Simpan handle untuk kedua tab
    const handles = await driver.getAllWindowHandles();
    const dashboardHandle = handles[0];
    const extensionHandle = handles[1];

    console.log("-> Bot is now running indefinitely with dashboard and extension tabs open.");
    console.log(`-> Screenshots akan dikirim setiap ${SCREENSHOT_INTERVAL_MINUTES} menit ke Telegram`);
    
    let lastRefreshTime = Date.now();
    let lastScreenshotTime = Date.now();
    
    while (true) {
      await driver.sleep(60000); // Sleep 1 menit

      const currentTime = Date.now();
      
      // Refresh halaman setiap 3 jam
      if (currentTime - lastRefreshTime > 3 * 60 * 60 * 1000) {
        try {
          console.log("-> Refreshing pages to keep sessions alive...");
          
          // Refresh dashboard
          await driver.switchTo().window(dashboardHandle);
          await driver.navigate().refresh();
          
          // Tunggu 2 detik
          await driver.sleep(2000);
          
          // Refresh extension, klik tombol spesifik, dan refresh lagi
          await driver.switchTo().window(extensionHandle);
          await driver.navigate().refresh();
          
          // Tunggu 2 detik
          await driver.sleep(2000);
          
          // Coba klik tombol "I got it" jika ada setelah refresh
          await clickIGotItButton(driver);
          
          // Tunggu 2 detik
          await driver.sleep(2000);
          
          // Coba klik tombol "close" jika ada setelah refresh
          await clickCloseButton(driver);
          
          // Tunggu 2 detik
          await driver.sleep(2000);
          
          // Coba klik tombol spesifik lagi
          await clickSpecificButton(driver);
          
          // Tunggu 2 detik
          await driver.sleep(2000);
          
          // Refresh extension lagi
          await driver.navigate().refresh();
          
          // Tunggu 2 detik
          await driver.sleep(2000);
          
          // Coba klik tombol "I got it" jika ada setelah refresh kedua
          await clickIGotItButton(driver);
          
          // Tunggu 2 detik
          await driver.sleep(2000);
          
          // Coba klik tombol "close" jika ada setelah refresh kedua
          await clickCloseButton(driver);
          
          // Tunggu 2 detik
          await driver.sleep(2000);
          
          // Ambil screenshot dan kirim ke Telegram
          const refreshScreenshotPath = await takeScreenshot(driver, "extension-periodic-refresh.png");
          if (SEND_SCREENSHOT_TO_TELEGRAM && refreshScreenshotPath) {
            await sendToTelegram(refreshScreenshotPath, "🔄 Extension Gradient Network setelah refresh periodik");
          }

          console.log("-> Pages refreshed successfully.");
          lastRefreshTime = currentTime;
        } catch (refreshError) {
          console.error("-> Failed to refresh pages:", refreshError.message);
        }
      }
      
      // Ambil dan kirim screenshot sesuai interval
      if (SEND_SCREENSHOT_TO_TELEGRAM && currentTime - lastScreenshotTime > SCREENSHOT_INTERVAL_MINUTES * 60 * 1000) {
        try {
          console.log("-> Taking scheduled screenshot of extension...");
          
          // Pastikan tab extension aktif
          await driver.switchTo().window(extensionHandle);
          
          // Tunggu 2 detik
          await driver.sleep(2000);
          
          // Ambil screenshot dan kirim ke Telegram
          const screenshotPath = await takeScreenshot(driver, `extension-${new Date().toISOString().replace(/:/g, '-')}.png`);
          if (screenshotPath) {
            await sendToTelegram(screenshotPath, `🤖 Gradient Extension Screenshot - ${new Date().toLocaleString()}`);
          }
          
          lastScreenshotTime = currentTime;
        } catch (screenshotError) {
          console.error("-> Failed to take scheduled screenshot:", screenshotError.message);
        }
      }
    }
  } catch (error) {
    console.error(`-> Error in main function: ${error.message}`);
    if (ALLOW_DEBUG && driver) {
      await generateErrorReport(driver);
    }
    
    console.log("-> Attempting to keep the browser running despite the error...");
    try {
      if (driver) {
        while (true) {
          await driver.sleep(300000);
        }
      }
    } catch (keepAliveError) {
      console.error("-> Failed to keep browser alive after error:", keepAliveError.message);
    }
  }
}

(async () => {
  try {
    await main(PROXY);
  } catch (error) {
    console.error("Error in main execution:", error);
    console.error(error.stack);
    process.exit(1);
  }
})();


