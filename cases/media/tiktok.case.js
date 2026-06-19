import axios from 'axios';

const TIKTOK_APIS = [
    'https://www.tikwm.com/api/?url=',
    'https://api.tiklydown.eu.org/api/download?url=',
    'https://api.douyin.wtf/api?url=',
    'https://tikdown.org/getAjax?url=',
    'https://api.tikmate.app/api/lookup?url=',
    'https://api19-core-useast5.tiktokv.com/aweme/v1/aweme/detail/?aweme_id=',
    'https://api16-core-c-useast1a.tiktokv.com/aweme/v1/feed/?aweme_id=',
    'https://www.tikvid.io/api/ajaxSearch?q=',
    'https://ttdownloader.com/api/video?url=',
    'https://ssstik.io/api/convert?url=',
    'https://snaptik.app/api/ajaxSearch?q=',
    'https://lovetik.com/api/ajaxSearch?q=',
    'https://savetik.co/api/ajaxSearch?q=',
    'https://tikcdn.io/ssstik/',
    'https://dlpanda.com/api?url=',
    'https://musicaldown.com/api?url=',
    'https://tiktokdownload.online/api/ajaxSearch?q=',
    'https://qload.info/api?url=',
    'https://api.cobalt.tools/api/json',
    'https://co.wuk.sh/api/json',
    'https://api.dlpanda.com/?url=',
    'https://api.tikapi.io/public/tiktok/video?url=',
    'https://tiktok-dl.vercel.app/api?url=',
    'https://api.savefromweb.com/api/convert?url=',
    'https://api.allinone.tools/api/download?url=',
    'https://rapidapi.com/api/tiktok?url=',
    'https://api.tik.fail/?url=',
    'https://api.tikmate.cc/api/lookup?url=',
    'https://api.tikdownload.org/api?url=',
    'https://api.videodownloader.so/tiktok?url=',
    'https://api.downloadgram.org/tiktok?url='
];

function extractTikTokUrl(text) {
    const regex = /(https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+|https?:\/\/[^\s]*tiktok[^\s]*)/gi;
    const match = text.match(regex);
    return match ? match[0] : null;
}

async function tryDownload(url, apiUrl, index) {
    try {
        let finalUrl = apiUrl;
        let method = 'get';
        let data = null;
        let headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

        if (apiUrl.includes('cobalt') || apiUrl.includes('wuk.sh')) {
            method = 'post';
            data = { url: url };
            headers['Accept'] = 'application/json';
            headers['Content-Type'] = 'application/json';
        } else {
            finalUrl = apiUrl + encodeURIComponent(url);
        }

        const res = await axios({ method, url: finalUrl, data, headers, timeout: 15000 });

        // Parse different API responses
        if (res.data?.data?.play || res.data?.video?.playAddr) {
            return res.data.data.play || res.data.video.playAddr;
        }
        if (res.data?.url || res.data?.video_url || res.data?.downloadUrl) {
            return res.data.url || res.data.video_url || res.data.downloadUrl;
        }
        if (res.data?.data?.url) return res.data.data.url;
        if (res.data?.aweme_detail?.video?.play_addr?.url_list?.[0]) {
            return res.data.aweme_detail.video.play_addr.url_list[0];
        }
        if (res.data?.result?.video) return res.data.result.video;
        if (res.data?.links?.[0]?.url) return res.data.links[0].url;
        if (typeof res.data === 'string' && res.data.includes('http')) {
            const match = res.data.match(/https?:\/\/[^\s"']+\.mp4/);
            if (match) return match[0];
        }

        throw new Error('No video URL in response');
    } catch (e) {
        throw new Error(`API ${index + 1} failed: ${e.message}`);
    }
}

export default async (sock, plan, context) => {
    const url = extractTikTokUrl(plan.target || context.text) || extractTikTokUrl(context.quotedMsg?.message?.conversation || context.quotedMsg?.message?.extendedTextMessage?.text || '');
    if (!url) throw new Error('Reply to TikTok link or send link with command');

    await sock.sendMessage(context.jid, { react: { text: '⏬', key: context.msg.key } });

    for (let i = 0; i < TIKTOK_APIS.length; i++) {
        try {
            const videoUrl = await tryDownload(url, TIKTOK_APIS[i], i);
            if (videoUrl) {
                console.log(`\x1b[32mTT_SUCCESS:\x1b[0m API ${i + 1}/${TIKTOK_APIS.length}`);
                await sock.sendMessage(context.jid, {
                    video: { url: videoUrl },
                    caption: plan.reply || '✅ Downloaded via BoNGo AI',
                    mimetype: 'video/mp4'
                }, { quoted: context.msg });
                return;
            }
        } catch (e) {
            console.log(`\x1b[33mTT_API_${i + 1}_FAIL:\x1b[0m ${e.message}`);
            if (i === TIKTOK_APIS.length - 1) throw new Error('All 30+ TikTok APIs failed. Link may be private or deleted.');
        }
    }
};
