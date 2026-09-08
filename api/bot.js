const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const { exec } = require('child_process');
const path = require('path');
const db = require('../database');

const BOT_TOKEN = process.env.BOT_TOKEN;
const API_URL = process.env.API_URL;
const CHANNEL_ID = '@digiintel';
const ADMIN_ID = 6872301913;
const ADMIN_USERNAME = 'Ehsuraj';
const BLACKLIST = ['9749727847', '9091592660'];

const bot = new Telegraf(BOT_TOKEN);
const DIVIDER = '───────────────────';

// In-memory cache for channel membership (5 minutes TTL) to prevent hammering Telegram API
const memberCache = new Map();
const MEMBER_CACHE_TTL = 5 * 60 * 1000;

// --- HELPER: Force Join Check ---
async function isMember(ctx, forceCheck = false) {
    const userId = ctx.from.id;
    if (forceCheck) memberCache.delete(userId);

    const cached = memberCache.get(userId);
    if (!forceCheck && cached && cached.isMember && (Date.now() - cached.timestamp < MEMBER_CACHE_TTL)) {
        return true;
    }
    try {
        const member = await ctx.telegram.getChatMember(CHANNEL_ID, userId);
        const result = ['member', 'administrator', 'creator'].includes(member.status);
        if (result) {
            memberCache.set(userId, { isMember: true, timestamp: Date.now() });
        } else {
            memberCache.delete(userId); // NEVER cache false!
        }
        return result;
    } catch (e) {
        memberCache.delete(userId);
        return false;
    }
}

// --- MIDDLEWARE ---
bot.use(async (ctx, next) => {
    if (ctx.from.is_bot) return;
    const user = await db.getUser(ctx.from.id, ctx.from.username);
    ctx.session_user = user;
    if (await isMember(ctx)) return next();
    return ctx.reply(`🚫 *ACCESS DENIED* 🚫\n\n${DIVIDER}\nTo use the **DigiIntel Elite Tools**, you must join our official channel.\n${DIVIDER}`,
        Markup.inlineKeyboard([
            [Markup.button.url('📢 Join DigiIntel', 'https://t.me/digiintel')],
            [Markup.button.callback('✅ I Have Joined', 'check_join')]
        ], { parse_mode: 'Markdown' })
    );
});

// --- UI DESIGNS ---
const getMainMenu = (ctx) => {
    return {
        text: `🚀 *WELCOME TO DIGIINTEL OSINT* 🚀\n\n💀 *Elite Intelligence • Real Data • Zero Limits* 💀\n${DIVIDER}\n👁️ Welcome to *DigiIntel* — your gateway to powerful intelligence tools.\n🕵️‍♂️ Data isn't searched here... it's *hunted* ⚡\n${DIVIDER}\n⚡ *CORE FEATURES*\n🔎 Deep Search & Data Lookup\n📱 Mobile & Aadhar Tracking\n📊 Intelligence Gathering\n🧠 Smart Automation\n${DIVIDER}\n👤 *OWNER:* @${ADMIN_USERNAME}\n🔥 _Power is nothing without control. Use it wisely._ 🔥`,
        extra: Markup.inlineKeyboard([
            [Markup.button.callback('📖 Help', 'help'), Markup.button.callback('💰 Balance', 'credits')],
            [Markup.button.callback('💎 Buy Credits', 'buy_credits'), Markup.button.callback('🔗 Invite & Earn', 'refer')],
            [Markup.button.url('📢 Channel', 'https://t.me/digiintel')]
        ])
    };
};

// --- HANDLERS ---
bot.start(async (ctx) => {
    const startPayload = ctx.message.text.split(' ')[1];
    if (startPayload && !isNaN(startPayload)) {
        const res = await db.addReferral(ctx.from.id, parseInt(startPayload));
        if (res && res.reward) ctx.telegram.sendMessage(parseInt(startPayload), `🎉 *Referral Goal Reached!*\n${DIVIDER}\nYou have received *1 Free Credit*!`, { parse_mode: 'Markdown' });
    }
    const menu = getMainMenu(ctx);
    ctx.reply(menu.text, { parse_mode: 'Markdown', ...menu.extra });
});

