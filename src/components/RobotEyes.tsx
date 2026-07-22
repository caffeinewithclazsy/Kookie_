import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mood } from '../hooks/useLiveAPI';

interface RobotEyesProps {
  isAwake: boolean;
  status: string;
  volume: number;
  mood: Mood;
  showInterruption: boolean;
}

const moodColors: Record<Mood, { primary: string; glow: string }> = {
  calm: { primary: '#00f0ff', glow: 'rgba(0, 240, 255, 0.8)' }, // Electric Cyan
  happy: { primary: '#00ffaa', glow: 'rgba(0, 255, 170, 0.8)' }, // Neon Lime Green
  energetic: { primary: '#ff3366', glow: 'rgba(255, 51, 102, 0.8)' }, // Neon Pink-Red
  thoughtful: { primary: '#a855f7', glow: 'rgba(168, 85, 247, 0.8)' }, // Electric Violet
  melancholic: { primary: '#3b82f6', glow: 'rgba(59, 130, 246, 0.8)' }, // Soft Blue
};

export function RobotEyes({ isAwake, status, volume, mood, showInterruption }: RobotEyesProps) {
  const [isBlinking, setIsBlinking] = useState(false);

  // Random blink interval when awake and not talking
  useEffect(() => {
    if (!isAwake || status === 'SPEAKING') return;

    const triggerBlink = () => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 150); // Quick blink
    };

    const interval = setInterval(() => {
      if (Math.random() > 0.4) {
        triggerBlink();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isAwake, status]);

  const activeColor = moodColors[mood] || moodColors.calm;

  // Eye variants depending on state
  const getEyeStyle = () => {
    if (!isAwake) {
      // Sleeping: thin glowing closed line
      return {
        height: '8px',
        width: '110px',
        borderRadius: '4px',
        boxShadow: `0 0 30px ${activeColor.glow}`,
        background: activeColor.primary,
        opacity: 0.3,
      };
    }

    if (isBlinking) {
      // Blinking: thin line
      return {
        height: '8px',
        width: '130px',
        borderRadius: '4px',
        boxShadow: `0 0 25px ${activeColor.glow}`,
        background: activeColor.primary,
        opacity: 0.8,
      };
    }

    if (showInterruption) {
      // Squint/Dizzy from interruption
      return {
        height: '18px',
        width: '120px',
        borderRadius: '9px',
        boxShadow: `0 0 35px ${activeColor.glow}, 0 0 15px rgba(255,0,0,0.4)`,
        background: '#ef4444', // Red warning
        rotate: '15deg',
      };
    }

    // Default open state (Big eyes)
    let baseHeight = 145; // in px (formerly 80)
    let baseWidth = 160;  // in px (formerly 110)
    let borderRadius = '48px';
    let rotate = '0deg';
    let scaleY = 1;

    // Talking: pulse height based on volume
    if (status === 'SPEAKING') {
      scaleY = 1 + volume * 0.45;
    }

    // Specific mood shapes
    switch (mood) {
      case 'happy':
        // Rounded top, slightly flatter bottom
        borderRadius = '55% 55% 25% 25%';
        break;
      case 'melancholic':
        // Sad look: slanting downwards/outwards
        rotate = '8deg';
        borderRadius = '40px';
        break;
      case 'thoughtful':
        // Squinting/focused
        baseHeight = 90;
        borderRadius = '32px';
        break;
      case 'energetic':
        // Big round eyes
        baseHeight = 165;
        borderRadius = '56px';
        break;
      case 'calm':
      default:
        borderRadius = '48px';
        break;
    }

    return {
      height: `${baseHeight}px`,
      width: `${baseWidth}px`,
      borderRadius,
      boxShadow: `0 0 50px ${activeColor.glow}, inset 0 0 25px rgba(255, 255, 255, 0.4)`,
      background: activeColor.primary,
      transform: `rotate(${rotate}) scaleY(${scaleY})`,
      transition: 'height 0.2s ease, width 0.2s ease, border-radius 0.2s ease, background 0.5s ease, box-shadow 0.5s ease',
    };
  };

  const eyeStyle = getEyeStyle();

  return (
    <div id="robot-screen" className="relative flex items-center justify-center h-[340px] w-[500px] bg-[#020202] rounded-[40px] border-4 border-white/5 shadow-[inset_0_0_80px_rgba(0,0,0,0.9),0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden">
      {/* Scanline overlay for that retro/CRT screen effect */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%)',
          backgroundSize: '100% 4px',
        }}
      />

      {/* Screen Gloss/Reflection highlight */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 50%)',
        }}
      />

      {/* Interruption Screen Flash */}
      <AnimatePresence>
        {showInterruption && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.15 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-red-600 pointer-events-none z-10"
          />
        )}
      </AnimatePresence>

      {/* Left & Right Eyes */}
      <div className="flex items-center gap-14 z-20">
        {/* Left Eye */}
        <motion.div
          animate={showInterruption ? { x: [0, -6, 6, -4, 4, 0], y: [0, -3, 3, -2, 2, 0] } : {}}
          transition={{ duration: 0.4 }}
          style={eyeStyle}
          className="relative flex items-center justify-center"
        >
          {/* Inner pupils or details if needed - keep clean and glowing as requested */}
        </motion.div>

        {/* Right Eye */}
        <motion.div
          animate={showInterruption ? { x: [0, -6, 6, -4, 4, 0], y: [0, -3, 3, -2, 2, 0] } : {}}
          transition={{ duration: 0.4 }}
          style={{
            ...eyeStyle,
            // Mirror rotation for right eye if tilted
            transform: eyeStyle.transform?.replace('rotate(', 'rotate(-') || eyeStyle.transform,
          }}
          className="relative flex items-center justify-center"
        >
        </motion.div>
      </div>
    </div>
  );
}
