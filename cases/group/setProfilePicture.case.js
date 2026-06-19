export default async function(sock, plan, context) {
    const { from, isGroup, isAdmin, isOwner, msg, downloadMediaMessage } = context;
    if (!isGroup) throw new Error('This command works in groups only');
    if (!isAdmin && !isOwner) throw new Error('Only admins can execute this');
    
    const mediaObj = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage ? 
        { message: msg.message.extendedTextMessage.contextInfo.quotedMessage, key: msg.key } : null;
        
    if (!mediaObj) throw new Error('Reply to an image to set as profile picture');
    const media = await downloadMediaMessage(mediaObj, 'buffer', {}, { logger: console });
    await sock.updateProfilePicture(from, media);
    console.log('\x1b[32mGROUP_ACTION:\x1b[0m setProfilePicture executed');
}
