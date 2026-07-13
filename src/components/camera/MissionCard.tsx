import React from 'react';

interface Challenge {
  id: string;
  emoji: string;
  title: string;
  category: string;
}

interface MissionCardProps {
  challenges: Challenge[];
  completedIds: string[];
  onSelectMission?: (challenge: Challenge) => void;
}

export default function MissionCard({ challenges, completedIds, onSelectMission }: MissionCardProps) {
  const completedCount = challenges.filter(c => completedIds.includes(c.id)).length;
  const progressPercent = challenges.length > 0 ? Math.round((completedCount / challenges.length) * 100) : 0;

  return (
    <div className="gamification-card" style={{ padding: '1.25rem', background: 'white', borderRadius: '20px', border: '1px solid #e8ede9', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: '0.65rem', color: '#E8318A', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>🎯 MISSÕES DA FESTA</span>
          <h4 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '2px 0 0', color: '#1a1a2e' }}>Caça Fotográfica</h4>
        </div>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#E8318A', background: '#FFF0F5', padding: '0.25rem 0.6rem', borderRadius: '50px' }}>
          {completedCount}/{challenges.length}
        </span>
      </div>

      {/* Barra de Progresso */}
      <div style={{ width: '100%', height: '8px', backgroundColor: '#f0edf0', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: `${progressPercent}%`, height: '100%', backgroundColor: '#4CAF50', borderRadius: '4px', transition: 'width 0.5s ease-out' }}></div>
      </div>

      {/* Container scrollável horizontal para as missões no mobile */}
      <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', padding: '0.25rem 0.1rem', scrollbarWidth: 'none', msOverflowStyle: 'none' }} className="no-scrollbar">
        {challenges.map((challenge) => {
          const isCompleted = completedIds.includes(challenge.id);
          return (
            <div
              key={challenge.id}
              onClick={() => onSelectMission && onSelectMission(challenge)}
              style={{
                flex: '0 0 110px',
                aspectRatio: '1',
                padding: '0.75rem',
                backgroundColor: isCompleted ? '#f4fbf7' : '#fafafc',
                border: isCompleted ? '1.5px solid #4CAF50' : '1.5px solid #efede6',
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                cursor: 'pointer',
                position: 'relative',
                transition: 'all 0.2s',
                boxShadow: isCompleted ? '0 2px 8px rgba(76, 175, 80, 0.08)' : 'none'
              }}
            >
              {isCompleted && (
                <div style={{ position: 'absolute', top: '6px', right: '6px', width: '18px', height: '18px', backgroundColor: '#4CAF50', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.6rem', fontWeight: 'bold' }}>
                  ✓
                </div>
              )}
              <span style={{ fontSize: '1.75rem', marginBottom: '0.35rem' }}>{challenge.emoji}</span>
              <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#555', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.2' }}>
                {challenge.title.replace('Fotografe o ', '').replace('Alguém ', '').replace('Capture um ', '')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
