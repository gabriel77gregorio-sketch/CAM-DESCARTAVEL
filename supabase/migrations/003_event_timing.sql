-- Migration: 003_event_timing.sql
-- Propósito: Adicionar colunas para gerenciar a janela de uso da câmera e revelação agendada.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS camera_start_time TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS camera_end_time TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reveal_time TIMESTAMPTZ DEFAULT NULL;

-- Se reveal_time for nulo, a revelação é imediata.
