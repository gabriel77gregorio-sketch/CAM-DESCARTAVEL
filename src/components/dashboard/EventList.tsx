import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { generateCustomTemplatePDF } from '../../lib/qrcode';
import { createDefaultChallengesForEvent } from '../../lib/gamification';

interface Event {
  id: string;
  event_name: string;
  event_date: string;
  photo_limit_per_user: number;
  slug: string;
  is_active: boolean;
  camera_start_time?: string;
  camera_end_time?: string;
  reveal_time?: string;
  created_at: string;
}

const slugify = (text: string) => {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
};

export default function EventList() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  
  // Estados de Personalização das Placas
  const [selectedEventId, setSelectedEventId] = useState<string>('manual');
  const [manualCoupleName, setManualCoupleName] = useState('Ivy & Noah');
  const [manualEventDate, setManualEventDate] = useState('2025-08-22');

  // Estados de Criação de Evento
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [newPhotoLimit, setNewPhotoLimit] = useState(30);
  const [newThemeColor, setNewThemeColor] = useState('lavanda');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPhotoUrl, setCoverPhotoUrl] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  
  // Timing / Reveal
  const [cameraStartTime, setCameraStartTime] = useState('');
  const [cameraEndTime, setCameraEndTime] = useState('');
  const [revealDelay, setRevealDelay] = useState('immediate');
  const [gamificationEnabled, setGamificationEnabled] = useState(true);
  const [photoGoal, setPhotoGoal] = useState<number>(100);

  const [activeTab, setActiveTab] = useState<'placas' | 'cartoes'>('placas');

  const addLog = (msg: string) => {
    console.log(msg);
    setDebugLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  // Buscar Eventos
  const fetchEvents = async () => {
    try {
      addLog('Iniciando fetchEvents...');

      // 1. Carregar eventos locais
      addLog('Verificando eventos locais...');
      const localEventsStr = localStorage.getItem('local_events');
      let markedLocalEvents: Event[] = [];
      if (localEventsStr) {
        const parsedLocal = JSON.parse(localEventsStr) as Event[];
        markedLocalEvents = parsedLocal.map(e => ({ ...e, isLocal: true }));
        addLog(`Eventos locais encontrados: ${markedLocalEvents.length}`);
      }
      
      addLog('Verificando sessão atual...');
      let { data: { session } } = await supabase.auth.getSession();
      addLog(`Sessão inicial resolvida: ${session ? 'Encontrada' : 'Nula'}`);
      
      if (!session) {
        addLog('Sessão não encontrada. Usuário não autenticado.');
      }

      const user = session?.user;
      let dbEvents: Event[] = [];

      if (user) {
        addLog(`Buscando eventos para o usuário: ${user.id}...`);
        const { data: eventsData, error: eventsError } = await supabase
          .from('events')
          .select('*')
          .eq('user_id', user.id)
          .order('event_date', { ascending: true });
          
        if (eventsError) throw eventsError;
        dbEvents = eventsData || [];
        addLog(`Eventos remotos retornados: ${dbEvents.length}`);
      } else {
        addLog('Nenhum usuário logado. Ignorando busca no Supabase.');
      }

      const loadedEvents = [...markedLocalEvents, ...dbEvents];
      setEvents(loadedEvents);

      if (loadedEvents.length > 0) {
        setSelectedEventId(loadedEvents[0].id);
        
        const counts: Record<string, number> = {};
        const remoteEventIds = dbEvents.map(e => e.id);
        
        // Conta fotos remotas se houver
        if (remoteEventIds.length > 0) {
          addLog(`Buscando fotos para os eventos remotos...`);
          const { data: photosData, error: photosError } = await supabase
            .from('photos')
            .select('event_id');

          if (photosError) throw photosError;
          addLog(`Fotos remotas retornadas: ${photosData?.length || 0}`);

          remoteEventIds.forEach(id => {
            counts[id] = 0;
          });
          photosData?.forEach(p => {
            if (counts[p.event_id] !== undefined) {
              counts[p.event_id]++;
            }
          });
        }
        
        // Conta fotos locais
        markedLocalEvents.forEach(e => {
            let total = 0;
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(`photos_${e.id}_`)) {
                    const photos = JSON.parse(localStorage.getItem(key) || '[]');
                    total += photos.length;
                }
            }
            counts[e.id] = total;
        });

        setPhotoCounts(counts);
      } else {
        setSelectedEventId('manual');
      }
      addLog('Carregamento de dados finalizado com sucesso!');
    } catch (error: any) {
      addLog(`Erro ao buscar eventos: ${error.message || error}`);
      console.error('Erro ao buscar eventos:', error);
    } finally {
      addLog('Finalizando fetchEvents.');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleCoverPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCoverFile(file);
      setCoverPhotoUrl(URL.createObjectURL(file));
    }
  };

  const handleRemoveCoverPhoto = () => {
    setCoverFile(null);
    setCoverPhotoUrl('');
  };

  const getBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '';
    try {
      const parts = dateString.split('-');
      if (parts.length < 3) return dateString;
      const [year, month, day] = parts;
      return `${day}/${month}/${year}`;
    } catch (e) {
      return dateString || '';
    }
  };

  // Criar Evento
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setCreateError('');

    try {
      const slug = slugify(newEventName);
      if (!slug) {
        throw new Error('O nome do evento é inválido.');
      }

      // Calcular datas e tempos ISO no escopo pai
      let startIso: string | null = null;
      let endIso: string | null = null;
      let revealIso: string | null = null;

      if (newEventDate && cameraStartTime) {
        startIso = new Date(`${newEventDate}T${cameraStartTime}:00`).toISOString();
      }
      if (newEventDate && cameraEndTime) {
        const endDateObj = new Date(`${newEventDate}T${cameraEndTime}:00`);
        if (cameraStartTime && cameraEndTime < cameraStartTime) {
          endDateObj.setDate(endDateObj.getDate() + 1); // Passou da meia noite
        }
        endIso = endDateObj.toISOString();
      }

      if (revealDelay !== 'immediate') {
        const baseDate = endIso ? new Date(endIso) : new Date(`${newEventDate}T23:59:59`);
        if (revealDelay === '2h') baseDate.setHours(baseDate.getHours() + 2);
        if (revealDelay === '12h') baseDate.setHours(baseDate.getHours() + 12);
        if (revealDelay === '24h') baseDate.setHours(baseDate.getHours() + 24);
        if (revealDelay === '1w') baseDate.setDate(baseDate.getDate() + 7);
        revealIso = baseDate.toISOString();
      }

      // Timeout de 1 segundo para a chamada do Supabase, para evitar travamentos
      const userPromise = supabase.auth.getUser();
      const timeoutPromise = new Promise<{ data: { user: null } }>((resolve) => 
        setTimeout(() => resolve({ data: { user: null } }), 1000)
      );

      addLog('Verificando usuário autenticado...');
      const { data: { user } } = await Promise.race([userPromise, timeoutPromise]);

      // FALLBACK LOCAL: Se não houver usuário logado ou a rede travar
      if (!user) {
        addLog('Usuário offline ou não logado. Salvando localmente...');
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
          event_name: newEventName,
          event_date: newEventDate,
          photo_limit_per_user: newPhotoLimit,
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
        addLog('Álbum salvo localmente!');

        // Redireciona imediatamente
        window.location.href = `/painel/evento?slug=${slug}&local=true`;
        return;
      }

      // FLUXO NORMAL COM SUPABASE
      addLog('Usuário autenticado. Criando álbum no Supabase...');
      let uploadedCoverUrl = '';
      if (coverFile) {
        addLog('Fazendo upload da foto de capa...');
        const fileExt = coverFile.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
        const filePath = `covers/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('event-photos')
          .upload(filePath, coverFile);

        if (uploadError) {
          console.error('Erro de upload da capa:', uploadError);
          addLog(`Erro ao subir capa: ${uploadError.message}`);
        } else {
          const { data } = supabase.storage
            .from('event-photos')
            .getPublicUrl(filePath);
          uploadedCoverUrl = data.publicUrl;
          addLog('Upload da capa finalizado com sucesso!');
        }
      }

      const { data: eventData, error: eventError } = await supabase.from('events').insert([
        {
          user_id: user.id,
          event_name: newEventName,
          event_date: newEventDate,
          photo_limit_per_user: newPhotoLimit,
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

      if (eventError) {
        if (eventError.code === '23505') {
          throw new Error('Já existe um evento com este nome. Tente variar.');
        }
        throw eventError;
      }

      if (eventData && gamificationEnabled) {
        addLog('Criando missões padrão de gamificação...');
        await createDefaultChallengesForEvent(eventData.id);
      }

      addLog('Álbum criado com sucesso no Supabase!');
      // Redireciona para o gerenciador real
      window.location.href = `/painel/evento?slug=${slug}`;
    } catch (error: any) {
      addLog(`Erro ao criar evento: ${error.message}`);
      setCreateError(error.message || 'Erro ao criar evento.');
    } finally {
      setIsCreating(false);
    }
  };

  const [originState, setOriginState] = useState('');
  
  useEffect(() => {
    setOriginState(window.location.origin);
  }, []);

  // 3. Obter os dados configurados (Atualmente Selecionado ou Manual)
  const getActiveConfig = () => {
    const origin = originState;
    
    if (selectedEventId === 'manual') {
      return {
        coupleName: manualCoupleName,
        eventDate: manualEventDate,
        cameraUrl: `${origin}/evento?slug=demo-ivy-noah`,
      };
    }

    const event = events.find(e => e.id === selectedEventId);
    if (!event) {
      return {
        coupleName: manualCoupleName,
        eventDate: manualEventDate,
        cameraUrl: `${origin}/evento?slug=demo-ivy-noah`,
      };
    }

    return {
      coupleName: event.event_name,
      eventDate: event.event_date,
      cameraUrl: `${origin}/evento?slug=${event.slug}`,
    };
  };

  const activeConfig = getActiveConfig();

  const handleDownloadTemplate = async (templateId: string) => {
    try {
      await generateCustomTemplatePDF(
        templateId,
        activeConfig.coupleName,
        activeConfig.eventDate,
        activeConfig.cameraUrl
      );
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar PDF do template.');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: '1.5rem' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid var(--bg-tertiary)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <div style={{ 
          fontSize: '0.85rem', 
          color: '#ef4444', 
          fontFamily: 'monospace', 
          background: '#fef2f2', 
          border: '1px solid #fee2e2', 
          borderRadius: '12px', 
          padding: '1.5rem', 
          maxWidth: '600px', 
          width: '100%',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          textAlign: 'left'
        }}>
          <h4 style={{ margin: 0, color: '#991b1b', fontWeight: 700 }}>🔍 Logs de Carregamento (Debug):</h4>
          {debugLogs.length === 0 ? (
            <div style={{ color: '#666' }}>Iniciando e conectando...</div>
          ) : (
            debugLogs.map((log, idx) => (
              <div key={idx} style={{ borderBottom: '1px solid #fee2e2', paddingBottom: '0.25rem' }}>{log}</div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem', fontFamily: 'var(--font-sans)', padding: '0 0.5rem 3rem' }} className="animate-fade-in">
      
      {/* 1. SEÇÃO PRINCIPAL: Comece seu primeiro álbum */}
      <div>
        <span style={{ fontSize: '0.72rem', color: 'var(--accent-wedding)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '0.4rem' }}>
          • PAINEL
        </span>
        <h2 style={{ fontSize: 'clamp(1.6rem, 5vw, 2.6rem)', fontFamily: 'var(--font-serif)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2rem', letterSpacing: '-0.02em' }}>
          Comece seu primeiro álbum
        </h2>

        {/* Card: Três coisas e você está ao vivo */}
        <div style={{ background: 'white', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative', boxShadow: 'var(--shadow-sm)' }}>
          <div>
            <span style={{ fontSize: '0.7rem', color: 'var(--accent-wedding)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              • PRIMEIRO ÁLBUM · 60 SEGUNDOS
            </span>
            <h3 style={{ fontSize: '2rem', fontFamily: 'var(--font-serif)', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.4rem', marginBottom: '0.2rem' }}>
              Três passos simples para iniciar.
            </h3>
          </div>

          {/* Lista de Passos numerados como no mockup */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 500 }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '50%', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 700 }}>1</span>
              <span>Dê um nome ao casal e marque a data.</span>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '50%', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 700 }}>2</span>
              <span>Escolha uma foto de capa e uma paleta de cores.</span>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '50%', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 700 }}>3</span>
              <span>Baixe o código QR e cole-o na placa de boas-vindas do casamento.</span>
            </div>
          </div>

          <div style={{ marginTop: '0.5rem' }}>
            <button
              onClick={() => window.location.href = '/painel/novo-evento'}
              style={{
                padding: '0.85rem 2rem',
                backgroundColor: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--accent)'}
            >
              Criar Álbum de Casamento
            </button>
          </div>
        </div>
      </div>

      {/* Exibição rápida de álbuns ativos se existirem */}
      {events.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          <h3 style={{ fontSize: '1.3rem', fontFamily: 'var(--font-serif)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1.25rem' }}>
            Álbuns Criados ({events.length})
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.25rem' }}>
            {events.map((event) => (
              <div key={event.id} style={{ background: 'white', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>{event.event_name}</h4>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      {formatDate(event.event_date)}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.25rem 0.5rem', borderRadius: '4px', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}>
                    Ativo
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <a href={`/painel/evento?slug=${event.slug}`} style={{ flex: 1, padding: '0.5rem 1rem', border: '1px solid #d1d1d6', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600, textAlign: 'center', textDecoration: 'none', transition: 'all 0.15s ease' }}>
                    Ver Álbum
                  </a>
                  <a href={`/evento?slug=${event.slug}`} target="_blank" rel="noopener noreferrer" style={{ padding: '0.5rem 0.75rem', backgroundColor: 'var(--accent)', color: 'white', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. SEÇÃO: Modelos de código QR, prontos para imprimir */}
      <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '2.5rem' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--accent-wedding)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '0.4rem' }}>
          • PRONTO PARA IMPRESSÃO
        </span>
        <h3 style={{ fontSize: '2.4rem', fontFamily: 'var(--font-serif)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem', letterSpacing: '-0.02em' }}>
          Modelos de código QR, prontos para imprimir.
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.98rem', marginBottom: '2rem', maxWidth: '800px', lineHeight: 1.5 }}>
          Escolha um modelo, preencha os nomes do casal e a data, e o código QR do seu evento será sobreposto automaticamente.
        </p>

        {/* Abas / Filtro exatos como no mockup (Pill Preto para Ativo) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '2rem' }}>
          <button
            onClick={() => setActiveTab('placas')}
            style={{
              padding: '0.5rem 1rem',
              background: activeTab === 'placas' ? 'var(--accent)' : 'transparent',
              color: activeTab === 'placas' ? 'white' : '#515154',
              border: activeTab === 'placas' ? 'none' : '1px solid #d1d1d6',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.15s ease',
              minHeight: '36px',
            }}
          >
            Placas de boas-vindas
            <span style={{ fontSize: '0.75rem', fontWeight: 400, opacity: activeTab === 'placas' ? 0.8 : 0.6 }}>
              5x7 pol
            </span>
          </button>

          <button
            onClick={() => {
              alert('Os cartões de lugar (3.5x2 polegadas) estarão disponíveis em breve!');
            }}
            style={{
              padding: '0.5rem 1rem',
              background: 'transparent',
              color: '#515154',
              border: '1px solid #d1d1d6',
              borderRadius: '8px',
              fontWeight: 500,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              minHeight: '36px',
            }}
          >
            Cartões de lugar
            <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#86868b' }}>
              3,5 × 2 pol
            </span>
          </button>
        </div>

        {/* Ferramenta Funcional de QR Code / Personalização */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '1.5rem', marginBottom: '2.5rem', display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: '220px' }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>VINCULAR AO ÁLBUM</label>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              style={{ padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid #d1d1d6', fontSize: '0.85rem', color: 'var(--text-primary)', outline: 'none', background: 'white', minHeight: '38px' }}
            >
              {events.map(e => (
                <option key={e.id} value={e.id}>{e.event_name}</option>
              ))}
              <option value="manual">Personalização Manual (Modo Teste)</option>
            </select>
          </div>

          {selectedEventId === 'manual' && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1, minWidth: '180px' }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>NOMES DO CASAL</label>
                <input
                  type="text"
                  value={manualCoupleName}
                  onChange={(e) => setManualCoupleName(e.target.value)}
                  placeholder="Ex: Ivy & Noah"
                  style={{ padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid #d1d1d6', fontSize: '0.85rem', color: 'var(--text-primary)', outline: 'none', background: 'white', minHeight: '38px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: '150px' }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>DATA DO CASAMENTO</label>
                <input
                  type="date"
                  value={manualEventDate}
                  onChange={(e) => setManualEventDate(e.target.value)}
                  style={{ padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid #d1d1d6', fontSize: '0.85rem', color: 'var(--text-primary)', outline: 'none', background: 'white', minHeight: '38px' }}
                />
              </div>
            </>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', paddingLeft: '0.5rem' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 700 }}>LINK DE LEITURA DO QR CODE:</span>
            <code style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 600, wordBreak: 'break-all' }}>
              {activeConfig.cameraUrl}
            </code>
          </div>
        </div>

        {/* Grid de Placas de Mesa exatamente como a Mockup */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '2rem', justifyContent: 'center' }}>
          
          {/* Card 1: Clássico */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
            <div 
              onClick={() => handleDownloadTemplate('classico')}
              style={{ background: 'white', border: '1px solid #dcdad0', width: '170px', height: '240px', padding: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-3px)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div style={{ border: '1px solid #1a1a2e', padding: '0.4rem', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.4rem', letterSpacing: '0.05em', color: '#555', transform: 'scale(0.8)' }}>JUNTE-SE A NÓS NA CELEBRAÇÃO</span>
                <span style={{ fontStyle: 'italic', fontFamily: 'serif', fontSize: '1rem', color: '#1a1a2e', fontWeight: 'bold', marginTop: '0.2rem' }}>{activeConfig.coupleName}</span>
                <span style={{ fontSize: '0.45rem', color: '#555', transform: 'scale(0.9)' }}>{formatDate(activeConfig.eventDate)}</span>
                <span style={{ color: '#777', fontSize: '0.35rem', opacity: 0.6 }}>COTSWOLDS</span>
                
                {/* QR Code centralizado */}
                <div style={{ width: '45px', height: '45px', border: '1px solid #eee', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.5"><rect x="2" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="2" width="6" height="6" rx="1"/><rect x="10" y="10" width="4" height="4" rx="0.5"/><path d="M10 2h4M2 10v4M14 10h4M10 14v4M16 16h6v6h-6zM22 10v4M10 22h4"/></svg>
                </div>

                <span style={{ fontSize: '0.35rem', letterSpacing: '0.02em', color: '#999', transform: 'scale(0.8)' }}>DIGITALIZE PARA ADICIONAR SUAS FOTOS</span>
              </div>
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#555' }}>Clássico</span>
          </div>

          {/* Card 2: Audacioso */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
            <div 
              onClick={() => handleDownloadTemplate('audacioso')}
              style={{ background: 'white', border: '1px solid #dcdad0', width: '170px', height: '240px', padding: '1.25rem 1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-3px)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <span style={{ fontWeight: 800, fontSize: '1.4rem', color: '#1a1a2e', letterSpacing: '0.02em' }}>BEM-VINDO</span>
              <div>
                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#E8318A', display: 'block' }}>{activeConfig.coupleName}</span>
                <span style={{ fontSize: '0.55rem', color: '#777' }}>{formatDate(activeConfig.eventDate)}</span>
              </div>
              
              <div style={{ width: '45px', height: '45px', border: '1px solid #eee', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.5"><rect x="2" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="2" width="6" height="6" rx="1"/><rect x="10" y="10" width="4" height="4" rx="0.5"/><path d="M10 2h4M2 10v4M14 10h4M10 14v4M16 16h6v6h-6zM22 10v4M10 22h4"/></svg>
              </div>

              <span style={{ fontWeight: 600, fontSize: '0.45rem', color: '#999' }}>ADICIONE SUAS FOTOS AQUI</span>
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#555' }}>Audacioso</span>
          </div>

          {/* Card 3: Cabine de fotos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
            <div 
              onClick={() => handleDownloadTemplate('cabine')}
              style={{ background: 'white', border: '1px solid #dcdad0', width: '170px', height: '240px', padding: '1.25rem 1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-3px)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem' }}>
                <span style={{ display: 'flex', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                </span>
                <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#1a1a2e' }}>cabine de fotos</span>
                <span style={{ fontSize: '0.4rem', color: '#777', letterSpacing: '0.04em' }}>FOTOGRAFE. DIGITALIZE. ENVIE.</span>
              </div>
              
              <div style={{ width: '45px', height: '45px', border: '1px solid #eee', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.5"><rect x="2" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="2" width="6" height="6" rx="1"/><rect x="10" y="10" width="4" height="4" rx="0.5"/><path d="M10 2h4M2 10v4M14 10h4M10 14v4M16 16h6v6h-6zM22 10v4M10 22h4"/></svg>
              </div>

              <div>
                <span style={{ fontWeight: 700, fontSize: '0.6rem', color: '#1a1a2e', display: 'block' }}>{activeConfig.coupleName}</span>
                <span style={{ fontSize: '0.45rem', color: '#999' }}>{formatDate(activeConfig.eventDate)}</span>
              </div>
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#555' }}>Cabine de fotos</span>
          </div>

          {/* Card 4: Poço dos Desejos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
            <div 
              onClick={() => handleDownloadTemplate('desejos')}
              style={{ background: 'white', border: '1px solid #dcdad0', width: '170px', height: '240px', padding: '1.25rem 1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-3px)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                <span style={{ display: 'flex', color: 'var(--accent-wedding)', marginBottom: '0.25rem' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                </span>
                <span style={{ fontSize: '0.4rem', color: '#999', letterSpacing: '0.04em' }}>UM PEQUENO DESEJO</span>
                <span style={{ fontStyle: 'italic', fontFamily: 'serif', fontSize: '0.8rem', color: '#1a1a2e', fontWeight: 600 }}>Deixe-nos suas lembranças.</span>
              </div>
              
              <div style={{ width: '45px', height: '45px', border: '1px solid #eee', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.5"><rect x="2" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="2" width="6" height="6" rx="1"/><rect x="10" y="10" width="4" height="4" rx="0.5"/><path d="M10 2h4M2 10v4M14 10h4M10 14v4M16 16h6v6h-6zM22 10v4M10 22h4"/></svg>
              </div>

              <div>
                <span style={{ fontWeight: 700, fontSize: '0.6rem', color: '#1a1a2e', display: 'block' }}>{activeConfig.coupleName}</span>
                <span style={{ fontSize: '0.45rem', color: '#999' }}>{formatDate(activeConfig.eventDate)}</span>
              </div>
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#555' }}>Poço dos Desejos</span>
          </div>

          {/* Card 5: Botânico */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
            <div 
              onClick={() => handleDownloadTemplate('botanico')}
              style={{ background: 'white', border: '1px solid #dcdad0', width: '170px', height: '240px', padding: '1.25rem 1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 15px rgba(0,0,0,0.02)', position: 'relative' }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-3px)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div style={{ position: 'absolute', top: '15px', bottom: '15px', left: '6px', borderLeft: '1px dashed #eee' }}></div>
              <div style={{ position: 'absolute', top: '15px', bottom: '15px', right: '6px', borderRight: '1px dashed #eee' }}></div>
              
              <span style={{ fontSize: '0.45rem', color: '#999' }}>JUNTOS COM</span>
              <span style={{ fontFamily: 'serif', fontSize: '0.9rem', color: '#1a1a2e', fontWeight: 'bold' }}>{activeConfig.coupleName}</span>
              <span style={{ fontSize: '0.45rem', color: '#777' }}>{formatDate(activeConfig.eventDate)}</span>
              
              <div style={{ width: '45px', height: '45px', border: '1px solid #eee', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white', zIndex: 1 }}>
                <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.5"><rect x="2" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="2" width="6" height="6" rx="1"/><rect x="10" y="10" width="4" height="4" rx="0.5"/><path d="M10 2h4M2 10v4M14 10h4M10 14v4M16 16h6v6h-6zM22 10v4M10 22h4"/></svg>
              </div>

              <span style={{ fontStyle: 'italic', fontSize: '0.55rem', color: '#1a1a2e', fontWeight: 600 }}>Compartilhe suas memórias</span>
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#555' }}>Botânico</span>
          </div>

        </div>
      </div>

    </div>
  );
}
