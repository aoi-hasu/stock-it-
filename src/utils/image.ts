/**
 * Shrink an uploaded picture in the browser and return it as a small JPEG
 * "data:" text string (about 40-120 KB). Stored inside the product record,
 * so no extra storage setup is needed and it prints on PDFs.
 */
export async function fileToSmallImage(file: File, maxSide = 800, quality = 0.8): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (JPG, PNG or WEBP).');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Image is larger than 8 MB. Please choose a smaller picture.');
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read this image.'));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image processing is not available in this browser.');
    ctx.fillStyle = '#ffffff'; // PNG transparency becomes white
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
