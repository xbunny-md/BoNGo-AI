export default async (sock, plan, context) => {
    if (!context.isAdmin && !context.isOwner) throw new Error('Admin only');
    const mems = await sock.groupMetadata(context.jid);
    await sock.sendMessage(context.jid, { text: plan.params?.message || plan.reply || 'Attention everyone', mentions: mems.participants.map(p => p.id) }, { quoted: context.msg });
};