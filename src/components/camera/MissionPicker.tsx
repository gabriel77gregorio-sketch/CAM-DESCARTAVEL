import React from 'react';

interface Challenge {
  id: string;
  emoji: string;
  title: string;
  category: string;
}

interface MissionPickerProps {
  challenges: Challenge[];
  completedIds: string[];
  photoDataUrl: string;
  onSelect: (challengeId: string | null) => void;
}

export default function MissionPicker({ challenges, completedIds, photoDataUrl, onSelect }: MissionPickerProps) {
  const pendingChallenges = challenges.filter((c) => !completedIds.includes(c.id));

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(26, 26, 46, 0.95)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '1.5rem',
      fontFamily: 'var(--font-sans)'
    }}>
      <div 
        style={{ 
          background: 'white', 
          borderRadius: '28px', 
          padding: '1.5rem', 
          width: '100%', 
          maxWidth: '380px', 
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          animation: 'slideUpIn 0.3s cubic-bezier(0.1, 0.8, 0.2, 1)'
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '0.65rem', color: '#E8318A', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>🎯 VINCULAR MISSÃO</span>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '2px 0 0', color: '#1a1a2e' }}>Esta foto completa alguma missão?</h3>
        </div>

        {/* Preview Pequeno da foto capturada */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '120px', height: '90px', borderRadius: '12px', overflow: 'hidden', border: '3px solid #efede6', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
            <img src={photoDataUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Preview" />
          </div>
        </div>

        {pendingChallenges.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1rem 0', color: '#718096', fontSize: '0.85rem' }}>
            🎉 Parabéns! Você completou todas as missões disponíveis!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto', paddingRight: '0.25rem' }}>
            {pendingChallenges.map((challenge) => (
              <button
                key={challenge.id}
                onClick={() => onSelect(challenge.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.65rem 0.85rem',
                  border: '1.5px solid #efede6',
                  borderRadius: '16px',
                  backgroundColor: 'white',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#1a1a2e',
                  transition: 'all 0.15s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = '#E8318A';
                  e.currentTarget.style.backgroundColor = '#FFF0F5';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = '#efede6';
                  e.currentTarget.style.backgroundColor = 'white';
                }}
              >
                <span style={{ fontSize: '1.35rem' }}>{challenge.emoji}</span>
                <span style={{ flex: 1, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {challenge.title}
                </span>
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button
            onClick={() => onSelect(null)}
            style={{
              padding: '0.75rem',
              backgroundColor: '#1a1a2e',
              color: 'white',
              border: 'none',
              borderRadius: '50px',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              textAlign: 'center',
              boxShadow: '0 4px 10px rgba(26, 26, 46, 0.2)'
            }}
          >
            Pular / Revelar apenas a foto ✨
          </button>
        </div>
      </div>
    </div>
  );
}
