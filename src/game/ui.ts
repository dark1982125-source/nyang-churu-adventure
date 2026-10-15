import Phaser from 'phaser';

export const FONT = '"Galmuri11", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

export const COLORS = {
  bg: 0x1d1b2a,
  panel: 0x2c2940,
  panelLight: 0x3d3958,
  accent: 0xffb86b,
  mint: 0x7fe0c9,
  pink: 0xff9cc2,
  text: '#fff6e9',
  dim: '#b9b2cc',
  warn: '#ffd166',
};

export function text(scene: Phaser.Scene, x: number, y: number, s: string, size = 16, color: string = COLORS.text): Phaser.GameObjects.Text {
  return scene.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, wordWrap: { width: 900 } });
}

/** 단순 사각 버튼 */
export function button(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number, label: string, onClick: () => void,
  opts: { size?: number; color?: number; enabled?: boolean } = {},
): Phaser.GameObjects.Container {
  const enabled = opts.enabled ?? true;
  const bg = scene.add.rectangle(0, 0, w, h, opts.color ?? COLORS.panelLight).setStrokeStyle(2, 0xffffff, enabled ? 0.5 : 0.15);
  const t = scene.add.text(0, 0, label, { fontFamily: FONT, fontSize: `${opts.size ?? 16}px`, color: enabled ? COLORS.text : '#6f6884', align: 'center', wordWrap: { width: w - 12 } }).setOrigin(0.5);
  const c = scene.add.container(x + w / 2, y + h / 2, [bg, t]);
  c.setSize(w, h);
  if (enabled) {
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => bg.setFillStyle(COLORS.accent, 0.6));
    c.on('pointerout', () => bg.setFillStyle(opts.color ?? COLORS.panelLight));
    c.on('pointerup', () => { bg.setFillStyle(opts.color ?? COLORS.panelLight); onClick(); });
  }
  return c;
}
