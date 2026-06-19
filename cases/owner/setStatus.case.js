export default async function(sock, plan, context) {
    const { from, isOwner, senderNum } = context;
    console.log('\x1b[33mOWNER_CHECK:\x1b[0m senderNum:' + senderNum + ' isOwner:' + isOwner);
    if (!isOwner) {
        throw new Error('Only owner can use this command');
    }

    const status = plan.params ? plan.params.status : plan.target;
    if (!status) throw new Error('Status required');
    await sock.updateProfileStatus(status);
    console.log('status changed to ' + status);
}
