export default async function(sock, plan, context) {
    const { from, isGroup, isAdmin, isOwner } = context;
    if (!isGroup) throw new Error('This command works in groups only');
    if (!isAdmin && !isOwner) throw new Error('Only admins can execute this');
    
    const targets = plan.target ? [plan.target] : [];
    await sock.groupParticipantsUpdate(from, targets, 'reject');
    console.log('\x1b[32mGROUP_ACTION:\x1b[0m groupRejectJoin executed');
}
