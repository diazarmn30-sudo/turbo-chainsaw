// Load .env if present (recommended for tokens)
require('dotenv').config();

const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');
const axios = require('axios');
const fs = require('fs');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestWaWebVersion } = require('@whiskeysockets/baileys');

// ==========================
// KONFIGURASI DASAR 
// GANTI DENGAN DATA ANDA
const ADMIN_ID = process.env.ADMIN_ID ? Number(process.env.ADMIN_ID) : 8248734943; // Telegram ID
const OWNER = process.env.OWNER_ID || "8248734943"; // Telegram ID
const BOT_TOKEN = process.env.BOT_TOKEN || 'CHANGE_ME'; // Telegram bot token

// Inisialisasi bot
if (!BOT_TOKEN || BOT_TOKEN === 'CHANGE_ME') {
  console.error('❌ BOT_TOKEN belum di-set. Buat file .env lalu isi BOT_TOKEN=...');
  process.exit(1);
}
const bot = new Telegraf(BOT_TOKEN);

// State WhatsApp
let waClient = null;
let waConnectionStatus = false;
const userCooldowns = {};

// Data premium users
const premiumFile = './premium.json';
let premiumUsers = fs.existsSync(premiumFile) 
  ? JSON.parse(fs.readFileSync(premiumFile, 'utf-8'))
  : [];


// ==========================
// HELPER FUNCTIONS
// ==========================

function savePremium() {
  fs.writeFileSync(premiumFile, JSON.stringify(premiumUsers, null, 2));
}

function isPremium(id) {
  return premiumUsers.includes(id.toString());
}

function isAdmin(id) {
  return id.toString() === ADMIN_ID.toString();
}

function isOwner(id) {
  return id.toString() === OWNER.toString();
}

function formatResult(data) {
  let out = '';
  if (data.success !== undefined)
    out += `${data.success ? '✅ Berhasil' : '❌ Gagal'}`;
  if (data.email) out += `\n• Email: ${data.email}`;
  if (data.subject) out += `\n• Subjek: ${data.subject}`;
  if (data.response) out += `\n• Respon: ${data.response}`;
  return out;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ==========================
// GITHUB FUNCTIONS
// ==========================

  try {
    const { data } = await // octokit.repos.getContent({
    return { content, sha: data.sha };
  } catch (error) {
    if (error.status === 404) {
      return { content: '', sha: null };
    }
    throw error;
  }
}

  return await // octokit.repos.createOrUpdateFileContents({
  });
}

    
    if (!content.trim()) {
      return { success: false, message: "Tidak ada data email." };
    }

    const lines = content.split('\n').filter(line => line.trim() !== '');
    const originalLength = lines.length;
    const newLines = lines.filter(line => !line.includes(target.split(':')[0]));

    if (originalLength === newLines.length) {
      return { success: false, message: "Email tidak ditemukan." };
    }

    const newContent = newLines.join('\n');
    await dbAppend(newContent, sha);

    return { success: true, message: "Email berhasil dihapus." };
  } catch (error) {
    console.error('Error deleting email:', error);
    return { success: false, message: error.message };
  }
}

// ==========================
// ==========================
// LOCAL DB (folder db/)
// ==========================
const path = require("path");

const DB_DIR = path.join(__dirname, "db");
const EMAIL_DB = path.join(DB_DIR, "dataimel.txt");

