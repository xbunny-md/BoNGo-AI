import fs from 'fs';
export default async (sock, plan, context) => {
    if (!context.isOwner) throw new Error('Only owner can configure anti-edit');
    const file = './antidelete.json';
    let conf = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { cache: {} };
    const mode = plan.target || plan.params?.target || 'status';
    
    if (mode === 'on') conf.logEdits = true;
    else if (mode === 'off') conf.logEdits = false;
    else throw new Error("Specify 'on' or 'off'");
    
    fs.writeFileSync(file, JSON.stringify(conf, null, 2));
    await sock.sendMessage(context.jid, { text: `Anti-edit updated to: ${mode}` }, { quoted: context.msg });
};
