/**
 * §191: RECORD THE FLIGHT. R starts a take, R again downloads it — one file,
 * picture and sound together, captured inside the game itself. The canvas is
 * already the picture and everything audible already flows through the master
 * limiter, so the browser can mux the two without drivers, screen tools or a
 * second machine. macOS screen capture records no system audio; this does.
 */

/** Preference order: webm/vp9 is what Chrome does best; mp4 covers Safari. */
const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
] as const;

/** Pure so it can be tested without a MediaRecorder in the room. */
export function pickRecordingMime(isSupported: (mime: string) => boolean): string | null {
  for (const mime of MIME_CANDIDATES) {
    if (isSupported(mime)) return mime;
  }
  return null;
}

/** The filename says what it is and when it was flown. */
export function recordingFilename(mime: string, now: Date): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[T:]/g, '-');
  return `the-loop-${stamp}.${mime.includes('mp4') ? 'mp4' : 'webm'}`;
}

export class DemoRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private badge: HTMLDivElement | null = null;
  private panel: HTMLDivElement | null = null;
  private mime = '';

  get recording(): boolean {
    return this.recorder !== null;
  }

  /** `audio` carries exactly what the speakers get — tapped after the limiter. */
  start(canvas: HTMLCanvasElement, audio: MediaStream, container: HTMLElement): boolean {
    if (this.recorder !== null) return false;
    const mime = pickRecordingMime((m) => MediaRecorder.isTypeSupported(m));
    if (mime === null) return false;
    const stream = new MediaStream([
      ...canvas.captureStream(60).getVideoTracks(),
      ...audio.getAudioTracks(),
    ]);
    this.mime = mime;
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    // A chunk every second, so a crashed tab still leaves most of the take.
    this.recorder.start(1000);
    this.badge = document.createElement('div');
    this.badge.textContent = '● REC';
    this.badge.style.cssText =
      'position:absolute;top:14px;right:14px;color:#ff4838;font:12px/1 monospace;' +
      'letter-spacing:0.2em;z-index:30;animation:none;pointer-events:none;';
    container.appendChild(this.badge);
    return true;
  }

  /**
   * Resolves once the last chunk has landed, then offers the take from a
   * visible panel rather than force-clicking a download. A synthetic click
   * fired after the async stop has no user activation left — Chrome quietly
   * drops it, which read as "R does nothing". The panel's save link is the
   * player's OWN click, and that one is always honoured.
   */
  async stop(container: HTMLElement): Promise<void> {
    const recorder = this.recorder;
    if (recorder === null) return;
    this.recorder = null;
    this.badge?.remove();
    this.badge = null;
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    const blob = new Blob(this.chunks, { type: this.mime });
    this.chunks = [];
    this.showPanel(blob, container);
  }

  private showPanel(blob: Blob, container: HTMLElement): void {
    this.panel?.remove();
    const panel = document.createElement('div');
    panel.style.cssText =
      'position:absolute;bottom:18px;right:18px;z-index:60;padding:12px 14px;' +
      'background:rgba(0,0,0,0.85);border:1px solid rgba(255,255,255,0.25);' +
      'color:#eee;font:12px/1.7 monospace;letter-spacing:0.08em;pointer-events:auto;';
    const name = recordingFilename(this.mime, new Date());
    const size = (blob.size / (1024 * 1024)).toFixed(1);
    const url = URL.createObjectURL(blob);
    const save = document.createElement('a');
    save.href = url;
    save.download = name;
    save.textContent = `save take · ${size} MB`;
    save.style.cssText = 'color:#7fd4ff;text-decoration:underline;cursor:pointer;display:block;';
    const discard = document.createElement('a');
    discard.textContent = 'discard';
    discard.style.cssText = 'color:#888;text-decoration:underline;cursor:pointer;display:block;';
    const close = () => {
      panel.remove();
      this.panel = null;
      // The blob stays reachable until the panel goes, so save can be clicked
      // as often as it takes; only closing releases the memory.
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    };
    discard.onclick = close;
    save.onclick = () => setTimeout(close, 300);
    panel.append(name, save, discard);
    this.panel = panel;
    container.appendChild(panel);
  }

  dispose(): void {
    this.recorder?.stop();
    this.recorder = null;
    this.badge?.remove();
    this.badge = null;
    this.panel?.remove();
    this.panel = null;
  }
}
