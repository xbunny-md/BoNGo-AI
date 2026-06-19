export default async function(sock, plan, context) {
    const { from, isOwner, senderNum } = context;
    console.log('\x1b[33mOWNER_CHECK:\x1b[0m senderNum:' + senderNum + ' isOwner:' + isOwner);
    if (!isOwner) {
        throw new Error('Only owner can use this command');
    }

    const prefix = plan.params ? plan.params.prefix : plan.target;
    if (!prefix) throw new Error('Prefix required');
    const fs = await import('fs');
    const file = './config.json';
    let conf = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {};
    conf.prefix = prefix;
    process.env.PREFIX = prefix;
    fs.writeFileSync(file, JSON.stringify(conf, null, 2));
    console.log('prefix changed to ' + prefix);
}
