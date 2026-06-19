import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    Browsers,
    fetchLatestBaileysVersion,
    getContentType,
    downloadMediaMessage
} from '@whiskeysockets/baileys';
import pino from 'pino';
import express from 'express';
import 'dotenv/config';
import axios from 'axios';
import yts from 'yt-search';
import { Buffer } from 'buffer';

process.on('unhandledRejection', (reason) => {
    console.log('\x1b[31mUnhandled Rejection:\x1b[0m', reason);
});

const app = express();
app.get('/', (req, res) => res.json({ status: 'BoNGo AI is active' }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server bound to port ${PORT}`));

import fs from 'fs';
import path from 'path';

const defaultConfig = {
    prefix: process.env.PREFIX || ".",
    botName: process.env.BOT_NAME || "BoNGo AI",
    ownerNumber: process.env.OWNER_NUMBER || "255780470905"
};

const defaultMenus = {
    all: { title: "🤖 BoNGo AI MENU", sections: [] },
    owner: { title: "👑 OWNER MENU", commands: [] },
    admin: { title: "🛡️ ADMIN MENU", commands: [] },
    group: { title: "👥 GROUP MENU", commands: [] },
    games: { title: "🎮 GAMES MENU", commands: [] }
};

const defaultGames = {};
const defaultMemory = { users: {}, chats: {} };

function initJSON(file, defaults) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(defaults, null, 2));
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

let botConfig = initJSON('./config.json', defaultConfig);
let menusData = initJSON('./menus.json', defaultMenus);
let gamesData = initJSON('./games.json', defaultGames);
let memoryData = initJSON('./memory.json', defaultMemory);

function saveJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function saveConfig() { saveJSON('./config.json', botConfig); }
function saveGames() { saveJSON('./games.json', gamesData); }
function saveMemory() { saveJSON('./memory.json', memoryData); }
function saveMenus() { saveJSON('./menus.json', menusData); }

const defaultAntidelete = {
    enabled: true,
    mode: "public",
    publicTarget: null,
    privateTarget: botConfig.ownerNumber + '@s.whatsapp.net',
    logEdits: true,
    logViewOnce: true,
    cache: {}
};

let antideleteConfig = initJSON('./antidelete.json', defaultAntidelete);
function saveAntidelete() { saveJSON('./antidelete.json', antideleteConfig); }

const defaultConverters = {
    supported: ["sticker","video","audio","image","text","gif","mp3","mp4","webp","png","jpg","pdf","voice"],
    usage: {}
};

let convertersData = initJSON('./converters.json', defaultConverters);
function saveConverters() { saveJSON('./converters.json', convertersData); }

import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

async function convertMedia(buffer, inputType, outputType, context) {
    const id = Date.now();
    const inputPath = join(tmpdir(), `in_${id}.${inputType}`);
    const outputPath = join(tmpdir(), `out_${id}.${outputType}`);
    
    await writeFile(inputPath, buffer);
    
    let cmd = '';
    if (inputType === 'webp' && outputType === 'png') cmd = `ffmpeg -i ${inputPath} ${outputPath}`;
    else if (['jpg','jpeg','png'].includes(inputType) && outputType === 'webp') cmd = `ffmpeg -i ${inputPath} -vcodec libwebp -filter:v fps=fps=15 -lossless 1 -loop 0 -preset default -an -vsync 0 -s 512:512 ${outputPath}`;
    else if (inputType === 'mp4' && outputType === 'mp3') cmd = `ffmpeg -i ${inputPath} -vn -ab 128k -ar 44100 -y ${outputPath}`;
    else if (inputType === 'mp4' && outputType === 'gif') cmd = `ffmpeg -i ${inputPath} -vf "fps=10,scale=320:-1:flags=lanczos" -c:v gif ${outputPath}`;
    else if (outputType === 'mp3') cmd = `ffmpeg -i ${inputPath} -vn -ab 128k -ar 44100 -y ${outputPath}`;
    else if (outputType === 'mp4') cmd = `ffmpeg -i ${inputPath} -c:v libx264 -preset fast -crf 22 -c:a aac ${outputPath}`;
    else if (['png','jpg','webp'].includes(outputType)) cmd = `ffmpeg -i ${inputPath} ${outputPath}`;
    else throw new Error(`Conversion ${inputType} to ${outputType} not supported`);
    
    await execAsync(cmd);
    const outputBuffer = fs.readFileSync(outputPath);
    await unlink(inputPath).catch(()=>{});
    await unlink(outputPath).catch(()=>{});
    return outputBuffer;
}

function getMediaType(msg) {
    const type = getContentType(msg.message);
    if (type === 'imageMessage') return 'jpg';
    if (type === 'videoMessage') return 'mp4';
    if (type === 'audioMessage') return 'mp3';
    if (type === 'stickerMessage') return 'webp';
    if (type === 'documentMessage') return msg.message.documentMessage.fileName.split('.').pop();
    return null;
}

const allConverterActions = ['tosticker','toimage','tovideo','toaudio','tomp3','tomp4','togif','towebp','topng','tojpg','tovoice','totext'];
allConverterActions.forEach(cmd => registerCommand(cmd, 'media'));

function addMemory(userId, key, value) {
    if (!memoryData.users[userId]) memoryData.users[userId] = { commands: [], games: {}, prefs: {} };
    if (key === 'command') {
        memoryData.users[userId].commands.unshift(value);
        memoryData.users[userId].commands = memoryData.users[userId].commands.slice(0, 20);
    } else {
        memoryData.users[userId][key] = value;
    }
    memoryData.users[userId].lastSeen = Date.now();
    saveMemory();
}

function getMemory(userId) {
    return memoryData.users[userId] || { commands: [], games: {}, prefs: {} };
}

function registerCommand(cmd, category = 'all') {
    if (!menusData.all.sections.length) menusData.all.sections = [
        {name: "OWNER", commands: []}, {name: "ADMIN", commands: []},
        {name: "GROUP", commands: []}, {name: "GAMES", commands: []},
        {name: "MEDIA", commands: []}, {name: "UTILS", commands: []}
    ];
    const cat = category.toUpperCase();
    const section = menusData.all.sections.find(s => s.name === cat);
    if (section && !section.commands.includes(cmd)) section.commands.push(cmd);
    if (menusData[category] && !menusData[category].commands.includes(cmd)) menusData[category].commands.push(cmd);
    saveMenus();
}

function generateMenu(menuType, prefix) {
    const menu = menusData[menuType] || menusData.all;
    let text = `┌─── ${menu.title} ───┐
`;
    if (menu.sections) {
        menu.sections.forEach(sec => {
            if (sec.commands.length) {
                text += `│
│ 📂 *${sec.name}*
`;
                sec.commands.forEach(cmd => text += `│ • ${prefix}${cmd}
`);
            }
        });
    } else if (menu.commands?.length) {
        text += `│
`;
        menu.commands.forEach(cmd => text += `│ • ${prefix}${cmd}
`);
    } else {
        text += `│
│ No commands yet
`;
    }
    text += `│
└────────────────────┘

_Prefix: ${prefix}_`;
    return text;
}

// Auto register all existing actions on startup
const allActions = ['kickUser','addUser','promoteUser','demoteUser','setGroupSubject','setGroupDesc','setProfilePicture','muteGroup','unmuteGroup','getGroupInfo','getGroupLink','revokeGroupLink','leaveGroup','tagAll','hideTag','downloadSong','downloadVideo','getProfilePic','deleteMessage','setStatus','changePrefix','changeBotName','ttt','rps','dice','coinflip','guess','guessplay','math','mathans','slots','menu','ownermenu','adminmenu','groupmenu','gamesmenu'];
allActions.forEach(cmd => {
    let cat = 'utils';
    if (['changePrefix','changeBotName','setStatus','broadcast','restart','leaveGroup'].includes(cmd)) cat = 'owner';
    if (['kickUser','addUser','promoteUser','demoteUser','muteGroup','unmuteGroup','tagAll','hideTag','warnUser'].includes(cmd)) cat = 'admin';
    if (['setGroupSubject','setGroupDesc','setProfilePicture','getGroupInfo','getGroupLink','revokeGroupLink','setWelcome','setGoodbye'].includes(cmd)) cat = 'group';
    if (['ttt','rps','dice','coinflip','guess','guessplay','math','mathans','slots'].includes(cmd)) cat = 'games';
    if (['downloadSong','downloadVideo','getProfilePic','sticker'].includes(cmd)) cat = 'media';
    registerCommand(cmd, cat);
});

['antidelete','antiedit','antiviewonce'].forEach(cmd => registerCommand(cmd, 'owner'));

const userMemory = new Map();
const groupConfig = new Map();
const messageStore = new Map();


function convertBuffers(obj) {
    if (!obj) return obj;
    if (obj?.type === 'Buffer' && Array.isArray(obj.data)) return Buffer.from(obj.data);
    if (Array.isArray(obj)) return obj.map(convertBuffers);
    if (typeof obj === 'object') {
        for (const key in obj) obj[key] = convertBuffers(obj[key]);
        return obj;
    }
    return obj;
}

function getMessageText(msg) {
    if (!msg.message) return '';
    const type = getContentType(msg.message);
    if (type === 'conversation') return msg.message.conversation;
    if (type === 'extendedTextMessage') return msg.message.extendedTextMessage?.text;
    if (type === 'imageMessage') return msg.message.imageMessage?.caption;
    if (type === 'videoMessage') return msg.message.videoMessage?.caption;
    return '';
}

import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// DYNAMIC CASE LOADER - ZERO HARDCODE
const cases = new Map();
const casesDir = path.join(__dirname, 'cases');

function loadCases() {
    if (!fs.existsSync(casesDir)) fs.mkdirSync(casesDir, { recursive: true });
    const categories = fs.readdirSync(casesDir);
    categories.forEach(cat => {
        const catPath = path.join(casesDir, cat);
        if (fs.statSync(catPath).isDirectory()) {
            fs.readdirSync(catPath).forEach(file => {
                if (file.endsWith('.case.js')) {
                    const action = file.replace('.case.js', '');
                    cases.set(action, path.join(catPath, file));
                }
            });
        }
    });
    console.log(`\x1b[32mCASES_LOADED:\x1b[0m ${cases.size} actions from ${categories.length} categories`);
}
loadCases();

// MULTI-KEY SYSTEM - GROQ per model, GEMINI rotation
function loadAPIKeys() {
    const groq = {};
    const gemini = [];
    Object.keys(process.env).forEach(k => {
        if (k.startsWith('GROQ_') && process.env[k]) {
            const model = k.replace('GROQ_', '').toLowerCase().replace(/_/g, '-');
            groq[model] = process.env[k];
        }
        if (k.startsWith('GEMINI_') && process.env[k]) gemini.push(process.env[k]);
    });
    if (Object.keys(groq).length === 0) console.log('\x1b[31mWARNING:\x1b[0m No GROQ keys found');
    if (gemini.length === 0) console.log('\x1b[31mWARNING:\x1b[0m No GEMINI keys found');
    return { groq, gemini };
}
const API_KEYS = loadAPIKeys();

// KEY ROTATION STATE
const rotation = { groq: {}, geminiIndex: 0 };

function getGroqKey(model) {
    const keys = Object.entries(API_KEYS.groq);
    if (!keys.length) return null;
    rotation.groq[model] = (rotation.groq[model] || 0) % keys.length;
    const [modelName, key] = keys[rotation.groq[model]];
    rotation.groq[model]++;
    return { key, modelName };
}

function getGeminiKey() {
    if (!API_KEYS.gemini.length) return null;
    const key = API_KEYS.gemini[rotation.geminiIndex];
    rotation.geminiIndex = (rotation.geminiIndex + 1) % API_KEYS.gemini.length;
    return key;
}

// AXIOS-ONLY AI CALLS - NO SDK
async function callGroqAxios(model, messages, apiKey) {
    const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model, messages, temperature: 0.7, max_tokens: 800, response_format: { type: "json_object" }
    }, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 20000
    });
    return JSON.parse(res.data.choices[0].message.content);
}

async function callGeminiAxios(prompt, apiKey) {
    const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 800 }
    }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 20000
    });
    return JSON.parse(res.data.candidates[0].content.parts[0].text);
}

// UNIVERSAL AI ROUTER - DECIDES EVERYTHING
async function callAI(contextMsg) {
    const systemPrompt = `You are ${botConfig.botName}, a fully autonomous WhatsApp AI. Return ONLY valid JSON: {"action":"string","target":"string","params":{},"reply":"string","react":"string"}.

AVAILABLE ACTIONS: ${Array.from(cases.keys()).join(', ')}, chat

CORE RULES:
1. Analyze user intent from text, quoted message, mentions, media, message type.
2. Select exact action from available list. If no match use "chat".
3. For user targets, ALWAYS return JID format: 255xxx@s.whatsapp.net or 120363xxx@g.us
4. Extract JID from: contextMsg.quotedSender, contextMsg.mentionedJids[0], or number in text.
5. If user says "ping" or "speed" return action:"ping", react:"⚡".
6. If user says "owa kaka embu tuma dp yangu" return action:"getProfilePic", target:contextMsg.sender, react:"🖼️".
7. If user says "menu" or "help" return action:"menu", react:"📋".
8. If user replies to image with "sticker" return action:"tosticker".
9. If user says "delete" and quoted message exists return action:"deleteMessage".
10. If user tags everyone return action:"tagall".
11. If user says "make me admin" return action:"promoteUser" with target as sender JID.
12. Everything is AI-driven. No assumptions. No hardcoded logic.
13. If user sends or replies to TikTok link return action:"tiktok", react:"⏬".
14. If user sends or replies to Facebook video link return action:"facebook", react:"⏬".
15. If user sends or replies to Instagram reel/post link return action:"instagram", react:"⏬".

PERMISSION CONTEXT:
isOwner: ${contextMsg.isOwner}, isAdmin: ${contextMsg.isAdmin}, botIsAdmin: ${contextMsg.botIsAdmin}, isGroup: ${contextMsg.isGroup}

CONTEXT: ${JSON.stringify(contextMsg)}`;

    const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: contextMsg.text }];

    // TRY GROQ - KEY PER MODEL WITH ROTATION
    const groqModels = ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'];
    for (const model of groqModels) {
        const keyData = getGroqKey(model);
        if (!keyData) continue;
        try {
            const result = await callGroqAxios(model, messages, keyData.key);
            console.log(`\x1b[32mAI_GROQ:\x1b[0m ${model}`);
            if (!result.react) result.react = "💬";
            return result;
        } catch (e) {
            const status = e.response?.status;
            if (status === 429) console.log(`\x1b[33mAI_GROQ_FAIL:\x1b[0m ${model} limit hit`);
            else console.log(`\x1b[33mAI_GROQ_FAIL:\x1b[0m ${model} ${status || e.message}`);
        }
    }

    // FALLBACK GEMINI - KEY ROTATION
    const geminiKey = getGeminiKey();
    if (geminiKey) {
        try {
            const result = await callGeminiAxios(systemPrompt + `\nUser Input: ${contextMsg.text}`, geminiKey);
            console.log(`\x1b[32mAI_GEMINI:\x1b[0m Success`);
            if (!result.react) result.react = "💬";
            return result;
        } catch (e) {
            console.log(`\x1b[33mAI_GEMINI_FAIL:\x1b[0m ${e.response?.status || e.message}`);
        }
    }

    return { action: "chat", reply: "All AI providers failed. Check API keys or try again.", react: "❌" };
}


async function startBot() {
    console.log('\x1b[32mSERVER:\x1b[0m Starting...');
    console.log('\x1b[34mBoNGo AI Starting...\x1b[0m');
    console.log('\x1b[34mSESSION_ID Valid:\x1b[0m', process.env.SESSION_ID.startsWith('SWIFTBOT~'));
    if (!process.env.SESSION_ID.startsWith('SWIFTBOT~')) {
        console.error('Invalid SESSION_ID. Must start with SWIFTBOT~');
        return;
    }

    let parsedCreds;
    try {
        parsedCreds = JSON.parse(Buffer.from(process.env.SESSION_ID.replace('SWIFTBOT~', ''), 'base64').toString());
        parsedCreds = convertBuffers(parsedCreds);
        console.log('\x1b[32mBuffer conversion complete\x1b[0m');
        console.log('\x1b[34mCredentials parsed successfully\x1b[0m');
        
        if (!parsedCreds.noiseKey || !parsedCreds.signedIdentityKey) {
            console.log('\x1b[31mSESSION CORRUPTED:\x1b[0m Missing keys. Re-generate SESSION_ID.');
            process.exit(1);
        }
    } catch (e) {
        console.error('Failed to parse SESSION_ID', e);
        return;
    }

    console.log('\x1b[34mSocket created, connecting...\x1b[0m');
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    
    state.creds = parsedCreds;

    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        version,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome'),
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        getMessage: async () => ({})
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if(connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('\x1b[31mConnection closed:\x1b[0m', lastDisconnect?.error?.message);
            if(shouldReconnect) setTimeout(() => startBot(), 5000);
        }
        
        if(connection === 'open') {
            console.log('\x1b[32mBoNGo AI Connected as:\x1b[0m', sock.user.id);
        }
    });

    // ZERO-COMMAND MESSAGE HANDLER
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        let text = getMessageText(msg);
        
        if (msg.key.fromMe && text) {
            if (text.startsWith('🤔 Processing...') || text.startsWith('✅') || text.startsWith('❌')) {
                return;
            }
        }

        const prefix = process.env.PREFIX || botConfig.prefix;
        if (!text || !text.startsWith(prefix)) {
            return;
        }

        const sender = msg.key.participant || msg.key.remoteJid;
        const jid = msg.key.remoteJid;
        const isGroup = jid.endsWith('@g.us');

        console.log(`\x1b[36mMSG:\x1b[0m ${text || '[Media]'}`);
        console.log(`\x1b[36mWHERE:\x1b[0m ${isGroup ? 'Group' : 'DM'}`);
        console.log(`\x1b[36mFROM:\x1b[0m ${sender.split('@')[0]}`);
        console.log(`\x1b[36mJID:\x1b[0m ${jid}`);

        text = text.slice(prefix.length).trim();

        // React immediately
        try {
            await sock.sendMessage(jid, { react: { text: '🤔', key: msg.key } });
        } catch(e) {}

        let processingMsg = null;
        try {
            processingMsg = await sock.sendMessage(jid, { text: '🤔 Processing...' }, { quoted: msg });
            console.log('\x1b[35mPROCESSING:\x1b[0m Sent');
        } catch(e) {
            console.log('\x1b[31mPROCESSING_FAIL:\x1b[0m', e.message);
        }

        let groupMetadata = null;
        let botIsAdmin = false;
        let isAdmin = false;

        if (isGroup) {
            try {
                groupMetadata = await sock.groupMetadata(jid);
                const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                botIsAdmin = groupMetadata.participants.find(p => p.id === botId)?.admin !== null;
                isAdmin = groupMetadata.participants.find(p => p.id === sender)?.admin !== null;
            } catch {}
        }

        const contextMsg = {
            text: text,
            sender: sender,
            jid: jid,
            isGroup: isGroup,
            isOwner: sender === (botConfig.ownerNumber + '@s.whatsapp.net'),
            isAdmin: isAdmin,
            botIsAdmin: botIsAdmin,
            quotedMsg: msg.message?.extendedTextMessage?.contextInfo?.quotedMessage ? {
                message: msg.message.extendedTextMessage.contextInfo.quotedMessage,
                key: { remoteJid: jid, id: msg.message.extendedTextMessage.contextInfo.stanzaId },
                participant: msg.message.extendedTextMessage.contextInfo.participant
            } : null,
            quotedSender: msg.message?.extendedTextMessage?.contextInfo?.participant,
            mentionedJids: msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [],
            hasMedia: !!msg.message?.imageMessage || !!msg.message?.videoMessage || !!msg.message?.stickerMessage || !!msg.message?.audioMessage,
            mediaType: getContentType(msg.message)
        };

        try {
            console.log(`\x1b[36mAI_INPUT:\x1b[0m Context collected`);
            const plan = await callAI(contextMsg);
            console.log(`\x1b[36mAI_PLAN:\x1b[0m Action: ${plan.action}, React: ${plan.react}`);

            if (plan.react) {
                try {
                    await sock.sendMessage(jid, { react: { text: plan.react, key: msg.key } });
                    console.log(`\x1b[32mREACT:\x1b[0m ${plan.react}`);
                } catch(e) { console.log(`\x1b[31mREACT_FAIL:\x1b[0m`, e.message); }
            }

            let execResultText = plan.reply || 'Task completed';
            
            if (plan.action && cases.has(plan.action)) {
                console.log(`\x1b[32mCASE_EXEC:\x1b[0m ${plan.action}`);
                const caseFile = cases.get(plan.action);
                const { default: executeCase } = await import(`file://${caseFile}`);
                await executeCase(sock, plan, {...contextMsg, msg, getContentType, downloadMediaMessage, addMemory, getMemory });
            } else if (plan.reply) {
                // Do nothing, reply will be in processing message
            }

            if (processingMsg) {
                try {
                    await sock.sendMessage(jid, { text: `✅ ${execResultText}`, edit: processingMsg.key });
                    console.log(`\x1b[32mEDIT:\x1b[0m Success`);
                } catch(e) { console.log(`\x1b[31mEDIT_FAIL:\x1b[0m`, e.message); }
            }

            try {
                await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
                console.log(`\x1b[32mFINAL_REACT:\x1b[0m ✅`);
            } catch(e) { console.log(`\x1b[31mFINAL_REACT_FAIL:\x1b[0m`, e.message); }

        } catch (e) {
            console.log('\x1b[31mCASE_ERROR:\x1b[0m', e.message);
            if (processingMsg) {
                try {
                    await sock.sendMessage(jid, { text: `❌ Error: ${e.message}`, edit: processingMsg.key });
                    console.log(`\x1b[32mEDIT:\x1b[0m Error shown`);
                } catch(err) { console.log(`\x1b[31mEDIT_FAIL:\x1b[0m`, err.message); }
            }
            try {
                await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
                console.log(`\x1b[32mFINAL_REACT:\x1b[0m ❌`);
            } catch(err) { console.log(`\x1b[31mFINAL_REACT_FAIL:\x1b[0m`, err.message); }
        }
    });

    // Cache all messages for antidelete
    sock.ev.on('messages.upsert', async (m) => {
        if (m.type!== 'notify') return;
        for (const msg of m.messages) {
            if (msg.message) {
                const key = `${msg.key.remoteJid}_${msg.key.id}`;
                antideleteConfig.cache[key] = {
                    msg: msg,
                    timestamp: Date.now(),
                    sender: msg.key.participant || msg.key.remoteJid,
                    chat: msg.key.remoteJid,
                    type: getContentType(msg.message)
                };
                // Auto clean cache older than 7 days
                if (Date.now() - antideleteConfig.cache[key].timestamp > 604800000) {
                    delete antideleteConfig.cache[key];
                }
            }
        }
        saveAntidelete();
    });

    // Handle deletes
    sock.ev.on('messages.update', async (updates) => {
        if (!antideleteConfig.enabled) return;
        for (const update of updates) {
            if (update.update.messageStubType === 8 || update.update.message === null) {
                const key = `${update.key.remoteJid}_${update.key.id}`;
                const cached = antideleteConfig.cache[key];
                if (!cached) return;

                const isGroup = update.key.remoteJid.endsWith('@g.us');
                let target = null;

                if (antideleteConfig.mode === "public" && isGroup) {
                    target = antideleteConfig.publicTarget || update.key.remoteJid;
                } else if (antideleteConfig.mode === "private" ||!isGroup) {
                    target = antideleteConfig.privateTarget;
                }

                if (!target) return;

                const senderName = cached.sender.split('@')[0];
                const delTime = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Dar_es_Salaam' });
                let text = `🚨 *ANTI-DELETE* 🚨

*From:* @${senderName}
*Chat:* ${isGroup? cached.chat : 'Private'}
*Time:* ${delTime}
*Type:* ${cached.type}

*Deleted Message:*`;

                try {
                    await sock.sendMessage(target, { text: text, mentions: [cached.sender] });
                    await sock.sendMessage(target, { forward: cached.msg });
                } catch (e) {
                    console.log('AntiDelete Error:', e);
                }
                delete antideleteConfig.cache[key];
                saveAntidelete();
            }

            // Handle edits
            if (update.update.message && antideleteConfig.logEdits) {
                const key = `${update.key.remoteJid}_${update.key.id}`;
                const cached = antideleteConfig.cache[key];
                if (cached) {
                    const isGroup = update.key.remoteJid.endsWith('@g.us');
                    const target = antideleteConfig.mode === "public" && isGroup?
                        (antideleteConfig.publicTarget || update.key.remoteJid) : antideleteConfig.privateTarget;

                    if (target) {
                        const senderName = cached.sender.split('@')[0];
                        const editTime = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Dar_es_Salaam' });
                        let text = `✏️ *MESSAGE EDITED* ✏️

*From:* @${senderName}
*Time:* ${editTime}

*Original:*`;
                        await sock.sendMessage(target, { text: text, mentions: [cached.sender] });
                        await sock.sendMessage(target, { forward: cached.msg });
                        await sock.sendMessage(target, { text: `*Edited To:*` });
                        // Update cache with new message
                        antideleteConfig.cache[key].msg = { key: update.key, message: update.update.message };
                        saveAntidelete();
                    }
                }
            }
        }
    });

    // Handle view once
    sock.ev.on('messages.upsert', async (m) => {
        if (!antideleteConfig.logViewOnce) return;
        for (const msg of m.messages) {
            if (msg.message?.viewOnceMessageV2 || msg.message?.viewOnceMessage) {
                const isGroup = msg.key.remoteJid.endsWith('@g.us');
                const target = antideleteConfig.mode === "public" && isGroup?
                    (antideleteConfig.publicTarget || msg.key.remoteJid) : antideleteConfig.privateTarget;

                if (target) {
                    const senderName = (msg.key.participant || msg.key.remoteJid).split('@')[0];
                    const viewTime = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Dar_es_Salaam' });
                    await sock.sendMessage(target, {
                        text: `👁️ *VIEW ONCE CAPTURED* 👁️

*From:* @${senderName}
*Time:* ${viewTime}`,
                        mentions: [msg.key.participant || msg.key.remoteJid]
                    });
                    await sock.sendMessage(target, { forward: msg });
                }
            }
        }
    });

    sock.ev.on('messages.update', async (updates) => {
        for (const update of updates) {
            if (update.update.message?.protocolMessage?.type === 0) {
                const originalMsgId = update.update.message.protocolMessage.key.id;
                const originalMsg = messageStore.get(originalMsgId);
                const jid = update.key.remoteJid;
                const gc = groupConfig.get(jid);
                if (originalMsg && gc?.antiDelete) {
                    const ownerNumber = process.env.OWNER_NUMBER + '@s.whatsapp.net';
                    const attribution = `AntiDelete event detected in *${jid}*
From: @${(originalMsg.key.participant || originalMsg.key.remoteJid).split('@')[0]}`;
                    await sock.sendMessage(ownerNumber, { text: attribution, mentions: [originalMsg.key.participant || originalMsg.key.remoteJid] });
                    await sock.sendMessage(ownerNumber, { forward: originalMsg });
                }
            }
        }
    });
}

startBot();
