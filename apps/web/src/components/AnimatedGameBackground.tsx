import React, { useEffect, useRef } from 'react';
import { useThemeStore } from '../stores/themeStore';

// ─── HIGH-CONTRAST 8-BIT / 16-BIT PIXEL CLOUD TEMPLATES (Light Mode) ──────────
// 'H' = Pure White Highlight (#FFFFFF)
// 'B' = Cloud Body (#F8FAFC)
// 'S' = Vivid Sky-Blue Underside Shadow (#60A5FA)
// 'O' = Bold Midnight Ink Outline (#0F172A)
// ' ' = Transparent

const CLOUD_PATTERNS = [
  // Small Cloud (16 x 8)
  [
    '      OOOOOO      ',
    '    OOHHHHHHOO    ',
    '  OOHHHHHHHHHHOO  ',
    ' OOHHHHHHHHHHHHOO ',
    'OHHHHHHHHHHHHHHBBO',
    'OBBBBBBBBBBBBBBSSO',
    'OBBBBBBBBBBBBSSSSO',
    ' OOSSSSSSSSSSSSOO ',
  ],
  // Medium Fluffy Cloud (24 x 10)
  [
    '        OOOOOOOO        ',
    '      OOHHHHHHHHOO      ',
    '    OOHHHHHHHHHHHHOO    ',
    '  OOHHHHHHHHHHHHHHHHOO  ',
    ' OOHHHHHHHHHHHHHHHHHHOO ',
    'OHHHHHHHHHHHHHHHHHHHHBBO',
    'OBBBBBBBBBBBBBBBBBBBBSSO',
    'OBBBBBBBBBBBBBBBBBBSSSSO',
    ' OBBBBBBBBBBBBBBBSSSSSSO',
    '  OOSSSSSSSSSSSSSSSSSSO ',
  ],
  // Large Multi-tier Cloud (32 x 12)
  [
    '            OOOOOOOO            ',
    '          OOHHHHHHHHOO          ',
    '    OOOOOOHHHHHHHHHHHHOOOOOO    ',
    '  OOHHHHHHHHHHHHHHHHHHHHHHHHOO  ',
    ' OOHHHHHHHHHHHHHHHHHHHHHHHHHHOO ',
    'OHHHHHHHHHHHHHHHHHHHHHHHHHHHHBBO',
    'OBBBBBBBBBBBBBBBBBBBBBBBBBBBBSSO',
    'OBBBBBBBBBBBBBBBBBBBBBBBBBBSSSSO',
    ' OBBBBBBBBBBBBBBBBBBBBBBBSSSSSSO',
    '  OBBBBBBBBBBBBBBBBBBBBSSSSSSSSO',
    '   OOSSSSSSSSSSSSSSSSSSSSSSSSOO ',
    '     OOOOOOOOOOOOOOOOOOOOOOOO   ',
  ],
];

interface PixelCloud {
  x: number;
  laneRatio: number;
  speed: number;
  pixelSize: number;
  patternIndex: number;
  opacity: number;
}

interface PixelStar {
  x: number;
  y: number;
  size: number;
  speed: number;
  type: 'micro' | 'square' | 'cross';
  color: string;
  twinkleSpeed: number;
  twinklePhase: number;
}

// Generate pre-rendered sprite canvas for a given cloud pattern and pixelSize
function createCloudSprite(pattern: string[], pixelSize: number): HTMLCanvasElement {
  const spriteCanvas = document.createElement('canvas');
  const width = pattern[0].length * pixelSize;
  const height = pattern.length * pixelSize;
  spriteCanvas.width = width;
  spriteCanvas.height = height;

  const sCtx = spriteCanvas.getContext('2d');
  if (!sCtx) return spriteCanvas;
  sCtx.imageSmoothingEnabled = false;

  for (let row = 0; row < pattern.length; row++) {
    const line = pattern[row];
    for (let col = 0; col < line.length; col++) {
      const char = line[col];
      if (char === ' ') continue;

      if (char === 'H') sCtx.fillStyle = '#FFFFFF';
      else if (char === 'B') sCtx.fillStyle = '#F1F5F9';
      else if (char === 'S') sCtx.fillStyle = '#60A5FA';
      else if (char === 'O') sCtx.fillStyle = '#0F172A';

      sCtx.fillRect(col * pixelSize, row * pixelSize, pixelSize, pixelSize);
    }
  }

  return spriteCanvas;
}

