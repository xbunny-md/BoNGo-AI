import fs from 'fs';
export default async function(sock, plan, context) {
    const { from, isOwner, senderNum } = context;
    console.log('\x1b[33mOWNER_CHECK:\x1b[0m senderNum:' + senderNum + ' isOwner:' + isOwner);
    if (!isOwner) {
        throw new Error('Only owner can use this command');
    }
    
    const file = './antidelete.json';
    let conf = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { cache: {} };
    const mode = plan.target || plan.params?.target || 'status';
    
    if (mode === 'on') conf.logViewOnce = true;
    else if (mode === 'off') conf.logViewOnce = false;
    else throw new Error("Specify 'on' or 'off'");
    
    fs.writeFileSync(file, JSON.stringify(conf, null, 2));
    await sock.sendMessage(context.jid, { text: `Anti-viewonce updated to: ${mode}` }, { quoted: context.msg });
};