const sendHelp = (ctx) => {
    return ctx.reply(`📚 *AVAILABLE COMMANDS*\n\n${DIVIDER}\n🔎 */num <number>* — Search Mobile (1💳)\n🆔 */aadhar <id>* — Search Aadhar (1💳)\n📧 */email <email>* — Search Email (1💳)\n🏦 */ifsc <code>* — Bank Details (FREE)\n💰 */credits* — Check Balance\n🔗 */refer* — Earn Credits\n${DIVIDER}\n👉 Contact @${ADMIN_USERNAME} for bulk access.`, { parse_mode: 'Markdown' });
};
bot.action('help', (ctx) => sendHelp(ctx));
bot.command('help', (ctx) => sendHelp(ctx));

bot.action('email_info', (ctx) => {
    ctx.reply(`📧 *EMAIL INTELLIGENCE SEARCH*\n\n${DIVIDER}\nTo search for subscriber records linked to an email, use:\n\n👉 \`/email user@example.com\`\n(or \`/mail user@example.com\`)\n\n💳 Cost: *1 Credit per search*\n${DIVIDER}`, { parse_mode: 'Markdown' });
});

const sendCredits = async (ctx) => {
    const user = await db.getUser(ctx.from.id, ctx.from.username);
    ctx.reply(`💰 *YOUR WALLET*\n\n${DIVIDER}\n👤 User: *${ctx.from.first_name}*\n💳 Balance: *${user.credits} Credits*\n${DIVIDER}`, { parse_mode: 'Markdown' });
};
bot.action('credits', (ctx) => sendCredits(ctx));
bot.command('credits', (ctx) => sendCredits(ctx));

bot.action('buy_credits', (ctx) => {
    ctx.reply(`💎 *ELITE CREDIT PACKS*\n\n${DIVIDER}\n⭐ *Min Purchase:* 100 Credits\n💰 *Status:* Best Value\n${DIVIDER}\n👉 Contact @${ADMIN_USERNAME} to buy instantly.`, { parse_mode: 'Markdown' });
});

bot.action('ifsc_info', (ctx) => {
    ctx.reply(`🏦 *BANK/IFSC SEARCH*\n\n${DIVIDER}\nTo search for bank details, use the command:\n\n👉 \`/ifsc SBIN0001234\`\n\n(This service is *FREE* for all users!)\n${DIVIDER}`, { parse_mode: 'Markdown' });
});

const sendRefer = async (ctx) => {
    const user = await db.getUser(ctx.from.id, ctx.from.username);
    const link = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
    ctx.reply(`🔗 *INVITE & EARN*\n\n${DIVIDER}\nInvite 5 friends for *+1 Credit*!\n\n📎 *Link:*\n\`${link}\`\n\n👥 Progress: *${user.referral_count}/5*\n${DIVIDER}`, { parse_mode: 'Markdown' });
};
bot.action('refer', (ctx) => sendRefer(ctx));
bot.command('refer', (ctx) => sendRefer(ctx));

