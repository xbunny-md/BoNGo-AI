export default async function(sock, plan, context) {
    const { from, isGroup, isAdmin, isOwner } = context;
    if (!isGroup) throw new Error('This command works in groups only');
    if (!isAdmin && !isOwner) throw new Error('Only admins can execute this');
    
    const duration = plan.params && plan.params.duration !== undefined ? plan.params.duration : 604800; // default 7 days
    await sock.groupToggleEphemeral(from, duration);
    console.log('\x1b[32mGROUP_ACTION:\x1b[0m setGroupEphemeral executed: ' + duration);
}
