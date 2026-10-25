import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

async function recognizeCanvas(worker, canvas) {
  const {data} = await worker.recognize(canvas);
  return data.text;
}

export async function readSupplierLedgerDocument(file) {
  const {createWorker} = await import('tesseract.js');
  let worker;
  const getWorker = async () => {
    if (!worker) worker = await createWorker('eng');
    return worker;
  };

  try {
    if (file.type === 'application/pdf') {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const pdf = await pdfjs.getDocument({data: new Uint8Array(await file.arrayBuffer())}).promise;
      try {
        const text = [];
        for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 5); pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          const pageText = content.items.map(item => item.str || '').join(' ').trim();
          if (pageText.length > 40) {
            text.push(pageText);
            continue;
          }

          const pageSize = page.getViewport({scale: 1});
          const scale = Math.min(1.5, 3000 / Math.max(pageSize.width, pageSize.height));
          const viewport = page.getViewport({scale});
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          try {
            const canvasContext = canvas.getContext('2d');
            if (!canvasContext) throw new Error('Could not prepare the PDF page for reading.');
            await page.render({canvasContext, viewport}).promise;
            text.push(await recognizeCanvas(await getWorker(), canvas));
          } finally {
            canvas.width = 0;
            canvas.height = 0;
          }
        }
        return text.join('\n');
      } finally {
        await pdf.destroy();
      }
    }

    if (!['image/jpeg', 'image/png', 'image/webp', 'image/bmp'].includes(file.type))
      throw new Error('Choose a JPG, PNG, WebP, BMP, or PDF file.');
    const imageUrl = URL.createObjectURL(file);
    try {
      const {data} = await (await getWorker()).recognize(imageUrl);
      return data.text;
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  } finally {
    if (worker) await worker.terminate();
  }
}
