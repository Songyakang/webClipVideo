import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

// ─── MP4 box parsing utilities ───────────────────────────────────────

interface ParsedBox {
  type: string;
  size: number;
  headerSize: number;
  offset: number; // absolute offset in the source buffer
}

function parseBoxes(buf: Uint8Array, startOffset: number, endOffset: number): ParsedBox[] {
  const boxes: ParsedBox[] = [];
  let pos = startOffset;
  while (pos + 8 <= endOffset) {
    const view = new DataView(buf.buffer, buf.byteOffset + pos, 16);
    let size = view.getUint32(0);
    const type = String.fromCharCode(view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7));
    let headerSize = 8;
    if (size === 1) {
      if (pos + 16 > endOffset) break;
      size = Number(view.getBigUint64(8));
      headerSize = 16;
    } else if (size === 0) {
      size = endOffset - pos;
    }
    if (pos + size > endOffset) break;
    boxes.push({ type, size, headerSize, offset: pos });
    pos += size;
  }
  return boxes;
}

function findBox(boxes: ParsedBox[], type: string): ParsedBox | undefined {
  for (const b of boxes) if (b.type === type) return b;
  return undefined;
}

// ─── Video track extraction ─────────────────────────────────────────

interface Sample {
  offset: number;   // byte offset in MP4 buffer where sample data starts
  size: number;     // byte size of sample
  data: Uint8Array; // actual sample data
  isKey: boolean;   // keyframe or delta frame
  timestamp: number; // in microseconds
  duration: number;  // in microseconds
}

interface VideoTrack {
  codec: string;           // 'avc1.XXXXXX' or 'hvc1.XXXXXX'
  width: number;
  height: number;
  description: Uint8Array;  // avcC or hvcC box data
  samples: Sample[];
  timescale: number;
}

function findBoxInData(data: Uint8Array, startOffset: number, type: string): ParsedBox | undefined {
  const boxes = parseBoxes(data, startOffset, data.byteLength);
  return findBox(boxes, type);
}

// ─── WebCodecs decode / encode ───────────────────────────────────────

function codecToConfigString(codec: string): string {
  if (codec === 'avc1' || codec === 'avc3') return 'avc1.42001f';
  if (codec === 'hvc1' || codec === 'hev1') return 'hvc1.1.6.L93.0';
  return codec;
}

