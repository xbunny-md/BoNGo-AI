export default async (sock, plan, context) => {
    if (!context.isOwner) throw new Error('Only owner can use this');
    await sock.sendMessage(context.jid, { text: 'AI Router is active. Prefix is no longer strictly required, but recorded.' }, { quoted: context.msg });
};