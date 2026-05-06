const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const db = require('../database');

const BOT_TOKEN = process.env.BOT_TOKEN;
const API_URL = process.env.API_URL;
const CHANNEL_ID = '@digiintel';
const ADMIN_ID = 6872301913;
const ADMIN_USERNAME = 'Ehsuraj';
const BLACKLIST = ['9749727847', '9091592660'];

const bot = new Telegraf(BOT_TOKEN);
const DIVIDER = '───────────────────';

// --- HELPER: Force Join Check ---
async function isMember(ctx) {
    try {
        const member = await ctx.telegram.getChatMember(CHANNEL_ID, ctx.from.id);
        return ['member', 'administrator', 'creator'].includes(member.status);
    } catch (e) { return false; }
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
    return ctx.reply(`📚 *AVAILABLE COMMANDS*\n\n${DIVIDER}\n🔎 */num <number>* — Search Mobile (1💳)\n🆔 */aadhar <id>* — Search Aadhar (1💳)\n🏎️ */vahan <reg_no>* — Vehicle OSINT (2💳)\n🏦 */ifsc <code>* — Bank Details (FREE)\n💰 */credits* — Check Balance\n🔗 */refer* — Earn Credits\n${DIVIDER}\n👉 Contact @${ADMIN_USERNAME} for bulk access.`, { parse_mode: 'Markdown' });
};
bot.action('help', (ctx) => sendHelp(ctx));
bot.command('help', (ctx) => sendHelp(ctx));

const sendCredits = async (ctx) => {
    const user = await db.getUser(ctx.from.id, ctx.from.username);
    ctx.reply(`💰 *YOUR WALLET*\n\n${DIVIDER}\n👤 User: *${ctx.from.first_name}*\n💳 Balance: *${user.credits} Credits*\n${DIVIDER}`, { parse_mode: 'Markdown' });
};
bot.action('credits', (ctx) => sendCredits(ctx));
bot.command('credits', (ctx) => sendCredits(ctx));

bot.action('buy_credits', (ctx) => {
    ctx.reply(`💎 *ELITE CREDIT PACKS*\n\n${DIVIDER}\n⭐ *Min Purchase:* 100 Credits\n💰 *Status:* Best Value\n${DIVIDER}\n👉 Contact @${ADMIN_USERNAME} to buy instantly.`, { parse_mode: 'Markdown' });
});

const sendRefer = async (ctx) => {
    const user = await db.getUser(ctx.from.id, ctx.from.username);
    const link = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
    ctx.reply(`🔗 *INVITE & EARN*\n\n${DIVIDER}\nInvite 5 friends for *+1 Credit*!\n\n📎 *Link:*\n\`${link}\`\n\n👥 Progress: *${user.referral_count}/5*\n${DIVIDER}`, { parse_mode: 'Markdown' });
};
bot.action('refer', (ctx) => sendRefer(ctx));
bot.command('refer', (ctx) => sendRefer(ctx));

// --- SEARCH: MOBILE (RE-RESTORED ORIGINAL) ---
bot.command('num', async (ctx) => {
    if (!(await isMember(ctx))) return;
    const number = ctx.message.text.split(' ')[1];
    if (!number) return ctx.reply(`⚠️ *Oops! Missing Number*\n\n👉 *Example:* \`/num 9876543210\``, { parse_mode: 'Markdown' });
    if (BLACKLIST.includes(number)) return ctx.reply("⚠️ No records found.");
    const user = await db.getUser(ctx.from.id);
    if (user.credits < 1) return ctx.reply("❌ *Insufficient Credits!*");
    const msg = await ctx.reply("⚡ *HUNTING DATA...* 🔍");
    try {
        const response = await axios.get(`${API_URL}/search/mobile/${number}`);
        let data = response.data.results;
        if (!data || data.length === 0) await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "❌ *No records found in our elite database.*", { parse_mode: 'Markdown' });
        else {
            const uniqueData = Array.from(new Map(data.map(item => [JSON.stringify({ n: item.name, m: item.mobile, a: item.aadhar || item.id, f: item.fname }), item])).values());
            await db.useCredit(ctx.from.id);
            await db.logSearch('mobile');
            const ELITE_DIVIDER = '━━━━━━━━━━━━━━━━━━';
            let resultText = `⚡ *DIGIINTEL ELITE INTELLIGENCE REPORT* ⚡\n${ELITE_DIVIDER}\n`;
            uniqueData.forEach((row) => {
                const cleanAddress = (row.address || 'N/A').replace(/!/g, ' ').replace(/\s+/g, ' ').trim();
                resultText += `📞 *Mobile:* ${row.mobile || 'N/A'}\n👤 *Name:* ${row.name || 'N/A'}\n🧔🏻‍♂️ *Father's Name:* ${row.fname || 'N/A'}\n🏠 *Address:* ${cleanAddress}\n📍 *Circle:* ${row.circle || 'N/A'}\n📱 *Alt No:* ${row.alt || row.alt_no || 'N/A'}\n📄 *Aadhar Number:* ${row.aadhar || row.id || 'N/A'}\n${ELITE_DIVIDER}\n`;
            });
            resultText += `🛡️ @digiintelbot`;
            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, resultText, { parse_mode: 'Markdown' });
        }
    } catch (e) { await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "⚠️ Search failed."); }
});

