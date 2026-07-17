import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

// ─── Interfaces ────────────────────────────────────────────────
interface Event {
  id: string;
  event_name: string;
  event_date: string;
  slug: string;
  is_active: boolean;
  theme_color?: string;
  isLocal?: boolean;
}

interface Photo {
  id: string;
  storage_path: string;
  filter_used: string;
  created_at: string;
  guest_id: string;
  event_id: string;
}

interface Package {
  id: 'polaroid50' | 'print100' | 'album50';
  name: string;
  price: number;
  description: string;
  features: string[];
  limit: number;
  badge?: string;
}

// ─── Configurações de Temas ───────────────────────────────────
const themeMap: Record<string, { accent: string; light: string; gradient: string }> = {
  lavanda: { accent: '#8E44AD', light: '#FFF0F5', gradient: 'linear-gradient(135deg, #F5EEF8 0%, #E8DAEF 100%)' },
  rosa:    { accent: '#E8318A', light: '#fef2f6', gradient: 'linear-gradient(135deg, #FFF0F5 0%, #FCE4EC 100%)' },
  menta:   { accent: '#27AE60', light: '#E8F8F5', gradient: 'linear-gradient(135deg, #E8F8F5 0%, #D1F2EB 100%)' },
  azul:    { accent: '#2980B9', light: '#EBF5FB', gradient: 'linear-gradient(135deg, #EBF5FB 0%, #D6EAF8 100%)' },
  sol:     { accent: '#E67E22', light: '#FDEDEC', gradient: 'linear-gradient(135deg, #FDEDEC 0%, #FADBD8 100%)' },
};

