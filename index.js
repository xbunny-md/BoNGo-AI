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

function isOwner(senderJid) {
    if (!senderJid) return false;
    const ownerNum = (botConfig.ownerNumber || process.env.OWNER_NUMBER || '').toString().replace(/[^0-9]/g, '');
    const senderNum = senderJid.split('@')[0].split(':')[0];
    return senderNum === ownerNum;
}

// UNIVERSAL AI ROUTER - DECIDES EVERYTHING
async function callAI(contextMsg, quotedJid, mentionedJids, isGroup, isAdmin, isOwnerUser) {
    const systemPrompt = `You are ` + botConfig.botName + `, BoNGo AI Router. Return valid JSON ONLY. No text outside JSON.
Output: {"action":"string","target":"string","params":{},"reply":"string","react":"string"}

AVAILABLE ACTIONS: ` + Array.from(cases.keys()).join(', ') + `

CORE RULES:
1. "action" MUST EXACTLY match a filename in /cases/ without .case.js. Available: kick,add,promote,demote,tagall,hidetag,mute,unmute,setGroupSubject,setGroupDesc,setProfilePicture,getGroupInfo,getGroupLink,revokeGroupLink,groupSettings,groupMetadata,groupParticipantsUpdate,groupInviteCode,groupRevokeInvite,groupJoinApproval,groupApproveJoin,groupRejectJoin,groupPendingRequests,groupAnnounce,groupNotAnnounce,groupLocked,groupUnlocked,setGroupEphemeral,getGroupEphemeral,lockChat,unlockChat,kickall,ban,unban,warn,unwarn,remove,setDescription,setSubject,setIcon,updateParticipants,leave,chat,ping,menu,help,deleteMessage,getProfilePic,antidelete,changePrefix,changeBotName,setStatus,leaveGroup,ttt,rps,dice,coinflip,guess,tosticker,toimage,tomp3,tomp4,togif,towebp,topng,tojpg,tovoice,totext,tiktok,facebook,instagram,youtube
2. If action is NOT "chat", set reply:"". Case file sends all output. AI must NOT generate content for cases.
3. If action is "chat", set reply to your answer.
4. DYNAMIC TARGET RESOLUTION: For actions on users, use context priority: 1. If replying to someone, set target to quoted participant JID. 2. If message mentions users, set target to first mentioned JID. 3. If user refers to themselves or no target, set target:"sender". NEVER leave target empty for user-targeted actions.
5. For tagall/tag everyone/hidetag intents -> action:"tagall", react:"📢", reply:""
6. For kick/remove/ban intents -> action:"kick", react:"👢", reply:"", target: apply DYNAMIC TARGET RESOLUTION
7. For add/invite intents -> action:"add", react:"➕", reply:"", target: phone number with @s.whatsapp.net
8. For promote/admin intents -> action:"promote", react:"⬆️", reply:"", target: apply DYNAMIC TARGET RESOLUTION
9. For demote/unadmin intents -> action:"demote", react:"⬇️", reply:"", target: apply DYNAMIC TARGET RESOLUTION
10. For mute/close group intents -> action:"mute", react:"🔇", reply:""
11. For unmute/open group intents -> action:"unmute", react:"🔊", reply:""
12. For link/group link intents -> action:"getGroupLink", react:"🔗", reply:""
13. For revoke link intents -> action:"revokeGroupLink", react:"🚫", reply:""
14. For group info intents -> action:"getGroupInfo", react:"ℹ️", reply:""
15. For announce only intents -> action:"groupAnnounce", react:"📣", reply:""
16. For everyone chat intents -> action:"groupNotAnnounce", react:"💬", reply:""
17. For lock settings intents -> action:"groupLocked", react:"🔒", reply:""
18. For unlock settings intents -> action:"groupUnlocked", react:"🔓", reply:""
19. For disappearing on intents -> action:"setGroupEphemeral", react:"⏳", reply:"", params:{"duration":604800}
20. For disappearing off intents -> action:"setGroupEphemeral", react:"⏳", reply:"", params:{"duration":0}
21. For kickall/remove all intents -> action:"kickall", react:"💥", reply:""
22. For game related intents -> action:"ttt", react:"🎮", reply:""
23. For ping intents -> action:"ping", react:"⚡", reply:""
24. For menu help intents -> action:"menu", react:"📋", reply:""
25. For profile picture intents -> action:"getProfilePic", react:"🖼️", reply:"", target: apply DYNAMIC TARGET RESOLUTION
26. For TikTok link detected -> action:"tiktok", react:"⏬", reply:""
27. For Facebook link detected -> action:"facebook", react:"⏬", reply:""
28. For Instagram link detected -> action:"instagram", react:"⏬", reply:""
29. NEVER write descriptive phrases like "Task completed", "Done", "Here is", "Starting" in reply field unless action is "chat".
30. "react" must be single emoji related to action.
31. If no case matches -> action:"chat", react:"💬", reply:"your answer"

User input after prefix: ` + contextMsg.text + `
Quoted participant JID: ` + (quotedJid || '') + `
Mentioned JIDs: ` + mentionedJids.join(', ') + `
Is Group: ` + isGroup + `
Is Admin: ` + isAdmin + `
Is Owner: ` + isOwnerUser + `;

    const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: contextMsg.text }];

    // TRY GROQ - KEY PER MODEL WITH ROTATION
    const groqModels = ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'];
    for (const model of groqModels) {
        const keyData = getGroqKey(model);
        if (!keyData) continue;
        try {
            const result = await callGroqAxios(model, messages, keyData.key);
            console.log(`\x1b[32mAI_GROQ:\x1b[0m ` + model);
            if (!result.react) result.react = "💬";
            return result;
        } catch (e) {
            const status = e.response ? e.response.status : undefined;
            if (status === 429) console.log(`\x1b[33mAI_GROQ_FAIL:\x1b[0m ` + model + ` limit hit`);
            else console.log(`\x1b[33mAI_GROQ_FAIL:\x1b[0m ` + model + ` ` + (status || e.message));
        }
    }

    // FALLBACK GEMINI - KEY ROTATION
    const geminiKey = getGeminiKey();
    if (geminiKey) {
        try {
            const result = await callGeminiAxios(systemPrompt + "\nUser Input: " + contextMsg.text, geminiKey);
            console.log(`\x1b[32mAI_GEMINI:\x1b[0m Success`);
            if (!result.react) result.react = "💬";
            return result;
        } catch (e) {
            console.log(`\x1b[33mAI_GEMINI_FAIL:\x1b[0m ` + (e.response ? e.response.status : e.message));
        }
    }

    return { action: "chat", reply: "All AI providers failed. Check API keys or try again.", react: "❌" };
}


async function startBot() {
    console.log('\x1b[32mSERVER:\x1b[0m Starting...');
    console.log('\x1b[34mBoNGo AI Starting...\x1b[0m');
    console.log('\x1b[34mSESSION_ID Valid:\x1b[0m', process.env.SESSION_ID && process.env.SESSION_ID.startsWith('SWIFTBOT~'));
    if (!process.env.SESSION_ID || !process.env.SESSION_ID.startsWith('SWIFTBOT~')) {
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
            const shouldReconnect = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
            console.log('\x1b[31mConnection closed:\x1b[0m', lastDisconnect && lastDisconnect.error ? lastDisconnect.error.message : '');
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
        
        if (text) {
            if (text.startsWith('🤔 Processing...') || text.startsWith('✅') || text.startsWith('❌')) {
                return;
            }
        }

        const prefix = process.env.PREFIX || botConfig.prefix;
        if (!text || !text.startsWith(prefix)) {
            return;
        }

        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const senderNum = senderJid.split('@')[0].split(':')[0];
        const isOwnerUser = isOwner(senderJid);

        let groupMetadata = null;
        let participants = [];
        let groupAdmins = [];
        let isAdmin = false;

        if (isGroup) {
            try {
                groupMetadata = await sock.groupMetadata(from);
                participants = groupMetadata.participants || [];
                groupAdmins = participants.filter(p => p.admin).map(p => p.id);
                isAdmin = groupAdmins.includes(senderJid);
            } catch {}
        }

        console.log(`\x1b[36mMSG:\x1b[0m ` + (text || '[Media]'));
        console.log(`\x1b[36mWHERE:\x1b[0m ` + (isGroup ? 'Group' : 'DM'));
        console.log(`\x1b[36mFROM:\x1b[0m ` + senderNum);
        console.log(`\x1b[36mJID:\x1b[0m ` + from);
        console.log(`\x1b[33mOWNER_CHECK:\x1b[0m senderNum:` + senderNum + ` isOwner:` + isOwnerUser);

        text = text.slice(prefix.length).trim();

        const extTextMsg = msg.message && msg.message.extendedTextMessage ? msg.message.extendedTextMessage : null;
        const quotedJid = extTextMsg && extTextMsg.contextInfo ? extTextMsg.contextInfo.participant : null;
        const mentionedJids = extTextMsg && extTextMsg.contextInfo && extTextMsg.contextInfo.mentionedJid ? extTextMsg.contextInfo.mentionedJid : [];

        // React immediately
        try {
            await sock.sendMessage(from, { react: { text: '🤔', key: msg.key } });
        } catch(e) {}

        let processingMsg = null;
        try {
            processingMsg = await sock.sendMessage(from, { text: '🤔 Processing...' }, { quoted: msg });
        } catch(e) {}

        const quotedMsgObj = extTextMsg && extTextMsg.contextInfo && extTextMsg.contextInfo.quotedMessage ? {
            message: extTextMsg.contextInfo.quotedMessage,
            key: { remoteJid: from, id: extTextMsg.contextInfo.stanzaId },
            participant: extTextMsg.contextInfo.participant
        } : null;

        const hasMedia = !!(msg.message && (msg.message.imageMessage || msg.message.videoMessage || msg.message.stickerMessage || msg.message.audioMessage));
        const mediaType = getContentType(msg.message);
        
        const botIdFull = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const botIsAdmin = isGroup && groupAdmins.includes(botIdFull);

        const contextMsg = {
            text: text,
            sender: senderJid,
            jid: from,
            isGroup: isGroup,
            isOwner: isOwnerUser,
            isAdmin: isAdmin,
            botIsAdmin: botIsAdmin,
            quotedMsg: quotedMsgObj,
            quotedSender: quotedJid,
            mentionedJids: mentionedJids,
            hasMedia: hasMedia,
            mediaType: mediaType
        };

        try {
            const plan = await callAI(contextMsg, quotedJid, mentionedJids, isGroup, isAdmin, isOwnerUser);
            console.log(`\x1b[36mAI_INPUT:\x1b[0m Context collected`);
            console.log(`\x1b[36mAI_PLAN:\x1b[0m Action: ` + plan.action + `, React: ` + plan.react + `, Target: ` + plan.target);

            if (plan.react) {
                try {
                    await sock.sendMessage(from, { react: { text: plan.react, key: msg.key } });
                } catch(e) {}
            }

            if (plan.action && plan.action !== 'chat' && cases.has(plan.action)) {
                console.log(`\x1b[32mCASE_EXEC:\x1b[0m ` + plan.action);
                const caseFile = cases.get(plan.action);
                const { default: executeCase } = await import(`file://` + caseFile);
                await executeCase(sock, plan, {
                    from: from,
                    jid: from,
                    msg: msg,
                    sender: senderJid,
                    senderNum: senderNum,
                    isOwner: isOwnerUser,
                    isGroup: isGroup,
                    isAdmin: isAdmin,
                    groupMetadata: groupMetadata,
                    participants: participants,
                    groupAdmins: groupAdmins,
                    text: text,
                    quotedJid: quotedJid,
                    mentionedJids: mentionedJids,
                    getContentType: getContentType,
                    downloadMediaMessage: downloadMediaMessage,
                    addMemory: addMemory,
                    getMemory: getMemory,
                    botIsAdmin: botIsAdmin,
                    quotedMsg: quotedMsgObj
                });
                console.log('\x1b[32mTASK_DONE:\x1b[0m Case completed');
            } else {
                if (plan.reply) {
                    await sock.sendMessage(from, { text: plan.reply }, { quoted: msg });
                }
            }

            if (processingMsg) {
                try {
                    await sock.sendMessage(from, { text: '✅', edit: processingMsg.key });
                    console.log(`\x1b[32mEDIT:\x1b[0m ✅`);
                } catch(e) {}
            }

            try {
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
                console.log(`\x1b[32mFINAL_REACT:\x1b[0m ✅`);
            } catch(e) {}

        } catch (e) {
            console.log('\x1b[31mERROR:\x1b[0m', e.message);
            console.log('\x1b[31mTASK_FAIL:\x1b[0m', e.message);
            if (processingMsg) {
                try {
                    await sock.sendMessage(from, { text: '❌', edit: processingMsg.key });
                    console.log(`\x1b[32mEDIT:\x1b[0m ❌`);
                } catch(err) {}
            }
            try {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                console.log(`\x1b[32mFINAL_REACT:\x1b[0m ❌`);
            } catch(err) {}
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