// --- SEARCH ---
// --- SEARCH ---
bot.command('num', async (ctx) => {
    const rawInput = ctx.message.text.split(' ')[1] || '';
    const number = rawInput.trim().replace(/\D/g, '');
    if (!number || number.length !== 10) return ctx.reply(`⚠️ *Please provide a valid 10-digit mobile number.*\n\n👉 *Example:* \`/num 9876543210\``, { parse_mode: 'Markdown' });
    if (BLACKLIST.includes(number)) return ctx.reply("⚠️ No records found.");
    
    // Optimize: Use cached user from middleware
    const user = ctx.session_user;
    if (!user || user.credits < 1) return ctx.reply("❌ *Insufficient Credits!* Contact admin to purchase credits.");
    
    const msg = await ctx.reply("⚡ *Hunting intelligence records... Please wait.* 🔍");
    try {
        const cleanApiUrl = (API_URL || '').replace(/\/+$/, '');
        const response = await axios.get(`${cleanApiUrl}/search/nice/${number}`, { timeout: 45000 });
        let data = (response.data && response.data.results) ? response.data.results : [];

        if (!Array.isArray(data) || data.length === 0) {
            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "❌ *No records found for this number.*", { parse_mode: 'Markdown' });
        } else {
            // DEDUPLICATION: Remove identical rows safely
            const uniqueData = Array.from(new Map(data.filter(Boolean).map(item => [
                JSON.stringify({ n: item.name || '', m: item.mobile || '', a: item.aadhar || item.id || '', f: item.fname || '' }), 
                item
            ])).values());

            // Deduct credit and log search
            const dbUpdates = Promise.all([
                db.useCredit(ctx.from.id),
                db.logSearch('mobile')
            ]).catch(err => console.error("Database credit deduction failed:", err));

            const ELITE_DIVIDER = '━━━━━━━━━━━━━━━━━━';
            let resultText = `⚡ *DIGIINTEL INTELLIGENCE REPORT* ⚡\n${ELITE_DIVIDER}\n`;

            uniqueData.forEach((row) => {
                const cleanAddress = (row.address || 'N/A').replace(/!/g, ' ').replace(/\s+/g, ' ').trim();

                resultText += `📞 *Mobile:* ${row.mobile || 'N/A'}\n`;
                resultText += `👤 *Name:* ${row.name || 'N/A'}\n`;
                resultText += `🧔🏻‍♂️ *Father's Name:* ${row.fname || 'N/A'}\n`;
                resultText += `🏠 *Address:* ${cleanAddress}\n`;
                resultText += `📍 *Circle:* ${row.circle || 'N/A'}\n`;
                resultText += `📱 *Alt No:* ${row.alt || row.alt_no || row.alt_mobile || 'N/A'}\n`;
                resultText += `📄 *Aadhar Number:* ${row.aadhar || row.id || 'N/A'}\n`;
                if (row.email) resultText += `📧 *Email:* ${row.email}\n`;
                resultText += `${ELITE_DIVIDER}\n`;
            });
            resultText += `🛡️ @digiintelbot`;
            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, resultText, { parse_mode: 'Markdown' });
            
            await dbUpdates;
        }
    } catch (e) { 
        console.error("Bot /num search error:", e.message);
        let errorMsg = "⚠️ Service is momentarily busy. Please try your search again in a moment.";
        if (e.code === 'ECONNABORTED' || (e.message && e.message.includes('timeout'))) {
            errorMsg = "⏱️ Database scan took longer than expected. Please retry in a few moments.";
        }
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, errorMsg); 
    }
});

