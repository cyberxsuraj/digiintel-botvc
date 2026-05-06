const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const db = require('../database');

const BOT_TOKEN = process.env.BOT_TOKEN;
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

bot.start(async (ctx) => {
    const menu = getMainMenu(ctx);
    ctx.reply(menu.text, { parse_mode: 'Markdown', ...menu.extra });
});

bot.command('help', (ctx) => {
    ctx.reply(`📚 *AVAILABLE COMMANDS*\n\n${DIVIDER}\n🔎 */num <number>* — Search Mobile (1💳)\n🆔 */aadhar <id>* — Search Aadhar (1💳)\n🏎️ */vahan <reg_no>* — Vehicle OSINT (2💳)\n🏦 */ifsc <code>* — Bank Details (FREE)\n💰 */credits* — Check Balance\n🔗 */refer* — Earn Credits\n${DIVIDER}\n👉 Contact @${ADMIN_USERNAME} for bulk access.`, { parse_mode: 'Markdown' });
});

bot.command('num', async (ctx) => {
    if (!(await isMember(ctx))) return;
    const number = ctx.message.text.split(' ')[1];
    if (!number) return ctx.reply(`⚠️ *Example:* \`/num 9876543210\``);
    const msg = await ctx.reply("⚡ *HUNTING DATA...* 🔍");
    try {
        const response = await axios.get(`https://digiintel.onrender.com/search/mobile/${number}`);
        let data = response.data.results;
        if (!data || data.length === 0) await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "❌ No records found.");
        else {
            let text = `⚡ *REPORT* ⚡\n`;
            data.forEach(row => { text += `👤 Name: ${row.name}\n📞 Mobile: ${row.mobile}\n🏠 Address: ${row.address}\n\n`; });
            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, text);
        }
    } catch (e) { await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "⚠️ Search failed."); }
});

bot.command('aadhar', async (ctx) => {
    if (!(await isMember(ctx))) return;
    const id = ctx.message.text.split(' ')[1];
    if (!id) return ctx.reply(`⚠️ *Example:* \`/aadhar 123456789012\``);
    const msg = await ctx.reply("⚡ *SCANNING TARGET...* 🔍");
    try {
        const response = await axios.get(`https://digiintel.onrender.com/search/id/${id}`);
        let data = response.data.results;
        if (!data || data.length === 0) await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "❌ No records found.");
        else {
            let text = `⚡ *REPORT* ⚡\n`;
            data.forEach(row => { text += `👤 Name: ${row.name}\n📄 Aadhar: ${row.id}\n🏠 Address: ${row.address}\n\n`; });
            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, text);
        }
    } catch (e) { await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "⚠️ Search failed."); }
});

bot.command('vahan', async (ctx) => {
    const regNo = (ctx.message.text.split(' ')[1] || '').toUpperCase();
    const msg = await ctx.reply("🛰️ *PULLING SATELLITE DATA...* 🏎️");
    try {
        const proxyUrl = `https://script.google.com/macros/s/AKfycbydWBN2mxLjD4atLE66PuVg678qtqBOITAGPWEjpvrBp6_8DAQXvJs9tMXOJkOb-NmSOA/exec?regNo=${regNo}`;
        const response = await axios.get(proxyUrl);
        const data = response.data.data;
        if (!data || !data.engineNumber) return await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "❌ Not found.");
        let report = `⚡ *VEHICLE INFO* ⚡\n\n👤 Owner: ${data.ownerName}\n🆔 Chassis: ${data.chassisNumber}\n⚙️ Engine: ${data.engineNumber}\n🚘 Model: ${data.vehicleModel}`;
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, report);
    } catch (e) { await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "⚠️ Error."); }
});

bot.command('ifsc', async (ctx) => {
    const code = ctx.message.text.split(' ')[1];
    try {
        const res = await axios.get(`https://ifsc.razorpay.com/${code}`);
        ctx.reply(`🏦 Bank: ${res.data.BANK}\n📍 Branch: ${res.data.BRANCH}`);
    } catch (e) { ctx.reply("❌ Invalid IFSC."); }
});

bot.action('check_join', async (ctx) => {
    if (await isMember(ctx)) ctx.reply("✅ Access Granted!");
    else ctx.reply("❌ Please join @digiintel.");
});

module.exports = async (req, res) => {
    try { await bot.handleUpdate(req.body); res.status(200).send('OK'); } 
    catch (e) { res.status(500).send('Error'); }
};
