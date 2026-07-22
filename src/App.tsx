import React, { useEffect, useRef, useState } from 'react';
import { useLiveAPI, Mood, PersonalityConfig, PersonalityProfile } from './hooks/useLiveAPI';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, X } from 'lucide-react';
import { RobotEyes } from './components/RobotEyes';

const moodColors: Record<Mood, string> = {
  calm: 'radial-gradient(circle at 30% 30%, #e879f9, #a855f7, #6366f1)',
  happy: 'radial-gradient(circle at 30% 30%, #fde047, #f97316, #ec4899)',
  energetic: 'radial-gradient(circle at 30% 30%, #ef4444, #f97316, #eab308)',
  thoughtful: 'radial-gradient(circle at 30% 30%, #2dd4bf, #0ea5e9, #6366f1)',
  melancholic: 'radial-gradient(circle at 30% 30%, #475569, #312e81, #1e1b4b)',
};

const moodShadows: Record<Mood, string> = {
  calm: '0 0 120px 30px rgba(168, 85, 247, 0.5), inset 0 0 60px rgba(255, 255, 255, 0.4)',
  happy: '0 0 120px 30px rgba(249, 115, 22, 0.5), inset 0 0 60px rgba(255, 255, 255, 0.4)',
  energetic: '0 0 120px 30px rgba(239, 68, 68, 0.5), inset 0 0 60px rgba(255, 255, 255, 0.4)',
  thoughtful: '0 0 120px 30px rgba(14, 165, 233, 0.5), inset 0 0 60px rgba(255, 255, 255, 0.4)',
  melancholic: '0 0 120px 30px rgba(49, 46, 129, 0.5), inset 0 0 60px rgba(255, 255, 255, 0.2)',
};

const moodLabels: Record<Mood, string> = {
  calm: 'Calm',
  happy: 'Happy',
  energetic: 'Energetic',
  thoughtful: 'Thoughtful',
  melancholic: 'Melancholic',
};

export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [showInterruption, setShowInterruption] = useState(false);
  const [personalityConfig, setPersonalityConfig] = useState<PersonalityConfig>({
    profile: 'companion',
    playfulness: 70,
    expressiveness: 80,
    formality: 30,
  });

  const { isAwake, status, feed, volume, mood, interruptionCount, cameraActive, awaken, sleep } = useLiveAPI(personalityConfig);
  const feedEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of feed
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [feed]);

  // Handle interruption visual feedback
  useEffect(() => {
    if (interruptionCount > 0) {
      setShowInterruption(true);
      const timer = setTimeout(() => setShowInterruption(false), 800);
      return () => clearTimeout(timer);
    }
  }, [interruptionCount]);

  return (
    <div className="flex h-screen w-full bg-[#050505] text-white font-sans overflow-hidden">
      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center relative">
        
        {/* Header */}
        <div className="absolute top-20 flex flex-col items-center">
          <h1 className="text-5xl font-light tracking-tight mb-3">Kookie</h1>
          <p className="text-[10px] font-bold tracking-[0.2em] text-white/40 uppercase">
            Adaptive AI Companion
          </p>
          {isAwake && (
            <div className="flex gap-2 mt-4">
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs font-medium tracking-wider text-white/70 uppercase"
              >
                Mood: {moodLabels[mood]}
              </motion.div>
              {cameraActive && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="px-3 py-1 rounded-full border border-green-500/20 bg-green-500/10 text-xs font-medium tracking-wider text-green-400 uppercase flex items-center gap-1.5"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  Camera Active (Private)
                </motion.div>
              )}
            </div>
          )}
        </div>

        {/* Robot Eyes Screen Container */}
        <div className="relative flex items-center justify-center my-8">
          <RobotEyes 
            isAwake={isAwake}
            status={status}
            volume={volume}
            mood={mood}
            showInterruption={showInterruption}
          />
        </div>

        {/* Controls */}
        <div className="absolute bottom-20 flex flex-col items-center gap-6">
          <div className="text-[10px] font-bold tracking-[0.2em] text-white/40 uppercase relative flex items-center justify-center">
            {status}
            <AnimatePresence>
              {showInterruption && (
                <motion.span 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute left-full ml-3 text-red-400 whitespace-nowrap"
                >
                  (Interrupted)
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          
          <button
            onClick={isAwake ? sleep : awaken}
            className="px-8 py-3.5 rounded-full bg-white text-black text-sm font-semibold hover:bg-white/90 transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:shadow-[0_0_40px_rgba(255,255,255,0.4)] border border-white/20"
          >
            {isAwake ? 'Put to Sleep' : 'Awaken Kookie'}
          </button>
        </div>

        {/* Settings Button */}
        <button
          onClick={() => setShowSettings(true)}
          className="absolute top-6 right-6 p-3 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white/70 hover:text-white"
        >
          <Settings size={20} />
        </button>

        {/* Settings Panel */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute top-0 right-0 h-full w-80 bg-[#0a0b0f] border-l border-white/5 shadow-2xl z-50 flex flex-col"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h2 className="text-sm font-bold tracking-widest text-white/70 uppercase">Personality</h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-2 rounded-full hover:bg-white/5 text-white/50 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 flex-1 overflow-y-auto space-y-8">
                {/* Profile Selection */}
                <div className="space-y-3">
                  <label className="text-[10px] font-bold tracking-[0.2em] text-white/40 uppercase">Profile</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['companion', 'professional', 'creative', 'mentor'] as PersonalityProfile[]).map((profile) => (
                      <button
                        key={profile}
                        onClick={() => setPersonalityConfig(prev => ({ ...prev, profile }))}
                        className={`py-2 px-3 rounded-lg text-xs font-medium capitalize border transition-all ${
                          personalityConfig.profile === profile
                            ? 'bg-white/10 border-white/20 text-white'
                            : 'bg-transparent border-white/5 text-white/50 hover:bg-white/5'
                        }`}
                      >
                        {profile}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Playfulness Slider */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold tracking-[0.2em] text-white/40 uppercase">Playfulness</label>
                    <span className="text-xs text-white/50">{personalityConfig.playfulness}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={personalityConfig.playfulness}
                    onChange={(e) => setPersonalityConfig(prev => ({ ...prev, playfulness: parseInt(e.target.value) }))}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white"
                  />
                  <div className="flex justify-between text-[10px] text-white/30">
                    <span>Serious</span>
                    <span>Joking</span>
                  </div>
                </div>

                {/* Expressiveness Slider */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold tracking-[0.2em] text-white/40 uppercase">Expressiveness</label>
                    <span className="text-xs text-white/50">{personalityConfig.expressiveness}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={personalityConfig.expressiveness}
                    onChange={(e) => setPersonalityConfig(prev => ({ ...prev, expressiveness: parseInt(e.target.value) }))}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white"
                  />
                  <div className="flex justify-between text-[10px] text-white/30">
                    <span>Stoic</span>
                    <span>Emotional</span>
                  </div>
                </div>

                {/* Formality Slider */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold tracking-[0.2em] text-white/40 uppercase">Formality</label>
                    <span className="text-xs text-white/50">{personalityConfig.formality}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={personalityConfig.formality}
                    onChange={(e) => setPersonalityConfig(prev => ({ ...prev, formality: parseInt(e.target.value) }))}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white"
                  />
                  <div className="flex justify-between text-[10px] text-white/30">
                    <span>Casual</span>
                    <span>Polite</span>
                  </div>
                </div>
                
                {isAwake && (
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg text-xs text-white/60 leading-relaxed">
                    Note: Personality changes will take effect on Kookie's next response.
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