function ensureDb(){ if(!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR,{recursive:true}); if(!fs.existsSync(EMAIL_DB)) fs.writeFileSync(EMAIL_DB, "", "utf8"); }
function dbListLines(){ ensureDb(); return fs.readFileSync(EMAIL_DB, "utf8").split(/\r?\n/).map(s=>s.trim()).filter(Boolean); }
function dbAppend(line){ ensureDb(); fs.appendFileSync(EMAIL_DB, line.trim()+"\n", "utf8"); }
function dbWrite(lines){ ensureDb(); const out = lines.length ? lines.join("\n")+"\n" : ""; fs.writeFileSync(EMAIL_DB, out, "utf8"); }
async function deleteEmailFromLocal(target){ try{ const key = target.split(":")[0].toLowerCase().trim(); const lines = dbListLines(); if(!lines.length) return {success:false,message:"Tidak ada data email."}; const newLines = lines.filter(l => l.split(":")[0].toLowerCase().trim() !== key); if(newLines.length===lines.length) return {success:false,message:"Email tidak ditemukan."}; dbWrite(newLines); return {success:true,message:"Email berhasil dihapus."}; }catch(e){ return {success:false,message:String(e?.message||e)}; } }

// WHATSAPP FUNCTIONS
// ==========================

async function startWhatsAppClient() {
  console.log("🚀 Memulai koneksi WhatsApp...");

  try {
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const { version } = await fetchLatestWaWebVersion();

    waClient = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: true,
      version,
      browser: ["Ubuntu", "Chrome", "20.0.00"]
    });

    waClient.ev.on("creds.update", saveCreds);

    waClient.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "close") {
        waConnectionStatus = false;
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        
        console.log("❌ WA Disconnected. Reason:", reason);

        if (reason !== DisconnectReason.loggedOut) {
          console.log("🔄 Reconnecting in 5 seconds...");
          setTimeout(startWhatsAppClient, 5000);
        } else {
          console.log("🛑 Logged out. Delete session folder to re-pair.");
          waClient = null;
        }
      }

      if (connection === "open") {
        waConnectionStatus = true;
        console.log("✅ WhatsApp connected!");
      }
    });

  } catch (error) {
    console.error("Failed to start WhatsApp client:", error);
  }
}

// ==========================
// CEK BIO FUNCTION
// ==========================

