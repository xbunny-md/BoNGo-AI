export default async function(sock, plan, context) {
    const { from, isGroup, participants, groupAdmins, sender, isOwner } = context;
    if (!isGroup) throw new Error('This command works in groups only');
    if (!isOwner) throw new Error('Only owner can use kickall');
    
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const toRemove = participants
        .map(p => p.id)
        .filter(id => !groupAdmins.includes(id) && id !== botId && id !== sender);
        
    for (const jid of toRemove) {
        await sock.groupParticipantsUpdate(from, [jid], 'remove');
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log('\x1b[32mGROUP_ACTION:\x1b[0m kickall executed, removed ' + toRemove.length + ' members');
    await sock.sendMessage(from, { text: 'Removed ' + toRemove.length + ' members.' });
}
