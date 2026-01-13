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

    let muxer = null;
    let videoEncoder = null;
    let audioEncoder = null;
    let frameCount = 0;
    let totalFrames = 0;
    const start = performance.now();

    // Callback to initialize muxer and encoders once we know if source has audio
    const initializeEncoders = (hasAudio, totalVideoFrames) => {
        totalFrames = totalVideoFrames;
        
        // Create muxer with appropriate configuration
        const muxerConfig = {
            target: new FileSystemWritableFileStreamTarget(fileStream),
            video: { codec: 'avc', width: config.video.width, height: config.video.height },
            fastStart: false
        };

        // Only add audio track if source has audio AND config includes audio
        if (hasAudio && config.audio) {
            muxerConfig.audio = {
                codec: 'aac',
                sampleRate: config.audio.sampleRate,
                numberOfChannels: config.audio.numberOfChannels
            };
        }

        muxer = new Muxer(muxerConfig);

        videoEncoder = new VideoEncoder({
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

        if (hasAudio && config.audio) {
            audioEncoder = new AudioEncoder({
                output: (chunk, meta) => {
                    muxer.addAudioChunk(chunk, meta);
                },
                error: (e) => console.error('AudioEncoder error', e)
            });

            audioEncoder.configure({
                codec: config.audio.codec ?? 'mp4a.40.2',
                sampleRate: config.audio.sampleRate,
                numberOfChannels: config.audio.numberOfChannels,
                bitrate: config.audio.bitrate
            });
        }
    };

    const videoDecoder = new VideoDecoder({
        output: (frame) => {
            frameCount++;
            videoEncoder.encode(frame);
            frame.close();
            const elapsedMs = performance.now() - start;
            const fps = frameCount / (elapsedMs / 1000);
            
            // Calculate encoding progress: 10% from demuxing + 90% from encoding
            // Progress is 10% + (frameCount/totalFrames * 90%)
            let encodingProgress = 10;
            if (totalFrames > 0) {
                encodingProgress = 10 + (frameCount / totalFrames) * 90;
            }
            
            onProgress(encodingProgress, { fps, elapsedMs });
        },
        error: (e) => console.error('VideoDecoder error', e)
    });

    const audioDecoder = new AudioDecoder({
        output: (audioData) => {
            if (audioEncoder) {
                audioEncoder.encode(audioData);
            }
            audioData.close();
        },
        error: (e) => console.error('AudioDecoder error', e)
    });

    const demuxResult = await demuxAndDecode(file, videoDecoder, audioDecoder, initializeEncoders, (pct) => onProgress(pct));

    // CRITICAL FIX: Wait for all decoders to finish processing their queues
    await videoDecoder.flush();
    if (audioDecoder && demuxResult.hasAudio) {
        await audioDecoder.flush();
    }

    // Now flush encoders after decoders are done
    await videoEncoder.flush();
    if (audioEncoder) await audioEncoder.flush();
    
    // Set progress to 100% before finalizing
    onProgress(100);
    
    muxer.finalize();
    await fileStream.close();
}