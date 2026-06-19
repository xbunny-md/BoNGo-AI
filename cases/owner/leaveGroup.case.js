export default async function(sock, plan, context) {
    const { from, isOwner, senderNum } = context;
    console.log('\x1b[33mOWNER_CHECK:\x1b[0m senderNum:' + senderNum + ' isOwner:' + isOwner);
    if (!isOwner) {
        throw new Error('Only owner can use this command');
    }

    if (!context.isGroup) throw new Error('Not in a group');
    await sock.groupLeave(context.jid);
    console.log('left group');
}
