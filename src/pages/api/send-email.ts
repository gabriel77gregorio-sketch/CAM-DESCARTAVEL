import type { APIRoute } from 'astro';
import { Resend } from 'resend';

// Inicializa a biblioteca do Resend (pega a chave do .env)
// A chave precisa ser definida como RESEND_API_KEY no arquivo .env
const resend = new Resend(import.meta.env.RESEND_API_KEY);

export const POST: APIRoute = async ({ request }) => {
  try {
    const { to, subject, type, data } = await request.json();
    
    if (!to) {
      return new Response(JSON.stringify({ error: 'O destinatário (to) é obrigatório.' }), { status: 400 });
    }

    let htmlContent = '';
    
    // Constrói o e-mail dependendo do tipo
    if (type === 'receipt') {
        htmlContent = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
              <h1 style="color: #E8318A;">Pagamento Confirmado! 🎉</h1>
              <p>Olá,</p>
              <p>Recebemos o seu pagamento referente ao evento <strong>${data?.eventName || 'Cam Descartável'}</strong>.</p>
              <p>O pacote escolhido foi liberado com sucesso. Você já pode acessar o painel e começar a divulgar o QR Code para os seus convidados.</p>
              <br>
              <p>Com carinho,<br>Equipe Cam Descartável</p>
            </div>
        `;
    } else {
        htmlContent = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
              <h1 style="color: #E8318A;">Olá!</h1>
              <p>Você tem uma nova mensagem do Cam Descartável.</p>
            </div>
        `;
    }

    // Tenta enviar o e-mail
    // NOTA: Para contas novas do Resend que ainda não verificaram domínio,
    // o "from" precisa ser "onboarding@resend.dev" para os testes funcionarem.
    // Quando o domínio for verificado, mude para "no-reply@seu-dominio.com.br".
    const { data: emailData, error } = await resend.emails.send({
      from: import.meta.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to,
      subject: subject || 'Cam Descartável - Notificação',
      html: htmlContent,
    });

    if (error) {
      return new Response(JSON.stringify({ error }), { status: 400 });
    }

    return new Response(JSON.stringify({ success: true, emailData }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
