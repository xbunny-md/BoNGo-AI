export default async (sock, plan, context) => {
    let target = plan.target || context.sender;
    if (target === 'sender' || target === 'contextMsg.sender') {
        target = context.sender;
    }
    
    // Adjust target format if necessary
    if (!target.includes('@')) {
        target = target + '@s.whatsapp.net';
    }

    try {
        const ppUrl = await sock.profilePictureUrl(target, 'image');
        const caption = plan.reply || 'Here is the profile picture!';
        await sock.sendMessage(context.jid, { image: { url: ppUrl }, caption }, { quoted: context.msg });
    } catch (e) {
        throw new Error('Could not fetch profile picture (user might have it hidden)');
    }
};
