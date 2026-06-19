export default async function(sock, plan, context) {
    const { from, isGroup, isAdmin, isOwner } = context;
    if (!isGroup) throw new Error('This command works in groups only');
    if (!isAdmin && !isOwner) throw new Error('Only admins can unmute');
    
    await sock.groupSettingUpdate(from, 'not_announcement');
    console.log('\x1b[32mGROUP_ACTION:\x1b[0m unmute executed');
}
