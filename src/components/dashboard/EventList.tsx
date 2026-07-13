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
  const [newPhotoLimit, setNewPhotoLimit] = useState(10);
  const [newThemeColor, setNewThemeColor] = useState('lavanda');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPhotoUrl, setCoverPhotoUrl] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');
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
      
      addLog('Verificando sessão atual...');
      let { data: { session } } = await supabase.auth.getSession();
      addLog(`Sessão inicial resolvida: ${session ? 'Encontrada' : 'Nula'}`);
      
      if (!session) {
        addLog('Sessão não encontrada. Tentando auto-login...');
        const { data, error } = await supabase.auth.signInWithPassword({
          email: 'teste@camdescartavel.com',
          password: '123456'
        });
        if (error) {
          addLog(`Erro no auto-login: ${error.message}`);
        }
        if (data?.session) {
          addLog('Auto-login bem sucedido!');
          session = data.session;
        } else {
          addLog('Auto-login retornou dados vazios.');
        }
      }

      const user = session?.user;
      if (!user) {
        addLog('Nenhum usuário logado. Abortando fetchEvents.');
        setLoading(false);
        return;
      }

      addLog(`Buscando eventos para o usuário: ${user.id}...`);
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq('user_id', user.id)
        .order('event_date', { ascending: true });

      addLog(`Eventos retornados: ${eventsData?.length || 0}`);
      const loadedEvents = eventsData || [];
      setEvents(loadedEvents);

      if (loadedEvents.length > 0) {
        setSelectedEventId(loadedEvents[0].id);
        
        const eventIds = loadedEvents.map(e => e.id);
        addLog(`Buscando fotos para os eventos: ${eventIds.join(', ')}...`);
        const { data: photosData, error: photosError } = await supabase
          .from('photos')
          .select('event_id');

        if (photosError) throw photosError;
        addLog(`Fotos retornadas: ${photosData?.length || 0}`);

        const counts: Record<string, number> = {};
        eventIds.forEach(id => {
          counts[id] = 0;
        });
        photosData?.forEach(p => {
          if (counts[p.event_id] !== undefined) {
            counts[p.event_id]++;
          }
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

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
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
        <span style={{ fontSize: '0.72rem', color: '#E8318A', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '0.4rem' }}>
          • PAINEL
        </span>
        <h2 style={{ fontSize: '2.6rem', fontFamily: 'var(--font-serif)', fontWeight: 700, color: '#1a1a2e', marginBottom: '2rem', letterSpacing: '-0.02em' }}>
          Comece seu primeiro álbum
        </h2>

        {/* Card: Três coisas e você está ao vivo */}
        <div style={{ background: 'white', border: '1px dashed #dcdad0', borderRadius: '24px', padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative' }}>
          <div>
            <span style={{ fontSize: '0.7rem', color: '#E8318A', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              • PRIMEIRO ÁLBUM · 60 SEGUNDOS
            </span>
            <h3 style={{ fontSize: '2rem', fontFamily: 'var(--font-serif)', fontWeight: 700, color: '#1a1a2e', marginTop: '0.4rem', marginBottom: '0.2rem' }}>
              Três coisas e você está ao vivo.
            </h3>
          </div>

          {/* Lista de Passos numerados como no mockup */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', color: '#1a1a2e', fontSize: '0.95rem', fontWeight: 500 }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '50%', background: '#FFF0F5', color: '#E8318A', fontSize: '0.85rem', fontWeight: 700 }}>1</span>
              <span>Dê um nome ao casal e marque a data.</span>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '50%', background: '#FFF0F5', color: '#E8318A', fontSize: '0.85rem', fontWeight: 700 }}>2</span>
              <span>Escolha uma foto de capa e uma paleta de cores.</span>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '50%', background: '#FFF0F5', color: '#E8318A', fontSize: '0.85rem', fontWeight: 700 }}>3</span>
              <span>Baixe o código QR e cole-o na placa de boas-vindas. Pronto.</span>
            </div>
          </div>

          <div style={{ marginTop: '0.5rem' }}>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                padding: '0.9rem 2.2rem',
                backgroundColor: '#E8318A',
                color: 'white',
                border: 'none',
                borderRadius: '50px',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(232, 49, 138, 0.25)',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              + Primeiro álbum do Spin Up
            </button>
          </div>
        </div>
      </div>

      {/* Exibição rápida de álbuns ativos se existirem */}
      {events.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          <h3 style={{ fontSize: '1.3rem', fontFamily: 'var(--font-serif)', fontWeight: 700, color: '#1a1a2e', marginBottom: '1rem' }}>
            Álbuns Criados ({events.length})
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.25rem' }}>
            {events.map((event) => (
              <div key={event.id} style={{ background: 'white', border: '1px solid #f0edf0', borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{event.event_name}</h4>
                    <span style={{ fontSize: '0.8rem', color: '#999' }}>📅 {formatDate(event.event_date)}</span>
                  </div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.25rem 0.5rem', borderRadius: '50px', backgroundColor: '#FFF0F5', color: '#E8318A' }}>
                    Ativo
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <a href={`/painel/evento?slug=${event.slug}`} style={{ flex: 1, padding: '0.5rem', border: '1px solid #e8c8d4', borderRadius: '50px', color: '#E8318A', fontSize: '0.85rem', fontWeight: 600, textAlign: 'center', textDecoration: 'none' }}>
                    Ver Álbum
                  </a>
                  <a href={`/evento?slug=${event.slug}`} target="_blank" rel="noopener noreferrer" style={{ padding: '0.5rem 0.75rem', backgroundColor: '#E8318A', color: 'white', borderRadius: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    📷
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. SEÇÃO: Modelos de código QR, prontos para imprimir */}
      <div style={{ borderTop: '1px solid #f0edf0', paddingTop: '2.5rem' }}>
        <span style={{ fontSize: '0.72rem', color: '#E8318A', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '0.4rem' }}>
          • PRONTO PARA IMPRESSÃO
        </span>
        <h3 style={{ fontSize: '2.4rem', fontFamily: 'var(--font-serif)', fontWeight: 700, color: '#1a1a2e', marginBottom: '0.4rem', letterSpacing: '-0.02em' }}>
          Modelos de código QR, prontos para imprimir.
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.98rem', marginBottom: '2rem', maxWidth: '800px', lineHeight: 1.5 }}>
          Escolha um modelo, preencha os nomes do casal e a data, e o código QR do seu evento será sobreposto automaticamente.
        </p>

        {/* Abas / Filtro exatos como no mockup (Pill Preto para Ativo) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
          <button
            onClick={() => setActiveTab('placas')}
            style={{
              padding: '0.5rem 1.2rem',
              background: activeTab === 'placas' ? '#1a1a2e' : 'transparent',
              color: activeTab === 'placas' ? 'white' : '#555',
              border: 'none',
              borderRadius: '50px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s',
            }}
          >
            Placas de boas-vindas
            <span style={{ fontSize: '0.75rem', fontWeight: 400, opacity: activeTab === 'placas' ? 0.8 : 0.6 }}>
              5x7 polegadas
            </span>
          </button>

          <button
            onClick={() => {
              alert('Os cartões de lugar (3.5x2 polegadas) estarão disponíveis em breve!');
            }}
            style={{
              padding: '0.5rem 1.2rem',
              background: 'transparent',
              color: '#555',
              border: 'none',
              borderRadius: '50px',
              fontWeight: 500,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            Cartões de lugar
            <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#999' }}>
              de 3,5 × 2 polegadas
            </span>
          </button>
        </div>

        {/* Ferramenta Funcional de QR Code / Personalização */}
        <div style={{ background: '#fafafc', border: '1px solid #f0edf0', borderRadius: '16px', padding: '1.5rem', marginBottom: '2.5rem', display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: '220px' }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#555', letterSpacing: '0.05em' }}>VINCULAR AO ÁLBUM</label>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              style={{ padding: '0.65rem 1rem', borderRadius: '50px', border: '1px solid #e8c8d4', fontSize: '0.85rem', color: '#1a1a2e', outline: 'none', background: 'white' }}
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
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#555', letterSpacing: '0.05em' }}>NOMES DO CASAL</label>
                <input
                  type="text"
                  value={manualCoupleName}
                  onChange={(e) => setManualCoupleName(e.target.value)}
                  placeholder="Ex: Ivy e Noah"
                  style={{ padding: '0.65rem 1rem', borderRadius: '50px', border: '1px solid #e8c8d4', fontSize: '0.85rem', color: '#1a1a2e', outline: 'none', background: 'white' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: '150px' }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#555', letterSpacing: '0.05em' }}>DATA DO CASAMENTO</label>
                <input
                  type="date"
                  value={manualEventDate}
                  onChange={(e) => setManualEventDate(e.target.value)}
                  style={{ padding: '0.65rem 1rem', borderRadius: '50px', border: '1px solid #e8c8d4', fontSize: '0.85rem', color: '#1a1a2e', outline: 'none', background: 'white' }}
                />
              </div>
            </>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', paddingLeft: '0.5rem' }}>
            <span style={{ fontSize: '0.7rem', color: '#999', fontWeight: 700 }}>LINK DE LEITURA DO QR CODE:</span>
            <code style={{ fontSize: '0.75rem', color: '#E8318A', fontWeight: 600, wordBreak: 'break-all' }}>
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
                <span style={{ fontSize: '0.85rem' }}>📷</span>
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
                <span style={{ fontSize: '0.85rem', color: '#E8318A' }}>❤️</span>
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


      {/* 3. MODAL DE CRIAÇÃO DE ÁLBUM */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'white', borderRadius: '30px', padding: '1.5rem', width: '100%', maxWidth: '540px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative' }} className="animate-fade-in">
            
            {/* Botão Fechar */}
            <button
              onClick={() => setShowCreateModal(false)}
              style={{ position: 'absolute', top: '24px', right: '24px', background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#999', transition: 'color 0.2s' }}
              onMouseOver={(e) => e.currentTarget.style.color = '#333'}
              onMouseOut={(e) => e.currentTarget.style.color = '#999'}
            >
              ✕
            </button>

            {/* Cabeçalho do Modal com Ícone */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                width: '45px',
                height: '45px',
                borderRadius: '50%',
                backgroundColor: '#FFF0F5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E8318A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 12v10H4V12" />
                  <path d="m2 7 10 5 10-5" />
                  <path d="M22 7a2 2 0 0 0-2-2h-3.5a3 3 0 0 0-5 0H8a2 2 0 0 0-2 2" />
                  <path d="M12 12V5" />
                </svg>
              </div>
              <div>
                <span style={{ fontSize: '0.62rem', color: '#E8318A', fontWeight: 800, letterSpacing: '0.08em', display: 'block', textTransform: 'uppercase' }}>NOVO ÁLBUM</span>
                <h3 style={{ fontSize: '1.45rem', fontFamily: 'var(--font-serif)', fontWeight: 700, color: '#1a1a2e', margin: 0 }}>Abra o envelope.</h3>
              </div>
            </div>

            {createError && (
              <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: '12px', fontSize: '0.85rem' }}>
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateEvent} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* Nome do Casal */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#E8318A', letterSpacing: '0.05em' }}>CASAL</label>
                  <span style={{ fontSize: '0.62rem', color: '#bbb' }}>{newEventName.length}/40</span>
                </div>
                <input
                  type="text"
                  required
                  maxLength={40}
                  placeholder="Gabriel e Amanda"
                  value={newEventName}
                  onChange={(e) => setNewEventName(e.target.value)}
                  style={{ padding: '0.75rem 1.25rem', borderRadius: '50px', border: '2px solid #e8c8d4', fontSize: '0.95rem', color: '#1a1a2e', outline: 'none', transition: 'border-color 0.2s' }}
                  onFocus={(e) => e.target.style.borderColor = '#E8318A'}
                  onBlur={(e) => e.target.style.borderColor = '#e8c8d4'}
                />
              </div>

              {/* Data e Vibração (Lado a lado, empilha no mobile via flexWrap) */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                
                {/* Data */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
                  <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#E8318A', letterSpacing: '0.05em' }}>O GRANDE DIA</label>
                  <input
                    type="date"
                    required
                    value={newEventDate}
                    onChange={(e) => setNewEventDate(e.target.value)}
                    style={{ padding: '0.75rem 1.25rem', borderRadius: '50px', border: '2px solid #e8c8d4', fontSize: '0.95rem', color: '#1a1a2e', outline: 'none', background: 'white' }}
                  />
                </div>

                {/* Vibração */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1, position: 'relative' }}>
                  <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#E8318A', letterSpacing: '0.05em' }}>VIBRAÇÃO</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <div style={{
                      position: 'absolute',
                      left: '16px',
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      backgroundColor: newThemeColor === 'lavanda' ? '#8E44AD' :
                                       newThemeColor === 'rosa' ? '#FFB6C1' :
                                       newThemeColor === 'menta' ? '#2ECC71' :
                                       newThemeColor === 'azul' ? '#3498DB' : '#E67E22',
                      transition: 'background-color 0.2s'
                    }} />
                    <select
                      value={newThemeColor}
                      onChange={(e) => setNewThemeColor(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem 1.25rem 0.75rem 2.5rem',
                        borderRadius: '50px',
                        border: '2px solid #e8c8d4',
                        fontSize: '0.95rem',
                        color: '#1a1a2e',
                        outline: 'none',
                        background: 'white',
                        appearance: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="lavanda">Lavanda</option>
                      <option value="rosa">Rosa Blush</option>
                      <option value="menta">Verde Menta</option>
                      <option value="azul">Azul Serenity</option>
                      <option value="sol">Pôr do Sol</option>
                    </select>
                    <div style={{ position: 'absolute', right: '15px', pointerEvents: 'none', fontSize: '0.8rem', color: '#999' }}>▼</div>
                  </div>
                </div>

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
                  <label htmlFor="gamification_toggle" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1a1a2e', cursor: 'pointer' }}>
                    Ativar Gamificação (Missões e Conquistas) 🎮
                  </label>
                </div>
                
                {gamificationEnabled && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', animation: 'fadeIn 0.2s' }}>
                    <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#E8318A', letterSpacing: '0.05em' }}>META COLETIVA DE FOTOS (QR CODE)</label>
                    <input
                      type="number"
                      min="10"
                      max="1000"
                      value={photoGoal}
                      onChange={(e) => setPhotoGoal(parseInt(e.target.value) || 100)}
                      placeholder="Ex: 100"
                      style={{ padding: '0.65rem 1rem', borderRadius: '50px', border: '1px solid #e8c8d4', fontSize: '0.85rem', color: '#1a1a2e', outline: 'none', background: 'white' }}
                    />
                    <small style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Exibe uma barra de progresso para os convidados atingirem juntos.</small>
                  </div>
                )}
              </div>

              {/* Foto de Capa */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#E8318A', letterSpacing: '0.05em' }}>FOTO DE CAPA</label>
                {coverPhotoUrl ? (
                  <div style={{ position: 'relative', width: '90px', height: '90px', borderRadius: '12px', overflow: 'hidden', border: '2px solid #e8c8d4', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
                    <img src={coverPhotoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Capa" />
                    <button 
                      type="button"
                      onClick={handleRemoveCoverPhoto}
                      style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.6)', border: 'none', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 'bold' }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '90px', height: '90px', border: '2px dashed #e8c8d4', borderRadius: '12px', cursor: 'pointer', background: '#FFF0F5', transition: 'all 0.2s' }}>
                    <span style={{ fontSize: '1.5rem', color: '#E8318A', lineHeight: 1 }}>+</span>
                    <span style={{ fontSize: '0.6rem', color: '#999', fontWeight: 600 }}>Carregar</span>
                    <input type="file" accept="image/*" onChange={handleCoverPhotoChange} style={{ display: 'none' }} />
                  </label>
                )}
              </div>

              {/* Botão de Envio */}
              <button
                type="submit"
                disabled={isCreating}
                style={{
                  padding: '0.9rem',
                  backgroundColor: '#E8318A',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50px',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  cursor: isCreating ? 'not-allowed' : 'pointer',
                  marginTop: '0.5rem',
                  boxShadow: '0 4px 15px rgba(232, 49, 138, 0.25)',
                  transition: 'all 0.2s',
                }}
                onMouseOver={(e) => { if(!isCreating) e.currentTarget.style.backgroundColor = '#d42a7d'; }}
                onMouseOut={(e) => { if(!isCreating) e.currentTarget.style.backgroundColor = '#E8318A'; }}
              >
                {isCreating ? 'Abrindo álbum...' : 'Abra o álbum →'}
              </button>
              
              {/* Subtexto */}
              <div style={{ textTransform: 'uppercase', fontSize: '0.55rem', letterSpacing: '0.12em', fontWeight: 700, color: '#999', textAlign: 'center', marginTop: '0.25rem' }}>
                • AO VIVO EM 60 SEGUNDOS • SEM NECESSIDADE DE CARTÃO •
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
