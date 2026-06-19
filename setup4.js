import fs from 'fs';
const content = fs.readFileSync('index.js', 'utf8');

const callAiStart = content.indexOf('// UNIVERSAL AI ROUTER - DECIDES EVERYTHING');
let upsertEnd = content.indexOf('// Cache all messages for antidelete');

if (callAiStart === -1 || upsertEnd === -1) {
    console.log('NOT FOUND');
    process.exit(1);
}

const newLogic = `// UNIVERSAL AI ROUTER - DECIDES EVERYTHING
async function callAI(contextMsg, quotedJid, mentionedJids) {
    const systemPrompt = \`You are \${botConfig.botName}, BoNGo AI Router. Return valid JSON ONLY. No text outside JSON.
Output: {"action":"string","target":"string","params":{},"reply":"string","react":"string"}

AVAILABLE ACTIONS: \${Array.from(cases.keys()).join(', ')}, chat

CORE RULES:
1. "action" MUST EXACTLY match a filename in /cases/ without .case.js.
2. If action is NOT "chat", set reply:"". Case file sends all output. AI must NOT generate content for cases.
3. If action is "chat", set reply to your answer.
4. DYNAMIC TARGET RESOLUTION: If the user message implies an action on another user, use context to set target. Priority: 1. If message is replying to someone, set target to quoted participant JID. 2. If message mentions users, set target to first mentioned JID. 3. If user refers to themselves or no target found, set target:"sender". NEVER leave target empty for user-targeted actions.
5. For game related intents -> action:"ttt", react:"🎮", reply:""
6. For status check intents -> action:"ping", react:"⚡", reply:""
7. For menu help intents -> action:"menu", react:"📋", reply:""
8. For profile picture intents -> action:"getProfilePic", react:"🖼️", reply:"", target: apply DYNAMIC TARGET RESOLUTION rule
9. For TikTok link detected -> action:"tiktok", react:"⏬", reply:""
10. For Facebook link detected -> action:"facebook", react:"⏬", reply:""
11. For Instagram link detected -> action:"instagram", react:"⏬", reply:""
12. NEVER write descriptive phrases like "Task completed", "Done", "Here is", "Starting" in reply field unless action is "chat".
13. "react" must be single emoji related to action.
14. If no case matches -> action:"chat", react:"💬", reply:"your answer"
15. Bot can reply to itself. Allow self-referential actions but never reply to processing/edit status messages.

User input after prefix: \${contextMsg.text}
Quoted participant JID: \${quotedJid || ''}
Mentioned JIDs: \${mentionedJids.join(', ')}

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

        const sender = msg.key.participant || msg.key.remoteJid;
        const jid = msg.key.remoteJid;
        const isGroup = jid.endsWith('@g.us');

        console.log(\`\\x1b[36mMSG:\\x1b[0m \${text || '[Media]'}\`);
        console.log(\`\\x1b[36mWHERE:\\x1b[0m \${isGroup ? 'Group' : 'DM'}\`);
        console.log(\`\\x1b[36mFROM:\\x1b[0m \${sender.split('@')[0]}\`);
        console.log(\`\\x1b[36mJID:\\x1b[0m \${jid}\`);

        text = text.slice(prefix.length).trim();

        const quotedJid = msg.message?.extendedTextMessage?.contextInfo?.participant;
        const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

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
            quotedSender: quotedJid,
            mentionedJids: mentionedJids,
            hasMedia: !!msg.message?.imageMessage || !!msg.message?.videoMessage || !!msg.message?.stickerMessage || !!msg.message?.audioMessage,
            mediaType: getContentType(msg.message)
        };

        try {
            console.log(\`\\x1b[36mAI_INPUT:\\x1b[0m Context collected\`);
            const plan = await callAI(contextMsg, quotedJid, mentionedJids);
            console.log(\`\\x1b[36mAI_PLAN:\\x1b[0m Action: \${plan.action}, React: \${plan.react}, Target: \${plan.target}\`);

            if (plan.react) {
                try {
                    await sock.sendMessage(jid, { react: { text: plan.react, key: msg.key } });
                    console.log(\`\\x1b[32mREACT:\\x1b[0m \${plan.react}\`);
                } catch(e) { console.log(\`\\x1b[31mREACT_FAIL:\\x1b[0m\`, e.message); }
            }

            if (plan.action && plan.action !== 'chat' && cases.has(plan.action)) {
                console.log(\`\\x1b[32mCASE_EXEC:\\x1b[0m \${plan.action}\`);
                const caseFile = cases.get(plan.action);
                const { default: executeCase } = await import(\`file://\${caseFile}\`);
                await executeCase(sock, plan, {
                    ...contextMsg, 
                    from: jid,
                    msg, 
                    quotedJid,
                    mentionedJids,
                    getContentType, 
                    downloadMediaMessage, 
                    addMemory, 
                    getMemory 
                });
                console.log('\\x1b[32mTASK_DONE:\\x1b[0m Case completed');
            } else {
                if (plan.reply) {
                    await sock.sendMessage(jid, { text: plan.reply }, { quoted: msg });
                }
                console.log('\\x1b[32mTASK_DONE:\\x1b[0m Chat replied');
            }

            if (processingMsg) {
                try {
                    await sock.sendMessage(jid, { text: '✅', edit: processingMsg.key });
                    console.log(\`\\x1b[32mEDIT:\\x1b[0m Success\`);
                } catch(e) { console.log(\`\\x1b[31mEDIT_FAIL:\\x1b[0m\`, e.message); }
            }

            try {
                await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
                console.log(\`\\x1b[32mFINAL_REACT:\\x1b[0m ✅\`);
            } catch(e) { console.log(\`\\x1b[31mFINAL_REACT_FAIL:\\x1b[0m\`, e.message); }

        } catch (e) {
            console.log('\\x1b[31mCASE_ERROR:\\x1b[0m', e.message);
            console.log('\\x1b[31mTASK_FAIL:\\x1b[0m', e.message);
            if (processingMsg) {
                try {
                    await sock.sendMessage(jid, { text: '❌', edit: processingMsg.key });
                    console.log(\`\\x1b[32mEDIT:\\x1b[0m Error shown\`);
                } catch(err) { console.log(\`\\x1b[31mEDIT_FAIL:\\x1b[0m\`, err.message); }
            }
            try {
                await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
                console.log(\`\\x1b[32mFINAL_REACT:\\x1b[0m ❌\`);
            } catch(err) { console.log(\`\\x1b[31mFINAL_REACT_FAIL:\\x1b[0m\`, err.message); }
        }
    });

    \n`

fs.writeFileSync('index.js', content.substring(0, callAiStart) + newLogic + content.substring(upsertEnd));
console.log('Update successful');
