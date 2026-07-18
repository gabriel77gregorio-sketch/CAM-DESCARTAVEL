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
}

interface Props {
  event: Event;
}

type ViewStep = 'get_name' | 'choose_action' | 'live_camera' | 'upload_preview';

export default function CameraView({ event }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
  const [zoom, setZoom] = useState<0.5 | 1.0 | 2.0>(1.0);

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
      setViewStep('choose_action');
      setTimeout(() => {
        setPreviewUrl(null);
      }, 3000);
    }
  };

  // 3. Inicializar a Câmera (apenas se estiver no passo live_camera)
  useEffect(() => {
    if (viewStep !== 'live_camera') {
      if (videoRef.current) stopCamera(videoRef.current);
      setCameraReady(false);
      return;
    }

    if (!videoRef.current) return;

    let activeStream: MediaStream | null = null;

    async function startCamera() {
      try {
        setErrorMsg('');
        setCameraReady(false);
        if (videoRef.current) {
          activeStream = await initCamera(videoRef.current, facingMode);
          setCameraReady(true);
        }
      } catch (err: any) {
        console.error(err);
        setErrorMsg(
          'Não foi possível acessar a câmera. Verifique se deu permissão de acesso ao navegador.'
        );
      }
    }

    startCamera();

    return () => {
      if (videoRef.current) {
        stopCamera(videoRef.current);
      }
    };
  }, [facingMode, viewStep]);

  // Salvar nome do convidado
  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) return;
    localStorage.setItem('guest_name', guestName.trim());
    setViewStep('choose_action');
  };

  // Alternar câmera frontal/traseira
  const handleSwitchCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
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

    captureFrame(videoRef.current, canvasRef.current);
    setIsUploading(true);

    try {
      const canvas = canvasRef.current;
      await applyAnalogFilter(canvas, filter);

      const localPreviewUrl = canvas.toDataURL('image/jpeg', 0.6);
      setPreviewUrl(localPreviewUrl);

      const photoBlob = await compressImage(canvas, 0.8, 1920);

      const photoId = `photo_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
      const storagePath = `${event.id}/${photoId}.jpg`;

      let newPhotoId = `local_photo_${Date.now()}`;

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
      await applyAnalogFilter(canvas, filter);

      // Criar URL de preview rápido
      const localPreviewUrl = canvas.toDataURL('image/jpeg', 0.6);
      setPreviewUrl(localPreviewUrl);

      // Comprimir
      const photoBlob = await compressImage(canvas, 0.8, 1920);

      const photoId = `photo_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
      const storagePath = `${event.id}/${photoId}.jpg`;

      let newPhotoId = `local_photo_${Date.now()}`;

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

  const remainingPhotos = Math.max(0, event.photo_limit_per_user - photosTaken);

  // ================= RENDER DE ACORDO COM O STEP =================

  // STEP 1: SOLICITAR NOME DO CONVIDADO
  if (viewStep === 'get_name') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fef2f6', padding: '1.5rem', fontFamily: 'var(--font-sans)' }}>
        <div style={{ width: '100%', maxWidth: '380px', background: 'white', borderRadius: '24px', padding: '2.5rem 2rem', boxShadow: 'var(--shadow-premium)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-fade-in">
          <div>
            <span style={{ fontSize: '2.5rem' }}>🎉</span>
            <h3 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-display)', color: 'var(--text-primary)', marginTop: '0.5rem', lineHeight: 1.2 }}>
              Bem-vindo ao evento!
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
              {event.event_name}
            </p>
          </div>

          <form onSubmit={handleSaveName} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ textAlign: 'left' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#555', display: 'block', marginBottom: '0.5rem' }}>
                Como podemos te chamar?
              </label>
              <input
                type="text"
                required
                placeholder="Digite seu nome"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.85rem 1.25rem',
                  border: '2px solid #e8c8d4',
                  borderRadius: '50px',
                  fontSize: '0.95rem',
                  outline: 'none',
                  backgroundColor: 'white',
                  transition: 'border-color 0.2s',
                  color: '#1a1a2e',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#E8318A')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#e8c8d4')}
              />
            </div>
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '0.85rem',
                backgroundColor: '#E8318A',
                color: 'white',
                border: 'none',
                borderRadius: '50px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(232, 49, 138, 0.25)',
              }}
            >
              Acessar Álbum
            </button>
          </form>
        </div>
      </div>
    );
  }

  // STEP 2: ESCOLHER AÇÃO (TIRAR FOTO OU SUBIR ARQUIVO)
  if (viewStep === 'choose_action') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#fef2f6', padding: '1rem 1rem 3rem', fontFamily: 'var(--font-sans)', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: '400px', background: 'white', borderRadius: '24px', padding: '1.5rem', boxShadow: 'var(--shadow-premium)', display: 'flex', flexDirection: 'column', gap: '1.25rem', margin: '0 auto' }} className="animate-fade-in">
          
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
            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', borderRadius: '24px', zIndex: 10 }}>
              <div style={{ width: '40px', height: '40px', border: '4px solid #fce4ec', borderTopColor: '#E8318A', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Revelando no laboratório...</span>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Sua foto vintage está sendo revelada.</p>
            </div>
          )}

          {previewUrl && (
            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', borderRadius: '24px', zIndex: 10, padding: '2rem' }}>
              <span style={{ fontSize: '2.5rem' }}>📸</span>
              <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#E8318A', fontFamily: 'var(--font-display)' }}>Foto Revelada!</span>
              <img src={previewUrl} style={{ width: '180px', height: '240px', objectFit: 'cover', borderRadius: '12px', border: '8px solid white', boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }} alt="Foto revelada" />
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Enviada com sucesso para o álbum!</p>
            </div>
          )}

          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: '1.3rem', fontFamily: 'var(--font-display)', color: 'var(--text-primary)', lineHeight: 1.2 }}>
              Olá, <span style={{ color: '#E8318A' }}>{guestName}</span>!
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Compartilhe suas memórias do dia com o casal.
            </p>
          </div>

          {/* Contador de Fotos */}
          <div style={{ background: '#fef2f6', borderRadius: '16px', padding: '1rem', textAlign: 'center', border: '1px solid #fce4ec' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '0.05em' }}>SUAS FOTOS CAPTURADAS</div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#E8318A', fontFamily: 'var(--font-display)', margin: '0.1rem 0' }}>
              {photosTaken} <span style={{ fontSize: '1rem', fontWeight: 500, color: '#999' }}>/ {event.photo_limit_per_user}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#999' }}>
              Você ainda tem {remainingPhotos} cliques disponíveis.
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {remainingPhotos > 0 ? (
              <>
                {/* Opção A: Câmera */}
                <button
                  onClick={() => setViewStep('live_camera')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem',
                    padding: '0.95rem',
                    backgroundColor: '#E8318A',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50px',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'transform 0.2s',
                    boxShadow: '0 4px 12px rgba(232, 49, 138, 0.2)',
                  }}
                >
                  <span style={{ fontSize: '1.1rem' }}>📷</span>
                  Tirar uma foto vintage
                </button>

                {/* Opção B: Enviar do arquivo */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem',
                    padding: '0.95rem',
                    backgroundColor: 'white',
                    color: '#E8318A',
                    border: '2px solid #E8318A',
                    borderRadius: '50px',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'transform 0.2s',
                  }}
                >
                  <span style={{ fontSize: '1.1rem' }}>🖼️</span>
                  Enviar foto do rolo
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
              <div style={{ textAlign: 'center', color: '#ef4444', fontWeight: 600, fontSize: '0.9rem', padding: '0.75rem' }}>
                🚫 Você esgotou todos os seus cliques para este evento! Obrigado por colaborar.
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
              <div className="gamification-card" style={{ padding: '1.25rem', background: 'white', borderRadius: '20px', border: '1px solid #e8ede9', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div>
                  <span style={{ fontSize: '0.65rem', color: '#E8318A', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>🏅 MINHAS CONQUISTAS</span>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '2px 0 0', color: '#1a1a2e' }}>Badges Desbloqueados</h4>
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
                          backgroundColor: isUnlocked ? '#FFF0F5' : '#f1f5f9',
                          border: isUnlocked ? '2px solid #E8318A' : '2px dashed #cbd5e1',
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
                          <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', backgroundColor: '#E8318A', color: 'white', fontSize: '0.55rem', fontWeight: 'bold', padding: '1px 3px', borderRadius: '50px', lineHeight: 1 }}>
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

        {/* ── Flash de captura ── */}
        <div className={`flash-effect ${isCapturing ? 'flash-active' : ''}`} />

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

        {/* ── Preview da última foto (breve) ── */}
        {previewUrl && !isUploading && (
          <div className="cam-preview-flash">
            <img src={previewUrl} alt="Preview" />
            <span className="cam-preview-badge">Revelando... 📸</span>
          </div>
        )}

        {/* ── Overlay de upload/revelando ── */}
        {isUploading && (
          <div className="cam-overlay">
            <div className="cam-overlay-spinner" />
            <span className="cam-overlay-text">Revelando...</span>
          </div>
        )}

        {/* ── TopBar ── */}
        <div className="cam-topbar">
          <button className="cam-icon-btn" onClick={() => setViewStep('choose_action')}>
            ←
          </button>

          <div className="cam-topbar-center">
            <span className="cam-topbar-title">{event.event_name}</span>
            <span className="cam-topbar-sub">{remainingPhotos} foto{remainingPhotos !== 1 ? 's' : ''} restante{remainingPhotos !== 1 ? 's' : ''}</span>
          </div>

          {/* Indicador de câmera pronta */}
          <div className="cam-icon-btn" style={{
            background: cameraReady ? 'rgba(34,197,94,0.25)' : 'rgba(0,0,0,0.35)',
            borderColor: cameraReady ? 'rgba(34,197,94,0.6)' : 'rgba(255,255,255,0.18)',
          }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: cameraReady ? '#4ade80' : 'rgba(255,255,255,0.5)' }}>
              {cameraReady ? '●' : '○'}
            </span>
          </div>
        </div>

        {/* ── Seletor de filtros (pills acima da bottombar) ── */}
        <div className="cam-filters-row">
          <button
            onClick={() => setFilter('disposable')}
            className={`cam-filter-pill ${filter === 'disposable' ? 'active' : ''}`}
          >
            🎞️ Disposable
          </button>
          <button
            onClick={() => setFilter('kodak_gold')}
            className={`cam-filter-pill ${filter === 'kodak_gold' ? 'active' : ''}`}
          >
            💛 Kodak
          </button>
          <button
            onClick={() => setFilter('fuji_superia')}
            className={`cam-filter-pill ${filter === 'fuji_superia' ? 'active' : ''}`}
          >
            💚 Fuji
          </button>
        </div>

        {/* ── Controles flutuantes (flash · zoom · flip) ── */}
        <div className="cam-floating-controls">
          {/* Flash toggle */}
          <button
            className="cam-icon-btn"
            onClick={() => setFlashOn((v) => !v)}
            style={{ fontSize: '1.1rem', background: flashOn ? 'rgba(255,210,0,0.3)' : 'rgba(0,0,0,0.35)', borderColor: flashOn ? 'rgba(255,210,0,0.7)' : 'rgba(255,255,255,0.18)' }}
            title="Flash"
          >
            {flashOn ? '⚡' : '🔕'}
          </button>

          {/* Zoom pills */}
          <div className="cam-zoom-pills">
            <button
              className={`cam-zoom-pill ${zoom === 0.5 ? 'active' : ''}`}
              onClick={() => setZoom(0.5)}
            >
              0.5×
            </button>
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
              2×
            </button>
          </div>

          {/* Flip câmera */}
          <button
            className="cam-icon-btn"
            onClick={handleSwitchCamera}
            disabled={!cameraReady || isUploading}
            title="Alternar câmera"
            style={{ fontSize: '1.1rem' }}
          >
            🔄
          </button>
        </div>

        {/* ── BottomBar ── */}
        <div className="cam-bottombar">
          {/* Contador de fotos estilo rolo */}
          <div className="cam-film-counter">
            <span className="cam-film-icon">🎞️</span>
            <span className="cam-film-number">{String(photosTaken).padStart(2, '0')}</span>
            <span className="cam-film-label">fotos</span>
          </div>

          {/* Shutter */}
          <button
            className="cam-shutter"
            onClick={handleCapture}
            disabled={!cameraReady || isUploading || remainingPhotos <= 0}
            title="Tirar foto"
          />

          {/* Thumbnail da última foto */}
          {previewUrl ? (
            <img
              src={previewUrl}
              className="cam-last-thumb"
              alt="Última foto"
            />
          ) : (
            <div className="cam-thumb-empty" />
          )}
        </div>
      </div>
    );
  }

  // STEP 4: PREVIEW DE UPLOAD DA GALERIA
  if (viewStep === 'upload_preview') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fef2f6', padding: '1.5rem', fontFamily: 'var(--font-sans)' }}>
        <div style={{ width: '100%', maxWidth: '380px', background: 'white', borderRadius: '24px', padding: '2rem', boxShadow: 'var(--shadow-premium)', display: 'flex', flexDirection: 'column', gap: '1.25rem', textAlign: 'center' }} className="animate-fade-in">
          
          {isUploading && (
            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', borderRadius: '24px', zIndex: 10 }}>
              <div style={{ width: '40px', height: '40px', border: '4px solid #fce4ec', borderTopColor: '#E8318A', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Revelando no laboratório...</span>
            </div>
          )}

          {previewUrl && (
            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', borderRadius: '24px', zIndex: 10, padding: '2rem' }}>
              <span style={{ fontSize: '2.5rem' }}>📸</span>
              <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#E8318A', fontFamily: 'var(--font-display)' }}>Foto Revelada!</span>
              <img src={previewUrl} style={{ width: '180px', height: '240px', objectFit: 'cover', borderRadius: '12px', border: '8px solid white', boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }} alt="Foto revelada" />
            </div>
          )}

          <div>
            <h3 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Visualização da Foto</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Escolha um filtro analógico para aplicar na sua foto.</p>
          </div>

          {/* Imagem a ser revelada com filtro CSS aplicado */}
          <div style={{ position: 'relative', width: '100%', aspectRatio: '4/5', borderRadius: '16px', overflow: 'hidden', backgroundColor: '#f3f4f6', boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.06)' }}>
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
                padding: '0.5rem',
                borderRadius: '12px',
                border: filter === 'disposable' ? '2px solid #E8318A' : '1px solid #e8c8d4',
                fontSize: '0.75rem',
                fontWeight: 600,
                backgroundColor: filter === 'disposable' ? '#fef2f6' : 'white',
                color: filter === 'disposable' ? '#E8318A' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              🎞️ Disposable
            </button>
            <button
              onClick={() => setFilter('kodak_gold')}
              style={{
                flex: 1,
                padding: '0.5rem',
                borderRadius: '12px',
                border: filter === 'kodak_gold' ? '2px solid #E8318A' : '1px solid #e8c8d4',
                fontSize: '0.75rem',
                fontWeight: 600,
                backgroundColor: filter === 'kodak_gold' ? '#fef2f6' : 'white',
                color: filter === 'kodak_gold' ? '#E8318A' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              💛 Kodak Gold
            </button>
            <button
              onClick={() => setFilter('fuji_superia')}
              style={{
                flex: 1,
                padding: '0.5rem',
                borderRadius: '12px',
                border: filter === 'fuji_superia' ? '2px solid #E8318A' : '1px solid #e8c8d4',
                fontSize: '0.75rem',
                fontWeight: 600,
                backgroundColor: filter === 'fuji_superia' ? '#fef2f6' : 'white',
                color: filter === 'fuji_superia' ? '#E8318A' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              💚 Fuji
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
                backgroundColor: 'white',
                color: '#555',
                border: '1px solid #e8c8d4',
                borderRadius: '50px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleUploadGalleryImage}
              disabled={isUploading}
              style={{
                flex: 1.5,
                padding: '0.85rem',
                backgroundColor: '#E8318A',
                color: 'white',
                border: 'none',
                borderRadius: '50px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(232, 49, 138, 0.25)',
              }}
            >
              Revelar Foto ✨
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
