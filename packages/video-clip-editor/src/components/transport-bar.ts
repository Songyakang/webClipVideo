import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('transport-bar')
export class TransportBar extends LitElement {
  static styles = css`
    :host {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 16px; background: rgba(255,255,255,0.02);
      border-top: 1px solid rgba(148,171,214,0.08); gap: 12px;
    }
    .group { display: flex; gap: 6px; }
    button {
      padding: 8px 14px; border-radius: 8px; border: 1px solid rgba(148,171,214,0.12);
      background: rgba(255,255,255,0.04); color: #c8d6e5; cursor: pointer;
      font-size: 12px; transition: background 0.15s;
    }
    button:hover { background: rgba(255,255,255,0.08); }
    button:disabled { opacity: 0.4; cursor: not-allowed; }
    button.primary { background: rgba(77,150,255,0.15); border-color: rgba(77,150,255,0.25); color: #4d96ff; }
    button.primary:hover { background: rgba(77,150,255,0.25); }
    .status { font-size: 12px; color: #6b7d99; flex: 1; text-align: center; }
  `;

  @property({ type: Boolean }) isPlaying = false;
  @property({ type: Number }) playheadSeconds = 0;
  @property({ type: Number }) projectDuration = 20;
  @property({ type: String }) message = '';
  @property({ type: Boolean }) hasPreviewAsset = false;
  @property({ type: String }) busyAssetId: string | null = null;

  private _togglePlay() {
    this.dispatchEvent(new CustomEvent('toggle-play', { bubbles: true, composed: true }));
  }

  private _step(delta: number) {
    this.dispatchEvent(new CustomEvent('step-playhead', {
      detail: delta,
      bubbles: true,
      composed: true,
    }));
  }

  private _split() {
    this.dispatchEvent(new CustomEvent('split-clip', { bubbles: true, composed: true }));
  }

  private _triggerJob(job: 'thumbnail' | 'transcode') {
    this.dispatchEvent(new CustomEvent('run-job', {
      detail: job,
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    return html`
      <div class="group">
        <button @click=${() => this._step(-1)}>-1s</button>
        <button class="primary" @click=${this._togglePlay}>
          ${this.isPlaying ? '暂停' : '播放'}
        </button>
        <button @click=${() => this._step(1)}>+1s</button>
        <button class="primary" @click=${this._split}>切割 S</button>
      </div>
      <div class="status">${this.message}</div>
      <div class="group"></div>
    `;
  }
}
