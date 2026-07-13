import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || 'https://veqkdtpdoquziiwccsnb.supabase.co';
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlcWtkdHBkb3F1emlpd2Njc25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3ODg4MTIsImV4cCI6MjA5OTM2NDgxMn0.gnUY6AumEREjzryWoZV7c5zZiRTxkNwrWRT8UYkl3sw';

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('your-project-id')) {
  console.warn('Aviso: Credenciais do Supabase não configuradas.');
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);
