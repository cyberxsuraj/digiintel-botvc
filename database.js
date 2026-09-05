const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY;

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
                return newUser;
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
    }
};

module.exports = dbOps;
