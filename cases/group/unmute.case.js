export default async (sock, plan, context) => {
    if (!context.isAdmin && !context.isOwner) throw new Error('Admin only');
    if (!context.botIsAdmin) throw new Error('Bot requires admin');
    await sock.groupSettingUpdate(context.jid, 'not_announcement');
    if (plan.reply) await sock.sendMessage(context.jid, { text: plan.reply }, { quoted: context.msg });
};