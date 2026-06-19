export default async (sock, plan, context) => {
    if (!context.botIsAdmin) throw new Error('Bot requires admin');
    if (!context.isAdmin && !context.isOwner) throw new Error('Admin only');
    const target = plan.target || context.quotedSender || context.mentionedJids[0];
    if (!target) throw new Error('Reply to user or mention them');
    await sock.groupParticipantsUpdate(context.jid, [target], "demote");
    if (plan.reply) await sock.sendMessage(context.jid, { text: plan.reply }, { quoted: context.msg });
};