bot.command('aadhar', async (ctx) => {
    const rawInput = ctx.message.text.split(' ')[1] || '';
    const id = rawInput.trim().replace(/\D/g, '');
    if (!id || id.length !== 12) return ctx.reply(`⚠️ *Please provide a valid 12-digit Aadhar number.*\n\n👉 *Example:* \`/aadhar 123456789012\``, { parse_mode: 'Markdown' });
    
    // Optimize: Use cached user from middleware
    const user = ctx.session_user;
    if (!user || user.credits < 1) return ctx.reply("❌ *Insufficient Credits!* Contact admin to purchase credits.");
    
    const msg = await ctx.reply("⚡ *Scanning intelligence records... Please wait.* 🔍");
    try {
        const cleanApiUrl = (API_URL || '').replace(/\/+$/, '');
        const response = await axios.get(`${cleanApiUrl}/search/ask/${id}`, { timeout: 45000 });
        let data = (response.data && response.data.results) ? response.data.results : [];

        if (!Array.isArray(data) || data.length === 0) {
            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "❌ *No records found for this Aadhar ID.*", { parse_mode: 'Markdown' });
        } else {
            // DEDUPLICATION: Remove identical rows safely
            const uniqueData = Array.from(new Map(data.filter(Boolean).map(item => [
                JSON.stringify({ n: item.name || '', m: item.mobile || '', f: item.fname || '' }), 
                item
            ])).values());

            // Deduct credit and log search
            const dbUpdates = Promise.all([
                db.useCredit(ctx.from.id),
                db.logSearch('aadhar')
            ]).catch(err => console.error("Database credit deduction failed:", err));

            const ELITE_DIVIDER = '━━━━━━━━━━━━━━━━━━';
            let resultText = `⚡ *DIGIINTEL INTELLIGENCE REPORT* ⚡\n${ELITE_DIVIDER}\n`;

            uniqueData.forEach((row) => {
                const cleanAddress = (row.address || 'N/A').replace(/!/g, ' ').replace(/\s+/g, ' ').trim();

                resultText += `📞 *Mobile:* ${row.mobile || 'N/A'}\n`;
                resultText += `👤 *Name:* ${row.name || 'N/A'}\n`;
                resultText += `🧔🏻‍♂️ *Father's Name:* ${row.fname || 'N/A'}\n`;
                resultText += `🏠 *Address:* ${cleanAddress}\n`;
                resultText += `📍 *Circle:* ${row.circle || 'N/A'}\n`;
                resultText += `📱 *Alt No:* ${row.alt || row.alt_no || row.alt_mobile || 'N/A'}\n`;
                resultText += `📄 *Aadhar Number:* ${row.aadhar || row.id || 'N/A'}\n`;
                if (row.email) resultText += `📧 *Email:* ${row.email}\n`;
                resultText += `${ELITE_DIVIDER}\n`;
            });
            resultText += `🛡️ @digiintelbot`;
            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, resultText, { parse_mode: 'Markdown' });
            
            await dbUpdates;
        }
    } catch (e) { 
        console.error("Bot /aadhar search error:", e.message);
        let errorMsg = "⚠️ Service is momentarily busy. Please try your search again in a moment.";
        if (e.code === 'ECONNABORTED' || (e.message && e.message.includes('timeout'))) {
            errorMsg = "⏱️ Database scan took longer than expected. Please retry in a few moments.";
        }
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, errorMsg); 
    }
});

// EMAIL SEARCH COMMAND (/email or /mail)
bot.command(['email', 'mail'], async (ctx) => {
    const rawInput = ctx.message.text.split(' ')[1] || '';
    const email = rawInput.trim().toLowerCase();
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !EMAIL_REGEX.test(email)) {
        return ctx.reply(`⚠️ *Please provide a valid email address.*\n\n👉 *Example:* \`/email user@example.com\`\n(or \`/mail user@example.com\`)`, { parse_mode: 'Markdown' });
    }

    const user = ctx.session_user;
    if (!user || user.credits < 1) return ctx.reply("❌ *Insufficient Credits!* Contact admin to purchase credits.");

    const msg = await ctx.reply("⚡ *Scanning intelligence records for email... Please wait.* 🔍");
    try {
        const cleanApiUrl = (API_URL || '').replace(/\/+$/, '');
        const response = await axios.get(`${cleanApiUrl}/search/gm/${encodeURIComponent(email)}`, { timeout: 45000 });
        let data = (response.data && response.data.results) ? response.data.results : [];

        if (!Array.isArray(data) || data.length === 0) {
            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "❌ *No records found for this email address.*", { parse_mode: 'Markdown' });
        } else {
            // DEDUPLICATION: Remove identical rows safely
            const uniqueData = Array.from(new Map(data.filter(Boolean).map(item => [
                JSON.stringify({ n: item.name || '', m: item.mobile || '', f: item.fname || '' }), 
                item
            ])).values());

            // Deduct 1 credit and log search
            const dbUpdates = Promise.all([
                db.useCredit(ctx.from.id),
                db.logSearch('email')
            ]).catch(err => console.error("Database credit deduction failed:", err));

            const ELITE_DIVIDER = '━━━━━━━━━━━━━━━━━━';
            let resultText = `⚡ *DIGIINTEL INTELLIGENCE REPORT* ⚡\n${ELITE_DIVIDER}\n`;

            uniqueData.forEach((row) => {
                const cleanAddress = (row.address || 'N/A').replace(/!/g, ' ').replace(/\s+/g, ' ').trim();

                resultText += `📧 *Email:* ${row.email || email}\n`;
                resultText += `📞 *Mobile:* ${row.mobile || 'N/A'}\n`;
                resultText += `👤 *Name:* ${row.name || 'N/A'}\n`;
                resultText += `🧔🏻‍♂️ *Father's Name:* ${row.fname || 'N/A'}\n`;
                resultText += `🏠 *Address:* ${cleanAddress}\n`;
                resultText += `📍 *Circle:* ${row.circle || 'N/A'}\n`;
                resultText += `📱 *Alt No:* ${row.alt || row.alt_no || row.alt_mobile || 'N/A'}\n`;
                resultText += `📄 *Aadhar Number:* ${row.aadhar || row.id || 'N/A'}\n`;
                resultText += `${ELITE_DIVIDER}\n`;
            });
            resultText += `🛡️ @digiintelbot`;
            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, resultText, { parse_mode: 'Markdown' });

            await dbUpdates;
        }
    } catch (e) {
        console.error("Bot /email search error:", e.message);
        let errorMsg = "⚠️ Service is momentarily busy. Please try your search again in a moment.";
        if (e.code === 'ECONNABORTED' || (e.message && e.message.includes('timeout'))) {
            errorMsg = "⏱️ Database scan took longer than expected. Please retry in a few moments.";
        }
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, errorMsg);
    }
});



