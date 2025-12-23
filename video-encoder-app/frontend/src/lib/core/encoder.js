import { Muxer, FileSystemWritableFileStreamTarget } from 'mp4-muxer';
import { demuxAndDecode } from './demuxer.js';

/**
 * ブラウザ内でエンコードし、FileSystem APIへストリーム保存
 * @param {File} file
 * @param {{ video: { width:number, height:number, bitrate:number, framerate:number, codec:string }, audio?: { sampleRate:number, numberOfChannels:number, bitrate:number, codec:string } }} config
 * @param {(pct:number, stats?:{fps:number, elapsedMs:number})=>void} onProgress
 * @returns {Promise<void>}
 */
export async function encodeToFile(file, config, onProgress) {
    const handle = await window.showSaveFilePicker({
        suggestedName: 'output.mp4',
        types: [{ description: 'Video File', accept: { 'video/mp4': ['.mp4'] } }]
    });
    const fileStream = await handle.createWritable();

    const muxer = new Muxer({
        target: new FileSystemWritableFileStreamTarget(fileStream),
        video: { codec: 'avc', width: config.video.width, height: config.video.height },
        audio: config.audio ? { codec: 'aac', sampleRate: config.audio.sampleRate, numberOfChannels: config.audio.numberOfChannels } : undefined,
        fastStart: false
    });

    let frameCount = 0;
    const start = performance.now();

    const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => {
            muxer.addVideoChunk(chunk, meta);
        },
        error: (e) => console.error('VideoEncoder error', e)
    });

    videoEncoder.configure({
        codec: config.video.codec ?? 'avc1.42001f',
        width: config.video.width,
        height: config.video.height,
        bitrate: config.video.bitrate,
        framerate: config.video.framerate,
        latencyMode: 'quality'
    });

    const audioEncoder = config.audio ? new AudioEncoder({
        output: (chunk, meta) => {
            muxer.addAudioChunk(chunk, meta);
        },
        error: (e) => console.error('AudioEncoder error', e)
    }) : null;

    if (audioEncoder) {
        audioEncoder.configure({
            codec: config.audio.codec ?? 'mp4a.40.2',
            sampleRate: config.audio.sampleRate,
            numberOfChannels: config.audio.numberOfChannels,
            bitrate: config.audio.bitrate
        });
    }

    const videoDecoder = new VideoDecoder({
        output: (frame) => {
            frameCount++;
            videoEncoder.encode(frame);
            frame.close();
            const elapsedMs = performance.now() - start;
            const fps = frameCount / (elapsedMs / 1000);
            onProgress(undefined, { fps, elapsedMs });
        },
        error: (e) => console.error('VideoDecoder error', e)
    });

    const audioDecoder = audioEncoder ? new AudioDecoder({
        output: (audioData) => {
            audioEncoder.encode(audioData);
            audioData.close();
        },
        error: (e) => console.error('AudioDecoder error', e)
    }) : null;

    await demuxAndDecode(file, videoDecoder, audioDecoder, (pct) => onProgress(pct));

    await videoEncoder.flush();
    if (audioEncoder) await audioEncoder.flush();
    muxer.finalize();
    await fileStream.close();
}