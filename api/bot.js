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
const getMainMenu = () => ({
    text: `🚀 *WELCOME TO DIGIINTEL OSINT* 🚀\n\n💀 *Elite Intelligence • Real Data • Zero Limits* 💀\n${DIVIDER}\n👁️ Welcome to *DigiIntel* — your gateway to powerful intelligence tools.\n🕵️‍♂️ Data isn't searched here... it's *hunted* ⚡\n${DIVIDER}\n⚡ *CORE FEATURES*\n🔎 Deep Search & Data Lookup\n📱 Mobile & Aadhar Tracking\n📊 Intelligence Gathering\n🧠 Smart Automation\n${DIVIDER}\n👤 *OWNER:* @${ADMIN_USERNAME}\n🔥 _Power is nothing without control. Use it wisely._ 🔥`,
    extra: Markup.inlineKeyboard([
        [Markup.button.callback('📖 Help', 'help'), Markup.button.callback('💰 Balance', 'credits')],
        [Markup.button.callback('💎 Buy Credits', 'buy_credits'), Markup.button.callback('🔗 Invite & Earn', 'refer')],
        [Markup.button.url('📢 Channel', 'https://t.me/digiintel')]
    ])
});

// --- HANDLERS ---
bot.start(async (ctx) => {
    const startPayload = ctx.message.text.split(' ')[1];
    if (startPayload && !isNaN(startPayload)) {
        const res = await db.addReferral(ctx.from.id, parseInt(startPayload));
        if (res && res.reward) ctx.telegram.sendMessage(parseInt(startPayload), `🎉 *Referral Goal Reached!*\n${DIVIDER}\nYou have received *1 Free Credit*!`, { parse_mode: 'Markdown' });
    }
    const menu = getMainMenu();
    ctx.reply(menu.text, { parse_mode: 'Markdown', ...menu.extra });
});

const sendHelp = (ctx) => ctx.reply(`📚 *AVAILABLE COMMANDS*\n\n${DIVIDER}\n🔎 */num <number>* — Search Mobile (1💳)\n🆔 */aadhar <id>* — Search Aadhar (1💳)\n🏎️ */vahan <reg_no>* — Vehicle OSINT (2💳)\n🏦 */ifsc <code>* — Bank Details (FREE)\n💰 */credits* — Check Balance\n🔗 */refer* — Earn Credits\n${DIVIDER}\n👉 Contact @${ADMIN_USERNAME} for bulk access.`, { parse_mode: 'Markdown' });

bot.action('help', sendHelp);
bot.command('help', sendHelp);

const sendCredits = async (ctx) => {
    const user = await db.getUser(ctx.from.id, ctx.from.username);
    ctx.reply(`💰 *YOUR WALLET*\n\n${DIVIDER}\n👤 User: *${ctx.from.first_name}*\n💳 Balance: *${user.credits} Credits*\n${DIVIDER}`, { parse_mode: 'Markdown' });
};
bot.action('credits', sendCredits);
bot.command('credits', sendCredits);

bot.action('buy_credits', (ctx) => {
    ctx.reply(`💎 *ELITE CREDIT PACKS*\n\n${DIVIDER}\n⭐ *Min Purchase:* 100 Credits\n💰 *Status:* Best Value\n${DIVIDER}\n👉 Contact @${ADMIN_USERNAME} to buy instantly.`, { parse_mode: 'Markdown' });
});

const sendRefer = async (ctx) => {
    const user = await db.getUser(ctx.from.id, ctx.from.username);
    const link = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
    ctx.reply(`🔗 *INVITE & EARN*\n\n${DIVIDER}\nInvite 5 friends for *+1 Credit*!\n\n📎 *Link:*\n\`${link}\`\n\n👥 Progress: *${user.referral_count}/5*\n${DIVIDER}`, { parse_mode: 'Markdown' });
};
bot.action('refer', sendRefer);
bot.command('refer', sendRefer);

// --- SEARCH: MOBILE ---
bot.command('num', async (ctx) => {
    const number = ctx.message.text.split(' ')[1];
    if (!number) return ctx.reply("⚠️ *Example:* `/num 9876543210`", { parse_mode: 'Markdown' });
    if (BLACKLIST.includes(number)) return ctx.reply("⚠️ No records found.");
    const user = await db.getUser(ctx.from.id);
    if (user.credits < 1) return ctx.reply("❌ *Insufficient Credits!*");
    const msg = await ctx.reply("⚡ *HUNTING DATA...* 🔍");
    try {
        const response = await axios.get(`${process.env.API_URL}/search/mobile/${number}`);
        let data = response.data.results;
        if (data.length === 0) return await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "❌ *No records found.*", { parse_mode: 'Markdown' });
        
        await db.useCredit(ctx.from.id);
        await db.logSearch('mobile');
        
        let resultText = `⚡ *DIGIINTEL REPORT* ⚡\n━━━━━━━━━━━━━━━━━━\n`;
        data.slice(0, 5).forEach(row => {
            resultText += `👤 *Name:* ${row.name}\n📞 *Mobile:* ${row.mobile}\n🏠 *Address:* ${row.address}\n━━━━━━━━━━━━━━━━━━\n`;
        });
        resultText += `🛡️ @digiintelbot`;
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, resultText, { parse_mode: 'Markdown' });
    } catch (e) { await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "⚠️ Search failed."); }
});

