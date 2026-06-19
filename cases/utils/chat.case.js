export default async (sock, plan, context) => {
    if (plan.reply) {
        await sock.sendMessage(context.jid, { text: plan.reply }, { quoted: context.msg });
    }
};