import Phaser from 'phaser';
import { CampScene } from './scenes/CampScene';
import { BattleScene } from './scenes/BattleScene';
import { ResultScene } from './scenes/ResultScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 540,
  backgroundColor: '#1d1b2a',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 3 },
  scene: [CampScene, BattleScene, ResultScene],
});

// 브라우저 자동 검증용 핸들(게임 동작에는 영향 없음)
(window as unknown as { __game: Phaser.Game }).__game = game;