// --- ADMIN ---
bot.command('ifsc', async (ctx) => {
    const code = ctx.message.text.split(' ')[1];
    if (!code) return ctx.reply("⚠️ *Please provide an IFSC code.*\n\n👉 *Example:* `/ifsc SBIN0001234`", { parse_mode: 'Markdown' });
    const msg = await ctx.reply("🏦 *Fetching Bank Details...*");
    try {
        const res = await axios.get(`https://ifsc.razorpay.com/${code}`);
        const d = res.data;
        let text = `🏛️ *BANK DETAILS FOUND* 🏛️\n━━━━━━━━━━━━━━━━━━\n`;
        text += `🏦 *Bank:* ${d.BANK}\n`;
        text += `📍 *Branch:* ${d.BRANCH}\n`;
        text += `🗺️ *Address:* ${d.ADDRESS}\n`;
        text += `🏙️ *City:* ${d.CITY}\n`;
        text += `🚩 *State:* ${d.STATE}\n`;
        text += `🏧 *UPI:* ${d.UPI ? '✅ Supported' : '❌ Not Supported'}\n`;
        text += `━━━━━━━━━━━━━━━━━━\n🛡️ @digiintelbot`;
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, text, { parse_mode: 'Markdown' });
    } catch (e) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "❌ *Invalid IFSC Code or Bank Not Found.*", { parse_mode: 'Markdown' });
    }
});

bot.command('admin', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const stats = await db.getStats();
    ctx.reply(`👑 *ADMIN CONTROL PANEL*\n\n${DIVIDER}\n👥 Users: *${stats.totalUsers}*\n📊 Searches: *${stats.totalSearches}*\n${DIVIDER}`, { parse_mode: 'Markdown' });
});

bot.command('add', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const args = ctx.message.text.split(' ');
    if (!args[1] || !args[2]) return ctx.reply("❌ Usage: /add <user_id> <amount>");
    await db.addCredits(args[1], parseInt(args[2]));
    ctx.reply(`✅ Credited ${args[2]} to ${args[1]}`);
    ctx.telegram.sendMessage(args[1], `🎁 *CREDITS RECEIVED!*\n${DIVIDER}\nAdmin has added *${args[2]} Credits* to your account.\n${DIVIDER}`, { parse_mode: 'Markdown' });
});

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

