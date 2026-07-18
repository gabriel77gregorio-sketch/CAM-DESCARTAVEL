import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import JSZip from 'jszip';
import fileSaver from 'file-saver';
const { saveAs } = fileSaver;

// ─── Interfaces ────────────────────────────────────────────────
interface Event {
  id: string;
  event_name: string;
  event_date: string;
  slug: string;
  is_active: boolean;
  theme_color?: string;
  isLocal?: boolean; // Identificar se é local
  reveal_time?: string;
}

interface Photo {
  id: string;
  storage_path: string;
  filter_used: string;
  created_at: string;
  guest_id: string;
  event_id: string;
}

interface GuestProfile {
  id: string;
  event_id: string;
  guest_id: string;
  guest_name: string;
  avatar_emoji: string;
  xp_points: number;
}

type ViewMode = 'guests' | 'timeline' | 'filetype';

// ─── Mapa de temas ────────────────────────────────────────────
const themeMap: Record<string, { accent: string; light: string; gradient: string }> = {
  lavanda: { accent: '#1d1d1f', light: '#f5f5f7', gradient: 'linear-gradient(135deg, #ffffff 0%, #f5f5f7 100%)' }, // Classic Black
  rosa:    { accent: '#c5a880', light: '#faf9f6', gradient: 'linear-gradient(135deg, #ffffff 0%, #faf9f6 100%)' }, // Champagne Gold
  menta:   { accent: '#8fa89b', light: '#f2f6f4', gradient: 'linear-gradient(135deg, #ffffff 0%, #f2f6f4 100%)' }, // Sage Green
  azul:    { accent: '#86868b', light: '#fbfbfd', gradient: 'linear-gradient(135deg, #ffffff 0%, #fbfbfd 100%)' }, // Silk White
  sol:     { accent: '#b8a18f', light: '#faf7f5', gradient: 'linear-gradient(135deg, #ffffff 0%, #faf7f5 100%)' }, // Earth Oak
};

