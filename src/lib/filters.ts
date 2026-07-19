/**
 * Filtros de imagem analógicos em HTML5 Canvas
 */

export type FilterPreset = 'none' | 'kodak_gold' | 'fuji_superia' | 'disposable';

export async function applyAnalogFilter(
  canvas: HTMLCanvasElement,
  preset: FilterPreset
): Promise<void> {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  // 1. Obter os dados de pixels para manipulação de cores e ruído (se aplicável)
  if (preset !== 'none') {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Aplicar ajustes de cor e contraste pixel a pixel
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      if (preset === 'kodak_gold') {
        // Kodak Gold: Tons quentes, saturação de amarelos/vermelhos e sombras levemente azuladas
        r = r * 1.1 + 10;
        g = g * 1.05 + 5;
        b = b * 0.9 - 5;
        
        // Contraste sutil
        r = ((r - 128) * 1.05) + 128;
        g = ((g - 128) * 1.05) + 128;
        b = ((b - 128) * 1.02) + 128;
      } else if (preset === 'fuji_superia') {
        // Fuji Superia: Tons levemente frios, destaque para verdes e cianetos
        r = r * 0.95 - 5;
        g = g * 1.1 + 10;
        b = b * 1.05 + 5;
        
        // Contraste sutil
        r = ((r - 128) * 1.02) + 128;
        g = ((g - 128) * 1.08) + 128;
        b = ((b - 128) * 1.04) + 128;
      } else if (preset === 'disposable') {
        // Câmera Descartável Tradicional: Contraste alto, flash estourado (brilho alto)
        r = r * 1.15 + 15;
        g = g * 1.1 + 10;
        b = b * 1.0 - 5;
        
        // Contraste pesado
        r = ((r - 128) * 1.15) + 128;
        g = ((g - 128) * 1.15) + 128;
        b = ((b - 128) * 1.1) + 128;
      }

      // Adicionar grão (ruído) diretamente nas cores
      let grainIntensity = 0;
      if (preset === 'kodak_gold') grainIntensity = 12;
      if (preset === 'fuji_superia') grainIntensity = 10;
      if (preset === 'disposable') grainIntensity = 14;

      if (grainIntensity > 0) {
        const noise = (Math.random() - 0.5) * grainIntensity;
        r += noise;
        g += noise;
        b += noise;
      }

      // Garantir limites entre 0 e 255
      data[i] = Math.min(255, Math.max(0, r));
      data[i + 1] = Math.min(255, Math.max(0, g));
      data[i + 2] = Math.min(255, Math.max(0, b));
    }

    ctx.putImageData(imageData, 0, 0);
  }

  // 2. Aplicar efeitos de vinheta e vazamentos de luz (Light Leaks)
  if (preset === 'disposable') {
    applyLightLeak(ctx, width, height);
    applyVignette(ctx, width, height);
  } else if (preset === 'kodak_gold') {
    // Kodak Gold tem vazamento de luz bem sutil às vezes
    if (Math.random() > 0.5) {
      applyLightLeak(ctx, width, height, 0.5);
    }
  }

  // 3. Adicionar carimbo de data analógico (Estética anos 90/2000)
  if (preset !== 'none') {
    applyDateStamp(ctx, width, height);
  }
}

/**
 * Desenha um vazamento de luz laranja/vermelho translúcido em uma borda aleatória
 */
function applyLightLeak(ctx: CanvasRenderingContext2D, width: number, height: number, opacityMultiplier: number = 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen'; // Efeito de luz sobreposta

  // Escolhe uma borda/canto aleatório
  const positions = ['left', 'right', 'bottom-left'];
  const pos = positions[Math.floor(Math.random() * positions.length)];
  
  let gradient: CanvasGradient;

  if (pos === 'left') {
    gradient = ctx.createLinearGradient(0, 0, width * 0.4, 0);
    gradient.addColorStop(0, `rgba(251, 146, 60, ${0.75 * opacityMultiplier})`); // Laranja brilhante
    gradient.addColorStop(0.5, `rgba(239, 68, 68, ${0.45 * opacityMultiplier})`); // Vermelho
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  } else if (pos === 'right') {
    gradient = ctx.createLinearGradient(width, 0, width * 0.6, 0);
    gradient.addColorStop(0, `rgba(251, 146, 60, ${0.75 * opacityMultiplier})`);
    gradient.addColorStop(0.5, `rgba(236, 72, 153, ${0.45 * opacityMultiplier})`); // Rosa
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  } else {
    gradient = ctx.createRadialGradient(0, height, 0, 0, height, width * 0.5);
    gradient.addColorStop(0, `rgba(253, 186, 116, ${0.85 * opacityMultiplier})`);
    gradient.addColorStop(0.5, `rgba(249, 115, 22, ${0.5 * opacityMultiplier})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/**
 * Cria um efeito de vinheta escura nas bordas da imagem
 */
function applyVignette(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply'; // Escurece as cores

  const gradient = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.4,
    width / 2, height / 2, Math.max(width, height) * 0.7
  );

  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)'); // Sem escurecimento no centro
  gradient.addColorStop(0.8, 'rgba(150, 150, 150, 0.7)'); // Início da vinheta
  gradient.addColorStop(1, 'rgba(40, 40, 40, 0.95)'); // Bordas escuras

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/**
 * Adiciona um carimbo de data no formato digital vintage (laranja/vermelho) no canto inferior direito
 */
function applyDateStamp(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.save();
  
  // Configurar texto
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear()).substring(2);
  
  // Data formatada como: DD MM 'YY
  const dateText = `${day} ${month} '${year}`;
  
  // O tamanho da fonte é proporcional ao tamanho da imagem (evita ficar gigante ou minúsculo)
  const fontSize = Math.max(20, Math.round(width * 0.035));
  ctx.font = `bold ${fontSize}px 'Share Tech Mono', 'Courier New', Courier, monospace`;
  
  // Posicionamento no canto inferior direito
  const margin = Math.round(width * 0.04);
  const textWidth = ctx.measureText(dateText).width;
  const x = width - textWidth - margin;
  const y = height - margin;

  // Efeito de brilho de LED (glow)
  ctx.shadowColor = 'rgba(249, 115, 22, 0.8)';
  ctx.shadowBlur = fontSize * 0.3;
  ctx.fillStyle = '#ff6b00'; // Laranja neon

  ctx.fillText(dateText, x, y);
  ctx.restore();
}
