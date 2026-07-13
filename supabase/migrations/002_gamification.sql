-- Migration: 002_gamification.sql
-- Propósito: Estrutura do banco de dados para o sistema de gamificação do Cam Descartável

-- Novas colunas na tabela de eventos para meta coletiva e controle
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS photo_goal INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gamification_enabled BOOLEAN DEFAULT true;

-- Tabela de Perfis de Convidados (Gamificação)
CREATE TABLE IF NOT EXISTS public.guest_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  guest_id TEXT NOT NULL,          -- mesmo guest_id anônimo do localStorage
  guest_name TEXT NOT NULL,
  avatar_emoji TEXT DEFAULT '📸',
  xp_points INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, guest_id)
);

-- Tabela de Missões (Challenges)
CREATE TABLE IF NOT EXISTS public.challenges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  emoji TEXT NOT NULL DEFAULT '📷',
  title TEXT NOT NULL,
  category TEXT DEFAULT 'geral',
  sort_order INT DEFAULT 0,
  is_custom BOOLEAN DEFAULT false,  -- true = criada pelo admin
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de Completamento de Missões
CREATE TABLE IF NOT EXISTS public.challenge_completions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge_id UUID REFERENCES public.challenges(id) ON DELETE CASCADE NOT NULL,
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  guest_id TEXT NOT NULL,
  photo_id UUID REFERENCES public.photos(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(challenge_id, guest_id)  -- cada convidado completa a missão apenas uma vez
);

-- Tabela de Conquistas Desbloqueadas (Achievements)
CREATE TABLE IF NOT EXISTS public.guest_achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  guest_id TEXT NOT NULL,
  achievement_key TEXT NOT NULL,    -- ex: 'first_click', 'vintage_artist'
  unlocked_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, guest_id, achievement_key)
);

-- Habilitar Row Level Security (RLS) nas novas tabelas
ALTER TABLE public.guest_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_achievements ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS RLS: GUEST_PROFILES
CREATE POLICY "Leitura pública de perfis de convidados" ON public.guest_profiles
  FOR SELECT USING (true);

CREATE POLICY "Qualquer pessoa pode cadastrar seu perfil de convidado" ON public.guest_profiles
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = guest_profiles.event_id AND events.is_active = true
    )
  );

CREATE POLICY "Qualquer pessoa pode atualizar seu próprio perfil de convidado" ON public.guest_profiles
  FOR UPDATE USING (true);

-- POLÍTICAS RLS: CHALLENGES
CREATE POLICY "Leitura pública de missões" ON public.challenges
  FOR SELECT USING (true);

CREATE POLICY "Donos do evento podem gerenciar missões" ON public.challenges
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = challenges.event_id AND events.user_id = auth.uid()
    )
  );

-- POLÍTICAS RLS: CHALLENGE_COMPLETIONS
CREATE POLICY "Leitura pública de conclusões de missões" ON public.challenge_completions
  FOR SELECT USING (true);

CREATE POLICY "Qualquer pessoa pode concluir missões em eventos ativos" ON public.challenge_completions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = challenge_completions.event_id AND events.is_active = true
    )
  );

-- POLÍTICAS RLS: GUEST_ACHIEVEMENTS
CREATE POLICY "Leitura pública de conquistas" ON public.guest_achievements
  FOR SELECT USING (true);

CREATE POLICY "Qualquer pessoa pode desbloquear conquistas em eventos ativos" ON public.guest_achievements
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = guest_achievements.event_id AND events.is_active = true
    )
  );
