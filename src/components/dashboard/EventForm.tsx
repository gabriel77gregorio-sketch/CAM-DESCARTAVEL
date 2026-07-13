import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { createDefaultChallengesForEvent } from '../../lib/gamification';

const slugify = (text: string) => {
  return text
    .toString()
    .normalize('NFD') // Normaliza acentos
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Substitui espaços por -
    .replace(/[^\w\-]+/g, '') // Remove caracteres especiais
    .replace(/\-\-+/g, '-'); // Evita múltiplos -
};

export default function EventForm() {
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [photoLimit, setPhotoLimit] = useState(10);
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [gamificationEnabled, setGamificationEnabled] = useState(true);
  const [photoGoal, setPhotoGoal] = useState<number>(100);

  // Atualiza o slug automaticamente ao mudar o nome do evento
  useEffect(() => {
    setSlug(slugify(eventName));
  }, [eventName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Você precisa estar logado para criar um evento.');
      }

      if (!slug) {
        throw new Error('O nome do evento gerou um slug inválido.');
      }

      const { data, error } = await supabase.from('events').insert([
        {
          user_id: user.id,
          event_name: eventName,
          event_date: eventDate,
          photo_limit_per_user: photoLimit,
          slug,
          is_active: true,
          photo_goal: photoGoal || null,
          gamification_enabled: gamificationEnabled,
        },
      ]).select().single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('Já existe um evento cadastrado com este link/nome. Tente variar o nome.');
        }
        throw error;
      }

      if (data && gamificationEnabled) {
        await createDefaultChallengesForEvent(data.id);
      }

      setSuccessMsg('Evento criado com sucesso! Redirecionando...');
      setTimeout(() => {
        window.location.href = `/painel/evento?slug=${data.slug}`;
      }, 1500);
    } catch (error: any) {
      setErrorMsg(error.message || 'Erro ao criar evento. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card animate-fade-in" style={{ maxWidth: '600px', padding: '2rem', background: 'white' }}>
      <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>Criar Novo Evento</h2>
      
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {errorMsg && (
          <div style={{ padding: '0.75rem', backgroundColor: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div style={{ padding: '0.75rem', backgroundColor: '#d1fae5', border: '1px solid #6ee7b7', color: '#065f46', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
            {successMsg}
          </div>
        )}

        <div className="form-group">
          <label className="form-label" htmlFor="eventName">Nome do Evento</label>
          <input
            id="eventName"
            type="text"
            required
            className="form-control"
            placeholder="Ex: Casamento de Aline e Bruno"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="eventDate">Data do Evento</label>
          <input
            id="eventDate"
            type="date"
            required
            className="form-control"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="photoLimit">Limite de Fotos por Convidado</label>
          <input
            id="photoLimit"
            type="number"
            min="1"
            max="100"
            required
            className="form-control"
            value={photoLimit}
            onChange={(e) => setPhotoLimit(parseInt(e.target.value))}
            disabled={loading}
          />
          <small style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Recomendamos 10 a 20 fotos para simular uma câmera descartável real.</small>
        </div>

        {/* Configurações de Gamificação */}
        <div style={{ padding: '1rem', backgroundColor: '#fafafc', border: '1px solid #f0edf0', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              id="gamification_toggle"
              checked={gamificationEnabled}
              onChange={(e) => setGamificationEnabled(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <label htmlFor="gamification_toggle" style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1a1a2e', cursor: 'pointer' }}>
              Ativar Gamificação (Missões e Conquistas) 🎮
            </label>
          </div>
          
          {gamificationEnabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label className="form-label" htmlFor="photoGoal" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Meta Coletiva de Fotos</label>
              <input
                id="photoGoal"
                type="number"
                min="10"
                max="1000"
                required
                className="form-control"
                value={photoGoal}
                onChange={(e) => setPhotoGoal(parseInt(e.target.value) || 100)}
                disabled={loading}
              />
              <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Quantidade total de fotos que os convidados tentarão atingir juntos.</small>
            </div>
          )}
        </div>

        <div className="form-group" style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--bg-tertiary)' }}>
          <label className="form-label" style={{ color: 'var(--text-secondary)' }}>Link da Câmera do Convidado:</label>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, wordBreak: 'break-all', marginTop: '0.25rem' }}>
            camdescartavel.com/evento?slug=<span style={{ color: 'var(--accent)' }}>{slug || '...' }</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ flex: 1, padding: '0.75rem', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}
          >
            {loading ? 'Criando...' : 'Salvar Evento'}
          </button>
          <a
            href="/painel"
            className="btn-secondary"
            style={{ padding: '0.75rem 1.5rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            Cancelar
          </a>
        </div>
      </form>
    </div>
  );
}