bot.command('broadcast', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        console.warn(`Unauthorized broadcast attempt by user ID: ${ctx.from.id}`);
        return;
    }
    const message = ctx.message.text.replace(/^\/broadcast(@\w+)?/i, '').trim();
    if (!message) {
        return ctx.reply("❌ *Usage:* `/broadcast <message>`\n\n_Supports HTML or plain text._", { parse_mode: 'Markdown' });
    }

    let users = [];
    try {
        users = await db.getAllUsers();
    } catch (dbErr) {
        console.error("Broadcast DB error:", dbErr.message);
        return ctx.reply(`❌ *Database Error:* Could not fetch user list. ${dbErr.message}`, { parse_mode: 'Markdown' });
    }

    if (!users || users.length === 0) {
        return ctx.reply("⚠️ *Broadcast Aborted:* 0 users found in database.\n\nMake sure users have registered or /start the bot.", { parse_mode: 'Markdown' });
    }

    const total = users.length;
    await ctx.reply(`📢 *Broadcast Started...*\n${DIVIDER}\n👥 Total Recipients: *${total}*\n⚡ Sending in high-speed batches...`, { parse_mode: 'Markdown' });

    let successCount = 0;
    let failedCount = 0;
    const BATCH_SIZE = 15;
    const startTime = Date.now();
    const MAX_RUN_TIME = 11000; // 11s safe threshold for Vercel 15s limit

    for (let i = 0; i < total; i += BATCH_SIZE) {
        // If approaching Vercel serverless timeout, yield safely and send status
        if (Date.now() - startTime > MAX_RUN_TIME) {
            await ctx.telegram.sendMessage(ctx.chat.id, `⚠️ *Vercel Execution Limit Notice*\n${DIVIDER}\nProcessed: *${i}/${total}*\n✅ Sent: *${successCount}*\n❌ Blocked/Failed: *${failedCount}*\n\n💡 _For large lists, run the dedicated CLI broadcast runner to reach all users without timeouts._`, { parse_mode: 'Markdown' });
            return;
        }

        const batch = users.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(batch.map(async (u) => {
            const broadcastHtml = `📢 <b>DIGIINTEL ANNOUNCEMENT</b>\n${DIVIDER}\n${escapeHtml(message)}\n${DIVIDER}\n🛡️ @digiintelbot`;
            try {
                await ctx.telegram.sendMessage(u.user_id, broadcastHtml, { parse_mode: 'HTML' });
                successCount++;
            } catch (err) {
                // Fallback to plain text if HTML tags caused an error
                try {
                    await ctx.telegram.sendMessage(u.user_id, `📢 DIGIINTEL ANNOUNCEMENT\n${DIVIDER}\n${message}\n${DIVIDER}\n@digiintelbot`);
                    successCount++;
                } catch (fallbackErr) {
                    failedCount++;
                }
            }
        }));

        // 120ms pause between batches respects Telegram 30 msg/sec rate limit
        await sleep(120);
    }

    await ctx.telegram.sendMessage(ctx.chat.id, `✅ *Broadcast Finished!*\n${DIVIDER}\n👥 Total Targeted: *${total}*\n📬 Successfully Delivered: *${successCount}*\n⚠️ Blocked/Failed: *${failedCount}*\n${DIVIDER}`, { parse_mode: 'Markdown' });
});

bot.action('check_join', async (ctx) => {
    if (await isMember(ctx, true)) ctx.reply("✅ Access Granted! Use /start to begin.");
    else ctx.reply("❌ Please join @digiintel first.");
});

bot.on('message', (ctx) => { if (ctx.message.text && ctx.message.text.startsWith('/')) ctx.reply("🤔 Unknown Command. Type /help."); });

// --- VERCEL SERVERLESS HANDLER ---
module.exports = async (req, res) => {
    if (req.method === 'GET' || !req.body || typeof req.body !== 'object' || !req.body.update_id) {
        return res.status(200).json({ status: 'ok', service: 'DigiIntel Bot', webhook: 'active' });
    }
    try {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (e) {
        console.error('Webhook processing error:', e);
        // Always acknowledge Telegram webhook with 200 to prevent infinite retry loops
        res.status(200).send('OK');
    }
};
