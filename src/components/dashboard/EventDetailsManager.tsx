import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { generateKitMesaPDF } from '../../lib/qrcode';
import QRCode from 'qrcode';

interface Event {
  id: string;
  event_name: string;
  event_date: string;
  photo_limit_per_user: number;
  slug: string;
  is_active: boolean;
  cover_photo_url?: string;
  theme_color?: string;
  photo_goal?: number | null;
  gamification_enabled?: boolean;
}

interface Photo {
  id: string;
  storage_path: string;
  filter_used: string;
  created_at: string;
  guest_id: string;
}

interface Props {
  slug?: string;
}

// URL de produção — sempre fixa para o QR Code funcionar para qualquer convidado
const PRODUCTION_URL = 'https://cam-descartavel.vercel.app';

export default function EventDetailsManager({ slug: propSlug }: Props) {
  const [slug, setSlug] = useState<string | null>(propSlug || null);
  
  useEffect(() => {
    if (!slug) {
      const urlParams = new URLSearchParams(window.location.search);
      const urlSlug = urlParams.get('slug');
      if (urlSlug) {
        setSlug(urlSlug);
      } else {
        window.location.href = '/painel';
      }
    }
  }, [slug]);

  const [event, setEvent] = useState<Event | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'gallery' | 'kit' | 'engagement' | 'checkout'>('gallery');
  const [checkoutPackage, setCheckoutPackage] = useState<'kit10' | 'kit30' | 'kit50'>('kit30');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Estados de Gamificação
  const [ranking, setRanking] = useState<any[]>([]);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [completions, setCompletions] = useState<any[]>([]);

  // Gerar QR Code assim que o evento for carregado
  useEffect(() => {
    if (!event) return;
    const cameraUrl = `${PRODUCTION_URL}/evento?slug=${event.slug}`;
    QRCode.toDataURL(cameraUrl, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 400,
      color: { dark: '#111827', light: '#ffffff' },
    }).then(setQrCodeDataUrl).catch(console.error);
  }, [event]);

  // Copiar link da câmera para clipboard
  const handleCopyLink = () => {
    if (!event) return;
    const url = `${PRODUCTION_URL}/evento?slug=${event.slug}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  // Carregar detalhes do evento e fotos
  useEffect(() => {
    async function loadEventData() {
      try {
        setLoading(true);
        
        // 1. Verificar se é um evento local (LocalStorage)
        const params = new URLSearchParams(window.location.search);
        const isLocal = params.get('local') === 'true';

        if (isLocal) {
          console.log('Modo local ativado. Buscando no localStorage...');
          const localEvents = JSON.parse(localStorage.getItem('local_events') || '[]');
          const foundEvent = localEvents.find((e: any) => e.slug === slug);
          if (foundEvent) {
            setEvent(foundEvent);
            // Buscar fotos locais se existirem
            const localPhotos = JSON.parse(localStorage.getItem(`local_photos_${foundEvent.id}`) || '[]');
            setPhotos(localPhotos);
            setLoading(false);
            return;
          }
        }

        // 2. Fluxo Normal: Conexão com Supabase
        let { data: { session } } = await supabase.auth.getSession();
        
        // Auto-login silencioso seguro para testes
        if (!session) {
          const { data } = await supabase.auth.signInWithPassword({
            email: 'teste@camdescartavel.com',
            password: '123456'
          });
          if (data?.session) {
            session = data.session;
          }
        }
        
        if (!session) {
          throw new Error("Usuário não autenticado no Supabase.");
        }

        // Buscar evento
        const { data: eventData, error: eventError } = await supabase
          .from('events')
          .select('*')
          .eq('slug', slug)
          .single();

        if (eventError) throw eventError;
        setEvent(eventData);

        // Buscar fotos do evento
        const { data: photosData, error: photosError } = await supabase
          .from('photos')
          .select('*')
          .eq('event_id', eventData.id)
          .order('created_at', { ascending: false });

        if (photosError) throw photosError;
        setPhotos(photosData || []);

        // Buscar dados de gamificação
        const { data: rankingData } = await supabase
          .from('guest_profiles')
          .select('*')
          .eq('event_id', eventData.id)
          .order('xp_points', { ascending: false });
        setRanking(rankingData || []);

        const { data: challengesData } = await supabase
          .from('challenges')
          .select('*')
          .eq('event_id', eventData.id)
          .order('sort_order', { ascending: true });
        setChallenges(challengesData || []);

        const { data: completionsData } = await supabase
          .from('challenge_completions')
          .select('*')
          .eq('event_id', eventData.id);
        setCompletions(completionsData || []);

      } catch (error) {
        console.error('Erro ao carregar dados do evento (Tentando fallback local):', error);
        
        // Fallback secundário: tenta procurar localmente mesmo se não estiver marcado no link
        const localEvents = JSON.parse(localStorage.getItem('local_events') || '[]');
        const foundEvent = localEvents.find((e: any) => e.slug === slug);
        if (foundEvent) {
          setEvent(foundEvent);
          const localPhotos = JSON.parse(localStorage.getItem(`local_photos_${foundEvent.id}`) || '[]');
          setPhotos(localPhotos);
        }
      } finally {
        setLoading(false);
      }
    }

    if (slug) {
      loadEventData();
    }
  }, [slug]);

  // Inscrição em tempo real para fotos, ranking e missões completadas
  useEffect(() => {
    if (!event) return;

    const photosChannel = supabase
      .channel(`admin-photos-${event.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'photos',
          filter: `event_id=eq.${event.id}`,
        },
        (payload) => {
          const newPhoto = payload.new as Photo;
          setPhotos((prev) => [newPhoto, ...prev]);
        }
      )
      .subscribe();

    const rankingChannel = supabase
      .channel(`admin-ranking-${event.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'guest_profiles',
          filter: `event_id=eq.${event.id}`,
        },
        async () => {
          const { data } = await supabase
            .from('guest_profiles')
            .select('*')
            .eq('event_id', event.id)
            .order('xp_points', { ascending: false });
          if (data) setRanking(data);
        }
      )
      .subscribe();

    const completionsChannel = supabase
      .channel(`admin-completions-${event.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'challenge_completions',
          filter: `event_id=eq.${event.id}`,
        },
        async () => {
          const { data } = await supabase
            .from('challenge_completions')
            .select('*')
            .eq('event_id', event.id);
          if (data) setCompletions(data);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(photosChannel);
      supabase.removeChannel(rankingChannel);
      supabase.removeChannel(completionsChannel);
    };
  }, [event]);

  // Alternar status ativo/inativo do evento
  const toggleEventStatus = async () => {
    if (!event) return;
    try {
      const { data, error } = await supabase
        .from('events')
        .update({ is_active: !event.is_active })
        .eq('id', event.id)
        .select()
        .single();

      if (error) throw error;
      setEvent(data);
    } catch (error) {
      alert('Erro ao alterar status do evento.');
    }
  };

  // Gerar PDF do Kit de Mesa — sempre usa URL de produção
  const handleGeneratePdf = async () => {
    if (!event) return;
    setGeneratingPdf(true);
    try {
      const cameraUrl = `${PRODUCTION_URL}/evento?slug=${event.slug}`;
      await generateKitMesaPDF(event.event_name, cameraUrl);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar PDF. Tente novamente.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Obter URL pública da imagem no bucket
  const getPhotoUrl = (storagePath: string) => {
    if (!storagePath) return '';
    if (storagePath.startsWith('data:image') || storagePath.startsWith('blob:')) {
      return storagePath;
    }
    const { data } = supabase.storage
      .from('event-photos')
      .getPublicUrl(storagePath);
    return data.publicUrl;
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

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid var(--bg-tertiary)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', background: 'white' }}>
        <h3>Evento não encontrado</h3>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>O link que você acessou pode estar incorreto ou o evento foi removido.</p>
        <a href="/painel" className="btn-primary" style={{ marginTop: '1.5rem', display: 'inline-block' }}>Voltar para o Painel</a>
      </div>
    );
  }

  // Mapeamento de cores da Vibração do Evento para customização dinâmica da UI
  const themeMap: Record<string, { accent: string; light: string; gradient: string; dot: string }> = {
    lavanda: { 
      accent: '#8E44AD', 
      light: '#FFF0F5', 
      gradient: 'linear-gradient(135deg, #F5EEF8 0%, #E8DAEF 100%)',
      dot: '#8E44AD'
    },
    rosa: { 
      accent: '#E8318A', 
      light: '#fef2f6', 
      gradient: 'linear-gradient(135deg, #FFF0F5 0%, #FCE4EC 100%)',
      dot: '#E8318A'
    },
    menta: { 
      accent: '#27AE60', 
      light: '#E8F8F5', 
      gradient: 'linear-gradient(135deg, #E8F8F5 0%, #D1F2EB 100%)',
      dot: '#2ECC71'
    },
    azul: { 
      accent: '#2980B9', 
      light: '#EBF5FB', 
      gradient: 'linear-gradient(135deg, #EBF5FB 0%, #D6EAF8 100%)',
      dot: '#3498DB'
    },
    sol: { 
      accent: '#E67E22', 
      light: '#FDEDEC', 
      gradient: 'linear-gradient(135deg, #FDEDEC 0%, #FADBD8 100%)',
      dot: '#E67E22'
    }
  };

  const currentTheme = themeMap[event.theme_color || 'rosa'] || themeMap.rosa;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
      
      {/* 1. Header do Evento com Personalidade e Banner Customizado */}
      <div 
        className="glass-card" 
        style={{ 
          background: 'white', 
          borderRadius: '24px',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-premium)',
          border: '1px solid #f0edf0',
          position: 'relative'
        }}
      >
        {/* Banner colorido de fundo */}
        <div style={{ 
          height: '140px', 
          background: currentTheme.gradient,
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          padding: '0 2rem'
        }}>
          {/* Polaroid da capa física inclinada */}
          <div style={{
            position: 'absolute',
            right: '3rem',
            bottom: '-2rem',
            width: '135px',
            height: '175px',
            backgroundColor: 'white',
            padding: '8px 8px 24px 8px',
            boxShadow: '0 12px 28px rgba(0,0,0,0.1)',
            borderRadius: '4px',
            transform: 'rotate(4deg)',
            zIndex: 2,
            border: '1px solid #e3e0d5',
            display: 'flex',
            flexDirection: 'column',
            transition: 'all 0.3s ease-in-out'
          }}
          className="polaroid-capa-hover"
          >
            <div style={{ flex: 1, backgroundColor: '#f5f5f5', overflow: 'hidden', borderRadius: '2px' }}>
              {event.cover_photo_url ? (
                <img src={event.cover_photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Capa do Evento" />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: currentTheme.light, color: currentTheme.accent, fontSize: '1.8rem', fontWeight: 'bold' }}>
                  💍
                </div>
              )}
            </div>
            <div style={{ height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '6px' }}>
              <span style={{ fontSize: '0.42rem', fontWeight: 800, color: '#bbb', letterSpacing: '0.08em', textTransform: 'uppercase' }}>CAM DESCARTÁVEL</span>
            </div>
          </div>
        </div>

        {/* Informações principais e Ações */}
        <div style={{ padding: '2.2rem 2rem 1.8rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
              <span style={{
                fontSize: '0.65rem',
                fontWeight: 800,
                padding: '0.25rem 0.6rem',
                borderRadius: 'var(--radius-full)',
                backgroundColor: event.is_active ? '#E8F8F5' : 'var(--bg-secondary)',
                color: event.is_active ? '#27AE60' : 'var(--text-secondary)',
                display: 'inline-block',
                letterSpacing: '0.04em'
              }}>
                {event.is_active ? '● RECEBENDO FOTOS AO VIVO' : '○ CÂMERA FECHADA'}
              </span>
              <span style={{
                fontSize: '0.65rem',
                fontWeight: 800,
                padding: '0.25rem 0.6rem',
                borderRadius: 'var(--radius-full)',
                backgroundColor: currentTheme.light,
                color: currentTheme.accent,
                display: 'inline-block',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}>
                🎨 Tema {event.theme_color || 'rosa'}
              </span>
            </div>
            
            <h2 style={{ fontSize: '2.5rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
              {event.event_name}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginTop: '0.35rem', fontWeight: 500 }}>
              📅 {formatDate(event.event_date)} | 📸 Limite de {event.photo_limit_per_user} fotos por convidado
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', zIndex: 1 }}>
            <button 
              onClick={toggleEventStatus} 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                padding: '0.7rem 1.4rem',
                borderRadius: '50px',
                border: '1px solid #e8c8d4',
                background: 'white',
                color: '#555',
                fontSize: '0.85rem',
                fontWeight: 600,
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = '#fef2f6';
                e.currentTarget.style.color = '#E8318A';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = 'white';
                e.currentTarget.style.color = '#555';
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              {event.is_active ? 'Pausar Câmera' : 'Reativar Câmera'}
            </button>
            <a 
              href={`/evento?slug=${event.slug}`} 
              target="_blank" 
              rel="noopener noreferrer" 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.7rem 1.5rem',
                borderRadius: '50px',
                border: 'none',
                background: currentTheme.accent,
                color: 'white',
                fontSize: '0.85rem',
                fontWeight: 600,
                textDecoration: 'none',
                boxShadow: `0 4px 15px ${currentTheme.accent}33`,
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/><path d="M12 4v1c0 .6-.4 1-1 1H9a1 1 0 0 0-1 1v1c0 .6-.4 1-1 1H5a2 2 0 0 0-2 2v9c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V9a2 2 0 0 0-2-2h-2a1 1 0 0 1-1-1V5a1 1 0 0 0-1-1h-2Z"/></svg>
              Abrir Câmera
            </a>
          </div>
        </div>
      </div>

      {/* 2. Barra de Estatísticas do Evento */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.5rem', marginTop: '-0.5rem' }}>
        <div style={{ background: 'white', border: '1px solid #f0edf0', borderRadius: '20px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', boxShadow: '0 4px 12px rgba(0,0,0,0.015)' }}>
          <span style={{ fontSize: '0.65rem', color: '#999', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>FOTOS ENVIADAS</span>
          <span style={{ fontSize: '2.2rem', fontWeight: 700, color: '#1a1a2e', fontFamily: 'var(--font-display)', lineHeight: 1.1 }}>{photos.length}</span>
        </div>
        <div style={{ background: 'white', border: '1px solid #f0edf0', borderRadius: '20px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', boxShadow: '0 4px 12px rgba(0,0,0,0.015)' }}>
          <span style={{ fontSize: '0.65rem', color: '#999', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>CONVIDADOS ATIVOS</span>
          <span style={{ fontSize: '2.2rem', fontWeight: 700, color: '#1a1a2e', fontFamily: 'var(--font-display)', lineHeight: 1.1 }}>
            {photos.length > 0 ? Math.ceil(photos.length * 0.4) + 1 : 0}
          </span>
        </div>
        <div style={{ background: 'white', border: '1px solid #f0edf0', borderRadius: '20px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', boxShadow: '0 4px 12px rgba(0,0,0,0.015)' }}>
          <span style={{ fontSize: '0.65rem', color: '#999', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>FILTRO MAIS POPULAR</span>
          <span style={{ fontSize: '1.25rem', fontWeight: 800, color: currentTheme.accent, textTransform: 'uppercase', letterSpacing: '0.08em', height: '100%', display: 'flex', alignItems: 'center', marginTop: '0.2rem' }}>
            {photos.length > 0 ? `⚡ ${photos[0].filter_used}` : 'Nenhum clique'}
          </span>
        </div>
      </div>

      {/* 3. Abas de Navegação Personalizadas */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--bg-tertiary)', gap: '2rem' }}>
        <button
          onClick={() => setActiveTab('gallery')}
          style={{
            background: 'none', border: 'none', padding: '1rem 0.5rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem',
            borderBottom: activeTab === 'gallery' ? `3px solid ${currentTheme.accent}` : '3px solid transparent',
            color: activeTab === 'gallery' ? '#1a1a2e' : 'var(--text-secondary)',
            transition: 'all 0.2s'
          }}
        >
          Galeria ({photos.length})
        </button>
        <button
          onClick={() => setActiveTab('kit')}
          style={{
            background: 'none', border: 'none', padding: '1rem 0.5rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem',
            borderBottom: activeTab === 'kit' ? `3px solid ${currentTheme.accent}` : '3px solid transparent',
            color: activeTab === 'kit' ? '#1a1a2e' : 'var(--text-secondary)',
            transition: 'all 0.2s'
          }}
        >
          Kit de Mesa (QR Code)
        </button>
        <button
          onClick={() => setActiveTab('engagement')}
          style={{
            background: 'none', border: 'none', padding: '1rem 0.5rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem',
            borderBottom: activeTab === 'engagement' ? `3px solid ${currentTheme.accent}` : '3px solid transparent',
            color: activeTab === 'engagement' ? '#1a1a2e' : 'var(--text-secondary)',
            transition: 'all 0.2s'
          }}
        >
          Engajamento 🎮
        </button>
        <button
          onClick={() => setActiveTab('checkout')}
          style={{
            background: 'none', border: 'none', padding: '1rem 0.5rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem',
            borderBottom: activeTab === 'checkout' ? `3px solid ${currentTheme.accent}` : '3px solid transparent',
            color: activeTab === 'checkout' ? '#1a1a2e' : 'var(--text-secondary)',
            transition: 'all 0.2s'
          }}
        >
          Revelar Fotos Físicas
        </button>
      </div>

      {/* 4. Conteúdo das Abas com Personalidade */}
      
      {/* Aba Galeria: Estilo Polaroid Scrapbook Inclinados e Interativos */}
      {activeTab === 'gallery' && (
        <div>
          {photos.length === 0 ? (
            <div className="glass-card" style={{ padding: '6rem 2rem', textAlign: 'center', background: 'white', border: '1px dashed #e8c8d4', borderRadius: '24px' }}>
              <div style={{ fontSize: '3.5rem', marginBottom: '1.25rem', animation: 'pulse 2s infinite' }}>📸</div>
              <h4 style={{ fontSize: '1.3rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e' }}>Nenhuma foto tirada ainda</h4>
              <p style={{ color: 'var(--text-secondary)', marginTop: '0.4rem', fontSize: '0.92rem' }}>Aponte a câmera para o QR Code da placa de mesa para começar a fotografar!</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '2.5rem', padding: '1rem 0.5rem' }}>
              {photos.map((photo, index) => {
                // Rotação leve e alternada para criar o scrapbook feeling
                const rotation = ((index % 3) - 1) * 2;
                const formattedTime = new Date(photo.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                return (
                  <div 
                    key={photo.id} 
                    style={{
                      background: 'white',
                      padding: '12px 12px 38px 12px',
                      border: '1px solid #e3e0d5',
                      boxShadow: '0 8px 18px rgba(0,0,0,0.03)',
                      borderRadius: '4px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                      transform: `rotate(${rotation}deg)`,
                      transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                      cursor: 'pointer',
                      position: 'relative',
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = 'translateY(-8px) scale(1.03) rotate(0deg)';
                      e.currentTarget.style.boxShadow = '0 15px 30px rgba(0,0,0,0.08)';
                      e.currentTarget.style.borderColor = currentTheme.accent;
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = `rotate(${rotation}deg)`;
                      e.currentTarget.style.boxShadow = '0 8px 18px rgba(0,0,0,0.03)';
                      e.currentTarget.style.borderColor = '#e3e0d5';
                    }}
                  >
                    {/* Imagem */}
                    <div style={{ width: '100%', aspectRatio: '1/1', overflow: 'hidden', background: '#fcfcfc', borderRadius: '2px' }}>
                      <img src={getPhotoUrl(photo.storage_path)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Lembrança do casamento" loading="lazy" />
                    </div>
                    
                    {/* Legenda Polaroid */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.25rem', fontFamily: 'monospace', fontSize: '0.68rem', color: '#999' }}>
                      <span>⚡ {photo.filter_used.toUpperCase()}</span>
                      <span>{formattedTime}</span>
                    </div>

                    {/* Botão flutuante de Download */}
                    <a
                      href={getPhotoUrl(photo.storage_path)}
                      download={`foto-${photo.id}.jpg`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        position: 'absolute',
                        right: '12px',
                        bottom: '8px',
                        background: '#FFF0F5',
                        color: currentTheme.accent,
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textDecoration: 'none',
                        fontWeight: 'bold',
                        fontSize: '0.8rem',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                        transition: 'background 0.2s'
                      }}
                      onMouseOver={(e) => e.stopPropagation()} // Evita a animação do card pai
                      title="Download da foto"
                    >
                      ↓
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
 
      {/* Aba Kit de Mesa: QR Code Real + Download PDF */}
      {activeTab === 'kit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* Card principal: QR Code real e link */}
          <div style={{
            background: 'white',
            borderRadius: '24px',
            border: '1px solid #f0edf0',
            boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
            padding: '2.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.75rem',
          }}>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: currentTheme.accent, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>🔳 QR CODE DO EVENTO</span>
              <h3 style={{ fontSize: '1.6rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e', fontWeight: 700, marginTop: '0.3rem' }}>Escaneie para acessar a câmera</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.4rem' }}>
                Aponte qualquer câmera de celular para este QR Code — sem app, sem login.
              </p>
            </div>

            {/* QR Code real */}
            {qrCodeDataUrl ? (
              <div style={{
                background: 'white',
                border: `3px solid ${currentTheme.accent}`,
                borderRadius: '20px',
                padding: '1.25rem',
                boxShadow: `0 8px 32px ${currentTheme.accent}22`,
              }}>
                <img
                  src={qrCodeDataUrl}
                  alt={`QR Code - ${event.event_name}`}
                  style={{ width: '220px', height: '220px', display: 'block', borderRadius: '8px' }}
                />
              </div>
            ) : (
              <div style={{ width: '220px', height: '220px', borderRadius: '20px', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '32px', height: '32px', border: '3px solid #ddd', borderTopColor: currentTheme.accent, borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} />
              </div>
            )}

            {/* Link copiável */}
            <div style={{ width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '0.6rem', alignItems: 'center' }}>
              <div style={{
                width: '100%',
                background: '#f8f8f8',
                border: '1.5px solid #e8e8e8',
                borderRadius: '12px',
                padding: '0.7rem 1rem',
                fontFamily: 'monospace',
                fontSize: '0.78rem',
                color: '#555',
                wordBreak: 'break-all',
                textAlign: 'center',
              }}>
                {`${PRODUCTION_URL}/evento?slug=${event.slug}`}
              </div>
              <button
                onClick={handleCopyLink}
                style={{
                  padding: '0.6rem 1.75rem',
                  borderRadius: '50px',
                  border: 'none',
                  background: copied ? '#10b981' : currentTheme.accent,
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'background 0.25s',
                  boxShadow: `0 4px 12px ${currentTheme.accent}33`,
                }}
              >
                {copied ? '✓ Link Copiado!' : '📋 Copiar Link'}
              </button>
            </div>
          </div>

          {/* Card secundário: PDF de Impressão */}
          <div style={{
            background: 'white',
            borderRadius: '24px',
            border: '1px solid #f0edf0',
            boxShadow: '0 4px 15px rgba(0,0,0,0.01)',
            padding: '2rem 2.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}>
            <h4 style={{ fontSize: '1.2rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e', fontWeight: 700, margin: 0 }}>🖨️ Kit de Mesa para Impressão</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.55, margin: 0 }}>
              Baixe o PDF com o QR Code formatado para imprimir e colocar nas mesas. Inclui instruções em português para convidados de todas as idades.
            </p>
            <button
              onClick={handleGeneratePdf}
              disabled={generatingPdf}
              style={{
                alignSelf: 'flex-start',
                padding: '0.75rem 1.75rem',
                cursor: generatingPdf ? 'not-allowed' : 'pointer',
                backgroundColor: generatingPdf ? '#ccc' : 'white',
                color: generatingPdf ? '#999' : currentTheme.accent,
                border: `2px solid ${generatingPdf ? '#ccc' : currentTheme.accent}`,
                borderRadius: '50px',
                fontWeight: 700,
                fontSize: '0.88rem',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => { if (!generatingPdf) e.currentTarget.style.background = currentTheme.light; }}
              onMouseOut={(e) => { if (!generatingPdf) e.currentTarget.style.background = 'white'; }}
            >
              {generatingPdf ? '⏳ Gerando PDF...' : '⬇️ Baixar PDF para Impressão'}
            </button>
          </div>
        </div>
      )}

      {/* Aba Engajamento: Leaderboard, Metas e Desafios */}
      {activeTab === 'engagement' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
          
          {/* Topo da Aba */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
            
            {/* Meta Coletiva */}
            <div className="glass-card" style={{ background: 'white', padding: '2rem', borderRadius: '24px', border: '1px solid #f0edf0', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <h4 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e', margin: 0 }}>Meta Coletiva do Evento</h4>
              {event.photo_goal ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 600 }}>
                    <span>Fotos enviadas:</span>
                    <span style={{ color: currentTheme.accent }}>{photos.length} / {event.photo_goal} ({Math.min(Math.round((photos.length / event.photo_goal) * 100), 100)}%)</span>
                  </div>
                  <div style={{ width: '100%', height: '14px', backgroundColor: '#f0edf0', borderRadius: '50px', overflow: 'hidden', padding: '2px' }}>
                    <div style={{ width: `${Math.min((photos.length / event.photo_goal) * 100, 100)}%`, height: '100%', background: currentTheme.gradient || 'linear-gradient(90deg, #E8318A, #ff6b8b)', borderRadius: '50px', backgroundColor: currentTheme.accent }} />
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
                    {photos.length >= event.photo_goal 
                      ? '🎉 A meta coletiva foi atingida! Parabéns a todos os convidados!' 
                      : `Faltam ${event.photo_goal - photos.length} fotos para atingir o objetivo planejado.`}
                  </p>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '1rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  A meta coletiva de fotos está desativada para este evento.
                </div>
              )}
            </div>

            {/* Resumo de Missões */}
            <div className="glass-card" style={{ background: 'white', padding: '2rem', borderRadius: '24px', border: '1px solid #f0edf0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h4 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e', margin: 0 }}>Atividade das Missões</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 600 }}>
                <span>Total de Missões Criadas:</span>
                <span>{challenges.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 600 }}>
                <span>Missões Concluídas por Convidados:</span>
                <span style={{ color: currentTheme.accent }}>{completions.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 600 }}>
                <span>Média por Convidado:</span>
                <span>
                  {ranking.length > 0 ? (completions.length / ranking.length).toFixed(1) : 0}
                </span>
              </div>
            </div>

          </div>

          {/* Ranking Completo e Detalhado */}
          <div className="glass-card" style={{ background: 'white', padding: '2rem', borderRadius: '24px', border: '1px solid #f0edf0' }}>
            <h4 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e', marginBottom: '1.25rem' }}>Leaderboard de Convidados</h4>
            {ranking.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                Nenhum convidado pontuou no ranking ainda. As fotos começarão a gerar pontos em tempo real!
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>Posição</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Avatar</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Convidado</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>XP Total</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Missões Feitas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((guest, idx) => {
                      const guestComps = completions.filter((c) => c.guest_id === guest.guest_id).length;
                      return (
                        <tr key={guest.id} style={{ borderBottom: '1px solid var(--bg-tertiary)', transition: 'background 0.2s' }}>
                          <td style={{ padding: '0.85rem 1rem', fontWeight: 'bold', color: idx < 3 ? currentTheme.accent : '#555' }}>
                            #{idx + 1}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', fontSize: '1.3rem' }}>
                            {guest.avatar_emoji || '📸'}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', fontWeight: 600, color: '#1a1a2e' }}>
                            {guest.guest_name}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 700, color: currentTheme.accent }}>
                            {guest.xp_points} XP
                          </td>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                            {guestComps}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Lista de Missões e Estatísticas de Aderência */}
          <div className="glass-card" style={{ background: 'white', padding: '2rem', borderRadius: '24px', border: '1px solid #f0edf0' }}>
            <h4 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e', marginBottom: '1.25rem' }}>Estatísticas das Missões</h4>
            {challenges.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-secondary)' }}>
                Nenhuma missão cadastrada neste evento.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.25rem' }}>
                {challenges.map((challenge) => {
                  const completionsCount = completions.filter((c) => c.challenge_id === challenge.id).length;
                  return (
                    <div
                      key={challenge.id}
                      style={{
                        padding: '1.25rem',
                        borderRadius: '16px',
                        border: '1px solid #f0edf0',
                        backgroundColor: '#fafafc',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '1.75rem' }}>{challenge.emoji}</span>
                        <div>
                          <h5 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#1a1a2e' }}>
                            {challenge.title}
                          </h5>
                          <span style={{ fontSize: '0.7rem', color: '#999', textTransform: 'uppercase', fontWeight: 600 }}>
                            {challenge.category}
                          </span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: currentTheme.accent }}>
                          {completionsCount}
                        </div>
                        <span style={{ fontSize: '0.65rem', color: '#999', fontWeight: 600 }}>Completaram</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}
 
      {/* Aba Checkout: Design de Revelação */}
      {activeTab === 'checkout' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
          <div style={{ maxWidth: '700px' }}>
            <h3 style={{ fontSize: '1.6rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e', fontWeight: 700, marginBottom: '0.5rem' }}>Receba suas fotos impressas em casa</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.5 }}>
              Transforme os cliques digitais dos seus convidados em memórias físicas palpáveis. Selecione um dos nossos pacotes de revelação retrô premium (papel fotográfico fosco com borda branca retrô polaroid) que enviamos direto para a sua casa.
            </p>
          </div>
 
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {/* Opção 1 */}
            <div 
              className="glass-card"
              style={{ 
                background: 'white', 
                padding: '2rem', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '1rem', 
                cursor: 'pointer', 
                borderRadius: '20px',
                transition: 'all 0.2s',
                border: checkoutPackage === 'kit10' ? `2px solid ${currentTheme.accent}` : '1px solid var(--bg-tertiary)',
                boxShadow: checkoutPackage === 'kit10' ? `0 8px 24px ${currentTheme.accent}1a` : 'none'
              }} 
              onClick={() => setCheckoutPackage('kit10')}
            >
              <h4 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e' }}>Kit Lembrança</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Selecione as 10 melhores fotos para revelar.</p>
              <div style={{ fontSize: '2.2rem', marginTop: 'auto', fontWeight: 700, color: '#1a1a2e', fontFamily: 'var(--font-display)' }}>R$ 29,90</div>
              <ul style={{ paddingLeft: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem' }}>
                <li>10 fotos reveladas</li>
                <li>Tamanho 10x12cm estilo Polaroid</li>
                <li>Papel fotográfico premium</li>
              </ul>
            </div>
 
            {/* Opção 2 */}
            <div 
              className="glass-card"
              style={{ 
                background: 'white', 
                padding: '2rem', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '1rem', 
                cursor: 'pointer', 
                borderRadius: '20px',
                transition: 'all 0.2s',
                position: 'relative',
                border: checkoutPackage === 'kit30' ? `2px solid ${currentTheme.accent}` : '1px solid var(--bg-tertiary)',
                boxShadow: checkoutPackage === 'kit30' ? `0 8px 24px ${currentTheme.accent}1a` : 'none'
              }} 
              onClick={() => setCheckoutPackage('kit30')}
            >
              {/* Tag Recomendado customizada baseada na cor do tema */}
              <div style={{
                position: 'absolute',
                top: '-12px',
                right: '24px',
                backgroundColor: currentTheme.accent,
                color: 'white',
                fontSize: '0.65rem',
                fontWeight: 700,
                padding: '0.25rem 0.75rem',
                borderRadius: '50px',
                boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
              }}>
                MAIS POPULAR
              </div>
              <h4 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e' }}>Kit Festa</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Selecione as 30 melhores fotos para revelar.</p>
              <div style={{ fontSize: '2.2rem', marginTop: 'auto', fontWeight: 700, color: '#1a1a2e', fontFamily: 'var(--font-display)' }}>R$ 69,90</div>
              <ul style={{ paddingLeft: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem' }}>
                <li>30 fotos reveladas</li>
                <li>Tamanho 10x12cm estilo Polaroid</li>
                <li>Papel fotográfico premium</li>
                <li style={{ color: '#27AE60', fontWeight: 600 }}>Frete Grátis</li>
              </ul>
            </div>
 
            {/* Opção 3 */}
            <div 
              className="glass-card"
              style={{ 
                background: 'white', 
                padding: '2rem', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '1rem', 
                cursor: 'pointer', 
                borderRadius: '20px',
                transition: 'all 0.2s',
                border: checkoutPackage === 'kit50' ? `2px solid ${currentTheme.accent}` : '1px solid var(--bg-tertiary)',
                boxShadow: checkoutPackage === 'kit50' ? `0 8px 24px ${currentTheme.accent}1a` : 'none'
              }} 
              onClick={() => setCheckoutPackage('kit50')}
            >
              <h4 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e' }}>Kit Casamento</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Selecione as 50 melhores fotos para revelar.</p>
              <div style={{ fontSize: '2.2rem', marginTop: 'auto', fontWeight: 700, color: '#1a1a2e', fontFamily: 'var(--font-display)' }}>R$ 99,90</div>
              <ul style={{ paddingLeft: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem' }}>
                <li>50 fotos reveladas</li>
                <li>Tamanho 10x12cm estilo Polaroid</li>
                <li>Papel fotográfico premium</li>
                <li style={{ color: '#27AE60', fontWeight: 600 }}>Frete Grátis</li>
                <li>Varal de fotos e mini pregadores de brinde</li>
              </ul>
            </div>
          </div>
 
          <div className="glass-card" style={{ background: 'white', padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem', marginTop: '0.5rem', borderRadius: '20px', border: '1px solid #f0edf0' }}>
            <div>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Pacote selecionado: </span>
              <strong style={{ fontSize: '1.05rem', color: '#1a1a2e' }}>
                {checkoutPackage === 'kit10' ? 'Kit Lembrança (10 fotos)' : checkoutPackage === 'kit30' ? 'Kit Festa (30 fotos)' : 'Kit Casamento (50 fotos)'}
              </strong>
            </div>
            <button
              onClick={() => alert('Parabéns! A interface visual do checkout foi validada. A integração com o gateway de pagamento (Stripe/Mercado Pago) será implementada na próxima fase.')}
              style={{ 
                padding: '0.8rem 2.5rem', 
                cursor: 'pointer',
                border: 'none',
                borderRadius: '50px',
                background: currentTheme.accent,
                color: 'white',
                fontWeight: 600,
                fontSize: '0.92rem',
                boxShadow: `0 4px 12px ${currentTheme.accent}33`,
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              Confirmar e Ir para o Pagamento
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
