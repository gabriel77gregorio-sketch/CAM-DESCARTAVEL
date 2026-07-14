/**
 * Utilitários para acesso e manipulação da câmera via getUserMedia
 */

export async function initCamera(
  videoElement: HTMLVideoElement,
  facingMode: 'environment' | 'user' = 'environment'
): Promise<MediaStream> {
  // Parar qualquer stream anterior no elemento de vídeo
  stopCamera(videoElement);

  const constraints: MediaStreamConstraints = {
    video: {
      facingMode: facingMode,
      // Solicita resolução em portrait 9:16
      width: { ideal: 1080 },
      height: { ideal: 1920 },
      aspectRatio: { ideal: 9 / 16 },
    },
    audio: false,
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = stream;
    videoElement.setAttribute('playsinline', 'true'); // Essencial para iOS Safari
    videoElement.setAttribute('autoplay', 'true');
    videoElement.muted = true;

    // Iniciar reprodução do vídeo
    await videoElement.play();
    return stream;
  } catch (error) {
    console.error('Erro ao acessar a câmera:', error);
    throw error;
  }
}

export function stopCamera(videoElement: HTMLVideoElement) {
  if (videoElement && videoElement.srcObject) {
    const stream = videoElement.srcObject as MediaStream;
    const tracks = stream.getTracks();
    tracks.forEach((track) => track.stop());
    videoElement.srcObject = null;
  }
}

/**
 * Captura o frame atual do vídeo e desenha no canvas em formato 9:16,
 * fazendo crop centralizado para garantir o enquadramento portrait.
 */
export function captureFrame(videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement) {
  const ctx = canvasElement.getContext('2d');
  if (!ctx) return;

  const videoW = videoElement.videoWidth;
  const videoH = videoElement.videoHeight;

  // Calcula dimensões alvo em 9:16
  const targetRatio = 9 / 16;
  const videoRatio = videoW / videoH;

  let srcX = 0;
  let srcY = 0;
  let srcW = videoW;
  let srcH = videoH;

  if (videoRatio > targetRatio) {
    // Vídeo é mais largo que 9:16 → corta nas laterais
    srcW = Math.round(videoH * targetRatio);
    srcX = Math.round((videoW - srcW) / 2);
  } else if (videoRatio < targetRatio) {
    // Vídeo é mais alto que 9:16 → corta em cima e embaixo
    srcH = Math.round(videoW / targetRatio);
    srcY = Math.round((videoH - srcH) / 2);
  }

  // Define o canvas com proporção 9:16 (ex: 1080×1920)
  const outW = 1080;
  const outH = 1920;

  canvasElement.width = outW;
  canvasElement.height = outH;

  ctx.clearRect(0, 0, outW, outH);
  ctx.drawImage(videoElement, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
}
