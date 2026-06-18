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
import Groq from 'groq-sdk';
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
    let text = `┌─── ${menu.title} ───┐\n`;
    if (menu.sections) {
        menu.sections.forEach(sec => {
            if (sec.commands.length) {
                text += `│\n│ 📂 *${sec.name}*\n`;
                sec.commands.forEach(cmd => text += `│ • ${prefix}${cmd}\n`);
            }
        });
    } else if (menu.commands?.length) {
        text += `│\n`;
        menu.commands.forEach(cmd => text += `│ • ${prefix}${cmd}\n`);
    } else {
        text += `│\n│ No commands yet\n`;
    }
    text += `│\n└────────────────────┘\n\n_Prefix: ${prefix}_`;
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

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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

const GROQ_MODELS = [
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
    'mixtral-8x7b-32768'
]

async function callGroqWithFallback(messages) {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY missing')
    for (const model of GROQ_MODELS) {
        try {
            const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: model,
                messages: messages,
                temperature: 0.7,
                max_tokens: 600,
                response_format: { type: "json_object" }
            }, {
                headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
                timeout: 15000
            })
            console.log(`\x1b[32mGROQ_MODEL:\x1b[0m ${model} Success`)
            return JSON.parse(res.data.choices[0].message.content)
        } catch (e) {
            console.log(`\x1b[33mGROQ_MODEL:\x1b[0m ${model} Failed: ${e.response?.status || e.message}`)
            if (model === GROQ_MODELS[GROQ_MODELS.length - 1]) throw e
        }
    }
}

async function callGeminiRest(systemPrompt, userText) {
    if (!process.env.GEMINI_OAUTH_TOKEN) throw new Error('GEMINI_OAUTH_TOKEN missing')
    try {
        const res = await axios.post('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', {
            contents: [{
                parts: [{ text: systemPrompt + `\nUser Input: ${userText}` }]
            }],
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.7,
                maxOutputTokens: 600
            }
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.GEMINI_OAUTH_TOKEN}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        })
        console.log('\x1b[32mAI_PROVIDER:\x1b[0m Gemini REST Success')
        const text = res.data.candidates[0].content.parts[0].text
        return JSON.parse(text)
    } catch (e) {
        console.log(`\x1b[31mGEMINI_REST_ERROR:\x1b[0m ${e.response?.status} ${e.message}`)
        throw e
    }
}