async function handleBioCheck(ctx, numbersToCheck) {
  if (!waConnectionStatus) {
    return ctx.reply("⚠️ WhatsApp belum terkoneksi. Silakan pairing terlebih dahulu.");
  }

  if (!numbersToCheck || numbersToCheck.length === 0) {
    return ctx.reply("❌ Tidak ada nomor yang diberikan.");
  }

  // Normalize + dedupe + cap (target 800 per upload)
  const cleaned = Array.from(
    new Set(
      (numbersToCheck || [])
        .map(x => String(x).replace(/[^0-9]/g, '').trim())
        .filter(x => x.length >= 8)
    )
  );
  const MAX_PER_UPLOAD = 800;
  const finalNumbers = cleaned.slice(0, MAX_PER_UPLOAD);

  await ctx.reply(`🔍 Sedang memeriksa ${finalNumbers.length} nomor...`);

  // Output yang diminta: hanya nomor yang ADA bio + tahun bio
  const withBio = [];

  // Settings
  const CONCURRENCY = 5; // "gas 5"
  const EXISTS_BATCH = 50; // batch untuk onWhatsApp biar tidak terlalu berat

  // helper: chunk
  const chunk = (arr, size) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  // helper: retry ringan kalau kena rate-limit/disconnect sementara
  async function fetchStatusWithRetry(jid, maxTry = 2) {
    let lastErr;
    for (let i = 0; i <= maxTry; i++) {
      try {
        return await waClient.fetchStatus(jid);
      } catch (e) {
        lastErr = e;
        const msg = String(e?.message || e);
        const isRateish = /rate|too many|429|throttle|limit/i.test(msg);
        if (!isRateish || i === maxTry) break;
        // backoff kecil hanya kalau memang kena limit
        await sleep(400 * (i + 1));
      }
    }
    throw lastErr;
  }

  try {
    // 1) Check registered numbers in batches
    const jidsAll = finalNumbers.map(n => `${n}@s.whatsapp.net`);
    const existenceResults = [];
    for (const part of chunk(jidsAll, EXISTS_BATCH)) {
      const res = await waClient.onWhatsApp(...part);
      existenceResults.push(...res);
    }

    // 2) Build queue for status fetch
    const queue = existenceResults
      .filter(r => r?.exists)
      .map(r => ({ jid: r.jid, number: String(r.jid).split('@')[0] }));

    let processed = 0;
    let errorCount = 0;
    const totalRegistered = queue.length;

    // Realtime progress (edit 1 message, bukan spam banyak chat)
    const startedAt = Date.now();
    let progressMsgId = null;
    let lastEditAt = 0;

    async function ensureProgressMessage() {
      if (progressMsgId) return;
      try {
        const sent = await ctx.reply(
          `🚀 Mulai cekbio
` +
          `Input: ${finalNumbers.length} nomor
` +
          `Terdaftar WA: ${totalRegistered} nomor
` +
          `Concurrency: ${CONCURRENCY}

` +
          `Progress: 0/${totalRegistered} (0%)
` +
          `Error: 0`
        );
        progressMsgId = sent?.message_id || null;
      } catch (_) {
        // ignore
      }
    }

    async function updateProgress(force = false) {
      if (!totalRegistered) return;
      const now = Date.now();
      const percent = Math.floor((processed / totalRegistered) * 100);
      const elapsedSec = Math.max(1, Math.floor((now - startedAt) / 1000));
      const speed = (processed / elapsedSec).toFixed(2);

      const text =
        `🚀 Cekbio berjalan
` +
        `Input: ${finalNumbers.length} nomor
` +
        `Terdaftar WA: ${totalRegistered} nomor
` +
        `Concurrency: ${CONCURRENCY}

` +
        `Progress: ${processed}/${totalRegistered} (${percent}%)
` +
        `Kecepatan: ${speed} nomor/detik
` +
        `Error: ${errorCount}`;

      // throttle edit biar ga kena flood (min 2.5 detik)
      if (!force && (now - lastEditAt) < 2500) return;

      await ensureProgressMessage();
      lastEditAt = now;

      if (progressMsgId) {
        try {
          await ctx.telegram.editMessageText(ctx.chat.id, progressMsgId, undefined, text);
          return;
        } catch (_) {
          // fallback: kirim pesan biasa kalau edit gagal
        }
      }
      try { await ctx.reply(text); } catch (_) {}
    }

    // kirim progress awal
    await updateProgress(true);

    async function worker() {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) return;
        try {
          const status = await fetchStatusWithRetry(item.jid, 2);
          const raw = status?.status;
          const bioText = typeof raw === 'string' ? raw : (raw?.text || raw?.status || '');
          if (bioText && String(bioText).trim()) {
            const year = status?.setAt ? new Date(status.setAt).getFullYear() : 'UNKNOWN';
            withBio.push({ number: item.number, year, bio: String(bioText).trim() });
          }
        } catch (e) {
          errorCount++;
          // kirim 1 pesan error yang jelas (tidak spam): hanya saat error pertama atau tiap kelipatan 25
          if (errorCount === 1 || errorCount % 25 === 0) {
            const msg = String(e?.message || e);
            try {
              await ctx.reply(`⚠️ Error saat cek salah satu nomor (contoh):
${msg}`);
            } catch (_) {}
          }
        } finally {
          processed++;
          // update progress realtime (edit message)
          await updateProgress(false);
        }
      }
    }

    // 3) Run workers

    // 3) Run workers (concurrency 5)
    const workers = Array.from({ length: CONCURRENCY }, () => worker());
    await Promise.all(workers);

    // finalize progress (real-time)
    try {
      const durSec = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
      const doneText =
        `✅ Selesai cekbio
` +
        `Input: ${finalNumbers.length} nomor
` +
        `Terdaftar WA: ${totalRegistered} nomor
` +
        `Diproses: ${processed}/${totalRegistered} (100%)
` +
        `Ada bio: ${withBio.length}
` +
        `Error: ${errorCount}
` +
        `Durasi: ${durSec}s`;

      if (progressMsgId) {
        await ctx.telegram.editMessageText(ctx.chat.id, progressMsgId, undefined, doneText);
      } else {
        await ctx.reply(doneText);
      }
    } catch (_) {}

    // 4) Generate output: ONLY with bio + year
    // Sort by number for consistent output
    withBio.sort((a, b) => a.number.localeCompare(b.number));

    let report = `HASIL CEK BIO (HANYA YANG ADA BIO)\n`;
    report += `Total input: ${finalNumbers.length}\n`;
    report += `Total ada bio: ${withBio.length}\n\n`;
    report += `FORMAT: nomor|tahun|bio\n\n`;
    for (const item of withBio) {
      report += `${item.number}|${item.year}|${item.bio}\n`;
    }

    // Always send as file if big / otherwise as text
    if (report.length < 3500) {
      await ctx.reply('```\n' + report + '\n```', { parse_mode: 'Markdown' });
    } else {
      const filename = `hasil_bio_${Date.now()}.txt`;
      fs.writeFileSync(filename, report);
      await ctx.replyWithDocument({ source: filename }, { caption: '📄 Hasil cek bio (nomor|tahun|bio)' });
      fs.unlinkSync(filename);
    }

  } catch (error) {
    console.error('Error checking bio:', error);
    await ctx.reply('❌ Terjadi kesalahan saat memeriksa bio.\nDetail: ' + String(error?.message || error));
  }
}

