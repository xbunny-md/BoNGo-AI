import fs from 'fs';
export default async (sock, plan, context) => {
    if (!context.isOwner) throw new Error('Only owner can configure anti-delete');
    const file = './antidelete.json';
    let conf = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { cache: {} };
    const mode = plan.target || plan.params?.target || 'status';
    
    if (mode === 'on') conf.enabled = true;
    else if (mode === 'off') conf.enabled = false;
    else if (mode === 'public') conf.mode = 'public';
    else if (mode === 'private') conf.mode = 'private';
    
    fs.writeFileSync(file, JSON.stringify(conf, null, 2));
    await sock.sendMessage(context.jid, { text: `Anti-delete updated: ${mode}` }, { quoted: context.msg });
};