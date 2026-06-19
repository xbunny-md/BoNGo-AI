import axios from 'axios';

const FB_APIS = [
    'https://api.cobalt.tools/api/json',
    'https://co.wuk.sh/api/json',
    'https://api.savefrom.net/api/convert?url=',
    'https://api.fdown.net/api/download?url=',
    'https://www.getfvid.com/downloader',
    'https://snapsave.app/api/ajaxSearch?q=',
    'https://fdownloader.net/api/ajaxSearch?q=',
    'https://fbdownloader.online/api?url=',
    'https://fbdown.net/download.php?url=',
    'https://api.downloadgram.org/facebook?url=',
    'https://api.videodownloader.so/facebook?url=',
    'https://api.allinone.tools/api/download?url=',
    'https://rapidapi.com/api/facebook?url=',
    'https://api.fbstreams.com/api?url=',
    'https://api.fdownloader.app/api?url=',
    'https://api.savefromweb.com/api/convert?url=',
    'https://api.fbdown.cc/api?url=',
    'https://api.fbvideodownload.com/api?url=',
    'https://api.fbsaver.io/api?url=',
    'https://api.fbdloader.com/api?url=',
    'https://api.fbreelsdownloader.com/api?url=',
    'https://api.fbstorysaver.com/api?url=',
    'https://api.fbvideodownloader.net/api?url=',
    'https://api.fdownloader.co/api?url=',
    'https://api.fbvideodownload.org/api?url=',
    'https://api.fbsaver.net/api?url=',
    'https://api.fbvideodownloader.io/api?url=',
    'https://api.fbdownloader.com/api?url=',
    'https://api.fbvideodownload.cc/api?url=',
    'https://api.fbsaver.org/api?url=',
    'https://api.fbvideodownload.co/api?url='
];

function extractFbUrl(text) {
    const regex = /(https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/[^\s]+|https?:\/\/fb\.watch\/[^\s]+)/gi;
    const match = text.match(regex);
    return match ? match[0] : null;
}

async function tryDownload(url, apiUrl, index) {
    try {
        let res;
        if (apiUrl.includes('cobalt') || apiUrl.includes('wuk.sh')) {
            res = await axios.post(apiUrl, { url }, { timeout: 15000 });
            if (res.data?.url) return res.data.url;
        } else {
            res = await axios.get(apiUrl + encodeURIComponent(url), { timeout: 15000 });
            if (res.data?.url || res.data?.video_url || res.data?.sd || res.data?.hd) {
                return res.data.hd || res.data.sd || res.data.url || res.data.video_url;
            }
            if (res.data?.links?.[0]?.url) return res.data.links[0].url;
        }
        throw new Error('No video URL');
    } catch (e) {
        throw new Error(`FB API ${index + 1} failed`);
    }
}

export default async (sock, plan, context) => {
    const url = extractFbUrl(plan.target || context.text) || extractFbUrl(context.quotedMsg?.message?.conversation || '');
    if (!url) throw new Error('Reply to Facebook video link or send link');

    await sock.sendMessage(context.jid, { react: { text: '⏬', key: context.msg.key } });

    for (let i = 0; i < FB_APIS.length; i++) {
        try {
            const videoUrl = await tryDownload(url, FB_APIS[i], i);
            if (videoUrl) {
                console.log(`\x1b[32mFB_SUCCESS:\x1b[0m API ${i + 1}/${FB_APIS.length}`);
                await sock.sendMessage(context.jid, {
                    video: { url: videoUrl },
                    caption: plan.reply || '✅ Downloaded via BoNGo AI',
                    mimetype: 'video/mp4'
                }, { quoted: context.msg });
                return;
            }
        } catch (e) {
            console.log(`\x1b[33mFB_API_${i + 1}_FAIL:\x1b[0m`);
            if (i === FB_APIS.length - 1) throw new Error('All 30+ Facebook APIs failed. Video may be private.');
        }
    }
};