// ==========================
// API CALL FUNCTION
// ==========================


// ==========================
// COMMAND HANDLERS
// ==========================

// START COMMAND
bot.start(async (ctx) => {
  const welcomeText = `
╔═══════════════════════╗
║    🤖 FIX MERAH BOT   ║
║       BIO CHECKER     ║
╚═══════════════════════╝

👋 Halo ${ctx.from.first_name}!

📋 *Fitur Utama:*
• ✅ Cek Bio WhatsApp
• 🔧 Fix Mode Appeal
• 📊 Premium Features

🔐 *Status:* ${isPremium(ctx.from.id) ? '💎 PREMIUM' : '🔓 FREE'}

Gunakan /menu untuk melihat semua fitur.
  `;

  await ctx.replyWithPhoto(
    { url: 'https://files.catbox.moe/0x7mt1.jpg' },
    {
      caption: welcomeText,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📱 Buka Menu', callback_data: 'show_menu' }],
          [{ text: '👤 Owner', url: 'https://t.me/Lunzy2' }]
        ]
      }
    }
  );
});

// MENU COMMAND
bot.command('menu', async (ctx) => {
  const menuText = `
📱 *MAIN MENU*

🛠️ *Tools:*
/cekbio [nomor] - Cek bio WhatsApp
/fix [nomor] - Mode appeal

👑 *Owner Only:*
/pairing [nomor] - Pairing WhatsApp
/addemail email:pass - Tambah email
/delemail email:pass - Hapus email
/listemail - List semua email
/addprem [id] - Tambah premium
/delprem [id] - Hapus premium
/listprem - List user premium

🔄 /start - Menu utama
  `;

  await ctx.reply(menuText, { parse_mode: 'Markdown' });
});

// PREMIUM MANAGEMENT
bot.command('addprem', async (ctx) => {
  if (!isOwner(ctx.from.id)) {
    return ctx.reply('❌ Hanya owner yang bisa menambah premium.');
  }

  let targetId = ctx.message.reply_to_message 
    ? ctx.message.reply_to_message.from.id 
    : ctx.message.text.split(' ')[1];

  if (!targetId) {
    return ctx.reply('❌ Format: /addprem [user_id] atau reply pesan user.');
  }

  targetId = targetId.toString();

  if (!premiumUsers.includes(targetId)) {
    premiumUsers.push(targetId);
    savePremium();
    await ctx.reply(`✅ User ${targetId} berhasil ditambahkan ke premium.`);
  } else {
    await ctx.reply('⚠️ User sudah premium.');
  }
});

