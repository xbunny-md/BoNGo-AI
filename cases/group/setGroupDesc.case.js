export default async function(sock, plan, context) {
    const { from, isGroup, isAdmin, isOwner } = context;
    if (!isGroup) throw new Error('This command works in groups only');
    if (!isAdmin && !isOwner) throw new Error('Only admins can change description');
    
    const desc = (plan.params && plan.params.desc) ? plan.params.desc : (plan.reply || 'New Description');
    await sock.groupUpdateDescription(from, desc);
    console.log('\x1b[32mGROUP_ACTION:\x1b[0m setGroupDesc executed');
}
