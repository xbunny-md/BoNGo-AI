export default async function(sock, plan, context) {
    const { from, isGroup, groupMetadata } = context;
    if (!isGroup) throw new Error('This command works in groups only');
    await sock.sendMessage(from, { text: 'Ephemeral Duration: ' + groupMetadata.ephemeralDuration });
    console.log('\x1b[32mGROUP_ACTION:\x1b[0m getGroupEphemeral executed');
}