async function callAI(contextMsg) {
    const systemPrompt = `You are ${botConfig.botName}, an autonomous WhatsApp group admin bot. Respond using the same language as the user. Return ONLY valid JSON: {"action":"string","target":"string","params":{},"reply":"string","react":"string","updateConfig":{}}.

CRITICAL RULES:
1. For group admin actions, ALWAYS set target to the user JID. Extract JID from: quoted message participant, mentionedJids[0], or params.number + '@s.whatsapp.net'.
2. NEVER use names or numbers directly. Target must be JID format: 255xxx@s.whatsapp.net or 1xxx@s.whatsapp.net.
3. If user says "add 255780470905", set target:"255780470905@s.whatsapp.net".
4. If user replies to a message and says "kick", set target to quotedSender.
5. If user says "take his dp", set action:"getProfilePic" and target to quotedSender.

VALID ACTIONS - GROUP MANAGEMENT:
kickUser - remove member. Needs: target JID. Requires: botIsAdmin + isAdmin/isOwner
addUser - add member. Needs: target JID or params.number. Requires: botIsAdmin + isAdmin/isOwner
promoteUser - make admin. Needs: target JID. Requires: botIsAdmin + isAdmin/isOwner
demoteUser - remove admin. Needs: target JID. Requires: botIsAdmin + isAdmin/isOwner
setGroupSubject - change group name. Needs: params.subject. Requires: botIsAdmin + isAdmin/isOwner
setGroupDesc - change group description. Needs: params.desc. Requires: botIsAdmin + isAdmin/isOwner
setProfilePicture - change group icon. Needs: quoted image or params.url. Requires: botIsAdmin + isAdmin/isOwner
muteGroup - only admins can message. Needs: params.duration optional. Requires: botIsAdmin + isAdmin/isOwner
unmuteGroup - everyone can message. Requires: botIsAdmin + isAdmin/isOwner
getGroupInfo - show members, admins, description. No target needed.
getGroupLink - get invite link. Requires: botIsAdmin + isAdmin/isOwner
revokeGroupLink - reset invite link. Requires: botIsAdmin + isAdmin/isOwner
leaveGroup - bot leaves group. Requires: isOwner only
warnUser - send warning. Needs: target JID, params.reason. Store in context.
unwarnUser - remove warning. Needs: target JID.
listWarns - show warnings for user. Needs: target JID.
tagAll - mention all members. Requires: isAdmin/isOwner
hideTag - mention all without showing list. Requires: isAdmin/isOwner
setWelcome - set welcome message. Needs: params.message. Requires: isAdmin/isOwner
setGoodbye - set goodbye message. Needs: params.message. Requires: isAdmin/isOwner
enableAntiLink - auto kick link senders. Requires: isAdmin/isOwner
disableAntiLink - stop anti link. Requires: isAdmin/isOwner
enableAntiSpam - auto kick spammers. Requires: isAdmin/isOwner
disableAntiSpam - stop anti spam. Requires: isAdmin/isOwner

VALID ACTIONS - MEDIA & INFO:
getProfilePic - get user dp. Needs: target JID. Works on anyone.
downloadSong - search YouTube audio. Needs: params.query
downloadVideo - search YouTube video. Needs: params.query
deleteMessage - delete quoted message. Requires: botIsAdmin if not bot message
getUserIP - blocked. Always reply: "Command disabled for security"

VALID ACTIONS - BOT CONFIG:
changePrefix - change command prefix. Needs: params.prefix. Requires: isOwner
changeBotName - change bot name. Needs: params.name. Requires: isOwner
setStatus - update bot bio. Needs: params.status. Requires: isOwner
setProfileStatus - alias for setStatus

VALID ACTIONS - GENERAL:
sendMessage - normal reply. Use when no other action fits.
editMessage - edit previous bot message. Requires: context.reactMsgKey

VALID ACTIONS - DYNAMIC MENUS:
menu - show dynamic menu. Needs: params.type optional: owner,admin,group,games
ownermenu - owner commands
adminmenu - admin commands
groupmenu - group commands
gamesmenu - games list

VALID ACTIONS - GAMES:
ttt - start tic tac toe vs user. Needs: target JID
tttplay - make move. Needs: target number 1-9
rps - rock paper scissors. Needs: target rock/paper/scissors
dice - roll dice
coinflip - flip coin
guess - start number guess game
guessplay - submit guess. Needs: target number
math - math quiz
mathans - answer math. Needs: target number
slots - slot machine

MEMORY SYSTEM: User memory auto-tracked in memory.json. Check context.userMemory for: lastGame, commands history, preferences. Use to personalize. When user asks "menu" detect if owner/admin and show relevant menu.
NEW COMMAND DETECTION: If user uses unknown command, add it to menus.json automatically under UTILS and respond with sendMessage.

VALID ACTIONS - UNIVERSAL CONVERTERS:
tosticker - convert image/video to sticker. Requires: quoted image/video max 10s
toimage - convert sticker/video to PNG image. Requires: quoted sticker/video
tovideo - convert sticker/gif to MP4 video. Requires: quoted sticker/gif
toaudio - extract audio from video as MP3. Requires: quoted video
tomp3 - alias for toaudio
tomp4 - convert to MP4 video. Requires: quoted media
togif - convert video/sticker to GIF. Requires: quoted video/sticker
towebp - convert image to webp sticker. Requires: quoted image
topng - convert sticker to PNG. Requires: quoted sticker
tojpg - convert sticker to JPG. Requires: quoted sticker
tovoice - extract audio from video as voice note. Requires: quoted video
totext - OCR extract text from image. Requires: quoted image

CONVERTER RULES:
1. ALWAYS requires quoted message with media
2. Check media type with getContentType before converting
3. Use ffmpeg for all conversions. Ensure ffmpeg is installed on server
4. Max input: 50MB or 60 seconds for video
5. On error, reply: "Conversion failed. Ensure media is valid and ffmpeg is installed"

VALID ACTIONS - ANTI-DELETE SYSTEM:
antidelete - configure anti-delete. Needs: target on/off/public/private/status, params.target optional JID
antiedit - toggle edit logging. Needs: target on/off
antiviewonce - toggle viewonce capture. Needs: target on/off

ANTI-DELETE RULES:
1. If mode=public AND message is from group: send deleted message to publicTarget or same group
2. If mode=private OR message is from DM: send deleted message to privateTarget (owner or custom JID)
3. If logEdits=true: forward original + edited version when message is edited
4. If logViewOnce=true: auto-forward view-once media to target before it disappears
5. Cache messages for 7 days max to prevent memory leak
6. Only owner can change antidelete config

PERMISSION CHECK:
Before dangerous actions verify context: isOwner, isAdmin, botIsAdmin. If unauthorized, set reply:"Permission denied. Only admins can use this." and react:"❌". Do not execute action.

CONTEXT PROVIDED: ${JSON.stringify({...contextMsg, userMemory: getMemory(contextMsg.sender), antidelete: antideleteConfig})}\``

    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: contextMsg.text }
    ]

    try {
        return await callGroqWithFallback(messages)
    } catch (e) {
        console.log(`\x1b[31mGROQ_ALL_FAILED:\x1b[0m ${e.message}`)
        try {
            return await callGeminiRest(systemPrompt, contextMsg.text)
        } catch (e2) {
            console.log(`\x1b[31mALL_AI_FAILED:\x1b[0m ${e2.message}`)
            return {
                action: "sendMessage",
                reply: `AI Error: All providers failed. Check API keys.`,
                react: "❌"
            }
        }
    }
}

