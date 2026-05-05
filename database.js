const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        persistSession: false
    }
});

const dbOps = {
    // Get user or create if not exists
    getUser: async (userId, username) => {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (!data) {
            const { data: newUser, error: insertError } = await supabase
                .from('users')
                .insert([{ user_id: userId, username: username || 'Unknown' }])
                .select()
                .single();
            return newUser;
        }
        return data;
    },

    // Deduct 1 credit
    useCredit: async (userId) => {
        const { data, error } = await supabase.rpc('deduct_credit', { target_user_id: userId });
        return data;
    },

    // Admin: Add credits
    addCredits: async (userId, amount) => {
        const { error } = await supabase.rpc('add_credits', { target_user_id: userId, amount: amount });
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
