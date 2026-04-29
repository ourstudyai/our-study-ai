// Material quality scoring — used to prioritise admin review queue

export type QualityScore = {
  score: number; // 0-100
  label: 'excellent' | 'good' | 'fair' | 'poor';
  reasons: string[];
};

export function scoreMaterial(material: {
  wordCount?: number;
  pageCount?: number;
  confidence?: string;
  extractionMethod?: string;
  isScanned?: boolean;
  category?: string;
}): QualityScore {
  let score = 50;
  const reasons: string[] = [];

  // Word count
  if ((material.wordCount ?? 0) > 500) { score += 15; }
  else if ((material.wordCount ?? 0) > 100) { score += 5; }
  else { score -= 15; reasons.push('Very short text'); }

  // Extraction method
  if (material.extractionMethod === 'mammoth') { score += 10; }
  else if (material.extractionMethod === 'mistral-ocr') { score += 5; }
  else if (material.extractionMethod === 'ocr_pending') { score -= 20; reasons.push('OCR pending'); }

  // Classifier confidence — only penalise if OCR also failed
  if (material.confidence === 'high') { score += 15; }
  else if (material.confidence === 'medium') { score += 5; }
  else if (material.extractionMethod !== 'ocr_pending') {
    score -= 5; reasons.push('Course not detected');
  } else { score -= 15; reasons.push('Low confidence + OCR pending'); }

  // Scanned
  if (material.isScanned) { score -= 5; reasons.push('Scanned document'); }

  score = Math.max(0, Math.min(100, score));

  const label = score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor';
  return { score, label, reasons };
}

export const QUALITY_COLOR: Record<string, string> = {
  excellent: '#22c55e',
  good: '#84cc16',
  fair: '#eab308',
  poor: '#ef4444',
};
