import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/painel`,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      setErrorMsg(error.message || 'Erro ao iniciar login com Google.');
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      setSuccessMsg('Login realizado com sucesso! Redirecionando...');
      setTimeout(() => {
        window.location.href = '/painel';
      }, 1000);
    } catch (error: any) {
      setErrorMsg(error.message || 'Erro ao acessar. Verifique suas credenciais.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: '420px', margin: '0 auto', padding: '0 1.5rem' }} className="animate-fade-in">

      {/* Google Button */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={loading}
        style={{
          width: '100%',
          padding: '0.9rem 1.5rem',
          backgroundColor: '#E8318A',
          color: 'white',
          border: 'none',
          borderRadius: '50px',
          fontSize: '1rem',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          transition: 'all 0.2s ease',
          boxShadow: '0 4px 15px rgba(232, 49, 138, 0.3)',
        }}
        onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#d42a7d'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
        onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#E8318A'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#ffffff" d="M12 5.04c1.62 0 3.08.56 4.22 1.64l3.15-3.15C17.45 1.77 14.93 1 12 1 7.37 1 3.4 3.66 1.48 7.55l3.8 2.94c.89-2.67 3.39-4.45 6.72-4.45z"/><path fill="rgba(255,255,255,0.9)" d="M23.49 12.27c0-.81-.07-1.59-.2-2.35H12v4.51h6.46c-.29 1.48-1.14 2.73-2.42 3.58l3.77 2.92c2.2-2.03 3.68-5.02 3.68-8.66z"/><path fill="rgba(255,255,255,0.8)" d="M5.28 14.51c-.24-.72-.38-1.5-.38-2.31 0-.81.14-1.59.38-2.31L1.48 6.95C.54 8.88 0 11.04 0 13.3s.54 4.42 1.48 6.35l3.8-2.94z"/><path fill="rgba(255,255,255,0.85)" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.77-2.92c-1.05.7-2.39 1.13-4.19 1.13-3.33 0-5.83-1.78-6.72-4.45l-3.8 2.94C3.4 20.34 7.37 23 12 23z"/></svg>
        Continuar com o Google
      </button>

      <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#999', marginTop: '0.75rem' }}>
        Mais rápido — faça login com um clique
      </p>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', margin: '1.75rem 0', gap: '0.75rem' }}>
        <div style={{ flex: 1, height: '1px', backgroundColor: '#e8c8d4' }} />
        <span style={{ fontSize: '0.85rem', color: '#999' }}>ou use o e-mail</span>
        <div style={{ flex: 1, height: '1px', backgroundColor: '#e8c8d4' }} />
      </div>

      {/* Messages */}
      {errorMsg && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: '12px', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#d1fae5', border: '1px solid #6ee7b7', color: '#065f46', borderRadius: '12px', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {successMsg}
        </div>
      )}

      {/* Email + Password Form */}
      <form onSubmit={handleEmailSignIn} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 500, color: '#555', marginBottom: '0.5rem' }}>
            Endereço de e-mail
          </label>
          <input
            type="email"
            required
            placeholder="email@exemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
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

        <div>
          <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 500, color: '#555', marginBottom: '0.5rem' }}>
            Senha
          </label>
          <input
            type="password"
            required
            placeholder="Digite sua senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
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
          disabled={loading}
          style={{
            width: '100%',
            padding: '0.85rem 1.5rem',
            backgroundColor: 'white',
            color: '#E8318A',
            border: '2px solid #E8318A',
            borderRadius: '50px',
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#fef2f6'; }}
          onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'white'; }}
        >
          {loading ? 'Entrando...' : 'Entrar com e-mail'}
        </button>
      </form>

      {/* Test Credentials Banner */}
      <div style={{ marginTop: '2rem', padding: '1.25rem', backgroundColor: '#fef2f6', border: '1px dashed #e8c8d4', borderRadius: '16px', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
        <div style={{ fontWeight: 700, color: '#E8318A', marginBottom: '0.4rem' }}>🔑 CREDENCIAIS DE TESTE:</div>
        <p style={{ margin: '0.2rem 0', color: '#555' }}>Use estes dados para testar o painel imediatamente:</p>
        <div style={{ marginTop: '0.5rem', fontFamily: 'monospace', background: 'white', padding: '0.5rem', borderRadius: '8px', border: '1px solid #fce4ec' }}>
          <strong>E-mail:</strong> teste@camdescartavel.com<br />
          <strong>Senha:</strong> 123456
        </div>
      </div>

      {/* Terms */}
      <p style={{ textAlign: 'center', fontSize: '0.78rem', color: '#999', marginTop: '1.5rem', lineHeight: 1.5 }}>
        Ao iniciar sessão, você concorda com nossos{' '}
        <a href="#" style={{ color: '#E8318A', textDecoration: 'none' }}>Termos de Serviço</a>.
      </p>

      {/* Link to register */}
      <div style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.875rem' }}>
        <span style={{ color: '#999' }}>Não tem uma conta? </span>
        <a href="/registro" style={{ color: '#E8318A', fontWeight: 600, textDecoration: 'none' }}>Cadastre-se</a>
      </div>
    </div>
  );
}
