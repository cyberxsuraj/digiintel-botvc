const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = 6872301913;

module.exports = async (req, res) => {
    try {
        const bot = new Telegraf(BOT_TOKEN);
        
        // The URL Vercel gives us
        const WEBHOOK_URL = `https://${req.headers.host}/api/bot`;

        // 1. Tell Telegram to send messages here
        await bot.telegram.setWebhook(WEBHOOK_URL);

        // 2. Setup Menus
        await bot.telegram.setMyCommands([
            { command: 'start', description: '🚀 Start DigiIntel' },
            { command: 'num', description: '🔎 Search Mobile Number (1💳)' },
            { command: 'aadhar', description: '🆔 Search Aadhar ID (1💳)' },
            { command: 'email', description: '📧 Search Email Address (1💳)' },
            { command: 'ifsc', description: '🏦 Bank/IFSC Search (FREE)' },
            { command: 'refer', description: '🔗 Invite & Earn' },
            { command: 'credits', description: '💰 Check Balance' },
            { command: 'help', description: '📖 View Help & Pricing' }
        ]);

        await bot.telegram.setMyCommands([
            { command: 'start', description: '🚀 Start DigiIntel' },
            { command: 'num', description: '🔎 Search Mobile Number (1💳)' },
            { command: 'aadhar', description: '🆔 Search Aadhar ID (1💳)' },
            { command: 'email', description: '📧 Search Email Address (1💳)' },
            { command: 'ifsc', description: '🏦 Bank/IFSC Search (FREE)' },
            { command: 'refer', description: '🔗 Invite & Earn' },
            { command: 'credits', description: '💰 Check Balance' },
            { command: 'help', description: '📖 View Help & Pricing' },
            { command: 'admin', description: '👑 Admin Control Panel' },
            { command: 'add', description: '➕ Give Credits' },
            { command: 'broadcast', description: '📢 Message All Users' }
        ], { scope: { type: 'chat', chat_id: ADMIN_ID } });

        res.status(200).send(`✅ SUCCESS! Webhook is set to: ${WEBHOOK_URL}. Menus are configured.`);
    } catch (e) {
        console.error(e);
        res.status(500).send(`❌ ERROR: ${e.message}`);
    }
};