function extractSamplesWithData(
  buf: Uint8Array,
  stblChildren: ParsedBox[],
  stblContent: Uint8Array,
  timescale: number,
): Sample[] {
  const stsz = findBox(stblChildren, 'stsz');
  const stco = findBox(stblChildren, 'stco') || findBox(stblChildren, 'co64');
  const stts = findBox(stblChildren, 'stts');
  const stsc = findBox(stblChildren, 'stsc');
  const stss = findBox(stblChildren, 'stss');

  if (!stsz || !stco || !stts || !stsc) return [];

  const stszView = new DataView(stblContent.buffer, stblContent.byteOffset + stsz.offset + stsz.headerSize, stsz.size - stsz.headerSize);
  const sampleSizeUniform = stszView.getUint32(4);
  const sampleCount = stszView.getUint32(8);
  const sizes: number[] = [];
  if (sampleSizeUniform > 0) {
    for (let i = 0; i < sampleCount; i++) sizes.push(sampleSizeUniform);
  } else {
    for (let i = 0; i < sampleCount; i++) sizes.push(stszView.getUint32(12 + i * 4));
  }

  const is64Bit = stco.type === 'co64';
  const stcoView = new DataView(stblContent.buffer, stblContent.byteOffset + stco.offset + stco.headerSize, stco.size - stco.headerSize);
  const chunkCount = stcoView.getUint32(4);
  const chunkOffsets: number[] = [];
  for (let i = 0; i < chunkCount; i++) {
    chunkOffsets.push(is64Bit
      ? Number(stcoView.getBigUint64(8 + i * 8))
      : stcoView.getUint32(8 + i * 4));
  }

  const sttsView = new DataView(stblContent.buffer, stblContent.byteOffset + stts.offset + stts.headerSize, stts.size - stts.headerSize);
  const sttsCount = sttsView.getUint32(4);
  const sttsEntries: { count: number; delta: number }[] = [];
  for (let i = 0; i < sttsCount; i++) {
    sttsEntries.push({
      count: sttsView.getUint32(8 + i * 8),
      delta: sttsView.getUint32(12 + i * 8),
    });
  }

  const stscView = new DataView(stblContent.buffer, stblContent.byteOffset + stsc.offset + stsc.headerSize, stsc.size - stsc.headerSize);
  const stscCount = stscView.getUint32(4);
  const stscEntries: { firstChunk: number; samplesPerChunk: number }[] = [];
  for (let i = 0; i < stscCount; i++) {
    stscEntries.push({
      firstChunk: stscView.getUint32(8 + i * 12),
      samplesPerChunk: stscView.getUint32(12 + i * 12),
    });
  }

  const syncSampleSet = new Set<number>();
  if (stss) {
    const stssView = new DataView(stblContent.buffer, stblContent.byteOffset + stss.offset + stss.headerSize, stss.size - stss.headerSize);
    const stssCount = stssView.getUint32(4);
    for (let i = 0; i < stssCount; i++) syncSampleSet.add(stssView.getUint32(8 + i * 4));
  }

  // Expand stsc to per-sample chunk mapping
  const sampleToChunk: number[] = new Array(sampleCount);
  let si = 0;
  for (let ei = 0; ei < stscEntries.length; ei++) {
    const entry = stscEntries[ei];
    const nextFirstChunk = ei + 1 < stscEntries.length ? stscEntries[ei + 1].firstChunk : chunkCount + 1;
    const chunkRange = nextFirstChunk - entry.firstChunk;
    for (let c = 0; c < chunkRange; c++) {
      for (let s = 0; s < entry.samplesPerChunk; s++) {
        if (si < sampleCount) sampleToChunk[si] = entry.firstChunk + c;
        si++;
      }
    }
  }

  // Expand stts to per-sample durations
  const sampleDurations: number[] = new Array(sampleCount);
  let di = 0;
  for (const entry of sttsEntries) {
    for (let j = 0; j < entry.count; j++) {
      if (di < sampleCount) sampleDurations[di] = entry.delta;
      di++;
    }
  }

  // Build sample list with actual data extracted from the buffer
  const samples: Sample[] = [];
  let timestamp = 0;

  for (let i = 0; i < sampleCount; i++) {
    const chunk = sampleToChunk[i];
    const chunkOffset = chunkOffsets[chunk - 1]; // absolute file offset

    // Calculate sample offset within the chunk
    let offsetInChunk = 0;
    // Find samples before this one in the same chunk
    for (let j = i - 1; j >= 0 && sampleToChunk[j] === chunk; j--) {
      offsetInChunk += sizes[j];
    }

    const sampleAbsOffset = chunkOffset + offsetInChunk;
    const size = sizes[i];

    // Extract actual data from the buffer
    let sampleData: Uint8Array;
    if (sampleAbsOffset + size <= buf.byteLength) {
      sampleData = buf.subarray(sampleAbsOffset, sampleAbsOffset + size).slice();
    } else {
      sampleData = new Uint8Array(0);
    }

    const isKey = syncSampleSet.size === 0 || syncSampleSet.has(i + 1);

    samples.push({
      offset: sampleAbsOffset,
      size,
      data: sampleData,
      isKey,
      timestamp,
      duration: sampleDurations[i],
    });

    timestamp += sampleDurations[i];
  }

  return samples;
}

