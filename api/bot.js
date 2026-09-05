const { supabase } = require('./helper/db');
const axios = require('axios');
const { checkRateLimit } = require('./helper/rateLimit');

const API_URL = process.env.API_URL;

const SECURITY_HEADERS = {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
};

// Validation patterns
const MOBILE_REGEX = /^[6-9]\d{9}$/;         // Indian mobile: 10 digits, starts 6-9
const AADHAR_REGEX = /^\d{12}$/;              // Aadhar: exactly 12 digits
const IFSC_REGEX   = /^[A-Z]{4}0[A-Z0-9]{6}$/; // IFSC: 4 alpha + 0 + 6 alphanumeric
const EMAIL_REGEX  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Standard email validation

// Blacklist: protected numbers — silently return empty results
const BLACKLIST = ['9749727847', '9091592660'];

exports.handler = async (event, context) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: SECURITY_HEADERS, body: '' };
    }

    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: SECURITY_HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // 1. Authenticate User Session Token
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { statusCode: 401, headers: SECURITY_HEADERS, body: JSON.stringify({ error: 'Unauthorized.' }) };
    }

    const token = authHeader.split(' ')[1];

    let user;
    try {
        const { data, error: authError } = await supabase.auth.getUser(token);
        if (authError || !data.user) {
            return { statusCode: 401, headers: SECURITY_HEADERS, body: JSON.stringify({ error: 'Unauthorized. Invalid session.' }) };
        }
        user = data.user;
    } catch (e) {
        return { statusCode: 401, headers: SECURITY_HEADERS, body: JSON.stringify({ error: 'Unauthorized.' }) };
    }

    // Rate limit: 60 requests/min per user
    const rateOk = checkRateLimit(`search:${user.id}`, 60, 60);
    if (!rateOk) {
        return {
            statusCode: 429,
            headers: { ...SECURITY_HEADERS, 'Retry-After': '60' },
            body: JSON.stringify({ error: 'Search rate limit reached. Please wait 1 minute.' })
        };
    }

    try {
        // 2. Check Credit Balance
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('credits')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            return { statusCode: 400, headers: SECURITY_HEADERS, body: JSON.stringify({ error: 'User profile not found.' }) };
        }

        // 3. Extract & Validate Search Query
        const params = event.queryStringParameters || {};
        let searchType = '';
        let queryVal = '';

        if (params.mobile) {
            searchType = 'mobile';
            queryVal = params.mobile.trim().replace(/\D/g, ''); // strip spaces/dashes
        } else if (params.id) {
            searchType = 'id';
            queryVal = params.id.trim().replace(/\D/g, '');
        } else if (params.email) {
            searchType = 'email';
            queryVal = params.email.trim().toLowerCase();
        } else if (params.ifsc) {
            searchType = 'ifsc';
            queryVal = params.ifsc.trim().toUpperCase().replace(/\s/g, '');
        }

        if (!searchType || !queryVal) {
            return { statusCode: 400, headers: SECURITY_HEADERS, body: JSON.stringify({ error: 'A valid search query is required.' }) };
        }

        // 4. Server-side format validation
        if (searchType === 'mobile' && !MOBILE_REGEX.test(queryVal)) {
            return { statusCode: 400, headers: SECURITY_HEADERS, body: JSON.stringify({ error: 'Invalid mobile number. Must be a 10-digit Indian mobile number starting with 6–9.' }) };
        }
        if (searchType === 'id' && !AADHAR_REGEX.test(queryVal)) {
            return { statusCode: 400, headers: SECURITY_HEADERS, body: JSON.stringify({ error: 'Invalid Aadhar/ID. Must be exactly 12 digits.' }) };
        }
        if (searchType === 'email' && !EMAIL_REGEX.test(queryVal)) {
            return { statusCode: 400, headers: SECURITY_HEADERS, body: JSON.stringify({ error: 'Invalid email address format. Example: user@gmail.com' }) };
        }
        if (searchType === 'ifsc' && !IFSC_REGEX.test(queryVal)) {
            return { statusCode: 400, headers: SECURITY_HEADERS, body: JSON.stringify({ error: 'Invalid IFSC code format. Must be 11 characters (e.g. SBIN0001234).' }) };
        }

        // 5. Blacklist check
        if (searchType === 'mobile' && BLACKLIST.includes(queryVal)) {
            return {
                statusCode: 200,
                headers: SECURITY_HEADERS,
                body: JSON.stringify({ success: true, data: [], credits: profile.credits, pagination: { total: 0, page: 1, totalPages: 0 } })
            };
        }

        // 6. Verify Credits for Paid Search Types
        if (searchType !== 'ifsc' && profile.credits < 1) {
            return { statusCode: 402, headers: SECURITY_HEADERS, body: JSON.stringify({ error: 'Insufficient credits. Contact admin to top up.' }) };
        }

        // 7. Execute Search
        if (searchType === 'ifsc') {
            try {
                const response = await axios.get(`https://ifsc.razorpay.com/${encodeURIComponent(queryVal)}`, { timeout: 8000 });
                return {
                    statusCode: 200,
                    headers: SECURITY_HEADERS,
                    body: JSON.stringify({
                        success: true,
                        data: [response.data],
                        credits: profile.credits,
                        pagination: { total: 1, page: 1, totalPages: 1 }
                    })
                };
            } catch (ifscErr) {
                if (ifscErr.response && ifscErr.response.status === 404) {
                    return { statusCode: 404, headers: SECURITY_HEADERS, body: JSON.stringify({ error: 'IFSC Code not found in banking records.' }) };
                }
                return { statusCode: 502, headers: SECURITY_HEADERS, body: JSON.stringify({ error: 'Bank lookup service is currently unavailable. Try again later.' }) };
            }
        } else {
            let searchResponse;
            try {
                const endpointMap = { mobile: 'nice', id: 'ask', email: 'gm' };
                const targetPath = endpointMap[searchType] || searchType;
                const cleanApiUrl = (API_URL || '').replace(/\/+$/, '');
                searchResponse = await axios.get(`${cleanApiUrl}/search/${targetPath}/${encodeURIComponent(queryVal)}`, { timeout: 25000 });
            } catch (apiErr) {
                console.error("Web search API error:", apiErr.message);
                return { statusCode: 503, headers: SECURITY_HEADERS, body: JSON.stringify({ error: 'Service is momentarily busy. Please try again in a few moments.' }) };
            }

            const results = (searchResponse.data && searchResponse.data.results) ? searchResponse.data.results : [];
            const count = (searchResponse.data && searchResponse.data.count) ? searchResponse.data.count : results.length;

            if (results.length > 0) {
                const newCredits = Math.max(0, profile.credits - 1);
                await supabase.from('profiles').update({ credits: newCredits }).eq('id', user.id);

                return {
                    statusCode: 200,
                    headers: { ...SECURITY_HEADERS, 'Cache-Control': 'public, max-age=600' },
                    body: JSON.stringify({
                        success: true,
                        data: results,
                        credits: newCredits,
                        pagination: { total: count, page: 1, totalPages: 1 }
                    })
                };
            } else {
                return {
                    statusCode: 200,
                    headers: SECURITY_HEADERS,
                    body: JSON.stringify({
                        success: true,
                        data: [],
                        credits: profile.credits,
                        pagination: { total: 0, page: 1, totalPages: 0 }
                    })
                };
            }
        }

    } catch (err) {
        console.error('Search handler error');
        return { statusCode: 500, headers: SECURITY_HEADERS, body: JSON.stringify({ error: 'Internal Server Error.' }) };
    }
};