bot.command('delprem', async (ctx) => {
  if (!isOwner(ctx.from.id)) {
    return ctx.reply('❌ Hanya owner yang bisa menghapus premium.');
  }

  let targetId = ctx.message.reply_to_message 
    ? ctx.message.reply_to_message.from.id 
    : ctx.message.text.split(' ')[1];

  if (!targetId) {
    return ctx.reply('❌ Format: /delprem [user_id] atau reply pesan user.');
  }

  targetId = targetId.toString();
  const index = premiumUsers.indexOf(targetId);

  if (index > -1) {
    premiumUsers.splice(index, 1);
    savePremium();
    await ctx.reply(`✅ User ${targetId} berhasil dihapus dari premium.`);
  } else {
    await ctx.reply('⚠️ User tidak ditemukan di list premium.');
  }
});

bot.command('listprem', async (ctx) => {
  if (!isOwner(ctx.from.id)) {
    return ctx.reply('❌ Hanya owner yang bisa melihat list premium.');
  }

  if (premiumUsers.length === 0) {
    return ctx.reply('📭 Belum ada user premium.');
  }

  let list = '💎 *DAFTAR USER PREMIUM:*\n\n';
  premiumUsers.forEach((id, index) => {
    list += `${index + 1}. ${id}\n`;
  });

  await ctx.reply(list, { parse_mode: 'Markdown' });
});