async function executeAction(sock, plan, context) {
    const { action, target, params, reply, react, updateConfig } = plan;
    const jid = context.msg.key.remoteJid;
    const sender = context.sender;
    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';

    if (updateConfig) {
        if (updateConfig.prefix) botConfig.prefix = updateConfig.prefix;
        if (updateConfig.botName) botConfig.botName = updateConfig.botName;
    }

    try {
        switch (action) {
            case 'sendMessage':
                break;
            case 'menu':
            case 'allmenu':
            case 'help':
                const menuType = target || params.type || 'all';
                addMemory(sender, 'command', 'menu');
                await sock.sendMessage(jid, { text: generateMenu(menuType, botConfig.prefix) }, { quoted: context.msg });
                break;
            case 'ownermenu':
                addMemory(sender, 'command', 'ownermenu');
                await sock.sendMessage(jid, { text: generateMenu('owner', botConfig.prefix) }, { quoted: context.msg });
                break;
            case 'adminmenu':
                addMemory(sender, 'command', 'adminmenu');
                await sock.sendMessage(jid, { text: generateMenu('admin', botConfig.prefix) }, { quoted: context.msg });
                break;
            case 'groupmenu':
                addMemory(sender, 'command', 'groupmenu');
                await sock.sendMessage(jid, { text: generateMenu('group', botConfig.prefix) }, { quoted: context.msg });
                break;
            case 'gamesmenu':
            case 'games':
                addMemory(sender, 'command', 'gamesmenu');
                await sock.sendMessage(jid, { text: generateMenu('games', botConfig.prefix) }, { quoted: context.msg });
                break;
            case 'rps':
                const choice = (target || '').toLowerCase();
                if (!['rock','paper','scissors'].includes(choice)) throw new Error('Choose: rock, paper, or scissors');
                const bot = ['rock','paper','scissors'][Math.floor(Math.random()*3)];
                let result = 'Draw';
                if (choice==='rock'&&bot==='scissors' || choice==='paper'&&bot==='rock' || choice==='scissors'&&bot==='paper') result = 'You win!';
                if (bot==='rock'&&choice==='scissors' || bot==='paper'&&choice==='rock' || bot==='scissors'&&choice==='paper') result = 'Bot wins!';
                addMemory(sender, 'command', 'rps');
                addMemory(sender, 'lastGame', {type: 'rps', result: result});
                await sock.sendMessage(jid, { text: `You: ${choice}\nBot: ${bot}\n\n${result}` }, { quoted: context.msg });
                break;
            case 'dice':
                const roll = Math.floor(Math.random()*6)+1;
                addMemory(sender, 'command', 'dice');
                addMemory(sender, 'lastDice', roll);
                await sock.sendMessage(jid, { text: `🎲 You rolled: ${roll}` }, { quoted: context.msg });
                break;
            case 'coinflip':
                const side = Math.random() > 0.5 ? 'Heads' : 'Tails';
                addMemory(sender, 'command', 'coinflip');
                await sock.sendMessage(jid, { text: `🪙 ${side}` }, { quoted: context.msg });
                break;
            case 'guess':
                const num = Math.floor(Math.random()*100)+1;
                if (!gamesData[jid]) gamesData[jid] = {};
                gamesData[jid][sender] = { type: 'guess', number: num, tries: 0 };
                saveGames();
                addMemory(sender, 'command', 'guess');
                await sock.sendMessage(jid, { text: `Guess number 1-100. Use ${botConfig.prefix}guessplay <number>` }, { quoted: context.msg });
                break;
            case 'guessplay':
                const guess = parseInt(target);
                const gdata = gamesData[jid]?.[sender];
                if (!gdata || gdata.type !== 'guess') throw new Error(`Start game with ${botConfig.prefix}guess first`);
                gdata.tries++;
                if (guess === gdata.number) {
                    await sock.sendMessage(jid, { text: `Correct! Number was ${gdata.number}. Tries: ${gdata.tries}` }, { quoted: context.msg });
                    addMemory(sender, 'lastGame', {type: 'guess', won: true, tries: gdata.tries});
                    delete gamesData[jid][sender];
                } else {
                    await sock.sendMessage(jid, { text: guess > gdata.number ? 'Lower!' : 'Higher!' }, { quoted: context.msg });
                }
                saveGames();
                break;
            case 'math':
                const a = Math.floor(Math.random()*50)+1;
                const b = Math.floor(Math.random()*50)+1;
                const op = ['+','-','*'][Math.floor(Math.random()*3)];
                const ans = eval(`${a}${op}${b}`);
                if (!gamesData[jid]) gamesData[jid] = {};
                gamesData[jid][sender] = { type: 'math', answer: ans };
                saveGames();
                addMemory(sender, 'command', 'math');
                await sock.sendMessage(jid, { text: `Solve: ${a} ${op} ${b} =?\nUse ${botConfig.prefix}mathans <answer>` }, { quoted: context.msg });
                break;
            case 'mathans':
                const userAns = parseInt(target);
                const mdata = gamesData[jid]?.[sender];
                if (!mdata || mdata.type !== 'math') throw new Error(`Start with ${botConfig.prefix}math first`);
                if (userAns === mdata.answer) {
                    await sock.sendMessage(jid, { text: 'Correct! 🎉' }, { quoted: context.msg });
                    addMemory(sender, 'lastGame', {type: 'math', won: true});
                } else {
                    await sock.sendMessage(jid, { text: `Wrong. Answer was ${mdata.answer}` }, { quoted: context.msg });
                    addMemory(sender, 'lastGame', {type: 'math', won: false});
                }
                delete gamesData[jid][sender];
                saveGames();
                break;
            case 'slots':
                const symbols = ['🍒','🍋','🍊','🍉','⭐','💎'];
                const slot = [0,0,0].map(() => symbols[Math.floor(Math.random()*symbols.length)]);
                const win = slot[0]===slot[1] && slot[1]===slot[2];
                addMemory(sender, 'command', 'slots');
                addMemory(sender, 'lastGame', {type: 'slots', won: win});
                await sock.sendMessage(jid, { text: `[ ${slot.join(' | ')} ]\n\n${win ? 'JACKPOT! 🎰' : 'Try again'}` }, { quoted: context.msg });
                break;
            case 'ttt':
                if (!context.isGroup) throw new Error('Games only work in groups');
                const player = sender;
                const opponent = target || context.quotedSender || context.mentionedJids[0];
                if (!opponent) throw new Error('Mention opponent or reply to them');
                if (!gamesData[jid]) gamesData[jid] = {};
                const gameId = `${player}_${opponent}`;
                gamesData[jid][gameId] = {
                    type: 'ttt',
                    board: ['1','2','3','4','5','6','7','8','9'],
                    turn: player,
                    players: [player, opponent]
                };
                saveGames();
                addMemory(sender, 'command', 'ttt');
                const boardText = `\`1 | 2 | 3\n4 | 5 | 6\n7 | 8 | 9\`\n\n@${player.split('@')[0]} vs @${opponent.split('@')[0]}\nTurn: @${player.split('@')[0]}\nReply with number 1-9`;
                await sock.sendMessage(jid, { text: boardText, mentions: [player, opponent] });
                break;
            case 'tttplay':
                if (!context.isGroup) throw new Error('Games only work in groups');
                const pos = parseInt(target) - 1;
                if (isNaN(pos) || pos < 0 || pos > 8) throw new Error('Send number 1-9');
                const currentGame = Object.entries(gamesData[jid] || {}).find(([id, g]) => g.type==='ttt' && g.players.includes(sender) && g.turn === sender);
                if (!currentGame) throw new Error('Not your turn or no active game');
                const [gId, game] = currentGame;
                if (game.board[pos] === 'X' || game.board[pos] === 'O') throw new Error('Position taken');
                const symbol = game.players[0] === sender ? 'X' : 'O';
                game.board[pos] = symbol;
                game.turn = game.players.find(p => p !== sender);
                const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
                const won = wins.some(line => line.every(i => game.board[i] === symbol));
                const draw = game.board.every(c => c === 'X' || c === 'O');
                let display = game.board.map((v,i) => (i%3===2 ? v+'\n' : v+' | ')).join('').replace(/\n \| /g,'\n');
                if (won) {
                    await sock.sendMessage(jid, { text: `\`${display}\`\n\n@${sender.split('@')[0]} wins! 🎉`, mentions: game.players });
                    addMemory(sender, 'lastGame', {type: 'ttt', won: true});
                    delete gamesData[jid][gId];
                } else if (draw) {
                    await sock.sendMessage(jid, { text: `\`${display}\`\n\nDraw!`, mentions: game.players });
                    delete gamesData[jid][gId];
                } else {
                    await sock.sendMessage(jid, { text: `\`${display}\`\n\nTurn: @${game.turn.split('@')[0]}`, mentions: game.players });
                }
                saveGames();
                break;
            case 'kickUser':
                if (!context.botIsAdmin) throw new Error('Bot needs admin rights');
                if (!context.isAdmin && !context.isOwner) throw new Error('Only admins can kick');
                const kickTarget = target || context.quotedSender || context.mentionedJids[0];
                if (!kickTarget) throw new Error('Reply to user or mention them');
                await sock.groupParticipantsUpdate(jid, [kickTarget], "remove");
                break;
            case 'addUser':
                if (!context.botIsAdmin) throw new Error('Bot needs admin rights');
                if (!context.isAdmin && !context.isOwner) throw new Error('Only admins can add');
                const addTarget = target || (params.number ? params.number.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null);
                if (!addTarget) throw new Error('Provide number or reply to user');
                await sock.groupParticipantsUpdate(jid, [addTarget], "add");
                break;
            case 'promoteUser':
                if (!context.botIsAdmin) throw new Error('Bot needs admin rights');
                if (!context.isAdmin && !context.isOwner) throw new Error('Only admins can promote');
                const promoteTarget = target || context.quotedSender || context.mentionedJids[0];
                if (!promoteTarget) throw new Error('Reply to user or mention them');
                await sock.groupParticipantsUpdate(jid, [promoteTarget], "promote");
                break;
            case 'demoteUser':
                if (!context.botIsAdmin) throw new Error('Bot needs admin rights');
                if (!context.isAdmin && !context.isOwner) throw new Error('Only admins can demote');
                const demoteTarget = target || context.quotedSender || context.mentionedJids[0];
                if (!demoteTarget) throw new Error('Reply to user or mention them');
                await sock.groupParticipantsUpdate(jid, [demoteTarget], "demote");
                break;
            case 'setGroupSubject':
                if (!context.botIsAdmin) throw new Error('Bot needs admin rights');
                if (!context.isAdmin && !context.isOwner) throw new Error('Only admins can change name');
                await sock.groupUpdateSubject(jid, params.subject || target);
                break;
            case 'setGroupDesc':
                if (!context.botIsAdmin) throw new Error('Bot needs admin rights');
                if (!context.isAdmin && !context.isOwner) throw new Error('Only admins can change description');
                await sock.groupUpdateDescription(jid, params.desc || target);
                break;
            case 'setProfilePicture':
                if (!context.botIsAdmin && context.isGroup) throw new Error('Bot needs admin rights');
                if (!context.isAdmin && !context.isOwner) throw new Error('Only admins can change group icon');
                if (context.quotedMsg && getContentType(context.quotedMsg.message) === 'imageMessage') {
                    const buffer = await downloadMediaMessage(context.quotedMsg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                    await sock.updateProfilePicture(jid, buffer);
                } else if (params.url) {
                    await sock.updateProfilePicture(jid, { url: params.url });
                } else {
                    throw new Error('Reply to an image or provide URL');
                }
                break;
            case 'muteGroup':
                if (!context.botIsAdmin) throw new Error('Bot needs admin rights');
                if (!context.isAdmin && !context.isOwner) throw new Error('Only admins can mute group');
                await sock.groupSettingUpdate(jid, 'announcement');
                break;
            case 'unmuteGroup':
                if (!context.botIsAdmin) throw new Error('Bot needs admin rights');
                if (!context.isAdmin && !context.isOwner) throw new Error('Only admins can unmute group');
                await sock.groupSettingUpdate(jid, 'not_announcement');
                break;
            case 'getGroupInfo':
                const metadata = await sock.groupMetadata(jid);
                const admins = metadata.participants.filter(p => p.admin).map(p => '@' + p.id.split('@')[0]).join(' ');
                const infoText = `*${metadata.subject}*\n\nMembers: ${metadata.participants.length}\nAdmins: ${admins}\n\nDesc: ${metadata.desc || 'None'}`;
                await sock.sendMessage(jid, { text: infoText, mentions: metadata.participants.map(p => p.id) }, { quoted: context.msg });
                break;
            case 'getGroupLink':
                if (!context.botIsAdmin) throw new Error('Bot needs admin rights');
                if (!context.isAdmin && !context.isOwner) throw new Error('Only admins can get link');
                const code = await sock.groupInviteCode(jid);
                await sock.sendMessage(jid, { text: `https://chat.whatsapp.com/${code}` }, { quoted: context.msg });
                break;
            case 'revokeGroupLink':
                if (!context.botIsAdmin) throw new Error('Bot needs admin rights');
                if (!context.isAdmin && !context.isOwner) throw new Error('Only admins can revoke link');
                await sock.groupRevokeInvite(jid);
                break;
            case 'tagAll':
                if (!context.isAdmin && !context.isOwner) throw new Error('Only admins can tag all');
                const members = await sock.groupMetadata(jid);
                await sock.sendMessage(jid, { text: params.message || 'Attention everyone', mentions: members.participants.map(p => p.id) });
                break;
case 'antidelete':
    if (!context.isOwner) throw new Error('Only owner can configure anti-delete');
    const mode = target?.toLowerCase();
    if (mode === 'on' || mode === 'enable') {
        antideleteConfig.enabled = true;
        saveAntidelete();
        await sock.sendMessage(jid, { text: `Anti-Delete enabled. Mode: ${antideleteConfig.mode}` }, { quoted: context.msg });
    } else if (mode === 'off' || mode === 'disable') {
        antideleteConfig.enabled = false;
        saveAntidelete();
        await sock.sendMessage(jid, { text: 'Anti-Delete disabled' }, { quoted: context.msg });
    } else if (mode === 'public') {
        antideleteConfig.mode = 'public';
        antideleteConfig.publicTarget = params.target || jid;
        saveAntidelete();
        await sock.sendMessage(jid, { text: `Anti-Delete mode: PUBLIC\nDeletes will be sent to: ${antideleteConfig.publicTarget}` }, { quoted: context.msg });
    } else if (mode === 'private') {
        antideleteConfig.mode = 'private';
        antideleteConfig.privateTarget = params.target || botConfig.ownerNumber + '@s.whatsapp.net';
        saveAntidelete();
        await sock.sendMessage(jid, { text: `Anti-Delete mode: PRIVATE\nDeletes will be sent to: ${antideleteConfig.privateTarget}` }, { quoted: context.msg });
    } else if (mode === 'status') {
        const status = `*ANTI-DELETE STATUS*\n\nEnabled: ${antideleteConfig.enabled}\nMode: ${antideleteConfig.mode.toUpperCase()}\nPublic Target: ${antideleteConfig.publicTarget || 'Same chat'}\nPrivate Target: ${antideleteConfig.privateTarget}\nLog Edits: ${antideleteConfig.logEdits}\nLog ViewOnce: ${antideleteConfig.logViewOnce}`;
        await sock.sendMessage(jid, { text: status }, { quoted: context.msg });
    } else {
        throw new Error('Usage: antidelete on/off/public/private/status\nFor public: antidelete public\nFor private: antidelete private 255xxx@s.whatsapp.net');
    }
    addMemory(sender, 'command', 'antidelete');
    break;
case 'antiedit':
    if (!context.isOwner) throw new Error('Only owner can configure anti-edit');
    const editMode = target?.toLowerCase();
    if (editMode === 'on') {
        antideleteConfig.logEdits = true;
        saveAntidelete();
        await sock.sendMessage(jid, { text: 'Anti-Edit enabled' }, { quoted: context.msg });
    } else if (editMode === 'off') {
        antideleteConfig.logEdits = false;
        saveAntidelete();
        await sock.sendMessage(jid, { text: 'Anti-Edit disabled' }, { quoted: context.msg });
    }
    break;
case 'antiviewonce':
    if (!context.isOwner) throw new Error('Only owner can configure anti-viewonce');
    const voMode = target?.toLowerCase();
    if (voMode === 'on') {
        antideleteConfig.logViewOnce = true;
        saveAntidelete();
        await sock.sendMessage(jid, { text: 'Anti-ViewOnce enabled' }, { quoted: context.msg });
    } else if (voMode === 'off') {
        antideleteConfig.logViewOnce = false;
        saveAntidelete();
        await sock.sendMessage(jid, { text: 'Anti-ViewOnce disabled' }, { quoted: context.msg });
    }
    break;
            case 'hideTag':
                if (!context.isAdmin && !context.isOwner) throw new Error('Only admins can hide tag');
                const mems = await sock.groupMetadata(jid);
                await sock.sendMessage(jid, { text: params.message || '', mentions: mems.participants.map(p => p.id) });
                break;
            case 'leaveGroup':
                if (!context.isOwner) throw new Error('Only owner can make bot leave');
                await sock.groupLeave(jid);
                break;
            case 'downloadSong':
            case 'downloadVideo':
                const query = params.query || target;
                if (!query) throw new Error('Provide a search query');
                const search = await yts(query);
                if (search.videos.length > 0) {
                    const vid = search.videos[0];
                    await sock.sendMessage(jid, { text: `Found: ${vid.title}\nLink: ${vid.url}\nDuration: ${vid.timestamp}` }, { quoted: context.msg });
                } else {
                    throw new Error('Media not found');
                }
                break;
            case 'getProfilePic':
                const pjid = target || context.quotedSender || sender;
                try {
                    const ppUrl = await sock.profilePictureUrl(pjid, 'image');
                    await sock.sendMessage(jid, { image: { url: ppUrl }, caption: reply || 'Profile Picture' }, { quoted: context.msg });
                    if (context.reactMsgKey) {
                        await sock.sendMessage(jid, { delete: context.reactMsgKey });
                        context.reactMsgKey = null;
                    }
                } catch {
                    throw new Error('No profile picture found or user has privacy settings');
                }
                break;
            case 'deleteMessage':
                if (context.quotedMsg) {
                    if (context.quotedSender !== botJid && !context.botIsAdmin) throw new Error('Bot needs admin rights');
                    await sock.sendMessage(jid, { delete: context.quotedMsg.key });
                } else {
                    throw new Error("Reply to a message to delete");
                }
                break;
            case 'tosticker':
                if (!context.quotedMsg) throw new Error('Reply to image/video to convert to sticker');
                const mediaType1 = getMediaType(context.quotedMsg);
                if (!['jpg','png','mp4'].includes(mediaType1)) throw new Error('Reply to image or short video');
                const buffer1 = await downloadMediaMessage(context.quotedMsg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                const stickerBuffer = await convertMedia(buffer1, mediaType1, 'webp', context);
                await sock.sendMessage(jid, { sticker: stickerBuffer }, { quoted: context.msg });
                addMemory(sender, 'command', 'tosticker');
                break;
            case 'toimage':
            case 'topng':
            case 'tojpg':
                if (!context.quotedMsg) throw new Error('Reply to sticker/video to convert to image');
                const mediaType2 = getMediaType(context.quotedMsg);
                if (!mediaType2) throw new Error('Unsupported media type');
                const buffer2 = await downloadMediaMessage(context.quotedMsg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                const outType = action === 'tojpg' ? 'jpg' : 'png';
                const imageBuffer = await convertMedia(buffer2, mediaType2, outType, context);
                await sock.sendMessage(jid, { image: imageBuffer }, { quoted: context.msg });
                addMemory(sender, 'command', action);
                break;
            case 'tovideo':
            case 'tomp4':
                if (!context.quotedMsg) throw new Error('Reply to sticker/gif to convert to video');
                const mediaType3 = getMediaType(context.quotedMsg);
                if (!['webp','gif'].includes(mediaType3)) throw new Error('Reply to sticker or gif only');
                const buffer3 = await downloadMediaMessage(context.quotedMsg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                const videoBuffer = await convertMedia(buffer3, mediaType3, 'mp4', context);
                await sock.sendMessage(jid, { video: videoBuffer }, { quoted: context.msg });
                addMemory(sender, 'command', action);
                break;
            case 'toaudio':
            case 'tomp3':
            case 'tovoice':
                if (!context.quotedMsg) throw new Error('Reply to video to extract audio');
                const mediaType4 = getMediaType(context.quotedMsg);
                if (mediaType4 !== 'mp4') throw new Error('Reply to video only');
                const buffer4 = await downloadMediaMessage(context.quotedMsg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                const audioBuffer = await convertMedia(buffer4, 'mp4', 'mp3', context);
                if (action === 'tovoice') {
                    await sock.sendMessage(jid, { audio: audioBuffer, ptt: true }, { quoted: context.msg });
                } else {
                    await sock.sendMessage(jid, { audio: audioBuffer, mimetype: 'audio/mp4' }, { quoted: context.msg });
                }
                addMemory(sender, 'command', action);
                break;
            case 'togif':
                if (!context.quotedMsg) throw new Error('Reply to video/sticker to convert to gif');
                const mediaType5 = getMediaType(context.quotedMsg);
                if (!['mp4','webp'].includes(mediaType5)) throw new Error('Reply to video or sticker');
                const buffer5 = await downloadMediaMessage(context.quotedMsg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                const gifBuffer = await convertMedia(buffer5, mediaType5, 'gif', context);
                await sock.sendMessage(jid, { video: gifBuffer, gifPlayback: true }, { quoted: context.msg });
                addMemory(sender, 'command', 'togif');
                break;
            case 'towebp':
                if (!context.quotedMsg) throw new Error('Reply to image to convert to webp');
                const mediaType6 = getMediaType(context.quotedMsg);
                if (!['jpg','png'].includes(mediaType6)) throw new Error('Reply to image only');
                const buffer6 = await downloadMediaMessage(context.quotedMsg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                const webpBuffer = await convertMedia(buffer6, mediaType6, 'webp', context);
                await sock.sendMessage(jid, { sticker: webpBuffer }, { quoted: context.msg });
                addMemory(sender, 'command', 'towebp');
                break;
            case 'totext':
                if (!context.quotedMsg) throw new Error('Reply to image to extract text');
                const mediaType7 = getMediaType(context.quotedMsg);
                if (!['jpg','png'].includes(mediaType7)) throw new Error('Reply to image only');
                await sock.sendMessage(jid, { text: 'OCR not available. Install tesseract.js for text extraction.' }, { quoted: context.msg });
                addMemory(sender, 'command', 'totext');
                break;
            case 'setStatus':
            case 'setProfileStatus':
                if (!context.isOwner) throw new Error('Only owner can change bot status');
                await sock.updateProfileStatus(params.status || target);
                break;
            case 'changePrefix':
            case 'changeBotName':
                if (!context.isOwner) throw new Error('Only owner can change config');
                break;
            case 'enableAntiLink':
            case 'disableAntiLink':
            case 'enableAntiSpam':
            case 'disableAntiSpam':
            case 'setWelcome':
            case 'setGoodbye':
                if (!context.isAdmin && !context.isOwner) throw new Error('Only admins can change group settings');
                groupConfig.set(jid, { ...groupConfig.get(jid), [action]: params.message || true });
                break;
        }

        if (reply && context.reactMsgKey) {
            await sock.sendMessage(jid, { text: reply, edit: context.reactMsgKey });
            context.reactMsgKey = null;
        }
        if (react) {
            await sock.sendMessage(jid, { react: { text: react, key: context.msg.key } });
        }
    } catch (e) {
        console.error('Error:', e.message);
        if (context.reactMsgKey) {
            await sock.sendMessage(jid, { text: reply || `Error: ${e.message}`, edit: context.reactMsgKey });
        } else {
            await sock.sendMessage(jid, { text: reply || `Error: ${e.message}` }, { quoted: context.msg });
        }
        if (react) {
             await sock.sendMessage(jid, { react: { text: react || '❌', key: context.msg.key } });
        }
    }
}

async function startBot() {
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
            await new Promise(r => setTimeout(r, 5000));

            // TEST GROQ
            console.log('\x1b[34mTesting Primary API: Groq\x1b[0m');
            try {
                const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: 'llama-3.1-70b-versatile', messages: [{ role: 'user', content: 'hello' }], max_tokens: 10 })
                });
                const data = await res.json();
                console.log(res.status === 200 ? `\x1b[32mGROQ:\x1b[0m 200 OK` : `\x1b[31mGROQ:\x1b[0m ${res.status} | WARNING`);
            } catch (e) { console.log(`\x1b[31mGROQ:\x1b[0m ERROR: ${e.message}`); }

            // TEST GEMINI FALLBACK
            console.log('\x1b[34mTesting Fallback API: Gemini\x1b[0m');
            try {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: 'hello' }] }] })
                });
                console.log(res.status === 200 ? `\x1b[32mGEMINI:\x1b[0m 200 OK` : `\x1b[31mGEMINI:\x1b[0m ${res.status} | WARNING`);
            } catch (e) { console.log(`\x1b[31mGEMINI:\x1b[0m ERROR: ${e.message}`); }

            // SELF TEST MESSAGE
            try {
                await new Promise(r => setTimeout(r, 2000));
                await sock.sendMessage(sock.user.id, { text: 'BoNGo AI Online - All systems verified' });
                console.log('\x1b[32mSELF_PING:\x1b[0m Connected message sent');
            } catch (e) { console.log(`\x1b[31mSELF_PING:\x1b[0m Failed: ${e.message}`); }
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        
        for (const msg of m.messages) {
            if (!msg.message) continue; // Skip decrypt errors
            
            messageStore.set(msg.key.id, msg);

            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '';

            const sender = msg.key.participant || msg.key.remoteJid;
            const jid = msg.key.remoteJid;
            const isGroup = jid.endsWith('@g.us');
            const ownerNumber = process.env.OWNER_NUMBER + '@s.whatsapp.net';
            const isOwner = sender === ownerNumber;

            let groupName = 'Private Chat';
            let isAdmin = false;
            let botIsAdmin = false;
            
            if (isGroup) {
                try {
                    const groupMetadata = await sock.groupMetadata(jid);
                    groupName = groupMetadata.subject;
                    const participants = groupMetadata.participants;
                    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                    const senderParticipant = participants.find(p => p.id === sender);
                    const botParticipant = participants.find(p => p.id === botJid);
                    isAdmin = senderParticipant?.admin === 'admin' || senderParticipant?.admin === 'superadmin';
                    botIsAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin';
                } catch (e) {
                    console.error('Error fetching group metadata:', e.message);
                }
            }

            console.log(`\x1b[36mMSG:\x1b[0m ${text}`);
            console.log(`\x1b[33mWHERE:\x1b[0m ${isGroup ? groupName : 'Private Chat'}`);
            console.log(`\x1b[35mJID:\x1b[0m ${jid}`);
            console.log(`\x1b[32mCMD:\x1b[0m ${text.startsWith(botConfig.prefix)}`);

            if (!text.startsWith(botConfig.prefix)) continue;

            await sock.sendMessage(jid, { react: { text: "🤔", key: msg.key } });
            const waitMsgInfo = await sock.sendMessage(jid, { text: "🤔 Processing..." }, { quoted: msg });
            const reactMsgKey = waitMsgInfo.key;

            const context = {
                text, sender, isOwner, isGroup, groupName, isAdmin, botIsAdmin,
                botConfig,
                quotedMsg: msg.message?.extendedTextMessage?.contextInfo?.quotedMessage ? {
                    key: { remoteJid: jid, fromMe: false, id: msg.message.extendedTextMessage.contextInfo.stanzaId },
                    message: msg.message.extendedTextMessage.contextInfo.quotedMessage,
                } : null,
                quotedSender: msg.message?.extendedTextMessage?.contextInfo?.participant,
                mentionedJids: msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [],
                recentMessages: userMemory.get(sender) || [],
                reactMsgKey,
                msg
            };

            const plan = await callAI(context);
            
            // Update User Memory Context
            const uMem = userMemory.get(sender) || [];
            uMem.push({ role: 'user', content: text });
            uMem.push({ role: 'assistant', content: JSON.stringify({ action: plan.action, reply: plan.reply }) });
            if (uMem.length > 10) uMem.splice(0, uMem.length - 10);
            userMemory.set(sender, uMem);

            await executeAction(sock, plan, context);
        }
    });

    // Cache all messages for antidelete
    sock.ev.on('messages.upsert', async (m) => {
        if (m.type!== 'notify') return;
        for (const msg of m.messages) {
            if (!msg.key.fromMe && msg.message) {
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
                let text = `🚨 *ANTI-DELETE* 🚨\n\n*From:* @${senderName}\n*Chat:* ${isGroup? cached.chat : 'Private'}\n*Time:* ${delTime}\n*Type:* ${cached.type}\n\n*Deleted Message:*`;

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
                        let text = `✏️ *MESSAGE EDITED* ✏️\n\n*From:* @${senderName}\n*Time:* ${editTime}\n\n*Original:*`;
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
                        text: `👁️ *VIEW ONCE CAPTURED* 👁️\n\n*From:* @${senderName}\n*Time:* ${viewTime}`,
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
                    const attribution = `AntiDelete event detected in *${jid}*\nFrom: @${(originalMsg.key.participant || originalMsg.key.remoteJid).split('@')[0]}`;
                    await sock.sendMessage(ownerNumber, { text: attribution, mentions: [originalMsg.key.participant || originalMsg.key.remoteJid] });
                    await sock.sendMessage(ownerNumber, { forward: originalMsg });
                }
            }
        }
    });
}

startBot();
