export default async function(sock, plan, context) {
    const { from, isOwner, senderNum } = context;
    console.log('\x1b[33mOWNER_CHECK:\x1b[0m senderNum:' + senderNum + ' isOwner:' + isOwner);
    if (!isOwner) {
        throw new Error('Only owner can use this command');
    }

    const name = plan.params ? plan.params.name : plan.target;
    if (!name) throw new Error('Name required');
    const fs = await import('fs');
    const file = './config.json';
    let conf = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {};
    conf.botName = name;
    process.env.BOT_NAME = name;
    fs.writeFileSync(file, JSON.stringify(conf, null, 2));
    await sock.updateProfileName(name).catch(()=>{});
    console.log('name changed to ' + name);
}