/** Re-parse the full track info but using the version that extracts actual sample data */
function extractVideoTrackFull(buf: Uint8Array): VideoTrack | null {
  const boxes = parseBoxes(buf, 0, buf.byteLength);
  const moov = findBox(boxes, 'moov');
  if (!moov) return null;

  const moovContent = buf.subarray(moov.offset + moov.headerSize, moov.offset + moov.size);
  const moovChildren = parseBoxes(moovContent, 0, moovContent.byteLength);

  const trak = findBox(moovChildren, 'trak');
  if (!trak) return null;

  const trakContent = moovContent.subarray(trak.offset + trak.headerSize, trak.offset + trak.size);
  const trakChildren = parseBoxes(trakContent, 0, trakContent.byteLength);

  // tkhd for dimensions
  const tkhd = findBox(trakChildren, 'tkhd');
  let width = 1920, height = 1080;
  if (tkhd) {
    const absOff = moov.offset + moov.headerSize + trak.offset + trak.headerSize + tkhd.offset + tkhd.headerSize;
    const fbv = new DataView(buf.buffer, buf.byteOffset + absOff, 92);
    if (fbv.getUint8(0) === 1) { width = fbv.getUint32(84) >> 16; height = fbv.getUint32(88) >> 16; }
    else { width = fbv.getUint32(76) >> 16; height = fbv.getUint32(80) >> 16; }
  }

  const mdia = findBox(trakChildren, 'mdia');
  if (!mdia) return null;

  const mdiaContent = trakContent.subarray(mdia.offset + mdia.headerSize, mdia.offset + mdia.size);
  const mdiaChildren = parseBoxes(mdiaContent, 0, mdiaContent.byteLength);

  const mdhd = findBox(mdiaChildren, 'mdhd');
  let timescale = 90000;
  if (mdhd) {
    const absOff = moov.offset + moov.headerSize + trak.offset + trak.headerSize + mdia.offset + mdia.headerSize + mdhd.offset + mdhd.headerSize;
    const vv = new DataView(buf.buffer, buf.byteOffset + absOff, 24);
    timescale = vv.getUint8(0) === 1 ? vv.getUint32(20) : vv.getUint32(12);
  }

  const minf = findBox(mdiaChildren, 'minf');
  if (!minf) return null;

  const minfContent = mdiaContent.subarray(minf.offset + minf.headerSize, minf.offset + minf.size);
  const minfChildren = parseBoxes(minfContent, 0, minfContent.byteLength);

  const stbl = findBox(minfChildren, 'stbl');
  if (!stbl) return null;

  const stblContent = minfContent.subarray(stbl.offset + stbl.headerSize, stbl.offset + stbl.size);
  const stblChildren = parseBoxes(stblContent, 0, stblContent.byteLength);

  // Read codec from stsd
  const stsd = findBox(stblChildren, 'stsd');
  if (!stsd) return null;

  const stsdContent = stblContent.subarray(stsd.offset + stsd.headerSize, stsd.offset + stsd.size);
  const stsdView = new DataView(stsdContent.buffer, stsdContent.byteOffset, stsdContent.byteLength);
  const entryCount = stsdView.getUint32(4);
  if (entryCount === 0) return null;

  const entrySize = stsdView.getUint32(8);
  const entryType = String.fromCharCode(stsdView.getUint8(12), stsdView.getUint8(13), stsdView.getUint8(14), stsdView.getUint8(15));
  const entryData = stsdContent.subarray(8, 8 + entrySize);

  let codec = entryType;
  let description: Uint8Array = new Uint8Array(0);
  const codecBox = entryType.startsWith('avc') ? 'avcC' : entryType.startsWith('hev') || entryType.startsWith('hvc') ? 'hvcC' : null;

  if (codecBox) {
    const box = findBoxInData(entryData, 86, codecBox);
    if (box) {
      description = entryData.subarray(box.offset, box.offset + box.size).slice();
    }
  }

  const samples = extractSamplesWithData(buf, stblChildren, stblContent, timescale);
  if (samples.length === 0) return null;

  return { codec, width, height, description, samples, timescale };
}

// ─── Public API ──────────────────────────────────────────────────────

export interface ConcatProgress {
  phase: 'decode' | 'encode' | 'mux';
  clip: number;
  totalClips: number;
  percent: number;
}

