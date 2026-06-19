export default async function(sock, plan, context) {
    const { from, isGroup, groupMetadata } = context;
    if (!isGroup) throw new Error('This command works in groups only');
    
    const info = '*Group Name:* ' + groupMetadata.subject + '
*Members:* ' + groupMetadata.participants.length + '
*Desc:* ' + (groupMetadata.desc || 'None');
    await sock.sendMessage(from, { text: info });
    console.log('\x1b[32mGROUP_ACTION:\x1b[0m getGroupInfo executed');
}