// --- SEARCH: AADHAR ---
bot.command('aadhar', async (ctx) => {
    const id = ctx.message.text.split(' ')[1];
    if (!id) return ctx.reply("⚠️ *Example:* `/aadhar 123456789012`", { parse_mode: 'Markdown' });
    const user = await db.getUser(ctx.from.id);
    if (user.credits < 1) return ctx.reply("❌ Insufficient credits.");
    const msg = await ctx.reply("⚡ *SCANNING TARGET...* 🔍");
    try {
        const response = await axios.get(`${process.env.API_URL}/search/id/${id}`);
        let data = response.data.results;
        if (data.length === 0) return await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "❌ *No records found.*", { parse_mode: 'Markdown' });
        
        await db.useCredit(ctx.from.id);
        await db.logSearch('aadhar');
        
        let resultText = `⚡ *DIGIINTEL REPORT* ⚡\n━━━━━━━━━━━━━━━━━━\n`;
        data.slice(0, 5).forEach(row => {
            resultText += `👤 *Name:* ${row.name}\n📄 *Aadhar:* ${row.id || row.aadhar}\n🏠 *Address:* ${row.address}\n━━━━━━━━━━━━━━━━━━\n`;
        });
        resultText += `🛡️ @digiintelbot`;
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, resultText, { parse_mode: 'Markdown' });
    } catch (e) { await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "⚠️ Search failed."); }
});

// --- SEARCH: VAHAN (GOOGLE SHIELD) ---
bot.command('vahan', async (ctx) => {
    const regNo = (ctx.message.text.split(' ')[1] || '').toUpperCase().replace(/\s+/g, '');
    if (!regNo) return ctx.reply("⚠️ *Example:* `/vahan GJ01YL8529`", { parse_mode: 'Markdown' });
    const user = await db.getUser(ctx.from.id);
    if (user.credits < 2) return ctx.reply("❌ *Needs 2💳*");
    const msg = await ctx.reply("🛰️ *PULLING SATELLITE DATA...* 🏎️");
    try {
        const proxyUrl = `https://script.google.com/macros/s/AKfycby5xzv0XnJpH2yGXi6MixkeDfr6Lo9v-ua5it3r58b_85bqHEnKQhn8dPTXg5Ap8cChyw/exec?regNo=${regNo}`;
        const response = await axios.get(proxyUrl, { timeout: 20000 });
        const d = response.data.data;
        if (!d || !d.engineNumber) return await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "❌ *Not found or busy.*", { parse_mode: 'Markdown' });

        await db.useCredit(ctx.from.id, 2);
        await db.logSearch('vahan');
        
        const ELITE_DIVIDER = '━━━━━━━━━━━━━━━━━━';
        let report = `⚡ *DIGIINTEL VEHICLE INFO* ⚡\n${ELITE_DIVIDER}\n`;
        report += `🏎️ *Reg No:* \`${regNo}\`\n👤 *Owner:* ${d.ownerName}\n🆔 *Chassis:* \`${d.chassisNumber}\`\n⚙️ *Engine:* \`${d.engineNumber}\`\n🚘 *Model:* ${d.vehicleModel}\n⛽ *Fuel:* ${d.fuelType}\n📅 *Reg Date:* ${d.registrationDate}\n🛡️ *Insurance:* ${d.insuranceExpiryDate || 'N/A'}\n${ELITE_DIVIDER}\n🛡️ @digiintelbot`;
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, report, { parse_mode: 'Markdown' });
    } catch (e) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "⚠️ *Error in link.*", { parse_mode: 'Markdown' });
    }
});

// --- OTHER COMMANDS ---
bot.command('ifsc', async (ctx) => {
    const code = ctx.message.text.split(' ')[1];
    if (!code) return ctx.reply("⚠️ *Example:* `/ifsc SBIN0001234`", { parse_mode: 'Markdown' });
    try {
        const res = await axios.get(`https://ifsc.razorpay.com/${code}`);
        const d = res.data;
        let text = `🏛️ *BANK INFO* 🏛️\n━━━━━━━━━━━━━━━━━━\n🏦 *Bank:* ${d.BANK}\n📍 *Branch:* ${d.BRANCH}\n🏙️ *City:* ${d.CITY}\n━━━━━━━━━━━━━━━━━━\n🛡️ @digiintelbot`;
        ctx.reply(text, { parse_mode: 'Markdown' });
    } catch (e) { ctx.reply("❌ *Invalid IFSC.*"); }
});

bot.command('admin', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const stats = await db.getStats();
    ctx.reply(`👑 *ADMIN STATS*\n\n👥 Users: *${stats.totalUsers}*\n📊 Searches: *${stats.totalSearches}*`, { parse_mode: 'Markdown' });
});

bot.action('check_join', async (ctx) => {
    if (await isMember(ctx)) ctx.reply("✅ Access Granted! Use /start.");
    else ctx.reply("❌ Please join @digiintel first.");
});

// --- VERCEL HANDLER ---
module.exports = async (req, res) => {
    try {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (e) {
        res.status(500).send('Error');
    }
};
