import React, { useEffect, useState } from 'react';

interface CollectiveGoalProps {
  currentPhotos: number;
  goalPhotos: number;
}

export default function CollectiveGoal({ currentPhotos, goalPhotos }: CollectiveGoalProps) {
  const percent = Math.min(Math.round((currentPhotos / goalPhotos) * 100), 100);
  const [showCelebration, setShowCelebration] = useState(false);

  // Efeito simples de celebração ao atingir marcos importantes ou atingir a meta completa
  useEffect(() => {
    if (percent === 100) {
      setShowCelebration(true);
      const timer = setTimeout(() => setShowCelebration(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [percent]);

  return (
    <div className="gamification-card" style={{ padding: '1.25rem', background: 'white', borderRadius: '20px', border: '1px solid #e8ede9', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: '0.85rem', position: 'relative', overflow: 'hidden' }}>
      
      {showCelebration && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(232, 49, 138, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, animation: 'pulse 1s infinite' }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#E8318A', textShadow: '0 2px 4px rgba(255,255,255,0.8)', animation: 'bounce 0.5s infinite alternate' }}>
            🎉 META ATINGIDA! 🎉
          </span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={{ fontSize: '0.65rem', color: '#E8318A', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>🤝 META COLETIVA</span>
          <h4 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '2px 0 0', color: '#1a1a2e' }}>Álbum Coletivo</h4>
        </div>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#E8318A' }}>
          {currentPhotos} / {goalPhotos} fotos
        </span>
      </div>

      {/* Progresso visual */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <div style={{ width: '100%', height: '14px', backgroundColor: '#f0edf0', borderRadius: '50px', overflow: 'hidden', padding: '2px' }}>
          <div 
            style={{ 
              width: `${percent}%`, 
              height: '100%', 
              background: 'linear-gradient(90deg, #E8318A, #ff6b8b)', 
              borderRadius: '50px',
              transition: 'width 1s cubic-bezier(0.1, 0.8, 0.2, 1)',
              position: 'relative'
            }}
          >
            {percent > 15 && (
              <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.6rem', fontWeight: 'bold', color: 'white' }}>
                {percent}%
              </span>
            )}
          </div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          <span>Começo da festa 🎬</span>
          <span>{percent === 100 ? 'Meta alcançada! 🥂' : 'Vamos atingir a meta! 🚀'}</span>
        </div>
      </div>
    </div>
  );
}
