/**
 * Utilitários para compressão e redimensionamento de imagens no navegador
 */

export async function compressImage(
  canvas: HTMLCanvasElement,
  quality: number = 0.92,
  maxWidth: number = 2400
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let targetCanvas = canvas;
    const width = canvas.width;
    const height = canvas.height;

    // Verificar se a imagem excede a largura/altura máxima
    if (width > maxWidth || height > maxWidth) {
      const scale = Math.min(maxWidth / width, maxWidth / height);
      const newWidth = Math.round(width * scale);
      const newHeight = Math.round(height * scale);

      // Criar canvas temporário para redimensionamento
      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = newWidth;
      offscreenCanvas.height = newHeight;
      const offscreenCtx = offscreenCanvas.getContext('2d');

      if (offscreenCtx) {
        // Desenha a imagem redimensionada
        offscreenCtx.drawImage(canvas, 0, 0, newWidth, newHeight);
        targetCanvas = offscreenCanvas;
      }
    }

    // Converter para Blob JPEG com qualidade ajustada
    targetCanvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Falha ao comprimir imagem: Blob gerado é nulo.'));
        }
      },
      'image/jpeg',
      quality
    );
  });
}
