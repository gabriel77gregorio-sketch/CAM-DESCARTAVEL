import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Event {
  id: string;
  event_name: string;
  gamification_enabled: boolean;
  isLocal?: boolean;
}

export default function SettingsManager() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [loadingEvents, setLoadingEvents] = useState(true);
  
  // Password State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'idle'|'success'|'error', msg: string }>({ type: 'idle', msg: '' });
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Gamification Status
  const [isGamificationUpdating, setIsGamificationUpdating] = useState(false);

  useEffect(() => {
    async function loadEvents() {
      setLoadingEvents(true);
      try {
        const localRaw = localStorage.getItem('local_events');
        const localEvents: Event[] = localRaw ? JSON.parse(localRaw) : [];
        const markedLocal = localEvents.map(e => ({ ...e, isLocal: true, gamification_enabled: e.gamification_enabled ?? true }));

        let dbEvents: Event[] = [];
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user?.id) {
          const { data, error } = await supabase
            .from('events')
            .select('id, event_name, gamification_enabled')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false });

          if (!error && data) {
            dbEvents = data;
          }
        }

        const combined = [...markedLocal, ...dbEvents];
        setEvents(combined);
        if (combined.length > 0) {
          setSelectedEventId(combined[0].id);
        }
      } catch (err) {
        console.error('Erro ao carregar eventos:', err);
      } finally {
        setLoadingEvents(false);
      }
    }
    loadEvents();
  }, []);

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: 'error', msg: 'As senhas não coincidem.' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordStatus({ type: 'error', msg: 'A senha deve ter pelo menos 6 caracteres.' });
      return;
    }

    setIsUpdatingPassword(true);
    setPasswordStatus({ type: 'idle', msg: '' });

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordStatus({ type: 'success', msg: 'Senha atualizada com sucesso!' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordStatus({ type: 'error', msg: err.message || 'Erro ao atualizar senha.' });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const selectedEvent = events.find(e => e.id === selectedEventId);

  const handleGamificationToggle = async () => {
    if (!selectedEvent) return;
    setIsGamificationUpdating(true);
    
    const newValue = !selectedEvent.gamification_enabled;

    try {
      if (selectedEvent.isLocal) {
        // Update localStorage
        const localRaw = localStorage.getItem('local_events');
        const localEvents: any[] = localRaw ? JSON.parse(localRaw) : [];
        const updated = localEvents.map(e => e.id === selectedEvent.id ? { ...e, gamification_enabled: newValue } : e);
        localStorage.setItem('local_events', JSON.stringify(updated));
      } else {
        // Update Supabase
        const { error } = await supabase
          .from('events')
          .update({ gamification_enabled: newValue })
          .eq('id', selectedEvent.id);
          
        if (error) throw error;
      }

      setEvents(prev => prev.map(e => e.id === selectedEvent.id ? { ...e, gamification_enabled: newValue } : e));
    } catch (err) {
      alert('Erro ao atualizar gamificação. Tente novamente.');
    } finally {
      setIsGamificationUpdating(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', animation: 'fadeIn 0.3s ease-out' }}>
      
      {/* HEADER */}
      <div>
        <h2 style={{ fontSize: '2.2rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
          Ajustes
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginTop: '0.3rem' }}>
          Gerencie sua conta, eventos e acompanhe pedidos.
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', alignItems: 'flex-start' }}>
        
        {/* COLUNA ESQUERDA (Conta e Eventos) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', flex: '1 1 340px' }}>
          
          {/* SEGURANÇA */}
          <div className="glass-card" style={{ background: 'white', borderRadius: '24px', padding: '2rem', border: '1px solid #f0edf0' }}>
            <h3 style={{ fontSize: '1.25rem', color: '#1a1a2e', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>🔒</span> Segurança
            </h3>
            
            <form onSubmit={handlePasswordUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#555' }}>Nova Senha</label>
                <input 
                  type="password" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  style={{ padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid #e3e0d5', outline: 'none' }}
                />
              </div>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#555' }}>Confirmar Nova Senha</label>
                <input 
                  type="password" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a senha"
                  style={{ padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid #e3e0d5', outline: 'none' }}
                />
              </div>

              {passwordStatus.type === 'error' && <p style={{ color: '#d32f2f', fontSize: '0.8rem', margin: 0 }}>{passwordStatus.msg}</p>}
              {passwordStatus.type === 'success' && <p style={{ color: '#2e7d32', fontSize: '0.8rem', margin: 0 }}>{passwordStatus.msg}</p>}

              <button 
                type="submit" 
                disabled={isUpdatingPassword || !newPassword}
                style={{ 
                  padding: '0.8rem', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: '50px', 
                  fontWeight: 600, cursor: isUpdatingPassword || !newPassword ? 'not-allowed' : 'pointer', opacity: isUpdatingPassword || !newPassword ? 0.6 : 1 
                }}
              >
                {isUpdatingPassword ? 'Atualizando...' : 'Alterar Senha'}
              </button>
            </form>
          </div>

          {/* GAMIFICAÇÃO */}
          <div className="glass-card" style={{ background: 'white', borderRadius: '24px', padding: '2rem', border: '1px solid #f0edf0' }}>
            <h3 style={{ fontSize: '1.25rem', color: '#1a1a2e', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>🎮</span> Gamificação
            </h3>
            
            {loadingEvents ? (
              <p style={{ fontSize: '0.9rem', color: '#999' }}>Carregando eventos...</p>
            ) : events.length === 0 ? (
              <p style={{ fontSize: '0.9rem', color: '#999' }}>Nenhum evento criado ainda.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#555' }}>Selecione o Evento</label>
                  <select 
                    value={selectedEventId} 
                    onChange={(e) => setSelectedEventId(e.target.value)}
                    style={{ padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid #e3e0d5', outline: 'none', background: 'white' }}
                  >
                    {events.map(ev => (
                      <option key={ev.id} value={ev.id}>{ev.isLocal ? '[Local] ' : ''}{ev.event_name}</option>
                    ))}
                  </select>
                </div>

                {selectedEvent && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem', background: '#fafafc', borderRadius: '16px', border: '1px solid #f0edf0' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#1a1a2e', fontSize: '0.95rem' }}>Missões e Conquistas</div>
                      <div style={{ fontSize: '0.8rem', color: '#777', marginTop: '0.2rem' }}>Incentive convidados com mini-jogos.</div>
                    </div>
                    
                    {/* Toggle Switch */}
                    <button 
                      onClick={handleGamificationToggle}
                      disabled={isGamificationUpdating}
                      style={{
                        width: '50px', height: '28px', borderRadius: '50px', border: 'none', cursor: 'pointer',
                        background: selectedEvent.gamification_enabled ? '#E8318A' : '#dcdcdc',
                        position: 'relative', transition: 'background 0.3s'
                      }}
                    >
                      <div style={{
                        width: '22px', height: '22px', background: 'white', borderRadius: '50%',
                        position: 'absolute', top: '3px', left: selectedEvent.gamification_enabled ? '25px' : '3px',
                        transition: 'left 0.3s ease', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                      }} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* COLUNA DIREITA (Acompanhamento de Pedido) */}
        <div style={{ flex: '1 1 340px' }}>
          <div className="glass-card" style={{ background: 'linear-gradient(135deg, #fef2f6 0%, #fce4ec 100%)', borderRadius: '24px', padding: '2rem', border: '1px solid #fce4ec', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.25rem', color: '#1a1a2e', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
                <span>📦</span> Meus Pedidos
              </h3>
              <span style={{ fontSize: '0.7rem', background: 'rgba(232,49,138,0.1)', color: '#E8318A', padding: '0.25rem 0.75rem', borderRadius: '50px', fontWeight: 800 }}>
                EM PRODUÇÃO
              </span>
            </div>
            
            <p style={{ color: '#555', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Acompanhe a revelação das suas fotos. Abaixo está o status do seu último pedido de impressão.
            </p>

            {/* Pedido Fictício / Mock */}
            <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 10px 25px rgba(232,49,138,0.05)' }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div style={{ width: '50px', height: '50px', background: '#FFF0F5', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
                  📸
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#1a1a2e' }}>Kit Retro Polaroid</div>
                  <div style={{ fontSize: '0.8rem', color: '#999' }}>50 Fotos • Pedido #9021</div>
                </div>
              </div>

              {/* Status Timeline */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative', paddingLeft: '10px', borderLeft: '2px dashed #f0edf0', marginLeft: '10px', marginBottom: '1.5rem' }}>
                
                <div style={{ position: 'relative' }}>
                  <div style={{ width: '12px', height: '12px', background: '#27AE60', borderRadius: '50%', position: 'absolute', left: '-17px', top: '4px', border: '2px solid white' }} />
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1a1a2e' }}>Pagamento Aprovado</div>
                  <div style={{ fontSize: '0.75rem', color: '#999' }}>Ontem às 14:30</div>
                </div>

                <div style={{ position: 'relative' }}>
                  <div style={{ width: '12px', height: '12px', background: '#E8318A', borderRadius: '50%', position: 'absolute', left: '-17px', top: '4px', border: '2px solid white', boxShadow: '0 0 0 3px rgba(232,49,138,0.2)' }} />
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1a1a2e' }}>Em Produção</div>
                  <div style={{ fontSize: '0.75rem', color: '#999' }}>Preparando impressão em alta qualidade</div>
                </div>

                <div style={{ position: 'relative', opacity: 0.4 }}>
                  <div style={{ width: '12px', height: '12px', background: '#ddd', borderRadius: '50%', position: 'absolute', left: '-17px', top: '4px', border: '2px solid white' }} />
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1a1a2e' }}>Enviado para Transportadora</div>
                  <div style={{ fontSize: '0.75rem', color: '#999' }}>Aguardando finalização</div>
                </div>

              </div>

              <div style={{ background: '#f8f6f9', padding: '1rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#999', fontWeight: 600, textTransform: 'uppercase' }}>CÓDIGO DE RASTREIO</div>
                  <div style={{ fontSize: '1rem', color: '#1a1a2e', fontWeight: 800, fontFamily: 'monospace' }}>BR928374921TX</div>
                </div>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText('BR928374921TX');
                    alert('Código copiado!');
                  }}
                  style={{ background: 'white', border: '1px solid #e3e0d5', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', color: '#555', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}
                >
                  Copiar
                </button>
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