// WHATSAPP PAIRING
bot.command('pairing', async (ctx) => {
  if (!isOwner(ctx.from.id)) {
    return ctx.reply('❌ Hanya owner yang bisa melakukan pairing.');
  }

  const phoneNumber = ctx.message.text.split(' ')[1]?.replace(/[^0-9]/g, '');

  if (!phoneNumber) {
    return ctx.reply('❌ Format: /pairing [nomor]\nContoh: /pairing 6281234567890');
  }

  if (!waClient) {
    await ctx.reply('⏳ Menyiapkan WhatsApp client...');
    await startWhatsAppClient();
    await sleep(2000);
    if (!waClient) return ctx.reply('⚠️ WhatsApp client belum siap. Coba lagi sebentar.');
  }

  try {
    await ctx.reply('⏳ Meminta kode pairing...');
    
    const code = await waClient.requestPairingCode(phoneNumber);
    
    await ctx.reply(
      `📱 *PAIRING CODE*\n\n` +
      `Kode: *${code}*\n\n` +
      `Instruksi:\n` +
      `1. Buka WhatsApp di HP\n` +
      `2. Pilih Menu → Perangkat Tertaut\n` +
      `3. Pilih "Tautkan dengan nomor telepon"\n` +
      `4. Masukkan kode di atas`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Pairing error:', error);
    await ctx.reply('❌ Gagal mendapatkan pairing code. Pastikan nomor valid.');
  }
});

// EMAIL MANAGEMENT
bot.command('addemail', async (ctx) => {
  if (!isOwner(ctx.from.id)) {
    return ctx.reply('❌ Hanya owner yang bisa menambah email.');
  }

  const input = ctx.message.text.replace('/addemail', '').trim();
  
  if (!input || !input.includes(':')) {
    return ctx.reply('❌ Format: /addemail email:password\nContoh: /addemail test@gmail.com:password123');
  }

  try {
    const { content, sha } = await null;
    const newContent = content.trim() + (content.trim() ? '\n' : '') + input + '\n';
    
    await dbAppend(newContent, sha);
    await ctx.reply('✅ Email berhasil ditambahkan!');
  } catch (error) {
    console.error('Add email error:', error);
    await ctx.reply('❌ Gagal menambahkan email.');
  }
});

bot.command('listemail', async (ctx) => {
  if (!isOwner(ctx.from.id)) {
    return ctx.reply('❌ Hanya owner yang bisa melihat list email.');
  }

  try {
    const { content } = await null;
    
    if (!content.trim()) {
      return ctx.reply('📭 Tidak ada data email.');
    }

    const emails = content.trim().split('\n').filter(line => line.trim());
    
    let list = '📧 *DAFTAR EMAIL:*\n\n';
    emails.forEach((email, index) => {
      const [emailPart] = email.split(':');
      list += `${index + 1}. ${emailPart}\n`;
    });

    await ctx.reply(list, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('List email error:', error);
    await ctx.reply('❌ Gagal mengambil data email.');
  }
});

bot.command('delemail', async (ctx) => {
  if (!isOwner(ctx.from.id)) {
    return ctx.reply('❌ Hanya owner yang bisa menghapus email.');
  }

  const emailToDelete = ctx.message.text.split(' ')[1];
  
  if (!emailToDelete) {
    return ctx.reply('❌ Format: /delemail [email]\nContoh: /delemail test@gmail.com');
  }

  try {
    const result = await deleteEmailFromLocal(emailToDelete);
    
    if (result.success) {
      await ctx.reply(`✅ ${result.message}`);
    } else {
      await ctx.reply(`❌ ${result.message}`);
    }
  } catch (error) {
    console.error('Delete email error:', error);
    await ctx.reply('❌ Gagal menghapus email.');
  }
});

// CEK BIO COMMAND
bot.command('cekbio', async (ctx) => {
  if (!isPremium(ctx.from.id) && !isOwner(ctx.from.id)) {
    return ctx.reply('❌ Fitur ini hanya untuk user premium.\nHubungi owner untuk upgrade.');
  }

  // Handle file upload (kirim /cekbio sambil attach .txt)
  if (ctx.message.document) {
    const doc = ctx.message.document;
    
    if (!doc.mime_type.includes('text') && !doc.file_name.endsWith('.txt')) {
      return ctx.reply('❌ File harus berupa .txt');
    }

    try {
      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      const response = await axios.get(fileLink.href);
      const numbers = response.data.match(/\d+/g) || [];
      
      if (numbers.length === 0) {
        return ctx.reply('❌ Tidak ditemukan nomor dalam file.');
      }

      await handleBioCheck(ctx, numbers);
    } catch (error) {
      console.error('File processing error:', error);
      await ctx.reply('❌ Gagal membaca file.');
    }
  } else {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
      return ctx.reply('❌ Format: /cekbio [nomor1] [nomor2] ...\nContoh: /cekbio 6281234567890 6289876543210\n\nAtau kirim file .txt sambil ketik /cekbio');
    }
    await handleBioCheck(ctx, args);
  }
});

// FIX MODE (APPEAL)
bot.command('fix', async (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(' ').slice(1);
  const phoneNumber = args[0];

  if (!phoneNumber) {
    return ctx.reply('❌ Format: /fix [nomor]\nContoh: /fix 6281234567890');
  }

  if (!/^\d{10,15}$/.test(phoneNumber)) {
    return ctx.reply('❌ Nomor tidak valid. Gunakan 10-15 digit angka.');
  }

  // Cooldown check
  const now = Date.now();
  const cooldownTime = 2 * 60 * 1000; // 2 menit
  
  if (userCooldowns[userId] && now < userCooldowns[userId]) {
    const remaining = Math.ceil((userCooldowns[userId] - now) / 1000);
    return ctx.reply(`⏳ Tunggu ${remaining} detik sebelum menggunakan fix lagi.`);
  }

  userCooldowns[userId] = now + cooldownTime;

  try {
    await ctx.reply('⏳ Sedang memproses appeal...');
    
    const result = await callApi('/banding', { nomor: phoneNumber });
    
    const responseText = `
📊 *HASIL APPEAL*

📞 Nomor: ${phoneNumber}
📧 Email: ${result.email || 'Tidak tersedia'}
📝 Status: ${result.success ? '✅ Berhasil' : '❌ Gagal'}
💬 Response: ${result.response || 'Tidak ada response'}
    `;

    await ctx.reply(responseText, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Fix mode error:', error);
    await ctx.reply('❌ Terjadi kesalahan saat proses appeal.');
  }
});

// ==========================
// CALLBACK QUERY HANDLER
// ==========================

bot.on('callback_query', async (ctx) => {
  const action = ctx.callbackQuery.data;
  
  if (action === 'show_menu') {
    await ctx.deleteMessage();
    await ctx.replyWithPhoto(
      { url: 'https://files.catbox.moe/0x7mt1.jpg' },
      {
        caption: '📱 *PILIH MENU*',
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔍 Cek Bio', callback_data: 'menu_cekbio' },
              { text: '🔧 Fix Mode', callback_data: 'menu_fix' }
            ],
            [
              { text: '👑 Owner Menu', callback_data: 'menu_owner' },
              { text: '⭐ Premium', url: 'https://t.me/Lunzy2' }
            ],
            [
              { text: '🔄 Start', callback_data: 'menu_start' }
            ]
          ]
        }
      }
    );
  }
  
  else if (action === 'menu_cekbio') {
    await ctx.editMessageText(
      '🔍 *CEK BIO WHATSAPP*\n\n' +
      'Untuk cek bio, gunakan:\n' +
      '`/cekbio 6281234567890`\n\n' +
      'Atau kirim file .txt berisi list nomor.\n\n' +
      '⚠️ *Note:* Fitur ini hanya untuk user premium.',
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Kembali', callback_data: 'show_menu' }]
          ]
        }
      }
    );
  }
  
  else if (action === 'menu_fix') {
    await ctx.editMessageText(
      '🔧 *FIX MODE (APPEAL)*\n\n' +
      'Untuk menggunakan fix mode:\n' +
      '`/fix 6281234567890`\n\n' +
      '⏱️ Cooldown: 2 menit per penggunaan\n\n' +
      '⚠️ *Note:* Masukkan nomor WhatsApp yang ingin di-appeal.',
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Kembali', callback_data: 'show_menu' }]
          ]
        }
      }
    );
  }
  
  else if (action === 'menu_owner') {
    if (!isOwner(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Hanya owner yang bisa mengakses menu ini.', { show_alert: true });
      return;
    }
    
    await ctx.editMessageText(
      '👑 *OWNER MENU*\n\n' +
      '📱 WhatsApp:\n' +
      '`/pairing [nomor]` - Pairing WhatsApp\n\n' +
      '📧 Email Management:\n' +
      '`/addemail email:pass` - Tambah email\n' +
      '`/delemail [email]` - Hapus email\n' +
      '`/listemail` - List semua email\n\n' +
      '⭐ Premium Management:\n' +
      '`/addprem [id]` - Tambah premium\n' +
      '`/delprem [id]` - Hapus premium\n' +
      '`/listprem` - List user premium',
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Kembali', callback_data: 'show_menu' }]
          ]
        }
      }
    );
  }
  
  else if (action === 'menu_start') {
    await ctx.deleteMessage();
    ctx.telegram.sendMessage(
      ctx.chat.id,
      'ℹ️ Gunakan /start untuk memulai bot.'
    );
  }
  
  await ctx.answerCbQuery();
});

// ==========================
// ERROR HANDLING
// ==========================

bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  if (ctx.chat) {
    ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi nanti.');
  }
});

// ==========================
// START BOT
// ==========================

async function startBot() {
  try {
    // Start WhatsApp client
    await startWhatsAppClient();
    
    // Start Telegram bot
    await bot.launch();
    
    console.log('🤖 Bot Telegram berhasil dijalankan!');
    console.log('📱 WhatsApp client starting...');
    
    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
    
  } catch (error) {
    console.error('Failed to start bot:', error);
  }
}

// Run the bot
startBot();
