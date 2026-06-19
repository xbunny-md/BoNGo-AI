export default async (sock, plan, context) => {
    const text = `*BoNGo AI Menu*
    
AI Router Active! Speak naturally:
- "download this tiktok" (reply to link)
- "kick @user"
- "make sticker" (reply to image)
- "ping"
- "tag everyone"
- "delete message"`;
    await sock.sendMessage(context.jid, { text: plan.reply || text }, { quoted: context.msg });
};