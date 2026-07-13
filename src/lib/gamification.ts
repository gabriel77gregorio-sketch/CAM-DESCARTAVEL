import { supabase } from './supabase';

export interface Challenge {
  id?: string;
  event_id?: string;
  emoji: string;
  title: string;
  category: string;
  sort_order: number;
  is_custom?: boolean;
}

export interface Achievement {
  key: string;
  name: string;
  description: string;
  emoji: string;
  xp: number;
}

export const ACHIEVEMENT_DEFINITIONS: Record<string, Achievement> = {
  first_click: {
    key: 'first_click',
    name: 'Primeiro Clique',
    description: 'Tirou a primeira foto no evento',
    emoji: '📸',
    xp: 10,
  },
  reveler: {
    key: 'reveler',
    name: 'Revelador',
    description: 'Tirou 5 fotos no evento',
    emoji: '🎞️',
    xp: 25,
  },
  paparazzi: {
    key: 'paparazzi',
    name: 'Fotógrafo Oficial',
    description: 'Tirou 10 ou mais fotos no evento',
    emoji: '🏆',
    xp: 50,
  },
  artist: {
    key: 'artist',
    name: 'Artista Vintage',
    description: 'Experimentou todos os 3 filtros vintage',
    emoji: '🎨',
    xp: 30,
  },
  fast_shooter: {
    key: 'fast_shooter',
    name: 'Paparazzi Veloz',
    description: 'Tirou 3 fotos em menos de 5 minutos',
    emoji: '⚡',
    xp: 20,
  },
  night_owl: {
    key: 'night_owl',
    name: 'Coruja da Festa',
    description: 'Enviou uma foto após a meia-noite',
    emoji: '🌙',
    xp: 15,
  },
  mission_hunter: {
    key: 'mission_hunter',
    name: 'Caçador de Missões',
    description: 'Completou 3 missões da festa',
    emoji: '🎯',
    xp: 40,
  },
  legendary: {
    key: 'legendary',
    name: 'Lenda da Festa',
    description: 'Completou 7 ou mais missões da festa',
    emoji: '👑',
    xp: 100,
  },
};

export const DEFAULT_CHALLENGES: Omit<Challenge, 'id' | 'event_id'>[] = [
  { emoji: '🎂', title: 'Fotografe o bolo de casamento', category: 'Detalhes', sort_order: 1 },
  { emoji: '💃', title: 'Alguém arrasando na pista de dança', category: 'Festa', sort_order: 2 },
  { emoji: '🥂', title: 'Capture um brinde com sorrisos', category: 'Momentos', sort_order: 3 },
  { emoji: '👰', title: 'Selfie com os noivos', category: 'Interação', sort_order: 4 },
  { emoji: '😂', title: 'Alguém dando uma risada sincera', category: 'Espontâneo', sort_order: 5 },
  { emoji: '🌅', title: 'A decoração ou altar do evento', category: 'Detalhes', sort_order: 6 },
  { emoji: '👶', title: 'Uma criança se divertindo na festa', category: 'Espontâneo', sort_order: 7 },
  { emoji: '🎤', title: 'Momento emocionante dos discursos', category: 'Momentos', sort_order: 8 },
  { emoji: '🤳', title: 'Selfie com sua mesa/grupo de amigos', category: 'Interação', sort_order: 9 },
  { emoji: '🕺', title: 'Uma pose engraçada ou divertida', category: 'Festa', sort_order: 10 },
  { emoji: '💐', title: 'O buquê de flores ou a lapela', category: 'Detalhes', sort_order: 11 },
  { emoji: '🌙', title: 'Sua última foto antes de ir embora', category: 'Especial', sort_order: 12 },
];

/**
 * Cria as missões padrão para um evento
 */
export async function createDefaultChallengesForEvent(eventId: string) {
  const challenges = DEFAULT_CHALLENGES.map((c) => ({
    ...c,
    event_id: eventId,
  }));

  const { data, error } = await supabase
    .from('challenges')
    .insert(challenges)
    .select();

  if (error) {
    console.error('Erro ao criar missões padrão:', error);
  }
  return data;
}

/**
 * Verifica e desbloqueia conquistas com base no estado atual do convidado
 */