// ─── Componente Principal ──────────────────────────────────────
export default function PrintManager() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPackage, setSelectedPackage] = useState<'polaroid50' | 'print100' | 'album50'>('polaroid50');
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  
  // Checkout & Shipping
  const [checkoutStep, setCheckoutStep] = useState<'packages' | 'select_photos' | 'shipping' | 'payment' | 'success'>('packages');
  const [zipCode, setZipCode] = useState('');
  const [address, setAddress] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card'>('pix');
  const [isPaying, setIsPaying] = useState(false);

  // Logs e Erro
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const addLog = (msg: string) => {
    console.log(`[PrintDebug] ${msg}`);
    setDebugLogs((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  // ─── Pacotes customizados pelo usuário ────────────────────────
  const packages: Package[] = [
    {
      id: 'polaroid50',
      name: 'Kit Retro Polaroid',
      price: 129,
      description: 'Revele seus cliques favoritos com o autêntico charme vintage.',
      limit: 50,
      features: [
        '50 fotos em estilo Polaroid',
        'Tamanho retrô 10x12cm com borda branca',
        'Papel fotográfico fosco antirreflexo',
        'Varal de barbante rústico + mini pregadores de brinde',
        'Frete grátis para todo o Brasil'
      ],
      badge: 'MAIS VENDIDO'
    },
    {
      id: 'print100',
      name: 'Kit Impressão Clássica',
      price: 249,
      description: 'Perfeito para guardar no álbum tradicional da família ou porta-retratos.',
      limit: 100,
      features: [
        '100 fotos impressas',
        'Formato clássico 10x15cm (sem bordas)',
        'Papel fotográfico Fujifilm Premium brilhante',
        'Altíssima fidelidade de cores e nitidez',
        'Embalagem protetora especial',
        'Frete grátis para todo o Brasil'
      ],
      badge: 'MELHOR CUSTO-BENEFÍCIO'
    },
    {
      id: 'album50',
      name: 'Álbum Capa Dura Personalizado',
      price: 399,
      description: 'Um livro físico de memórias diagramado com os melhores momentos.',
      limit: 50,
      features: [
        'Álbum físico com Capa Dura impressa laminada',
        '50 fotos diagramadas profissionalmente',
        'Formato panorâmico premium 15x30cm (aberto)',
        'Abertura 180° Flat (páginas rígidas e grossas)',
        'Ideal para mesas de centro e recordação de casamento',
        'Frete grátis para todo o Brasil'
      ],
      badge: 'PREMIUM EXECUTIVE'
    }
  ];

  const currentPack = packages.find(p => p.id === selectedPackage) || packages[0];

  // ─── Carregar eventos (Supabase + Local) ─────────────────────
  useEffect(() => {
    async function loadEvents() {
      addLog('Iniciando carregamento de eventos para impressão...');
      try {
        const localRaw = localStorage.getItem('local_events');
        const localEvents: Event[] = localRaw ? JSON.parse(localRaw) : [];
        const markedLocal = localEvents.map(e => ({ ...e, isLocal: true }));

        let dbEvents: Event[] = [];
        let { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          const { data } = await supabase.auth.signInWithPassword({
            email: 'teste@camdescartavel.com',
            password: '123456'
          });
          if (data?.session) session = data.session;
        }

        if (session?.user?.id) {
          const { data, error } = await supabase
            .from('events')
            .select('*')
            .eq('user_id', session.user.id)
            .order('event_date', { ascending: false });

          if (error) addLog(`Erro ao carregar do Supabase: ${error.message}`);
          else dbEvents = data || [];
        }

        const combined = [...markedLocal, ...dbEvents];
        setEvents(combined);
        addLog(`Eventos carregados: ${combined.length}`);

        if (combined.length > 0) {
          setSelectedEventId(combined[0].id);
        }
      } catch (err: any) {
        addLog(`Erro geral ao carregar eventos: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }
    loadEvents();
  }, []);

  // ─── Carregar fotos do evento selecionado ────────────────────
  useEffect(() => {
    if (!selectedEventId) return;

    async function loadPhotos() {
      setLoading(true);
      setErrorMsg('');
      setSelectedPhotos(new Set()); // Resetar fotos selecionadas ao mudar evento
      const isLocal = selectedEventId.startsWith('local-') || events.find(e => e.id === selectedEventId)?.isLocal;
      
      try {
        if (isLocal) {
          const localPhotosRaw = localStorage.getItem(`local_photos_${selectedEventId}`);
          const localPhotos: Photo[] = localPhotosRaw ? JSON.parse(localPhotosRaw) : [];
          setPhotos(localPhotos);
          addLog(`Fotos locais carregadas para impressão: ${localPhotos.length}`);
        } else {
          const { data, error } = await supabase
            .from('photos')
            .select('*')
            .eq('event_id', selectedEventId)
            .order('created_at', { ascending: false });

          if (error) throw error;
          setPhotos(data || []);
          addLog(`Fotos remotas carregadas para impressão: ${data?.length || 0}`);
        }
      } catch (err: any) {
        addLog(`Erro ao carregar fotos: ${err.message}`);
        setErrorMsg('Não foi possível carregar as fotos deste evento.');
      } finally {
        setLoading(false);
      }
    }
    loadPhotos();
  }, [selectedEventId, events]);

  const selectedEvent = events.find(e => e.id === selectedEventId);
  const theme = themeMap[selectedEvent?.theme_color || 'rosa'] || themeMap.rosa;

  const getPhotoUrl = (storagePath: string) => {
    if (!storagePath) return '';
    if (storagePath.startsWith('data:image') || storagePath.startsWith('blob:')) return storagePath;
    const { data } = supabase.storage.from('event-photos').getPublicUrl(storagePath);
    return data.publicUrl;
  };

  const handlePhotoSelect = (photoId: string) => {
    setSelectedPhotos(prev => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        if (next.size >= currentPack.limit) {
          alert(`Você atingiu o limite de ${currentPack.limit} fotos para este pacote.`);
          return prev;
        }
        next.add(photoId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedPhotos.size === Math.min(photos.length, currentPack.limit)) {
      setSelectedPhotos(new Set());
    } else {
      const next = new Set<string>();
      photos.slice(0, currentPack.limit).forEach(p => next.add(p.id));
      setSelectedPhotos(next);
    }
  };

  const handleCheckoutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !number || !zipCode || !city || !state) {
      alert('Por favor, preencha todos os campos obrigatórios de endereço.');
      return;
    }
    setCheckoutStep('payment');
  };

  const handlePaymentSubmit = async () => {
    setIsPaying(true);
    try {
      // Simula o tempo de processamento do cartão/pix
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const currentEvent = events.find(e => e.id === selectedEventId);
      const eventName = currentEvent ? currentEvent.event_name : 'Cam Descartável';

      // Pega o e-mail do usuário logado (ou usa um padrão para teste)
      const sessionRes = await supabase.auth.getSession();
      const userEmail = sessionRes.data?.session?.user?.email || 'teste@camdescartavel.com.br';

      // Dispara o e-mail transacional chamando a nossa API
      await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: userEmail,
          subject: `Pagamento Confirmado - ${eventName}`,
          type: 'receipt',
          data: { eventName }
        })
      });
      
      setCheckoutStep('success');
    } catch (err) {
      console.error(err);
      alert('Erro ao processar o pagamento ou enviar o recibo.');
    } finally {
      setIsPaying(false);
    }
  };

  // ─── RENDER ───────────────────────────────────────────────

  if (loading && events.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid var(--bg-tertiary)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }} className="animate-fade-in">
      
      {/* ─── Header da página ─────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '2.2rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            Imprimir fotos (Receber em casa)
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '0.35rem' }}>
            Deixe o celular no bolso e decore sua casa com as memórias físicas e reais do seu evento.
          </p>
        </div>

        {/* Step Indicator */}
        <div style={{ display: 'flex', gap: '0.5rem', background: '#fafafc', padding: '0.5rem 1rem', borderRadius: '50px', border: '1px solid #f0edf0' }}>
          <StepBadge active={checkoutStep === 'packages'} label="1. Pacotes" />
          <StepBadge active={checkoutStep === 'select_photos'} label="2. Fotos" />
          <StepBadge active={checkoutStep === 'shipping'} label="3. Entrega" />
          <StepBadge active={checkoutStep === 'payment'} label="4. Pagamento" />
        </div>
      </div>

      {/* ═══════════ STEP 1: PACOTES & APRESENTAÇÃO ═══════════ */}
      {checkoutStep === 'packages' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
          
          {/* Apresentação das Vantagens */}
          <div style={{
            background: 'linear-gradient(135deg, #fef2f6 0%, #fce4ec 100%)',
            borderRadius: '24px', padding: '2.5rem', border: '1px solid #fce4ec',
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2.5rem', alignItems: 'center'
          }}>
            <div>
              <span style={{ fontSize: '0.72rem', background: '#E8318A', color: 'white', fontWeight: 800, padding: '0.3rem 0.8rem', borderRadius: '50px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                REVELAÇÃO FÍSICA PREMIUM
              </span>
              <h3 style={{ fontSize: '2.2rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e', marginTop: '1rem', lineHeight: 1.15, fontWeight: 700 }}>
                Suas fotos não pertencem somente às telas
              </h3>
              <p style={{ color: '#555', fontSize: '0.98rem', marginTop: '1rem', lineHeight: 1.6 }}>
                Nada se compara ao sentimento de folhear um álbum físico de casamento ou pendurar as fotos de uma festa incrível no varal da sala. Nós imprimimos os melhores momentos capturados por você e seus convidados e enviamos diretamente para a sua casa com cuidado e carinho.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginTop: '2rem' }}>
                <BenefitItem emoji="📸" title="Papel Premium" desc="Papel fotográfico profissional antirreflexo ou brilhante." />
                <BenefitItem emoji="✨" title="Estilo Polaroid" desc="Design vintage clássico com margens brancas marcantes." />
                <BenefitItem emoji="📦" title="Frete Grátis" desc="Enviado sem custo adicional em todos os pacotes." />
                <BenefitItem emoji="🎁" title="Brindes Exclusivos" desc="Ganhe varal de fotos e mini pregadores rústicos." />
              </div>
            </div>

            {/* Polaroid Stack Illustration */}
            <div style={{ display: 'flex', justifyContent: 'center', position: 'relative', height: '240px' }}>
              <div style={{
                width: '180px', height: '220px', background: 'white', padding: '10px 10px 30px 10px',
                borderRadius: '6px', boxShadow: '0 12px 30px rgba(0,0,0,0.1)',
                transform: 'rotate(-6deg) translateX(-30px)', border: '1px solid #e3e0d5', zIndex: 1
              }}>
                <div style={{ width: '100%', height: '100%', background: '#eee', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>🥂</div>
              </div>
              <div style={{
                width: '180px', height: '220px', background: 'white', padding: '10px 10px 30px 10px',
                borderRadius: '6px', boxShadow: '0 15px 35px rgba(0,0,0,0.12)',
                transform: 'rotate(4deg) translateY(-10px)', border: '1px solid #e3e0d5', zIndex: 2
              }}>
                <div style={{ width: '100%', height: '100%', background: '#ddd', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>💍</div>
              </div>
              <div style={{
                width: '180px', height: '220px', background: 'white', padding: '10px 10px 30px 10px',
                borderRadius: '6px', boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
                transform: 'rotate(12deg) translateX(40px) translateY(10px)', border: '1px solid #e3e0d5', zIndex: 1
              }}>
                <div style={{ width: '100%', height: '100%', background: '#ccc', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>🕺</div>
              </div>
            </div>
          </div>

          {/* Cards dos Pacotes */}
          <div>
            <h4 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e', textAlign: 'center', marginBottom: '2rem', fontWeight: 700 }}>
              Escolha seu Kit de Revelação
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
              {packages.map(pkg => {
                const isSelected = selectedPackage === pkg.id;
                return (
                  <div
                    key={pkg.id}
                    onClick={() => setSelectedPackage(pkg.id)}
                    style={{
                      background: 'white', borderRadius: '24px', padding: '2.5rem',
                      border: isSelected ? '3px solid #E8318A' : '1px solid #f0edf0',
                      boxShadow: isSelected ? '0 12px 30px rgba(232, 49, 138, 0.12)' : '0 4px 12px rgba(0,0,0,0.02)',
                      display: 'flex', flexDirection: 'column', gap: '1.25rem',
                      cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                      position: 'relative'
                    }}
                    onMouseOver={(e) => { if (!isSelected) e.currentTarget.style.transform = 'translateY(-4px)'; }}
                    onMouseOut={(e) => { if (!isSelected) e.currentTarget.style.transform = 'translateY(0)'; }}
                  >
                    {pkg.badge && (
                      <span style={{
                        position: 'absolute', top: '-12px', right: '24px',
                        background: isSelected ? '#E8318A' : '#1a1a2e', color: 'white',
                        fontSize: '0.62rem', fontWeight: 800, padding: '0.3rem 0.85rem',
                        borderRadius: '50px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
                      }}>
                        {pkg.badge}
                      </span>
                    )}

                    <h5 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e', margin: 0, fontWeight: 700 }}>{pkg.name}</h5>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: 0 }}>{pkg.description}</p>
                    
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.2rem', margin: '0.5rem 0' }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1a1a2e' }}>R$</span>
                      <span style={{ fontSize: '2.8rem', fontWeight: 800, color: '#1a1a2e', fontFamily: 'var(--font-display)', lineHeight: 1 }}>{pkg.price}</span>
                      <span style={{ fontSize: '0.85rem', color: '#999', marginLeft: '0.2rem' }}>à vista</span>
                    </div>

                    <div style={{ flex: 1 }}>
                      <ul style={{ paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.88rem', color: '#555' }}>
                        {pkg.features.map((f, i) => <li key={i}>{f}</li>)}
                      </ul>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPackage(pkg.id);
                        setCheckoutStep('select_photos');
                      }}
                      style={{
                        width: '100%', padding: '0.9rem 1.5rem', borderRadius: '50px',
                        background: isSelected ? '#E8318A' : 'transparent',
                        color: isSelected ? 'white' : '#E8318A',
                        border: '2px solid #E8318A', fontWeight: 700, fontSize: '0.95rem',
                        cursor: 'pointer', transition: 'all 0.2s', marginTop: '1rem',
                        boxShadow: isSelected ? '0 4px 15px rgba(232, 49, 138, 0.25)' : 'none'
                      }}
                    >
                      Selecionar este Kit
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* ═══════════ STEP 2: SELECIONAR FOTOS ═══════════════════ */}
      {checkoutStep === 'select_photos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Instruções e Seletor */}
          <div style={{
            background: 'white', border: '1px solid #f0edf0', borderRadius: '20px',
            padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ background: theme.light, color: theme.accent, fontSize: '0.8rem', fontWeight: 700, padding: '0.25rem 0.75rem', borderRadius: '50px' }}>
                  📦 {currentPack.name}
                </span>
                <span style={{ fontSize: '0.9rem', color: '#777', fontWeight: 600 }}>
                  Selecione exatamente <strong>{currentPack.limit}</strong> fotos para revelar
                </span>
              </div>
              <div style={{ fontSize: '1.15rem', color: '#1a1a2e', fontWeight: 700, marginTop: '0.5rem' }}>
                Fotos selecionadas: <span style={{ color: theme.accent }}>{selectedPhotos.size} de {currentPack.limit}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              {/* Seletor de Evento */}
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                style={{
                  padding: '0.6rem 2.5rem 0.6rem 1rem', borderRadius: '50px',
                  border: '2px solid #f0edf0', background: 'white',
                  fontSize: '0.88rem', fontWeight: 600, color: '#1a1a2e', cursor: 'pointer', outline: 'none'
                }}
              >
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>{ev.isLocal ? '📍 ' : ''}{ev.event_name}</option>
                ))}
              </select>

              <button
                onClick={handleSelectAll}
                disabled={photos.length === 0}
                style={{
                  background: 'none', border: `1.5px solid ${theme.accent}`, color: theme.accent,
                  padding: '0.55rem 1.25rem', borderRadius: '50px', fontWeight: 600, fontSize: '0.82rem',
                  cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                {selectedPhotos.size === Math.min(photos.length, currentPack.limit) ? 'Limpar Seleção' : `Selecionar Primeiras ${Math.min(photos.length, currentPack.limit)}`}
              </button>
            </div>
          </div>

          {/* Grid de Seleção */}
          {photos.length === 0 ? (
            <div style={{ background: 'white', borderRadius: '24px', border: '1px dashed #e8c8d4', padding: '6rem 2rem', textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📷</div>
              <h4 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e' }}>Nenhuma foto tirada neste evento</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginTop: '0.35rem' }}>
                Selecione outro evento ou capture fotos para continuar com a impressão.
              </p>
            </div>
          ) : (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: '1.5rem', padding: '0.5rem'
            }}>
              {photos.map((photo) => {
                const isSelected = selectedPhotos.has(photo.id);
                return (
                  <div
                    key={photo.id}
                    onClick={() => handlePhotoSelect(photo.id)}
                    style={{
                      background: 'white', padding: '10px 10px 30px 10px',
                      border: isSelected ? `2.5px solid ${theme.accent}` : '1px solid #e3e0d5',
                      borderRadius: '4px', boxShadow: isSelected ? '0 8px 20px rgba(232, 49, 138, 0.15)' : '0 4px 10px rgba(0,0,0,0.02)',
                      cursor: 'pointer', position: 'relative',
                      transform: isSelected ? 'scale(1.02)' : 'none',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ width: '100%', aspectRatio: '1/1', overflow: 'hidden', borderRadius: '2px', background: '#fafafa' }}>
                      <img src={getPhotoUrl(photo.storage_path)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                    </div>
                    
                    {/* Badge de Selecionado */}
                    {isSelected && (
                      <div style={{
                        position: 'absolute', top: '16px', right: '16px',
                        background: theme.accent, color: 'white', width: '22px', height: '22px',
                        borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.75rem', fontWeight: 'bold', border: '2px solid white',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                      }}>
                        ✓
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 0.1rem', marginTop: '6px', fontSize: '0.6rem', color: '#999', fontFamily: 'monospace' }}>
                      <span>⚡ {photo.filter_used.toUpperCase()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Actions Bottom */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
            <button
              onClick={() => setCheckoutStep('packages')}
              style={{
                border: 'none', background: 'none', color: '#666', fontWeight: 600,
                fontSize: '0.92rem', cursor: 'pointer', padding: '0.5rem 1rem'
              }}
            >
              ← Voltar aos Pacotes
            </button>

            <button
              onClick={() => {
                if (selectedPhotos.size < currentPack.limit && photos.length >= currentPack.limit) {
                  const confirmContinue = window.confirm(`Você selecionou apenas ${selectedPhotos.size} fotos de ${currentPack.limit}. Deseja continuar assim mesmo ou quer preencher seu pacote?`);
                  if (!confirmContinue) return;
                }
                if (selectedPhotos.size === 0) {
                  alert('Selecione pelo menos 1 foto para continuar.');
                  return;
                }
                setCheckoutStep('shipping');
              }}
              style={{
                padding: '0.85rem 2.5rem', borderRadius: '50px', background: theme.accent,
                color: 'white', border: 'none', fontWeight: 700, fontSize: '0.95rem',
                cursor: 'pointer', boxShadow: `0 4px 15px ${theme.accent}33`, transition: 'all 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              Avançar para Entrega
            </button>
          </div>

        </div>
      )}

      {/* ═══════════ STEP 3: FORMULÁRIO DE ENTREGA ═══════════ */}
      {checkoutStep === 'shipping' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
          
          {/* Formulário */}
          <div className="glass-card" style={{ background: 'white', padding: '2.5rem', borderRadius: '24px', border: '1px solid #f0edf0' }}>
            <h4 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e', marginBottom: '1.5rem', fontWeight: 700 }}>
              Endereço de Entrega
            </h4>
            <form onSubmit={handleCheckoutSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">CEP *</label>
                  <input
                    type="text"
                    required
                    placeholder="00000-000"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    className="form-control"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Cidade *</label>
                  <input
                    type="text"
                    required
                    placeholder="Nome da Cidade"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="form-control"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Endereço *</label>
                  <input
                    type="text"
                    required
                    placeholder="Rua, Avenida, etc."
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="form-control"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Número *</label>
                  <input
                    type="text"
                    required
                    placeholder="123"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    className="form-control"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Complemento</label>
                  <input
                    type="text"
                    placeholder="Apto, bloco, casa..."
                    value={complement}
                    onChange={(e) => setComplement(e.target.value)}
                    className="form-control"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Estado *</label>
                  <input
                    type="text"
                    required
                    placeholder="UF"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    maxLength={2}
                    className="form-control"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setCheckoutStep('select_photos')}
                  style={{
                    border: 'none', background: 'none', color: '#666', fontWeight: 600,
                    fontSize: '0.92rem', cursor: 'pointer'
                  }}
                >
                  ← Voltar para as Fotos
                </button>
                
                <button
                  type="submit"
                  style={{
                    padding: '0.85rem 2.5rem', borderRadius: '50px', background: theme.accent,
                    color: 'white', border: 'none', fontWeight: 700, fontSize: '0.95rem',
                    cursor: 'pointer', boxShadow: `0 4px 15px ${theme.accent}33`, transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                  onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  Ir para o Pagamento
                </button>
              </div>

            </form>
          </div>

          {/* Resumo do Pedido */}
          <div className="glass-card" style={{ background: '#fafafc', border: '1px solid #f0edf0', padding: '2rem', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <h4 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e', margin: 0, fontWeight: 700 }}>
              Resumo do Pedido
            </h4>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f0edf0', paddingBottom: '0.85rem', fontSize: '0.9rem' }}>
              <span style={{ color: '#555', fontWeight: 500 }}>{currentPack.name}</span>
              <strong style={{ color: '#1a1a2e' }}>R$ {currentPack.price},00</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f0edf0', paddingBottom: '0.85rem', fontSize: '0.9rem' }}>
              <span style={{ color: '#555', fontWeight: 500 }}>Fotos selecionadas</span>
              <strong style={{ color: theme.accent }}>{selectedPhotos.size} fotos</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f0edf0', paddingBottom: '0.85rem', fontSize: '0.9rem' }}>
              <span style={{ color: '#555', fontWeight: 500 }}>Frete</span>
              <strong style={{ color: '#27AE60' }}>GRÁTIS</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.5rem', fontSize: '1.2rem' }}>
              <span style={{ color: '#1a1a2e', fontWeight: 700 }}>Total do Pedido</span>
              <strong style={{ color: '#1a1a2e', fontSize: '1.6rem', fontFamily: 'var(--font-display)' }}>R$ {currentPack.price},00</strong>
            </div>
            
            {/* Stack de Previews */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem', borderTop: '1px solid #f0edf0', paddingTop: '1.5rem' }}>
              {Array.from(selectedPhotos).slice(0, 8).map(pid => {
                const photo = photos.find(p => p.id === pid);
                if (!photo) return null;
                return (
                  <div key={pid} style={{
                    width: '56px', height: '65px', background: 'white', padding: '3px 3px 10px 3px',
                    border: '1px solid #e3e0d5', borderRadius: '2px', boxShadow: '0 2px 5px rgba(0,0,0,0.03)'
                  }}>
                    <img src={getPhotoUrl(photo.storage_path)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                );
              })}
              {selectedPhotos.size > 8 && (
                <div style={{
                  width: '56px', height: '65px', borderRadius: '2px', background: '#ddd',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.8rem', fontWeight: 'bold', color: '#666'
                }}>
                  +{selectedPhotos.size - 8}
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* ═══════════ STEP 4: PAGAMENTO SIMULADO ═══════════════ */}
      {checkoutStep === 'payment' && (
        <div style={{ maxWidth: '560px', margin: '0 auto', width: '100%' }}>
          <div className="glass-card" style={{ background: 'white', padding: '2.5rem', borderRadius: '24px', border: '1px solid #f0edf0' }}>
            <h4 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e', marginBottom: '1.5rem', fontWeight: 700, textAlign: 'center' }}>
              Selecione a Forma de Pagamento
            </h4>

            {/* Alternância PIX / Cartão */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
              <button
                onClick={() => setPaymentMethod('pix')}
                style={{
                  flex: 1, padding: '1rem', borderRadius: '14px',
                  border: paymentMethod === 'pix' ? `2px solid ${theme.accent}` : '1.5px solid #f0edf0',
                  background: paymentMethod === 'pix' ? theme.light : 'white',
                  color: paymentMethod === 'pix' ? theme.accent : '#555',
                  fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem'
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>📱</span>
                <span>Pagar com PIX</span>
              </button>
              <button
                onClick={() => setPaymentMethod('card')}
                style={{
                  flex: 1, padding: '1rem', borderRadius: '14px',
                  border: paymentMethod === 'card' ? `2px solid ${theme.accent}` : '1.5px solid #f0edf0',
                  background: paymentMethod === 'card' ? theme.light : 'white',
                  color: paymentMethod === 'card' ? theme.accent : '#555',
                  fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem'
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>💳</span>
                <span>Cartão de Crédito</span>
              </button>
            </div>

            {/* Conteúdo PIX */}
            {paymentMethod === 'pix' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                  Escaneie o QR Code abaixo com o aplicativo do seu banco para realizar o pagamento instantâneo.
                </p>
                
                {/* QR Code Pix Mock */}
                <div style={{
                  width: '160px', height: '160px', border: '1.5px solid #f0edf0',
                  padding: '0.75rem', background: 'white', borderRadius: '12px'
                }}>
                  <div style={{
                    width: '100%', height: '100%',
                    backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100%25\' height=\'100%25\' viewBox=\'0 0 100 100\'%3E%3Cpath d=\'M0 0h30v10H10v20H0V0zm70 0h30v30H90V10H70V0zM0 70h10v20h20v10H0V70zm100 0v30H70v-10h20V70h10zM30 30h40v40H30V30zm10 10v20h20V40H40z\' fill=\'%231a1a2e\'/%3E%3C/svg%3E")',
                    backgroundSize: 'cover'
                  }} />
                </div>

                <div style={{ background: '#f8f6f9', padding: '0.75rem 1rem', borderRadius: '12px', width: '100%', fontSize: '0.8rem', fontFamily: 'monospace', wordBreak: 'break-all', border: '1px solid #f0edf0' }}>
                  00020101021226830014br.gov.bcb.pix2561pix.camdescartavel.com/revelacao/order938472948
                </div>

                <span style={{ fontSize: '0.8rem', color: '#999' }}>A aprovação é feita de forma imediata.</span>
              </div>
            )}

            {/* Conteúdo Cartão */}
            {paymentMethod === 'card' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Número do Cartão</label>
                  <input type="text" placeholder="0000 0000 0000 0000" className="form-control" />
                </div>
                <div className="form-group">
                  <label className="form-label">Nome Impresso no Cartão</label>
                  <input type="text" placeholder="JOÃO S SILVA" className="form-control" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Vencimento</label>
                    <input type="text" placeholder="MM/AA" className="form-control" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">CVV</label>
                    <input type="text" placeholder="123" className="form-control" />
                  </div>
                </div>
              </div>
            )}

            {/* Total e Confirmação */}
            <div style={{ marginTop: '2rem', borderTop: '1px solid #f0edf0', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#555', fontWeight: 600 }}>Valor total a pagar:</span>
                <strong style={{ fontSize: '1.8rem', color: '#1a1a2e', fontFamily: 'var(--font-display)' }}>R$ {currentPack.price},00</strong>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <button
                  onClick={() => setCheckoutStep('shipping')}
                  style={{
                    flex: 1, padding: '0.85rem', borderRadius: '50px', background: 'none',
                    border: '1.5px solid #f0edf0', color: '#666', fontWeight: 600,
                    fontSize: '0.92rem', cursor: 'pointer'
                  }}
                >
                  ← Endereço
                </button>
                <button
                  onClick={handlePaymentSubmit}
                  disabled={isPaying}
                  style={{
                    flex: 2, padding: '0.85rem 1.5rem', borderRadius: '50px',
                    background: theme.accent, color: 'white', border: 'none',
                    fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                    boxShadow: `0 4px 15px ${theme.accent}33`, transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  {isPaying ? 'Processando...' : 'Confirmar e Pagar'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ═══════════ STEP 5: SUCESSO ═════════════════════════ */}
      {checkoutStep === 'success' && (
        <div style={{ maxWidth: '520px', margin: '0 auto', width: '100%' }}>
          <div className="glass-card" style={{ background: 'white', padding: '3.5rem 2.5rem', borderRadius: '24px', border: '1px solid #f0edf0', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%', background: '#E8F8F5',
              color: '#27AE60', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '2rem', border: '3px solid #27AE60'
            }}>
              ✓
            </div>
            
            <h4 style={{ fontSize: '1.8rem', fontFamily: 'var(--font-serif)', color: '#1a1a2e', fontWeight: 700, margin: 0 }}>
              Pedido Realizado com Sucesso!
            </h4>
            
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, margin: 0 }}>
              Parabéns! Nós recebemos seu pedido de revelação. As <strong>{selectedPhotos.size} fotos</strong> selecionadas foram enviadas para o nosso laboratório de impressão. Em breve você receberá o código de rastreamento no seu e-mail.
            </p>

            <div style={{ background: '#f8f6f9', padding: '1rem 1.5rem', borderRadius: '16px', width: '100%', textAlign: 'left', border: '1px solid #f0edf0' }}>
              <div style={{ fontSize: '0.85rem', color: '#777', marginBottom: '0.25rem' }}>Entrega Estimada:</div>
              <strong style={{ color: '#1a1a2e' }}>5 a 8 dias úteis</strong>
              <div style={{ fontSize: '0.85rem', color: '#777', marginTop: '0.5rem', marginBottom: '0.25rem' }}>Endereço de envio:</div>
              <span style={{ color: '#1a1a2e', fontSize: '0.85rem' }}>{address}, {number} — {city}/{state}</span>
            </div>

            <button
              onClick={() => {
                setCheckoutStep('packages');
                setSelectedPhotos(new Set());
              }}
              style={{
                width: '100%', padding: '0.85rem 1.5rem', borderRadius: '50px',
                background: theme.accent, color: 'white', border: 'none',
                fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                boxShadow: `0 4px 15px ${theme.accent}33`, transition: 'all 0.2s', marginTop: '1rem'
              }}
            >
              Comprar Novo Kit
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Sub-componentes do PrintManager ──────────────────────────

function StepBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <span style={{
      fontSize: '0.78rem', fontWeight: 700, padding: '0.3rem 0.85rem', borderRadius: '50px',
      background: active ? '#E8318A' : 'transparent',
      color: active ? 'white' : '#999',
      transition: 'all 0.25s'
    }}>
      {label}
    </span>
  );
}

function BenefitItem({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
      <div style={{ fontSize: '1.5rem' }}>{emoji}</div>
      <div>
        <h5 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1a1a2e', margin: 0 }}>{title}</h5>
        <p style={{ color: '#777', fontSize: '0.78rem', margin: '0.1rem 0 0 0', lineHeight: 1.4 }}>{desc}</p>
      </div>
    </div>
  );
}
