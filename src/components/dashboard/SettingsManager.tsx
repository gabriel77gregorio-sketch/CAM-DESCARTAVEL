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
        <h2 style={{ fontSize: '2.2rem', fontFamily: 'var(--font-serif)', color: 'var(--text-primary)', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
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
          <div style={{ background: 'white', borderRadius: '12px', padding: '2rem', border: '1px solid var(--glass-border)', boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
              Segurança
            </h3>
            
            <form onSubmit={handlePasswordUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Nova Senha</label>
                <input 
                  type="password" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #d1d1d6', outline: 'none', fontSize: '16px', backgroundColor: 'white' }}
                />
              </div>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Confirmar Nova Senha</label>
                <input 
                  type="password" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a senha"
                  style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #d1d1d6', outline: 'none', fontSize: '16px', backgroundColor: 'white' }}
                />
              </div>

              {passwordStatus.type === 'error' && <p style={{ color: '#d32f2f', fontSize: '0.8rem', margin: 0 }}>{passwordStatus.msg}</p>}
              {passwordStatus.type === 'success' && <p style={{ color: '#2e7d32', fontSize: '0.8rem', margin: 0 }}>{passwordStatus.msg}</p>}

              <button 
                type="submit" 
                disabled={isUpdatingPassword || !newPassword}
                style={{ 
                  padding: '0.8rem', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '8px', 
                  fontWeight: 600, cursor: isUpdatingPassword || !newPassword ? 'not-allowed' : 'pointer', opacity: isUpdatingPassword || !newPassword ? 0.6 : 1,
                  transition: 'all 0.15s ease'
                }}
                onMouseOver={(e) => { if (!isUpdatingPassword && newPassword) e.currentTarget.style.backgroundColor = 'var(--accent-hover)'; }}
                onMouseOut={(e) => { if (!isUpdatingPassword && newPassword) e.currentTarget.style.backgroundColor = 'var(--accent)'; }}
              >
                {isUpdatingPassword ? 'Atualizando...' : 'Alterar Senha'}
              </button>
            </form>
          </div>

          {/* GAMIFICAÇÃO */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '2rem', border: '1px solid var(--glass-border)', boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
              Gamificação
            </h3>
            
            {loadingEvents ? (
              <p style={{ fontSize: '0.9rem', color: 'var(--text-tertiary)' }}>Carregando eventos...</p>
            ) : events.length === 0 ? (
              <p style={{ fontSize: '0.9rem', color: 'var(--text-tertiary)' }}>Nenhum evento criado ainda.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Selecione o Evento</label>
                  <select 
                    value={selectedEventId} 
                    onChange={(e) => setSelectedEventId(e.target.value)}
                    style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #d1d1d6', outline: 'none', background: 'white', color: 'var(--text-primary)' }}
                  >
                    {events.map(ev => (
                      <option key={ev.id} value={ev.id}>{ev.isLocal ? '[Local] ' : ''}{ev.event_name}</option>
                    ))}
                  </select>
                </div>

                {selectedEvent && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>Missões e Conquistas</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '0.2rem' }}>Incentive convidados com mini-jogos.</div>
                    </div>
                    
                    {/* Toggle Switch (iOS Style Black) */}
                    <button 
                      onClick={handleGamificationToggle}
                      disabled={isGamificationUpdating}
                      style={{
                        width: '46px', height: '26px', borderRadius: '50px', border: 'none', cursor: 'pointer',
                        background: selectedEvent.gamification_enabled ? 'var(--accent)' : '#d1d1d6',
                        position: 'relative', transition: 'background 0.2s ease', outline: 'none'
                      }}
                    >
                      <div style={{
                        width: '20px', height: '20px', background: 'white', borderRadius: '50%',
                        position: 'absolute', top: '3px', left: selectedEvent.gamification_enabled ? '23px' : '3px',
                        transition: 'left 0.2s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
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
          <div style={{ background: 'linear-gradient(135deg, #faf9f6 0%, #f5f5f7 100%)', borderRadius: '12px', padding: '2rem', border: '1px solid var(--glass-border)', height: '100%', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
                Meus Pedidos
              </h3>
              <span style={{ fontSize: '0.7rem', background: 'var(--bg-primary)', color: 'var(--accent-wedding)', border: '1px solid #e3dec9', padding: '0.25rem 0.75rem', borderRadius: '4px', fontWeight: 800 }}>
                EM PRODUÇÃO
              </span>
            </div>
            
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Acompanhe a revelação das suas fotos. Abaixo está o status do seu último pedido de impressão.
            </p>

            {/* Pedido Fictício / Mock */}
            <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', border: '1px solid var(--glass-border)', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div style={{ width: '46px', height: '46px', background: 'var(--bg-secondary)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Kit Retro Polaroid</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>50 Fotos • Pedido #9021</div>
                </div>
              </div>

              {/* Status Timeline */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative', paddingLeft: '12px', borderLeft: '1px solid #d1d1d6', marginLeft: '8px', marginBottom: '1.5rem' }}>
                
                <div style={{ position: 'relative' }}>
                  <div style={{ width: '10px', height: '10px', background: '#27AE60', borderRadius: '50%', position: 'absolute', left: '-17px', top: '4px', border: '2px solid white' }} />
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Pagamento Aprovado</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Ontem às 14:30</div>
                </div>

                <div style={{ position: 'relative' }}>
                  <div style={{ width: '10px', height: '10px', background: 'var(--accent-wedding)', borderRadius: '50%', position: 'absolute', left: '-17px', top: '4px', border: '2px solid white' }} />
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Em Produção</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Preparando impressão em alta qualidade</div>
                </div>

                <div style={{ position: 'relative', opacity: 0.4 }}>
                  <div style={{ width: '10px', height: '10px', background: '#d1d1d6', borderRadius: '50%', position: 'absolute', left: '-17px', top: '4px', border: '2px solid white' }} />
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Enviado para Transportadora</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Aguardando finalização</div>
                </div>

              </div>

              <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--glass-border)' }}>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>CÓDIGO DE RASTREIO</div>
                  <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 800, fontFamily: 'monospace' }}>BR928374921TX</div>
                </div>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText('BR928374921TX');
                    alert('Código copiado!');
                  }}
                  style={{ background: 'white', border: '1px solid #d1d1d6', padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', color: 'var(--text-primary)', boxShadow: 'var(--shadow-sm)', transition: 'all 0.15s ease' }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
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
