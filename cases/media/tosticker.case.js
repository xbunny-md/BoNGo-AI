export default async (sock, plan, context) => {
    if (!context.quotedMsg) throw new Error('Reply to image or video');
    const type = context.getContentType(context.quotedMsg.message);
    if (!['imageMessage','videoMessage'].includes(type)) throw new Error('Reply to image or video only');
    const buffer = await context.downloadMediaMessage(context.quotedMsg, 'buffer', {}, { logger: { level: 'silent' } });
    await sock.sendMessage(context.jid, { sticker: buffer }, { quoted: context.msg });
};