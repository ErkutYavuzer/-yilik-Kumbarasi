const { OpenAI } = require('openai');
// Default ayarlar
const DEFAULT_SETTINGS = {
    checkText: true,
    model: 'gemini-3-flash',
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

    const base = `You are a content moderator for "Iyilik Kumbarasi" (Kindness Jar), a children's wishing event. Only kind, positive content is allowed.`;

    const rules = strict
        ? `REJECT if the text contains ANY of the following:
- Profanity, swear words, insults (Turkish or English)
- Sexual content, violence, hate speech
- Hard spam or purely random characters (e.g. jfkasdjfks, 12345). NOTE: Words like 'test', 'deneme', 'merhaba' are NOT spam, allow them.
- Personal info (phone number, address)
- NEGATIVE WISHES or CURSES: "may X fail/die/suffer/go bankrupt", "I hate X", anything wishing harm or misfortune
- Complaints, anger, frustration about companies, people, or situations
- Sarcasm or passive-aggressive negative sentiments
- Anything that is NOT a positive, kind wish or a child's name

ALLOW only if:
- A genuine kind, positive wish (e.g. "herkese saglik", "dunyada baris olsun")
- A simple child name
- Clearly wholesome content`
        : lenient
            ? `REJECT ONLY if the text contains EXPLICIT:
- Obvious profanity or swear words
- Sexual content
- Direct violence threats
- Clear spam (aaaa, 1234...)

ALLOW everything else including mildly negative comments or complaints.`
            : `REJECT if the text contains ANY of the following:
- Profanity, swear words, insults (Turkish or English)
- Sexual content, violence, hate speech
- Hard spam or purely random characters (e.g. jfkasdjfks). NOTE: Words like 'test', 'deneme', 'selam' are ALLOWED.
- Personal info (phone number, address)
- NEGATIVE WISHES or CURSES: "may X fail/die/suffer/go bankrupt", "I hate X", anything wishing harm or misfortune on anyone/anything (e.g. "Turk Telekom iflas etsin", "ogretmenim berbat")
- Complaints, anger, or frustration about companies or people

ALLOW only if:
- A genuine kind, positive, or neutral wish
- A simple child name or harmless word
- Wholesome and appropriate for a public children's event`;

    return `${base}\n\n${rules}\n\nReply with ONLY ONE WORD: ALLOW or REJECT`;
}

/**
 * Metni moderasyondan geçirir
 * @param {string} text
 * @param {object} settings
 */
async function moderateText(text, settings = {}) {
    const { model, strictness } = { ...DEFAULT_SETTINGS, ...settings };
    const useMiniMax = !!process.env.MINIMAX_API_KEY;
    const apiKey = useMiniMax ? process.env.MINIMAX_API_KEY : process.env.ANTIGRAVITY_API_KEY;
    const baseURL = useMiniMax ? (process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1') : process.env.ANTIGRAVITY_BASE_URL;
    const activeModel = useMiniMax ? (process.env.MINIMAX_TEXT_MODEL || 'MiniMax-M2.7') : model;

    if (!apiKey) {
        console.warn(`⚠️ ${useMiniMax ? 'MINIMAX_API_KEY' : 'ANTIGRAVITY_API_KEY'} tanımlanmamış — moderasyon atlanıyor`);
        return { allowed: true, reason: 'API key eksik — geçiriliyor' };
    }

    const client = new OpenAI({
        baseURL,
        apiKey,
        timeout: 60000,
    });

    try {
        const payload = {
            model: activeModel,
            messages: [
                { role: 'system', content: buildTextPrompt(strictness) },
                { role: 'user', content: `Moderate this text: "${text}"` }
            ],
            temperature: 0,
        };

        if (useMiniMax) {
            payload.extra_body = { reasoning_split: true };
        }

        const response = await client.chat.completions.create(payload);

        const raw = response.choices[0].message.content || '';
        const verdict = extractVerdict(raw);
        console.log(`   📝 Metin AI [${useMiniMax ? 'MiniMax-M2.7' : activeModel}] (${strictness}): "${raw}"`);

        if (!verdict) {
            console.warn('⚠️ Moderasyon çıktısından ALLOW/REJECT ayıklanamadı, fail-open uygulanıyor');
            return { allowed: true, reason: 'Belirsiz moderasyon çıktısı - geçiriliyor' };
        }

        const allowed = verdict === 'ALLOW';
        return { allowed, reason: allowed ? 'İçerik uygun' : 'Uygunsuz veya olumsuz içerik tespit edildi' };

    } catch (error) {
        console.error('⚠️ Moderasyon API hatası:', error.message);
        return { allowed: true, reason: 'Servis hatası - geçiriliyor' };
    }
}

/**
 * Ana moderasyon fonksiyonu
 * @param {string} name
 * @param {string} filePath
 * @param {object} settings
 */
async function moderate(name, filePath, settings = {}) {
    const s = { ...DEFAULT_SETTINGS, ...settings };
    console.log(`🔍 Moderasyon: "${name}" | model:${s.model} | hassasiyet:${s.strictness} | metin:${s.checkText}`);

    const textResult = s.checkText
        ? await moderateText(name, s)
        : { allowed: true, reason: 'Metin kontrolü kapalı' };

    console.log(`📝 Metin: ${textResult.allowed ? '✅' : '❌'} ${textResult.reason}`);

    if (!textResult.allowed) return { allowed: false, reason: `İsim/metin uygunsuz: ${textResult.reason}` };

    return { allowed: true, reason: 'İçerik onaylandı' };
}

module.exports = { moderate, moderateText };
