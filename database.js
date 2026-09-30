const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        persistSession: false
    }
});

const dbOps = {
    // Get user or create if not exists
    getUser: async (userId, username) => {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (!data) {
                const { data: newUser, error: insertError } = await supabase
                    .from('users')
                    .insert([{ user_id: userId, username: username || 'Unknown', credits: 0, referral_count: 0 }])
                    .select()
                    .single();
                if (insertError) {
                    console.error("getUser insertError:", insertError.message);
                }
                return newUser || { user_id: userId, username: username || 'Unknown', credits: 0, referral_count: 0 };
            }
            return data;
        } catch (err) {
            console.error("getUser error:", err.message);
            return { user_id: userId, username: username || 'Unknown', credits: 0, referral_count: 0 };
        }
    },

    // Deduct credits (default 1) with RPC and direct update fallback
    useCredit: async (userId, amount = 1) => {
        try {
            const { data, error } = await supabase.rpc('deduct_credit_v2', { 
                target_user_id: userId, 
                deduct_amount: amount 
            });
            if (!error && data !== null && data !== undefined) return data;
        } catch (rpcErr) {
            // Silently proceed to direct fallback
        }

        try {
            const { data: user } = await supabase.from('users').select('credits').eq('user_id', userId).single();
            if (user && user.credits > 0) {
                const newCredits = Math.max(0, user.credits - amount);
                await supabase.from('users').update({ credits: newCredits }).eq('user_id', userId);
                return newCredits;
            }
        } catch (fallbackErr) {
            console.error("Direct credit fallback failed:", fallbackErr.message);
        }
        return null;
    },

    // Admin: Add credits
    addCredits: async (userId, amount) => {
        try {
            await supabase.rpc('add_credits', { target_user_id: userId, amount: amount });
        } catch (e) {
            try {
                const { data: user } = await supabase.from('users').select('credits').eq('user_id', userId).single();
                if (user) {
                    await supabase.from('users').update({ credits: (user.credits || 0) + amount }).eq('user_id', userId);
                }
            } catch (err) {}
        }
    },

    // Get stats
    getStats: async () => {
        const { count: userCount } = await supabase.from('users').select('*', { count: 'exact', head: true });
        const { count: searchCount } = await supabase.from('stats').select('*', { count: 'exact', head: true });
        return { totalUsers: userCount, totalSearches: searchCount };
    },

    // Log search
    logSearch: async (type) => {
        await supabase.from('stats').insert([{ search_type: type }]);
    },

    // Handle referral
    addReferral: async (newUserId, inviterId) => {
        // Check if inviter exists
        const { data: inviter } = await supabase.from('users').select('*').eq('user_id', inviterId).single();

        if (inviter) {
            const newCount = inviter.referral_count + 1;
            if (newCount >= 5) {
                // Reward 1 credit and reset count
                await supabase.from('users').update({ referral_count: 0, credits: inviter.credits + 1 }).eq('user_id', inviterId);
                return { reward: true };
            } else {
                // Just update count
                await supabase.from('users').update({ referral_count: newCount }).eq('user_id', inviterId);
                return { reward: false, count: newCount };
            }
        }
        return null;
    },

    // Get all users for broadcast
    getAllUsers: async () => {
        const { data } = await supabase.from('users').select('user_id');
        return data || [];
    },

    // Check if system-wide Free Search Mode (Happy Hours) is currently active
    checkFreeMode: async () => {
        try {
            const { data } = await supabase
                .from('users')
                .select('*')
                .eq('user_id', 'system_free_mode')
                .maybeSingle();

            if (data && data.username) {
                try {
                    const cfg = JSON.parse(data.username);
                    if (cfg.active && (!cfg.expires_at || new Date() < new Date(cfg.expires_at))) {
                        return { active: true, expiresAt: cfg.expires_at, totalSearches: data.credits || 0 };
                    }
                    return { active: false, totalSearches: data.credits || 0 };
                } catch(pe) {}
            }
        } catch(e) {
            console.error("checkFreeMode error:", e.message);
        }
        return { active: false, totalSearches: 0 };
    },

    // Record a free search
    recordFreeSearch: async () => {
        try {
            const { data } = await supabase
                .from('users')
                .select('credits')
                .eq('user_id', 'system_free_mode')
                .maybeSingle();

            if (data) {
                await supabase.from('users').update({ 
                    credits: (data.credits || 0) + 1 
                }).eq('user_id', 'system_free_mode');
            } else {
                await supabase.from('users').insert([{
                    user_id: 'system_free_mode',
                    username: JSON.stringify({ active: true, expires_at: null }),
                    credits: 1,
                    referral_count: 0
                }]);
            }
        } catch(e) {
            console.error("recordFreeSearch error:", e.message);
        }
    },

    // Set free mode status (Admin command)
    setFreeMode: async (enabled, minutes = 0) => {
        try {
            const now = new Date();
            let expiresAt = new Date('2099-12-31T23:59:59.000Z');
            if (enabled && minutes > 0) {
                expiresAt = new Date(now.getTime() + minutes * 60 * 1000);
            } else if (!enabled) {
                expiresAt = new Date('2000-01-01T00:00:00.000Z');
            }

            const cfgString = JSON.stringify({
                active: !!enabled,
                expires_at: expiresAt.toISOString(),
                duration_minutes: minutes
            });

            const { data: existing } = await supabase
                .from('users')
                .select('*')
                .eq('user_id', 'system_free_mode')
                .maybeSingle();

            let total = 0;
            if (existing) {
                total = existing.credits || 0;
                await supabase.from('users').update({
                    username: cfgString
                }).eq('user_id', 'system_free_mode');
            } else {
                await supabase.from('users').insert([{
                    user_id: 'system_free_mode',
                    username: cfgString,
                    credits: 0,
                    referral_count: 0
                }]);
            }

            // Sync to Web Supabase instance asynchronously
            try {
                const WEB_SUPABASE_URL = 'https://fxxqnuibvtrcvlqjsctc.supabase.co';
                const WEB_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4eHFudWlidnRyY3ZscWpzY3RjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjExNzg4MiwiZXhwIjoyMDk3NjkzODgyfQ.99e2NEKjMjNnS1siCOI4daKNNgb66vwZgXb5SiZQv7c';
                fetch(`${WEB_SUPABASE_URL}/rest/v1/api_keys?key=eq.system_free_mode_config`, {
                    method: 'PATCH',
                    headers: {
                        'apikey': WEB_SUPABASE_KEY,
                        'Authorization': `Bearer ${WEB_SUPABASE_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        is_active: !!enabled,
                        expires_at: expiresAt.toISOString(),
                        client_name: enabled ? `Free Mode Active (${minutes > 0 ? minutes + 'm' : 'Unlimited'})` : 'Free Mode Disabled'
                    })
                }).catch(() => {});
            } catch(webe) {}

            return { success: true, expiresAt: expiresAt.toISOString(), totalSearches: total };
        } catch(e) {
            console.error("setFreeMode exception:", e.message);
            return { success: false, error: e.message };
        }
    }
};

module.exports = dbOps;
