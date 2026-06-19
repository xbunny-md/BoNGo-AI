export default async (sock, plan, context) => {
    if (!context.botIsAdmin) throw new Error('Bot requires admin');
    if (!context.isAdmin && !context.isOwner) throw new Error('Admin only');
    const target = plan.target || context.params?.number + '@s.whatsapp.net';
    if (!target) throw new Error('Specify a number to add');
    await sock.groupParticipantsUpdate(context.jid, [target], "add");
    if (plan.reply) await sock.sendMessage(context.jid, { text: plan.reply }, { quoted: context.msg });
};