// --- SEARCH: AADHAR (RE-RESTORED ORIGINAL) ---
bot.command('aadhar', async (ctx) => {
    if (!(await isMember(ctx))) return;
    const id = ctx.message.text.split(' ')[1];
    if (!id) return ctx.reply(`⚠️ *Oops! Missing ID*\n\n👉 *Example:* \`/aadhar 123456789012\``, { parse_mode: 'Markdown' });
    const user = await db.getUser(ctx.from.id);
    if (user.credits < 1) return ctx.reply("❌ Insufficient credits.");
    const msg = await ctx.reply("⚡ *SCANNING TARGET...* 🔍");
    try {
        const response = await axios.get(`${API_URL}/search/id/${id}`);
        let data = response.data.results;
        if (!data || data.length === 0) await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "❌ *No records found for this Aadhar ID.*", { parse_mode: 'Markdown' });
        else {
            const uniqueData = Array.from(new Map(data.map(item => [JSON.stringify({ n: item.name, m: item.mobile, f: item.fname }), item])).values());
            await db.useCredit(ctx.from.id);
            await db.logSearch('aadhar');
            const ELITE_DIVIDER = '━━━━━━━━━━━━━━━━━━';
            let resultText = `⚡ *DIGIINTEL ELITE INTELLIGENCE REPORT* ⚡\n${ELITE_DIVIDER}\n`;
            uniqueData.forEach((row) => {
                const cleanAddress = (row.address || 'N/A').replace(/!/g, ' ').replace(/\s+/g, ' ').trim();
                resultText += `📞 *Mobile:* ${row.mobile || 'N/A'}\n👤 *Name:* ${row.name || 'N/A'}\n🧔🏻‍♂️ *Father's Name:* ${row.fname || 'N/A'}\n🏠 *Address:* ${cleanAddress}\n📍 *Circle:* ${row.circle || 'N/A'}\n📄 *Aadhar Number:* ${row.aadhar || row.id || 'N/A'}\n${ELITE_DIVIDER}\n`;
            });
            resultText += `🛡️ @digiintelbot`;
            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, resultText, { parse_mode: 'Markdown' });
        }
    } catch (e) { await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "⚠️ Search failed."); }
});

// --- SEARCH: VAHAN (SMART GOOGLE PROXY) ---
bot.command('vahan', async (ctx) => {
    if (!(await isMember(ctx))) return;
    const regNo = (ctx.message.text.split(' ')[1] || '').toUpperCase().replace(/\s+/g, '');
    if (!regNo) return ctx.reply(`⚠️ *Example:* \`/vahan GJ01YL8529\``, { parse_mode: 'Markdown' });
    const user = await db.getUser(ctx.from.id);
    if (user.credits < 2) return ctx.reply("❌ *Needs 2💳*");
    const msg = await ctx.reply("🛰️ *PULLING SATELLITE DATA...* 🏎️");
    try {
        const proxyUrl = `https://script.google.com/macros/s/AKfycbydWBN2mxLjD4atLE66PuVg678qtqBOITAGPWEjpvrBp6_8DAQXvJs9tMXOJkOb-NmSOA/exec?regNo=${regNo}`;
        const response = await axios.get(proxyUrl, { timeout: 25000 });
        const d = response.data.data;
        if (!d || !d.engineNumber) return await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "❌ *Vehicle not found or Database Busy.*", { parse_mode: 'Markdown' });

        await db.useCredit(ctx.from.id, 2);
        await db.logSearch('vahan');
        const ELITE_DIVIDER = '━━━━━━━━━━━━━━━━━━';
        let report = `⚡ *DIGIINTEL VEHICLE INTELLIGENCE* ⚡\n${ELITE_DIVIDER}\n`;
        report += `🏎️ *Reg No:* \`${regNo}\`\n👤 *Owner:* ${d.ownerName}\n🆔 *Chassis:* \`${d.chassisNumber}\`\n⚙️ *Engine:* \`${d.engineNumber}\`\n🚘 *Model:* ${d.vehicleModel || d.model}\n⛽ *Fuel:* ${d.fuelType}\n📅 *Reg Date:* ${d.registrationDate}\n🛡️ *Insurance:* ${d.insuranceExpiryDate || 'N/A'}\n${ELITE_DIVIDER}\n🛡️ @digiintelbot`;
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, report, { parse_mode: 'Markdown' });
    } catch (e) { await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "⚠️ *Error in link.*", { parse_mode: 'Markdown' }); }
});

// --- OTHER COMMANDS ---
bot.command('ifsc', async (ctx) => {
    const code = ctx.message.text.split(' ')[1];
    if (!code) return ctx.reply("⚠️ *Example:* `/ifsc SBIN0001234`", { parse_mode: 'Markdown' });
    try {
        const res = await axios.get(`https://ifsc.razorpay.com/${code}`);
        const d = res.data;
        let text = `🏛️ *BANK INFO* 🏛️\n━━━━━━━━━━━━━━━━━━\n🏦 *Bank:* ${d.BANK}\n📍 *Branch:* ${d.BRANCH}\n🏙️ *City:* ${d.CITY}\n🗺️ *Address:* ${d.ADDRESS}\n━━━━━━━━━━━━━━━━━━\n🛡️ @digiintelbot`;
        ctx.reply(text, { parse_mode: 'Markdown' });
    } catch (e) { ctx.reply("❌ *Invalid IFSC.*"); }
});

bot.action('check_join', async (ctx) => {
    if (await isMember(ctx)) ctx.reply("✅ Access Granted! Use /start.");
    else ctx.reply("❌ Please join @digiintel first.");
});

bot.on('message', (ctx) => { if (ctx.message.text && ctx.message.text.startsWith('/')) ctx.reply("🤔 Unknown Command. Type /help."); });

module.exports = async (req, res) => {
    try { await bot.handleUpdate(req.body); res.status(200).send('OK'); } 
    catch (e) { res.status(500).send('Error'); }
};
