import React from 'react';

interface GuestProfile {
  guest_id: string;
  guest_name: string;
  avatar_emoji: string;
  xp_points: number;
}

interface RankingCardProps {
  ranking: GuestProfile[];
  currentGuestId: string;
}

export default function RankingCard({ ranking, currentGuestId }: RankingCardProps) {
  // Encontrar a posição do próprio convidado
  const myIndex = ranking.findIndex(g => g.guest_id === currentGuestId);
  const myProfile = myIndex !== -1 ? ranking[myIndex] : null;
  const myRank = myIndex !== -1 ? myIndex + 1 : null;

  return (
    <div className="gamification-card" style={{ padding: '1.25rem', background: 'white', borderRadius: '20px', border: '1px solid #e8ede9', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div>
        <span style={{ fontSize: '0.65rem', color: '#E8318A', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>🏆 RANKING DA FESTA</span>
        <h4 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '2px 0 0', color: '#1a1a2e' }}>Fotógrafos Mais Ativos</h4>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {ranking.slice(0, 5).map((guest, idx) => {
          const isMe = guest.guest_id === currentGuestId;
          const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32']; // Ouro, Prata, Bronze

          return (
            <div
              key={guest.guest_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.5rem 0.75rem',
                borderRadius: '12px',
                backgroundColor: isMe ? '#FFF0F5' : '#fafafc',
                border: isMe ? '1px solid #E8318A' : '1px solid #f0edf0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {/* Posição */}
                <div style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  backgroundColor: idx < 3 ? rankColors[idx] : '#e2e8f0',
                  color: idx < 3 ? '#1a1a2e' : '#718096',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: '0.75rem'
                }}>
                  {idx + 1}
                </div>
                {/* Emoji e Nome */}
                <span style={{ fontSize: '1.1rem' }}>{guest.avatar_emoji || '📸'}</span>
                <span style={{ fontSize: '0.85rem', fontWeight: isMe ? 700 : 500, color: '#1a1a2e' }}>
                  {guest.guest_name} {isMe && '(Você)'}
                </span>
              </div>
              {/* Pontuação */}
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#E8318A' }}>
                {guest.xp_points} XP
              </span>
            </div>
          );
        })}

        {/* Se o convidado atual não estiver no Top 5, mostra um card para ele no final */}
        {myRank && myRank > 5 && myProfile && (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '0.1rem 0', color: '#cbd5e1', fontSize: '0.8rem' }}>•••</div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.5rem 0.75rem',
                borderRadius: '12px',
                backgroundColor: '#FFF0F5',
                border: '1px solid #E8318A',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  backgroundColor: '#E8318A',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: '0.75rem'
                }}>
                  {myRank}
                </div>
                <span style={{ fontSize: '1.1rem' }}>{myProfile.avatar_emoji || '📸'}</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1a1a2e' }}>
                  {myProfile.guest_name} (Você)
                </span>
              </div>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#E8318A' }}>
                {myProfile.xp_points} XP
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
