export default async function(sock, plan, context) {
    const { from, isOwner, senderNum } = context;
    console.log('\x1b[33mOWNER_CHECK:\x1b[0m senderNum:' + senderNum + ' isOwner:' + isOwner);
    if (!isOwner) {
        throw new Error('Only owner can use this command');
    }

    const fs = await import('fs');
    const file = './antidelete.json';
    let conf = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { cache: {} };
    const mode = plan.target || (plan.params ? plan.params.target : 'status');
    
    if (mode === 'on') conf.enabled = true;
    else if (mode === 'off') conf.enabled = false;
    else if (mode === 'public') conf.mode = 'public';
    else if (mode === 'private') conf.mode = 'private';
    
    fs.writeFileSync(file, JSON.stringify(conf, null, 2));
    await sock.sendMessage(context.jid, { text: 'Anti-delete updated: ' + mode }, { quoted: context.msg });
}
