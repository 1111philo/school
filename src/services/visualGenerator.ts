import { GoogleGenAI } from '@google/genai';
import type { Lesson } from '../types';

/**
 * Configuration options for image generation
 */
export interface ImageGenerationOptions {
  /** Model to use: 'flash' for speed (1024px) or 'pro' for quality (4K) */
  model?: 'flash' | 'pro';
  /** Aspect ratio for the generated image */
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  /** Enable Google Search grounding for more accurate visuals (Pro only) */
  enableGrounding?: boolean;
}

/**
 * Generate a visual explanation image for a lesson using Gemini Imagen (Nano Banana)
 */
export async function generateLessonVisual(
  lesson: Lesson,
  visualPrompt: string,
  apiKey: string,
  options: ImageGenerationOptions = {}
): Promise<string> {
  const {
    model = 'flash',
    aspectRatio = '16:9',
    enableGrounding = true
  } = options;

  try {
    const genAI = new GoogleGenAI({ apiKey });

    // Select the appropriate model
    const modelName = model === 'pro'
      ? 'gemini-3-pro-image-preview'  // 4K, grounding, thinking process
      : 'gemini-2.5-flash-image';      // Fast, 1024px

    // Enhance the prompt for better educational diagrams
    const enhancedPrompt = `Educational diagram: ${visualPrompt}.
Style: Clean, simple, colorful illustration suitable for learning.
Clear labels, easy to understand, professional educational design.
Make it visually engaging and scientifically accurate.`;

    console.log(`Generating image with ${modelName}:`, enhancedPrompt);

    // Build the request config based on the API structure
    const config: any = {
      model: modelName,
      contents: enhancedPrompt,
    };

    // Add configuration for aspect ratio and response modalities
    if (aspectRatio || model === 'pro') {
      config.config = {
        responseModalities: ['image'],
      };

      if (aspectRatio) {
        config.config.imageGenerationConfig = {
          aspectRatio: aspectRatio
        };
      }
    }

    // Add grounding for Pro model
    if (enableGrounding && model === 'pro') {
      config.tools = [{
        googleSearch: {}
      }];
    }

    // Generate image using Gemini Image model
    const response = await genAI.models.generateContent(config);

    // Extract image from response
    if (response.candidates && response.candidates[0]) {
      const parts = response.candidates[0].content?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.inlineData) {
            // Get the base64 image data
            const imageData = part.inlineData.data;
            const mimeType = part.inlineData.mimeType || 'image/png';

            // Convert to data URL for immediate display
            const dataUrl = `data:${mimeType};base64,${imageData}`;

            console.log(`✅ Image generated successfully for "${lesson.title}" using ${modelName}`);
            return dataUrl;
          }

          // Log any text responses (e.g., thinking process from Pro model)
          if (part.text) {
            console.log('Model reasoning:', part.text);
          }
        }
      }
    }

    console.warn('⚠️ No image in response, using fallback');
    return createFallbackSVG(lesson.title, visualPrompt);
  } catch (error) {
    console.error('❌ Failed to generate image with Gemini API:', error);

    // Log detailed error information
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
    }

    // Fallback to SVG if API fails
    return createFallbackSVG(lesson.title, visualPrompt);
  }
}

/**
 * Generate multiple image variations for a lesson (batch generation)
 */
export async function generateLessonVisualBatch(
  lesson: Lesson,
  visualPrompt: string,
  apiKey: string,
  count: number = 3,
  options: ImageGenerationOptions = {}
): Promise<string[]> {
  try {
    const genAI = new GoogleGenAI({ apiKey });
    const modelName = options.model === 'pro'
      ? 'gemini-3-pro-image-preview'
      : 'gemini-2.5-flash-image';

    const enhancedPrompt = `Educational diagram: ${visualPrompt}.
Style: Clean, simple, colorful illustration suitable for learning.
Clear labels, easy to understand, professional educational design.`;

    console.log(`Generating ${count} image variations with ${modelName}`);

    // Build config for batch generation
    const config: any = {
      model: modelName,
      contents: enhancedPrompt,
      config: {
        responseModalities: ['image'],
        candidateCount: count
      }
    };

    if (options.aspectRatio) {
      config.config.imageGenerationConfig = {
        aspectRatio: options.aspectRatio
      };
    }

    const response = await genAI.models.generateContent(config);

    const images: string[] = [];

    // Extract all generated images
    if (response.candidates) {
      for (const candidate of response.candidates) {
        const parts = candidate.content?.parts;
        if (parts) {
          for (const part of parts) {
            if (part.inlineData) {
              const imageData = part.inlineData.data;
              const mimeType = part.inlineData.mimeType || 'image/png';
              const dataUrl = `data:${mimeType};base64,${imageData}`;
              images.push(dataUrl);
            }
          }
        }
      }
    }

    console.log(`✅ Generated ${images.length} images successfully`);
    return images.length > 0 ? images : [createFallbackSVG(lesson.title, visualPrompt)];
  } catch (error) {
    console.error('❌ Failed to generate batch images:', error);
    return [createFallbackSVG(lesson.title, visualPrompt)];
  }
}

/**
 * Fallback SVG visualization if API fails
 */
function createFallbackSVG(title: string, prompt: string): string {
  const words = prompt.split(' ').slice(0, 30);
  const lines: string[] = [];
  let currentLine = '';

  words.forEach(word => {
    if ((currentLine + word).length > 40) {
      lines.push(currentLine.trim());
      currentLine = word + ' ';
    } else {
      currentLine += word + ' ';
    }
  });
  if (currentLine) lines.push(currentLine.trim());

  const height = 200 + (lines.length * 25);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="${height}" viewBox="0 0 800 ${height}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:rgb(99,102,241);stop-opacity:0.1" />
          <stop offset="100%" style="stop-color:rgb(168,85,247);stop-opacity:0.1" />
        </linearGradient>
      </defs>
      
      <rect width="800" height="${height}" fill="url(#bg)" rx="12"/>
      <rect width="800" height="${height}" fill="none" stroke="rgba(99,102,241,0.3)" stroke-width="2" rx="12"/>
      
      <text x="400" y="40" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="600" fill="#6366f1" text-anchor="middle">
        ${escapeXml(title)}
      </text>
      
      <text x="400" y="80" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#94a3b8" text-anchor="middle">
        Visual Concept
      </text>
      
      ${lines.map((line, i) => `
        <text x="400" y="${120 + (i * 25)}" font-family="system-ui, -apple-system, sans-serif" font-size="16" fill="#334155" text-anchor="middle">
          ${escapeXml(line)}
        </text>
      `).join('')}
      
      <circle cx="100" cy="${height - 50}" r="30" fill="rgba(99,102,241,0.2)"/>
      <circle cx="700" cy="${height - 50}" r="30" fill="rgba(168,85,247,0.2)"/>
      
      <text x="400" y="${height - 20}" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="#94a3b8" text-anchor="middle" font-style="italic">
        Fallback visualization (API unavailable)
      </text>
    </svg>
  `.trim();

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