export const AnimatedGameBackground: React.FC = React.memo(() => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { theme } = useThemeStore();
  const themeRef = useRef(theme);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animId: number | null = null;
    let width = 0;
    let height = 0;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Cache pre-rendered cloud sprites for both pixel sizes (4px and 5px)
    const spriteCache = new Map<string, HTMLCanvasElement>();
    [4, 5].forEach((ps) => {
      CLOUD_PATTERNS.forEach((pat, idx) => {
        const key = `${idx}_${ps}`;
        spriteCache.set(key, createCloudSprite(pat, ps));
      });
    });

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      ctx.imageSmoothingEnabled = false;
    };
    handleResize();
    window.addEventListener('resize', handleResize, { passive: true });

    // Initialize Light Mode Clouds
    const LANES = [0.05, 0.20, 0.36, 0.52, 0.68, 0.84];
    const INITIAL_X_OFFSETS = [0.10, 0.62, 0.32, 0.82, 0.04, 0.48];
    const clouds: PixelCloud[] = [];

    for (let i = 0; i < LANES.length; i++) {
      const patternIndex = i % CLOUD_PATTERNS.length;
      const pixelSize = i % 2 === 0 ? 4 : 5;

      clouds.push({
        x: width * INITIAL_X_OFFSETS[i],
        laneRatio: LANES[i],
        speed: 0.22 + (i % 3) * 0.08,
        pixelSize,
        patternIndex,
        opacity: 0.95,
      });
    }

    // Initialize Dark Mode Stars
    const starColors = ['#FFFFFF', '#F1F5F9', '#38BDF8', '#FACC15', '#C084FC'];
    // Limit star count to prevent battery/GPU drain on low-spec devices
    const starCount = Math.min(160, Math.max(70, Math.floor(width / 12)));
    const stars: PixelStar[] = [];

    for (let i = 0; i < starCount; i++) {
      const rand = Math.random();
      let type: 'micro' | 'square' | 'cross' = 'micro';
      let size = 2;
      let speed = 0.25 + Math.random() * 0.40;

      if (rand > 0.85) {
        type = 'cross';
        size = 5;
        speed = 1.0 + Math.random() * 0.8;
      } else if (rand > 0.50) {
        type = 'square';
        size = 3;
        speed = 0.55 + Math.random() * 0.45;
      }

      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size,
        speed,
        type,
        color: starColors[Math.floor(Math.random() * starColors.length)],
        twinkleSpeed: 0.02 + Math.random() * 0.04,
        twinklePhase: Math.random() * Math.PI * 2,
      });
    }

    let isTabVisible = !document.hidden;
    const handleVisibility = () => {
      isTabVisible = !document.hidden;
      if (isTabVisible && !animId && !prefersReducedMotion) {
        animId = requestAnimationFrame(render);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const render = () => {
      if (!isTabVisible) {
        animId = null;
        return;
      }

      const isDark = themeRef.current === 'dark';

      if (!isDark) {
        // Light Mode: draw cached cloud sprites via drawImage
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(0, 0, width, height);

        for (let i = 0; i < clouds.length; i++) {
          const cloud = clouds[i];
          const spriteKey = `${cloud.patternIndex}_${cloud.pixelSize}`;
          const sprite = spriteCache.get(spriteKey);
          const cloudY = Math.round(cloud.laneRatio * height);

          if (sprite) {
            ctx.drawImage(sprite, Math.round(cloud.x), cloudY);
          }

          if (!prefersReducedMotion) {
            cloud.x += cloud.speed;
            const spriteW = sprite ? sprite.width : 160;
            if (cloud.x > width + 40) {
              cloud.x = -spriteW - 40;
            }
          }
        }
      } else {
        // Dark Mode: Space Void with Stars
        ctx.fillStyle = '#080C16';
        ctx.fillRect(0, 0, width, height);

        for (let i = 0; i < stars.length; i++) {
          const star = stars[i];
          if (!prefersReducedMotion) {
            star.twinklePhase += star.twinkleSpeed;
          }
          const alpha = 0.40 + 0.60 * Math.sin(star.twinklePhase);

          ctx.fillStyle = star.color;
          ctx.globalAlpha = Math.max(0.25, Math.min(1, alpha));

          if (star.type === 'cross') {
            const sx = Math.round(star.x);
            const sy = Math.round(star.y);
            ctx.fillRect(sx - 1, sy - 1, 3, 3);
            ctx.fillRect(sx, sy - 3, 1, 1);
            ctx.fillRect(sx, sy + 3, 1, 1);
            ctx.fillRect(sx - 3, sy, 1, 1);
            ctx.fillRect(sx + 3, sy, 1, 1);
          } else {
            ctx.fillRect(Math.round(star.x), Math.round(star.y), star.size, star.size);
          }

          if (!prefersReducedMotion) {
            star.x -= star.speed;
            if (star.x < -10) {
              star.x = width + Math.random() * 20;
              star.y = Math.random() * height;
            }
          }
        }
        ctx.globalAlpha = 1.0;
      }

      if (!prefersReducedMotion) {
        animId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      if (animId) cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibility);
      spriteCache.clear();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 w-full h-full"
      style={{ imageRendering: 'pixelated', transform: 'translate3d(0,0,0)' }}
    />
  );
});

AnimatedGameBackground.displayName = 'AnimatedGameBackground';
export default AnimatedGameBackground;
