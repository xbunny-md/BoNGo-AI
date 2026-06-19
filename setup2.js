import fs from 'fs';
const content = fs.readFileSync('index.js', 'utf8');

const callAiStart = content.indexOf('// UNIVERSAL AI ROUTER - DECIDES EVERYTHING');
let upsertEnd = content.indexOf('// Cache all messages for antidelete');
if (callAiStart === -1 || upsertEnd === -1) {
    console.log("NOT FOUND");
    process.exit(1);
}

const newLogic = `// UNIVERSAL AI ROUTER - DECIDES EVERYTHING
async function callAI(contextMsg) {
    const systemPrompt = \`You are \${botConfig.botName}, a fully autonomous WhatsApp AI. Return ONLY valid JSON: {"action":"string","target":"string","params":{},"reply":"string","react":"string"}.

AVAILABLE ACTIONS: \${Array.from(cases.keys()).join(', ')}, chat

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
isOwner: \${contextMsg.isOwner}, isAdmin: \${contextMsg.isAdmin}, botIsAdmin: \${contextMsg.botIsAdmin}, isGroup: \${contextMsg.isGroup}

CONTEXT: \${JSON.stringify(contextMsg)}\`;

    const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: contextMsg.text }];

    // TRY GROQ - KEY PER MODEL WITH ROTATION
    const groqModels = ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'];
    for (const model of groqModels) {
        const keyData = getGroqKey(model);
        if (!keyData) continue;
        try {
            const result = await callGroqAxios(model, messages, keyData.key);
            console.log(\`\\x1b[32mAI_GROQ:\\x1b[0m \${model}\`);
            if (!result.react) result.react = "💬";
            return result;
        } catch (e) {
            const status = e.response?.status;
            if (status === 429) console.log(\`\\x1b[33mAI_GROQ_FAIL:\\x1b[0m \${model} limit hit\`);
            else console.log(\`\\x1b[33mAI_GROQ_FAIL:\\x1b[0m \${model} \${status || e.message}\`);
        }
    }

    // FALLBACK GEMINI - KEY ROTATION
    const geminiKey = getGeminiKey();
    if (geminiKey) {
        try {
            const result = await callGeminiAxios(systemPrompt + \`\\nUser Input: \${contextMsg.text}\`, geminiKey);
            console.log(\`\\x1b[32mAI_GEMINI:\\x1b[0m Success\`);
            if (!result.react) result.react = "💬";
            return result;
        } catch (e) {
            console.log(\`\\x1b[33mAI_GEMINI_FAIL:\\x1b[0m \${e.response?.status || e.message}\`);
        }
    }

    return { action: "chat", reply: "All AI providers failed. Check API keys or try again.", react: "❌" };
}


async function startBot() {
    console.log('\\x1b[32mSERVER:\\x1b[0m Starting...');
    console.log('\\x1b[34mBoNGo AI Starting...\\x1b[0m');
    console.log('\\x1b[34mSESSION_ID Valid:\\x1b[0m', process.env.SESSION_ID.startsWith('SWIFTBOT~'));
    if (!process.env.SESSION_ID.startsWith('SWIFTBOT~')) {
        console.error('Invalid SESSION_ID. Must start with SWIFTBOT~');
        return;
    }

    let parsedCreds;
    try {
        parsedCreds = JSON.parse(Buffer.from(process.env.SESSION_ID.replace('SWIFTBOT~', ''), 'base64').toString());
        parsedCreds = convertBuffers(parsedCreds);
        console.log('\\x1b[32mBuffer conversion complete\\x1b[0m');
        console.log('\\x1b[34mCredentials parsed successfully\\x1b[0m');
        
        if (!parsedCreds.noiseKey || !parsedCreds.signedIdentityKey) {
            console.log('\\x1b[31mSESSION CORRUPTED:\\x1b[0m Missing keys. Re-generate SESSION_ID.');
            process.exit(1);
        }
    } catch (e) {
        console.error('Failed to parse SESSION_ID', e);
        return;
    }

    console.log('\\x1b[34mSocket created, connecting...\\x1b[0m');
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
            console.log('\\x1b[31mConnection closed:\\x1b[0m', lastDisconnect?.error?.message);
            if(shouldReconnect) setTimeout(() => startBot(), 5000);
        }
        
        if(connection === 'open') {
            console.log('\\x1b[32mBoNGo AI Connected as:\\x1b[0m', sock.user.id);
        }
    });

    // ZERO-COMMAND MESSAGE HANDLER
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        let text = getMessageText(msg);
        const prefix = process.env.PREFIX || botConfig.prefix;
        if (!text || !text.startsWith(prefix)) {
            return;
        }

        const sender = msg.key.participant || msg.key.remoteJid;
        const jid = msg.key.remoteJid;
        const isGroup = jid.endsWith('@g.us');

        console.log(\`\\x1b[36mMSG:\\x1b[0m \${text || '[Media]'}\`);
        console.log(\`\\x1b[36mWHERE:\\x1b[0m \${isGroup ? 'Group' : 'DM'}\`);
        console.log(\`\\x1b[36mFROM:\\x1b[0m \${sender.split('@')[0]}\`);
        console.log(\`\\x1b[36mJID:\\x1b[0m \${jid}\`);

        text = text.slice(prefix.length).trim();

        // React immediately
        try {
            await sock.sendMessage(jid, { react: { text: '🤔', key: msg.key } });
        } catch(e) {}

        let processingMsg = null;
        try {
            processingMsg = await sock.sendMessage(jid, { text: '🤔 Processing...' }, { quoted: msg });
            console.log('\\x1b[35mPROCESSING:\\x1b[0m Sent');
        } catch(e) {
            console.log('\\x1b[31mPROCESSING_FAIL:\\x1b[0m', e.message);
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
            console.log(\`\\x1b[36mAI_INPUT:\\x1b[0m Context collected\`);
            const plan = await callAI(contextMsg);
            console.log(\`\\x1b[36mAI_PLAN:\\x1b[0m Action: \${plan.action}, React: \${plan.react}\`);

            if (plan.react) {
                try {
                    await sock.sendMessage(jid, { react: { text: plan.react, key: msg.key } });
                    console.log(\`\\x1b[32mREACT:\\x1b[0m \${plan.react}\`);
                } catch(e) { console.log(\`\\x1b[31mREACT_FAIL:\\x1b[0m\`, e.message); }
            }

            let execResultText = plan.reply || 'Task completed';
            
            if (plan.action && cases.has(plan.action)) {
                console.log(\`\\x1b[32mCASE_EXEC:\\x1b[0m \${plan.action}\`);
                const caseFile = cases.get(plan.action);
                const { default: executeCase } = await import(\`file://\${caseFile}\`);
                await executeCase(sock, plan, {...contextMsg, msg, getContentType, downloadMediaMessage, addMemory, getMemory });
            } else if (plan.reply) {
                // Do nothing, reply will be in processing message
            }

            if (processingMsg) {
                try {
                    await sock.sendMessage(jid, { text: \`✅ \${execResultText}\`, edit: processingMsg.key });
                    console.log(\`\\x1b[32mEDIT:\\x1b[0m Success\`);
                } catch(e) { console.log(\`\\x1b[31mEDIT_FAIL:\\x1b[0m\`, e.message); }
            }

            try {
                await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
                console.log(\`\\x1b[32mFINAL_REACT:\\x1b[0m ✅\`);
            } catch(e) { console.log(\`\\x1b[31mFINAL_REACT_FAIL:\\x1b[0m\`, e.message); }

        } catch (e) {
            console.log('\\x1b[31mCASE_ERROR:\\x1b[0m', e.message);
            if (processingMsg) {
                try {
                    await sock.sendMessage(jid, { text: \`❌ Error: \${e.message}\`, edit: processingMsg.key });
                    console.log(\`\\x1b[32mEDIT:\\x1b[0m Error shown\`);
                } catch(err) { console.log(\`\\x1b[31mEDIT_FAIL:\\x1b[0m\`, err.message); }
            }
            try {
                await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
                console.log(\`\\x1b[32mFINAL_REACT:\\x1b[0m ❌\`);
            } catch(err) { console.log(\`\\x1b[31mFINAL_REACT_FAIL:\\x1b[0m\`, err.message); }
        }
    });

    `;

fs.writeFileSync('index.js', content.substring(0, callAiStart) + newLogic + content.substring(upsertEnd));
console.log('Update successful');
