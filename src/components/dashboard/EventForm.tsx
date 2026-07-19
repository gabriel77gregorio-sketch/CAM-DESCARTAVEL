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

// Converte File em Base64 para fallback offline local
const getBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

export default function EventForm() {
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [photoLimit, setPhotoLimit] = useState(15);
  const [newThemeColor, setNewThemeColor] = useState('rosa'); // padrão champagne
  const [cameraStartTime, setCameraStartTime] = useState('');
  const [cameraEndTime, setCameraEndTime] = useState('');
  const [revealDelay, setRevealDelay] = useState('immediate');
  const [gamificationEnabled, setGamificationEnabled] = useState(true);
  const [photoGoal, setPhotoGoal] = useState<number>(100);
  
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPhotoUrl, setCoverPhotoUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [slug, setSlug] = useState('');

  // Atualiza o slug automaticamente ao mudar o nome do evento
  useEffect(() => {
    setSlug(slugify(eventName));
  }, [eventName]);

  const handleCoverPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCoverFile(file);
      setCoverPhotoUrl(URL.createObjectURL(file));
    }
  };

  const handleRemoveCoverPhoto = () => {
    setCoverFile(null);
    setCoverPhotoUrl(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      // Calcular datas e tempos ISO no escopo pai
      let startIso: string | null = null;
      let endIso: string | null = null;
      let revealIso: string | null = null;

      if (eventDate && cameraStartTime) {
        startIso = new Date(`${eventDate}T${cameraStartTime}:00`).toISOString();
      }
      if (eventDate && cameraEndTime) {
        const endDateObj = new Date(`${eventDate}T${cameraEndTime}:00`);
        if (cameraStartTime && cameraEndTime < cameraStartTime) {
          endDateObj.setDate(endDateObj.getDate() + 1); // Passou da meia noite
        }
        endIso = endDateObj.toISOString();
      }

      if (revealDelay !== 'immediate') {
        const baseDate = endIso ? new Date(endIso) : new Date(`${eventDate}T23:59:59`);
        if (revealDelay === '2h') baseDate.setHours(baseDate.getHours() + 2);
        if (revealDelay === '12h') baseDate.setHours(baseDate.getHours() + 12);
        if (revealDelay === '24h') baseDate.setHours(baseDate.getHours() + 24);
        if (revealDelay === '1w') baseDate.setDate(baseDate.getDate() + 7);
        revealIso = baseDate.toISOString();
      }

      // Tenta obter usuário no Supabase
      const userPromise = supabase.auth.getUser();
      const timeoutPromise = new Promise<{ data: { user: null } }>((resolve) => 
        setTimeout(() => resolve({ data: { user: null } }), 1000)
      );

      const { data: { user } } = await Promise.race([userPromise, timeoutPromise]);

      // FALLBACK LOCAL: Se não houver usuário logado ou a rede falhar
      if (!user) {
        let localCoverBase64 = '';
        if (coverFile) {
          try {
            localCoverBase64 = await getBase64(coverFile);
          } catch (err) {
            console.error('Erro ao converter imagem de capa:', err);
          }
        }

        const localEvents = JSON.parse(localStorage.getItem('local_events') || '[]');
        const newLocalEvent = {
          id: `local-${Date.now()}`,
          event_name: eventName,
          event_date: eventDate,
          photo_limit_per_user: photoLimit,
          slug,
          is_active: true,
          camera_start_time: startIso,
          camera_end_time: endIso,
          reveal_time: revealIso,
          cover_photo_url: localCoverBase64 || null,
          theme_color: newThemeColor,
          photo_goal: photoGoal || null,
          gamification_enabled: gamificationEnabled,
          created_at: new Date().toISOString()
        };

        localEvents.push(newLocalEvent);
        localStorage.setItem('local_events', JSON.stringify(localEvents));
        setSuccessMsg('Álbum offline criado com sucesso localmente!');
        
        setTimeout(() => {
          window.location.href = `/painel/evento?slug=${slug}&local=true`;
        }, 1500);
        return;
      }

      // FLUXO NORMAL COM SUPABASE
      if (!slug) {
        throw new Error('O nome do evento gerou um link inválido.');
      }

      let uploadedCoverUrl = '';
      if (coverFile) {
        const fileExt = coverFile.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
        const filePath = `covers/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('event-photos')
          .upload(filePath, coverFile);

        if (uploadError) {
          console.error('Erro de upload da capa:', uploadError);
        } else {
          const { data } = supabase.storage
            .from('event-photos')
            .getPublicUrl(filePath);
          uploadedCoverUrl = data.publicUrl;
        }
      }

      const { data, error } = await supabase.from('events').insert([
        {
          user_id: user.id,
          event_name: eventName,
          event_date: eventDate,
          photo_limit_per_user: photoLimit,
          slug,
          is_active: true,
          camera_start_time: startIso,
          camera_end_time: endIso,
          reveal_time: revealIso,
          cover_photo_url: uploadedCoverUrl || null,
          theme_color: newThemeColor,
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

      setSuccessMsg('Álbum de casamento criado com sucesso!');
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
    <div className="animate-fade-in" style={{ width: '100%', maxWidth: '620px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      <div style={{ background: 'white', borderRadius: '12px', padding: '2.5rem 2rem', border: '1px solid var(--glass-border)', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '1.5rem' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 12v10H4V12" />
              <path d="m2 7 10 5 10-5" />
              <path d="M22 7a2 2 0 0 0-2-2h-3.5a3 3 0 0 0-5 0H8a2 2 0 0 0-2 2" />
              <path d="M12 12V5" />
            </svg>
          </div>
          <div>
            <span style={{ fontSize: '0.68rem', color: 'var(--accent-wedding)', fontWeight: 800, letterSpacing: '0.08em', display: 'block', textTransform: 'uppercase' }}>Criação de Álbum</span>
            <h3 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-serif)', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Configure suas preferências</h3>
          </div>
        </div>

        {errorMsg && (
          <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fdf2f2', border: '1px solid #fde8e8', color: '#c81e1e', borderRadius: '8px', fontSize: '0.85rem' }}>
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div style={{ padding: '0.75rem 1rem', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', borderRadius: '8px', fontSize: '0.85rem' }}>
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Nome do Casal */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>NOME DO CASAL / EVENTO</label>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)' }}>{eventName.length}/40</span>
            </div>
            <input
              type="text"
              required
              maxLength={40}
              placeholder="Ex: Gabriel & Amanda"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              disabled={loading}
              style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #d1d1d6', fontSize: '16px', color: 'var(--text-primary)', outline: 'none', transition: 'border-color 0.15s ease', minHeight: '44px', width: '100%', backgroundColor: 'white' }}
              onFocus={(e) => e.target.style.borderColor = 'var(--text-primary)'}
              onBlur={(e) => e.target.style.borderColor = '#d1d1d6'}
            />
          </div>

          {/* Data e Tema Visual */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            
            {/* Data */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: '1 1 200px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>DATA DO CASAMENTO</label>
              <input
                type="date"
                required
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                disabled={loading}
                style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #d1d1d6', fontSize: '16px', color: 'var(--text-primary)', outline: 'none', background: 'white', minHeight: '44px', width: '100%' }}
              />
            </div>

            {/* Tema Visual */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: '1 1 200px', position: 'relative' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>TEMA VISUAL</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <div style={{
                  position: 'absolute',
                  left: '14px',
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  backgroundColor: newThemeColor === 'lavanda' ? '#1d1d1f' :
                                   newThemeColor === 'rosa' ? '#c5a880' :
                                   newThemeColor === 'menta' ? '#8fa89b' :
                                   newThemeColor === 'azul' ? '#e5e5e7' : '#b8a18f',
                  transition: 'background-color 0.15s ease'
                }} />
                <select
                  value={newThemeColor}
                  onChange={(e) => setNewThemeColor(e.target.value)}
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem 0.75rem 2.25rem',
                    borderRadius: '8px',
                    border: '1px solid #d1d1d6',
                    fontSize: '0.95rem',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    background: 'white',
                    appearance: 'none',
                    cursor: 'pointer',
                    minHeight: '44px'
                  }}
                >
                  <option value="lavanda">Classic Black</option>
                  <option value="rosa">Champagne Gold</option>
                  <option value="menta">Sage Green</option>
                  <option value="azul">Silk White</option>
                  <option value="sol">Earth Oak</option>
                </select>
                <div style={{ position: 'absolute', right: '12px', pointerEvents: 'none', fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>▼</div>
              </div>
            </div>

          </div>

          {/* Limite de Fotos por Convidado */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>LIMITE DE FOTOS POR CONVIDADO</label>
            <input
              type="number"
              min="1"
              max="100"
              required
              value={photoLimit}
              onChange={(e) => setPhotoLimit(parseInt(e.target.value) || 15)}
              disabled={loading}
              style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #d1d1d6', fontSize: '16px', color: 'var(--text-primary)', outline: 'none', background: 'white', minHeight: '44px' }}
            />
            <small style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>Recomendamos 10 a 20 fotos para emular uma câmera descartável real.</small>
          </div>

          {/* Configurações de Janela da Câmera & Revelação */}
          <div style={{ padding: '1.25rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--glass-border)' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>JANELA DA CÂMERA & REVELAÇÃO</label>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: '1 1 130px' }}>
                <label style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-secondary)' }}>HORA INÍCIO (OPCIONAL)</label>
                <input
                  type="time"
                  value={cameraStartTime}
                  onChange={(e) => setCameraStartTime(e.target.value)}
                  disabled={loading}
                  style={{ padding: '0.65rem 0.75rem', borderRadius: '8px', border: '1px solid #d1d1d6', fontSize: '0.9rem', outline: 'none', background: 'white' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: '1 1 130px' }}>
                <label style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-secondary)' }}>HORA TÉRMINO (OPCIONAL)</label>
                <input
                  type="time"
                  value={cameraEndTime}
                  onChange={(e) => setCameraEndTime(e.target.value)}
                  disabled={loading}
                  style={{ padding: '0.65rem 0.75rem', borderRadius: '8px', border: '1px solid #d1d1d6', fontSize: '0.9rem', outline: 'none', background: 'white' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-secondary)' }}>TEMPO DE REVELAÇÃO DAS FOTOS</label>
              <select
                value={revealDelay}
                onChange={(e) => setRevealDelay(e.target.value)}
                disabled={loading}
                style={{ padding: '0.65rem 0.75rem', borderRadius: '8px', border: '1px solid #d1d1d6', fontSize: '0.9rem', outline: 'none', background: 'white', cursor: 'pointer', minHeight: '38px' }}
              >
                <option value="immediate">Revelação Imediata (Tirou, revelou)</option>
                <option value="2h">2 horas após o término</option>
                <option value="12h">12 horas após o término</option>
                <option value="24h">No dia seguinte (24h)</option>
                <option value="1w">1 semana depois</option>
              </select>
            </div>
          </div>

          {/* Configurações de Gamificação */}
          <div style={{ padding: '1.25rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                id="gamification_toggle"
                checked={gamificationEnabled}
                onChange={(e) => setGamificationEnabled(e.target.checked)}
                disabled={loading}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label htmlFor="gamification_toggle" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                Ativar conquistas e missões de fotos para convidados
              </label>
            </div>
            
            {gamificationEnabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', animation: 'fadeIn 0.15s ease-out' }}>
                <label style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>META COLETIVA DE FOTOS (FOTOS)</label>
                <input
                  type="number"
                  min="10"
                  max="1000"
                  value={photoGoal}
                  onChange={(e) => setPhotoGoal(parseInt(e.target.value) || 100)}
                  disabled={loading}
                  style={{ padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid #d1d1d6', fontSize: '0.95rem', color: 'var(--text-primary)', outline: 'none', background: 'white' }}
                />
                <small style={{ color: 'var(--text-tertiary)', fontSize: '0.7rem' }}>Exibe uma barra de progresso coletiva na câmera dos convidados.</small>
              </div>
            )}
          </div>

          {/* Foto de Capa */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>FOTO DE CAPA DO ÁLBUM</label>
            {coverPhotoUrl ? (
              <div style={{ position: 'relative', width: '90px', height: '90px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #d1d1d6', boxShadow: 'var(--shadow-sm)' }}>
                <img src={coverPhotoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Capa" />
                <button 
                  type="button"
                  onClick={handleRemoveCoverPhoto}
                  disabled={loading}
                  style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.6)', border: 'none', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 'bold' }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '90px', height: '90px', border: '1px dashed #d1d1d6', borderRadius: '8px', cursor: 'pointer', background: 'var(--bg-secondary)', transition: 'all 0.15s ease' }}>
                <span style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', lineHeight: 1 }}>+</span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>Carregar</span>
                <input type="file" accept="image/*" onChange={handleCoverPhotoChange} disabled={loading} style={{ display: 'none' }} />
              </label>
            )}
          </div>

          {/* Link Preview (Dinâmico) */}
          <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 700, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Link de Acesso da Câmera:</label>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600, wordBreak: 'break-all', marginTop: '0.25rem', fontFamily: 'monospace' }}>
              seu-site.com/evento?slug=<span style={{ color: 'var(--accent-wedding)', fontWeight: 700 }}>{slug || '...' }</span>
            </div>
          </div>

          {/* Botões de Ação */}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
                padding: '0.85rem 1.5rem',
                backgroundColor: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
                minHeight: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseOver={(e) => { if(!loading) e.currentTarget.style.backgroundColor = 'var(--accent-hover)'; }}
              onMouseOut={(e) => { if(!loading) e.currentTarget.style.backgroundColor = 'var(--accent)'; }}
            >
              {loading ? 'Criando álbum...' : 'Criar Álbum'}
            </button>
            <a
              href="/painel"
              style={{
                padding: '0.85rem 1.5rem',
                backgroundColor: 'white',
                color: 'var(--text-primary)',
                border: '1px solid #d1d1d6',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.95rem',
                textDecoration: 'none',
                minHeight: '44px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
            >
              Cancelar
            </a>
          </div>
          
          {/* Subtexto */}
          <div style={{ textTransform: 'uppercase', fontSize: '0.55rem', letterSpacing: '0.12em', fontWeight: 700, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '0.5rem' }}>
            • Álbum Digital Analógico para Eventos •
          </div>

        </form>
      </div>
    </div>
  );
}
