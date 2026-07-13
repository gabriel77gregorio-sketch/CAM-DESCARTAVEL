import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

/**
 * Gera um PDF Kit de Mesa (tamanho A4) com o QR Code e instruções em pt-BR (padrão)
 */
export async function generateKitMesaPDF(eventName: string, cameraUrl: string): Promise<void> {
  const qrDataUrl = await QRCode.toDataURL(cameraUrl, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 400,
    color: {
      dark: '#111827',
      light: '#ffffff',
    },
  });

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFillColor(254, 242, 246); // #fef2f6 (Fundo rosa claro)
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  doc.setDrawColor(252, 228, 236);
  doc.setLineWidth(1);
  doc.rect(8, 8, pageWidth - 16, pageHeight - 16, 'S');

  doc.setDrawColor(232, 49, 138); // Borda interna rosa magenta (#E8318A)
  doc.setLineWidth(0.5);
  doc.rect(10, 10, pageWidth - 20, pageHeight - 20, 'S');

  doc.setTextColor(232, 49, 138);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('📸 CAM DESCARTÁVEL', pageWidth / 2, 28, { align: 'center' });

  doc.setDrawColor(252, 228, 236);
  doc.setLineWidth(0.5);
  doc.line(30, 36, pageWidth - 30, 36);

  doc.setTextColor(85, 85, 85);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(14);
  doc.text('Sejam muito bem-vindos ao evento', pageWidth / 2, 48, { align: 'center' });

  doc.setTextColor(26, 26, 46);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(26);
  const splitEventName = doc.splitTextToSize(eventName.toUpperCase(), pageWidth - 40);
  doc.text(splitEventName, pageWidth / 2, 60, { align: 'center' });

  doc.setTextColor(153, 153, 153);
  doc.setFont('Helvetica', 'oblique');
  doc.setFontSize(12);
  doc.text('Ajude-nos a registrar os melhores momentos sob o seu olhar!', pageWidth / 2, 75, { align: 'center' });

  const qrSize = 90;
  const qrX = (pageWidth - qrSize) / 2;
  const qrY = 88;
  
  doc.setFillColor(255, 255, 255);
  doc.rect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, 'F');
  doc.setDrawColor(252, 228, 236);
  doc.setLineWidth(0.2);
  doc.rect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, 'S');

  doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

  doc.setTextColor(26, 26, 46);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('APONTE A CÂMERA DO CELULAR PARA O QR CODE', pageWidth / 2, 192, { align: 'center' });

  doc.setDrawColor(252, 228, 236);
  doc.setLineWidth(0.5);
  doc.line(40, 202, pageWidth - 40, 202);

  doc.setTextColor(26, 26, 46);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('COMO FOTOGRAFAR:', 30, 214);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(85, 85, 85);
  
  const step1 = '1. Escaneie o QR Code acima usando a câmera do seu smartphone.';
  const step2 = '2. O app da câmera abrirá direto no navegador - não precisa baixar nada ou fazer login.';
  const step3 = '3. Escolha o filtro vintage (Kodak Gold ou Fuji) e clique no disparador para tirar fotos.';
  const step4 = '4. As fotos serão "reveladas" na hora e enviadas automaticamente para a galeria dos noivos!';

  const stepsYStart = 222;
  const lineSpacing = 6.5;

  doc.text(doc.splitTextToSize(step1, pageWidth - 60), 30, stepsYStart);
  doc.text(doc.splitTextToSize(step2, pageWidth - 60), 30, stepsYStart + lineSpacing);
  doc.text(doc.splitTextToSize(step3, pageWidth - 60), 30, stepsYStart + (lineSpacing * 2));
  doc.text(doc.splitTextToSize(step4, pageWidth - 60), 30, stepsYStart + (lineSpacing * 3));

  doc.setTextColor(153, 153, 153);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Gerado por camdescartavel.com - Fotos Vintage Digitais', pageWidth / 2, 278, { align: 'center' });

  const slugifiedName = eventName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  doc.save(`kit-mesa-${slugifiedName}.pdf`);
}

/**
 * Gera um PDF baseado em 5 modelos selecionados (tamanho 5x7 polegadas - 127 x 178 mm)
 */
