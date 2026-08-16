import { describe, expect, it } from 'vitest';
import { pickRecordingMime, recordingFilename } from '../../src/app/DemoRecorder';

/**
 * §191: R records the flight. The DOM half (MediaRecorder, the download click)
 * has no test environment here; what is pure is the choice of container and
 * the name the take lands under, and both have real failure modes — a wrong
 * mime is a silent empty file, and a colon in a filename breaks on macOS.
 */
describe('§191 the take lands in the right container', () => {
  it('prefers vp9 webm and walks down from there', () => {
    expect(pickRecordingMime(() => true)).toBe('video/webm;codecs=vp9,opus');
    expect(pickRecordingMime((m) => !m.includes('vp9'))).toBe('video/webm;codecs=vp8,opus');
    expect(pickRecordingMime((m) => m === 'video/mp4')).toBe('video/mp4');
  });

  it('refuses to record into a container nothing supports', () => {
    expect(pickRecordingMime(() => false)).toBeNull();
  });

  it('names the file after the moment it was flown, filesystem-safe', () => {
    const name = recordingFilename('video/webm;codecs=vp9,opus', new Date('2026-08-16T12:34:56Z'));
    expect(name).toBe('the-loop-2026-08-16-12-34-56.webm');
    expect(name).not.toContain(':');
    expect(recordingFilename('video/mp4', new Date('2026-08-16T12:34:56Z'))).toMatch(/\.mp4$/);
  });
});
