const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxxqnuibvtrcvlqjsctc.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4eHFudWlidnRyY3ZscWpzY3RjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjExNzg4MiwiZXhwIjoyMDk3NjkzODgyfQ.99e2NEKjMjNnS1siCOI4daKNNgb66vwZgXb5SiZQv7c';

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
            const { data: cfg } = await supabase
                .from('api_keys')
                .select('*')
                .eq('key', 'system_free_mode_config')
                .single();
            if (cfg && cfg.is_active && new Date() < new Date(cfg.expires_at)) {
                return {
                    active: true,
                    expiresAt: cfg.expires_at,
                    totalSearches: cfg.total_searches || 0
                };
            }
        } catch(e) {}
        return { active: false, totalSearches: 0 };
    },

    // Record a free search
    recordFreeSearch: async () => {
        try {
            const { data: f } = await supabase.from('api_keys').select('total_searches').eq('key', 'system_free_mode_config').single();
            if (f) {
                await supabase.from('api_keys').update({ 
                    total_searches: (f.total_searches || 0) + 1,
                    last_used_at: new Date().toISOString()
                }).eq('key', 'system_free_mode_config');
            }
        } catch(e) {}
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
            const { data, error } = await supabase
                .from('api_keys')
                .update({
                    is_active: !!enabled,
                    expires_at: expiresAt.toISOString(),
                    client_name: enabled ? `Free Mode Active (${minutes > 0 ? minutes + 'm' : 'Unlimited'})` : 'Free Mode Disabled'
                })
                .eq('key', 'system_free_mode_config')
                .select();

            if (error) {
                console.error("setFreeMode error:", error.message);
                return { success: false, error: error.message };
            }
            const row = (data && data.length > 0) ? data[0] : null;
            return { success: true, expiresAt: expiresAt.toISOString(), totalSearches: row?.total_searches || 0 };
        } catch(e) {
            console.error("setFreeMode exception:", e.message);
            return { success: false, error: e.message };
        }
    }
};

module.exports = dbOps;
