export default async (sock, plan, context) => {
    const start = Date.now();
    await sock.sendMessage(context.jid, { text: `Pong! ${Date.now() - start}ms` }, { quoted: context.msg });
};