export async function checkNewAchievements(
  eventId: string,
  guestId: string,
  photos: any[],
  completionsCount: number,
  existingKeys: string[]
): Promise<Achievement[]> {
  const newAchievements: Achievement[] = [];
  const now = new Date();

  // Helper para verificar se já possui
  const has = (key: string) => existingKeys.includes(key);

  // 1. Primeiro clique
  if (photos.length >= 1 && !has('first_click')) {
    newAchievements.push(ACHIEVEMENT_DEFINITIONS.first_click);
  }

  // 2. Revelador
  if (photos.length >= 5 && !has('reveler')) {
    newAchievements.push(ACHIEVEMENT_DEFINITIONS.reveler);
  }

  // 3. Paparazzi
  if (photos.length >= 10 && !has('paparazzi')) {
    newAchievements.push(ACHIEVEMENT_DEFINITIONS.paparazzi);
  }

  // 4. Artista Vintage (se usou os 3 filtros)
  // Filtros padrão: disposable, kodak_gold, fuji_superia
  const filtersUsed = new Set(photos.map((p) => p.filter_used).filter(Boolean));
  if (
    filtersUsed.has('disposable') &&
    filtersUsed.has('kodak_gold') &&
    filtersUsed.has('fuji_superia') &&
    !has('artist')
  ) {
    newAchievements.push(ACHIEVEMENT_DEFINITIONS.artist);
  }

  // 5. Paparazzi Veloz (3 fotos em 5 minutos)
  if (photos.length >= 3 && !has('fast_shooter')) {
    const dates = photos
      .map((p) => new Date(p.created_at).getTime())
      .sort((a, b) => b - a); // Mais recentes primeiro

    let fastShot = false;
    for (let i = 0; i <= dates.length - 3; i++) {
      // Diferença entre a foto i e a foto i+2 (que são 3 fotos consecutivas)
      const diffMin = (dates[i] - dates[i + 2]) / (1000 * 60);
      if (diffMin <= 5) {
        fastShot = true;
        break;
      }
    }

    if (fastShot) {
      newAchievements.push(ACHIEVEMENT_DEFINITIONS.fast_shooter);
    }
  }

  // 6. Coruja da Festa (foto após a meia-noite)
  if (!has('night_owl')) {
    const latePhoto = photos.some((p) => {
      const pDate = new Date(p.created_at);
      const hours = pDate.getHours();
      return hours >= 0 && hours < 5; // Entre 00:00 e 05:00 da manhã
    });
    if (latePhoto) {
      newAchievements.push(ACHIEVEMENT_DEFINITIONS.night_owl);
    }
  }

  // 7. Caçador de Missões (completou 3)
  if (completionsCount >= 3 && !has('mission_hunter')) {
    newAchievements.push(ACHIEVEMENT_DEFINITIONS.mission_hunter);
  }

  // 8. Lenda da Festa (completou 7)
  if (completionsCount >= 7 && !has('legendary')) {
    newAchievements.push(ACHIEVEMENT_DEFINITIONS.legendary);
  }

  // Salvar no banco as novas conquistas
  if (newAchievements.length > 0) {
    const inserts = newAchievements.map((ach) => ({
      event_id: eventId,
      guest_id: guestId,
      achievement_key: ach.key,
    }));

    const { error } = await supabase.from('guest_achievements').insert(inserts);
    if (error) {
      console.error('Erro ao salvar conquistas:', error);
    }
  }

  return newAchievements;
}

/**
 * Sincroniza e calcula a pontuação total do perfil do convidado
 */
export async function syncGuestProfile(
  eventId: string,
  guestId: string,
  guestName: string,
  photosCount: number,
  completionsCount: number,
  achievements: Achievement[]
): Promise<number> {
  // Calcular pontos de XP:
  // - Cada foto: 5 XP
  // - Cada missão concluída: 15 XP
  // - Conquistas: soma do XP de cada conquista
  const photosXP = photosCount * 5;
  const completionsXP = completionsCount * 15;
  const achievementsXP = achievements.reduce((acc, ach) => acc + ach.xp, 0);
  const totalXP = photosXP + completionsXP + achievementsXP;

  // Emojis aleatórios baseados em câmeras/festas
  const emojis = ['📸', '📷', '🤳', '🎞️', '🎨', '🌟', '🎉', '🥂', '🕺', '💃', '🕶️', '⚡'];
  const hash = guestId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const avatarEmoji = emojis[hash % emojis.length];

  const { error } = await supabase.from('guest_profiles').upsert(
    {
      event_id: eventId,
      guest_id: guestId,
      guest_name: guestName,
      avatar_emoji: avatarEmoji,
      xp_points: totalXP,
    },
    { onConflict: 'event_id,guest_id' }
  );

  if (error) {
    console.error('Erro ao atualizar perfil do convidado:', error);
  }

  return totalXP;
}
