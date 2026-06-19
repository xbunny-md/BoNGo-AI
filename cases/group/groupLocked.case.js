export default async function(sock, plan, context) {
    const { from, isGroup, isAdmin, isOwner } = context;
    if (!isGroup) throw new Error('This command works in groups only');
    if (!isAdmin && !isOwner) throw new Error('Only admins can execute this');
    await sock.groupSettingUpdate(from, 'locked');
    console.log('\x1b[32mGROUP_ACTION:\x1b[0m groupLocked executed');
}