export async function generateCustomTemplatePDF(
  templateId: string,
  coupleName: string,
  eventDate: string,
  cameraUrl: string
): Promise<void> {
  const qrDataUrl = await QRCode.toDataURL(cameraUrl, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 300,
    color: {
      dark: '#1a1a2e',
      light: '#ffffff',
    },
  });

  // Tamanho 5x7 polegadas = 127 x 177.8 mm
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [127, 178],
  });

  const pageWidth = 127;
  const pageHeight = 178;

  // Formata data do formato YYYY-MM-DD para DD/MM/YYYY
  let formattedDate = eventDate;
  if (eventDate.includes('-')) {
    const parts = eventDate.split('-');
    if (parts.length === 3) {
      formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  }

  // Desenhar de acordo com o template
  switch (templateId) {
    case 'classico':
      // Fundo Branco
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      
      // Borda elegante dupla
      doc.setDrawColor(26, 26, 46);
      doc.setLineWidth(0.6);
      doc.rect(6, 6, pageWidth - 12, pageHeight - 12, 'S');
      doc.rect(8, 8, pageWidth - 16, pageHeight - 16, 'S');

      // Textos
      doc.setTextColor(85, 85, 85);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('JUNTE-SE A NÓS NA CELEBRAÇÃO', pageWidth / 2, 22, { align: 'center' });

      doc.setTextColor(26, 26, 46);
      doc.setFont('Times', 'italic');
      doc.setFontSize(22);
      doc.text(coupleName, pageWidth / 2, 36, { align: 'center' });

      doc.setTextColor(85, 85, 85);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(formattedDate.toUpperCase(), pageWidth / 2, 46, { align: 'center' });
      doc.setFontSize(8);
      doc.text('COMPARTILHE SEUS CLIQUES', pageWidth / 2, 52, { align: 'center' });

      // QR Code
      doc.addImage(qrDataUrl, 'PNG', (pageWidth - 50) / 2, 64, 50, 50);

      // Rodapé
      doc.setTextColor(153, 153, 153);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(7);
      doc.text('DIGITALIZE PARA ADICIONAR SUAS FOTOS', pageWidth / 2, 140, { align: 'center' });
      break;

    case 'audacioso':
      // Fundo Rosa Claro
      doc.setFillColor(254, 242, 246);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');

      // Título Bold
      doc.setTextColor(232, 49, 138);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(26);
      doc.text('BEM-VINDO', pageWidth / 2, 26, { align: 'center' });

      // Nomes
      doc.setTextColor(26, 26, 46);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(16);
      doc.text(coupleName, pageWidth / 2, 40, { align: 'center' });

      doc.setTextColor(85, 85, 85);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(formattedDate, pageWidth / 2, 48, { align: 'center' });

      // QR Code
      doc.setFillColor(255, 255, 255);
      doc.rect((pageWidth - 54) / 2, 62, 54, 54, 'F');
      doc.addImage(qrDataUrl, 'PNG', (pageWidth - 50) / 2, 64, 50, 50);

      // Rodapé
      doc.setTextColor(232, 49, 138);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('ADICIONE SUAS FOTOS AQUI', pageWidth / 2, 142, { align: 'center' });
      break;

    case 'cabine':
      // Fundo Branco
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');

      // Borda fina
      doc.setDrawColor(232, 232, 232);
      doc.setLineWidth(0.2);
      doc.rect(5, 5, pageWidth - 10, pageHeight - 10, 'S');

      // Ícone câmera desenhado simples
      doc.setDrawColor(232, 49, 138);
      doc.setLineWidth(0.8);
      doc.rect((pageWidth - 14) / 2, 14, 14, 9, 'S');
      doc.circle(pageWidth / 2, 18.5, 2.5, 'S');
      doc.rect((pageWidth - 4) / 2, 12.5, 4, 1.5, 'S');

      // Textos
      doc.setTextColor(26, 26, 46);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('cabine de fotos', pageWidth / 2, 32, { align: 'center' });

      doc.setTextColor(85, 85, 85);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('FOTOGRAFE. DIGITALIZE. ENVIE.', pageWidth / 2, 38, { align: 'center' });

      doc.setTextColor(26, 26, 46);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(coupleName, pageWidth / 2, 48, { align: 'center' });
      doc.setFontSize(8);
      doc.text(formattedDate, pageWidth / 2, 54, { align: 'center' });

      // QR Code
      doc.addImage(qrDataUrl, 'PNG', (pageWidth - 50) / 2, 66, 50, 50);
      break;

    case 'desejos':
      // Fundo Creme suave
      doc.setFillColor(255, 253, 250);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');

      // Desenho de coração no topo
      doc.setDrawColor(232, 49, 138);
      doc.setLineWidth(0.6);
      // Desenha coração por caminhos
      const hX = pageWidth / 2;
      const hY = 20;
      doc.lines(
        [[3, -3, 6, 0, 6, 3], [-3, 3, -6, 0, -6, -3]],
        hX - 6,
        hY,
        [1, 1],
        'S'
      );
      // Desenha a outra metade
      doc.lines(
        [[-3, -3, -6, 0, -6, 3], [3, 3, 6, 0, 6, -3]],
        hX + 6,
        hY,
        [1, 1],
        'S'
      );

      // Textos
      doc.setTextColor(153, 153, 153);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(7);
      doc.text('UM PEQUENO DESEJO', pageWidth / 2, 32, { align: 'center' });

      doc.setTextColor(26, 26, 46);
      doc.setFont('Times', 'italic');
      doc.setFontSize(16);
      doc.text('Deixe-nos suas lembranças.', pageWidth / 2, 40, { align: 'center' });

      doc.setTextColor(85, 85, 85);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(coupleName, pageWidth / 2, 50, { align: 'center' });
      doc.setFontSize(8);
      doc.text(formattedDate, pageWidth / 2, 56, { align: 'center' });

      // QR Code
      doc.addImage(qrDataUrl, 'PNG', (pageWidth - 48) / 2, 68, 48, 48);

      // Rodapé
      doc.setTextColor(153, 153, 153);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('DIGITALIZE PARA ENVIAR', pageWidth / 2, 136, { align: 'center' });
      break;

    case 'botanico':
      // Fundo Branco
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');

      // Desenhos laterais de ramos botânicos simples
      doc.setDrawColor(26, 26, 46);
      doc.setLineWidth(0.4);
      // Ramo Esquerdo
      doc.line(12, 30, 12, 140);
      doc.circle(12, 40, 1.5, 'S');
      doc.circle(12, 60, 1.5, 'S');
      doc.circle(12, 80, 1.5, 'S');
      doc.circle(12, 100, 1.5, 'S');
      doc.circle(12, 120, 1.5, 'S');

      // Ramo Direito
      doc.line(pageWidth - 12, 30, pageWidth - 12, 140);
      doc.circle(pageWidth - 12, 40, 1.5, 'S');
      doc.circle(pageWidth - 12, 60, 1.5, 'S');
      doc.circle(pageWidth - 12, 80, 1.5, 'S');
      doc.circle(pageWidth - 12, 100, 1.5, 'S');
      doc.circle(pageWidth - 12, 120, 1.5, 'S');

      // Textos
      doc.setTextColor(153, 153, 153);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(7);
      doc.text('JUNTOS COM', pageWidth / 2, 24, { align: 'center' });

      doc.setTextColor(26, 26, 46);
      doc.setFont('Times', 'normal');
      doc.setFontSize(18);
      doc.text(coupleName, pageWidth / 2, 36, { align: 'center' });

      doc.setTextColor(85, 85, 85);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(formattedDate, pageWidth / 2, 46, { align: 'center' });

      // QR Code
      doc.addImage(qrDataUrl, 'PNG', (pageWidth - 50) / 2, 64, 50, 50);

      // Rodapé
      doc.setTextColor(26, 26, 46);
      doc.setFont('Times', 'italic');
      doc.setFontSize(10);
      doc.text('Compartilhe suas memórias', pageWidth / 2, 138, { align: 'center' });
      break;

    default:
      await generateKitMesaPDF(coupleName, cameraUrl);
      return;
  }

  const slugifiedName = coupleName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  doc.save(`placa-${templateId}-${slugifiedName}.pdf`);
}
