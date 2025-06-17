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

console.log("-> Starting...")
console.log("-> User:", USER)
console.log("-> Pass:", PASSWORD)
console.log("-> Proxy:", PROXY)
console.log("-> Debug:", ALLOW_DEBUG)

if (!USER || !PASSWORD) {
  console.error("Please set APP_USER and APP_PASS env variables")
  process.exit()
}

if (ALLOW_DEBUG) {
  console.log(
    "-> Debugging is enabled! This will generate a screenshot and console logs on error!"
  )
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
  // if ALLOW_DEBUG is set, taking screenshot
  if (!ALLOW_DEBUG) {
    return
  }

  const data = await driver.takeScreenshot()
  fs.writeFileSync(filename, Buffer.from(data, "base64"))
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
    return true;
  } catch (error) {
    console.error(`-> Error opening extension page: ${error.message}`);
    return false;
  }
}

// Fungsi untuk mengklik tombol login di ekstensi
async function clickLoginButton(driver) {
  try {
    console.log("-> Trying to click login button in extension...");
    
    // Coba dengan selector kompleks yang diberikan
    const loginButtonSelector = "#root-gradient-extension-popup-20240807 > div > div > div > div.mt-\\[50px\\].h-\\[48px\\].w-full.rounded-\\[125px\\].bg-\\[\\#FFFFFF\\].px-\\[32px\\].py-\\[7\\.5px\\].flex.justify-center.items-center.select-none.text-\\[16px\\].cursor-pointer";
    
    try {
      // Tunggu tombol login muncul
      await driver.wait(until.elementLocated(By.css(loginButtonSelector)), 15000);
      
      // Klik tombol login
      await driver.findElement(By.css(loginButtonSelector)).click();
      console.log("-> Login button clicked successfully!");
      
      return true;
    } catch (error) {
      console.log("-> Could not find specific login button, trying alternative selectors...");
      
      // Coba dengan selector yang lebih sederhana
      const alternativeSelectors = [
        "button:contains('Login')",
        "div.cursor-pointer:contains('Login')",
        "div.bg-\\[\\#FFFFFF\\].cursor-pointer",
        "div.rounded-\\[125px\\].cursor-pointer"
      ];
      
      for (const selector of alternativeSelectors) {
        try {
          // Gunakan JavaScript executor untuk mencari elemen berdasarkan teks
          const element = await driver.executeScript(`
            return document.querySelector("${selector.replace(/"/g, '\\"')}") || 
                   Array.from(document.querySelectorAll("div")).find(el => 
                     el.textContent.includes("Login") && 
                     (el.className.includes("cursor-pointer") || el.style.cursor === "pointer")
                   );
          `);
          
          if (element) {
            await driver.executeScript("arguments[0].click();", element);
            console.log(`-> Login button clicked using alternative selector: ${selector}`);
            return true;
          }
        } catch (innerError) {
          console.log(`-> Failed with selector ${selector}`);
        }
      }
      
      console.log("-> Could not click login button using any method");
      return false;
    }
  } catch (error) {
    console.error(`-> Error in clickLoginButton: ${error.message}`);
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

// Fungsi untuk memeriksa status di ekstensi
async function checkExtensionStatus(driver) {
  try {
    console.log("-> Checking extension status...");
    
    // Pastikan kita berada di tab ekstensi
    await openExtensionPage(driver);
    
    // Tunggu sejenak untuk memastikan konten ekstensi dimuat
    await driver.sleep(3000);
    
    // Cari status (span yang berisi "Unsupported", "Disconnected", atau "Good")
    const statusElements = await driver.findElements(By.css("span"));
    let statusFound = false;
    
    for (const element of statusElements) {
      try {
        const text = await element.getText();
        if (["Unsupported", "Disconnected", "Good"].includes(text)) {
          const statusText = text;
          const statusClass = await element.getAttribute("class");
          console.log(`-> Status ditemukan: ${statusText} (Class: ${statusClass})`);
          
          // Tambahkan emoji untuk memudahkan melihat status
          let emoji = "❓";
          if (statusText === "Good") emoji = "✅";
          if (statusText === "Disconnected") emoji = "❌";
          if (statusText === "Unsupported") emoji = "⚠️";
          
          console.log(`-> Status Ekstensi ${emoji}: ${statusText}`);
          statusFound = true;
          
          // Tambahkan tindakan berdasarkan status jika diperlukan
          if (statusText === "Disconnected") {
            console.log("-> Mencoba mengklik tombol login karena status Disconnected...");
            await clickLoginButton(driver);
          }
          
          break;
        }
      } catch (elementError) {
        // Lewati elemen yang tidak dapat diakses
        continue;
      }
    }
    
    if (!statusFound) {
      console.log("-> Status tidak ditemukan di ekstensi 🔍");
      
      // Coba ambil screenshot jika tidak menemukan status
      if (ALLOW_DEBUG) {
        await takeScreenshot(driver, "extension_status_not_found.png");
      }
    }
    
    return statusFound;
  } catch (error) {
    console.error(`-> Error saat memeriksa status ekstensi: ${error.message} ⚠️`);
    return false;
  }
}

async function main(proxy) {
  let driver = null;
  
  try {
    const { driver: newDriver } = await setupBrowser(proxy);
    driver = newDriver;
    
    await driver.sleep(3000);
    
    await openExtensionPage(driver);
    
    await driver.sleep(5000);
    
    await clickLoginButton(driver);
    
    await driver.sleep(5000);

    console.log("-> Membuka dashboard... 🖥️");
    await driver.get("https://app.gradient.network/dashboard");
    await driver.wait(until.elementLocated(By.css('body')), 30000);
    console.log("-> Dashboard terbuka dengan sukses! ✅");

    console.log("-> Membuka ekstensi di tab baru... 🧩");
    await driver.switchTo().newWindow('tab');
    await openExtensionPage(driver);
    console.log("-> Ekstensi terbuka di tab baru! ✅");

    const handles = await driver.getAllWindowHandles();
    const dashboardHandle = handles[0];
    const extensionHandle = handles[1];

    console.log("-> Bot berjalan dengan tab dashboard dan ekstensi terbuka 🤖");
    
    let lastRefreshTime = Date.now();
    let lastCheckStatusTime = Date.now();
    
    while (true) {
      await driver.sleep(10000); // Cek setiap 10 detik

      const currentTime = Date.now();
      
      // Periksa status ekstensi setiap 2 menit
      if (currentTime - lastCheckStatusTime > 2 * 60 * 1000) {
        try {
          console.log("-> Saatnya memeriksa status ekstensi (interval 2 menit) 🕒");
          
          await driver.switchTo().window(extensionHandle);
          await openExtensionPage(driver); // Buka ulang ekstensi
          await checkExtensionStatus(driver);
          
          lastCheckStatusTime = currentTime;
        } catch (statusError) {
          console.error(`-> Gagal memeriksa status ekstensi: ${statusError.message} ❌`);
        }
      }
      
      // Refresh halaman setiap 3 jam untuk menjaga sesi tetap aktif
      if (currentTime - lastRefreshTime > 3 * 60 * 60 * 1000) {
        try {
          console.log("-> Menyegarkan halaman untuk menjaga sesi tetap aktif... 🔄");
          
          await driver.switchTo().window(dashboardHandle);
          await driver.navigate().refresh();
          
          await driver.switchTo().window(extensionHandle);
          await driver.navigate().refresh();

          console.log("-> Halaman berhasil disegarkan! ✅");
          lastRefreshTime = currentTime;
        } catch (refreshError) {
          console.error(`-> Gagal menyegarkan halaman: ${refreshError.message} ❌`);
        }
      }
    }
  } catch (error) {
    console.error(`-> Error dalam fungsi main: ${error.message} ❌`);
    if (ALLOW_DEBUG && driver) {
      await generateErrorReport(driver);
    }
    
    console.log("-> Mencoba mempertahankan browser tetap berjalan meskipun terjadi error... 🛠️");
    try {
      if (driver) {
        while (true) {
          await driver.sleep(300000);
        }
      }
    } catch (keepAliveError) {
      console.error(`-> Gagal menjaga browser tetap hidup setelah error: ${keepAliveError.message} ❌`);
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


