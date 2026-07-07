const { OpenAI } = require('openai');

const DEFAULT_SETTINGS = {
    checkText: true,
    model: 'gemini-3.5-flash',
    strictness: 'normal'
};

function extractVerdict(rawContent) {
    const text = String(rawContent || '').trim();
    if (!text) return null;

    const withoutThink = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const finalToken = withoutThink.match(/\b(ALLOW|REJECT)\b/i);
    if (finalToken) return finalToken[1].toUpperCase();

    const lastToken = text.match(/\b(ALLOW|REJECT)\b(?![\s\S]*\b(ALLOW|REJECT)\b)/i);
    if (lastToken) return lastToken[1].toUpperCase();

    return null;
}

function buildTextPrompt(strictness) {
    const strict = strictness === 'strict';
    const lenient = strictness === 'lenient';

    const base = 'You are a content moderator for "Etnospor Festivali", a public family-friendly wishing event. Only kind, positive content is allowed.';

    const rules = strict
        ? `REJECT if the text contains ANY of the following:
- Profanity, swear words, insults (Turkish or English)
- Sexual content, violence, hate speech
- Hard spam or random characters (e.g. jfkasdjfks, 12345). NOTE: Words like "test", "deneme", "merhaba" are NOT spam, allow them.
- Personal info (phone number, address)
- Negative wishes or curses: wishing harm, failure, death, bankruptcy, illness, or misfortune
- Complaints, anger, frustration, sarcasm, or passive-aggressive negative sentiments
- Anything that is not a positive, kind wish or a harmless name

ALLOW only if:
- A genuine kind, positive wish
- A simple participant name
- Clearly wholesome content`
        : lenient
            ? `REJECT ONLY if the text contains EXPLICIT:
- Obvious profanity or swear words
- Sexual content
- Direct violence threats
- Clear spam

ALLOW everything else including mildly negative comments.`
            : `REJECT if the text contains ANY of the following:
- Profanity, swear words, insults (Turkish or English)
- Sexual content, violence, hate speech
- Hard spam or random characters (e.g. jfkasdjfks). NOTE: Words like "test", "deneme", "selam" are ALLOWED.
- Personal info (phone number, address)
- Negative wishes or curses: wishing harm, failure, death, bankruptcy, illness, or misfortune
- Complaints, anger, or frustration about companies or people

ALLOW only if:
- A genuine kind, positive, or neutral wish
- A simple participant name or harmless word
- Wholesome and appropriate for a public family event`;

    return `${base}\n\n${rules}\n\nReply with ONLY ONE WORD: ALLOW or REJECT`;
}

function uniqueNonEmpty(values) {
    return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

function getModerationProviderConfigs(model) {
    const requestedProvider = String(process.env.AI_MODERATION_PROVIDER || '').trim().toLowerCase();

    const providers = {
        gemini: () => {
            const keys = uniqueNonEmpty([
                process.env.GEMINI_API_KEY_1,
                process.env.GEMINI_API_KEY_2,
                process.env.GEMINI_API_KEY
            ]);
            return keys.map((apiKey, index) => ({
                provider: 'Gemini',
                keySlot: index + 1,
                apiKey,
                baseURL: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
                model: process.env.GEMINI_TEXT_MODEL || model
            }));
        },
        minimax: () => {
            if (!process.env.MINIMAX_API_KEY) return [];
            return [{
                provider: 'MiniMax',
                keySlot: 1,
                apiKey: process.env.MINIMAX_API_KEY,
                baseURL: process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1',
                model: process.env.MINIMAX_TEXT_MODEL || 'MiniMax-M2.7',
                extraBody: { reasoning_split: true }
            }];
        },
        antigravity: () => {
            if (!process.env.ANTIGRAVITY_API_KEY) return [];
            return [{
                provider: 'Antigravity',
                keySlot: 1,
                apiKey: process.env.ANTIGRAVITY_API_KEY,
                baseURL: process.env.ANTIGRAVITY_BASE_URL,
                model: process.env.ANTIGRAVITY_TEXT_MODEL || model
            }];
        }
    };

    if (requestedProvider && requestedProvider !== 'auto') {
        if (providers[requestedProvider]) {
            return providers[requestedProvider]();
        }
        console.warn(`AI_MODERATION_PROVIDER unknown: ${requestedProvider}; using auto selection`);
    }

    return [
        ...providers.gemini(),
        ...providers.minimax(),
        ...providers.antigravity()
    ];
}

async function moderateText(text, settings = {}) {
    const { model, strictness } = { ...DEFAULT_SETTINGS, ...settings };
    const providerConfigs = getModerationProviderConfigs(model);

    if (providerConfigs.length === 0) {
        console.warn('AI moderation API key is missing; moderation skipped');
        return { allowed: true, reason: 'API key eksik - geciriliyor' };
    }

    for (let index = 0; index < providerConfigs.length; index += 1) {
        const providerConfig = providerConfigs[index];
        const client = new OpenAI({
            baseURL: providerConfig.baseURL,
            apiKey: providerConfig.apiKey,
            timeout: 60000
        });

        try {
            const payload = {
                model: providerConfig.model,
                messages: [
                    { role: 'system', content: buildTextPrompt(strictness) },
                    { role: 'user', content: `Moderate this text: "${text}"` }
                ],
                temperature: 0
            };

            if (providerConfig.extraBody) {
                payload.extra_body = providerConfig.extraBody;
            }

            const response = await client.chat.completions.create(payload);
            const raw = response.choices[0].message.content || '';
            const verdict = extractVerdict(raw);

            console.log(`   Metin AI [${providerConfig.provider}:${providerConfig.model}#${providerConfig.keySlot}] (${strictness}): "${raw}"`);

            if (!verdict) {
                console.warn('ALLOW/REJECT could not be parsed from moderation output; fail-open is applied');
                return { allowed: true, reason: 'Belirsiz moderasyon ciktisi - geciriliyor' };
            }

            const allowed = verdict === 'ALLOW';
            return {
                allowed,
                reason: allowed ? 'Icerik uygun' : 'Uygunsuz veya olumsuz icerik tespit edildi'
            };
        } catch (error) {
            const hasFallback = index < providerConfigs.length - 1;
            const message = String(error.message || 'Unknown error');

            if (hasFallback) {
                console.warn(`Moderation API error (${providerConfig.provider}#${providerConfig.keySlot}); trying next key: ${message}`);
                continue;
            }

            console.error(`Moderation API error (${providerConfig.provider}#${providerConfig.keySlot}):`, message);
            return { allowed: true, reason: 'Servis hatasi - geciriliyor' };
        }
    }

    return { allowed: true, reason: 'Servis hatasi - geciriliyor' };
}

async function moderate(name, filePath, settings = {}) {
    const s = { ...DEFAULT_SETTINGS, ...settings };
    console.log(`Moderasyon: "${name}" | model:${s.model} | hassasiyet:${s.strictness} | metin:${s.checkText}`);

    const textResult = s.checkText
        ? await moderateText(name, s)
        : { allowed: true, reason: 'Metin kontrolu kapali' };

    console.log(`Metin: ${textResult.allowed ? 'OK' : 'REJECT'} ${textResult.reason}`);

    if (!textResult.allowed) {
        return { allowed: false, reason: `Isim/metin uygunsuz: ${textResult.reason}` };
    }

    return { allowed: true, reason: 'Icerik onaylandi' };
}

module.exports = { moderate, moderateText };
