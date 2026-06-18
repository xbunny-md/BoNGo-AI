import {
    makeWASocket,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
    DisconnectReason,
    getContentType,
    downloadMediaMessage
} from '@whiskeysockets/baileys';
import pino from 'pino';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import yts from 'yt-search';
import express from 'express';
import { Buffer } from 'buffer';

dotenv.config();

const app = express();
app.get('/', (req, res) => res.json({ status: 'BoNGo AI is active' }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server bound to port ${PORT}`));

const botConfig = { prefix: process.env.PREFIX || ".", botName: process.env.BOT_NAME || "BoNGo AI" };
const userMemory = new Map();
const groupConfig = new Map();
const messageStore = new Map();
const rateLimitMap = new Map();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function getMessageText(msg) {
    if (!msg.message) return '';
    const type = getContentType(msg.message);
    if (type === 'conversation') return msg.message.conversation;
    if (type === 'extendedTextMessage') return msg.message.extendedTextMessage?.text;
    if (type === 'imageMessage') return msg.message.imageMessage?.caption;
    if (type === 'videoMessage') return msg.message.videoMessage?.caption;
    return '';
}

async function callAI(contextMsg) {
    const systemPrompt = `You are ${botConfig.botName}, an autonomous WhatsApp agent. Analyze user intent from text and context. Respond using the same language as the user. Return ONLY valid JSON with this schema: {"action": "string", "target": "string", "params": {}, "reply": "string", "react": "string", "updateConfig": {}}. Valid actions: sendMessage, kickUser, addUser, promoteUser, demoteUser, deleteMessage, downloadSong, downloadVideo, getProfilePic, getUserIP, likeStatus, enableAntiDelete, disableAntiDelete, forwardToDM, editMessage, setGroupDesc, setGroupSubject, setProfilePicture, updateProfilePicture, muteUser, unmuteUser, getStatusViewers, changePrefix, changeBotName, setStatus, setProfileStatus. Interpret user intent across languages. Map removal requests to kickUser, admin requests to promoteUser, media requests to downloadSong or downloadVideo, profile requests to getProfilePic, group management to setGroupSubject or setGroupDesc or setProfilePicture. For dangerous actions, verify isOwner or isAdmin before approving. On unauthorized attempt, set reply to permission denied message in user language. Apply updateConfig to modify runtime configuration.`;
    
    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt + ` Context: ${JSON.stringify(contextMsg)}` },
                { role: "user", content: contextMsg.text }
            ],
            model: "llama-3.1-70b-versatile",
            response_format: { type: "json_object" }
        });
        return JSON.parse(completion.choices[0].message.content);
    } catch (e) {
        console.error("Groq fallback", e.message);
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro", generationConfig: { responseMimeType: "application/json" } });
            const result = await model.generateContent(systemPrompt + `\nContext: ${JSON.stringify(contextMsg)}\nUser Input: ${contextMsg.text}`);
            return JSON.parse(result.response.text());
        } catch (e2) {
            console.error("Gemini fallback", e2.message);
            return { action: "sendMessage", reply: "AI Error: I'm currently unable to process requests.", react: "❌" };
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
            case 'kickUser':
                if (!context.botIsAdmin) throw new Error('Bot is not admin');
                if (!context.isAdmin && !context.isOwner) throw new Error('Permission denied');
                await sock.groupParticipantsUpdate(jid, [target || context.quotedSender || context.mentionedJids[0]], "remove");
                break;
            case 'addUser':
                if (!context.botIsAdmin) throw new Error('Bot is not admin');
                if (!context.isAdmin && !context.isOwner) throw new Error('Permission denied');
                await sock.groupParticipantsUpdate(jid, [target || params.user], "add");
                break;
            case 'promoteUser':
                if (!context.botIsAdmin) throw new Error('Bot is not admin');
                if (!context.isAdmin && !context.isOwner) throw new Error('Permission denied');
                await sock.groupParticipantsUpdate(jid, [target || context.quotedSender || context.mentionedJids[0]], "promote");
                break;
            case 'demoteUser':
                if (!context.botIsAdmin) throw new Error('Bot is not admin');
                if (!context.isAdmin && !context.isOwner) throw new Error('Permission denied');
                await sock.groupParticipantsUpdate(jid, [target || context.quotedSender || context.mentionedJids[0]], "demote");
                break;
            case 'setGroupSubject':
                if (!context.botIsAdmin) throw new Error('Bot is not admin');
                if (!context.isAdmin && !context.isOwner) throw new Error('Permission denied');
                await sock.groupUpdateSubject(jid, params.subject || target);
                break;
            case 'setGroupDesc':
                if (!context.botIsAdmin) throw new Error('Bot is not admin');
                if (!context.isAdmin && !context.isOwner) throw new Error('Permission denied');
                await sock.groupUpdateDescription(jid, params.desc || target);
                break;
            case 'downloadSong':
            case 'downloadVideo':
                const query = params.query || target;
                if (!query) throw new Error('Provide a search query');
                const search = await yts(query);
                if (search.videos.length > 0) {
                    const vid = search.videos[0];
                    await sock.sendMessage(jid, { text: `Found media: ${vid.title}\nLink: ${vid.url}` }, { quoted: context.msg });
                } else {
                    throw new Error('Media not found');
                }
                break;
            case 'enableAntiDelete':
                if (!context.isAdmin && !context.isOwner) throw new Error('Permission denied');
                groupConfig.set(jid, { ...groupConfig.get(jid), antiDelete: true });
                break;
            case 'disableAntiDelete':
                if (!context.isAdmin && !context.isOwner) throw new Error('Permission denied');
                groupConfig.set(jid, { ...groupConfig.get(jid), antiDelete: false });
                break;
            case 'getProfilePic':
                const pjid = target || context.quotedSender || sender;
                try {
                    const ppUrl = await sock.profilePictureUrl(pjid, 'image');
                    await sock.sendMessage(jid, { image: { url: ppUrl }, caption: reply || 'Profile Picture' }, { quoted: context.msg });
                    if (context.reactMsgKey) {
                        await sock.sendMessage(jid, { delete: context.reactMsgKey });
                        context.reactMsgKey = null; // Prevent editing deleted
                    }
                } catch {
                    throw new Error('No profile picture found');
                }
                break;
            case 'updateProfilePicture':
            case 'setProfilePicture':
                if (context.isGroup) {
                    if (!context.botIsAdmin) throw new Error('Bot is not admin');
                    if (!context.isAdmin && !context.isOwner) throw new Error('Permission denied');
                } else {
                    if (!context.isOwner) throw new Error('Permission denied');
                }
                if (context.quotedMsg && getContentType(context.quotedMsg.message) === 'imageMessage') {
                    const buffer = await downloadMediaMessage(context.quotedMsg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                    await sock.updateProfilePicture(jid, buffer);
                } else if (params.url) {
                     await sock.updateProfilePicture(jid, { url: params.url });
                } else {
                    throw new Error('Provide an image or URL');
                }
                break;
            case 'likeStatus':
                const statuses = await sock.fetchStatus();
                // Baileys doesn't have a direct 'likeStatus' but keeping stub as per requirement to not break JSON spec map execution.
                break;
            case 'deleteMessage':
                if (context.quotedMsg) {
                    if (context.quotedSender !== botJid && !context.botIsAdmin) throw new Error('Bot is not admin');
                    await sock.sendMessage(jid, { delete: context.quotedMsg.key });
                } else {
                    throw new Error("Reply to a message to delete");
                }
                break;
            case 'setStatus':
            case 'setProfileStatus':
                if (!context.isOwner) throw new Error('Permission denied');
                await sock.updateProfileStatus(params.status || target);
                break;
            case 'changePrefix':
            case 'changeBotName':
                // Already updated via updateConfig handling
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
    const sessionId = process.env.SESSION_ID || '';
    if (!sessionId.startsWith('SWIFTBOT~')) {
        console.error('Invalid SESSION_ID. Must start with SWIFTBOT~');
        return;
    }

    let parsedCreds;
    try {
        const base64Str = sessionId.split('SWIFTBOT~')[1];
        const jsonStr = Buffer.from(base64Str, 'base64').toString('utf-8');
        parsedCreds = JSON.parse(jsonStr);
    } catch (e) {
        console.error('Failed to parse SESSION_ID', e);
        return;
    }

    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
        auth: {
            creds: parsedCreds,
            keys: makeCacheableSignalKeyStore({}, pino({ level: 'silent' }))
        },
        version,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome'),
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        markOnlineOnConnect: true,
        syncFullHistory: false
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
            else process.exit(0);
        } else if (connection === 'open') {
            console.log('BoNGo AI connected to WhatsApp');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        
        for (let msg of m.messages) {
            if (!msg.message || msg.key.fromMe) continue;
            
            messageStore.set(msg.key.id, msg);

            const text = getMessageText(msg);
            if (!text.startsWith(botConfig.prefix)) continue;

            const sender = msg.key.participant || msg.key.remoteJid;
            const jid = msg.key.remoteJid;
            const isGroup = jid.endsWith('@g.us');
            const ownerNumber = process.env.OWNER_NUMBER + '@s.whatsapp.net';
            const isOwner = sender === ownerNumber;
            
            // Rate Limit Logic
            if (!isOwner) {
                const now = Date.now();
                const userRates = rateLimitMap.get(sender) || [];
                const recentRates = userRates.filter(t => now - t < 300000); // 5 min rolling window
                if (recentRates.length >= 4) {
                    await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } });
                    await sock.sendMessage(jid, { text: "Rate limit exceeded. Please wait 5 minutes." }, { quoted: msg });
                    continue;
                }
                recentRates.push(now);
                rateLimitMap.set(sender, recentRates);
            }

            await sock.sendMessage(jid, { react: { text: "🤔", key: msg.key } });
            const waitMsgInfo = await sock.sendMessage(jid, { text: "🤔 Processing..." }, { quoted: msg });
            const reactMsgKey = waitMsgInfo.key;

            let groupName = "";
            let isAdmin = false;
            let botIsAdmin = false;
            
            if (isGroup) {
                const groupMetadata = await sock.groupMetadata(jid);
                groupName = groupMetadata.subject;
                const participants = groupMetadata.participants;
                const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                const senderParticipant = participants.find(p => p.id === sender);
                const botParticipant = participants.find(p => p.id === botJid);
                isAdmin = senderParticipant?.admin === 'admin' || senderParticipant?.admin === 'superadmin';
                botIsAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin';
            }

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
