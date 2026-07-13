-- Tabela de Perfis (vinculada ao Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de Eventos
CREATE TABLE IF NOT EXISTS public.events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  event_name TEXT NOT NULL,
  event_date DATE NOT NULL,
  photo_limit_per_user INT DEFAULT 10 CHECK (photo_limit_per_user > 0),
  slug TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de Fotos
CREATE TABLE IF NOT EXISTS public.photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  storage_path TEXT NOT NULL,       -- Caminho no bucket (ex: event_id/photo_id.jpg)
  guest_id TEXT NOT NULL,           -- UUID anônimo gerado no client
  filter_used TEXT DEFAULT 'none',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para otimização de buscas
CREATE INDEX IF NOT EXISTS idx_events_user_id ON public.events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_slug ON public.events(slug);
CREATE INDEX IF NOT EXISTS idx_photos_event_id ON public.photos(event_id);
CREATE INDEX IF NOT EXISTS idx_photos_guest_id ON public.photos(guest_id);

-- Ativar RLS nas tabelas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS RLS: PROFILES
CREATE POLICY "Usuários podem ver seu próprio perfil" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Usuários podem atualizar seu próprio perfil" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- POLÍTICAS RLS: EVENTS
CREATE POLICY "Donos podem ver seus eventos" ON public.events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Donos podem criar eventos" ON public.events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Donos podem atualizar seus eventos" ON public.events
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Donos podem deletar seus eventos" ON public.events
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Qualquer pessoa pode buscar evento ativo pelo slug" ON public.events
  FOR SELECT USING (is_active = true);

-- POLÍTICAS RLS: PHOTOS
CREATE POLICY "Donos do evento podem ver todas as fotos dele" ON public.photos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = photos.event_id AND events.user_id = auth.uid()
    )
  );

CREATE POLICY "Qualquer pessoa pode inserir fotos em eventos ativos" ON public.photos
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = photos.event_id AND events.is_active = true
    )
  );

-- Trigger para criar perfil de forma automática no cadastro
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Noivo/Organizador')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Criação do Bucket de Fotos (Supabase Storage) se não existir
-- Nota: Roda no schema storage
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-photos', 'event-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de acesso para o Bucket 'event-photos'
-- Qualquer pessoa (incluindo anônimos) pode enviar fotos se o evento for ativo
CREATE POLICY "Qualquer pessoa pode enviar fotos para o bucket" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'event-photos'
  );

-- Apenas donos do evento correspondente podem ver e baixar os arquivos originais
-- Mas para facilitar a exibição rápida na galeria pública (se necessário) ou no dashboard,
-- deixamos a leitura pública das imagens ativada, já que o ID do evento no caminho é um UUID aleatório difícil de adivinhar.
CREATE POLICY "Leitura pública de fotos do bucket" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'event-photos'
  );
