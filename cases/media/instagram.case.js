import axios from 'axios';

const IG_APIS = [
    'https://api.cobalt.tools/api/json',
    'https://co.wuk.sh/api/json',
    'https://api.savefrom.net/api/convert?url=',
    'https://api.downloadgram.org/instagram?url=',
    'https://api.videodownloader.so/instagram?url=',
    'https://snapinsta.app/api/ajaxSearch?q=',
    'https://igdownloader.com/api/ajaxSearch?q=',
    'https://instasave.website/api?url=',
    'https://igram.world/api?url=',
    'https://instadownloader.co/api?url=',
    'https://saveinsta.app/api?url=',
    'https://instasaved.net/api?url=',
    'https://instadownloader.org/api?url=',
    'https://instasaver.io/api?url=',
    'https://instadownload.net/api?url=',
    'https://instasave.website/api?url=',
    'https://instadownloader.app/api?url=',
    'https://instasaver.app/api?url=',
    'https://instadownload.io/api?url=',
    'https://instasave.io/api?url=',
    'https://instadownloader.io/api?url=',
    'https://instasaver.co/api?url=',
    'https://instadownload.co/api?url=',
    'https://instasave.co/api?url=',
    'https://instadownloader.cc/api?url=',
    'https://instasave.cc/api?url=',
    'https://instadownloader.net/api?url=',
    'https://instasave.net/api?url=',
    'https://instadownloader.org/api?url=',
    'https://instasave.org/api?url=',
    'https://instadownloader.com/api?url='
];

function extractIgUrl(text) {
    const regex = /(https?:\/\/(?:www\.)?instagram\.com\/(p|reel|tv)\/[^\s]+)/gi;
    const match = text.match(regex);
    return match ? match[0] : null;
}

export default async (sock, plan, context) => {
    const url = extractIgUrl(plan.target || context.text) || extractIgUrl(context.quotedMsg?.message?.conversation || '');
    if (!url) throw new Error('Reply to Instagram post/reel link or send link');

    await sock.sendMessage(context.jid, { react: { text: '⏬', key: context.msg.key } });

    for (let i = 0; i < IG_APIS.length; i++) {
        try {
            let videoUrl;
            if (IG_APIS[i].includes('cobalt') || IG_APIS[i].includes('wuk.sh')) {
                const res = await axios.post(IG_APIS[i], { url }, { timeout: 15000 });
                videoUrl = res.data?.url;
            } else {
                const res = await axios.get(IG_APIS[i] + encodeURIComponent(url), { timeout: 15000 });
                videoUrl = res.data?.url || res.data?.video_url || res.data?.links?.[0]?.url;
            }

            if (videoUrl) {
                console.log(`\x1b[32mIG_SUCCESS:\x1b[0m API ${i + 1}/${IG_APIS.length}`);
                await sock.sendMessage(context.jid, {
                    video: { url: videoUrl },
                    caption: plan.reply || '✅ Downloaded via BoNGo AI'
                }, { quoted: context.msg });
                return;
            }
        } catch (e) {
            if (i === IG_APIS.length - 1) throw new Error('All Instagram APIs failed. Post may be private.');
        }
    }
};
