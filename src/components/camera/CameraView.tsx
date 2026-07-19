import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { initCamera, stopCamera, captureFrame } from '../../lib/camera';
import { applyAnalogFilter, type FilterPreset } from '../../lib/filters';
import { compressImage } from '../../lib/compression';
import MissionCard from './MissionCard';
import RankingCard from './RankingCard';
import CollectiveGoal from './CollectiveGoal';
import AchievementToast from './AchievementToast';
import MissionPicker from './MissionPicker';
import { checkNewAchievements, syncGuestProfile, ACHIEVEMENT_DEFINITIONS } from '../../lib/gamification';

interface Event {
  id: string;
  event_name: string;
  event_date: string;
  photo_limit_per_user: number;
  slug: string;
  is_active: boolean;
  gamification_enabled?: boolean;
  photo_goal?: number | null;
  camera_start_time?: string | null;
  camera_end_time?: string | null;
  reveal_time?: string | null;
}

interface Props {
  event: Event;
}

type ViewStep = 'get_name' | 'choose_action' | 'live_camera' | 'upload_preview';

export default function CameraView({ event }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Ref que mantém o stream ativo entre mudanças de step (evita bloqueio da câmera pelo navegador)
  const activeStreamRef = useRef<MediaStream | null>(null);

  const [viewStep, setViewStep] = useState<ViewStep>('get_name');
  const [guestName, setGuestName] = useState('');
  const [guestId, setGuestId] = useState('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [filter, setFilter] = useState<FilterPreset>('disposable');
  const [photosTaken, setPhotosTaken] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [screenFlashVisible, setScreenFlashVisible] = useState(false);
  const [zoom, setZoom] = useState<1.0 | 1.5 | 2.0>(1.0);

  // Estados de Gamificação
  const [gamificationEnabled, setGamificationEnabled] = useState(false);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [completedChallenges, setCompletedChallenges] = useState<string[]>([]);
  const [ranking, setRanking] = useState<any[]>([]);
  const [achievementToast, setAchievementToast] = useState<any | null>(null);
  const [showMissionPicker, setShowMissionPicker] = useState(false);
  const [photoGoal, setPhotoGoal] = useState<number | null>(null);
  const [eventPhotosCount, setEventPhotosCount] = useState(0);
  const [recentPhotoId, setRecentPhotoId] = useState<string | null>(null);
  const [recentPhotoUrl, setRecentPhotoUrl] = useState<string | null>(null);
  const [existingAchievements, setExistingAchievements] = useState<string[]>([]);

  // Estados específicos para upload de galeria
  const [galleryImageSrc, setGalleryImageSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Inicializar Guest ID e Guest Name
  useEffect(() => {
    let id = localStorage.getItem('guest_id');
    if (!id) {
      id = `guest_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
      localStorage.setItem('guest_id', id);
    }
    setGuestId(id);

    const savedName = localStorage.getItem('guest_name');
    if (savedName) {
      setGuestName(savedName);
      setViewStep('choose_action');
    } else {
      setViewStep('get_name');
    }
  }, []);

  // 2. Buscar contagem de fotos já tiradas por este convidado neste evento
  useEffect(() => {
    if (!guestId || !event.id) return;

    async function fetchGuestPhotosCount() {
      if ((event as any).isLocal) {
        const photosCountStr = localStorage.getItem(`photos_${event.id}_${guestId}`);
        const localCount = photosCountStr ? JSON.parse(photosCountStr).length : 0;
        setPhotosTaken(localCount);
        return;
      }

      try {
        const { count, error } = await supabase
          .from('photos')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', event.id)
          .eq('guest_id', guestId);

        if (error) throw error;
        setPhotosTaken(count || 0);
      } catch (err) {
        console.error('Erro ao buscar contagem de fotos:', err);
      }
    }

    fetchGuestPhotosCount();
  }, [guestId, event.id]);

  // Carregar dados de gamificação
  useEffect(() => {
    if (!event.id || !guestId) return;

    setGamificationEnabled(event.gamification_enabled ?? true);
    setPhotoGoal(event.photo_goal ?? null);

    async function loadGamificationData() {
      try {
        // 1. Buscar total de fotos do evento
        const { count: totalCount } = await supabase
          .from('photos')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', event.id);
        setEventPhotosCount(totalCount || 0);

        // 2. Buscar missões
        const { data: challs } = await supabase
          .from('challenges')
          .select('*')
          .eq('event_id', event.id)
          .order('sort_order', { ascending: true });
        setChallenges(challs || []);

        // 3. Buscar completamentos deste convidado
        const { data: comps } = await supabase
          .from('challenge_completions')
          .select('challenge_id')
          .eq('event_id', event.id)
          .eq('guest_id', guestId);
        setCompletedChallenges(comps?.map((c) => c.challenge_id) || []);

        // 4. Buscar conquistas desbloqueadas por este convidado
        const { data: achs } = await supabase
          .from('guest_achievements')
          .select('achievement_key')
          .eq('event_id', event.id)
          .eq('guest_id', guestId);
        setExistingAchievements(achs?.map((a) => a.achievement_key) || []);

        // 5. Buscar ranking
        const { data: rnk } = await supabase
          .from('guest_profiles')
          .select('*')
          .eq('event_id', event.id)
          .order('xp_points', { ascending: false });
        setRanking(rnk || []);

        // Criar perfil se não existir no ranking e se o nome estiver preenchido
        if (guestName) {
          const hasProfile = rnk?.some((r) => r.guest_id === guestId);
          if (!hasProfile) {
            await syncGuestProfile(
              event.id,
              guestId,
              guestName,
              photosTaken,
              comps?.length || 0,
              []
            );
            // Recarrega ranking
            const { data: freshRnk } = await supabase
              .from('guest_profiles')
              .select('*')
              .eq('event_id', event.id)
              .order('xp_points', { ascending: false });
            setRanking(freshRnk || []);
          }
        }
      } catch (err) {
        console.error('Erro ao carregar dados de gamificação:', err);
      }
    }

    loadGamificationData();
  }, [event.id, guestId, guestName, photosTaken]);

  // Realtime para fotos e ranking
  useEffect(() => {
    if (!event.id) return;

    const photosChannel = supabase
      .channel(`event-photos-count-${event.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'photos', filter: `event_id=eq.${event.id}` },
        () => {
          setEventPhotosCount((prev) => prev + 1);
        }
      )
      .subscribe();

    const rankingChannel = supabase
      .channel(`event-ranking-${event.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'guest_profiles', filter: `event_id=eq.${event.id}` },
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

    return () => {
      supabase.removeChannel(photosChannel);
      supabase.removeChannel(rankingChannel);
    };
  }, [event.id]);

  // Função para finalizar o fluxo de foto (conquistas e ranking)
  const handleFinishPhotoFlow = async (challengeId: string | null, photoId: string) => {
    setIsUploading(true);
    try {
      let currentCompsCount = completedChallenges.length;

      if (challengeId) {
        const { error: compError } = await supabase.from('challenge_completions').insert([
          {
            challenge_id: challengeId,
            event_id: event.id,
            guest_id: guestId,
            photo_id: photoId
          }
        ]);

        if (!compError) {
          setCompletedChallenges((prev) => [...prev, challengeId]);
          currentCompsCount += 1;
        }
      }

      // Recarrega contagem do convidado
      const { data: userPhotos } = await supabase
        .from('photos')
        .select('*')
        .eq('event_id', event.id)
        .eq('guest_id', guestId);
      const allPhotos = userPhotos || [];

      // Checa novas conquistas
      const newAchs = await checkNewAchievements(
        event.id,
        guestId,
        allPhotos,
        currentCompsCount,
        existingAchievements
      );

      const updatedAchievements = [...existingAchievements, ...newAchs.map((a) => a.key)];
      setExistingAchievements(updatedAchievements);

      if (newAchs.length > 0) {
        setAchievementToast(newAchs[0]);
      }

      // Sincroniza XP no Supabase
      const resolvedAchs = updatedAchievements
        .map((k) => ACHIEVEMENT_DEFINITIONS[k])
        .filter(Boolean);

      await syncGuestProfile(
        event.id,
        guestId,
        guestName,
        allPhotos.length,
        currentCompsCount,
        resolvedAchs
      );

    } catch (err) {
      console.error('Erro ao finalizar fluxo:', err);
    } finally {
      setIsUploading(false);
      setShowMissionPicker(false);
      setRecentPhotoId(null);
      setRecentPhotoUrl(null);
      setViewStep(prev => prev === 'upload_preview' ? 'choose_action' : prev);
      setTimeout(() => {
        setPreviewUrl(null);
      }, 3000);
    }
  };

  // Helper: inicia câmera e salva o stream no ref
  const startCameraStream = async () => {
    if (!videoRef.current) return;
    // Parar stream anterior se existir
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(t => t.stop());
      activeStreamRef.current = null;
    }
    try {
      setErrorMsg('');
      setCameraReady(false);
      const stream = await initCamera(videoRef.current, facingMode);
      activeStreamRef.current = stream;
      setCameraReady(true);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Não foi possível acessar a câmera. Verifique se deu permissão de acesso ao navegador.');
    }
  };

  // 3. Inicializar a câmera — mantém o stream vivo entre steps para não bloquear navegador
  useEffect(() => {
    // Só inicia/reinicia quando está no live_camera e não tem stream ativo
    if (viewStep === 'live_camera' && !activeStreamRef.current) {
      startCameraStream();
    }
    // Cleanup: só mata o stream quando o componente desmonta de verdade
    return () => {};
  }, [facingMode, viewStep]);

  // Cleanup final quando o componente sai da DOM
  useEffect(() => {
    return () => {
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach(t => t.stop());
        activeStreamRef.current = null;
      }
      if (videoRef.current) stopCamera(videoRef.current);
    };
  }, []);

  // Salvar nome do convidado e pedir permissão direto
  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) return;
    localStorage.setItem('guest_name', guestName.trim());
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      setViewStep('live_camera');
    } catch (err) {
      console.error('Permissão negada ou erro na câmera:', err);
      alert('⚠️ Para tirar fotos, você precisa permitir o acesso à câmera no seu navegador.');
      setViewStep('choose_action');
    }
  };

  // Alternar câmera frontal/traseira — reinicia o stream com a nova câmera
  const handleSwitchCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
    // Forçar limpeza do stream para que o useEffect reinicie com novo facingMode
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(t => t.stop());
      activeStreamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  };

  // Obter filtro CSS correspondente para o visor de preview em tempo real
  const getVideoFilterStyle = () => {
    switch (filter) {
      case 'kodak_gold':
        return 'sepia(0.2) saturate(1.4) contrast(1.1) brightness(1.05)';
      case 'fuji_superia':
        return 'hue-rotate(-10deg) saturate(1.2) contrast(1.05) brightness(0.95)';
      case 'disposable':
        return 'contrast(1.2) brightness(1.1) sepia(0.1)';
      default:
        return 'none';
    }
  };

  // Disparar Câmera
  const handleCapture = async () => {
    if (!cameraReady || isCapturing || isUploading || !videoRef.current || !canvasRef.current) return;

    if (photosTaken >= event.photo_limit_per_user) {
      alert('Você atingiu o limite de fotos permitido para este evento!');
      return;
    }

    setIsCapturing(true);
    setTimeout(() => setIsCapturing(false), 300);

    // Flash: câmera traseira usa torch reiniciando stream; frontal usa screen flash
    if (flashOn && videoRef.current) {
      if (facingMode === 'environment' && activeStreamRef.current) {
        // Tenta ativar torch via applyConstraints
        try {
          const track = activeStreamRef.current.getVideoTracks()[0];
          await track?.applyConstraints({ advanced: [{ torch: true } as any] });
          await new Promise(r => setTimeout(r, 150));
        } catch {
          // Torch não suportado — tenta reiniciar stream com torch nas constraints
          try {
            if (activeStreamRef.current) {
              activeStreamRef.current.getTracks().forEach(t => t.stop());
            }
            const torchStream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: 'environment', advanced: [{ torch: true }] } as any
            });
            activeStreamRef.current = torchStream;
            if (videoRef.current) {
              videoRef.current.srcObject = torchStream;
              await videoRef.current.play();
            }
            await new Promise(r => setTimeout(r, 200));
          } catch { /* dispositivo não suporta torch */ }
        }
      } else if (facingMode === 'user') {
        // Screen flash para selfie
        setScreenFlashVisible(true);
        await new Promise(r => setTimeout(r, 200));
      }
    }

    captureFrame(videoRef.current, canvasRef.current);

    // Desligar torch após captura
    if (flashOn && facingMode === 'environment' && activeStreamRef.current) {
      try {
        const track = activeStreamRef.current.getVideoTracks()[0];
        await track?.applyConstraints({ advanced: [{ torch: false } as any] });
      } catch { /* silencioso */ }
    }
    if (screenFlashVisible) {
      setScreenFlashVisible(false);
    }

    setIsUploading(true);

    try {
      const canvas = canvasRef.current;
      // Filtros removidos conforme pedido do usuário para manter a qualidade original
      // await applyAnalogFilter(canvas, filter);

      const localPreviewUrl = canvas.toDataURL('image/jpeg', 0.95);
      setPreviewUrl(localPreviewUrl);

      const photoBlob = await compressImage(canvas, 0.92, 2400);

      const photoId = `photo_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
      const storagePath = `${event.id}/${photoId}.jpg`;

      let newPhotoId = `local_photo_${Date.now()}`;

      // Se for evento local (testando), pula o Supabase
      // Se for evento local (testando), pula o Supabase
      if (!(event as any).isLocal) {
        const { error: uploadError } = await supabase.storage
          .from('event-photos')
          .upload(storagePath, photoBlob, {
            contentType: 'image/jpeg',
            cacheControl: '3600',
          });

        if (uploadError) throw uploadError;

        const { data: newPhoto, error: dbError } = await supabase.from('photos').insert([
          {
            event_id: event.id,
            storage_path: storagePath,
            guest_id: guestId,
            filter_used: filter,
          },
        ]).select().single();

        if (dbError) throw dbError;
        newPhotoId = newPhoto.id;
      } else {
        // Evento Local: salvar no localStorage para o painel conseguir ver
        const localPhotosRaw = localStorage.getItem(`local_photos_${event.id}`);
        const localPhotos = localPhotosRaw ? JSON.parse(localPhotosRaw) : [];
        const newLocalPhoto = {
          id: newPhotoId,
          event_id: event.id,
          guest_id: guestId,
          filter_used: filter,
          storage_path: localPreviewUrl,
          created_at: new Date().toISOString()
        };
        localPhotos.unshift(newLocalPhoto);
        localStorage.setItem(`local_photos_${event.id}`, JSON.stringify(localPhotos));
      }

      setPhotosTaken((prev) => prev + 1);

      if (gamificationEnabled && challenges.length > 0) {
        setRecentPhotoId(newPhotoId);
        setRecentPhotoUrl(localPreviewUrl);
        setIsUploading(false);
        setShowMissionPicker(true);
      } else {
        await handleFinishPhotoFlow(null, newPhotoId);
      }
    } catch (err: any) {
      console.error(err);
      alert('Erro ao enviar foto. Verifique sua conexão.');
      setPreviewUrl(null);
      setIsUploading(false);
      setViewStep('choose_action');
    }
  };

  // Upload da Galeria do Celular
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setGalleryImageSrc(event.target.result as string);
        setViewStep('upload_preview');
      }
    };
    reader.readAsDataURL(file);
  };

  // Processar e Revelar imagem da galeria
  const handleUploadGalleryImage = async () => {
    if (!galleryImageSrc || !canvasRef.current || isUploading) return;

    if (photosTaken >= event.photo_limit_per_user) {
      alert('Você atingiu o limite de fotos permitido para este evento!');
      return;
    }

    setIsUploading(true);

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Erro ao carregar imagem selecionada'));
        img.src = galleryImageSrc;
      });

      // Redimensionar mantendo proporção
      const maxDim = 1920;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      canvas.width = w;
      canvas.height = h;
      ctx?.drawImage(img, 0, 0, w, h);

      // Aplicar o filtro vintage
      // await applyAnalogFilter(canvas, filter);

      // Criar URL de preview rápido
      const localPreviewUrl = canvas.toDataURL('image/jpeg', 0.95);
      setPreviewUrl(localPreviewUrl);

      // Comprimir
      const photoBlob = await compressImage(canvas, 0.92, 2400);

      const photoId = `photo_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
      const storagePath = `${event.id}/${photoId}.jpg`;

      let newPhotoId = `local_photo_${Date.now()}`;

      // Se for evento local (testando), pula o Supabase
      // Se for evento local (testando), pula o Supabase
      if (!(event as any).isLocal) {
        const { error: uploadError } = await supabase.storage
          .from('event-photos')
          .upload(storagePath, photoBlob, {
            contentType: 'image/jpeg',
            cacheControl: '3600',
          });

        if (uploadError) throw uploadError;

        const { data: newPhoto, error: dbError } = await supabase.from('photos').insert([
          {
            event_id: event.id,
            storage_path: storagePath,
            guest_id: guestId,
            filter_used: filter,
          },
        ]).select().single();

        if (dbError) throw dbError;
        newPhotoId = newPhoto.id;
      } else {
        // Evento Local: salvar no localStorage
        const localPhotosRaw = localStorage.getItem(`local_photos_${event.id}`);
        const localPhotos = localPhotosRaw ? JSON.parse(localPhotosRaw) : [];
        const newLocalPhoto = {
          id: newPhotoId,
          event_id: event.id,
          guest_id: guestId,
          filter_used: filter,
          storage_path: localPreviewUrl,
          created_at: new Date().toISOString()
        };
        localPhotos.unshift(newLocalPhoto);
        localStorage.setItem(`local_photos_${event.id}`, JSON.stringify(localPhotos));
      }

      setPhotosTaken((prev) => prev + 1);

      if (gamificationEnabled && challenges.length > 0) {
        setRecentPhotoId(newPhotoId);
        setRecentPhotoUrl(localPreviewUrl);
        setIsUploading(false);
        setGalleryImageSrc(null);
        setShowMissionPicker(true);
      } else {
        await handleFinishPhotoFlow(null, newPhotoId);
      }
    } catch (err: any) {
      console.error(err);
      alert('Erro ao enviar imagem.');
      setPreviewUrl(null);
      setIsUploading(false);
      setGalleryImageSrc(null);
      setViewStep('choose_action');
    }
  };

  const photoLimit = event.photo_limit_per_user || 30;
  const remainingPhotos = Math.max(0, photoLimit - photosTaken);

  // ================= RENDER DE ACORDO COM O STEP =================

  // STEP 1: SOLICITAR NOME DO CONVIDADO
  if (viewStep === 'get_name') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f7', padding: '1.5rem', fontFamily: 'var(--font-sans)' }}>
        <div style={{ width: '100%', maxWidth: '380px', background: 'white', borderRadius: '16px', padding: '2.5rem 2rem', boxShadow: 'var(--shadow-premium)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1.5rem', border: '1px solid rgba(0,0,0,0.05)' }} className="animate-fade-in">
          <div>
            <div style={{ width: '56px', height: '56px', margin: '0 auto', backgroundColor: '#f9f9fa', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', border: '1px solid #eaeaea' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#c5a880' }}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
            </div>
            <h3 style={{ fontSize: '1.75rem', fontFamily: 'var(--font-serif)', color: 'var(--text-primary)', marginTop: '0.5rem', lineHeight: 1.2 }}>
              Bem-vindo ao evento
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.5rem', fontWeight: 500 }}>
              {event.event_name}
            </p>
          </div>

          <form onSubmit={handleSaveName} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ textAlign: 'left' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
                Como podemos te chamar?
              </label>
              <input
                type="text"
                required
                placeholder="Seu nome"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.85rem 1.25rem',
                  border: '1px solid #e5e5e5',
                  borderRadius: '12px',
                  fontSize: '0.95rem',
                  outline: 'none',
                  backgroundColor: '#fafafa',
                  transition: 'all 0.2s',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#1d1d1f'; e.currentTarget.style.backgroundColor = 'white'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e5e5'; e.currentTarget.style.backgroundColor = '#fafafa'; }}
              />
            </div>
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '0.9rem',
                backgroundColor: '#1d1d1f',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#000')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1d1d1f')}
            >
              Acessar Câmera
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Solicita permissão da câmera ativamente durante o clique do usuário (necessário para iOS/Safari não bloquear)
  const handleOpenCameraClick = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // Para o stream temporário, a inicialização real ocorre no useEffect com os constraints corretos
      stream.getTracks().forEach(track => track.stop());
      setViewStep('live_camera');
    } catch (err) {
      console.error('Permissão negada ou erro na câmera:', err);
      alert('⚠️ Para tirar fotos, você precisa permitir o acesso à câmera no seu navegador.');
    }
  };

  // STEP 2: ESCOLHER AÇÃO (Tirar Foto ou Galeria)
  if (viewStep === 'choose_action') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f5f5f7', padding: '1rem 1rem 3rem', fontFamily: 'var(--font-sans)', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: '400px', background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: 'var(--shadow-premium)', display: 'flex', flexDirection: 'column', gap: '1.25rem', margin: '0 auto', border: '1px solid rgba(0,0,0,0.05)' }} className="animate-fade-in">
          
          {/* Alerta de conquista */}
          {achievementToast && (
            <AchievementToast
              achievement={achievementToast}
              onClose={() => setAchievementToast(null)}
            />
          )}

          {/* Modal de Missões pós-captura */}
          {showMissionPicker && recentPhotoUrl && recentPhotoId && (
            <MissionPicker
              challenges={challenges}
              completedIds={completedChallenges}
              photoDataUrl={recentPhotoUrl}
              onSelect={(challengeId) => handleFinishPhotoFlow(challengeId, recentPhotoId)}
            />
          )}

          {/* Sucesso imediato após tirar/subir foto (revelando) */}
          {isUploading && (
            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', borderRadius: '16px', zIndex: 10 }}>
              <div style={{ width: '40px', height: '40px', border: '3px solid #eaeaea', borderTopColor: '#1d1d1f', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', display: 'block' }}>Revelando foto...</span>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Aguarde um momento.</p>
              </div>
            </div>
          )}

          {previewUrl && (
            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', borderRadius: '16px', zIndex: 10, padding: '2rem' }}>
              <div style={{ width: '56px', height: '56px', backgroundColor: '#f9f9fa', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #eaeaea' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#10b981' }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <span style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1d1d1f', fontFamily: 'var(--font-serif)' }}>Prontinho!</span>
              <img src={previewUrl} style={{ width: '180px', height: '240px', objectFit: 'cover', borderRadius: '8px', border: '8px solid white', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }} alt="Foto revelada" />
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Sua foto já está no álbum.</p>
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
            <h3 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-serif)', color: 'var(--text-primary)', lineHeight: 1.2 }}>
              Olá, <span style={{ color: '#c5a880' }}>{guestName}</span>.
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.35rem' }}>
              Grave suas memórias deste dia especial.
            </p>
          </div>

          {/* Contador de Fotos */}
          <div style={{ background: '#f9f9fa', borderRadius: '12px', padding: '1.25rem 1rem', textAlign: 'center', border: '1px solid #eaeaea' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Cliques Feitos</div>
            <div style={{ fontSize: '2rem', fontWeight: 400, color: '#1d1d1f', fontFamily: 'var(--font-serif)', margin: '0.25rem 0' }}>
              {photosTaken} <span style={{ fontSize: '1rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)' }}>/ {event.photo_limit_per_user}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Você ainda tem {remainingPhotos} fotos disponíveis.
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
            {remainingPhotos > 0 ? (
              <>
                {/* Opção A: Câmera */}
                <button
                  onClick={handleOpenCameraClick}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '0.95rem',
                    backgroundColor: '#1d1d1f',
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '0.95rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#000')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1d1d1f')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
                  Abrir a Câmera
                </button>

                {/* Opção B: Enviar do arquivo */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '0.95rem',
                    backgroundColor: 'white',
                    color: '#1d1d1f',
                    border: '1px solid #eaeaea',
                    borderRadius: '12px',
                    fontSize: '0.95rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f9f9fa')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'white')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  Enviar do Rolo de Câmera
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  style={{ display: 'none' }}
                />
              </>
            ) : (
              <div style={{ textAlign: 'center', color: '#1d1d1f', fontWeight: 500, fontSize: '0.9rem', padding: '1rem', backgroundColor: '#f9f9fa', borderRadius: '8px', border: '1px solid #eaeaea' }}>
                Você esgotou todos os seus cliques para este evento!
              </div>
            )}
          </div>

          {/* ELEMENTOS DE GAMIFICAÇÃO */}
          {gamificationEnabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', borderTop: '1px solid #f0edf0', paddingTop: '1.25rem' }}>
              
              {/* Meta Coletiva */}
              {photoGoal && (
                <CollectiveGoal
                  currentPhotos={eventPhotosCount}
                  goalPhotos={photoGoal}
                />
              )}

              {/* Missões */}
              {challenges.length > 0 && (
                <MissionCard
                  challenges={challenges}
                  completedIds={completedChallenges}
                />
              )}

              {/* Ranking ao Vivo */}
              {ranking.length > 0 && (
                <RankingCard
                  ranking={ranking}
                  currentGuestId={guestId}
                />
              )}

              {/* Minhas Conquistas */}
              <div className="gamification-card" style={{ padding: '1.25rem', background: 'white', borderRadius: '16px', border: '1px solid #eaeaea', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div>
                  <span style={{ fontSize: '0.65rem', color: '#c5a880', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block' }}>Conquistas</span>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '2px 0 0', color: '#1d1d1f', fontFamily: 'var(--font-serif)' }}>Seus Badges</h4>
                </div>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', justifyContent: 'center' }}>
                  {Object.values(ACHIEVEMENT_DEFINITIONS).map((ach) => {
                    const isUnlocked = existingAchievements.includes(ach.key);
                    return (
                      <div
                        key={ach.key}
                        title={`${ach.name}: ${ach.description} (${ach.xp} XP)`}
                        style={{
                          width: '52px',
                          height: '52px',
                          borderRadius: '50%',
                          backgroundColor: isUnlocked ? '#fdfbf7' : '#f9f9fa',
                          border: isUnlocked ? '1px solid #c5a880' : '1px dashed #d1d5db',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.6rem',
                          filter: isUnlocked ? 'none' : 'grayscale(100%) opacity(40%)',
                          position: 'relative',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        {ach.emoji}
                        {isUnlocked && (
                          <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', backgroundColor: '#1d1d1f', color: 'white', fontSize: '0.55rem', fontWeight: 'bold', padding: '1px 4px', borderRadius: '4px', lineHeight: 1 }}>
                            +{ach.xp}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}

          <div style={{ textAlign: 'center', fontSize: '0.75rem', marginTop: '0.5rem' }}>
            <button
              onClick={() => {
                localStorage.removeItem('guest_name');
                setViewStep('get_name');
              }}
              style={{ background: 'none', border: 'none', color: '#999', textDecoration: 'underline', cursor: 'pointer' }}
            >
              Alterar nome do convidado
            </button>
          </div>
        </div>
      </div>
    );
  }

  // STEP 3: VISUALIZADOR DA CÂMERA LIVE — Fullscreen 9:16
  if (viewStep === 'live_camera') {
    return (
      <div className="camera-fullscreen">

        {/* ── Vídeo fullscreen ── */}
        {!errorMsg && (
          <video
            ref={videoRef}
            className={`camera-video ${facingMode === 'user' ? 'front' : ''}`}
            style={{
              filter: getVideoFilterStyle(),
              transform: `${facingMode === 'user' ? 'scaleX(-1) ' : ''}scale(${zoom})`,
              transition: 'transform 0.2s ease',
            }}
            playsInline
            muted
            autoPlay
          />
        )}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* ── Flash de captura (animação) ── */}
        <div className={`flash-effect ${isCapturing ? 'flash-active' : ''}`} />

        {/* ── Screen Flash (tela branca para selfie flash) ── */}
        {screenFlashVisible && (
          <div style={{ position: 'absolute', inset: 0, backgroundColor: '#ffffff', zIndex: 35, pointerEvents: 'none' }} />
        )}

        {/* ── Erro de câmera ── */}
        {errorMsg && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '2rem', textAlign: 'center', color: 'white', fontSize: '0.9rem',
          }}>
            {errorMsg}
          </div>
        )}

        {/* ── Aviso sutil de que está salvando (não bloqueante) ── */}
        {isUploading && (
          <div style={{ position: 'absolute', top: '16px', left: '50%', transform: 'translateX(-50%)', backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', padding: '6px 16px', borderRadius: '20px', fontSize: '0.8rem', zIndex: 40, backdropFilter: 'blur(4px)' }}>
            Salvando...
          </div>
        )}

        {/* ── TopBar ── */}
        <div className="cam-topbar">
          <button className="cam-icon-btn" style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', boxShadow: 'none' }} onClick={() => setViewStep('choose_action')}>
            ✕
          </button>

          <div className="cam-topbar-center">
            <span className="cam-topbar-title">{event.event_name}</span>
            <span className="cam-topbar-sub">Termina às {event.camera_end_time ? new Date(event.camera_end_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '23:59'}</span>
          </div>

          {/* Placeholder invisível para centralizar flex-between */}
          <div style={{ width: '36px' }}></div>
        </div>

        {/* ── Controles flutuantes (flash · zoom · flip) ── */}
        <div className="cam-floating-controls">
          {/* Flash toggle */}
          <button
            className="cam-icon-btn"
            onClick={() => setFlashOn((v) => !v)}
            style={{ background: flashOn ? 'rgba(255,210,0,0.25)' : 'transparent', border: 'none', boxShadow: 'none' }}
            title="Flash"
          >
            {flashOn ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#fbbf24' }}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(255,255,255,0.7)' }}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/><line x1="1" y1="1" x2="23" y2="23" stroke="rgba(255,255,255,0.7)" strokeWidth="2"/></svg>
            )}
          </button>

          {/* Zoom pills */}
          <div className="cam-zoom-pills">
            <button
              className={`cam-zoom-pill ${zoom === 1.0 ? 'active' : ''}`}
              onClick={() => setZoom(1.0)}
            >
              1×
            </button>
            <button
              className={`cam-zoom-pill ${zoom === 2.0 ? 'active' : ''}`}
              onClick={() => setZoom(2.0)}
            >
              2
            </button>
          </div>

          {/* Flip câmera */}
          <button
            className="cam-icon-btn"
            onClick={handleSwitchCamera}
            disabled={!cameraReady || isUploading}
            title="Alternar câmera"
            style={{ background: 'transparent', border: 'none', boxShadow: 'none' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'white' }}><path d="M16 3h5v5"/><path d="M8 21H3v-5"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
          </button>
        </div>

        {/* ── BottomBar ── */}
        <div className="cam-bottombar">
          {/* Contador de fotos (Referência visual iOS) */}
          <div className="cam-left-counter">
            <span className="cam-left-counter-num">{remainingPhotos}</span>
            <div className="cam-left-counter-text">
              <span>FOTOS</span>
              <span>RESTANTES</span>
            </div>
          </div>

          {/* Shutter */}
          <button
            className="cam-shutter"
            onClick={handleCapture}
            disabled={!cameraReady || isUploading || remainingPhotos <= 0}
            title="Tirar foto"
          />

          {/* Thumbnail da última foto (Polaroids Stack) */}
          <div className="cam-polaroids-stack" onClick={() => previewUrl && setViewStep('upload_preview')}>
            <div className="polaroid-placeholder layer-1"></div>
            <div className="polaroid-placeholder layer-2"></div>
            {previewUrl ? (
              <img src={previewUrl} className="layer-3" alt="Última foto" />
            ) : (
              <div className="polaroid-placeholder layer-3" style={{ background: 'rgba(255,255,255,0.4)' }}></div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // STEP 4: PREVIEW DE UPLOAD DA GALERIA
  if (viewStep === 'upload_preview') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f7', padding: '1.5rem', fontFamily: 'var(--font-sans)' }}>
        <div style={{ width: '100%', maxWidth: '380px', background: 'white', borderRadius: '16px', padding: '2rem', boxShadow: 'var(--shadow-premium)', display: 'flex', flexDirection: 'column', gap: '1.25rem', textAlign: 'center', border: '1px solid rgba(0,0,0,0.05)' }} className="animate-fade-in">
          
          {isUploading && (
            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', borderRadius: '16px', zIndex: 10 }}>
              <div style={{ width: '40px', height: '40px', border: '3px solid #eaeaea', borderTopColor: '#1d1d1f', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
              <span style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Revelando foto...</span>
            </div>
          )}

          {previewUrl && (
            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', borderRadius: '16px', zIndex: 10, padding: '2rem' }}>
              <div style={{ width: '56px', height: '56px', backgroundColor: '#f9f9fa', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #eaeaea' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#10b981' }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <span style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1d1d1f', fontFamily: 'var(--font-serif)' }}>Prontinho!</span>
              <img src={previewUrl} style={{ width: '180px', height: '240px', objectFit: 'cover', borderRadius: '8px', border: '8px solid white', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }} alt="Foto revelada" />
            </div>
          )}

          <div>
            <h3 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-serif)', color: 'var(--text-primary)' }}>Ajustar Visual</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>Escolha a película analógica.</p>
          </div>

          {/* Imagem a ser revelada com filtro CSS aplicado */}
          <div style={{ position: 'relative', width: '100%', aspectRatio: '4/5', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#f3f4f6', border: '1px solid #eaeaea' }}>
            {galleryImageSrc && (
              <img
                src={galleryImageSrc}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  filter: getVideoFilterStyle(),
                }}
                alt="Upload preview"
              />
            )}
            <canvas ref={canvasRef} style={{ display: 'none' }} />
          </div>

          {/* Seletor de Filtros no upload */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => setFilter('disposable')}
              style={{
                flex: 1,
                padding: '0.6rem 0.25rem',
                borderRadius: '8px',
                border: filter === 'disposable' ? '1px solid #1d1d1f' : '1px solid #eaeaea',
                fontSize: '0.75rem',
                fontWeight: 500,
                backgroundColor: filter === 'disposable' ? '#1d1d1f' : 'white',
                color: filter === 'disposable' ? 'white' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              Disposable
            </button>
            <button
              onClick={() => setFilter('kodak_gold')}
              style={{
                flex: 1,
                padding: '0.6rem 0.25rem',
                borderRadius: '8px',
                border: filter === 'kodak_gold' ? '1px solid #1d1d1f' : '1px solid #eaeaea',
                fontSize: '0.75rem',
                fontWeight: 500,
                backgroundColor: filter === 'kodak_gold' ? '#1d1d1f' : 'white',
                color: filter === 'kodak_gold' ? 'white' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              Kodak Gold
            </button>
            <button
              onClick={() => setFilter('fuji_superia')}
              style={{
                flex: 1,
                padding: '0.6rem 0.25rem',
                borderRadius: '8px',
                border: filter === 'fuji_superia' ? '1px solid #1d1d1f' : '1px solid #eaeaea',
                fontSize: '0.75rem',
                fontWeight: 500,
                backgroundColor: filter === 'fuji_superia' ? '#1d1d1f' : 'white',
                color: filter === 'fuji_superia' ? 'white' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              Fuji
            </button>
          </div>

          {/* Botões de Ação */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              onClick={() => {
                setGalleryImageSrc(null);
                setViewStep('choose_action');
              }}
              style={{
                flex: 1,
                padding: '0.85rem',
                backgroundColor: '#f9f9fa',
                color: '#1d1d1f',
                border: '1px solid #eaeaea',
                borderRadius: '12px',
                fontWeight: 500,
                fontSize: '0.9rem',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f0f0f0')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#f9f9fa')}
            >
              Cancelar
            </button>
            <button
              onClick={handleUploadGalleryImage}
              disabled={isUploading}
              style={{
                flex: 1.5,
                padding: '0.85rem',
                backgroundColor: '#c5a880',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#b3966f')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#c5a880')}
            >
              Revelar Foto
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
