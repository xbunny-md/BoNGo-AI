export default async function(sock, plan, context) {
    const { from, isGroup, participants, sender, isAdmin, isOwner } = context;
    if (!isGroup) throw new Error('This command works in groups only');
    if (!isAdmin && !isOwner) throw new Error('Only admins can tag everyone');
    
    const allJids = participants.map(p => p.id);
    const text = plan.params && plan.params.text ? plan.params.text : 'Tagged by @' + sender.split('@')[0];
    
    await sock.sendMessage(from, { 
        text: text,
        mentions: allJids
    });
    console.log('\x1b[32mGROUP_ACTION:\x1b[0m tagall executed, tagged ' + allJids.length + ' members');
}
