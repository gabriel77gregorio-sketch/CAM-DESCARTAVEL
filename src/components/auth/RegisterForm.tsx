import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function RegisterForm() {
  const [fullName, setFullName] = useState('');
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
      setErrorMsg(error.message || 'Erro ao iniciar cadastro com Google.');
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (password.length < 6) {
        throw new Error('A senha deve ter pelo menos 6 caracteres.');
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) throw error;

      setSuccessMsg('Cadastro realizado! Verifique seu e-mail ou faça login.');
      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
    } catch (error: any) {
      setErrorMsg(error.message || 'Erro ao realizar cadastro.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.75rem 1rem',
    border: '1px solid #d1d1d6',
    borderRadius: '8px',
    fontSize: '16px',
    outline: 'none',
    backgroundColor: 'white',
    transition: 'border-color 0.15s ease',
    color: '#1d1d1f',
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = '#1d1d1f';
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = '#d1d1d6';
  };

  return (
    <div style={{ width: '100%', maxWidth: '380px', margin: '0 auto', padding: '0 1rem' }} className="animate-fade-in">

      {/* Google Button */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={loading}
        style={{
          width: '100%',
          padding: '0.85rem 1.5rem',
          backgroundColor: '#1d1d1f',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '0.95rem',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          transition: 'all 0.15s ease',
        }}
        onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#000000'; }}
        onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#1d1d1f'; }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#ffffff" d="M12 5.04c1.62 0 3.08.56 4.22 1.64l3.15-3.15C17.45 1.77 14.93 1 12 1 7.37 1 3.4 3.66 1.48 7.55l3.8 2.94c.89-2.67 3.39-4.45 6.72-4.45z"/><path fill="rgba(255,255,255,0.9)" d="M23.49 12.27c0-.81-.07-1.59-.2-2.35H12v4.51h6.46c-.29 1.48-1.14 2.73-2.42 3.58l3.77 2.92c2.2-2.03 3.68-5.02 3.68-8.66z"/><path fill="rgba(255,255,255,0.8)" d="M5.28 14.51c-.24-.72-.38-1.5-.38-2.31 0-.81.14-1.59.38-2.31L1.48 6.95C.54 8.88 0 11.04 0 13.3s.54 4.42 1.48 6.35l3.8-2.94z"/><path fill="rgba(255,255,255,0.85)" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.77-2.92c-1.05.7-2.39 1.13-4.19 1.13-3.33 0-5.83-1.78-6.72-4.45l-3.8 2.94C3.4 20.34 7.37 23 12 23z"/></svg>
        Cadastrar com o Google
      </button>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', margin: '1.5rem 0', gap: '0.75rem' }}>
        <div style={{ flex: 1, height: '1px', backgroundColor: '#e5e5e7' }} />
        <span style={{ fontSize: '0.8rem', color: '#86868b' }}>ou utilize seu e-mail</span>
        <div style={{ flex: 1, height: '1px', backgroundColor: '#e5e5e7' }} />
      </div>

      {/* Messages */}
      {errorMsg && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fdf2f2', border: '1px solid #fde8e8', color: '#c81e1e', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#f3faf7', border: '1px solid #def7ec', color: '#03543f', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {successMsg}
        </div>
      )}

      {/* Register Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#1d1d1f', marginBottom: '0.35rem' }}>
            Nome completo
          </label>
          <input
            type="text"
            required
            placeholder="Seu nome"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={loading}
            style={inputStyle}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#1d1d1f', marginBottom: '0.35rem' }}>
            E-mail
          </label>
          <input
            type="email"
            required
            placeholder="nome@exemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            style={inputStyle}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#1d1d1f', marginBottom: '0.35rem' }}>
            Senha
          </label>
          <input
            type="password"
            required
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            style={inputStyle}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '0.85rem 1.5rem',
            backgroundColor: '#c5a880',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            minHeight: '44px',
          }}
          onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#b3966f'; }}
          onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#c5a880'; }}
        >
          {loading ? 'Cadastrando...' : 'Criar minha conta'}
        </button>
      </form>

      {/* Terms */}
      <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#86868b', marginTop: '1.5rem', lineHeight: 1.5 }}>
        Ao criar sua conta, você concorda com nossos{' '}
        <a href="#" style={{ color: '#c5a880', textDecoration: 'underline' }}>Termos de Serviço</a>.
      </p>

      {/* Link to login */}
      <div style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.85rem' }}>
        <span style={{ color: '#86868b' }}>Já tem uma conta? </span>
        <a href="/login" style={{ color: '#c5a880', fontWeight: 600, textDecoration: 'none' }}>Entrar</a>
      </div>
    </div>
  );
}
  );
}
