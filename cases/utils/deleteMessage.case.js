export default async (sock, plan, context) => {
    if (context.quotedMsg) {
        if (!context.botIsAdmin && !context.quotedMsg.key['fromMe']) throw new Error('Bot needs admin to delete others messages');
        await sock.sendMessage(context.jid, { delete: context.quotedMsg.key });
    } else {
        throw new Error("Reply to a message to delete");
    }
};