export async function concatWithWebCodecs(
  clipDataList: Uint8Array[],
  onProgress?: (p: ConcatProgress) => void,
): Promise<Uint8Array> {
  if (clipDataList.length === 0) throw new Error('No clips to merge');
  if (clipDataList.length === 1) return clipDataList[0];

  // Check browser support
  if (typeof VideoDecoder === 'undefined' || typeof VideoEncoder === 'undefined') {
    throw new Error('WebCodecs API 不可用，请使用 Chrome/Edge 94+ 浏览器');
  }

  // Step 1: Parse and decode all clips
  const allFrames: VideoFrame[] = [];
  let firstTrack: VideoTrack | null = null;

  for (let ci = 0; ci < clipDataList.length; ci++) {
    onProgress?.({ phase: 'decode', clip: ci + 1, totalClips: clipDataList.length, percent: 0 });

    const track = extractVideoTrackFull(clipDataList[ci]);
    if (!track) throw new Error(`无法解析第 ${ci + 1} 个片段的视频轨道`);

    if (!firstTrack) firstTrack = track;

    const codecStr = codecToConfigString(track.codec);
    const support = await VideoDecoder.isConfigSupported({
      codec: codecStr,
      description: track.description.length > 0 ? track.description : undefined,
    });
    if (!support.supported) {
      throw new Error(`浏览器不支持此视频编码: ${codecStr}`);
    }

    const frames = await decodeClipSamples(track, onProgress ? (p) => {
      onProgress({ phase: 'decode', clip: ci + 1, totalClips: clipDataList.length, percent: p });
    } : undefined);

    allFrames.push(...frames);
  }

  if (!firstTrack) throw new Error('无法解析任何视频轨道');
  if (allFrames.length === 0) throw new Error('没有解码出任何视频帧');

  // Step 2: Unify (scale frames that don't match the first track's dimensions)
  const targetWidth = firstTrack.width;
  const targetHeight = firstTrack.height;
  const hasScaling = allFrames.some((f) => f.displayWidth !== targetWidth || f.displayHeight !== targetHeight);

  if (hasScaling) {
    for (let i = 0; i < allFrames.length; i++) {
      const f = allFrames[i];
      if (f.displayWidth !== targetWidth || f.displayHeight !== targetHeight) {
        const scaled = scaleVideoFrame(f, targetWidth, targetHeight);
        f.close();
        allFrames[i] = scaled;
      }
    }
  }

  // Step 3: Re-encode
  onProgress?.({ phase: 'encode', clip: 1, totalClips: 1, percent: 0 });

  const encodedChunks = await encodeFrames(
    allFrames,
    targetWidth,
    targetHeight,
    onProgress ? (p) => onProgress({ phase: 'encode', clip: 1, totalClips: 1, percent: p }) : undefined,
  );

  // Release frames
  for (const f of allFrames) f.close();

  // Step 4: Mux
  onProgress?.({ phase: 'mux', clip: 1, totalClips: 1, percent: 0 });

  const codecFamily: 'avc' | 'hevc' = firstTrack.codec.startsWith('avc') ? 'avc' : 'hevc';
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: codecFamily, width: targetWidth, height: targetHeight },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  for (const chunk of encodedChunks) {
    muxer.addVideoChunk(chunk);
  }

  muxer.finalize();
  onProgress?.({ phase: 'mux', clip: 1, totalClips: 1, percent: 100 });

  return new Uint8Array(target.buffer);
}

// ─── Internal helpers ────────────────────────────────────────────────

async function decodeClipSamples(
  track: VideoTrack,
  onProgress?: (p: number) => void,
): Promise<VideoFrame[]> {
  const codecStr = codecToConfigString(track.codec);
  const frames: VideoFrame[] = [];
  let errorCount = 0;

  const decoder = new VideoDecoder({
    output: (frame) => frames.push(frame),
    error: (e) => {
      console.error('[recoder] decode error:', e);
      errorCount++;
    },
  });

  decoder.configure({
    codec: codecStr,
    description: track.description.length > 0 ? track.description : undefined,
  });

  for (let i = 0; i < track.samples.length; i++) {
    const s = track.samples[i];
    try {
      const chunk = new EncodedVideoChunk({
        type: s.isKey ? 'key' : 'delta',
        timestamp: s.timestamp,
        duration: s.duration,
        data: s.data || new Uint8Array(0),
      });
      decoder.decode(chunk);
    } catch (e) {
      console.error('[recoder] failed to create chunk:', e);
      errorCount++;
    }

    if (i % 50 === 0) {
      onProgress?.((i / track.samples.length) * 100);
    }
  }

  await decoder.flush();
  decoder.close();

  onProgress?.(100);
  return frames;
}

function scaleVideoFrame(frame: VideoFrame, width: number, height: number): VideoFrame {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(frame, 0, 0, width, height);
  }
  const init: VideoFrameInit = {};
  if (frame.timestamp != null) init.timestamp = frame.timestamp;
  if (frame.duration != null) init.duration = frame.duration;
  return new VideoFrame(canvas, init);
}

async function encodeFrames(
  frames: VideoFrame[],
  width: number,
  height: number,
  onProgress?: (p: number) => void,
): Promise<EncodedVideoChunk[]> {
  const chunks: EncodedVideoChunk[] = [];

  const encoder = new VideoEncoder({
    output: (chunk, _meta) => chunks.push(chunk),
    error: (e) => console.error('[recoder] encode error:', e),
  });

  const support = await VideoEncoder.isConfigSupported({
    codec: 'avc1.42001f',
    width,
    height,
    bitrate: 5_000_000,
    framerate: 30,
  });

  if (!support.supported) {
    throw new Error('浏览器不支持 H.264 编码');
  }

  encoder.configure({
    codec: 'avc1.42001f',
    width,
    height,
    bitrate: 5_000_000,
    framerate: 30,
  });

  for (let i = 0; i < frames.length; i++) {
    try {
      encoder.encode(frames[i]);
    } catch (e) {
      console.error('[recoder] encode frame error:', e);
    }
    if (i % 50 === 0) {
      onProgress?.((i / frames.length) * 100);
    }
  }

  await encoder.flush();
  encoder.close();

  onProgress?.(100);
  return chunks;
}
