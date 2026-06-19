import axios from 'axios';

const YT_APIS = [
    'https://api.cobalt.tools/api/json',
    'https://co.wuk.sh/api/json',
    'https://api.savefrom.net/api/convert?url=',
    'https://api.downloadgram.org/youtube?url=',
    'https://api.videodownloader.so/youtube?url=',
    'https://yt1s.com/api/ajaxSearch/index?q=',
    'https://ytmp3.cc/api/ajaxSearch?q=',
    'https://y2mate.is/api/ajaxSearch?q=',
    'https://10downloader.com/api/ajaxSearch?q=',
    'https://yt5s.com/api/ajaxSearch?q=',
    'https://loader.to/ajax/download.php?url=',
    'https://api.klickaud.co/download.php?url=',
    'https://sconverter.com/api/ajaxSearch?q=',
    'https://ssyoutube.com/api/convert?url=',
    'https://ymp4.download/api/ajaxSearch?q=',
    'https://savethevideo.com/api/ajaxSearch?q=',
    'https://keepv.id/api/ajaxSearch?q=',
    'https://viddit.red/api/ajaxSearch?q=',
    'https://ytsaver.net/api/ajaxSearch?q=',
    'https://vidiget.com/api/ajaxSearch?q=',
    'https://x2convert.com/api/ajaxSearch?q=',
    'https://save-video.com/api/ajaxSearch?q=',
    'https://catchvideo.net/api/ajaxSearch?q=',
    'https://qdownloader.io/api/ajaxSearch?q=',
    'https://youtubemp4.site/api/ajaxSearch?q=',
    'https://youdownload.com/api/ajaxSearch?q=',
    'https://downvideo.net/api/ajaxSearch?q=',
    'https://tubeoffline.com/api/ajaxSearch?q=',
    'https://keepvid.ch/api/ajaxSearch?q=',
    'https://ytdownloader.cloud/api/ajaxSearch?q=',
    'https://yt-download.org/api/button/mp4?url='
];

function extractYtUrl(text) {
    const regex = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)[^\s]+)/gi;
    const match = text.match(regex);
    return match ? match[0] : null;
}

export default async (sock, plan, context) => {
    const url = extractYtUrl(plan.target || context.text) || extractYtUrl(context.quotedMsg?.message?.conversation || '');
    if (!url) throw new Error('Reply to YouTube video/shorts link or send link');

    await sock.sendMessage(context.jid, { react: { text: '⏬', key: context.msg.key } });

    for (let i = 0; i < YT_APIS.length; i++) {
        try {
            let videoUrl;
            if (YT_APIS[i].includes('cobalt') || YT_APIS[i].includes('wuk.sh')) {
                const res = await axios.post(YT_APIS[i], { url }, { timeout: 15000 });
                videoUrl = res.data?.url;
            } else {
                const res = await axios.get(YT_APIS[i] + encodeURIComponent(url), { timeout: 15000 });
                videoUrl = res.data?.url || res.data?.video_url || res.data?.links?.[0]?.url || res.data?.data?.url;
            }

            if (videoUrl) {
                console.log(`\x1b[32mYT_SUCCESS:\x1b[0m API ${i + 1}/${YT_APIS.length}`);
                await sock.sendMessage(context.jid, {
                    video: { url: videoUrl },
                    caption: plan.reply || '✅ Downloaded via BoNGo AI'
                }, { quoted: context.msg });
                return;
            }
        } catch (e) {
            console.log(`\x1b[33mYT_API_${i + 1}_FAIL:\x1b[0m`);
            if (i === YT_APIS.length - 1) throw new Error('All 30+ YouTube APIs failed. Video may be private or restricted.');
        }
    }
};
