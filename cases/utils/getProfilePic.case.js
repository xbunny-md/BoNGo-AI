export default async function(sock, plan, context) {
    const { from, msg, quotedJid, mentionedJids } = context;
    let targetJid = '';
    if (plan.target && plan.target.includes('@')) {
        targetJid = plan.target;
    } else if (quotedJid) {
        targetJid = quotedJid;
    } else if (mentionedJids && mentionedJids.length > 0) {
        targetJid = mentionedJids[0];
    } else {
        targetJid = msg.key.participant || msg.key.remoteJid;
    }
    console.log('\x1b[33mDP_TARGET:\x1b[0m ' + targetJid);
    try {
        const ppUrl = await sock.profilePictureUrl(targetJid, 'image');
        await sock.sendMessage(from, { image: { url: ppUrl }, caption: 'Profile picture of @' + targetJid.split('@')[0], mentions: [targetJid] });
        console.log('\x1b[32mDP_SUCCESS:\x1b[0m ' + targetJid);
    } catch (e) {
        console.log('\x1b[31mDP_FAIL:\x1b[0m ' + targetJid + ' - ' + e.message);
        throw new Error('Could not fetch profile picture. User might have it hidden or privacy blocked.');
    }
}