// ─── Componente Principal ──────────────────────────────────────
export default function AlbumManager() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [guests, setGuests] = useState<GuestProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('guests');
  const [lightboxPhoto, setLightboxPhoto] = useState<Photo | null>(null);
  const [expandedGuests, setExpandedGuests] = useState<Set<string>>(new Set());

  // Estados de Depuração e Tratamento de Erros
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [forceReveal, setForceReveal] = useState(false);

  const addLog = (msg: string) => {
    console.log(`[AlbumDebug] ${msg}`);
    setDebugLogs((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  // ─── Carregar eventos do usuário (Supabase + Local) ──────────
  useEffect(() => {
    async function loadEvents() {
      addLog('Iniciando carregamento de eventos...');
      setErrorMsg('');
      try {
        // 1. Carregar eventos locais do localStorage primeiro
        addLog('Verificando eventos locais no localStorage...');
        const localEventsRaw = localStorage.getItem('local_events');
        const localEvents: Event[] = localEventsRaw ? JSON.parse(localEventsRaw) : [];
        const markedLocalEvents = localEvents.map(e => ({ ...e, isLocal: true }));
        addLog(`Eventos locais encontrados: ${markedLocalEvents.length}`);

        // 2. Tentar autenticação e carregamento do Supabase
        addLog('Verificando sessão do Supabase...');
        let session = null;
        try {
          const sessionRes = await supabase.auth.getSession();
          session = sessionRes.data?.session;
          addLog(`Sessão inicial resolvida: ${session ? 'Encontrada' : 'Nula'}`);
        } catch (authErr: any) {
          addLog(`Aviso ao obter sessão: ${authErr.message || authErr}`);
        }

        if (!session) {
          addLog('Tentando login silencioso de teste...');
          try {
            const { data, error } = await supabase.auth.signInWithPassword({
              email: 'teste@camdescartavel.com',
              password: '123456'
            });
            if (error) {
              addLog(`Erro no login silencioso: ${error.message}`);
            } else if (data?.session) {
              addLog('Login silencioso bem sucedido!');
              session = data.session;
            }
          } catch (loginErr: any) {
            addLog(`Erro na requisição de login: ${loginErr.message || loginErr}`);
          }
        }

        let dbEvents: Event[] = [];
        if (session?.user?.id) {
          addLog(`Buscando eventos no Supabase para o usuário: ${session.user.id}`);
          try {
            const { data: eventsData, error: eventsError } = await supabase
              .from('events')
              .select('*')
              .eq('user_id', session.user.id)
              .order('event_date', { ascending: false });

            if (eventsError) {
              addLog(`Erro do Supabase ao buscar eventos: ${eventsError.message}`);
            } else {
              dbEvents = eventsData || [];
              addLog(`Eventos obtidos do Supabase: ${dbEvents.length}`);
            }
          } catch (dbErr: any) {
            addLog(`Exceção ao buscar eventos do banco: ${dbErr.message || dbErr}`);
          }
        } else {
          addLog('Sem sessão do Supabase ativa. Ignorando busca remota.');
        }

        // Combinar eventos locais e do Supabase
        const allEvents = [...markedLocalEvents, ...dbEvents];
        addLog(`Total de eventos combinados: ${allEvents.length}`);
        setEvents(allEvents);

        if (allEvents.length > 0) {
          // Seleciona o primeiro evento
          setSelectedEventId(allEvents[0].id);
          addLog(`Evento inicial selecionado automaticamente: ${allEvents[0].id}`);
        }
      } catch (err: any) {
        addLog(`Erro geral no carregamento de eventos: ${err.message || err}`);
        setErrorMsg('Ocorreu um erro ao carregar os eventos. Tente recarregar a página.');
      } finally {
        setLoading(false);
        addLog('Finalizado carregamento inicial de eventos.');
      }
    }
    loadEvents();
  }, []);

  // ─── Carregar fotos e convidados quando evento muda ───────
  useEffect(() => {
    if (!selectedEventId) {
      addLog('Nenhum evento selecionado.');
      return;
    }

    async function loadAlbumData() {
      setLoading(true);
      setErrorMsg('');
      const isSelectedEventLocal = selectedEventId.startsWith('local-') || events.find(e => e.id === selectedEventId)?.isLocal;
      addLog(`Carregando dados para o evento selecionado: ${selectedEventId} (Local: ${isSelectedEventLocal ? 'Sim' : 'Não'})`);

      try {
        if (isSelectedEventLocal) {
          // --- FLUXO LOCAL ---
          addLog('Buscando fotos locais no localStorage...');
          const localPhotosRaw = localStorage.getItem(`local_photos_${selectedEventId}`);
          const localPhotos: Photo[] = localPhotosRaw ? JSON.parse(localPhotosRaw) : [];
          addLog(`Fotos locais encontradas: ${localPhotos.length}`);
          setPhotos(localPhotos);

          // Criar convidados locais a partir do guest_profiles local se houver ou inferir das fotos
          addLog('Buscando perfis de convidados locais...');
          const uniqueGuestIds = Array.from(new Set(localPhotos.map(p => p.guest_id)));
          const mockGuests: GuestProfile[] = uniqueGuestIds.map((gid, idx) => ({
            id: `guest-${idx}`,
            event_id: selectedEventId,
            guest_id: gid,
            guest_name: `Convidado Local ${idx + 1}`,
            avatar_emoji: ['📸', '💍', '🥂', '🕺', '💃', '✨'][idx % 6],
            xp_points: localPhotos.filter(p => p.guest_id === gid).length * 10
          }));
          setGuests(mockGuests);
          addLog(`Perfis de convidados definidos: ${mockGuests.length}`);
        } else {
          // --- FLUXO SUPABASE ---
          addLog('Buscando dados no Supabase...');
          const [photosRes, guestsRes] = await Promise.all([
            supabase
              .from('photos')
              .select('*')
              .eq('event_id', selectedEventId)
              .order('created_at', { ascending: false }),
            supabase
              .from('guest_profiles')
              .select('*')
              .eq('event_id', selectedEventId)
              .order('xp_points', { ascending: false }),
          ]);

          if (photosRes.error) {
            addLog(`Erro ao buscar fotos no Supabase: ${photosRes.error.message}`);
          }
          if (guestsRes.error) {
            addLog(`Erro ao buscar convidados no Supabase: ${guestsRes.error.message}`);
          }

          const dbPhotos = photosRes.data || [];
          const dbGuests = guestsRes.data || [];

          setPhotos(dbPhotos);
          setGuests(dbGuests);
          addLog(`Dados remotos carregados. Fotos: ${dbPhotos.length}, Convidados: ${dbGuests.length}`);
        }
      } catch (err: any) {
        addLog(`Erro geral ao carregar dados do álbum: ${err.message || err}`);
        setErrorMsg('Erro ao buscar as fotos do álbum selecionado.');
      } finally {
        setLoading(false);
        addLog('Carregamento de dados do álbum finalizado.');
      }
    }
    loadAlbumData();
  }, [selectedEventId, events]);

  // ─── Realtime subscription (Apenas para Supabase) ──────────
  useEffect(() => {
    if (!selectedEventId) return;
    const isSelectedEventLocal = selectedEventId.startsWith('local-') || events.find(e => e.id === selectedEventId)?.isLocal;
    if (isSelectedEventLocal) return;

    addLog(`Iniciando realtime para o evento: ${selectedEventId}`);
    const channel = supabase
      .channel(`album-photos-${selectedEventId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'photos', filter: `event_id=eq.${selectedEventId}` },
        (payload) => {
          addLog('Nova foto detectada via Realtime!');
          setPhotos((prev) => [payload.new as Photo, ...prev]);
        }
      )
      .subscribe();

    return () => {
      addLog(`Encerrando realtime para o evento: ${selectedEventId}`);
      supabase.removeChannel(channel);
    };
  }, [selectedEventId, events]);

  // ─── Helpers protegidos ───────────────────────────────────
  const selectedEvent = events.find(e => e.id === selectedEventId);
  const theme = themeMap[selectedEvent?.theme_color || 'rosa'] || themeMap.rosa;

  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  const downloadAllAsZip = async () => {
    if (photos.length === 0) return;
    setIsDownloadingZip(true);
    try {
      const zip = new JSZip();
      const imgFolder = zip.folder("fotos");
      
      if (!imgFolder) throw new Error("Não foi possível criar a pasta no ZIP");

      // Baixa cada foto e adiciona ao ZIP
      await Promise.all(photos.map(async (photo, index) => {
        try {
          const url = getPhotoUrl(photo.storage_path);
          let blob: Blob;
          
          if (url.startsWith('data:image')) {
            // Converte base64 para blob
            const res = await fetch(url);
            blob = await res.blob();
          } else {
            // Busca da URL pública
            const res = await fetch(url);
            blob = await res.blob();
          }
          
          const fileName = `foto_${index + 1}_${photo.id.substring(0,6)}.jpg`;
          imgFolder.file(fileName, blob);
        } catch (err) {
          addLog(`Erro ao adicionar foto ${photo.id} ao ZIP: ${err}`);
        }
      }));

      // Gera o arquivo final
      const content = await zip.generateAsync({ type: "blob" });
      const currentEvent = events.find(e => e.id === selectedEventId);
      const zipName = currentEvent ? `${currentEvent.slug}-fotos.zip` : 'cam-descartavel-fotos.zip';
      saveAs(content, zipName);
    } catch (err) {
      console.error("Erro ao gerar ZIP", err);
      alert("Ocorreu um erro ao gerar o arquivo ZIP.");
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const getPhotoUrl = (storagePath: string) => {
    if (!storagePath) return '';
    if (storagePath.startsWith('data:image') || storagePath.startsWith('blob:')) return storagePath;
    const { data } = supabase.storage.from('event-photos').getPublicUrl(storagePath);
    return data.publicUrl;
  };

  const getGuestName = (guestId: string) => {
    const guest = guests.find(g => g.guest_id === guestId);
    return guest?.guest_name || `Convidado ${guestId.slice(0, 6)}`;
  };

  const getGuestEmoji = (guestId: string) => {
    const guest = guests.find(g => g.guest_id === guestId);
    return guest?.avatar_emoji || '📸';
  };

  const toggleGuestExpand = (guestId: string) => {
    setExpandedGuests(prev => {
      const next = new Set(prev);
      if (next.has(guestId)) next.delete(guestId);
      else next.add(guestId);
      return next;
    });
  };

  const formatTime = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
    } catch {
      return '';
    }
  };

  const formatFullDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length < 3) return dateStr;
      const [year, month, day] = parts;
      return `${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  };

  // ─── Dados agrupados ─────────────────────────────────────

  // Por convidados
  const photosByGuest = React.useMemo(() => {
    const map = new Map<string, Photo[]>();
    photos.forEach(p => {
      if (p && p.guest_id) {
        const arr = map.get(p.guest_id) || [];
        arr.push(p);
        map.set(p.guest_id, arr);
      }
    });
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [photos]);

  // Linha do tempo (agrupado por hora)
  const photosByHour = React.useMemo(() => {
    const sorted = [...photos].sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeA - timeB;
    });
    const map = new Map<string, Photo[]>();
    sorted.forEach(p => {
      if (p && p.created_at) {
        const d = new Date(p.created_at);
        if (!isNaN(d.getTime())) {
          const dateLabel = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
          const hourLabel = `${d.getHours().toString().padStart(2, '0')}:00`;
          const hourKey = `${dateLabel} — ${hourLabel}`;
          const arr = map.get(hourKey) || [];
          arr.push(p);
          map.set(hourKey, arr);
        }
      }
    });
    return Array.from(map.entries());
  }, [photos]);

  // Por tipo de filtro
  const photosByFilter = React.useMemo(() => {
    const map = new Map<string, Photo[]>();
    photos.forEach(p => {
      if (p) {
        const key = p.filter_used || 'none';
        const arr = map.get(key) || [];
        arr.push(p);
        map.set(key, arr);
      }
    });
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [photos]);

  // Nomes dos filtros (sem emojis, paleta minimalista)
  const filterLabels: Record<string, { label: string; emoji: string; color: string }> = {
    none: { label: 'Original', emoji: '', color: 'var(--accent)' },
    vintage: { label: 'Vintage', emoji: '', color: 'var(--accent-wedding)' },
    bw: { label: 'Preto & Branco', emoji: '', color: '#1d1d1f' },
    sepia: { label: 'Sépia', emoji: '', color: '#8e7968' },
    warm: { label: 'Quente', emoji: '', color: '#c5a880' },
    cool: { label: 'Frio', emoji: '', color: '#8fa89b' },
    vivid: { label: 'Vívido', emoji: '', color: '#1d1d1f' },
    soft: { label: 'Suave', emoji: '', color: 'var(--accent-wedding)' },
    film: { label: 'Filme', emoji: '', color: '#1d1d1f' },
    dreamy: { label: 'Sonho', emoji: '', color: 'var(--accent-wedding)' },
  };

  const getFilterInfo = (key: string) =>
    filterLabels[key] || { label: key.charAt(0).toUpperCase() + key.slice(1), emoji: '📸', color: theme.accent };

  const uniqueGuests = new Set(photos.filter(p => p && p.guest_id).map(p => p.guest_id)).size;
  const uniqueFilters = new Set(photos.filter(p => p).map(p => p.filter_used || 'none')).size;

  // ─── RENDER ───────────────────────────────────────────────

  // Spinner de tela inteira
  if (loading && events.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem', gap: '1.5rem' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid var(--bg-tertiary)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Carregando seu álbum...</p>
        
        {/* Botão de Debug */}
        <button 
          onClick={() => setShowDebugPanel(!showDebugPanel)}
          style={{ background: 'none', border: 'none', color: '#ccc', textDecoration: 'underline', fontSize: '0.75rem', cursor: 'pointer', marginTop: '2rem' }}
        >
          {showDebugPanel ? 'Ocultar Console de Debug' : 'Mostrar Console de Debug'}
        </button>

        {showDebugPanel && (
          <div style={{ width: '100%', maxWidth: '500px', background: '#222', color: '#00ff00', padding: '1rem', borderRadius: '8px', fontSize: '0.75rem', fontFamily: 'monospace', textAlign: 'left', maxHeight: '200px', overflowY: 'auto' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#fff' }}>Logs de Inicialização:</div>
            {debugLogs.map((log, i) => <div key={i}>{log}</div>)}
          </div>
        )}
      </div>
    );
  }

  // Erro Crítico
  if (errorMsg && events.length === 0) {
    return (
      <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #fca5a5', padding: '5rem 2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1.25rem' }}>⚠️</div>
        <h3 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-serif)', color: '#b91c1c', marginBottom: '0.5rem' }}>Erro ao Carregar</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '1.5rem' }}>{errorMsg}</p>
        <button 
          onClick={() => window.location.reload()}
          style={{ padding: '0.75rem 1.5rem', borderRadius: '50px', background: '#E8318A', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}
        >
          Recarregar Página
        </button>
      </div>
    );
  }

  // Sem eventos cadastrados
  if (events.length === 0) {
    return (
      <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #f0edf0', padding: '5rem 2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3.5rem', marginBottom: '1.25rem' }}>📸</div>
        <h3 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e', marginBottom: '0.5rem' }}>Nenhum evento encontrado</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          Crie seu primeiro evento no painel principal para começar a receber fotos.
        </p>
        <a
          href="/painel"
          style={{
            display: 'inline-block', marginTop: '1.5rem', padding: '0.8rem 2rem',
            borderRadius: '50px', background: '#E8318A', color: 'white',
            fontWeight: 600, fontSize: '0.95rem', textDecoration: 'none',
            boxShadow: '0 4px 15px rgba(232, 49, 138, 0.3)', transition: 'all 0.2s'
          }}
        >
          Ir para o Painel
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }} className="animate-fade-in">

      {/* ─── Header do Álbum ──────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '2.2rem', fontFamily: 'var(--font-serif)', color: 'var(--text-primary)', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            Álbum de Fotos
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginTop: '0.3rem' }}>
            Todas as memórias capturadas pelos seus convidados.
          </p>
        </div>

        {/* Seletor de Evento e Botões */}
        {events.length > 0 && (
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {photos.length > 0 && (
              <button
                onClick={downloadAllAsZip}
                disabled={isDownloadingZip}
                style={{
                  padding: '0.7rem 1.25rem',
                  borderRadius: '8px',
                  background: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: isDownloadingZip ? 'not-allowed' : 'pointer',
                  opacity: isDownloadingZip ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.15s ease'
                }}
              >
                {isDownloadingZip ? 'Compactando...' : 'Baixar Álbum (ZIP)'}
              </button>
            )}

            <div style={{ position: 'relative' }}>
              <select
                value={selectedEventId}
                onChange={(e) => {
                  setSelectedEventId(e.target.value);
                  addLog(`Usuário alterou evento selecionado para: ${e.target.value}`);
                }}
                style={{
                  appearance: 'none',
                  padding: '0.7rem 2.25rem 0.7rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid #d1d1d6',
                  background: 'white',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'border-color 0.15s ease',
                  minWidth: '220px',
                  minHeight: '38px'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--text-primary)'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#d1d1d6'}
              >
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>
                    {ev.isLocal ? '[Local] ' : ''}{ev.event_name} — {formatFullDate(ev.event_date)}
                  </option>
                ))}
              </select>
              <span style={{
                position: 'absolute', right: '0.85rem', top: '50%', transform: 'translateY(-50%)',
                pointerEvents: 'none', color: 'var(--text-tertiary)', fontSize: '0.65rem'
              }}>▼</span>
            </div>
          </div>
        )}
      </div>

      {/* Erro não crítico do álbum selecionado */}
      {errorMsg && (
        <div style={{ padding: '1rem', backgroundColor: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: '12px', fontSize: '0.85rem' }}>
          {errorMsg}
        </div>
      )}

      {/* ─── Barra de Estatísticas ────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem' }}>
        <StatCard label="TOTAL DE FOTOS" value={photos.length.toString()} accent={theme.accent} />
        <StatCard label="CONVIDADOS" value={uniqueGuests.toString()} accent={theme.accent} />
        <StatCard label="FILTROS USADOS" value={uniqueFilters.toString()} accent={theme.accent} />
        <StatCard
          label="ORIGEM"
          value={selectedEvent?.isLocal ? '📍 Local (Offline)' : '☁️ Nuvem (Supabase)'}
          accent={selectedEvent?.isLocal ? '#E67E22' : '#2980B9'}
          isSmall
        />
      </div>

      {/* ─── Abas de Visualização ─────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.25rem', background: '#f8f6f9', borderRadius: '14px', padding: '4px', overflowX: 'auto', whiteSpace: 'nowrap', WebkitOverflowScrolling: 'touch' }}>
        <TabButton
          active={viewMode === 'guests'}
          onClick={() => setViewMode('guests')}
          accent={theme.accent}
          icon="👤"
          label="Por Convidados"
        />
        <TabButton
          active={viewMode === 'timeline'}
          onClick={() => setViewMode('timeline')}
          accent={theme.accent}
          icon="🕐"
          label="Linha do Tempo"
        />
        <TabButton
          active={viewMode === 'filetype'}
          onClick={() => setViewMode('filetype')}
          accent={theme.accent}
          icon="🎨"
          label="Por Filtro"
        />
      </div>

      {/* ─── Conteúdo Loading menor ───────────────────────── */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <div style={{ width: '36px', height: '36px', border: '4px solid var(--bg-tertiary)', borderTopColor: theme.accent, borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        </div>
      )}

      {/* ─── Checagem de Revelação ───────────────────────── */}
      {(() => {
        const now = new Date();
        const revealTime = selectedEvent?.reveal_time ? new Date(selectedEvent.reveal_time) : null;
        const isLocked = revealTime && revealTime > now && !forceReveal;

        if (!loading && photos.length > 0 && isLocked) {
          return (
            <div style={{
              background: 'white', borderRadius: '24px', border: '1px solid #f0edf0',
              padding: '4rem 2rem', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
              marginTop: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center'
            }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem', opacity: 0.9 }}>⏳</div>
              <h4 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e', marginBottom: '0.5rem' }}>
                As fotos estão sendo reveladas...
              </h4>
              <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto 2rem auto', lineHeight: 1.6 }}>
                A janela da câmera encerrou! As fotos estão passando pelo processo de revelação digital e estarão disponíveis em breve.
              </p>
              
              <div style={{ background: '#f8f6f9', padding: '1rem 2rem', borderRadius: '12px', marginBottom: '2rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#888', fontWeight: 700, letterSpacing: '0.05em' }}>DATA DA REVELAÇÃO</span>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: theme.accent, marginTop: '0.2rem' }}>
                  {revealTime.toLocaleString()}
                </div>
              </div>

              <button
                onClick={() => setForceReveal(true)}
                style={{
                  background: 'none', border: 'none', color: theme.accent, fontSize: '0.85rem',
                  fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', opacity: 0.8
                }}
              >
                Forçar Revelação Antecipada (Apenas Organizador)
              </button>
            </div>
          );
        }

        return (
          <>
            {/* ─── Estado vazio do álbum ───────────────────────── */}
            {!loading && photos.length === 0 && (
              <div style={{
                background: 'white', borderRadius: '24px', border: '1px dashed #e8c8d4',
                padding: '5rem 2rem', textAlign: 'center'
              }}>
                <div style={{ fontSize: '3.5rem', marginBottom: '1rem', animation: 'pulse 2s infinite' }}>📷</div>
                <h4 style={{ fontSize: '1.3rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e' }}>Nenhuma foto no álbum ainda</h4>
                <p style={{ color: 'var(--text-secondary)', marginTop: '0.4rem', fontSize: '0.92rem' }}>
                  {selectedEvent?.isLocal 
                    ? 'Abra a câmera do evento local e capture fotos para que elas apareçam aqui.'
                    : 'Compartilhe o QR Code do evento com os convidados para começar a receber fotos!'}
                </p>
              </div>
            )}

      {/* ═══════════ MODO: POR CONVIDADOS ═══════════════════ */}
      {!loading && photos.length > 0 && viewMode === 'guests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {photosByGuest.map(([guestId, guestPhotos]) => {
            const isExpanded = expandedGuests.has(guestId);
            const displayPhotos = isExpanded ? guestPhotos : guestPhotos.slice(0, 4);
            return (
              <div
                key={guestId}
                style={{
                  background: 'white', borderRadius: '20px', border: '1px solid #f0edf0',
                  overflow: 'hidden', transition: 'all 0.3s',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.015)',
                }}
              >
                {/* Header do convidado */}
                <div
                  onClick={() => toggleGuestExpand(guestId)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '1.25rem 1.5rem', cursor: 'pointer',
                    borderBottom: '1px solid #f8f6f9', transition: 'background 0.2s'
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#fafafc')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    <div style={{
                      width: '42px', height: '42px', borderRadius: '50%',
                      background: theme.light, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: '1.3rem',
                      border: `2px solid ${theme.accent}22`
                    }}>
                      {getGuestEmoji(guestId)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: '#1a1a2e', fontSize: '1rem' }}>
                        {getGuestName(guestId)}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#999', fontWeight: 500 }}>
                        {guestPhotos.length} {guestPhotos.length === 1 ? 'foto' : 'fotos'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                    {/* Mini previews */}
                    <div style={{ display: 'flex', marginRight: '0.5rem' }}>
                      {guestPhotos.slice(0, 3).map((p, i) => (
                        <div key={p.id} style={{
                          width: '28px', height: '28px', borderRadius: '6px', overflow: 'hidden',
                          border: '2px solid white', marginLeft: i > 0 ? '-8px' : '0',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.08)', position: 'relative', zIndex: 3 - i
                        }}>
                          <img src={getPhotoUrl(p.storage_path)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                        </div>
                      ))}
                    </div>
                    <span style={{
                      fontSize: '1rem', color: '#999', transition: 'transform 0.3s',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                    }}>▾</span>
                  </div>
                </div>

                {/* Grid de fotos do convidado */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                  gap: '1.25rem',
                  padding: '1.25rem 1.5rem',
                }}>
                  {displayPhotos.map((photo, idx) => (
                    <PolaroidCard
                      key={photo.id}
                      photo={photo}
                      index={idx}
                      accent={theme.accent}
                      getPhotoUrl={getPhotoUrl}
                      onClick={() => setLightboxPhoto(photo)}
                    />
                  ))}
                </div>

                {/* Botão expandir/recolher */}
                {guestPhotos.length > 4 && (
                  <div style={{ textAlign: 'center', padding: '0 1.5rem 1.25rem' }}>
                    <button
                      onClick={() => toggleGuestExpand(guestId)}
                      style={{
                        border: 'none', background: theme.light, color: theme.accent,
                        padding: '0.5rem 1.5rem', borderRadius: '50px', fontWeight: 600,
                        fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.2s',
                      }}
                      onMouseOver={(e) => { e.currentTarget.style.background = theme.accent; e.currentTarget.style.color = 'white'; }}
                      onMouseOut={(e) => { e.currentTarget.style.background = theme.light; e.currentTarget.style.color = theme.accent; }}
                    >
                      {isExpanded ? 'Recolher' : `Ver todas as ${guestPhotos.length} fotos`}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════ MODO: LINHA DO TEMPO ═══════════════════ */}
      {!loading && photos.length > 0 && viewMode === 'timeline' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', position: 'relative' }}>
          {/* Linha vertical decorativa */}
          <div style={{
            position: 'absolute', left: '18px', top: '0', bottom: '0',
            width: '2px', background: `linear-gradient(to bottom, ${theme.accent}33, ${theme.accent}08)`,
            borderRadius: '2px', zIndex: 0
          }} />

          {photosByHour.map(([hourLabel, hourPhotos]) => (
            <div key={hourLabel} style={{ position: 'relative', paddingLeft: '3rem' }}>
              {/* Dot na timeline */}
              <div style={{
                position: 'absolute', left: '10px', top: '4px',
                width: '18px', height: '18px', borderRadius: '50%',
                background: 'white', border: `3px solid ${theme.accent}`,
                boxShadow: `0 0 0 4px ${theme.accent}15`, zIndex: 1
              }} />

              {/* Label da hora */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                marginBottom: '1rem', padding: '0.35rem 1rem',
                background: theme.light, borderRadius: '50px',
                fontWeight: 700, fontSize: '0.82rem', color: theme.accent,
                letterSpacing: '0.02em'
              }}>
                🕐 {hourLabel}
                <span style={{
                  background: theme.accent, color: 'white', padding: '0.1rem 0.5rem',
                  borderRadius: '50px', fontSize: '0.7rem', fontWeight: 700
                }}>
                  {hourPhotos.length}
                </span>
              </div>

              {/* Grid de fotos */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: '1.25rem',
              }}>
                {hourPhotos.map((photo, idx) => (
                  <PolaroidCard
                    key={photo.id}
                    photo={photo}
                    index={idx}
                    accent={theme.accent}
                    getPhotoUrl={getPhotoUrl}
                    onClick={() => setLightboxPhoto(photo)}
                    showTime
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════ MODO: POR FILTRO ═══════════════════════ */}
      {!loading && photos.length > 0 && viewMode === 'filetype' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {photosByFilter.map(([filterKey, filterPhotos]) => {
            const info = getFilterInfo(filterKey);
            return (
              <div key={filterKey} style={{
                background: 'white', borderRadius: '20px', border: '1px solid #f0edf0',
                overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.015)'
              }}>
                {/* Header do filtro */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '1.25rem 1.5rem', borderBottom: '1px solid #f8f6f9'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '12px',
                      background: `${info.color}12`, display: 'flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem'
                    }}>
                      {info.emoji}
                    </div>
                    <div>
                      <span style={{ fontWeight: 700, color: '#1a1a2e', fontSize: '1.05rem' }}>
                        {info.label}
                      </span>
                    </div>
                  </div>
                  <span style={{
                    background: `${info.color}12`, color: info.color,
                    padding: '0.3rem 0.85rem', borderRadius: '50px',
                    fontWeight: 700, fontSize: '0.8rem'
                  }}>
                    {filterPhotos.length} {filterPhotos.length === 1 ? 'foto' : 'fotos'}
                  </span>
                </div>

                {/* Grid de fotos do filtro */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                  gap: '1.25rem',
                  padding: '1.25rem 1.5rem',
                }}>
                  {filterPhotos.map((photo, idx) => (
                    <PolaroidCard
                      key={photo.id}
                      photo={photo}
                      index={idx}
                      accent={info.color}
                      getPhotoUrl={getPhotoUrl}
                      onClick={() => setLightboxPhoto(photo)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Botão manual de Debug inferior ───────────────── */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
        <button 
          onClick={() => setShowDebugPanel(!showDebugPanel)}
          style={{ background: '#f0edf0', border: 'none', color: '#666', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.75rem', cursor: 'pointer' }}
        >
          {showDebugPanel ? 'Ocultar Informações de Debug' : 'Mostrar Informações de Debug'}
        </button>
      </div>

      {showDebugPanel && (
        <div style={{ width: '100%', background: '#222', color: '#00ff00', padding: '1.5rem', borderRadius: '12px', fontSize: '0.78rem', fontFamily: 'monospace', textAlign: 'left', maxHeight: '300px', overflowY: 'auto', boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.5)' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#fff', display: 'flex', justifyContent: 'space-between' }}>
            <span>Histórico de Operações (Debug):</span>
            <button onClick={() => setDebugLogs([])} style={{ background: 'none', border: 'none', color: '#ff6b8b', textDecoration: 'underline', fontSize: '0.7rem', cursor: 'pointer' }}>Limpar Logs</button>
          </div>
          {debugLogs.length === 0 ? (
            <div style={{ color: '#888' }}>Nenhum log registrado.</div>
          ) : (
            debugLogs.map((log, i) => <div key={i} style={{ marginBottom: '0.2rem' }}>{log}</div>)
          )}
        </div>
      )}

      {/* ═══════════ CARD DE PROMOÇÃO ═══════════════════════ */}
      {!loading && photos.length > 0 && (
        <div style={{
          background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.accent}dd 50%, #ff6b8b 100%)`,
          borderRadius: '24px', padding: '2.5rem', position: 'relative',
          overflow: 'hidden', color: 'white', marginTop: '0.5rem',
          boxShadow: `0 12px 32px ${theme.accent}33`
        }}>
          {/* Decoração de fundo */}
          <div style={{
            position: 'absolute', right: '-30px', top: '-30px',
            width: '180px', height: '180px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)'
          }} />
          <div style={{
            position: 'absolute', right: '60px', bottom: '-20px',
            width: '120px', height: '120px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.05)'
          }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem', flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
            <div style={{ flex: '1 1 340px' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                background: 'rgba(255,255,255,0.2)', borderRadius: '50px',
                padding: '0.3rem 0.85rem', fontSize: '0.72rem', fontWeight: 700,
                textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '1rem'
              }}>
                🖨️ REVELAÇÃO PREMIUM
              </div>
              <h3 style={{
                fontSize: '1.8rem', fontFamily: 'var(--font-serif)', fontWeight: 700,
                lineHeight: 1.2, marginBottom: '0.75rem', letterSpacing: '-0.01em'
              }}>
                Transforme cliques digitais em memórias na sua mão
              </h3>
              <p style={{
                fontSize: '0.95rem', lineHeight: 1.6, opacity: 0.92,
                marginBottom: '1.5rem', maxWidth: '440px'
              }}>
                Receba as melhores fotos dos seus convidados impressas em papel fotográfico premium,
                com borda branca estilo polaroid. Enviamos direto para a sua casa.
              </p>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <a
                  href={selectedEvent?.isLocal ? '#' : (selectedEvent ? `/painel/evento?slug=${selectedEvent.slug}` : '#')}
                  onClick={(e) => {
                    if (selectedEvent?.isLocal) {
                      e.preventDefault();
                      alert('A revelação física de fotos está disponível apenas para eventos em produção (Supabase).');
                    }
                  }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.85rem 2rem', borderRadius: '50px',
                    background: 'white', color: theme.accent,
                    fontWeight: 700, fontSize: '0.95rem', textDecoration: 'none',
                    transition: 'all 0.2s', boxShadow: '0 4px 15px rgba(0,0,0,0.12)'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.12)'; }}
                >
                  Revelar minhas fotos →
                </a>
                <span style={{ fontSize: '0.82rem', opacity: 0.8 }}>
                  A partir de <strong>R$ 29,90</strong>
                </span>
              </div>
            </div>

            {/* Stack de polaroids decorativas */}
            <div style={{ flex: '0 0 auto', display: 'flex', position: 'relative', width: '160px', height: '180px' }}>
              {photos.slice(0, 3).map((p, i) => (
                <div key={p.id} style={{
                  position: 'absolute',
                  width: '130px', height: '155px',
                  background: 'white', padding: '8px 8px 28px 8px',
                  borderRadius: '4px', boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
                  transform: `rotate(${(i - 1) * 8}deg) translateX(${(i - 1) * 12}px)`,
                  zIndex: 3 - i,
                  border: '1px solid rgba(255,255,255,0.5)'
                }}>
                  <div style={{ width: '100%', height: '100%', borderRadius: '2px', overflow: 'hidden', background: '#f5f5f5' }}>
                    <img src={getPhotoUrl(p.storage_path)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Fechamento do bloco condicional da revelação */}
      </>
      );
      })()}

      {/* ═══════════ LIGHTBOX MODAL ═════════════════════════ */}
      {lightboxPhoto && (
        <div
          onClick={() => setLightboxPhoto(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '2rem', cursor: 'zoom-out',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative', maxWidth: '90vw', maxHeight: '85vh',
              background: 'white', padding: '16px 16px 56px 16px',
              borderRadius: '6px', boxShadow: '0 30px 60px rgba(0,0,0,0.4)',
              cursor: 'default'
            }}
          >
            <img
              src={getPhotoUrl(lightboxPhoto.storage_path)}
              alt="Foto ampliada"
              style={{ maxWidth: '100%', maxHeight: 'calc(85vh - 72px)', objectFit: 'contain', borderRadius: '3px', display: 'block' }}
            />
            {/* Legenda */}
            <div style={{
              position: 'absolute', bottom: '14px', left: '16px', right: '16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.78rem', color: '#999', fontFamily: 'monospace' }}>
                  ⚡ {(lightboxPhoto.filter_used || 'none').toUpperCase()}
                </span>
                <span style={{ fontSize: '0.78rem', color: '#bbb' }}>•</span>
                <span style={{ fontSize: '0.78rem', color: '#999' }}>
                  {getGuestEmoji(lightboxPhoto.guest_id)} {getGuestName(lightboxPhoto.guest_id)}
                </span>
                <span style={{ fontSize: '0.78rem', color: '#bbb' }}>•</span>
                <span style={{ fontSize: '0.78rem', color: '#999' }}>
                  {formatTime(lightboxPhoto.created_at)}
                </span>
              </div>
              <a
                href={getPhotoUrl(lightboxPhoto.storage_path)}
                download={`foto-${lightboxPhoto.id}.jpg`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.4rem 1rem', borderRadius: '50px',
                  background: theme.accent, color: 'white',
                  fontWeight: 600, fontSize: '0.78rem', textDecoration: 'none',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                ↓ Download
              </a>
            </div>

            {/* Botão fechar */}
            <button
              onClick={() => setLightboxPhoto(null)}
              style={{
                position: 'absolute', top: '-14px', right: '-14px',
                width: '32px', height: '32px', borderRadius: '50%',
                background: 'white', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1rem', color: '#555', fontWeight: 700,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = '#f0f0f0'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'white'; }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-componentes ───────────────────────────────────────────

function StatCard({ label, value, accent, isSmall }: {
  label: string; value: string; accent: string; isSmall?: boolean;
}) {
  return (
    <div style={{
      background: 'white', border: '1px solid var(--glass-border)', borderRadius: '8px',
      padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.2rem',
      boxShadow: 'var(--shadow-sm)'
    }}>
      <span style={{
        fontSize: '0.62rem', color: 'var(--text-tertiary)', fontWeight: 700,
        textTransform: 'uppercase' as const, letterSpacing: '0.08em'
      }}>
        {label}
      </span>
      <span style={{
        fontSize: isSmall ? '1rem' : '1.75rem', fontWeight: 700,
        color: 'var(--text-primary)',
        borderLeft: isSmall ? `3px solid var(--accent-wedding)` : 'none',
        paddingLeft: isSmall ? '8px' : '0',
        fontFamily: 'var(--font-sans)', lineHeight: 1.1
      }}>
        {value}
      </span>
    </div>
  );
}

function TabButton({ active, onClick, accent, icon, label }: {
  active: boolean; onClick: () => void; accent: string; icon: string; label: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: '0.5rem', padding: '0.7rem 1rem', border: 'none', borderRadius: '8px',
        background: active ? 'white' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
        fontWeight: active ? 700 : 500,
        fontSize: '0.88rem', cursor: 'pointer',
        boxShadow: active ? 'var(--shadow-sm)' : 'none',
        transition: 'all 0.15s ease'
      }}
      onMouseOver={(e) => { if (!active) e.currentTarget.style.color = 'var(--text-primary)'; }}
      onMouseOut={(e) => { if (!active) e.currentTarget.style.color = 'var(--text-tertiary)'; }}
    >
      <span>{label}</span>
    </button>
  );
}

function PolaroidCard({ photo, index, accent, getPhotoUrl, onClick, showTime }: {
  photo: Photo; index: number; accent: string;
  getPhotoUrl: (path: string) => string;
  onClick: () => void;
  showTime?: boolean;
}) {
  const rotation = ((index % 5) - 2) * 1.5;
  const time = photo.created_at ? new Date(photo.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div
      onClick={onClick}
      style={{
        background: 'white', padding: '10px 10px 34px 10px',
        border: '1px solid #e3e0d5', borderRadius: '4px',
        boxShadow: '0 6px 14px rgba(0,0,0,0.03)',
        transform: `rotate(${rotation}deg)`,
        transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        cursor: 'pointer', position: 'relative'
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.transform = 'translateY(-6px) scale(1.03) rotate(0deg)';
        e.currentTarget.style.boxShadow = '0 14px 28px rgba(0,0,0,0.08)';
        e.currentTarget.style.borderColor = accent;
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = `rotate(${rotation}deg)`;
        e.currentTarget.style.boxShadow = '0 6px 14px rgba(0,0,0,0.03)';
        e.currentTarget.style.borderColor = '#e3e0d5';
      }}
    >
      <div style={{
        width: '100%', aspectRatio: '1/1', overflow: 'hidden',
        background: '#fcfcfc', borderRadius: '2px'
      }}>
        <img
          src={getPhotoUrl(photo.storage_path)}
          alt="Foto do evento"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          loading="lazy"
        />
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 0.15rem', marginTop: '6px',
        fontFamily: 'monospace', fontSize: '0.62rem', color: '#aaa'
      }}>
        <span>⚡ {(photo.filter_used || 'none').toUpperCase()}</span>
        {showTime && time && <span>{time}</span>}
      </div>
    </div>
  );
}
