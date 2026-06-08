import {
  Input,
  Output,
  Conversion,
  ALL_FORMATS,
  BlobSource,
  VideoSampleSink,
  Mp4OutputFormat,
  BufferTarget,
} from 'mediabunny';

export const computeDuration = async (file: File): Promise<number> => {
  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });
  return input.computeDuration();
};

export const generateThumbnail = async (file: File, timeSeconds: number): Promise<Blob> => {
  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });

  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack) {
    throw new Error('没有找到视频轨道');
  }

  const sink = new VideoSampleSink(videoTrack);
  const sample = await sink.getSample(timeSeconds);
  if (!sample) {
    throw new Error('指定时间点没有视频帧');
  }

  const canvas = document.createElement('canvas');
  canvas.width = sample.displayWidth;
  canvas.height = sample.displayHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    sample.close();
    throw new Error('Canvas 2D 上下文不可用');
  }

  sample.draw(ctx, 0, 0, sample.displayWidth, sample.displayHeight);
  sample.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('缩略图生成失败'));
      }
    }, 'image/jpeg', 0.9);
  });
};

export const transcodeToMp4 = async (
  file: File,
  onProgress?: (p: number) => void,
): Promise<Uint8Array> => {
  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });

  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  });

  const conversion = await Conversion.init({
    input,
    output,
  });

  if (onProgress) {
    conversion.onProgress = onProgress;
  }

  await conversion.execute();

  const buffer = output.target.buffer;
  if (!buffer) {
    throw new Error('转码未产生输出');
  }

  return new Uint8Array(buffer);
};
