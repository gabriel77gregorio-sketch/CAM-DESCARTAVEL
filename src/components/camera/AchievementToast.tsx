import React, { useEffect } from 'react';

export interface AchievementData {
  key: string;
  name: string;
  description: string;
  emoji: string;
  xp: number;
}

interface AchievementToastProps {
  achievement: AchievementData;
  onClose: () => void;
}

export default function AchievementToast({ achievement, onClose }: AchievementToastProps) {
  useEffect(() => {
    // Auto fechar após 4 segundos
    const timer = setTimeout(() => {
      onClose();
    }, 4000);
    return () => clearTimeout(timer);
  }, [achievement, onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        top: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)',
        maxWidth: '360px',
        backgroundColor: '#1a1a2e',
        color: 'white',
        borderRadius: '20px',
        padding: '1rem 1.25rem',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        zIndex: 9999,
        border: '2px solid #E8318A',
        animation: 'slideDownIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
      }}
    >
      <div style={{
        fontSize: '2.5rem',
        lineHeight: 1,
        animation: 'jello 0.8s infinite alternate'
      }}>
        {achievement.emoji}
      </div>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: '0.6rem', color: '#E8318A', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block' }}>🏅 CONQUISTA DESBLOQUEADA</span>
        <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '2px 0 0', color: 'white' }}>{achievement.name}</h4>
        <p style={{ fontSize: '0.72rem', color: '#cbd5e1', margin: '2px 0 0', lineHeight: '1.3' }}>{achievement.description}</p>
      </div>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(232, 49, 138, 0.15)',
        padding: '0.35rem 0.5rem',
        borderRadius: '10px',
        border: '1px solid rgba(232, 49, 138, 0.3)'
      }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#E8318A' }}>+{achievement.xp}</span>
        <span style={{ fontSize: '0.5rem', color: '#E8318A', fontWeight: 700 }}>XP</span>
      </div>
    </div>
  );
}
