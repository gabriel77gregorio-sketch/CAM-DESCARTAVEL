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
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false, // Sem gravação de áudio
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
 * Captura o frame atual de um elemento de vídeo e desenha em um Canvas
 */
export function captureFrame(videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement) {
  const ctx = canvasElement.getContext('2d');
  if (!ctx) return;

  const width = videoElement.videoWidth;
  const height = videoElement.videoHeight;

  // Configura tamanho do canvas idêntico ao vídeo
  canvasElement.width = width;
  canvasElement.height = height;

  // Limpa canvas
  ctx.clearRect(0, 0, width, height);
  
  // Desenha o frame do vídeo
  ctx.drawImage(videoElement, 0, 0, width, height);
}
