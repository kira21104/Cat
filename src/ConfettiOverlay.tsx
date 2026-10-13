import React, { useEffect, useState } from 'react';

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  type: 'paw' | 'star' | 'confetti' | 'heart' | 'sparkle';
  opacity: number;
}

const COLORS = ['#F0A02A', '#E8801E', '#FF70A6', '#70D6FF', '#FFD670', '#E9FF70', '#A370F7', '#5C9E6A'];
const TYPES: ('paw' | 'star' | 'confetti' | 'heart' | 'sparkle')[] = ['paw', 'paw', 'star', 'confetti', 'confetti', 'heart', 'sparkle'];

export const ConfettiOverlay: React.FC = () => {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    // Generate 65 cheerful celebration particles
    const initialParticles: Particle[] = Array.from({ length: 65 }, (_, i) => {
      const type = TYPES[Math.floor(Math.random() * TYPES.length)];
      return {
        id: i,
        x: Math.random() * 100, // percentage across screen width
        y: -10 - Math.random() * 30, // start above screen
        vx: (Math.random() - 0.5) * 1.5,
        vy: 1.5 + Math.random() * 3.2,
        size: type === 'paw' ? 24 + Math.random() * 16 : 12 + Math.random() * 18,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 8,
        type,
        opacity: 0.85 + Math.random() * 0.15
      };
    });

    setParticles(initialParticles);

    let animationId: number;
    let lastTime = performance.now();

    const update = (time: number) => {
      const delta = (time - lastTime) / 16.66; // normalize to ~60fps
      lastTime = time;

      setParticles(prev =>
        prev.map(p => {
          let newY = p.y + p.vy * delta * 0.45;
          let newX = p.x + p.vx * delta * 0.45;
          const newRot = p.rotation + p.rotationSpeed * delta;

          // Recycle particle once fallen through
          if (newY > 110) {
            newY = -10;
            newX = Math.random() * 100;
          }

          return {
            ...p,
            x: newX,
            y: newY,
            rotation: newRot
          };
        })
      );

      animationId = requestAnimationFrame(update);
    };

    animationId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationId);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {particles.map(p => {
        let content: React.ReactNode = null;
        if (p.type === 'paw') {
          content = <span style={{ fontSize: `${p.size}px` }}>🐾</span>;
        } else if (p.type === 'star') {
          content = <span style={{ fontSize: `${p.size}px` }}>⭐</span>;
        } else if (p.type === 'heart') {
          content = <span style={{ fontSize: `${p.size}px` }}>💖</span>;
        } else if (p.type === 'sparkle') {
          content = <span style={{ fontSize: `${p.size}px` }}>✨</span>;
        } else {
          content = (
            <div
              style={{
                width: `${p.size * 0.5}px`,
                height: `${p.size}px`,
                backgroundColor: p.color,
                borderRadius: '3px',
                boxShadow: `0 2px 6px ${p.color}66`
              }}
            />
          );
        }

        return (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left: `${p.x}%`,
              top: `${p.y}%`,
              transform: `translate(-50%, -50%) rotate(${p.rotation}deg)`,
              opacity: p.opacity,
              transition: 'transform 0.05s linear'
            }}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
};
